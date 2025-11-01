// /config/www/family-board/family-dashboard-controller.js (v21)
// Force-scoped theme + HA chrome overrides for Family dashboard.
// Ensures HA header + HA left sidebar use lilac, and keeps it in place
// across navigation, theme toggles, and re-renders.

(() => {
    const CFG = {
        routeContains: '/family', // matches /lovelace/family etc.
        className: 'family-board-active',
        options: {
            hideAppHeader: false, // leave header visible but recolored
            collapseSidebar: true,
        },
    };

    const css = `
  /* ======== FAMILY DASHBOARD SCOPE ======== */
  html.${CFG.className} {
    /* Palette */
    --palette-lilac: #CFBAF0;
    --primary-text-color: #0F172A;
    --secondary-text-color: #475569;
    --divider-color: #E5E7EB;

    --utility-bar-background: #cfbaf0 !important;
    --family-color-family:     #36B37E !important;
    --family-color-anthony:    #7E57C2 !important;
    --family-color-joy:        #F4B400 !important;
    --family-color-lizzie:     #EC407A !important;
    --family-color-toby:       #42A5F5 !important;
    --family-color-routine:    #b2fd7fff !important;
    /* Family Board variables */
    --family-background: #FFFFFF;
    --family-surface: var(--palette-lilac);

    --fb-bg: var(--family-background);
    --fb-surface: var(--family-surface);
    --fb-surface-2: var(--family-background);
    --fb-text: var(--primary-text-color);
    --fb-muted: var(--secondary-text-color);
    --fb-accent: var(--palette-lilac);
    --fb-grid: var(--divider-color);
    --fb-today: #F6F7FF;
    --fb-weekend: rgba(15,23,42,0.04);
    --fb-pill-text: #111;
    --fb-print-text: #111;
    --fb-radius: 12px;

    /* HA chrome variables (many HA components read these) */
    --primary-background-color: var(--family-background);

    /* App Header */
    --app-header-background-color: var(--palette-lilac);
    --app-header-text-color: var(--primary-text-color);
    --app-header-border-bottom: 0;

    /* Left HA Sidebar */
    --sidebar-background-color: var(--palette-lilac);
    --sidebar-text-color: var(--primary-text-color);
    --sidebar-icon-color: var(--secondary-text-color);
    --sidebar-selected-text-color: var(--primary-text-color);
    --sidebar-selected-icon-color: var(--primary-text-color);

    /* MDC/Material fallbacks used by header/toolbar in some builds */
    --mdc-theme-primary: var(--primary-text-color);
    --mdc-theme-on-primary: var(--primary-text-color);
    --mdc-theme-surface: var(--palette-lilac);
    --mdc-theme-on-surface: var(--primary-text-color);
  }

  /* ======== FORCE HA APP HEADER COLOR (multiple targets) ======== */
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed,
  html.${CFG.className} mwc-top-app-bar-fixed,
  html.${CFG.className} app-toolbar,
  html.${CFG.className} header.mdc-top-app-bar {
    background: var(--app-header-background-color) !important;
    color: var(--app-header-text-color) !important;
    border-bottom: var(--app-header-border-bottom, 0) !important;
  }

  /* Some builds expose header content via parts */
  html.${CFG.className} app-header::part(toolbar),
  html.${CFG.className} ha-top-app-bar-fixed::part(toolbar),
  html.${CFG.className} ha-top-app-bar-fixed::part(title) {
    background: var(--app-header-background-color) !important;
    color: var(--app-header-text-color) !important;
  }

  /* ======== FORCE HA LEFT SIDEBAR COLOR (use both element and ::part) ======== */
  html.${CFG.className} ha-sidebar {
    background: var(--sidebar-background-color) !important;
    color: var(--sidebar-text-color) !important;
  }
  html.${CFG.className} ha-sidebar::part(container),
  html.${CFG.className} ha-sidebar::part(content) {
    background: var(--sidebar-background-color) !important;
    color: var(--sidebar-text-color) !important;
  }
  html.${CFG.className} ha-sidebar a,
  html.${CFG.className} ha-sidebar button,
  html.${CFG.className} ha-sidebar ha-icon {
    color: var(--sidebar-icon-color) !important;
  }
  html.${CFG.className} ha-sidebar a[aria-current="page"],
  html.${CFG.className} ha-sidebar a[aria-current="page"] ha-icon {
    color: var(--sidebar-selected-icon-color) !important;
  }

  /* Optional: collapse HA sidebar width for this view */
  ${
      CFG.options.collapseSidebar
          ? `
  html.${CFG.className} ha-sidebar { --mdc-drawer-width: 72px !important; }`
          : ''
  }

  /* Hide HA header if you really want – you asked to keep it visible but lilac */
  ${
      CFG.options.hideAppHeader
          ? `
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed,
  html.${CFG.className} mwc-top-app-bar-fixed { display: none !important; }`
          : ''
  }

  /* Ensure HA shell stays white under our view */
  html.${CFG.className} body,
  html.${CFG.className} home-assistant,
  html.${CFG.className} ha-main,
  html.${CFG.className} ha-app-layout,
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    background: var(--family-background) !important;
    color: var(--primary-text-color);
  }

  /* Remove default paddings in the panel view */
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view { padding: 0 !important; margin: 0 !important; }
  `;

    function ensureStyle() {
        let style = document.getElementById('family-dashboard-controller-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'family-dashboard-controller-style';
            document.head.appendChild(style);
        }
        if (style.textContent !== css) style.textContent = css;
    }

    function isActiveRoute() {
        const path = (location.pathname + location.hash).toLowerCase();
        return path.includes(CFG.routeContains);
    }

    function applyScope() {
        document.documentElement.classList.toggle(CFG.className, isActiveRoute());
    }

    function hookHistory() {
        const { pushState, replaceState } = history;
        history.pushState = function (...a) {
            const r = pushState.apply(this, a);
            queueMicrotask(applyScope);
            return r;
        };
        history.replaceState = function (...a) {
            const r = replaceState.apply(this, a);
            queueMicrotask(applyScope);
            return r;
        };
        window.addEventListener('popstate', applyScope);
    }

    // Observe HA app shell (header/sidebar can be re-rendered by theme or nav)
    let mo;
    function observeShell() {
        if (mo) return;
        mo = new MutationObserver(() => {
            ensureStyle();
            applyScope();
        });
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    }

    function start() {
        ensureStyle();
        applyScope();
        hookHistory();
        observeShell();
        // Re-assert after theme changes (HA dispatches 'settheme' sometimes)
        window.addEventListener(
            'settheme',
            () => {
                ensureStyle();
                applyScope();
            },
            { passive: true }
        );
        // Safety timer to re-apply once after load
        setTimeout(() => {
            ensureStyle();
            applyScope();
        }, 800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
