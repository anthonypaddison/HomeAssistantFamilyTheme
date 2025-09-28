
// === HA extra_module_url - Hide chosen sidebar items (deep-shadow aware, FULL logging) ===
// Fixes Safari/WebKit requestIdleCallback signature issue and keeps verbose logs.

(() => {
  const DEBUG = false; // set false to reduce logs
  const log  = (...args) => DEBUG && console.log("[HA sidebar hide]", ...args);
  const warn = (...args) => DEBUG && console.warn("[HA sidebar hide]", ...args);
  const ts   = () => new Date().toISOString();

  log("Boot @", ts(), "href=", location.href);

  // ---- Safe idle scheduling (FIX for your error) ----
  const scheduleIdle = (cb) => {
    try {
      if (typeof window.requestIdleCallback === "function") {
        // Pass a proper IdleRequestOptions object, not a number
        return window.requestIdleCallback(cb, { timeout: 1000 });
      }
    } catch (e) {
      // If some polyfill/impl is picky, fall through to setTimeout
      warn("requestIdleCallback threw; falling back to setTimeout:", e);
    }
    return window.setTimeout(cb, 0);
  };

  // Optional cancel helper (not strictly needed here)
  const cancelIdle = (h) => {
    if (typeof window.cancelIdleCallback === "function") {
      try { window.cancelIdleCallback(h); return; } catch {}
    }
    clearTimeout(h);
  };

  // --- Config ---
  const LABELS_TO_HIDE = new Set([
    "Energy",
    "Logbook",
    "History",
    "Calendar",
    "To-do lists",
    "Media",
    "Media browser",
  ]);

  // Fallback match on first path segment of href
  const ROUTE_PARTS = new Set([
    "energy",
    "logbook",
    "history",
    "calendar",
    "todo",
    "media",
    "media-browser",
  ]);

  const equalsIgnoreCase = (a, b) =>
    a?.localeCompare?.(b, undefined, { sensitivity: "accent" }) === 0;

  const normalize = (s) => (s || "").trim();

  // --- Deep shadow traversal utilities ---
  const allNodes = () => {
    const out = [];
    const stack = [document.documentElement];
    const seen = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);

      // Explore open shadow root if present
      const sr = n.shadowRoot;
      if (sr) stack.push(sr);

      // Explore template content
      if (n.tagName === "TEMPLATE" && n.content) stack.push(n.content);

      // Explore children
      if (n.childNodes && n.childNodes.length) {
        for (const c of n.childNodes) stack.push(c);
      }
    }
    return out;
  };

  const deepQueryAll = (selector) => {
    const nodes = allNodes();
    const results = [];
    for (const n of nodes) {
      if (n instanceof Element || n instanceof DocumentFragment) {
        try {
          results.push(...n.querySelectorAll(selector));
        } catch {
          // ignore selector errors in this node
        }
      }
    }
    return Array.from(new Set(results));
  };

  // Efficient waiter: try once, then watch for DOM growth
  const waitForDeep = (finder, { timeout = 30000, name = "target" } = {}) =>
    new Promise((resolve) => {
      const start = performance.now();
      const done = (value, reason = "resolved") => {
        const ms = Math.round(performance.now() - start);
        log(`waitForDeep(${name}) ${reason} after ${ms}ms @`, ts(), "value=", value);
        resolve(value || null);
      };

      // 1) Immediate attempt
      try {
        const v = finder();
        if (v && ((Array.isArray(v) && v.length) || (!Array.isArray(v)))) {
          return done(v, "immediate");
        }
      } catch (e) {
        warn(`waitForDeep(${name}) immediate finder error`, e);
      }

      // 2) Observe subtree for changes
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        obs.disconnect();
        done(null, "timeout");
      }, timeout);

      const obs = new MutationObserver(() => {
        if (timedOut) return;
        try {
          const v = finder();
          if (v && ((Array.isArray(v) && v.length) || (!Array.isArray(v)))) {
            clearTimeout(timer);
            obs.disconnect();
            done(v, "mutation");
          }
        } catch (e) {
          warn(`waitForDeep(${name}) finder error`, e);
        }
      });

      obs.observe(document.documentElement, { childList: true, subtree: true });
      log(`waitForDeep(${name}) watching DOM for up to ${timeout}ms...`);
    });

  // --- Sidebar discovery ---
  const findSidebars = () => {
    const sb = deepQueryAll("ha-sidebar");
    log("findSidebars:", sb.length, sb);
    return sb;
  };

  const getListsFromSidebar = (sidebar) => {
    const sr = sidebar?.shadowRoot;
    if (!sr) {
      log("getListsFromSidebar: no shadowRoot", sidebar);
      return [];
    }
    const lists = Array.from(sr.querySelectorAll("ha-md-list, paper-listbox, ha-menu-list"));
    log("getListsFromSidebar: found", lists.length, "list(s) in", sidebar);
    return lists;
  };

  const looksLikeNavList = (list) => {
    const items = list.querySelectorAll("ha-md-list-item, paper-icon-item, a[role='menuitem']");
    let score = 0;
    for (const item of items) {
      const a = item.closest("a") || item.querySelector("a");
      const href = a?.getAttribute?.("href") || "";
      if (href.startsWith("/")) score++;
    }
    const ok = score >= 3;
    log("looksLikeNavList:", { score, ok, list });
    return ok;
  };

  const findSidebarLists = () => {
    const sidebars = findSidebars();
    let lists = [];
    for (const sb of sidebars) lists.push(...getListsFromSidebar(sb));
    if (lists.length) {
      log("findSidebarLists: via <ha-sidebar>", lists.length);
      return lists;
    }
    // Fallback: deep-search for nav-like list (helps on some builds)
    const allLists = deepQueryAll("ha-md-list, paper-listbox, ha-menu-list");
    log("findSidebarLists: fallback allLists:", allLists.length);
    const navLike = allLists.filter(looksLikeNavList);
    log("findSidebarLists: nav-like:", navLike.length);
    return navLike;
  };

  // --- Item utilities ---
  const getItems = (list) => {
    const items = Array.from(
      list.querySelectorAll("ha-md-list-item, paper-icon-item, a[role='menuitem']")
    );
    log("getItems:", items.length, "from list", list);
    return items;
  };

  const getItemLabel = (item) => {
    // Prefer M3 headline, fallback to classic text nodes
    const el =
      item.querySelector('[slot="headline"]') ||
      item.querySelector('span.item-text[slot="headline"]') ||
      item.querySelector(".item-text") ||
      item;
    const label = normalize(el?.textContent || "");
    log("getItemLabel:", { item, label });
    return label;
  };

  const getItemHref = (item) => {
    const a = item.closest("a") || item.querySelector("a");
    const href = a?.getAttribute?.("href") || "";
    log("getItemHref:", { item, href });
    return href;
  };

  const firstPathSegment = (href) => {
    try {
      const u = new URL(href, location.origin);
      const part = (u.pathname || "/").split("/").filter(Boolean)[0] || "";
      log("firstPathSegment:", { href, part });
      return part.toLowerCase();
    } catch {
      const part = (href || "").split("/").filter(Boolean)[0] || "";
      log("firstPathSegment (fallback):", { href, part });
      return part.toLowerCase();
    }
  };

  const shouldHideItem = (item, label) => {
    if (label) {
      for (const t of LABELS_TO_HIDE) {
        if (equalsIgnoreCase(label, t)) {
          log("shouldHideItem: label match", { label, match: t });
          return { hide: true, reason: `label:${t}` };
        }
      }
    }
    const href = getItemHref(item);
    if (href) {
      const part = firstPathSegment(href);
      if (ROUTE_PARTS.has(part)) {
        log("shouldHideItem: route match", { href, part });
        return { hide: true, reason: `route:${part}` };
      }
    }
    log("shouldHideItem: no match", { label, href });
    return { hide: false, reason: "no-match" };
  };

  const hideEl = (el) => {
    if (!el) return;
    el.style.display = "none";
    el.setAttribute("hidden", "");
  };

  // --- Main apply ---
  const hideNow = () => {
    const t0 = performance.now();
    log("hideNow: begin @", ts());

    const lists = findSidebarLists();
    log("hideNow: operating on lists:", lists.length);

    let total = 0;
    let hidden = 0;
    for (const list of lists) {
      const items = getItems(list);
      for (const item of items) {
        total++;
        const label = getItemLabel(item);
        const { hide, reason } = shouldHideItem(item, label);
        if (hide) {
          log(`HIDE -> "${label}" (${reason})`, item);
          hideEl(item);
          const a = item.closest("a");
          if (a) hideEl(a);
          hidden++;
        } else {
          log(`KEEP -> "${label}"`);
        }
      }
    }

    const ms = Math.round(performance.now() - t0);
    log(`hideNow: end processed=${total}, hidden=${hidden}, time=${ms}ms @`, ts());
  };

  // --- Observers ---
  const installObservers = () => {
    log("installObservers: start");
    let pending = false;
    const schedule = (source) => {
      if (pending) {
        log(`Observer: skip (pending) source=${source}`);
        return;
      }
      pending = true;
      log(`Observer: schedule (source=${source})`);
      setTimeout(() => {
        pending = false;
        log(`Observer: run (source=${source})`);
        hideNow();
      }, 75);
    };

    const mo = new MutationObserver((muts) => {
      log("MutationObserver: muts:", muts.length);
      schedule("mutation");
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    const onRoute = () => {
      log("Route: location-changed");
      hideNow();
    };
    window.addEventListener("location-changed", onRoute);

    // Optional: re-run on hashchange as well
    window.addEventListener("hashchange", () => schedule("hashchange"));

    log("installObservers: ready");
    return () => {
      log("cleanup observers");
      mo.disconnect();
      window.removeEventListener("location-changed", onRoute);
    };
  };

  // --- Init ---
  const init = async () => {
    log("init: start @", ts());
    const lists = await waitForDeep(
      () => {
        const found = findSidebarLists();
        return found.length ? found : null;
      },
      { timeout: 30000, name: "sidebar-lists" }
    );

    if (!lists || !lists.length) {
      warn("init: No sidebar list found (timeout). Aborting.");
      return;
    }

    hideNow();
    installObservers();
    log("init: active @", ts());
  };

  // Use safe scheduler (FIX)
  scheduleIdle(() => {
    log("scheduleIdle fired @", ts());
    // Avoid unhandled rejections
    Promise.resolve().then(init).catch((e) => warn("init error:", e));
  });
})();
