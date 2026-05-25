(function () {
  const defaults = window.CARD_DATA;
  if (!defaults) return;

  const DEFAULT_SLUG = String(defaults.defaultCardSlug || "default").trim().toLowerCase() || "default";
  const LEGACY_EDIT_PASSWORD = String(defaults.editPassword || "763560");

  let currentSlug = DEFAULT_SLUG;
  let sessionEditPassword = "";

  function storageKey() {
    return "person_web_card_" + currentSlug;
  }

  function authSessionKey() {
    return "person_web_edit_authed_" + currentSlug;
  }

  function authPasswordKey() {
    return "person_web_edit_pwd_" + currentSlug;
  }

  function getCardSlugFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get("card") || DEFAULT_SLUG).trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9-]{2,31}$/.test(raw)) return raw;
    return DEFAULT_SLUG;
  }

  function getBaseSiteUrl() {
    const custom = (defaults.siteUrl || "").trim();
    if (custom) return custom.split("?")[0].replace(/\/$/, "") + "/";
    const path = window.location.pathname.replace(/\/[^/]*$/, "/");
    return window.location.origin + path;
  }

  function buildCardUrl(slug) {
    const base = getBaseSiteUrl();
    if (!slug || slug === DEFAULT_SLUG) return base;
    return base + "?card=" + encodeURIComponent(slug);
  }

  const MY_CARDS_KEY = "person_web_my_cards";

  function pendingCloudKey(slug) {
    return "person_web_pending_cloud_" + (slug || currentSlug);
  }

  function generateLocalSlug() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 8; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  function needsCloudCreate(slug) {
    return localStorage.getItem(pendingCloudKey(slug || currentSlug)) === "1";
  }

  function markPendingCloudCreate(slug) {
    localStorage.setItem(pendingCloudKey(slug), "1");
  }

  function clearPendingCloudCreate(slug) {
    localStorage.removeItem(pendingCloudKey(slug || currentSlug));
  }

  function readMyCards() {
    try {
      const raw = localStorage.getItem(MY_CARDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function registerMyCard(slug, url) {
    const list = readMyCards().filter(function (c) {
      return c.slug !== slug;
    });
    list.unshift({ slug: slug, url: url, createdAt: Date.now() });
    try {
      localStorage.setItem(MY_CARDS_KEY, JSON.stringify(list.slice(0, 30)));
    } catch (e) {
      console.warn("保存我的名片列表失败", e);
    }
  }

  let pendingSuccessSlug = "";

  let data = null;

  function getCloudSync() {
    const fromFile = window.CARD_CLOUD || {};
    const fromData = defaults.cloudSync || {};
    let baseUrl = (fromFile.supabaseUrl || fromData.supabaseUrl || "").trim();
    baseUrl = baseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    return {
      supabaseUrl: baseUrl,
      supabaseAnonKey: (fromFile.supabaseAnonKey || fromData.supabaseAnonKey || "").trim(),
      saveFunctionUrl: (fromFile.saveFunctionUrl || fromData.saveFunctionUrl || "").trim(),
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function pickNewerData(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ta = a.updatedAt || 0;
    const tb = b.updatedAt || 0;
    return ta >= tb ? a : b;
  }

  async function fetchRemoteCardData(slug) {
    const cfg = getCloudSync();
    const url = (cfg.supabaseUrl || "").trim();
    const key = (cfg.supabaseAnonKey || "").trim();

    if (url && key) {
      try {
        const api =
          url.replace(/\/$/, "") +
          "/rest/v1/cards_public?slug=eq." +
          encodeURIComponent(slug) +
          "&select=content,updated_at";
        const res = await fetch(api, {
          cache: "no-store",
          headers: {
            apikey: key,
            Authorization: "Bearer " + key,
          },
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows[0] && rows[0].content && Object.keys(rows[0].content).length) {
            const content = rows[0].content;
            if (rows[0].updated_at) {
              content.updatedAt = new Date(rows[0].updated_at).getTime();
            }
            return content;
          }
        }
      } catch (e) {
        console.warn("读取 cards_public 失败", e);
      }

      if (slug === DEFAULT_SLUG) {
        try {
          const legacyApi =
            url.replace(/\/$/, "") + "/rest/v1/card_data?id=eq.1&select=content,updated_at";
          const res = await fetch(legacyApi, {
            cache: "no-store",
            headers: {
              apikey: key,
              Authorization: "Bearer " + key,
            },
          });
          if (res.ok) {
            const rows = await res.json();
            if (rows[0] && rows[0].content && Object.keys(rows[0].content).length) {
              const content = rows[0].content;
              if (rows[0].updated_at) {
                content.updatedAt = new Date(rows[0].updated_at).getTime();
              }
              return content;
            }
          }
        } catch (e) {
          console.warn("读取 legacy card_data 失败", e);
        }
      }
    }

    if (slug === DEFAULT_SLUG) {
      try {
        const res = await fetch("./card-data.json?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn("读取 card-data.json 失败", e);
      }
    }

    return null;
  }

  function readLocalCardData() {
    try {
      const saved = localStorage.getItem(storageKey());
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("读取本地数据失败", e);
    }
    return null;
  }

  async function loadData(slug) {
    currentSlug = slug || getCardSlugFromUrl();
    sessionEditPassword = sessionStorage.getItem(authPasswordKey()) || "";
    const remote = await fetchRemoteCardData(currentSlug);
    const local = readLocalCardData();
    const picked = pickNewerData(remote, local);
    if (picked) return mergeWithDefaults(picked);
    if (currentSlug !== DEFAULT_SLUG) {
      const blank = mergeWithDefaults(clone(defaults));
      if (blank.basicInfo && blank.basicInfo[0]) blank.basicInfo[0].value = "我的姓名";
      if (blank.basicInfo && blank.basicInfo[1]) blank.basicInfo[1].value = "我的职位";
      return blank;
    }
    return mergeWithDefaults(clone(defaults));
  }

  function dataForCloud() {
    return {
      updatedAt: data.updatedAt || Date.now(),
      basicInfo: data.basicInfo,
      avatar: data.avatar,
      cardSections: data.cardSections,
      quickContact: data.quickContact,
    };
  }

  async function callCardApi(payload) {
    const cfg = getCloudSync();
    const saveUrl = cfg.saveFunctionUrl;
    if (!saveUrl) {
      return { ok: false, reason: "no-config" };
    }

    const headers = { "Content-Type": "application/json" };
    if (cfg.supabaseAnonKey) {
      headers.apikey = cfg.supabaseAnonKey;
      if (cfg.supabaseAnonKey.startsWith("eyJ")) {
        headers.Authorization = "Bearer " + cfg.supabaseAnonKey;
      }
    }

    const res = await fetch(saveUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    let body = {};
    try {
      body = await res.json();
    } catch (e) {
      body = {};
    }

    return { ok: res.ok, status: res.status, body: body };
  }

  function getEditPasswordForSync() {
    if (sessionEditPassword) return sessionEditPassword;
    return LEGACY_EDIT_PASSWORD;
  }

  async function verifyEditPassword(password) {
    if (needsCloudCreate(currentSlug)) {
      const stored = sessionStorage.getItem(authPasswordKey()) || sessionEditPassword;
      return password === stored;
    }
    if (currentSlug === DEFAULT_SLUG && password === LEGACY_EDIT_PASSWORD) {
      return true;
    }
    const result = await callCardApi({
      action: "verify",
      slug: currentSlug,
      password: password,
    });
    return result.ok && result.body && result.body.ok;
  }

  async function syncToCloud() {
    const password = getEditPasswordForSync();
    if (!password) {
      return { ok: false, reason: "no-password" };
    }

    const result = await callCardApi({
      action: "save",
      slug: currentSlug,
      password: password,
      data: dataForCloud(),
    });

    if (result.status === 401) {
      throw new Error("密码错误，请重新验证后再保存");
    }
    if (result.status === 429) {
      throw new Error(result.body.error || "操作过于频繁，请稍后再试");
    }
    if (!result.ok) {
      throw new Error("云端同步失败：" + (result.body.error || result.status));
    }

    if (needsCloudCreate(currentSlug)) {
      clearPendingCloudCreate(currentSlug);
      registerMyCard(currentSlug, buildCardUrl(currentSlug));
    }

    return { ok: true };
  }

  async function checkSlugAvailable(slug) {
    const result = await callCardApi({ action: "check-slug", slug: slug });
    if (!result.ok) {
      throw new Error(result.body.error || "检查名片 ID 失败");
    }
    return result.body.available === true;
  }

  function buildBlankCardData() {
    const blank = mergeWithDefaults(clone(defaults));
    blank.updatedAt = Date.now();
    if (blank.basicInfo && blank.basicInfo[0]) blank.basicInfo[0].value = "我的姓名";
    if (blank.basicInfo && blank.basicInfo[1]) blank.basicInfo[1].value = "我的职位";
    return blank;
  }

  function mergeQuickContact(qc) {
    const base = defaults.quickContact || { phone: "", wechatId: "", wechatQr: "", wechatTip: "" };
    const src = qc && typeof qc === "object" ? qc : {};
    return {
      phone: src.phone ?? base.phone ?? "",
      wechatId: src.wechatId ?? base.wechatId ?? "",
      wechatQr: src.wechatQr ?? base.wechatQr ?? "",
      wechatTip: src.wechatTip ?? base.wechatTip ?? "",
    };
  }

  function mergeBasicInfo(parsed) {
    if (Array.isArray(parsed.basicInfo) && parsed.basicInfo.length) {
      return parsed.basicInfo.map(function (item) {
        return {
          label: item.label ?? "",
          value: item.value ?? "",
        };
      });
    }
    const d = defaults.basicInfo;
    if (Array.isArray(d) && d.length) {
      return clone(d);
    }
    return [
      { label: "姓名", value: parsed.name ?? defaults.name ?? "" },
      { label: "职位", value: parsed.title ?? defaults.title ?? "" },
      { label: "一句话介绍", value: parsed.tagline ?? defaults.tagline ?? "" },
    ];
  }

  function getBasicValue(basicInfo, label, index) {
    const found = basicInfo.find(function (f) {
      return f.label === label;
    });
    if (found && found.value) return found.value;
    if (basicInfo[index] && basicInfo[index].value) return basicInfo[index].value;
    return "";
  }

  function mergeWithDefaults(parsed) {
    const basicInfo = mergeBasicInfo(parsed);
    const CS = window.CardSections;
    return {
      updatedAt: parsed.updatedAt || 0,
      basicInfo: basicInfo,
      avatar: parsed.avatar ?? defaults.avatar,
      cardSections: CS ? CS.mergeCardSections(parsed, defaults) : [],
      quickContact: mergeQuickContact(parsed.quickContact),
    };
  }

  function phoneToTel(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? "tel:" + digits : "";
  }

  function persistData() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(data));
    } catch (e) {
      console.error(e);
      showToast("保存失败：图片过大，请换较小的图片");
      throw e;
    }
  }

  const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/avataaars/svg?seed=profile";
  const MAX_IMAGE_BYTES = 800 * 1024;
  const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
  const PORTFOLIO_MEDIA_ACCEPT =
    "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime,.mov";

  function getSiteUrl() {
    return buildCardUrl(currentSlug);
  }

  function isAnyModalOpen() {
    return [
      "shareModal",
      "contactModal",
      "authModal",
      "editModal",
      "createModal",
      "createSuccessModal",
      "recoverModal",
    ].some(function (id) {
      const m = document.getElementById(id);
      return m && !m.hidden;
    });
  }

  function refreshBodyModalLock() {
    document.body.classList.toggle("modal-open", isAnyModalOpen());
  }

  function buildQrImageUrl(url) {
    return (
      "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=" +
      encodeURIComponent(url)
    );
  }

  function renderSiteQrs() {
    const url = getSiteUrl();
    const qrSrc = buildQrImageUrl(url);
    const pageQr = document.getElementById("pageSiteQr");
    const modalQr = document.getElementById("siteQrImg");
    const pageUrlEl = document.getElementById("pageSiteQrUrl");
    const shareUrlEl = document.getElementById("shareUrlText");

    if (pageQr) pageQr.src = qrSrc;
    if (modalQr) modalQr.src = qrSrc;
    if (pageUrlEl) pageUrlEl.textContent = url;
    if (shareUrlEl) shareUrlEl.textContent = url;
  }

  function compressImageFile(file, maxWidth, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("invalid type"));
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        reject(new Error("too large"));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          let result = canvas.toDataURL("image/jpeg", quality);
          if (result.length > MAX_IMAGE_BYTES && quality > 0.5) {
            result = canvas.toDataURL("image/jpeg", quality - 0.15);
          }
          resolve(result);
        };
        img.onerror = function () {
          reject(new Error("load failed"));
        };
        img.src = reader.result;
      };
      reader.onerror = function () {
        reject(new Error("read failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  function setImagePreview(wrapId, imgId, src) {
    const wrap = document.getElementById(wrapId);
    const img = document.getElementById(imgId);
    const empty = wrap.querySelector(".image-preview-empty");
    if (src) {
      img.src = src;
      img.hidden = false;
      empty.hidden = true;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      empty.hidden = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2800);
  }

  function renderCard() {
    const basicInfo = data.basicInfo || [];
    document.getElementById("basicInfoDisplay").innerHTML = basicInfo
      .map(function (item, i) {
        const val = escapeHtml(item.value || "—");
        if (i === 0) return '<h2 class="name">' + val + "</h2>";
        if (i === 1) return '<p class="title">' + val + "</p>";
        if (i === 2) return '<p class="tagline">' + val + "</p>";
        return (
          '<p class="basic-extra"><span class="basic-label">' +
          escapeHtml(item.label || "信息") +
          "</span> " +
          val +
          "</p>"
        );
      })
      .join("");

    const avatar = document.getElementById("avatar");
    avatar.src = data.avatar || FALLBACK_AVATAR;
    avatar.alt = getBasicValue(basicInfo, "姓名", 0) + " 头像";

    if (window.CardSections) {
      window.CardSections.renderCardSections(
        document.getElementById("cardSectionsDisplay"),
        data.cardSections || [],
        { escapeHtml: escapeHtml, escapeAttr: escapeAttr }
      );
    }

    document.title = (getBasicValue(basicInfo, "姓名", 0) || "个人") + " · 个人名片";
  }


  /* —— 扫码访问弹窗 —— */

  const shareModal = document.getElementById("shareModal");

  function openShareModal() {
    renderSiteQrs();
    document.getElementById("shareUrlText").textContent = getSiteUrl();
    shareModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeShareModal() {
    shareModal.hidden = true;
    refreshBodyModalLock();
  }

  document.getElementById("shareBtn").addEventListener("click", openShareModal);
  document.getElementById("shareBtnFooter").addEventListener("click", openShareModal);

  document.getElementById("copyShareUrlBtn").addEventListener("click", function () {
    copyText(getSiteUrl(), "网页链接已复制").catch(function () {});
  });

  shareModal.querySelectorAll("[data-close-share]").forEach(function (el) {
    el.addEventListener("click", closeShareModal);
  });

  /* —— 获取联系方式弹窗 —— */

  const contactModal = document.getElementById("contactModal");

  function renderContactModal() {
    const qc = data.quickContact || mergeQuickContact(null);
    const phone = qc.phone || "—";
    const tel = phoneToTel(qc.phone);

    document.getElementById("contactPhoneDisplay").textContent = phone;

    const callBtn = document.getElementById("contactPhoneCall");
    if (tel) {
      callBtn.href = tel;
      callBtn.hidden = false;
    } else {
      callBtn.hidden = true;
    }

    const qrImg = document.getElementById("contactQrImg");
    const qrEmpty = document.getElementById("contactQrEmpty");
    if (qc.wechatQr) {
      qrImg.src = qc.wechatQr;
      qrImg.hidden = false;
      qrEmpty.hidden = true;
    } else {
      qrImg.removeAttribute("src");
      qrImg.hidden = true;
      qrEmpty.hidden = false;
    }

    const tipEl = document.getElementById("contactWechatTip");
    tipEl.textContent = qc.wechatTip || "";
    tipEl.hidden = !qc.wechatTip;

    const wechatBlock = document.getElementById("contactWechatBlock");
    const wechatId = (qc.wechatId || "").trim();
    document.getElementById("contactWechatIdDisplay").textContent = wechatId || "—";
    wechatBlock.hidden = !wechatId;

    const saveQrBtn = document.getElementById("saveWechatQrBtn");
    saveQrBtn.hidden = !qc.wechatQr;
  }

  function saveWechatQrImage() {
    const qr = data.quickContact && data.quickContact.wechatQr;
    if (!qr) {
      showToast("暂无微信二维码，请管理员上传");
      return;
    }
    const a = document.createElement("a");
    a.href = qr;
    a.download = "微信二维码.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("二维码已保存，打开微信扫一扫 → 相册选择");
  }

  function copyText(text, successMsg) {
    if (!text) return Promise.reject(new Error("empty"));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        showToast(successMsg);
      });
    }
    return new Promise(function (resolve, reject) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast(successMsg);
        resolve();
      } catch (e) {
        showToast("复制失败，请手动复制");
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }

  function openContactModal() {
    renderContactModal();
    contactModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeContactModal() {
    contactModal.hidden = true;
    refreshBodyModalLock();
  }

  document.getElementById("contactBtn").addEventListener("click", openContactModal);

  document.getElementById("copyPhoneBtn").addEventListener("click", function () {
    const phone = (data.quickContact && data.quickContact.phone) || "";
    if (!phone) {
      showToast("暂无电话号码");
      return;
    }
    copyText(phone, "电话号码已复制").catch(function () {});
  });

  document.getElementById("saveWechatQrBtn").addEventListener("click", saveWechatQrImage);

  document.getElementById("copyWechatBtn").addEventListener("click", function () {
    const wechatId = ((data.quickContact && data.quickContact.wechatId) || "").trim();
    if (!wechatId) {
      showToast("暂未设置微信号");
      return;
    }
    copyText(wechatId, "微信号已复制，请按上方步骤在微信中添加").catch(function () {});
  });

  contactModal.querySelectorAll("[data-close-contact]").forEach(function (el) {
    el.addEventListener("click", closeContactModal);
  });

  /* —— 编辑弹窗（双击标题 + 密码验证） —— */

  const authModal = document.getElementById("authModal");
  const authForm = document.getElementById("authForm");
  const editModal = document.getElementById("editModal");
  const form = document.getElementById("editForm");
  const basicInfoEditor = document.getElementById("basicInfoEditor");
  const cardSectionsEditor = document.getElementById("cardSectionsEditor");
  const addSectionKind = document.getElementById("addSectionKind");
  const addCardSectionBtn = document.getElementById("addCardSectionBtn");

  function getSectionHelpers() {
    return {
      escapeHtml: escapeHtml,
      escapeAttr: escapeAttr,
      PORTFOLIO_MEDIA_ACCEPT: PORTFOLIO_MEDIA_ACCEPT,
      compressImageFile: compressImageFile,
      processPortfolioMediaFile: processPortfolioMediaFile,
      showToast: showToast,
    };
  }

  function isEditAuthed() {
    return sessionStorage.getItem(authSessionKey()) === "1";
  }

  function setEditAuthed(password) {
    sessionStorage.setItem(authSessionKey(), "1");
    if (password) {
      sessionEditPassword = password;
      sessionStorage.setItem(authPasswordKey(), password);
    }
  }

  function openAuthModal() {
    authForm.password.value = "";
    authModal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(function () {
      authForm.password.focus();
    }, 50);
  }

  function closeAuthModal() {
    authModal.hidden = true;
    refreshBodyModalLock();
  }

  function requestEditAccess() {
    if (isEditAuthed()) {
      openEditModal();
      return;
    }
    openAuthModal();
  }

  async function handleAuthSubmit(ev) {
    ev.preventDefault();
    const pwd = authForm.password.value;
    const submitBtn = authModal.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const ok = await verifyEditPassword(pwd);
      if (ok) {
        setEditAuthed(pwd);
        closeAuthModal();
        openEditModal();
        showToast("验证成功");
        return;
      }
      showToast("密码错误，请重试");
      authForm.password.value = "";
      authForm.password.focus();
    } catch (err) {
      console.error(err);
      showToast("验证失败，请检查网络后重试");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function setupEditEntry() {
    const title = document.getElementById("pageTitle");
    const hint = document.getElementById("editEntryHint");

    if (title) {
      title.addEventListener("dblclick", requestEditAccess);

      let pressTimer = null;
      function clearPressTimer() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }

      title.addEventListener("touchstart", function () {
        clearPressTimer();
        pressTimer = setTimeout(function () {
          pressTimer = null;
          requestEditAccess();
        }, 650);
      });
      title.addEventListener("touchend", clearPressTimer);
      title.addEventListener("touchmove", clearPressTimer);
      title.addEventListener("touchcancel", clearPressTimer);
    }

    if (hint) {
      let tapCount = 0;
      let tapTimer = null;
      hint.addEventListener("click", function () {
        tapCount += 1;
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(function () {
          tapCount = 0;
        }, 900);
        if (tapCount >= 3) {
          tapCount = 0;
          if (tapTimer) clearTimeout(tapTimer);
          requestEditAccess();
        }
      });
    }
  }

  setupEditEntry();

  function openEditModal() {
    try {
      fillForm();
    } catch (err) {
      console.error(err);
      showToast("编辑页加载失败，请强制刷新页面后重试");
      return;
    }
    editModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeEditModal() {
    editModal.hidden = true;
    refreshBodyModalLock();
  }

  function basicInfoItemHtml(item, index) {
    return (
      '<div class="repeat-item" data-type="basicInfo" data-index="' +
      index +
      '">' +
      '<div class="repeat-item-header">' +
      '<span class="repeat-item-title">基本项 ' +
      (index + 1) +
      "</span>" +
      '<button type="button" class="btn-remove" data-remove>删除</button>' +
      "</div>" +
      '<label class="form-field"><span>标签（如：姓名、职位、学历）</span>' +
      '<input type="text" data-field="label" value="' +
      escapeAttr(item.label) +
      '" placeholder="姓名" /></label>' +
      '<label class="form-field"><span>内容</span>' +
      '<input type="text" data-field="value" value="' +
      escapeAttr(item.value) +
      '" placeholder="张三" /></label>' +
      "</div>"
    );
  }

  function fillForm() {
    const qc = data.quickContact || mergeQuickContact(null);
    const avatarInput = form.querySelector('input[name="avatar"]');
    const wechatQrInput = form.querySelector('input[name="wechatQr"]');

    avatarInput.value = data.avatar || "";
    wechatQrInput.value = qc.wechatQr || "";
    setImagePreview("avatarPreviewWrap", "avatarPreview", data.avatar);
    setImagePreview("wechatQrPreviewWrap", "wechatQrPreview", qc.wechatQr);

    form.quickPhone.value = qc.phone || "";
    form.wechatId.value = qc.wechatId || "";
    form.wechatTip.value = qc.wechatTip || "";

    basicInfoEditor.innerHTML = (data.basicInfo || [])
      .map(basicInfoItemHtml)
      .join("");

    if (window.CardSections) {
      window.CardSections.fillSectionsEditor(
        cardSectionsEditor,
        data.cardSections || [],
        getSectionHelpers()
      );
    }
  }

  function readRepeatList(container, type) {
    if (!container) return [];
    const items = container.querySelectorAll('.repeat-item[data-type="' + type + '"]');
    const result = [];
    items.forEach(function (el) {
      if (type === "basicInfo") {
        const label = el.querySelector('[data-field="label"]').value.trim();
        const value = el.querySelector('[data-field="value"]').value.trim();
        if (label || value) {
          result.push({ label: label || "信息", value: value || "—" });
        }
      }
    });
    return result;
  }

  function handleFormSubmit(ev) {
    ev.preventDefault();
    const avatarInput = form.querySelector('input[name="avatar"]');
    const wechatQrInput = form.querySelector('input[name="wechatQr"]');

    data = {
      updatedAt: Date.now(),
      basicInfo: readRepeatList(basicInfoEditor, "basicInfo"),
      avatar: avatarInput.value.trim(),
      cardSections: window.CardSections
        ? window.CardSections.readSectionsEditor(cardSectionsEditor)
        : [],
      quickContact: {
        phone: form.quickPhone.value.trim(),
        wechatId: form.wechatId.value.trim(),
        wechatQr: wechatQrInput.value.trim(),
        wechatTip: form.wechatTip.value.trim(),
      },
    };

    if (!data.basicInfo.length) {
      showToast("请至少添加一条基本信息");
      return;
    }

    try {
      persistData();
    } catch (e) {
      return;
    }

    const saveBtn = form.querySelector('[type="submit"]') || document.querySelector('button[form="editForm"]');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "同步中…";
    }

    const wasPendingCloud = needsCloudCreate(currentSlug);

    syncToCloud()
      .then(function (result) {
        if (result.ok) {
          if (wasPendingCloud) {
            showToast("首次保存成功，名片已同步到云端");
            updateCreateCardUi();
          } else {
            showToast("已保存并同步，所有设备刷新即可看到");
          }
        } else {
          showToast("已保存到本机。请填写 cloud-config.js 完成云端同步");
        }
        renderCard();
        closeEditModal();
      })
      .catch(function (err) {
        console.error(err);
        showToast("本机已保存，但云端同步失败，请检查 Supabase 配置");
        renderCard();
        closeEditModal();
      })
      .finally(function () {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "保存修改";
        }
      });
  }

  function bindImageUpload(fileInputId, btnId, clearBtnId, hiddenName, previewWrapId, previewImgId, maxWidth) {
    const fileInput = document.getElementById(fileInputId);
    const btn = document.getElementById(btnId);
    const clearBtn = document.getElementById(clearBtnId);
    const hidden = form.querySelector('input[name="' + hiddenName + '"]');

    btn.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      showToast("正在处理图片…");
      compressImageFile(file, maxWidth, 0.82)
        .then(function (dataUrl) {
          hidden.value = dataUrl;
          setImagePreview(previewWrapId, previewImgId, dataUrl);
          showToast("图片已就绪，记得保存修改");
        })
        .catch(function () {
          showToast("图片处理失败，请换一张较小的图片");
        })
        .finally(function () {
          fileInput.value = "";
        });
    });

    clearBtn.addEventListener("click", function () {
      hidden.value = "";
      setImagePreview(previewWrapId, previewImgId, "");
    });
  }

  bindImageUpload("avatarUpload", "avatarUploadBtn", "avatarClearBtn", "avatar", "avatarPreviewWrap", "avatarPreview", 400);
  bindImageUpload("wechatQrUpload", "wechatQrUploadBtn", "wechatQrClearBtn", "wechatQr", "wechatQrPreviewWrap", "wechatQrPreview", 600);

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("read failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  function processPortfolioMediaFile(file) {
    if (!file) return Promise.reject(new Error("no file"));
    if (file.type.startsWith("video/")) {
      if (file.size > MAX_VIDEO_BYTES) {
        return Promise.reject(new Error("video too large"));
      }
      return readFileAsDataURL(file).then(function (dataUrl) {
        return { dataUrl: dataUrl, mediaType: "video" };
      });
    }
    if (file.type.startsWith("image/")) {
      if (file.type === "image/svg+xml") {
        if (file.size > 2 * 1024 * 1024) {
          return Promise.reject(new Error("svg too large"));
        }
        return readFileAsDataURL(file).then(function (dataUrl) {
          return { dataUrl: dataUrl, mediaType: "image" };
        });
      }
      return compressImageFile(file, 1200, 0.85).then(function (dataUrl) {
        return { dataUrl: dataUrl, mediaType: "image" };
      });
    }
    return Promise.reject(new Error("unsupported"));
  }

  if (window.CardSections) {
    window.CardSections.bindSectionsEditor(
      cardSectionsEditor,
      addCardSectionBtn,
      addSectionKind,
      getSectionHelpers()
    );
  }

  function resetToDefaults() {
    if (!confirm("确定恢复为默认示例数据？当前已保存的修改将被清除。")) return;
    localStorage.removeItem(storageKey());
    data = mergeWithDefaults(clone(defaults));
    data.updatedAt = Date.now();
    if (!data.basicInfo) data.basicInfo = mergeBasicInfo({});
    if (!data.quickContact) data.quickContact = mergeQuickContact(null);
    try {
      persistData();
    } catch (e) {
      return;
    }
    syncToCloud().finally(function () {
      renderCard();
      closeEditModal();
      showToast("已恢复默认数据");
    });
  }

  basicInfoEditor.addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-remove]");
    if (!btn) return;
    const item = btn.closest(".repeat-item");
    if (item) item.remove();
  });

  document.querySelectorAll("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const kind = btn.getAttribute("data-add");
      if (kind === "basicInfo") {
        const index = basicInfoEditor.querySelectorAll('[data-type="basicInfo"]').length;
        basicInfoEditor.insertAdjacentHTML(
          "beforeend",
          basicInfoItemHtml({ label: "", value: "" }, index)
        );
      }
    });
  });

  authForm.addEventListener("submit", handleAuthSubmit);

  authModal.querySelectorAll("[data-close-auth]").forEach(function (el) {
    el.addEventListener("click", closeAuthModal);
  });

  document.getElementById("resetBtn").addEventListener("click", resetToDefaults);
  form.addEventListener("submit", handleFormSubmit);

  editModal.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeEditModal);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    const createModalEl = document.getElementById("createModal");
    const successModalEl = document.getElementById("createSuccessModal");
    const recoverModalEl = document.getElementById("recoverModal");
    if (successModalEl && !successModalEl.hidden) closeCreateSuccessModal();
    else if (recoverModalEl && !recoverModalEl.hidden) closeRecoverModal();
    else if (createModalEl && !createModalEl.hidden) closeCreateModal();
    else if (!shareModal.hidden) closeShareModal();
    else if (!contactModal.hidden) closeContactModal();
    else if (!authModal.hidden) closeAuthModal();
    else if (!editModal.hidden) closeEditModal();
  });

  /* —— 制作我的名片 —— */

  const createModal = document.getElementById("createModal");
  const createForm = document.getElementById("createForm");
  const createSuccessModal = document.getElementById("createSuccessModal");
  const recoverModal = document.getElementById("recoverModal");
  const recoverForm = document.getElementById("recoverForm");

  function openCreateModal() {
    if (createForm) createForm.reset();
    if (createModal) {
      createModal.hidden = false;
      document.body.classList.add("modal-open");
      setTimeout(function () {
        const pwd = createForm && createForm.password;
        if (pwd) pwd.focus();
      }, 50);
    }
  }

  function closeCreateModal() {
    if (createModal) {
      createModal.hidden = true;
      refreshBodyModalLock();
    }
  }

  async function handleCreateSubmit(ev) {
    ev.preventDefault();
    const pwd = createForm.password.value;
    const pwd2 = createForm.password2.value;
    if (pwd.length < 4) {
      showToast("密码至少 4 位");
      return;
    }
    if (pwd !== pwd2) {
      showToast("两次输入的密码不一致");
      return;
    }
    const rawSlug = (createForm.requestedSlug.value || "").trim().toLowerCase();
    if (rawSlug && !/^[a-z0-9][a-z0-9-]{2,31}$/.test(rawSlug)) {
      showToast("名片 ID 仅支持小写字母、数字和连字符，3–32 位");
      return;
    }

    const submitBtn = createModal.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      let slug = rawSlug || generateLocalSlug();
      if (rawSlug) {
        const available = await checkSlugAvailable(rawSlug);
        if (!available) {
          showToast("该名片 ID 已被使用，请换一个");
          return;
        }
      }

      const blank = buildBlankCardData();
      markPendingCloudCreate(slug);
      localStorage.setItem("person_web_card_" + slug, JSON.stringify(blank));
      sessionStorage.setItem("person_web_edit_pwd_" + slug, pwd);
      sessionStorage.setItem("person_web_edit_authed_" + slug, "1");

      const cardUrl = buildCardUrl(slug);
      registerMyCard(slug, cardUrl);
      pendingSuccessSlug = slug;

      closeCreateModal();
      openCreateSuccessModal(slug, cardUrl);
    } catch (err) {
      console.error(err);
      showToast(err.message || "创建失败");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function openCreateSuccessModal(slug, url) {
    pendingSuccessSlug = slug;
    const urlEl = document.getElementById("createSuccessUrl");
    const qrEl = document.getElementById("createSuccessQr");
    if (urlEl) urlEl.textContent = url;
    if (qrEl) qrEl.src = buildQrImageUrl(url);
    if (createSuccessModal) {
      createSuccessModal.hidden = false;
      document.body.classList.add("modal-open");
    }
  }

  function closeCreateSuccessModal() {
    if (createSuccessModal) {
      createSuccessModal.hidden = true;
      refreshBodyModalLock();
    }
  }

  function goToPendingCard(editAfter) {
    if (!pendingSuccessSlug) return;
    sessionStorage.setItem("person_web_edit_pwd_" + pendingSuccessSlug, sessionStorage.getItem("person_web_edit_pwd_" + pendingSuccessSlug) || "");
    sessionStorage.setItem("person_web_edit_authed_" + pendingSuccessSlug, "1");
    if (editAfter) {
      sessionStorage.setItem("person_web_open_edit_" + pendingSuccessSlug, "1");
    }
    window.location.href = buildCardUrl(pendingSuccessSlug);
  }

  function renderMyCardsList() {
    const listEl = document.getElementById("myCardsList");
    if (!listEl) return;
    const cards = readMyCards();
    if (!cards.length) {
      listEl.innerHTML = '<p class="form-hint my-cards-empty">本浏览器暂无已创建的名片记录</p>';
      return;
    }
    listEl.innerHTML = cards
      .map(function (c) {
        const url = c.url || buildCardUrl(c.slug);
        const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString("zh-CN") : "";
        return (
          '<div class="my-card-item">' +
          '<div class="my-card-item-main">' +
          '<strong>' +
          escapeHtml(c.slug) +
          "</strong>" +
          (date ? '<span class="my-card-item-date">' + escapeHtml(date) + "</span>" : "") +
          '<p class="my-card-item-url">' +
          escapeHtml(url) +
          "</p>" +
          "</div>" +
          '<button type="button" class="btn-ghost btn-sm" data-open-my-card="' +
          escapeAttr(c.slug) +
          '">打开</button>' +
          "</div>"
        );
      })
      .join("");
  }

  function openRecoverModal() {
    renderMyCardsList();
    if (recoverForm) recoverForm.reset();
    if (recoverModal) {
      recoverModal.hidden = false;
      document.body.classList.add("modal-open");
    }
  }

  function closeRecoverModal() {
    if (recoverModal) {
      recoverModal.hidden = true;
      refreshBodyModalLock();
    }
  }

  function openCardBySlug(slug) {
    const raw = String(slug || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(raw)) {
      showToast("无效的名片 ID");
      return;
    }
    window.location.href = buildCardUrl(raw);
  }

  function handleRecoverSubmit(ev) {
    ev.preventDefault();
    openCardBySlug(recoverForm.slug.value);
  }

  function updateCreateCardUi() {
    const shareHint = document.getElementById("shareSlugHint");
    if (shareHint) {
      if (currentSlug !== DEFAULT_SLUG) {
        shareHint.textContent = "你的名片专属链接：" + buildCardUrl(currentSlug);
        shareHint.hidden = false;
      } else {
        shareHint.hidden = true;
      }
    }
    const hint = document.getElementById("editEntryHint");
    if (hint) {
      if (currentSlug === DEFAULT_SLUG) {
        hint.innerHTML =
          '编辑保存后同步到云端，所有设备打开均可看到最新内容。站点管理请访问 <a href="admin.html" class="hint-link">管理后台</a>。';
      } else if (needsCloudCreate(currentSlug)) {
        hint.textContent = "名片尚未保存到云端。编辑完成后请点击「保存修改」，并务必保存专属链接。";
      } else {
        hint.textContent = "双击标题或连点下方 3 次可编辑。请妥善保管你的编辑密码与专属链接。";
      }
    }
  }

  if (createForm) createForm.addEventListener("submit", handleCreateSubmit);
  document.querySelectorAll("[data-open-create]").forEach(function (el) {
    el.addEventListener("click", openCreateModal);
  });
  document.querySelectorAll("[data-open-recover]").forEach(function (el) {
    el.addEventListener("click", openRecoverModal);
  });
  if (createModal) {
    createModal.querySelectorAll("[data-close-create]").forEach(function (el) {
      el.addEventListener("click", closeCreateModal);
    });
  }
  if (createSuccessModal) {
    createSuccessModal.querySelectorAll("[data-close-success]").forEach(function (el) {
      el.addEventListener("click", closeCreateSuccessModal);
    });
  }
  const copyCreateSuccessUrlBtn = document.getElementById("copyCreateSuccessUrlBtn");
  if (copyCreateSuccessUrlBtn) {
    copyCreateSuccessUrlBtn.addEventListener("click", function () {
      const url = document.getElementById("createSuccessUrl");
      copyText(url ? url.textContent : buildCardUrl(pendingSuccessSlug), "专属链接已复制").catch(function () {});
    });
  }
  const createSuccessEditBtn = document.getElementById("createSuccessEditBtn");
  if (createSuccessEditBtn) {
    createSuccessEditBtn.addEventListener("click", function () {
      goToPendingCard(true);
    });
  }
  if (recoverForm) recoverForm.addEventListener("submit", handleRecoverSubmit);
  if (recoverModal) {
    recoverModal.querySelectorAll("[data-close-recover]").forEach(function (el) {
      el.addEventListener("click", closeRecoverModal);
    });
    recoverModal.addEventListener("click", function (ev) {
      const btn = ev.target.closest("[data-open-my-card]");
      if (btn) openCardBySlug(btn.getAttribute("data-open-my-card"));
    });
  }

  /* —— 保存为图片 —— */

  const saveBtnHtml =
    '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/>' +
    "</svg>保存为图片";

  async function saveAsImage() {
    const btn = document.getElementById("saveBtn");
    const card = document.getElementById("card");

    if (typeof html2canvas === "undefined") {
      showToast("图片库加载失败，请检查网络后刷新");
      return;
    }

    btn.disabled = true;
    btn.textContent = "生成中…";
    card.classList.add("exporting");

    try {
      const canvas = await html2canvas(card, {
        scale: Math.min(window.devicePixelRatio || 2, 3),
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#1a2332",
        logging: false,
      });

      canvas.toBlob(
        function (blob) {
          if (!blob) {
            showToast("生成图片失败，请重试");
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const safeName = (getBasicValue(data.basicInfo || [], "姓名", 0) || "名片").replace(
            /[/\\?%*:|"<>]/g,
            ""
          );
          a.download = safeName + "_个人名片.png";
          a.href = url;
          a.click();
          URL.revokeObjectURL(url);
          showToast("名片已保存到相册/下载文件夹");
        },
        "image/png",
        1
      );
    } catch (err) {
      console.error(err);
      showToast("保存失败，请稍后重试");
    } finally {
      card.classList.remove("exporting");
      btn.disabled = false;
      btn.innerHTML = saveBtnHtml;
    }
  }

  async function initApp() {
    currentSlug = getCardSlugFromUrl();
    data = await loadData(currentSlug);
    renderCard();
    renderSiteQrs();
    updateCreateCardUi();
    document.getElementById("saveBtn").addEventListener("click", saveAsImage);

    const openEditKey = "person_web_open_edit_" + currentSlug;
    if (sessionStorage.getItem(openEditKey) === "1") {
      sessionStorage.removeItem(openEditKey);
      openEditModal();
      showToast("名片已创建，请开始编辑你的内容");
    }
  }

  initApp();
})();
