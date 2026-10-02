(function () {
  "use strict";

  /* =========================================================
     Helpers
     ========================================================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var IMG = "../assets/img/";

  // Builds DOM safely. User data always goes in as text, never as HTML.
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k === "dataset") Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "disabled" || k === "checked" || k === "hidden" || k === "selected" || k === "value") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }
  function icon(name, cls) { return h("img", { src: IMG + name, alt: "", class: cls }); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }

  function when(iso) {
    if (!iso) return "never";
    var d = new Date(iso);
    var s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 7 * 86400) return Math.round(s / 86400) + " days ago";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fullDate(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- Toast ---------- */
  var toastEl = $(".js-toast");
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  /* ---------- API ---------- */
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch("/api/" + path, init).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (res.status === 401 && !opts.quiet) {
          showLogin("You were logged out. Please log in again.");
        }
        if (!res.ok) {
          var err = new Error((data && data.error) || "Something went wrong (" + res.status + ")");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------- Modal ---------- */
  function modal(o) {
    var root = $("#modal-root");
    var overlay = h("div", { class: "modal-overlay" });
    var box = h("div", {
      class: "modal" + (o.wide ? " modal--wide" : "") + (o.danger ? " modal--danger" : ""),
      role: "dialog", "aria-modal": "true", "aria-label": o.title,
    },
      h("h2", { class: "modal__title", text: o.title }),
      o.body,
      o.actions ? h("div", { class: "modal__actions" }, o.actions) : null
    );
    overlay.appendChild(box);
    root.appendChild(overlay);
    var prevFocus = document.activeElement;
    function onKey(e) { if (e.key === "Escape" && !o.locked) close(); }
    function close() {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (o.onClose) o.onClose();
    }
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay && !o.locked) close(); });
    setTimeout(function () {
      var f = box.querySelector("input:not([type=checkbox]), textarea, select") || box.querySelector("button");
      if (f) f.focus();
    }, 40);
    return { close: close, box: box };
  }

  function confirmBox(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      var m = modal({
        title: title,
        danger: danger,
        body: h("p", { class: "muted", text: message }),
        actions: [
          h("button", { class: "act", type: "button", text: "Cancel", onclick: function () { m.close(); } }),
          h("button", {
            class: "act " + (danger ? "act--danger" : "act--primary"), type: "button", text: okLabel || "Yes",
            onclick: function () { done = true; m.close(); },
          }),
        ],
        onClose: function () { resolve(done); },
      });
    });
  }

  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = on;
  }

  function errorBox(msg) {
    return h("div", { class: "panel" }, h("div", { class: "empty" }, icon("ender_pearl.png"), msg));
  }

  function randomPassword() {
    var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    var arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    for (var i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  /* =========================================================
     Theme
     ========================================================= */
  var themeToggles = $$(".js-theme-toggle");
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    themeToggles.forEach(function (x) { x.checked = t === "dark"; });
  }
  applyTheme(document.documentElement.dataset.theme || "dark");
  themeToggles.forEach(function (x) {
    x.addEventListener("change", function () {
      var t = x.checked ? "dark" : "light";
      applyTheme(t);
      try { localStorage.setItem("theme", t); } catch (e) {}
      if (current === "stats" && redrawCharts) redrawCharts();
    });
  });

  /* =========================================================
     Session state
     ========================================================= */
  var me = null;
  var catalog = [];
  var RANK = { owner: 3, admin: 2, moderator: 1 };
  var ROLE_NAMES = { owner: "Owner", admin: "Admin", moderator: "Moderator" };

  function can(p) { return !!me && (me.role === "owner" || me.perms.indexOf(p) >= 0); }
  function permLabel(p) {
    for (var i = 0; i < catalog.length; i++) {
      for (var j = 0; j < catalog[i].perms.length; j++) if (catalog[i].perms[j][0] === p) return catalog[i].perms[j][1];
    }
    return p;
  }
  function roleChip(role) { return h("span", { class: "chip-s chip-s--" + role, text: ROLE_NAMES[role] || role }); }
  function avatar(name, size) {
    return h("img", {
      src: "https://mc-heads.net/avatar/" + encodeURIComponent(name) + "/" + (size || 44),
      alt: "", loading: "lazy", width: size || 44, height: size || 44,
    });
  }

  /* =========================================================
     Login
     ========================================================= */
  var loginEl = $("#login");
  var appEl = $("#app");
  var loginForm = $("#login-form");
  var loginError = $("#login-error");

  function showLogin(msg) {
    me = null;
    appEl.hidden = true;
    loginEl.hidden = false;
    $("#modal-root").textContent = "";
    loginError.textContent = msg || "";
    setTimeout(function () { loginForm.username.focus(); }, 30);
  }

  $("[data-eye]").addEventListener("click", function (e) {
    var input = loginForm.password;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show";
  });

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = loginForm.querySelector("button[type=submit]");
    var u = loginForm.username.value.trim();
    var p = loginForm.password.value;
    if (!u || !p) { fail("Enter your username and password"); return; }
    busy(btn, true);
    loginError.textContent = "";
    api("auth/login", { method: "POST", body: { username: u, password: p }, quiet: true })
      .then(function () {
        loginForm.password.value = "";
        return boot();
      })
      .catch(function (err) { fail(err.message); })
      .then(function () { busy(btn, false); });
  });

  function fail(msg) {
    loginError.textContent = msg;
    loginError.classList.remove("shake");
    void loginError.offsetWidth;
    loginError.classList.add("shake");
  }

  $("#logout").addEventListener("click", function () {
    leaveCheck().then(function (ok) {
      if (!ok) return;
      leaveGuard = null;
      api("auth/logout", { method: "POST", quiet: true }).catch(function () {}).then(function () {
        showLogin("You logged out.");
      });
    });
  });

  /* =========================================================
     Sections and router
     ========================================================= */
  var SECTIONS = [
    { id: "notices", label: "Noticeboard", icon: "map.png", perm: "notices.view", render: renderNotices },
    { id: "editor", label: "Site Editor", icon: "diamond_pickaxe.png", perm: "content.view", render: renderEditor },
    { id: "stats", label: "Statistics", icon: "xp_bottle.png", perm: "stats.view", render: renderStats },
    { id: "team", label: "Roles Management", icon: "head_MHF_Steve.png", perm: "users.view", render: renderTeam },
    { id: "log", label: "Activity Log", icon: "compass.png", perm: "logs.view", render: renderLog },
    { id: "account", label: "My Account", icon: "golden_apple.png", render: renderAccount },
  ];
  var current = null;
  var leaveGuard = null;
  var redrawCharts = null;

  function visible() { return SECTIONS.filter(function (s) { return !s.perm || can(s.perm); }); }

  function leaveCheck() { return leaveGuard ? leaveGuard() : Promise.resolve(true); }

  function renderNav() {
    var nav = $("#nav");
    nav.textContent = "";
    visible().forEach(function (s) {
      nav.appendChild(h("a", {
        class: "nav-item" + (s.id === current ? " active" : ""), href: "#" + s.id, dataset: { id: s.id },
        "aria-current": s.id === current ? "page" : null,
      }, icon(s.icon), h("span", { text: s.label })));
    });
  }

  function go(id) {
    var list = visible();
    var sec = list.filter(function (s) { return s.id === id; })[0] || list[0];
    if (current && current !== sec.id) {
      return leaveCheck().then(function (ok) {
        if (!ok) { history.replaceState(null, "", "#" + current); return; }
        open(sec);
      });
    }
    open(sec);
  }

  function open(sec) {
    leaveGuard = null;
    redrawCharts = null;
    current = sec.id;
    if (location.hash !== "#" + sec.id) history.replaceState(null, "", "#" + sec.id);
    renderNav();
    $("#page-title").textContent = sec.label;
    var actions = $("#page-actions");
    actions.textContent = "";
    var view = $("#view");
    view.textContent = "";
    view.classList.remove("view");
    void view.offsetWidth;
    view.classList.add("view");
    view.appendChild(h("p", { class: "muted", text: "Loading..." }));
    Promise.resolve()
      .then(function () { return sec.render(view, actions); })
      .catch(function (err) {
        if (err && err.status === 401) return;
        view.textContent = "";
        view.appendChild(errorBox(err.message || "Could not load this section"));
      });
  }

  window.addEventListener("hashchange", function () {
    if (me) go(location.hash.slice(1));
  });
  window.addEventListener("beforeunload", function (e) {
    if (leaveGuard && editorHasChanges()) { e.preventDefault(); e.returnValue = ""; }
  });

  function boot() {
    return api("auth/me", { quiet: true }).then(function (d) {
      me = d.user;
      catalog = d.catalog;
      loginEl.hidden = true;
      appEl.hidden = false;
      var meBox = $("#me");
      meBox.textContent = "";
      meBox.appendChild(avatar(me.username, 36));
      meBox.appendChild(h("div", { style: "min-width:0" },
        h("div", { class: "me__name", text: me.display_name }),
        roleChip(me.role)));
      current = null;
      go(location.hash.slice(1));
    }, function (err) {
      showLogin(err.status === 401 ? "" : err.message);
    });
  }

  /* =========================================================
     NOTICEBOARD
     ========================================================= */
  function renderNotices(view, actions) {
    if (can("notices.create")) {
      actions.appendChild(h("button", {
        class: "btn btn--green btn--small", type: "button", onclick: function () { noticeForm(null); },
      }, h("span", { class: "btn__label", text: "New notice" }), h("span")));
    }
    return api("notices").then(function (d) {
      view.textContent = "";
      view.appendChild(h("p", { class: "note", style: "margin:0 0 16px" },
        "Live notices pop up as soon as someone opens the website. Visitors close them with the Understood! button."));
      if (!d.notices.length) {
        view.appendChild(h("div", { class: "panel" }, h("div", { class: "empty" }, icon("map.png"),
          "No notices yet." + (can("notices.create") ? " Post one and every visitor will see it." : ""))));
        return;
      }
      var list = h("div", { class: "notices" });
      d.notices.forEach(function (n) { list.appendChild(noticeCard(n)); });
      view.appendChild(list);
    });
  }

  function noticeCard(n) {
    var side = h("div", { class: "notice__side" });
    if (can("notices.toggle")) {
      var input = h("input", { type: "checkbox", checked: n.active, "aria-label": "Show on the website" });
      input.addEventListener("change", function () {
        input.disabled = true;
        api("notices/" + n.id, { method: "PATCH", body: { active: input.checked } })
          .then(function () {
            toast(input.checked ? "Notice is live on the website" : "Notice is hidden");
            go("notices");
          })
          .catch(function (err) { input.checked = !input.checked; toast(err.message); })
          .then(function () { input.disabled = false; });
      });
      side.appendChild(h("label", { class: "switch" }, input, h("span", { class: "switch__track" }), "Live"));
    }
    var btns = h("div", { class: "row" });
    if (can("notices.edit")) btns.appendChild(h("button", { class: "act act--small", type: "button", text: "Edit", onclick: function () { noticeForm(n); } }));
    if (can("notices.delete")) {
      btns.appendChild(h("button", {
        class: "act act--small act--danger", type: "button", text: "Delete",
        onclick: function () {
          confirmBox("Delete notice?", 'This removes "' + n.title + '" for good.', "Delete", true).then(function (ok) {
            if (!ok) return;
            api("notices/" + n.id, { method: "DELETE" }).then(function () { toast("Notice deleted"); go("notices"); }, function (e) { toast(e.message); });
          });
        },
      }));
    }
    side.appendChild(btns);

    return h("article", { class: "notice" + (n.active ? " is-live" : "") },
      h("div", { style: "min-width:0" },
        h("h3", { class: "notice__title", text: n.title }),
        h("div", { class: "notice__meta" },
          h("span", { class: "chip-s " + (n.active ? "chip-s--live" : "chip-s--off"), text: n.active ? "Live" : "Hidden" }),
          n.pinned ? h("span", { class: "chip-s chip-s--pin", text: "Pinned" }) : null,
          h("span", { text: n.frequency === "once" ? "Shows once per visitor" : "Shows on every visit" }),
          h("span", { text: "by " + (n.updated_by || n.created_by || "someone") + ", " + when(n.updated_at) })
        ),
        h("p", { class: "notice__body", text: n.body })
      ),
      side
    );
  }

  function noticeForm(n) {
    var isNew = !n;
    var title = h("input", { maxlength: 120, value: n ? n.title : "", placeholder: "Server restart tonight" });
    var body = h("textarea", { maxlength: 4000, placeholder: "Write your notice here. New lines are kept." });
    body.value = n ? n.body : "";
    var freq = h("select", {},
      h("option", { value: "always", text: "Every time they visit" }),
      h("option", { value: "once", text: "Only once per visitor" }));
    freq.value = n ? n.frequency : "always";
    var pinned = h("input", { type: "checkbox", checked: n ? n.pinned : false });
    var live = h("input", { type: "checkbox", checked: n ? n.active : true });
    var showLive = isNew || can("notices.toggle");

    // Live preview using the same styles as the real popup
    var pTitle = h("h3");
    var pDate = h("div", { class: "nb__date" });
    var pBody = h("p");
    var preview = h("div", { class: "nb-preview" },
      h("div", { class: "nb" },
        h("div", { class: "nb__head" }, icon("map.png"), h("h2", { text: "Noticeboard" })),
        h("div", { class: "nb__list" }, h("article", { class: "nb__item" }, pTitle, pDate, pBody)),
        h("div", { class: "nb__foot" }, h("span", { class: "btn btn--green nb__ok" }, h("span", { class: "btn__label", text: "Understood!" }), h("span")))
      ));
    function sync() {
      pTitle.textContent = title.value || "Your title";
      pBody.textContent = body.value || "Your notice text shows here.";
      pDate.textContent = (pinned.checked ? "Pinned · " : "") + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      pDate.parentNode.className = "nb__item" + (pinned.checked ? " nb__item--pinned" : "");
    }
    [title, body, pinned].forEach(function (x) { x.addEventListener("input", sync); x.addEventListener("change", sync); });
    sync();

    var saveBtn = h("button", { class: "act act--primary", type: "button", text: isNew ? "Post notice" : "Save changes" });
    var m = modal({
      title: isNew ? "New notice" : "Edit notice",
      wide: true,
      body: h("div", { class: "notice-form" },
        h("div", {},
          h("label", { class: "field" }, h("span", { text: "Title" }), title),
          h("label", { class: "field" }, h("span", { text: "Text" }), body),
          h("label", { class: "field" }, h("span", { text: "How often it pops up" }), freq),
          h("label", { class: "check" }, pinned, "Pin to the top"),
          showLive ? h("label", { class: "check" }, live, "Show on the website") : null
        ),
        h("div", {}, h("div", { class: "field" }, h("span", { text: "Preview" })), h("div", { style: "margin-top:6px" }, preview))
      ),
      actions: [
        h("button", { class: "act", type: "button", text: "Cancel", onclick: function () { m.close(); } }),
        saveBtn,
      ],
    });
    saveBtn.addEventListener("click", function () {
      var payload = { title: title.value, body: body.value, frequency: freq.value, pinned: pinned.checked };
      if (isNew || (showLive && live.checked !== n.active)) payload.active = live.checked;
      busy(saveBtn, true);
      var req = isNew
        ? api("notices", { method: "POST", body: payload })
        : api("notices/" + n.id, { method: "PATCH", body: payload });
      req.then(function () {
        m.close();
        toast(isNew ? (payload.active ? "Notice posted. It is live now." : "Notice saved as hidden.") : "Notice updated");
        go("notices");
      }, function (e) { toast(e.message); busy(saveBtn, false); });
    });
  }

  /* =========================================================
     SITE EDITOR
     ========================================================= */
  var PART_NAMES = {
    nav: "Top menu", brand: "Logo", hero: "Top of page", live: "Live server info", about: "Who Are We",
    features: "Features", feature1: "Feature 1", feature2: "Feature 2", feature3: "Feature 3", feature4: "Feature 4",
    join: "How to join", step1: "Step 1", step2: "Step 2", step3: "Step 3", discord: "Discord", footer: "Footer",
  };
  function keyLabel(k) {
    var i = k.indexOf(".");
    var sec = i > 0 ? k.slice(0, i) : k;
    var part = i > 0 ? k.slice(i + 1).replace(/_/g, " ") : "";
    return (PART_NAMES[sec] || sec) + (part ? ": " + part : "");
  }

  var editorPending = {};
  function editorHasChanges() { return Object.keys(editorPending).length > 0; }

  function renderEditor(view, actions) {
    var canText = can("content.edit_text");
    var canImg = can("content.edit_images");
    var canRevert = can("content.revert");
    editorPending = {};
    var selectedKey = null;
    var editing = null;
    var frame, doc, win;

    leaveGuard = function () {
      if (!editorHasChanges()) return Promise.resolve(true);
      return confirmBox("Leave without saving?", "You have changes that are not saved yet. They will be lost.", "Leave", true);
    };

    // ---- toolbar ----
    var selLabel = h("div", { class: "editor-bar__sel", text: "Click something on the page to edit it." });
    var revertBtn = h("button", { class: "act act--small", type: "button", text: "Undo to original", disabled: true, hidden: !canRevert });
    var count = h("span", { class: "pending-count", hidden: true });
    var discardBtn = h("button", { class: "act act--small", type: "button", text: "Discard", disabled: true });
    var saveBtn = h("button", { class: "btn btn--green btn--small", type: "button", disabled: true },
      h("span", { class: "btn__label", text: "Save Changes" }), h("span"));
    var deskBtn = h("button", { type: "button", class: "on", text: "Desktop" });
    var phoneBtn = h("button", { type: "button", text: "Phone" });
    var wrap = h("div", { class: "frame-wrap" });

    deskBtn.onclick = function () { wrap.classList.remove("phone"); deskBtn.classList.add("on"); phoneBtn.classList.remove("on"); };
    phoneBtn.onclick = function () { wrap.classList.add("phone"); phoneBtn.classList.add("on"); deskBtn.classList.remove("on"); };

    var bar = h("div", { class: "editor-bar" }, selLabel, revertBtn, h("div", { class: "seg" }, deskBtn, phoneBtn), count, discardBtn, saveBtn);

    var help = [];
    if (canText) help.push("click any text to change it (press Enter to finish, Esc to cancel)");
    if (canImg) help.push("click any picture to upload a new one");
    view.textContent = "";
    view.appendChild(h("p", { class: "note editor-help" },
      help.length
        ? "On the page below, " + help.join(", and ") + ". Nothing goes live until you press Save Changes."
        : "You can look at the site here, but you do not have permission to edit texts or images."));
    view.appendChild(bar);
    view.appendChild(wrap);
    var editsBox = h("div", { class: "panel edits-table" });
    view.appendChild(editsBox);

    frame = h("iframe", { src: "/index.html?edit=1", title: "Website editor" });
    wrap.appendChild(frame);
    frame.addEventListener("load", setupFrame);

    function updateBar() {
      var n = Object.keys(editorPending).length;
      count.hidden = !n;
      count.textContent = n + " unsaved";
      saveBtn.disabled = !n;
      discardBtn.disabled = !n;
      var nav = $('.nav-item[data-id="editor"]');
      if (nav) {
        var badge = $(".nav-item__badge", nav);
        if (n && !badge) nav.appendChild(h("span", { class: "nav-item__badge", text: String(n) }));
        else if (badge) { if (n) badge.textContent = n; else badge.remove(); }
      }
      if (selectedKey) {
        var saved = win && win.__cms.current()[selectedKey];
        revertBtn.disabled = !(selectedKey in editorPending || saved);
      }
    }

    function els(key) {
      return $$('[data-edit="' + key + '"], [data-edit-img="' + key + '"]', doc);
    }
    function baseline(key, kind) {
      var cur = win.__cms.current()[key];
      if (cur) return cur.v;
      return kind === "img" ? win.__cms.defaults.img[key] : win.__cms.defaults.text[key];
    }
    function original(key, kind) {
      return kind === "img" ? win.__cms.defaults.img[key] : win.__cms.defaults.text[key];
    }
    function mark(key) {
      els(key).forEach(function (el) { el.classList.toggle("cms-changed", key in editorPending); });
      updateBar();
    }
    function select(key, kind) {
      $$(".cms-sel", doc).forEach(function (el) { el.classList.remove("cms-sel"); });
      selectedKey = key;
      selectedKind = kind;
      els(key).forEach(function (el) { el.classList.add("cms-sel"); });
      selLabel.textContent = "";
      selLabel.appendChild(document.createTextNode("Selected: "));
      selLabel.appendChild(h("b", { text: keyLabel(key) }));
      selLabel.appendChild(document.createTextNode(kind === "img" ? " (picture)" : " (text)"));
      updateBar();
    }
    var selectedKind = null;

    function norm(html) { return String(html || "").replace(/\s+/g, " ").replace(/(<br>\s*)+$/i, "").trim(); }

    function setText(key, html) {
      if (norm(html) === norm(baseline(key, "html"))) delete editorPending[key];
      else editorPending[key] = { kind: "html", value: norm(html) };
      els(key).forEach(function (el) { if (el.getAttribute("data-edit") === key && el !== editing) el.innerHTML = html; });
      mark(key);
    }

    function startEdit(el) {
      var key = el.getAttribute("data-edit");
      editing = el;
      el._before = el.innerHTML;
      var rich = !!el.querySelector("b, strong, i, em, br");
      el.setAttribute("contenteditable", rich ? "true" : "plaintext-only");
      if (!rich && el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
      el.focus();
      var r = doc.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      var s = win.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      el.addEventListener("blur", onBlur);
      select(key, "html");
    }
    function onBlur() { finishEdit(false); }
    function finishEdit(cancel) {
      var el = editing;
      if (!el) return;
      editing = null;
      el.removeEventListener("blur", onBlur);
      el.removeAttribute("contenteditable");
      if (cancel) { el.innerHTML = el._before; return; }
      if (!el.textContent.trim()) {
        el.innerHTML = el._before;
        toast("Text can not be empty");
        return;
      }
      var html = norm(el.innerHTML);
      if (html !== norm(el._before)) setText(el.getAttribute("data-edit"), html);
    }

    var filePick = $("#file-pick");
    function pickImage(key) {
      filePick.value = "";
      filePick.onchange = function () {
        var file = filePick.files && filePick.files[0];
        if (!file) return;
        if (["image/png", "image/jpeg", "image/webp", "image/gif"].indexOf(file.type) < 0) { toast("Use a PNG, JPG, GIF or WEBP image"); return; }
        if (file.size > 3 * 1024 * 1024) { toast("That image is too big. Keep it under 3 MB."); return; }
        var reader = new FileReader();
        reader.onload = function () {
          editorPending[key] = { kind: "img", dataUrl: reader.result, name: file.name };
          els(key).forEach(function (img) { if (img.getAttribute("data-edit-img") === key) img.src = reader.result; });
          mark(key);
          toast("Picture swapped. Press Save Changes to make it live.");
        };
        reader.readAsDataURL(file);
      };
      filePick.click();
    }

    revertBtn.onclick = function () {
      if (!selectedKey) return;
      var key = selectedKey;
      var kind = selectedKind;
      var saved = win.__cms.current()[key];
      if (saved) editorPending[key] = null;
      else delete editorPending[key];
      var orig = original(key, kind);
      els(key).forEach(function (el) {
        if (kind === "img" && el.getAttribute("data-edit-img") === key) el.src = orig;
        if (kind !== "img" && el.getAttribute("data-edit") === key) el.innerHTML = orig;
      });
      mark(key);
      toast(saved ? "Back to the original. Press Save Changes to make it live." : "Change removed");
    };

    discardBtn.onclick = function () {
      confirmBox("Discard changes?", "All unsaved edits on this page will be thrown away.", "Discard", true).then(function (ok) {
        if (!ok) return;
        editorPending = {};
        updateBar();
        frame.contentWindow.location.reload();
      });
    };

    saveBtn.onclick = function () {
      if (editing) finishEdit(false);
      var keys = Object.keys(editorPending);
      if (!keys.length) return;
      busy(saveBtn, true);
      var changes = {};
      var chain = Promise.resolve();
      keys.forEach(function (k) {
        var p = editorPending[k];
        if (p && p.kind === "img") {
          chain = chain.then(function () {
            return api("media", { method: "POST", body: { name: p.name, data: p.dataUrl } }).then(function (r) {
              changes[k] = { kind: "img", value: r.url };
            });
          });
        } else {
          changes[k] = p ? { kind: "html", value: p.value } : null;
        }
      });
      chain
        .then(function () { return api("content", { method: "PUT", body: { changes: changes } }); })
        .then(function (r) {
          var map = Object.assign({}, win.__cms.current());
          Object.keys(r.saved).forEach(function (k) {
            if (r.saved[k] === null) delete map[k];
            else map[k] = r.saved[k];
          });
          win.__cms.apply(map);
          editorPending = {};
          $$(".cms-changed", doc).forEach(function (el) { el.classList.remove("cms-changed"); });
          updateBar();
          loadEdits();
          toast("Saved! Visitors will see it within about 10 seconds.");
        })
        .catch(function (e) { toast(e.message); })
        .then(function () { busy(saveBtn, !editorHasChanges()); });
    };

    function setupFrame() {
      doc = frame.contentDocument;
      win = frame.contentWindow;
      if (!doc || !win.__cms) { toast("Could not open the site in the editor"); return; }
      editorPending = {};
      updateBar();
      var style = doc.createElement("style");
      style.textContent = [
        "[data-edit],[data-edit-img]{outline:2px dashed transparent;outline-offset:3px;transition:outline-color .12s}",
        "body.cms-text [data-edit]:hover,body.cms-img [data-edit-img]:hover{outline-color:#30d878;cursor:pointer}",
        "[data-edit-img]{pointer-events:auto!important}",
        ".floater,.cube,.title__tag,.about__stamp,.discord__creeper,.login__logo{animation:none!important}",
        ".cms-changed{outline:3px dashed #ffd23f!important}",
        ".cms-sel{outline:3px solid #c0f090!important}",
        "[contenteditable]{outline:3px solid #c0f090!important;cursor:text!important;-webkit-user-modify:read-write}",
        ".toast{display:none!important}",
      ].join("\n");
      doc.head.appendChild(style);
      if (canText) doc.body.classList.add("cms-text");
      if (canImg) doc.body.classList.add("cms-img");

      doc.addEventListener("click", function (e) {
        var t = e.target;
        if (editing && editing.contains(t)) return;
        e.preventDefault();
        e.stopPropagation();
        if (editing) finishEdit(false);
        var img = t.closest("[data-edit-img]");
        var txt = t.closest("[data-edit]");
        if (img) {
          var k = img.getAttribute("data-edit-img");
          select(k, "img");
          if (canImg) pickImage(k);
          else toast("You do not have permission to change pictures");
          return;
        }
        if (txt) {
          if (canText) startEdit(txt);
          else { select(txt.getAttribute("data-edit"), "html"); toast("You do not have permission to change texts"); }
        }
      }, true);
      doc.addEventListener("submit", function (e) { e.preventDefault(); }, true);
      doc.addEventListener("auxclick", function (e) { e.preventDefault(); }, true);
      doc.addEventListener("keydown", function (e) {
        if (!editing) return;
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editing.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); finishEdit(true); }
      }, true);
      doc.addEventListener("paste", function (e) {
        if (!editing || editing.getAttribute("contenteditable") !== "true") return;
        e.preventDefault();
        var text = (e.clipboardData || win.clipboardData).getData("text/plain");
        doc.execCommand("insertText", false, text.replace(/\s+/g, " "));
      }, true);
    }

    function loadEdits() {
      return api("content").then(function (d) {
        editsBox.textContent = "";
        editsBox.appendChild(h("h2", { class: "panel__title", text: "Saved edits (" + d.content.length + ")" }));
        if (!d.content.length) {
          editsBox.appendChild(h("p", { class: "muted", text: "The website still shows the original texts and pictures." }));
          return;
        }
        var tbody = h("tbody");
        d.content.forEach(function (row) {
          var preview = row.kind === "img"
            ? h("img", { src: row.value, alt: "", style: "width:36px;height:36px;object-fit:contain;image-rendering:pixelated" })
            : h("span", { text: stripTags(row.value).slice(0, 90) });
          tbody.appendChild(h("tr", {},
            h("td", {}, h("b", { text: keyLabel(row.key) })),
            h("td", {}, preview),
            h("td", { text: row.updated_by || "" }),
            h("td", { class: "log-when", text: when(row.updated_at), title: fullDate(row.updated_at) }),
            h("td", {}, canRevert ? h("button", {
              class: "act act--small", type: "button", text: "Undo",
              onclick: function () {
                confirmBox("Undo this edit?", '"' + keyLabel(row.key) + '" will go back to the original right away.', "Undo").then(function (ok) {
                  if (!ok) return;
                  var c = {};
                  c[row.key] = null;
                  api("content", { method: "PUT", body: { changes: c } }).then(function () {
                    toast("Back to the original");
                    var map = Object.assign({}, win.__cms.current());
                    delete map[row.key];
                    delete editorPending[row.key];
                    win.__cms.apply(map);
                    mark(row.key);
                    loadEdits();
                  }, function (e) { toast(e.message); });
                });
              },
            }) : null)
          ));
        });
        editsBox.appendChild(h("div", { class: "table-wrap" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "Part" }), h("th", { text: "Now shows" }), h("th", { text: "By" }), h("th", { text: "When" }), h("th"))),
          tbody)));
      });
    }

    return loadEdits();
  }

  function stripTags(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html).replace(/<[^>]*>/g, " ");
    return d.textContent.replace(/\s+/g, " ").trim();
  }

  /* =========================================================
     STATISTICS
     ========================================================= */
  var METRICS = [
    ["visitor", "Visitors", "Different people per day", "head_MHF_Steve.png"],
    ["page_view", "Page views", "Every time the site opens", "map.png"],
    ["discord_click", "Discord clicks", "Any Discord button or link", "emerald.png"],
    ["ip_copy", "IP copies", "Copy IP buttons and address", "diamond.png"],
    ["port_copy", "Port copies", "Copy Port button", "gold_ingot.png"],
    ["join_guide_click", "How to join clicks", "The How to join button", "compass.png"],
    ["notice_ack", "Notices read", "Understood! clicks", "xp_bottle.png"],
  ];
  var statsDays = 30;
  var statsTable = false;

  function renderStats(view, actions) {
    var seg = h("div", { class: "seg" });
    [7, 30, 90, 365].forEach(function (d) {
      seg.appendChild(h("button", {
        type: "button", class: d === statsDays ? "on" : "", text: d === 365 ? "1 year" : d + " days",
        onclick: function () { statsDays = d; go("stats"); open(SECTIONS[2]); },
      }));
    });
    actions.appendChild(seg);
    actions.appendChild(h("button", {
      class: "act", type: "button", text: statsTable ? "Show charts" : "Show table",
      onclick: function () { statsTable = !statsTable; open(SECTIONS[2]); },
    }));
    if (can("stats.reset")) {
      actions.appendChild(h("button", {
        class: "act act--danger", type: "button", text: "Reset",
        onclick: function () {
          confirmBox("Reset all statistics?", "Every number and chart goes back to zero. This can not be undone.", "Reset", true).then(function (ok) {
            if (!ok) return;
            api("stats", { method: "DELETE" }).then(function () { toast("Statistics reset"); open(SECTIONS[2]); }, function (e) { toast(e.message); });
          });
        },
      }));
    }

    return api("stats?days=" + statsDays).then(function (d) {
      view.textContent = "";
      var rangeName = statsDays === 365 ? "last year" : "last " + statsDays + " days";
      var kpis = h("div", { class: "kpis" });
      METRICS.forEach(function (m) {
        var total = d.series[m[0]].reduce(function (a, b) { return a + b; }, 0);
        kpis.appendChild(h("div", { class: "kpi" },
          h("div", { class: "kpi__label" }, icon(m[3]), m[1]),
          h("div", { class: "kpi__num", text: fmt(total) }),
          h("div", { class: "kpi__sub", text: rangeName + " · " + fmt(d.allTime[m[0]]) + " all time" })));
      });
      view.appendChild(kpis);

      if (statsTable) {
        var tbody = h("tbody");
        for (var i = d.dates.length - 1; i >= 0; i--) {
          var tr = h("tr", {}, h("td", { text: shortDate(d.dates[i], true) }));
          METRICS.forEach(function (m) { tr.appendChild(h("td", { class: "num", text: fmt(d.series[m[0]][i]) })); });
          tbody.appendChild(tr);
        }
        var head = h("tr", {}, h("th", { text: "Day" }));
        METRICS.forEach(function (m) { head.appendChild(h("th", { class: "num", text: m[1] })); });
        view.appendChild(h("div", { class: "panel", style: "margin-top:18px" },
          h("div", { class: "table-wrap" }, h("table", { class: "table" }, h("thead", {}, head), tbody))));
        return;
      }

      var grid = h("div", { class: "charts" });
      var charts = [];
      METRICS.forEach(function (m) {
        var box = h("div", { class: "chart" });
        grid.appendChild(h("div", { class: "chart-card" },
          h("h3", { text: m[1] }),
          h("div", { class: "chart-sub", text: m[2] }),
          box));
        charts.push([box, d.series[m[0]]]);
      });
      view.appendChild(grid);
      redrawCharts = function () { charts.forEach(function (c) { lineChart(c[0], d.dates, c[1]); }); };
      requestAnimationFrame(redrawCharts);
      var ro = new ResizeObserver(function () {
        clearTimeout(ro._t);
        ro._t = setTimeout(function () { if (current === "stats" && redrawCharts) redrawCharts(); }, 120);
      });
      ro.observe(grid);
    });
  }

  function shortDate(iso, withYear) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  var SVG = "http://www.w3.org/2000/svg";
  function s(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // One metric per chart, so every chart has one line and one y axis.
  function lineChart(box, dates, vals) {
    box.textContent = "";
    var W = Math.max(260, box.clientWidth);
    var H = 170, pl = 38, pr = 40, pt = 12, pb = 24;
    var n = vals.length;
    var max = niceMax(Math.max.apply(null, vals));
    var x = function (i) { return pl + (W - pl - pr) * (n === 1 ? 0.5 : i / (n - 1)); };
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img" });
    svg.setAttribute("aria-label", "Line chart, " + fmt(vals.reduce(function (a, b) { return a + b; }, 0)) + " in total");

    [0, max / 2, max].forEach(function (t) {
      svg.appendChild(s("line", { class: "grid-line", x1: pl, x2: W - pr, y1: y(t), y2: y(t) }));
      var label = s("text", { class: "axis-text", x: pl - 8, y: y(t) + 4, "text-anchor": "end" });
      label.textContent = fmt(t);
      svg.appendChild(label);
    });
    var d0 = s("text", { class: "axis-text", x: pl, y: H - 6, "text-anchor": "start" });
    d0.textContent = shortDate(dates[0]);
    var d1 = s("text", { class: "axis-text", x: W - pr, y: H - 6, "text-anchor": "end" });
    d1.textContent = shortDate(dates[n - 1]);
    svg.appendChild(d0);
    svg.appendChild(d1);

    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); });
    svg.appendChild(s("path", { class: "area", d: "M" + x(0) + "," + y(0) + " L" + pts.join(" L") + " L" + x(n - 1) + "," + y(0) + " Z" }));
    svg.appendChild(s("path", { class: "line", d: "M" + pts.join(" L") }));
    svg.appendChild(s("circle", { class: "dot", cx: x(n - 1), cy: y(vals[n - 1]), r: 4 }));
    var end = s("text", { class: "end-text", x: x(n - 1) + 8, y: y(vals[n - 1]) + 4 });
    end.textContent = fmt(vals[n - 1]);
    svg.appendChild(end);

    var cross = s("line", { class: "cross", y1: pt, y2: H - pb, x1: -10, x2: -10 });
    var hoverDot = s("circle", { class: "dot", r: 5, cx: -10, cy: -10 });
    svg.appendChild(cross);
    svg.appendChild(hoverDot);
    var hit = s("rect", { x: pl, y: 0, width: W - pl - pr, height: H, fill: "transparent" });
    svg.appendChild(hit);

    var tip = h("div", { class: "chart-tip" });
    box.appendChild(svg);
    box.appendChild(tip);

    function show(e) {
      var r = svg.getBoundingClientRect();
      var px = (e.clientX - r.left) * (W / r.width);
      var i = Math.round(((px - pl) / (W - pl - pr)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      hoverDot.setAttribute("cx", x(i));
      hoverDot.setAttribute("cy", y(vals[i]));
      tip.textContent = "";
      tip.appendChild(h("b", { text: fmt(vals[i]) }));
      tip.appendChild(document.createTextNode("  " + shortDate(dates[i], true)));
      tip.classList.add("on");
      var left = x(i) * (r.width / W) + 12;
      if (left + tip.offsetWidth > r.width) left = x(i) * (r.width / W) - tip.offsetWidth - 12;
      tip.style.left = left + "px";
    }
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", function () {
      tip.classList.remove("on");
      cross.setAttribute("x1", -10);
      cross.setAttribute("x2", -10);
      hoverDot.setAttribute("cx", -10);
    });
  }

  /* =========================================================
     ROLES MANAGEMENT (team + roles)
     ========================================================= */
  var teamTab = "members";

  function renderTeam(view, actions) {
    return api("users").then(function (d) {
      view.textContent = "";
      var tabs = h("div", { class: "seg tabs" },
        h("button", { type: "button", class: teamTab === "members" ? "on" : "", text: "Members", onclick: function () { teamTab = "members"; open(SECTIONS[3]); } }),
        h("button", { type: "button", class: teamTab === "roles" ? "on" : "", text: "Roles", onclick: function () { teamTab = "roles"; open(SECTIONS[3]); } }));
      view.appendChild(tabs);
      if (teamTab === "roles") return renderRoles(view, d);

      if (can("users.create")) {
        actions.appendChild(h("button", {
          class: "btn btn--green btn--small", type: "button", onclick: function () { addMember(); },
        }, h("span", { class: "btn__label", text: "Add member" }), h("span")));
      }

      var list = h("div", { class: "members" });
      d.owners.forEach(function (o) {
        list.appendChild(h("div", { class: "member" },
          avatar(o.username),
          h("div", {}, h("div", { class: "member__name", text: o.username }), h("div", { class: "member__sub", text: "@" + o.username + " · can do everything" })),
          h("div", { class: "member__right" }, roleChip("owner"))));
      });
      d.users.forEach(function (u) {
        var manage = canManage(u);
        var custom = Object.keys(u.overrides || {}).length;
        var row = h(manage ? "button" : "div", {
          class: "member" + (u.disabled ? " is-disabled" : ""), type: manage ? "button" : null,
          onclick: manage ? function () { editMember(u, d); } : null,
        },
          avatar(u.username),
          h("div", {},
            h("div", { class: "member__name", text: u.display_name }),
            h("div", { class: "member__sub", text: "@" + u.username + " · last login " + when(u.last_login) })),
          h("div", { class: "member__right" },
            u.disabled ? h("span", { class: "chip-s chip-s--disabled", text: "Disabled" }) : null,
            custom ? h("span", { class: "chip-s", text: custom + " custom" }) : null,
            roleChip(u.role)));
        list.appendChild(row);
      });
      if (!d.users.length) {
        list.appendChild(h("div", { class: "panel" }, h("div", { class: "empty" }, icon("head_MHF_Alex.png"),
          "No admins or moderators yet." + (can("users.create") ? " Add one with the Add member button." : ""))));
      }
      view.appendChild(list);
    });
  }

  function canManage(u) {
    if (RANK[me.role] <= RANK[u.role]) return false;
    if (!me.owner && me.id === u.id) return false;
    return ["users.edit", "users.permissions", "users.reset_password", "users.delete"].some(can);
  }
  function lowerRoles() {
    return ["admin", "moderator"].filter(function (r) { return RANK[r] < RANK[me.role]; });
  }
  function canTouchPerm(p) { return me.role === "owner" || me.perms.indexOf(p) >= 0; }

  function passwordField(label, initial) {
    var input = h("input", { type: "text", value: initial || "", autocomplete: "new-password", maxlength: 200 });
    var gen = h("button", { class: "act act--small", type: "button", text: "Make one", onclick: function () { input.value = randomPassword(); } });
    return {
      input: input,
      el: h("label", { class: "field" }, h("span", { text: label }), h("div", { class: "row" }, h("div", { class: "grow" }, input), gen),
        h("small", { text: "At least 8 characters. Send it to them privately." })),
    };
  }

  function addMember() {
    var username = h("input", { maxlength: 24, placeholder: "e.g. Ramesh_MC", autocomplete: "off" });
    var display = h("input", { maxlength: 40, placeholder: "Shown in the panel" });
    var role = h("select", {});
    lowerRoles().forEach(function (r) { role.appendChild(h("option", { value: r, text: ROLE_NAMES[r] })); });
    var pw = passwordField("Password", randomPassword());
    var create = h("button", { class: "act act--primary", type: "button", text: "Create account" });
    var m = modal({
      title: "Add member",
      body: h("div", {},
        h("label", { class: "field" }, h("span", { text: "Username" }), username, h("small", { text: "They log in with this. Letters, numbers, dots, dashes and underscores." })),
        h("label", { class: "field" }, h("span", { text: "Display name" }), display),
        h("label", { class: "field" }, h("span", { text: "Role" }), role, h("small", { text: "They get the role's permissions. You can fine tune them after." })),
        pw.el),
      actions: [h("button", { class: "act", type: "button", text: "Cancel", onclick: function () { m.close(); } }), create],
    });
    create.addEventListener("click", function () {
      busy(create, true);
      var body = { username: username.value.trim(), display_name: display.value.trim(), role: role.value, password: pw.input.value };
      api("users", { method: "POST", body: body }).then(function () {
        m.close();
        var copyBtn = h("button", {
          class: "act act--primary", type: "button", text: "Copy login",
          onclick: function () {
            navigator.clipboard.writeText("Admin panel: https://admin.berojgar.fun\nUsername: " + body.username + "\nPassword: " + body.password)
              .then(function () { toast("Copied"); }, function () { toast("Could not copy"); });
          },
        });
        var done = modal({
          title: "Account created",
          body: h("div", {},
            h("p", { class: "muted", text: "Send these to " + (body.display_name || body.username) + " privately. The password is not shown again." }),
            h("div", { class: "note code" }, "Username: " + body.username, h("br"), "Password: " + body.password)),
          actions: [copyBtn, h("button", { class: "act", type: "button", text: "Done", onclick: function () { done.close(); } })],
        });
        open(SECTIONS[3]);
      }, function (e) { toast(e.message); busy(create, false); });
    });
  }

  function triControl(state, disabled, onChange) {
    var wrap = h("div", { class: "tri", role: "group" });
    [["deny", "✕", "Off for this person"], ["inherit", "/", "Use the role setting"], ["allow", "✓", "On for this person"]].forEach(function (o) {
      var b = h("button", {
        type: "button", text: o[1], title: o[2], "aria-label": o[2], dataset: { v: o[0] },
        class: state === o[0] ? "on" : "", disabled: disabled, "aria-pressed": state === o[0] ? "true" : "false",
        onclick: function () {
          $$("button", wrap).forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
          b.classList.add("on");
          b.setAttribute("aria-pressed", "true");
          onChange(o[0]);
        },
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function editMember(u, data) {
    var body = h("div", {});
    var payload = {};
    var rolePerms = data.roles;
    var overrides = Object.assign({}, u.overrides || {});
    var save = h("button", { class: "act act--primary", type: "button", text: "Save changes" });

    body.appendChild(h("div", { class: "member", style: "box-shadow:none;margin-top:14px" },
      avatar(u.username),
      h("div", {}, h("div", { class: "member__name", text: u.display_name }), h("div", { class: "member__sub", text: "@" + u.username + " · added by " + (u.created_by || "unknown") + " " + when(u.created_at) })),
      h("div", { class: "member__right" }, roleChip(u.role))));

    var roleSel = null;
    if (can("users.edit")) {
      var name = h("input", { maxlength: 40, value: u.display_name });
      name.addEventListener("input", function () { payload.display_name = name.value; });
      roleSel = h("select", {});
      lowerRoles().forEach(function (r) { roleSel.appendChild(h("option", { value: r, text: ROLE_NAMES[r], selected: r === u.role })); });
      roleSel.addEventListener("change", function () { payload.role = roleSel.value; drawPerms(); });
      var enabled = h("input", { type: "checkbox", checked: !u.disabled });
      enabled.addEventListener("change", function () { payload.disabled = !enabled.checked; });
      body.appendChild(h("div", { class: "modal__section" },
        h("h3", { text: "Profile" }),
        h("label", { class: "field" }, h("span", { text: "Display name" }), name),
        h("label", { class: "field" }, h("span", { text: "Role" }), roleSel),
        h("label", { class: "switch", style: "margin-top:16px" }, enabled, h("span", { class: "switch__track" }), "Account is active (turn off to block login)")));
    }

    var permsBox = h("div", {});
    function drawPerms() {
      permsBox.textContent = "";
      var role = (roleSel && roleSel.value) || u.role;
      var base = rolePerms[role] || [];
      catalog.forEach(function (g) {
        var group = h("div", { class: "perm-group" }, h("h4", { text: g.group }));
        g.perms.forEach(function (pp) {
          var p = pp[0];
          var state = overrides[p] || "inherit";
          var fromRole = base.indexOf(p) >= 0;
          var nowEl = h("span", { class: "perm-row__now" });
          function paint() {
            var st = overrides[p] || "inherit";
            var on = st === "allow" || (st === "inherit" && fromRole);
            nowEl.textContent = (on ? "On" : "Off") + (st === "inherit" ? " (from role)" : " (custom)");
            nowEl.className = "perm-row__now " + (on ? "on" : "off");
          }
          paint();
          group.appendChild(h("div", { class: "perm-row" },
            h("div", {}, h("span", { class: "perm-row__label", text: pp[1] }), h("span", { class: "perm-row__code", text: p }), nowEl),
            triControl(state, !canTouchPerm(p), function (v) {
              if (v === "inherit") delete overrides[p];
              else overrides[p] = v;
              payload.overrides = overrides;
              paint();
            })));
        });
        permsBox.appendChild(group);
      });
    }
    if (can("users.permissions")) {
      body.appendChild(h("div", { class: "modal__section" },
        h("h3", { text: "Permissions for this person" }),
        h("p", { class: "muted small", text: "✓ turns a permission on just for them, ✕ turns it off just for them, / follows their role. Greyed out ones are permissions you do not have yourself." }),
        permsBox));
      drawPerms();
    }

    if (can("users.reset_password")) {
      var pw = passwordField("New password", "");
      var resetBtn = h("button", {
        class: "act", type: "button", text: "Reset password",
        onclick: function () {
          if (pw.input.value.length < 8) { toast("Password must be at least 8 characters"); return; }
          busy(resetBtn, true);
          api("users/" + u.id, { method: "PATCH", body: { password: pw.input.value } }).then(function () {
            toast("Password changed. They are logged out everywhere.");
            pw.input.value = "";
          }, function (e) { toast(e.message); }).then(function () { busy(resetBtn, false); });
        },
      });
      body.appendChild(h("div", { class: "modal__section" }, h("h3", { text: "Password" }), pw.el, h("div", { class: "row", style: "margin-top:10px" }, resetBtn)));
    }

    if (can("users.delete")) {
      body.appendChild(h("div", { class: "modal__section" },
        h("h3", { text: "Delete account" }),
        h("p", { class: "muted small", text: "They lose access right away. This can not be undone." }),
        h("button", {
          class: "act act--danger", type: "button", text: "Delete " + u.username,
          onclick: function () {
            confirmBox("Delete " + u.username + "?", "This account will be removed for good.", "Delete", true).then(function (ok) {
              if (!ok) return;
              api("users/" + u.id, { method: "DELETE" }).then(function () { m.close(); toast("Account deleted"); open(SECTIONS[3]); }, function (e) { toast(e.message); });
            });
          },
        })));
    }

    var m = modal({
      title: "Edit " + u.display_name,
      wide: true,
      body: body,
      actions: [h("button", { class: "act", type: "button", text: "Close", onclick: function () { m.close(); } }), save],
    });
    save.addEventListener("click", function () {
      if (!Object.keys(payload).length) { m.close(); return; }
      busy(save, true);
      api("users/" + u.id, { method: "PATCH", body: payload }).then(function () {
        m.close();
        toast("Saved");
        open(SECTIONS[3]);
      }, function (e) { toast(e.message); busy(save, false); });
    });
  }

  function renderRoles(view, d) {
    var grid = h("div", { class: "roles" });
    grid.appendChild(h("div", { class: "panel" },
      h("div", { class: "row" }, h("h2", { class: "panel__title grow", text: "Owner" }), roleChip("owner")),
      h("p", { class: "muted", text: "Owners can do everything, including managing every account and role. Owner logins are set in the server settings and can not be changed here." }),
      h("p", { class: "muted small", text: d.owners.map(function (o) { return o.username; }).join(", ") })));

    ["admin", "moderator"].forEach(function (role) {
      var perms = (d.roles[role] || []).slice();
      var editable = can("roles.edit") && RANK[me.role] > RANK[role];
      var countEl = h("span", { class: "chip-s" });
      var save = h("button", { class: "act act--primary", type: "button", text: "Save " + ROLE_NAMES[role], disabled: true, hidden: !editable });
      function paintCount() { countEl.textContent = perms.length + " of " + catalog.reduce(function (a, g) { return a + g.perms.length; }, 0); }
      paintCount();
      var panel = h("div", { class: "panel" },
        h("div", { class: "row" }, h("h2", { class: "panel__title grow", text: ROLE_NAMES[role] }), countEl, roleChip(role)),
        h("p", { class: "muted small", text: editable ? "Turn things on or off for everyone with this role. Single members can still be changed one by one." : "You can see this role but not change it." }));
      catalog.forEach(function (g) {
        var group = h("div", { class: "perm-group" }, h("h4", { text: g.group }));
        g.perms.forEach(function (pp) {
          var input = h("input", { type: "checkbox", checked: perms.indexOf(pp[0]) >= 0, disabled: !editable || !canTouchPerm(pp[0]) });
          input.addEventListener("change", function () {
            var i = perms.indexOf(pp[0]);
            if (input.checked && i < 0) perms.push(pp[0]);
            if (!input.checked && i >= 0) perms.splice(i, 1);
            paintCount();
            save.disabled = false;
          });
          group.appendChild(h("div", { class: "perm-row" },
            h("div", {}, h("span", { class: "perm-row__label", text: pp[1] }), h("span", { class: "perm-row__code", text: pp[0] })),
            h("label", { class: "switch" }, input, h("span", { class: "switch__track" }))));
        });
        panel.appendChild(group);
      });
      save.addEventListener("click", function () {
        busy(save, true);
        api("roles/" + role, { method: "PUT", body: { perms: perms } }).then(function () {
          toast(ROLE_NAMES[role] + " permissions saved");
          save.disabled = true;
        }, function (e) { toast(e.message); busy(save, false); });
      });
      panel.appendChild(h("div", { class: "modal__actions" }, save));
      grid.appendChild(panel);
    });
    view.appendChild(grid);
  }

  /* =========================================================
     ACTIVITY LOG
     ========================================================= */
  function describe(e) {
    var d = e.detail || {};
    switch (e.action) {
      case "login": return "Logged in";
      case "notice.create": return 'Posted notice "' + d.title + '"';
      case "notice.edit": return 'Edited notice "' + d.title + '"';
      case "notice.show": return 'Put notice "' + d.title + '" live';
      case "notice.hide": return 'Hid notice "' + d.title + '"';
      case "notice.delete": return 'Deleted notice "' + d.title + '"';
      case "content.save": {
        var parts = [];
        if (d.edited && d.edited.length) parts.push("edited " + d.edited.map(keyLabel).join(", "));
        if (d.reverted && d.reverted.length) parts.push("undid " + d.reverted.map(keyLabel).join(", "));
        return "Site editor: " + parts.join("; ");
      }
      case "media.upload": return "Uploaded picture " + (d.name || "");
      case "stats.reset": return "Reset all statistics";
      case "user.create": return "Created " + (ROLE_NAMES[d.role] || d.role) + " account " + d.username;
      case "user.update": {
        var c = [];
        if (d.role) c.push("role to " + (ROLE_NAMES[d.role] || d.role));
        if (d.disabled === true) c.push("disabled the account");
        if (d.disabled === false) c.push("enabled the account");
        if (d.password) c.push("reset the password");
        if (d.overrides) c.push("changed personal permissions");
        if (d.display_name) c.push("changed the name");
        return "Updated " + d.username + ": " + (c.join(", ") || "no changes");
      }
      case "user.delete": return "Deleted account " + d.username;
      case "role.update": {
        var r = (ROLE_NAMES[d.role] || d.role) + " role:";
        if (d.added && d.added.length) r += " turned on " + d.added.map(permLabel).join(", ") + ".";
        if (d.removed && d.removed.length) r += " turned off " + d.removed.map(permLabel).join(", ") + ".";
        return r;
      }
      case "account.password": return "Changed their own password";
      case "account.rename": return "Changed their name to " + d.display_name;
      default: return e.action;
    }
  }

  function renderLog(view) {
    var tbody = h("tbody");
    var more = h("button", { class: "act", type: "button", text: "Load older" });
    var last = 0;
    function load() {
      busy(more, true);
      return api("audit?limit=60" + (last ? "&before=" + last : "")).then(function (d) {
        d.entries.forEach(function (e) {
          tbody.appendChild(h("tr", {},
            h("td", { class: "log-when", text: when(e.at), title: fullDate(e.at) }),
            h("td", { class: "log-who", text: e.username || "system" }),
            h("td", { text: describe(e) })));
          last = e.id;
        });
        more.hidden = d.entries.length < 60;
        if (!tbody.children.length) tbody.appendChild(h("tr", {}, h("td", { colspan: 3, class: "muted", text: "Nothing has happened yet." })));
      }).then(function () { busy(more, false); });
    }
    more.addEventListener("click", load);
    return load().then(function () {
      view.textContent = "";
      view.appendChild(h("div", { class: "panel" },
        h("div", { class: "table-wrap" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "When" }), h("th", { text: "Who" }), h("th", { text: "What they did" }))),
          tbody)),
        h("div", { class: "row", style: "margin-top:14px" }, more)));
    });
  }

  /* =========================================================
     MY ACCOUNT
     ========================================================= */
  function renderAccount(view) {
    view.textContent = "";
    view.appendChild(h("div", { class: "panel" },
      h("div", { class: "member", style: "box-shadow:none" },
        avatar(me.username),
        h("div", {}, h("div", { class: "member__name", text: me.display_name }), h("div", { class: "member__sub", text: "@" + me.username })),
        h("div", { class: "member__right" }, roleChip(me.role)))));

    if (me.owner) {
      view.appendChild(h("div", { class: "panel" },
        h("h2", { class: "panel__title", text: "Owner account" }),
        h("p", { class: "muted", text: "You can do everything here. Owner usernames and passwords are kept in the server settings (environment variables), so they can not be changed from this page." })));
    } else {
      var name = h("input", { maxlength: 40, value: me.display_name });
      var saveName = h("button", { class: "act act--primary", type: "button", text: "Save name" });
      saveName.addEventListener("click", function () {
        busy(saveName, true);
        api("account", { method: "PATCH", body: { display_name: name.value } }).then(function () {
          me.display_name = name.value.trim();
          toast("Name saved");
          boot();
        }, function (e) { toast(e.message); }).then(function () { busy(saveName, false); });
      });
      view.appendChild(h("div", { class: "panel" },
        h("h2", { class: "panel__title", text: "Display name" }),
        h("label", { class: "field" }, h("span", { text: "Name shown in the panel" }), name),
        h("div", { class: "row", style: "margin-top:14px" }, saveName)));

      var cur = h("input", { type: "password", autocomplete: "current-password" });
      var next = h("input", { type: "password", autocomplete: "new-password" });
      var again = h("input", { type: "password", autocomplete: "new-password" });
      var savePw = h("button", { class: "act act--primary", type: "button", text: "Change password" });
      savePw.addEventListener("click", function () {
        if (next.value !== again.value) { toast("The new passwords do not match"); return; }
        busy(savePw, true);
        api("account/password", { method: "POST", body: { current: cur.value, next: next.value } }).then(function () {
          cur.value = next.value = again.value = "";
          toast("Password changed. Other devices are logged out.");
        }, function (e) { toast(e.message); }).then(function () { busy(savePw, false); });
      });
      view.appendChild(h("div", { class: "panel" },
        h("h2", { class: "panel__title", text: "Password" }),
        h("label", { class: "field" }, h("span", { text: "Current password" }), cur),
        h("label", { class: "field" }, h("span", { text: "New password" }), next, h("small", { text: "At least 8 characters." })),
        h("label", { class: "field" }, h("span", { text: "New password again" }), again),
        h("div", { class: "row", style: "margin-top:14px" }, savePw)));
    }

    var list = h("div", {});
    catalog.forEach(function (g) {
      var mine = g.perms.filter(function (p) { return can(p[0]); });
      if (!mine.length) return;
      list.appendChild(h("div", { class: "perm-group" }, h("h4", { text: g.group }),
        mine.map(function (p) { return h("div", { class: "perm-row" }, h("span", { class: "perm-row__label", text: p[1] }), h("span", { class: "perm-row__now on", text: "On" })); })));
    });
    view.appendChild(h("div", { class: "panel" },
      h("h2", { class: "panel__title", text: "What you can do" }),
      list.children.length ? list : h("p", { class: "muted", text: "You do not have any permissions yet. Ask an owner." })));
  }

  /* ---------- Start ---------- */
  boot();
})();
