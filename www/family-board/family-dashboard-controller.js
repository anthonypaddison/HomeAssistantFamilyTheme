// /config/www/family-board/family-dashboard-controller.js
// Family Dashboard Controller
// - Adds/removes a document-level class when the /family route is active
// - Injects only small page-wide "kiosk" tweaks (header/sidebar/full-bleed)
// - All theme/calendar styling now lives in /local/family-board/family-board.css (loaded by the card)

(() => {
    const CFG = {
        routeContains: '/family', // substring to detect your Family board route
        className: 'family-board-active', // toggled on <html>
        options: {
            hideAppHeader: true,
            collapseSidebar: true,
            fullBleedView: true,
            setVars: true,
        },
    };

    // Minimal kiosk CSS (scoped by html.family-board-active)
    const css = `
  html.${CFG.className} {
    --family-background: var(--primary-background-color, #0b1020);
    --family-text: var(--primary-text-color, #e6eaf6);
  }
  /* Hide top HA header */
  ${
      CFG.options.hideAppHeader
          ? `
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed { display: none !important; }`
          : ''
  }
  /* Collapse left sidebar to icons only */
  ${
      CFG.options.collapseSidebar
          ? `
  html.${CFG.className} ha-sidebar { --mdc-drawer-width: 72px !important; }`
          : ''
  }
  /* Full-bleed view area */
  ${
      CFG.options.fullBleedView
          ? `
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    padding: 0 !important; margin: 0 !important;
    background: var(--family-background); color: var(--family-text);
  }`
          : ''
  }
  /* Card default tweaks (subtle) */
  ${
      CFG.options.setVars
          ? `
  html.${CFG.className} {
    --ha-card-border-radius: 10px;
    --ha-card-box-shadow: none;
    --masonry-view-card-margin: 0px;
  }`
          : ''
  }
  `;

    function injectCssOnce() {
        if (document.getElementById('family-dashboard-controller-style')) return;
        const style = document.createElement('style');
        style.id = 'family-dashboard-controller-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function onRouteChange() {
        const path = location.pathname + location.hash;
        const active = path.includes(CFG.routeContains);
        const root = document.documentElement;
        root.classList.toggle(CFG.className, active);
    }

    function start() {
        injectCssOnce();
        onRouteChange();
        // Patch pushState/replaceState to catch HA client-side navigation
        const { pushState, replaceState } = history;
        history.pushState = function (...a) {
            const r = pushState.apply(this, a);
            onRouteChange();
            return r;
        };
        history.replaceState = function (...a) {
            const r = replaceState.apply(this, a);
            onRouteChange();
            return r;
        };
        window.addEventListener('popstate', onRouteChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
