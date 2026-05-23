(function () {
  const STORAGE_KEY = "person_web_card_data";
  const AUTH_SESSION_KEY = "person_web_edit_authed";
  const defaults = window.CARD_DATA;
  if (!defaults) return;

  const EDIT_PASSWORD = String(defaults.editPassword || "763560");

  let data = loadData();

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return mergeWithDefaults(parsed);
      }
    } catch (e) {
      console.warn("读取本地数据失败", e);
    }
    return clone(defaults);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    avatar.src = data.avatar;
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

  function openWeChatApp() {
    const ua = navigator.userAgent || "";
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);

    if (isAndroid) {
      window.location.href =
        "intent://platformapi/startapp#Intent;scheme=weixin;package=com.tencent.mm;end";
      return;
    }
    if (isIOS) {
      window.location.href = "weixin://";
      return;
    }
    showToast("请在手机浏览器中打开，或手动打开微信搜索微信号");
  }

  function handleOpenWechatAdd() {
    const wechatId = ((data.quickContact && data.quickContact.wechatId) || "").trim();
    if (!wechatId) {
      showToast("暂未设置微信号");
      return;
    }
    copyText(wechatId, "微信号已复制，正在打开微信…")
      .then(function () {
        setTimeout(openWeChatApp, 400);
      })
      .catch(function () {
        openWeChatApp();
      });
  }

  function openContactModal() {
    renderContactModal();
    contactModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeContactModal() {
    contactModal.hidden = true;
    if (editModal.hidden && authModal.hidden) {
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

  document.getElementById("openWechatBtn").addEventListener("click", handleOpenWechatAdd);

  document.getElementById("copyWechatBtn").addEventListener("click", function () {
    const wechatId = ((data.quickContact && data.quickContact.wechatId) || "").trim();
    if (!wechatId) {
      showToast("暂未设置微信号");
      return;
    }
    copyText(wechatId, "微信号已复制").catch(function () {});
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
    if (contactModal.hidden && editModal.hidden) {
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
    if (contactModal.hidden && authModal.hidden) {
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
    form.avatar.value = data.avatar;
    form.bio.value = data.bio;
    form.skills.value = data.skills.join("\n");
    form.quickPhone.value = qc.phone || "";
    form.wechatId.value = qc.wechatId || "";
    form.wechatQr.value = qc.wechatQr || "";
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
    data = {
      basicInfo: readRepeatList(basicInfoEditor, "basicInfo"),
      avatar: form.avatar.value.trim() || defaults.avatar,
      bio: form.bio.value.trim(),
      quickContact: {
        phone: form.quickPhone.value.trim(),
        wechatId: form.wechatId.value.trim(),
        wechatQr: form.wechatQr.value.trim(),
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

    persistData();
    renderCard();
    closeEditModal();
    showToast("名片信息已保存");
  }

  function resetToDefaults() {
    if (!confirm("确定恢复为默认示例数据？当前已保存的修改将被清除。")) return;
    localStorage.removeItem(STORAGE_KEY);
    data = clone(defaults);
    if (!data.basicInfo) data.basicInfo = mergeBasicInfo({});
    if (!data.quickContact) data.quickContact = mergeQuickContact(null);
    renderCard();
    closeEditModal();
    showToast("已恢复默认数据");
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
    if (!contactModal.hidden) closeContactModal();
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
        allowTaint: false,
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

  renderCard();
  document.getElementById("saveBtn").addEventListener("click", saveAsImage);
})();
