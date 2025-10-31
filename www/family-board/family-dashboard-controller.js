// /config/www/family-board/family-dashboard-controller.js (v23)
// Minimal, route-scoped variable overrides for Family dashboard.
// Adds icon/text variables so icons don't disappear.

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
        '--text-primary-color', // NEW
        '--toolbar-text-color', // NEW
        '--mdc-theme-primary', // NEW
        '--mdc-theme-on-primary', // NEW
        '--mdc-drawer-width',
    ];

    function setVars(active) {
        const s = document.documentElement.style;
        if (active) {
            // Base shells
            s.setProperty('--primary-background-color', CFG.bgMain);

            // App header + icons
            s.setProperty('--app-header-background-color', CFG.paletteLilac);
            s.setProperty('--app-header-text-color', CFG.textPrimary);
            s.setProperty('--app-header-border-bottom', '0');
            // Extra text/icon vars used by some HA builds/themes
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

    const css = `
  html.${CFG.className} {
    /* Family Board variables consumed by the card */
    --fb-bg: ${CFG.bgMain};
    --fb-surface: ${CFG.paletteLilac};
    --fb-surface-2: ${CFG.bgMain};
    --fb-text: ${CFG.textPrimary};
    --fb-muted: ${CFG.textSecondary};
    --fb-accent: ${CFG.paletteLilac};
    --fb-grid: #E5E7EB;
    --fb-today: #F6F7FF;
    --fb-weekend: rgba(15,23,42,.04);
    --fb-pill-text: #111;
    --fb-print-text: #111;
    --fb-radius: 12px;
  }

  /* Keep the Family panel surface white */
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

  /* Ensure icons remain visible (header + in-card) */
  html.${CFG.className} app-header ha-icon,
  html.${CFG.className} ha-top-app-bar-fixed ha-icon,
  html.${CFG.className} .fb-layout ha-icon {
    color: var(--fb-text) !important;
    fill: var(--fb-text) !important;
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
        setTimeout(apply, 300); // after theme/components mount
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
