(function () {
  "use strict";

  var ADDRESS = "play.berojgar.fun";
  var STATUS_API = "https://api.mcsrvstat.us/3/" + ADDRESS;
  var DISCORD_API = "https://discord.com/api/v9/invites/2QaWxsZpFm?with_counts=true";
  var REFRESH_MS = 60 * 1000;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // The admin panel opens the site with ?edit=1 inside its editor.
  var EDIT_MODE = /[?&]edit=1(&|$)/.test(location.search);

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  /* ---------------- Stats tracking ---------------- */
  function track(events) {
    if (EDIT_MODE) return;
    var body = JSON.stringify({ e: [].concat(events) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    fetch("/api/track", { method: "POST", body: body, keepalive: true }).catch(function () {});
  }

  (function trackVisit() {
    var today = new Date().toISOString().slice(0, 10);
    var events = ["page_view"];
    if (store("bj_last_visit") !== today) {
      events.push("visitor");
      store("bj_last_visit", today);
    }
    track(events);
  })();

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-track]");
    if (el) track(el.getAttribute("data-track"));
  });

  /* ---------------- Editable content (set from the admin panel) ---------------- */
  var defaults = { text: {}, img: {} };
  $$("[data-edit]").forEach(function (el) {
    var k = el.getAttribute("data-edit");
    if (!(k in defaults.text)) defaults.text[k] = el.innerHTML;
  });
  $$("[data-edit-img]").forEach(function (el) {
    var k = el.getAttribute("data-edit-img");
    if (!(k in defaults.img)) defaults.img[k] = el.getAttribute("src");
  });

  var applied = {};
  function setKey(key, entry) {
    if (entry && entry.k === "img") {
      $$('[data-edit-img="' + key + '"]').forEach(function (img) { img.src = entry.v; });
    } else if (entry) {
      $$('[data-edit="' + key + '"]').forEach(function (el) { el.innerHTML = entry.v; });
    } else {
      if (key in defaults.text) $$('[data-edit="' + key + '"]').forEach(function (el) { el.innerHTML = defaults.text[key]; });
      if (key in defaults.img) $$('[data-edit-img="' + key + '"]').forEach(function (img) { img.src = defaults.img[key]; });
    }
  }
  function applyContent(map) {
    map = map || {};
    Object.keys(applied).forEach(function (k) { if (!map[k]) setKey(k, null); });
    Object.keys(map).forEach(function (k) {
      if (/^[a-z0-9_.-]+$/i.test(k)) setKey(k, map[k]);
    });
    applied = map;
  }
  window.__cms = { defaults: defaults, apply: applyContent, current: function () { return applied; } };

  // Show the last known edits right away, then refresh from the server.
  if (!EDIT_MODE) applyContent(store("bj_content"));

  var contentReady = fetch("/api/public" + (EDIT_MODE ? "?fresh=" + Date.now() : ""), { cache: EDIT_MODE ? "no-store" : "default" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      applyContent(d.content);
      if (!EDIT_MODE) store("bj_content", d.content || {});
      return d;
    })
    .catch(function () { return null; });

  /* ---------------- Theme ---------------- */
  var toggles = $$(".js-theme-toggle");

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    toggles.forEach(function (t) { t.checked = theme === "dark"; });
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0716" : "#ecfff2");
  }

  applyTheme(document.documentElement.dataset.theme || "dark");

  toggles.forEach(function (t) {
    t.addEventListener("change", function () {
      var theme = t.checked ? "dark" : "light";
      applyTheme(theme);
      try { localStorage.setItem("theme", theme); } catch (e) {}
    });
  });

  /* ---------------- Copy address ---------------- */
  var toast = $(".js-toast");
  var toastTimer;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function flash(el) {
    el.classList.remove("copied");
    void el.offsetWidth; // restart the animation if clicked again quickly
    el.classList.add("copied");
    clearTimeout(el._copyTimer);
    el._copyTimer = setTimeout(function () { el.classList.remove("copied"); }, 1800);
  }

  function handleCopy(btn, text) {
    text = text || ADDRESS;
    track(text === ADDRESS ? "ip_copy" : "port_copy");
    copyText(text).then(function () {
      if (btn) flash(btn);
      showToast("Copied " + text);
    }, function () {
      showToast("Could not copy. Here it is: " + text);
    });
  }

  $$(".js-copy").forEach(function (btn) {
    btn.addEventListener("click", function () { handleCopy(btn, btn.dataset.copy); });
  });
  $$(".js-copy-text").forEach(function (el) {
    el.addEventListener("click", function () { handleCopy($(".js-copy"), el.dataset.copy); });
  });
  $$(".js-copy-mini").forEach(function (btn) {
    btn.addEventListener("click", function () {
      handleCopy(btn);
      var hint = $(".mini-copy__hint", btn);
      if (hint && !hint._busy) {
        var label = hint.innerHTML;
        hint._busy = true;
        hint.textContent = "Copied!";
        setTimeout(function () { hint.innerHTML = label; hint._busy = false; }, 1800);
      }
    });
  });

  /* ---------------- Number count-up ---------------- */
  function countTo(el, to, ms) {
    var from = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
    if (from === to) return;
    var start = performance.now();
    ms = ms || 600;
    function step(now) {
      var p = Math.min(1, (now - start) / ms);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------------- MOTD with Minecraft color codes ---------------- */
  var MC_COLORS = {
    "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
    "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF",
    "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF"
  };

  // Builds safe DOM nodes (no innerHTML) from raw MOTD lines like "§a§lHello"
  function renderMotd(target, lines) {
    target.textContent = "";
    lines.forEach(function (line, i) {
      if (i > 0) target.appendChild(document.createElement("br"));
      var parts = String(line).split("§");
      var style = { color: null, b: false, i: false, u: false, s: false };
      parts.forEach(function (part, idx) {
        var text = part;
        if (idx > 0 && part.length) {
          var code = part.charAt(0).toLowerCase();
          text = part.slice(1);
          if (MC_COLORS[code]) { style = { color: MC_COLORS[code], b: false, i: false, u: false, s: false }; }
          else if (code === "l") style.b = true;
          else if (code === "o") style.i = true;
          else if (code === "n") style.u = true;
          else if (code === "m") style.s = true;
          else if (code === "r") style = { color: null, b: false, i: false, u: false, s: false };
        }
        if (!text) return;
        var span = document.createElement("span");
        span.textContent = text;
        if (style.color) span.style.color = style.color;
        if (style.b) span.classList.add("mc-b");
        if (style.i) span.classList.add("mc-i");
        if (style.u) span.classList.add("mc-u");
        if (style.s) span.classList.add("mc-s");
        target.appendChild(span);
      });
    });
  }

  /* ---------------- Live server status ---------------- */
  var el = {
    online: $(".js-online"),
    max: $(".js-max"),
    bar: $(".js-bar"),
    motd: $(".js-motd"),
    versions: $$(".js-version"),
    heads: $(".js-heads"),
    icon: $(".js-server-icon"),
    updated: $(".js-updated")
  };
  var lastUpdate = 0;

  function renderHeads(list, online) {
    el.heads.textContent = "";
    if (!online) {
      var empty = document.createElement("span");
      empty.className = "heads__empty";
      empty.textContent = "Nobody is online yet. Be the first one!";
      el.heads.appendChild(empty);
      return;
    }
    if (!list || !list.length) return;
    var show = list.slice(0, 12);
    show.forEach(function (p) {
      var img = document.createElement("img");
      img.src = "https://mc-heads.net/avatar/" + encodeURIComponent(p.uuid || p.name) + "/32";
      img.alt = p.name;
      img.title = p.name;
      img.loading = "lazy";
      img.width = 32;
      img.height = 32;
      el.heads.appendChild(img);
    });
    if (list.length > show.length) {
      var more = document.createElement("span");
      more.className = "heads__more";
      more.textContent = "+" + (list.length - show.length) + " more";
      el.heads.appendChild(more);
    }
  }

  function updatedText() {
    if (!lastUpdate) return;
    var s = Math.round((Date.now() - lastUpdate) / 1000);
    el.updated.textContent = s < 10 ? "Updated just now" : "Updated " + (s < 60 ? s + " sec" : Math.round(s / 60) + " min") + " ago";
  }

  function loadStatus() {
    fetch(STATUS_API, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        lastUpdate = Date.now();
        updatedText();

        if (!d.online) {
          countTo(el.online, 0);
          el.bar.style.width = "0%";
          el.motd.textContent = "The server is taking a nap. Check our Discord for news.";
          renderHeads(null, 0);
          return;
        }

        var online = (d.players && d.players.online) || 0;
        var max = (d.players && d.players.max) || 0;

        var before = el.online.textContent;
        countTo(el.online, online);
        if (before !== String(online)) {
          el.online.classList.remove("bump");
          void el.online.offsetWidth;
          el.online.classList.add("bump");
        }
        el.max.textContent = max;
        el.bar.style.width = max ? Math.max(online ? 4 : 0, Math.min(100, (online / max) * 100)) + "%" : "0%";

        if (d.motd && d.motd.raw) renderMotd(el.motd, d.motd.raw);
        if (d.version) {
          var v = String(d.version).replace(/§./g, "");
          el.versions.forEach(function (n) { n.textContent = v; });
        }
        if (d.icon && /^data:image\//.test(d.icon)) el.icon.src = d.icon;

        renderHeads(d.players && d.players.list, online);
      })
      .catch(function () {
        el.motd.textContent = "We could not reach the status service. Try refreshing in a bit.";
      });
  }

  loadStatus();
  setInterval(function () { if (!document.hidden) loadStatus(); }, REFRESH_MS);
  setInterval(updatedText, 5000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - lastUpdate > REFRESH_MS) loadStatus();
  });

  /* ---------------- Discord stats ---------------- */
  fetch(DISCORD_API)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (d.approximate_member_count) countTo($(".js-members"), d.approximate_member_count, 900);
      if (d.approximate_presence_count) countTo($(".js-presence-num"), d.approximate_presence_count, 900);
      var g = d.guild;
      if (g && g.icon) {
        $(".js-guild-icon").src = "https://cdn.discordapp.com/icons/" + g.id + "/" + g.icon + ".png?size=128";
      }
    })
    .catch(function () { /* keep the default numbers */ });

  /* ---------------- Reveal on scroll ---------------- */
  var reveals = $$(".reveal");
  function startReveal() {
  if (EDIT_MODE) {
    reveals.forEach(function (r) { r.classList.add("in"); });
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add("in"); });
  }
  }
  var revealStarted = false;
  function revealOnce() { if (!revealStarted) { revealStarted = true; startReveal(); } }
  contentReady.then(revealOnce);
  setTimeout(revealOnce, 700);

  /* ---------------- Noticeboard popup ---------------- */
  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function showNotices(list) {
    var seen = store("bj_seen_notices") || {};
    var toShow = (list || []).filter(function (n) {
      return n.frequency !== "once" || seen[n.id] !== n.updated_at;
    });
    if (!toShow.length) return;

    var overlay = document.createElement("div");
    overlay.className = "nb-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "nb-title");

    var board = document.createElement("div");
    board.className = "nb";
    board.innerHTML =
      '<div class="nb__head"><img src="assets/img/map.png" alt=""><h2 id="nb-title">Noticeboard</h2></div>' +
      '<div class="nb__list"></div>' +
      '<div class="nb__foot"><button type="button" class="btn btn--green nb__ok"><span class="btn__label">Understood!</span><span></span></button></div>';

    var listEl = board.querySelector(".nb__list");
    toShow.forEach(function (n) {
      var item = document.createElement("article");
      item.className = "nb__item" + (n.pinned ? " nb__item--pinned" : "");
      var h = document.createElement("h3");
      h.textContent = n.title;
      var meta = document.createElement("div");
      meta.className = "nb__date";
      meta.textContent = (n.pinned ? "Pinned \u00b7 " : "") + formatDate(n.updated_at);
      var body = document.createElement("p");
      body.textContent = n.body;
      item.appendChild(h);
      item.appendChild(meta);
      item.appendChild(body);
      listEl.appendChild(item);
    });

    overlay.appendChild(board);
    document.body.appendChild(overlay);
    document.documentElement.classList.add("nb-open");
    requestAnimationFrame(function () { overlay.classList.add("show"); });

    var ok = board.querySelector(".nb__ok");
    setTimeout(function () { ok.focus({ preventScroll: true }); }, 50);
    ok.addEventListener("click", function () {
      toShow.forEach(function (n) { seen[n.id] = n.updated_at; });
      store("bj_seen_notices", seen);
      track("notice_ack");
      overlay.classList.remove("show");
      overlay.classList.add("hide");
      document.documentElement.classList.remove("nb-open");
      setTimeout(function () { overlay.remove(); }, 260);
    });
  }

  if (!EDIT_MODE) contentReady.then(function (d) { if (d) showNotices(d.notices); });

  /* ---------------- Grass block follows the mouse a little ---------------- */
  var tilt = $(".js-tilt");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (tilt && !reduce) {
    var hero = $(".hero");
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = "rotateY(" + (x * 24).toFixed(1) + "deg) rotateX(" + (-y * 14).toFixed(1) + "deg)";
    });
    hero.addEventListener("pointerleave", function () { tilt.style.transform = ""; });
  }
})();
