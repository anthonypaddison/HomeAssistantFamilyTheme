// /config/www/family-board/family-dashboard-controller.js (v24)
// Minimal, route-scoped variable overrides for Family dashboard.

(() => {
    const CFG = {
        routeContains: '/family',
        className: 'family-board-active',
        paletteLilac: '#CFBAF0',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        bgMain: '#FFFFFF',
        collapseSidebar: true,
        hideAppHeader: false,
    };

    const VARS = [
        '--primary-background-color',
        '--app-header-background-color',
        '--app-header-text-color',
        '--app-header-border-bottom',
        '--sidebar-background-color',
        '--sidebar-text-color',
        '--sidebar-icon-color',
        '--sidebar-selected-text-color',
        '--sidebar-selected-icon-color',
        '--text-primary-color',
        '--toolbar-text-color',
        '--mdc-theme-primary',
        '--mdc-theme-on-primary',
        '--mdc-drawer-width',
    ];

    function setVars(active) {
        const s = document.documentElement.style;
        if (active) {
            // App shell
            s.setProperty('--primary-background-color', CFG.bgMain);
            s.setProperty('--app-header-background-color', CFG.paletteLilac);
            s.setProperty('--app-header-text-color', CFG.textPrimary);
            s.setProperty('--app-header-border-bottom', '0');

            // Text/icon fallbacks some builds use
            s.setProperty('--text-primary-color', CFG.textPrimary);
            s.setProperty('--toolbar-text-color', CFG.textPrimary);
            s.setProperty('--mdc-theme-primary', CFG.textPrimary);
            s.setProperty('--mdc-theme-on-primary', CFG.textPrimary);

            // HA left sidebar
            s.setProperty('--sidebar-background-color', CFG.paletteLilac);
            s.setProperty('--sidebar-text-color', CFG.textPrimary);
            s.setProperty('--sidebar-icon-color', CFG.textSecondary);
            s.setProperty('--sidebar-selected-text-color', CFG.textPrimary);
            s.setProperty('--sidebar-selected-icon-color', CFG.textPrimary);

            if (CFG.collapseSidebar) s.setProperty('--mdc-drawer-width', '72px');
        } else {
            VARS.forEach((name) => s.removeProperty(name));
        }
    }

    // Family Board variables used by the custom card (must be on :root for shadow DOM inheritance)
    const css = `
  html.${CFG.className} {
    --fb-bg: ${CFG.bgMain};
    --fb-surface: ${CFG.paletteLilac}; /* header/chips/in-card sidebar background */
    --fb-surface-2: ${CFG.bgMain};
    --fb-text: ${CFG.textPrimary};     /* dark text/icons on lilac */
    --fb-muted: ${CFG.textSecondary};
    --fb-accent: ${CFG.paletteLilac};
    --fb-grid: #E5E7EB;
    --fb-today: #F6F7FF;
    --fb-weekend: rgba(15,23,42,.04);
    --fb-pill-text: #111;
    --fb-print-text: #111;
    --fb-radius: 12px;
  }

  /* keep Family view canvas white */
  html.${CFG.className} body,
  html.${CFG.className} home-assistant,
  html.${CFG.className} ha-main,
  html.${CFG.className} ha-app-layout,
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    background: var(--fb-bg) !important;
    color: var(--fb-text);
  }
  `;

    function ensureStyle() {
        let style = document.getElementById('family-dashboard-controller-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'family-dashboard-controller-style';
            document.head.appendChild(style);
        }
        style.textContent = css;
    }

    const isActive = () =>
        (location.pathname + location.hash).toLowerCase().includes(CFG.routeContains);

    function apply() {
        const active = isActive();
        document.documentElement.classList.toggle(CFG.className, active);
        setVars(active);
    }

    function start() {
        ensureStyle();
        apply();
        const { pushState, replaceState } = history;
        history.pushState = function (...a) {
            const r = pushState.apply(this, a);
            queueMicrotask(apply);
            return r;
        };
        history.replaceState = function (...a) {
            const r = replaceState.apply(this, a);
            queueMicrotask(apply);
            return r;
        };
        window.addEventListener('popstate', apply);
        setTimeout(apply, 300); // after theme mounts
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
