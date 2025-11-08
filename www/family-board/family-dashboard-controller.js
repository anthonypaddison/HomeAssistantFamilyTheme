// /config/www/family-board/family-dashboard-controller.js (v21)
// Purpose: Page-level “chrome” (header/sidebar) theming & behavior when you’re on the Family dashboard.
// Notes: Pure CSS injection + route detection. No changes needed for the calendar issues, but left here fully.

(() => {
  const CFG = {
    routeContains: '/family', // matches /lovelace/family etc.
    className: 'family-board-active',
    options: {
      hideAppHeader: false,   // keep header visible (recolored)
      collapseSidebar: true,  // compact HA sidebar width on this view
    },
  };

  // CSS variables and chrome overrides that scope to this dashboard only
  const css = `
  /* ======== FAMILY DASHBOARD SCOPE ======== */
  html.${CFG.className} {
    /* Palette */
    --palette-lilac: #CFBAF0;
    --primary-text-color: #0F172A;
    --secondary-text-color: #475569;
    --divider-color: #E5E7EB;

    /* Family color tokens used by the card */
    --utility-bar-background: #cfbaf0 !important;
    --family-color-family:  #36B37E !important;
    --family-color-anthony: #7E57C2 !important;
    --family-color-joy:     #F4B400 !important;
    --family-color-lizzie:  #EC407A !important;
    --family-color-toby:    #42A5F5 !important;
    --family-color-routine: #b2fd7fff !important;

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

    /* App Header / Sidebar */
    --primary-background-color: var(--family-background);
    --app-header-background-color: var(--palette-lilac);
    --app-header-text-color: var(--primary-text-color);
    --app-header-border-bottom: 0;

    --sidebar-background-color: var(--palette-lilac);
    --sidebar-text-color: var(--primary-text-color);
    --sidebar-icon-color: var(--secondary-text-color);
    --sidebar-selected-text-color: var(--primary-text-color);
    --sidebar-selected-icon-color: var(--primary-text-color);

    /* MDC fallbacks */
    --mdc-theme-primary: var(--primary-text-color);
    --mdc-theme-on-primary: var(--primary-text-color);
    --mdc-theme-surface: var(--palette-lilac);
    --mdc-theme-on-surface: var(--primary-text-color);
  }

  /* Force header coloring */
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed,
  html.${CFG.className} mwc-top-app-bar-fixed,
  html.${CFG.className} app-toolbar,
  html.${CFG.className} header.mdc-top-app-bar {
    background: var(--app-header-background-color) !important;
    color: var(--app-header-text-color) !important;
    border-bottom: var(--app-header-border-bottom, 0) !important;
  }

  /* Sidebar */
  html.${CFG.className} ha-sidebar {
    background: var(--sidebar-background-color) !important;
    color: var(--sidebar-text-color) !important;
  }

  ${ CFG.options.collapseSidebar ? `
  html.${CFG.className} ha-sidebar { --mdc-drawer-width: 72px !important; }
  ` : '' }

  /* View background & spacing */
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    padding: 0 !important;
    margin:  0 !important;
    background: var(--family-background) !important;
    color: var(--primary-text-color);
  }
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
    history.pushState = function(...a) { const r = pushState.apply(this, a); queueMicrotask(applyScope); return r; };
    history.replaceState = function(...a) { const r = replaceState.apply(this, a); queueMicrotask(applyScope); return r; };
    window.addEventListener('popstate', applyScope);
  }
  function observeShell() {
    const mo = new MutationObserver(() => { ensureStyle(); applyScope(); });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  }
  function start() {
    ensureStyle(); applyScope(); hookHistory(); observeShell();
    window.addEventListener('settheme', () => { ensureStyle(); applyScope(); }, { passive: true });
    setTimeout(() => { ensureStyle(); applyScope(); }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
