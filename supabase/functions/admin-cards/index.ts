import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function verifyAdminPassword(password: string) {
  const adminPassword = Deno.env.get("CARD_ADMIN_PASSWORD") || Deno.env.get("CARD_EDIT_PASSWORD") || "";
  return adminPassword && password === adminPassword;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "stats");
    const adminPassword = String(body.adminPassword || "");

    if (!verifyAdminPassword(adminPassword)) {
      return jsonResponse({ error: "管理员密码错误" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "stats") {
      const { count: total } = await supabase
        .from("user_cards")
        .select("*", { count: "exact", head: true });

      const { count: userCards } = await supabase
        .from("user_cards")
        .select("*", { count: "exact", head: true })
        .neq("slug", "default");

      const { count: neverSaved } = await supabase
        .from("user_cards")
        .select("*", { count: "exact", head: true })
        .neq("slug", "default")
        .eq("save_count", 0);

      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count: createdToday } = await supabase
        .from("user_cards")
        .select("*", { count: "exact", head: true })
        .gte("created_at", dayAgo)
        .neq("slug", "default");

      const { data: viewRows } = await supabase.from("user_cards").select("view_count");
      const totalViews = (viewRows || []).reduce((sum, row) => sum + (row.view_count || 0), 0);

      return jsonResponse({
        ok: true,
        stats: {
          total: total || 0,
          userCards: userCards || 0,
          neverSaved: neverSaved || 0,
          createdToday: createdToday || 0,
          totalViews: totalViews,
        },
      });
    }

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
      const { data, error } = await supabase
        .from("user_cards")
        .select("slug, status, save_count, view_count, edit_password, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const cards = (data || []).map((row) => ({
        slug: row.slug,
        status: row.status,
        saveCount: row.save_count,
        viewCount: row.view_count || 0,
        editPassword: row.edit_password || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDefault: row.slug === "default",
      }));

      return jsonResponse({ ok: true, cards });
    }

    if (action === "delete") {
      const slug = String(body.slug || "").trim().toLowerCase();
      if (!slug || slug === "default") {
        return jsonResponse({ error: "不能删除 default 名片" }, 400);
      }

      const { error } = await supabase.from("user_cards").delete().eq("slug", slug);
      if (error) throw error;
      return jsonResponse({ ok: true, deleted: slug });
    }

    if (action === "cleanup") {
      const days = Math.max(Number(body.days) || 7, 1);
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      const { data: targets, error: findError } = await supabase
        .from("user_cards")
        .select("slug")
        .neq("slug", "default")
        .eq("save_count", 0)
        .lt("created_at", cutoff);

      if (findError) throw findError;

      const slugs = (targets || []).map((t) => t.slug);
      if (!slugs.length) {
        return jsonResponse({ ok: true, deleted: 0, slugs: [] });
      }

      const { error } = await supabase.from("user_cards").delete().in("slug", slugs);
      if (error) throw error;

      return jsonResponse({ ok: true, deleted: slugs.length, slugs });
    }

    return jsonResponse({ error: "未知操作" }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
