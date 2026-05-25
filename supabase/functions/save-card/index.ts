import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;
const HOURLY_CREATE_LIMIT = 5;
const DAILY_CREATE_LIMIT = 20;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

function generateSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

async function slugExists(supabase: ReturnType<typeof createClient>, slug: string) {
  const { data } = await supabase.from("user_cards").select("slug").eq("slug", slug).maybeSingle();
  return !!data;
}

async function verifyPassword(
  supabase: ReturnType<typeof createClient>,
  slug: string,
  password: string,
  legacyPassword: string
) {
  const { data: row } = await supabase
    .from("user_cards")
    .select("edit_password")
    .eq("slug", slug)
    .maybeSingle();

  if (row) {
    return row.edit_password === password;
  }

  if (slug === "default" && legacyPassword && password === legacyPassword) {
    return true;
  }

  return false;
}

async function checkCreateRateLimit(supabase: ReturnType<typeof createClient>, ip: string) {
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  const { count: hourCount } = await supabase
    .from("card_create_log")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", hourAgo);

  if ((hourCount || 0) >= HOURLY_CREATE_LIMIT) {
    return { ok: false, error: "创建过于频繁，请 1 小时后再试" };
  }

  const { count: dayCount } = await supabase
    .from("card_create_log")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", dayAgo);

  if ((dayCount || 0) >= DAILY_CREATE_LIMIT) {
    return { ok: false, error: "今日创建次数已达上限，请明天再试" };
  }

  return { ok: true };
}

async function logCreateAttempt(supabase: ReturnType<typeof createClient>, ip: string) {
  await supabase.from("card_create_log").insert({ ip });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "save");
    const slugRaw = String(body.slug || "default").trim().toLowerCase();
    const password = String(body.password || "");
    const legacyPassword = Deno.env.get("CARD_EDIT_PASSWORD") || "";
    const clientIp = getClientIp(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "check-slug") {
      const slug = String(body.slug || "").trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        return jsonResponse({ available: false, error: "无效的名片 ID" }, 400);
      }
      if (slug === "default") {
        return jsonResponse({ available: false });
      }
      const exists = await slugExists(supabase, slug);
      return jsonResponse({ available: !exists });
    }

    if (!SLUG_RE.test(slugRaw) && action !== "create") {
      return jsonResponse({ error: "无效的名片 ID" }, 400);
    }

    if (action === "create") {
      if (!password || password.length < 4) {
        return jsonResponse({ error: "密码至少 4 位" }, 400);
      }

      const rate = await checkCreateRateLimit(supabase, clientIp);
      if (!rate.ok) {
        return jsonResponse({ error: rate.error }, 429);
      }

      let newSlug = String(body.requestedSlug || body.slug || "").trim().toLowerCase();
      if (newSlug) {
        if (!SLUG_RE.test(newSlug)) {
          return jsonResponse({ error: "名片 ID 仅支持小写字母、数字和连字符，3–32 位" }, 400);
        }
        if (newSlug === "default") {
          return jsonResponse({ error: "该名片 ID 不可使用" }, 400);
        }
        if (await slugExists(supabase, newSlug)) {
          return jsonResponse({ error: "该名片 ID 已被使用，请换一个" }, 409);
        }
      } else {
        let tries = 0;
        do {
          newSlug = generateSlug();
          tries += 1;
        } while ((await slugExists(supabase, newSlug)) && tries < 12);
        if (await slugExists(supabase, newSlug)) {
          return jsonResponse({ error: "生成名片 ID 失败，请重试" }, 500);
        }
      }

      const initialContent = body.data && typeof body.data === "object" ? body.data : {};
      const { error } = await supabase.from("user_cards").insert({
        slug: newSlug,
        content: initialContent,
        edit_password: password,
        status: "active",
        save_count: 0,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      await logCreateAttempt(supabase, clientIp);
      return jsonResponse({ ok: true, slug: newSlug });
    }

    if (action === "verify") {
      const ok = await verifyPassword(supabase, slugRaw, password, legacyPassword);
      if (!ok) {
        return jsonResponse({ error: "密码错误" }, 401);
      }
      return jsonResponse({ ok: true });
    }

  // save
    const data = body.data;
    if (!data || typeof data !== "object") {
      return jsonResponse({ error: "缺少名片数据" }, 400);
    }

    const ok = await verifyPassword(supabase, slugRaw, password, legacyPassword);
    if (!ok) {
      return jsonResponse({ error: "密码错误" }, 401);
    }

    const { data: existing } = await supabase
      .from("user_cards")
      .select("slug, save_count")
      .eq("slug", slugRaw)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_cards")
        .update({
          content: data,
          edit_password: password,
          status: "active",
          save_count: (existing.save_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slugRaw);
      if (error) throw error;
    } else if (slugRaw === "default") {
      const { error } = await supabase.from("user_cards").insert({
        slug: "default",
        content: data,
        edit_password: password,
        status: "active",
        save_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      await supabase.from("card_data").upsert({
        id: 1,
        content: data,
        updated_at: new Date().toISOString(),
      });
    } else {
      const rate = await checkCreateRateLimit(supabase, clientIp);
      if (!rate.ok) {
        return jsonResponse({ error: rate.error }, 429);
      }

      const { error } = await supabase.from("user_cards").insert({
        slug: slugRaw,
        content: data,
        edit_password: password,
        status: "active",
        save_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await logCreateAttempt(supabase, clientIp);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
