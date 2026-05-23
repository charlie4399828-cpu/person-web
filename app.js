(function () {
  const STORAGE_KEY = "person_web_card_data";
  const AUTH_SESSION_KEY = "person_web_edit_authed";
  const defaults = window.CARD_DATA;
  if (!defaults) return;

  function getCloudSync() {
    const fromFile = window.CARD_CLOUD || {};
    const fromData = defaults.cloudSync || {};
    return {
      supabaseUrl: (fromFile.supabaseUrl || fromData.supabaseUrl || "").trim(),
      supabaseAnonKey: (fromFile.supabaseAnonKey || fromData.supabaseAnonKey || "").trim(),
      saveFunctionUrl: (fromFile.saveFunctionUrl || fromData.saveFunctionUrl || "").trim(),
    };
  }

  const EDIT_PASSWORD = String(defaults.editPassword || "763560");

  let data = null;

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

  async function fetchRemoteCardData() {
    const cfg = getCloudSync();
    const url = (cfg.supabaseUrl || "").trim();
    const key = (cfg.supabaseAnonKey || "").trim();

    if (url && key) {
      try {
        const api =
          url.replace(/\/$/, "") +
          "/rest/v1/card_data?id=eq.1&select=content,updated_at";
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
        console.warn("读取 Supabase 数据失败", e);
      }
    }

    try {
      const res = await fetch("./card-data.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("读取 card-data.json 失败", e);
      return null;
    }
  }

  function readLocalCardData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("读取本地数据失败", e);
    }
    return null;
  }

  async function loadData() {
    const remote = await fetchRemoteCardData();
    const local = readLocalCardData();
    const picked = pickNewerData(remote, local);
    if (picked) return mergeWithDefaults(picked);
    return mergeWithDefaults(clone(defaults));
  }

  function dataForCloud() {
    return {
      updatedAt: data.updatedAt || Date.now(),
      basicInfo: data.basicInfo,
      avatar: data.avatar,
      bio: data.bio,
      contacts: data.contacts,
      experience: data.experience,
      skills: data.skills,
      quickContact: data.quickContact,
    };
  }

  async function syncToCloud() {
    const cfg = getCloudSync();
    const saveUrl = (cfg.saveFunctionUrl || "").trim();
    if (!saveUrl) {
      return { ok: false, reason: "no-config" };
    }

    const res = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: EDIT_PASSWORD,
        data: dataForCloud(),
      }),
    });

    if (res.status === 401) {
      throw new Error("云端密码校验失败，请检查 Supabase 的 CARD_EDIT_PASSWORD");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error("云端同步失败：" + text);
    }
    return { ok: true };
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
    return {
      updatedAt: parsed.updatedAt || 0,
      basicInfo: basicInfo,
      avatar: parsed.avatar ?? defaults.avatar,
      bio: parsed.bio ?? defaults.bio,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : clone(defaults.contacts),
      experience: Array.isArray(parsed.experience) ? parsed.experience : clone(defaults.experience),
      skills: Array.isArray(parsed.skills) ? parsed.skills : clone(defaults.skills),
      quickContact: mergeQuickContact(parsed.quickContact),
    };
  }

  function phoneToTel(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? "tel:" + digits : "";
  }

  function persistData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error(e);
      showToast("保存失败：图片过大，请换较小的图片");
      throw e;
    }
  }

  const FALLBACK_AVATAR = "https://api.dicebear.com/7.x/avataaars/svg?seed=profile";
  const MAX_IMAGE_BYTES = 800 * 1024;

  function getSiteUrl() {
    const custom = (defaults.siteUrl || "").trim();
    if (custom) return custom;
    return window.location.href.split("#")[0];
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

    document.getElementById("bio").textContent = data.bio;

    const avatar = document.getElementById("avatar");
    avatar.src = data.avatar || FALLBACK_AVATAR;
    avatar.alt = getBasicValue(basicInfo, "姓名", 0) + " 头像";

    document.getElementById("contactList").innerHTML = data.contacts
      .map(function (c) {
        const valueHtml = c.href
          ? '<a href="' + escapeAttr(c.href) + '" class="value">' + escapeHtml(c.value) + "</a>"
          : '<span class="value">' + escapeHtml(c.value) + "</span>";
        return (
          "<li><span class=\"label\">" +
          escapeHtml(c.label) +
          "</span>" +
          valueHtml +
          "</li>"
        );
      })
      .join("");

    document.getElementById("experienceList").innerHTML = data.experience
      .map(function (e) {
        return (
          '<li class="timeline-item">' +
          '<div class="timeline-meta">' +
          '<time datetime="' +
          escapeAttr(e.datetime || "") +
          '">' +
          escapeHtml(e.period) +
          "</time>" +
          '<span class="company">' +
          escapeHtml(e.company) +
          "</span>" +
          "</div>" +
          '<p class="role">' +
          escapeHtml(e.role) +
          "</p>" +
          '<p class="desc">' +
          escapeHtml(e.desc) +
          "</p>" +
          "</li>"
        );
      })
      .join("");

    document.getElementById("skillsList").innerHTML = data.skills
      .map(function (s) {
        return "<li>" + escapeHtml(s) + "</li>";
      })
      .join("");

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
    if (contactModal.hidden && editModal.hidden && authModal.hidden) {
      document.body.classList.remove("modal-open");
    }
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
    if (editModal.hidden && authModal.hidden && shareModal.hidden) {
      document.body.classList.remove("modal-open");
    }
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
  const contactsEditor = document.getElementById("contactsEditor");
  const experienceEditor = document.getElementById("experienceEditor");

  function isEditAuthed() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  }

  function setEditAuthed() {
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
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
    if (contactModal.hidden && editModal.hidden && shareModal.hidden) {
      document.body.classList.remove("modal-open");
    }
  }

  function requestEditAccess() {
    if (isEditAuthed()) {
      openEditModal();
      return;
    }
    openAuthModal();
  }

  function handleAuthSubmit(ev) {
    ev.preventDefault();
    const pwd = authForm.password.value;
    if (pwd === EDIT_PASSWORD) {
      setEditAuthed();
      closeAuthModal();
      openEditModal();
      showToast("验证成功");
      return;
    }
    showToast("密码错误，请重试");
    authForm.password.value = "";
    authForm.password.focus();
  }

  function openEditModal() {
    fillForm();
    editModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeEditModal() {
    editModal.hidden = true;
    if (contactModal.hidden && authModal.hidden && shareModal.hidden) {
      document.body.classList.remove("modal-open");
    }
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

  function contactItemHtml(c, index) {
    return (
      '<div class="repeat-item" data-type="contact" data-index="' +
      index +
      '">' +
      '<div class="repeat-item-header">' +
      '<span class="repeat-item-title">联系方式 ' +
      (index + 1) +
      "</span>" +
      '<button type="button" class="btn-remove" data-remove>删除</button>' +
      "</div>" +
      '<label class="form-field"><span>标签（如：手机、邮箱）</span>' +
      '<input type="text" data-field="label" value="' +
      escapeAttr(c.label) +
      '" /></label>' +
      '<label class="form-field"><span>内容</span>' +
      '<input type="text" data-field="value" value="' +
      escapeAttr(c.value) +
      '" /></label>' +
      '<label class="form-field"><span>链接（选填，如 tel:138… 或 mailto:…）</span>' +
      '<input type="text" data-field="href" value="' +
      escapeAttr(c.href || "") +
      '" placeholder="留空则不可点击" /></label>' +
      "</div>"
    );
  }

  function experienceItemHtml(e, index) {
    return (
      '<div class="repeat-item" data-type="experience" data-index="' +
      index +
      '">' +
      '<div class="repeat-item-header">' +
      '<span class="repeat-item-title">经历 ' +
      (index + 1) +
      "</span>" +
      '<button type="button" class="btn-remove" data-remove>删除</button>' +
      "</div>" +
      '<label class="form-field"><span>时间段</span>' +
      '<input type="text" data-field="period" value="' +
      escapeAttr(e.period) +
      '" placeholder="2022.01 — 至今" /></label>' +
      '<label class="form-field"><span>时间标记（选填，用于语义化）</span>' +
      '<input type="text" data-field="datetime" value="' +
      escapeAttr(e.datetime || "") +
      '" placeholder="2022-01" /></label>' +
      '<label class="form-field"><span>公司 / 单位</span>' +
      '<input type="text" data-field="company" value="' +
      escapeAttr(e.company) +
      '" /></label>' +
      '<label class="form-field"><span>职位</span>' +
      '<input type="text" data-field="role" value="' +
      escapeAttr(e.role) +
      '" /></label>' +
      '<label class="form-field"><span>工作描述</span>' +
      '<textarea data-field="desc" rows="3">' +
      escapeHtml(e.desc) +
      "</textarea></label>" +
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

    form.bio.value = data.bio;
    form.skills.value = data.skills.join("\n");
    form.quickPhone.value = qc.phone || "";
    form.wechatId.value = qc.wechatId || "";
    form.wechatTip.value = qc.wechatTip || "";

    basicInfoEditor.innerHTML = (data.basicInfo || [])
      .map(basicInfoItemHtml)
      .join("");
    contactsEditor.innerHTML = data.contacts
      .map(contactItemHtml)
      .join("");
    experienceEditor.innerHTML = data.experience
      .map(experienceItemHtml)
      .join("");
  }

  function readRepeatList(container, type) {
    const items = container.querySelectorAll('.repeat-item[data-type="' + type + '"]');
    const result = [];
    items.forEach(function (el) {
      if (type === "basicInfo") {
        const label = el.querySelector('[data-field="label"]').value.trim();
        const value = el.querySelector('[data-field="value"]').value.trim();
        if (label || value) {
          result.push({ label: label || "信息", value: value || "—" });
        }
      } else if (type === "contact") {
        const label = el.querySelector('[data-field="label"]').value.trim();
        const value = el.querySelector('[data-field="value"]').value.trim();
        const href = el.querySelector('[data-field="href"]').value.trim();
        if (label || value) {
          const item = { label: label || "未命名", value: value || "—" };
          if (href) item.href = href;
          result.push(item);
        }
      } else {
        const period = el.querySelector('[data-field="period"]').value.trim();
        const datetime = el.querySelector('[data-field="datetime"]').value.trim();
        const company = el.querySelector('[data-field="company"]').value.trim();
        const role = el.querySelector('[data-field="role"]').value.trim();
        const desc = el.querySelector('[data-field="desc"]').value.trim();
        if (period || company || role || desc) {
          result.push({
            period: period || "—",
            datetime: datetime || "",
            company: company || "—",
            role: role || "—",
            desc: desc || "",
          });
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
      bio: form.bio.value.trim(),
      quickContact: {
        phone: form.quickPhone.value.trim(),
        wechatId: form.wechatId.value.trim(),
        wechatQr: wechatQrInput.value.trim(),
        wechatTip: form.wechatTip.value.trim(),
      },
      contacts: readRepeatList(contactsEditor, "contact"),
      experience: readRepeatList(experienceEditor, "experience"),
      skills: form.skills.value
        .split("\n")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean),
    };

    if (!data.basicInfo.length) {
      showToast("请至少添加一条基本信息");
      return;
    }

    if (!data.contacts.length) {
      showToast("请至少添加一条联系方式");
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

    syncToCloud()
      .then(function (result) {
        if (result.ok) {
          showToast("已保存并同步，所有设备刷新即可看到");
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

  function resetToDefaults() {
    if (!confirm("确定恢复为默认示例数据？当前已保存的修改将被清除。")) return;
    localStorage.removeItem(STORAGE_KEY);
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

  contactsEditor.addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-remove]");
    if (!btn) return;
    const item = btn.closest(".repeat-item");
    if (item) item.remove();
  });

  experienceEditor.addEventListener("click", function (ev) {
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
      } else if (kind === "contact") {
        const index = contactsEditor.querySelectorAll('[data-type="contact"]').length;
        contactsEditor.insertAdjacentHTML(
          "beforeend",
          contactItemHtml({ label: "", value: "", href: "" }, index)
        );
      } else if (kind === "experience") {
        const index = experienceEditor.querySelectorAll('[data-type="experience"]').length;
        experienceEditor.insertAdjacentHTML(
          "beforeend",
          experienceItemHtml(
            { period: "", datetime: "", company: "", role: "", desc: "" },
            index
          )
        );
      }
    });
  });

  document.getElementById("pageTitle").addEventListener("dblclick", requestEditAccess);
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
    if (!shareModal.hidden) closeShareModal();
    else if (!contactModal.hidden) closeContactModal();
    else if (!authModal.hidden) closeAuthModal();
    else if (!editModal.hidden) closeEditModal();
  });

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
    data = await loadData();
    renderCard();
    renderSiteQrs();
    document.getElementById("saveBtn").addEventListener("click", saveAsImage);
  }

  initApp();
})();
