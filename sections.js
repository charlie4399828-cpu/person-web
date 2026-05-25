/**
 * 名片内容模块：渲染、编辑、数据迁移
 */
(function (global) {
  const SECTION_KINDS = {
    "contact-list": { label: "联系方式", itemLabel: "联系方式", defaultTitle: "联系方式" },
    "text-blocks": { label: "自由文本", itemLabel: "段落", defaultTitle: "个人简介" },
    timeline: { label: "时间线经历", itemLabel: "经历", defaultTitle: "工作经历" },
    tags: { label: "标签列表", itemLabel: "标签组", defaultTitle: "技能标签" },
    portfolio: { label: "作品集", itemLabel: "作品", defaultTitle: "作品集" },
  };

  function getSectionMeta(kind) {
    return SECTION_KINDS[kind] || SECTION_KINDS["text-blocks"];
  }

  /** 用 、或空格拆分标签；含 、 时保留括号内空格 */
  function parseTagValues(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    if (/[、,，]/.test(raw)) {
      return raw
        .split(/[、,，]+/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    return raw
      .split(/\s+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function tagsItemHasContent(item) {
    return parseTagValues(item && item.value).length > 0;
  }

  function sectionKindOptions(selected) {
    return Object.keys(SECTION_KINDS)
      .map(function (key) {
        const meta = SECTION_KINDS[key];
        return (
          '<option value="' +
          key +
          '"' +
          (key === selected ? " selected" : "") +
          ">" +
          meta.label +
          "</option>"
        );
      })
      .join("");
  }

  function emptyItem(kind) {
    if (kind === "contact-list") return { label: "", value: "", href: "" };
    if (kind === "text-blocks") return { label: "", content: "" };
    if (kind === "timeline") {
      return { period: "", datetime: "", company: "", role: "", desc: "", link: "", image: "" };
    }
    if (kind === "tags") return { label: "", value: "" };
    if (kind === "portfolio") {
      return { title: "", desc: "", link: "", mediaSrc: "", mediaType: "image" };
    }
    return {};
  }

  function normalizeSection(section) {
    const kind = section.kind || "text-blocks";
    const meta = getSectionMeta(kind);
    const items = Array.isArray(section.items)
      ? section.items.filter(function (item) {
          return item && typeof item === "object";
        })
      : [];
    return {
      kind: kind,
      title: section.title || meta.defaultTitle,
      items: items.map(function (item) {
        if (kind === "contact-list") {
          return {
            label: item.label ?? "",
            value: item.value ?? "",
            href: item.href ?? "",
          };
        }
        if (kind === "text-blocks") {
          return { label: item.label ?? "", content: item.content ?? "" };
        }
        if (kind === "timeline") {
          return {
            period: item.period ?? "",
            datetime: item.datetime ?? "",
            company: item.company ?? "",
            role: item.role ?? "",
            desc: item.desc ?? "",
            link: item.link ?? "",
            image: item.image ?? "",
          };
        }
        if (kind === "tags") {
          return { label: item.label ?? "", value: item.value ?? "" };
        }
        if (kind === "portfolio") {
          return {
            title: item.title ?? "",
            desc: item.desc ?? "",
            link: item.link ?? "",
            mediaSrc: item.mediaSrc ?? "",
            mediaType: item.mediaType === "video" ? "video" : "image",
          };
        }
        return item;
      }),
    };
  }

  function migrateLegacySkills(skills) {
    if (!Array.isArray(skills) || !skills.length) return [];
    if (typeof skills[0] === "string") {
      return skills.filter(Boolean).map(function (s) {
        return { label: "", value: s };
      });
    }
    return skills
      .filter(function (item) {
        return item && typeof item === "object";
      })
      .map(function (item) {
        return { label: item.label ?? "", value: item.value ?? "" };
      });
  }

  function mergeCardSections(parsed, defaults) {
    if (Array.isArray(parsed.cardSections) && parsed.cardSections.length) {
      return parsed.cardSections.map(normalizeSection);
    }

    const sections = [];
    const defSections = defaults.cardSections || [];

    if (Array.isArray(parsed.contacts) && parsed.contacts.length) {
      sections.push({ kind: "contact-list", title: "联系方式", items: parsed.contacts });
    } else if (defSections.find(function (s) {
      return s.kind === "contact-list";
    })) {
      const d = defSections.find(function (s) {
        return s.kind === "contact-list";
      });
      sections.push(JSON.parse(JSON.stringify(d)));
    }

    const bioItems = [];
    if (Array.isArray(parsed.bioSections) && parsed.bioSections.length) {
      parsed.bioSections.forEach(function (item) {
        if (item && typeof item === "object") {
          bioItems.push({ label: item.label ?? "简介", content: item.content ?? "" });
        }
      });
    } else if (parsed.bio) {
      bioItems.push({ label: "个人简介", content: parsed.bio });
    }
    if (bioItems.length) {
      sections.push({ kind: "text-blocks", title: "个人简介", items: bioItems });
    } else {
      const d = defSections.find(function (s) {
        return s.kind === "text-blocks";
      });
      if (d) sections.push(JSON.parse(JSON.stringify(d)));
    }

    if (Array.isArray(parsed.experience) && parsed.experience.length) {
      sections.push({
        kind: "timeline",
        title: "工作经历",
        items: parsed.experience.map(function (e) {
          return {
            period: e.period ?? "",
            datetime: e.datetime ?? "",
            company: e.company ?? "",
            role: e.role ?? "",
            desc: e.desc ?? "",
            link: e.link ?? "",
            image: e.image ?? "",
          };
        }),
      });
    } else {
      defSections
        .filter(function (s) {
          return s.kind === "timeline";
        })
        .forEach(function (s) {
          sections.push(JSON.parse(JSON.stringify(s)));
        });
    }

    const skillItems = migrateLegacySkills(parsed.skills);
    if (skillItems.length) {
      sections.push({ kind: "tags", title: "技能标签", items: skillItems });
    } else {
      const d = defSections.find(function (s) {
        return s.kind === "tags";
      });
      if (d) sections.push(JSON.parse(JSON.stringify(d)));
    }

    if (Array.isArray(parsed.portfolio) && parsed.portfolio.length) {
      sections.push({ kind: "portfolio", title: "作品集", items: parsed.portfolio });
    }

    if (!sections.length && defSections.length) {
      return defSections.map(normalizeSection);
    }
    return sections.map(normalizeSection);
  }

  function itemHasContent(kind, item) {
    if (!item) return false;
    if (kind === "contact-list") return !!(item.label || item.value);
    if (kind === "text-blocks") return !!(item.label || item.content);
    if (kind === "timeline") {
      return !!(item.period || item.company || item.role || item.desc || item.link || item.image);
    }
    if (kind === "tags") return tagsItemHasContent(item);
    if (kind === "portfolio") {
      return !!(item.title || item.desc || item.link || item.mediaSrc);
    }
    return false;
  }

  function sectionHasContent(section) {
    return (section.items || []).some(function (item) {
      return itemHasContent(section.kind, item);
    });
  }

  function renderCardSections(container, sections, helpers) {
    const escapeHtml = helpers.escapeHtml;
    const escapeAttr = helpers.escapeAttr;
    const visible = (sections || []).filter(sectionHasContent);

    if (!container) return;
    if (!visible.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = visible
      .map(function (section, index) {
        const isLast = index === visible.length - 1;
        const body = renderSectionBody(section, helpers);
        return (
          '<section class="card-section' +
          (isLast ? " card-section--last" : "") +
          '">' +
          '<h3 class="section-title"><span class="section-icon" aria-hidden="true">◆</span>' +
          escapeHtml(section.title || "未命名模块") +
          "</h3>" +
          body +
          "</section>"
        );
      })
      .join("");
  }

  function renderSectionBody(section, helpers) {
    const escapeHtml = helpers.escapeHtml;
    const escapeAttr = helpers.escapeAttr;
    const kind = section.kind;
    const items = (section.items || []).filter(function (item) {
      return itemHasContent(kind, item);
    });

    if (kind === "contact-list") {
      return (
        '<ul class="contact-list">' +
        items
          .map(function (c) {
            const valueHtml = c.href
              ? '<a href="' + escapeAttr(c.href) + '" class="value">' + escapeHtml(c.value) + "</a>"
              : '<span class="value">' + escapeHtml(c.value) + "</span>";
            return (
              "<li><span class=\"label\">" +
              escapeHtml(c.label || "信息") +
              "</span>" +
              valueHtml +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      );
    }

    if (kind === "text-blocks") {
      return (
        '<div class="bio-sections">' +
        items
          .map(function (item) {
            const title = item.label
              ? '<h4 class="bio-block-title">' + escapeHtml(item.label) + "</h4>"
              : "";
            return (
              '<div class="bio-block">' +
              title +
              '<p class="bio">' +
              escapeHtml(item.content || "") +
              "</p></div>"
            );
          })
          .join("") +
        "</div>"
      );
    }

    if (kind === "timeline") {
      return (
        '<ul class="timeline">' +
        items
          .map(function (e) {
            const imageHtml = e.image
              ? '<img class="timeline-image" src="' +
                escapeAttr(e.image) +
                '" alt="' +
                escapeAttr(e.company || "配图") +
                '" />'
              : "";
            const linkHtml = e.link
              ? '<a class="timeline-link" href="' +
                escapeAttr(e.link) +
                '" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(e.link) +
                "</a>"
              : "";
            return (
              '<li class="timeline-item">' +
              imageHtml +
              '<div class="timeline-meta">' +
              '<time datetime="' +
              escapeAttr(e.datetime || "") +
              '">' +
              escapeHtml(e.period || "") +
              "</time>" +
              '<span class="company">' +
              escapeHtml(e.company || "") +
              "</span>" +
              "</div>" +
              (e.role ? '<p class="role">' + escapeHtml(e.role) + "</p>" : "") +
              (e.desc ? '<p class="desc">' + escapeHtml(e.desc) + "</p>" : "") +
              linkHtml +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      );
    }

    if (kind === "tags") {
      const groups = [];
      const groupMap = {};
      items.forEach(function (s) {
        const key = s.label || "";
        const tagList = parseTagValues(s.value);
        if (!tagList.length) return;
        if (!groupMap[key]) {
          groupMap[key] = { label: key, tags: [] };
          groups.push(groupMap[key]);
        }
        tagList.forEach(function (tag) {
          groupMap[key].tags.push(tag);
        });
      });
      return groups
        .map(function (g) {
          const labelHtml = g.label
            ? '<p class="skill-group-label">' + escapeHtml(g.label) + "</p>"
            : "";
          const pills = g.tags
            .map(function (v) {
              return "<li>" + escapeHtml(v) + "</li>";
            })
            .join("");
          return '<div class="skill-group">' + labelHtml + '<ul class="skills">' + pills + "</ul></div>";
        })
        .join("");
    }

    if (kind === "portfolio") {
      return (
        '<div class="portfolio-grid">' +
        items
          .map(function (p) {
            let mediaHtml = "";
            if (p.mediaSrc) {
              if (p.mediaType === "video") {
                mediaHtml =
                  '<video class="portfolio-media" src="' +
                  escapeAttr(p.mediaSrc) +
                  '" controls playsinline preload="metadata"></video>';
              } else {
                mediaHtml =
                  '<img class="portfolio-media" src="' +
                  escapeAttr(p.mediaSrc) +
                  '" alt="' +
                  escapeAttr(p.title || "作品") +
                  '" />';
              }
            }
            const linkHtml = p.link
              ? '<a class="portfolio-link" href="' +
                escapeAttr(p.link) +
                '" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(p.link) +
                "</a>"
              : "";
            return (
              '<article class="portfolio-item">' +
              (mediaHtml ? '<div class="portfolio-media-wrap">' + mediaHtml + "</div>" : "") +
              (p.title ? '<h4 class="portfolio-title">' + escapeHtml(p.title) + "</h4>" : "") +
              (p.desc ? '<p class="portfolio-desc">' + escapeHtml(p.desc) + "</p>" : "") +
              linkHtml +
              "</article>"
            );
          })
          .join("") +
        "</div>"
      );
    }

    return "";
  }

  function imagePreviewHtml(src, alt, escapeAttrFn) {
    if (!src) return '<span class="item-image-empty">未上传图片</span>';
    const esc = escapeAttrFn || function (s) {
      return String(s || "");
    };
    return (
      '<img class="item-image-preview" src="' +
      esc(src) +
      '" alt="' +
      esc(alt || "预览") +
      '" />'
    );
  }

  function portfolioPreviewInnerHtml(src, mediaType, escapeAttr) {
    if (!src) return '<span class="portfolio-preview-empty">未上传图片或视频</span>';
    if (mediaType === "video") {
      return (
        '<video class="portfolio-media" src="' +
        escapeAttr(src) +
        '" controls playsinline preload="metadata"></video>'
      );
    }
    return '<img class="portfolio-media" src="' + escapeAttr(src) + '" alt="作品预览" />';
  }

  function sectionItemHtml(kind, item, index, helpers) {
    const escapeAttr = helpers.escapeAttr;
    const escapeHtml = helpers.escapeHtml;
    const PORTFOLIO_MEDIA_ACCEPT = helpers.PORTFOLIO_MEDIA_ACCEPT;
    const meta = getSectionMeta(kind);

    if (kind === "contact-list") {
      return (
        '<div class="repeat-item" data-item-kind="' +
        kind +
        '" data-index="' +
        index +
        '">' +
        '<div class="repeat-item-header"><span class="repeat-item-title">' +
        meta.itemLabel +
        " " +
        (index + 1) +
        '</span><button type="button" class="btn-remove" data-remove-item>删除</button></div>' +
        '<label class="form-field"><span>标签</span><input type="text" data-field="label" value="' +
        escapeAttr(item.label) +
        '" placeholder="手机、邮箱" /></label>' +
        '<label class="form-field"><span>内容</span><input type="text" data-field="value" value="' +
        escapeAttr(item.value) +
        '" /></label>' +
        '<label class="form-field"><span>链接（选填）</span><input type="text" data-field="href" value="' +
        escapeAttr(item.href || "") +
        '" placeholder="tel: / mailto: / https://" /></label></div>'
      );
    }

    if (kind === "text-blocks") {
      return (
        '<div class="repeat-item" data-item-kind="' +
        kind +
        '" data-index="' +
        index +
        '">' +
        '<div class="repeat-item-header"><span class="repeat-item-title">' +
        meta.itemLabel +
        " " +
        (index + 1) +
        '</span><button type="button" class="btn-remove" data-remove-item>删除</button></div>' +
        '<label class="form-field"><span>小标题（选填）</span><input type="text" data-field="label" value="' +
        escapeAttr(item.label) +
        '" /></label>' +
        '<label class="form-field"><span>内容</span><textarea data-field="content" rows="4">' +
        escapeHtml(item.content) +
        "</textarea></label></div>"
      );
    }

    if (kind === "timeline") {
      return (
        '<div class="repeat-item" data-item-kind="' +
        kind +
        '" data-index="' +
        index +
        '">' +
        '<div class="repeat-item-header"><span class="repeat-item-title">' +
        meta.itemLabel +
        " " +
        (index + 1) +
        '</span><button type="button" class="btn-remove" data-remove-item>删除</button></div>' +
        '<label class="form-field"><span>时间段</span><input type="text" data-field="period" value="' +
        escapeAttr(item.period) +
        '" placeholder="2022.01 — 至今" /></label>' +
        '<label class="form-field"><span>时间标记（选填）</span><input type="text" data-field="datetime" value="' +
        escapeAttr(item.datetime || "") +
        '" /></label>' +
        '<label class="form-field"><span>公司 / 项目名称</span><input type="text" data-field="company" value="' +
        escapeAttr(item.company) +
        '" /></label>' +
        '<label class="form-field"><span>职位 / 角色</span><input type="text" data-field="role" value="' +
        escapeAttr(item.role) +
        '" /></label>' +
        '<label class="form-field"><span>描述</span><textarea data-field="desc" rows="3">' +
        escapeHtml(item.desc) +
        "</textarea></label>" +
        '<label class="form-field"><span>链接（选填）</span><input type="url" data-field="link" value="' +
        escapeAttr(item.link || "") +
        '" placeholder="https://..." /></label>' +
        '<span class="form-field-label">配图（选填）</span>' +
        '<div class="item-image-preview-wrap" data-item-image-preview>' +
        imagePreviewHtml(item.image, "配图", escapeAttr) +
        "</div>" +
        '<input type="hidden" data-field="image" value="' +
        escapeAttr(item.image || "") +
        '" />' +
        '<input type="file" data-item-image-file accept="image/*" hidden />' +
        '<div class="portfolio-upload-actions">' +
        '<button type="button" class="btn-add btn-sm" data-item-image-upload>选择图片</button>' +
        '<button type="button" class="btn-ghost btn-sm" data-item-image-clear>清除图片</button>' +
        "</div></div>"
      );
    }

    if (kind === "tags") {
      return (
        '<div class="repeat-item" data-item-kind="' +
        kind +
        '" data-index="' +
        index +
        '">' +
        '<div class="repeat-item-header"><span class="repeat-item-title">' +
        meta.itemLabel +
        " " +
        (index + 1) +
        '</span><button type="button" class="btn-remove" data-remove-item>删除</button></div>' +
        '<label class="form-field"><span>分组名（选填，如：证书）</span>' +
        '<input type="text" data-field="label" value="' +
        escapeAttr(item.label) +
        '" placeholder="留空则不分组" /></label>' +
        '<label class="form-field"><span>标签内容</span>' +
        '<textarea data-field="value" rows="3" placeholder="多个标签用空格或 、 分隔">' +
        escapeHtml(item.value) +
        "</textarea></label>" +
        '<p class="form-hint">保存后每个标签独立显示为一个圆角标签</p></div>'
      );
    }

    if (kind === "portfolio") {
      const mediaType = item.mediaType === "video" ? "video" : "image";
      return (
        '<div class="repeat-item" data-item-kind="' +
        kind +
        '" data-index="' +
        index +
        '">' +
        '<div class="repeat-item-header"><span class="repeat-item-title">' +
        meta.itemLabel +
        " " +
        (index + 1) +
        '</span><button type="button" class="btn-remove" data-remove-item>删除</button></div>' +
        '<label class="form-field"><span>标题</span><input type="text" data-field="title" value="' +
        escapeAttr(item.title) +
        '" /></label>' +
        '<label class="form-field"><span>描述（选填）</span><textarea data-field="desc" rows="2">' +
        escapeHtml(item.desc) +
        "</textarea></label>" +
        '<label class="form-field"><span>链接（选填）</span><input type="url" data-field="link" value="' +
        escapeAttr(item.link || "") +
        '" /></label>' +
        '<span class="form-field-label">图片 / 视频（选填）</span>' +
        '<div class="portfolio-preview-wrap" data-portfolio-preview>' +
        portfolioPreviewInnerHtml(item.mediaSrc, mediaType, escapeAttr) +
        "</div>" +
        '<input type="hidden" data-field="mediaSrc" value="' +
        escapeAttr(item.mediaSrc || "") +
        '" />' +
        '<input type="hidden" data-field="mediaType" value="' +
        escapeAttr(mediaType) +
        '" />' +
        '<input type="file" data-portfolio-file accept="' +
        PORTFOLIO_MEDIA_ACCEPT +
        '" hidden />' +
        '<div class="portfolio-upload-actions">' +
        '<button type="button" class="btn-add btn-sm" data-portfolio-upload>选择图片 / 视频</button>' +
        '<button type="button" class="btn-ghost btn-sm" data-portfolio-clear-media>清除媒体</button>' +
        "</div></div>"
      );
    }

    return "";
  }

  function sectionModuleHtml(section, sectionIndex, helpers) {
    const escapeAttr = helpers.escapeAttr;
    const kind = section.kind;
    const meta = getSectionMeta(kind);
    const itemsHtml = (section.items || [])
      .map(function (item, i) {
        return sectionItemHtml(kind, item, i, helpers);
      })
      .join("");

    return (
      '<div class="section-module" data-section-kind="' +
      escapeAttr(kind) +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="section-module-header">' +
      '<label class="form-field form-field--grow"><span>模块标题</span>' +
      '<input type="text" data-field="section-title" value="' +
      escapeAttr(section.title || meta.defaultTitle) +
      '" placeholder="' +
      escapeAttr(meta.defaultTitle) +
      '" /></label>' +
      '<label class="form-field form-field--kind"><span>模块类型</span>' +
      '<select data-field="section-kind">' +
      sectionKindOptions(kind) +
      "</select></label>" +
      '<div class="section-module-actions">' +
      '<button type="button" class="btn-ghost btn-sm btn-move" data-move-section-up title="上移">↑</button>' +
      '<button type="button" class="btn-ghost btn-sm btn-move" data-move-section-down title="下移">↓</button>' +
      '<button type="button" class="btn-remove" data-remove-section>删除</button>' +
      "</div>" +
      "</div>" +
      '<div class="section-items">' +
      itemsHtml +
      "</div>" +
      '<button type="button" class="btn-add btn-sm" data-add-section-item>+ 添加' +
      meta.itemLabel +
      "</button>" +
      "</div>"
    );
  }

  function updateSectionMoveButtons(editor) {
    if (!editor) return;
    const modules = editor.querySelectorAll(".section-module");
    modules.forEach(function (mod, i) {
      const up = mod.querySelector("[data-move-section-up]");
      const down = mod.querySelector("[data-move-section-down]");
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === modules.length - 1;
    });
  }

  function moveSectionModule(mod, direction) {
    if (!mod || !mod.parentElement) return false;
    const parent = mod.parentElement;
    if (direction === "up") {
      const prev = mod.previousElementSibling;
      if (!prev || !prev.classList.contains("section-module")) return false;
      parent.insertBefore(mod, prev);
    } else if (direction === "down") {
      const next = mod.nextElementSibling;
      if (!next || !next.classList.contains("section-module")) return false;
      parent.insertBefore(next, mod);
    } else {
      return false;
    }
    updateSectionMoveButtons(parent);
    return true;
  }

  function applyModuleKind(mod, newKind, helpers) {
    const meta = getSectionMeta(newKind);
    mod.setAttribute("data-section-kind", newKind);
    const kindSelect = mod.querySelector('[data-field="section-kind"]');
    if (kindSelect) kindSelect.value = newKind;
    const container = mod.querySelector(".section-items");
    if (container) {
      container.innerHTML = sectionItemHtml(newKind, emptyItem(newKind), 0, helpers);
    }
    const addBtn = mod.querySelector("[data-add-section-item]");
    if (addBtn) addBtn.textContent = "+ 添加" + meta.itemLabel;
  }

  function fillSectionsEditor(editor, sections, helpers) {
    if (!editor) return;
    editor.innerHTML = (sections || [])
      .map(function (section, i) {
        return sectionModuleHtml(section, i, helpers);
      })
      .join("");
    updateSectionMoveButtons(editor);
  }

  function readItemFromEl(kind, el) {
    if (kind === "contact-list") {
      const label = el.querySelector('[data-field="label"]').value.trim();
      const value = el.querySelector('[data-field="value"]').value.trim();
      const href = el.querySelector('[data-field="href"]').value.trim();
      if (!label && !value) return null;
      const item = { label: label || "信息", value: value || "—" };
      if (href) item.href = href;
      return item;
    }
    if (kind === "text-blocks") {
      const label = el.querySelector('[data-field="label"]').value.trim();
      const content = el.querySelector('[data-field="content"]').value.trim();
      if (!label && !content) return null;
      return { label: label || "", content: content || "" };
    }
    if (kind === "timeline") {
      const period = el.querySelector('[data-field="period"]').value.trim();
      const datetime = el.querySelector('[data-field="datetime"]').value.trim();
      const company = el.querySelector('[data-field="company"]').value.trim();
      const role = el.querySelector('[data-field="role"]').value.trim();
      const desc = el.querySelector('[data-field="desc"]').value.trim();
      const link = el.querySelector('[data-field="link"]').value.trim();
      const image = el.querySelector('[data-field="image"]').value.trim();
      if (!period && !company && !role && !desc && !link && !image) return null;
      return { period, datetime, company, role, desc, link, image };
    }
    if (kind === "tags") {
      const label = el.querySelector('[data-field="label"]').value.trim();
      const value = el.querySelector('[data-field="value"]').value.trim();
      if (!parseTagValues(value).length) return null;
      return { label: label, value: value };
    }
    if (kind === "portfolio") {
      const title = el.querySelector('[data-field="title"]').value.trim();
      const desc = el.querySelector('[data-field="desc"]').value.trim();
      const link = el.querySelector('[data-field="link"]').value.trim();
      const mediaSrc = el.querySelector('[data-field="mediaSrc"]').value.trim();
      const mediaTypeRaw = el.querySelector('[data-field="mediaType"]').value.trim();
      const mediaType = mediaTypeRaw === "video" ? "video" : "image";
      if (!title && !desc && !link && !mediaSrc) return null;
      return { title, desc, link, mediaSrc, mediaType };
    }
    return null;
  }

  function readSectionsEditor(editor) {
    if (!editor) return [];
    const modules = editor.querySelectorAll(".section-module");
    const result = [];
    modules.forEach(function (mod) {
      const kindEl = mod.querySelector('[data-field="section-kind"]');
      const kind = kindEl ? kindEl.value : mod.getAttribute("data-section-kind");
      const titleEl = mod.querySelector('[data-field="section-title"]');
      const title = titleEl ? titleEl.value.trim() : "";
      const items = [];
      mod.querySelectorAll(".repeat-item[data-item-kind]").forEach(function (el) {
        const item = readItemFromEl(kind, el);
        if (item) items.push(item);
      });
      if (title || items.length) {
        result.push({
          kind: kind,
          title: title || getSectionMeta(kind).defaultTitle || "未命名",
          items: items,
        });
      }
    });
    return result;
  }

  function setItemImagePreview(itemEl, src, escapeAttrFn) {
    const wrap = itemEl.querySelector("[data-item-image-preview]");
    if (!wrap) return;
    wrap.innerHTML = imagePreviewHtml(src, "配图", escapeAttrFn);
  }

  function setPortfolioItemPreview(itemEl, src, mediaType, escapeAttr) {
    const wrap = itemEl.querySelector("[data-portfolio-preview]");
    if (!wrap) return;
    wrap.innerHTML = portfolioPreviewInnerHtml(src, mediaType, escapeAttr);
  }

  function bindSectionsEditor(editor, addBtn, kindSelect, helpers) {
    if (!editor) return;

    editor.addEventListener("click", function (ev) {
      const moveUp = ev.target.closest("[data-move-section-up]");
      if (moveUp) {
        const mod = moveUp.closest(".section-module");
        if (mod && moveSectionModule(mod, "up")) {
          helpers.showToast("已上移");
        }
        return;
      }

      const moveDown = ev.target.closest("[data-move-section-down]");
      if (moveDown) {
        const mod = moveDown.closest(".section-module");
        if (mod && moveSectionModule(mod, "down")) {
          helpers.showToast("已下移");
        }
        return;
      }

      const removeSection = ev.target.closest("[data-remove-section]");
      if (removeSection) {
        const mod = removeSection.closest(".section-module");
        if (mod) {
          mod.remove();
          updateSectionMoveButtons(editor);
        }
        return;
      }

      const removeItem = ev.target.closest("[data-remove-item]");
      if (removeItem) {
        const item = removeItem.closest(".repeat-item");
        if (item) item.remove();
        return;
      }

      const addItemBtn = ev.target.closest("[data-add-section-item]");
      if (addItemBtn) {
        const mod = addItemBtn.closest(".section-module");
        if (!mod) return;
        const kind = mod.getAttribute("data-section-kind");
        const container = mod.querySelector(".section-items");
        const index = container.querySelectorAll(".repeat-item").length;
        container.insertAdjacentHTML("beforeend", sectionItemHtml(kind, emptyItem(kind), index, helpers));
        return;
      }

      const imageUploadBtn = ev.target.closest("[data-item-image-upload]");
      if (imageUploadBtn) {
        const item = imageUploadBtn.closest(".repeat-item");
        const fileInput = item && item.querySelector("[data-item-image-file]");
        if (fileInput) fileInput.click();
        return;
      }

      const imageClearBtn = ev.target.closest("[data-item-image-clear]");
      if (imageClearBtn) {
        const item = imageClearBtn.closest(".repeat-item");
        if (!item) return;
        item.querySelector('[data-field="image"]').value = "";
        setItemImagePreview(item, "", helpers.escapeAttr);
        return;
      }

      const portfolioUploadBtn = ev.target.closest("[data-portfolio-upload]");
      if (portfolioUploadBtn) {
        const item = portfolioUploadBtn.closest(".repeat-item");
        const fileInput = item && item.querySelector("[data-portfolio-file]");
        if (fileInput) fileInput.click();
        return;
      }

      const portfolioClearBtn = ev.target.closest("[data-portfolio-clear-media]");
      if (portfolioClearBtn) {
        const item = portfolioClearBtn.closest(".repeat-item");
        if (!item) return;
        item.querySelector('[data-field="mediaSrc"]').value = "";
        item.querySelector('[data-field="mediaType"]').value = "image";
        setPortfolioItemPreview(item, "", "image", helpers.escapeAttr);
      }
    });

    editor.addEventListener("change", function (ev) {
      if (ev.target.matches("[data-item-image-file]")) {
        const fileInput = ev.target;
        const file = fileInput.files && fileInput.files[0];
        const item = fileInput.closest(".repeat-item");
        fileInput.value = "";
        if (!file || !item) return;
        helpers.showToast("正在处理图片…");
        helpers
          .compressImageFile(file, 900, 0.85)
          .then(function (dataUrl) {
            item.querySelector('[data-field="image"]').value = dataUrl;
            setItemImagePreview(item, dataUrl, helpers.escapeAttr);
            helpers.showToast("图片已就绪，记得保存");
          })
          .catch(function () {
            helpers.showToast("图片处理失败，请换较小的图片");
          });
        return;
      }

      if (ev.target.matches("[data-field=\"section-kind\"]")) {
        const mod = ev.target.closest(".section-module");
        if (!mod) return;
        const newKind = ev.target.value;
        if (newKind === mod.getAttribute("data-section-kind")) return;
        applyModuleKind(mod, newKind, helpers);
        helpers.showToast("已切换模块类型，请重新填写条目内容");
        return;
      }

      if (ev.target.matches("[data-portfolio-file]")) {
        const fileInput = ev.target;
        const file = fileInput.files && fileInput.files[0];
        const item = fileInput.closest(".repeat-item");
        fileInput.value = "";
        if (!file || !item) return;
        helpers.showToast("正在处理媒体…");
        helpers
          .processPortfolioMediaFile(file)
          .then(function (result) {
            item.querySelector('[data-field="mediaSrc"]').value = result.dataUrl;
            item.querySelector('[data-field="mediaType"]').value = result.mediaType;
            setPortfolioItemPreview(item, result.dataUrl, result.mediaType, helpers.escapeAttr);
            helpers.showToast("媒体已就绪，记得保存");
          })
          .catch(function () {
            helpers.showToast("处理失败：请使用 JPG/PNG/GIF/WebP/SVG 或 MP4/WebM/MOV");
          });
      }
    });

    if (addBtn && kindSelect) {
      addBtn.addEventListener("click", function () {
        const kind = kindSelect.value;
        const meta = getSectionMeta(kind);
        const index = editor.querySelectorAll(".section-module").length;
        editor.insertAdjacentHTML(
          "beforeend",
          sectionModuleHtml(
            { kind: kind, title: meta.defaultTitle, items: [emptyItem(kind)] },
            index,
            helpers
          )
        );
        updateSectionMoveButtons(editor);
      });
    }
  }

  global.CardSections = {
    SECTION_KINDS: SECTION_KINDS,
    mergeCardSections: mergeCardSections,
    renderCardSections: renderCardSections,
    fillSectionsEditor: fillSectionsEditor,
    readSectionsEditor: readSectionsEditor,
    bindSectionsEditor: bindSectionsEditor,
    emptyItem: emptyItem,
  };
})(window);
