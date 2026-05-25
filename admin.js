(function () {
  const defaults = window.CARD_DATA || {};
  const SESSION_KEY = "person_web_admin_authed";
  const PWD_KEY = "person_web_admin_pwd";

  function getAdminUrl() {
    const fromFile = window.CARD_CLOUD || {};
    const fromData = defaults.cloudSync || {};
    const saveUrl = (fromFile.saveFunctionUrl || fromData.saveFunctionUrl || "").trim();
    if (!saveUrl) return "";
    return saveUrl.replace(/\/save-card\/?$/, "/admin-cards");
  }

  function getHeaders() {
    const fromFile = window.CARD_CLOUD || {};
    const fromData = defaults.cloudSync || {};
    const key = (fromFile.supabaseAnonKey || fromData.supabaseAnonKey || "").trim();
    const headers = { "Content-Type": "application/json" };
    if (key) {
      headers.apikey = key;
      if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
    }
    return headers;
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 2600);
  }

  async function callAdmin(action, extra) {
    const url = getAdminUrl();
    if (!url) throw new Error("未配置 admin-cards 函数地址，请先部署 Edge Function");

    const password = sessionStorage.getItem(PWD_KEY) || "";
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(Object.assign({ action: action, adminPassword: password }, extra || {})),
    });

    let body = {};
    try {
      body = await res.json();
    } catch (e) {
      body = {};
    }

    if (res.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(PWD_KEY);
      showLogin();
      throw new Error("管理员密码错误或已过期");
    }
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("admin-cards 函数未部署，请运行 supabase functions deploy admin-cards");
      }
      throw new Error(body.error || "请求失败 (" + res.status + ")");
    }
    return body;
  }

  function showLogin() {
    document.getElementById("adminLogin").hidden = false;
    document.getElementById("adminPanel").hidden = true;
  }

  function showPanel() {
    document.getElementById("adminLogin").hidden = true;
    document.getElementById("adminPanel").hidden = false;
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("zh-CN");
    } catch (e) {
      return iso;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStats(stats) {
    const el = document.getElementById("adminStats");
    if (!el || !stats) return;
    const items = [
      { label: "名片总数", value: stats.total },
      { label: "用户名片", value: stats.userCards },
      { label: "从未保存", value: stats.neverSaved },
      { label: "今日新建", value: stats.createdToday },
    ];
    el.innerHTML = items
      .map(function (item) {
        return (
          '<div class="admin-stat">' +
          '<div class="admin-stat-label">' +
          escapeHtml(item.label) +
          "</div>" +
          '<div class="admin-stat-value">' +
          escapeHtml(String(item.value)) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderTable(cards) {
    const tbody = document.getElementById("adminTableBody");
    const statusEl = document.getElementById("adminStatus");
    if (!tbody) return;

    if (!cards || !cards.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">暂无数据</td></tr>';
      if (statusEl) statusEl.textContent = "";
      return;
    }

    tbody.innerHTML = cards
      .map(function (card) {
        const badge =
          card.saveCount > 0
            ? '<span class="admin-badge admin-badge--ok">已保存</span>'
            : '<span class="admin-badge admin-badge--warn">未保存</span>';
        const deleteBtn = card.isDefault
          ? "—"
          : '<button type="button" class="btn-ghost btn-sm" data-delete-slug="' +
            escapeHtml(card.slug) +
            '">删除</button>';
        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(card.slug) +
          "</strong> " +
          badge +
          "</td>" +
          "<td>" +
          escapeHtml(String(card.saveCount)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatTime(card.createdAt)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatTime(card.updatedAt)) +
          "</td>" +
          "<td>" +
          deleteBtn +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    if (statusEl) statusEl.textContent = "共 " + cards.length + " 条记录（最多显示 500 条）";
  }

  async function loadDashboard() {
    const statsBody = await callAdmin("stats");
    renderStats(statsBody.stats);
    const listBody = await callAdmin("list", { limit: 500 });
    renderTable(listBody.cards);
  }

  document.getElementById("adminLoginForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const pwd = ev.target.password.value;
    sessionStorage.setItem(PWD_KEY, pwd);
    try {
      await callAdmin("stats");
      sessionStorage.setItem(SESSION_KEY, "1");
      showPanel();
      await loadDashboard();
      showToast("登录成功");
    } catch (err) {
      sessionStorage.removeItem(PWD_KEY);
      showToast(err.message || "登录失败");
    }
  });

  document.getElementById("adminLogoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(PWD_KEY);
    showLogin();
  });

  document.getElementById("adminRefreshBtn").addEventListener("click", function () {
    loadDashboard()
      .then(function () {
        showToast("已刷新");
      })
      .catch(function (err) {
        showToast(err.message || "刷新失败");
      });
  });

  document.getElementById("adminCleanupBtn").addEventListener("click", function () {
    if (!confirm("确定删除 7 天前创建、且从未保存过的用户名片？此操作不可恢复。")) return;
    callAdmin("cleanup", { days: 7 })
      .then(function (body) {
        showToast("已清理 " + (body.deleted || 0) + " 张空白名片");
        return loadDashboard();
      })
      .catch(function (err) {
        showToast(err.message || "清理失败");
      });
  });

  document.getElementById("adminTableBody").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-delete-slug]");
    if (!btn) return;
    const slug = btn.getAttribute("data-delete-slug");
    if (!slug || !confirm("确定删除名片「" + slug + "」？此操作不可恢复。")) return;
    callAdmin("delete", { slug: slug })
      .then(function () {
        showToast("已删除 " + slug);
        return loadDashboard();
      })
      .catch(function (err) {
        showToast(err.message || "删除失败");
      });
  });

  if (sessionStorage.getItem(SESSION_KEY) === "1" && sessionStorage.getItem(PWD_KEY)) {
    showPanel();
    loadDashboard().catch(function (err) {
      showToast(err.message || "加载失败");
      showLogin();
    });
  } else {
    showLogin();
  }

  const adminUrlEl = document.getElementById("adminPageUrl");
  if (adminUrlEl) {
    const url = (defaults.siteUrl || "").trim() || (location.origin + location.pathname.replace(/\/admin\.html.*$/, "/"));
    adminUrlEl.textContent = url.replace(/\/$/, "") + "/admin.html";
  }
})();
