// Family Dashboard Controller
// - Adds/removes a document-level class when you are on the Family dashboard.
// - Injects CSS once; styles apply only while that class is present.
// - No HACS required.

(() => {
    const CFG = {
        // Adjust this to match your dashboard path.
        // If you use /lovelace/family or /family-dashboard/family, both will work with the contains check.
        routeContains: '/family', // substring to detect your Family board route
        className: 'family-board-active', // toggled on <html> element
        options: {
            hideAppHeader: true,
            collapseSidebar: true, // icon-only sidebar
            fullBleedView: true, // stretch content
            setVars: true, // page-level CSS variables
        },
    };

    // ---- CSS injected once ----
    const css = `
  /* Scoped to our route by .family-board-active on <html> */
  html.${CFG.className} {
    --family-kiosk-bg: var(--family-background, #FFFFFF);
    --family-kiosk-text: var(--primary-text-color, #0F172A);
  }

  /* Optional: hide the top HA header (app chrome) */
  ${
      CFG.options.hideAppHeader
          ? `
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed { display: none !important; }`
          : ''
  }

  /* Optional: collapse left sidebar to icons only (still usable) */
  ${
      CFG.options.collapseSidebar
          ? `
  html.${CFG.className} ha-sidebar {
    --mdc-drawer-width: 72px !important;
  }`
          : ''
  }

  /* Optional: make the content area full-bleed and remove extra gaps */
  ${
      CFG.options.fullBleedView
          ? `
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    padding: 0 !important;
    margin: 0 !important;
    background: var(--family-kiosk-bg);
    color: var(--family-kiosk-text);
  }`
          : ''
  }

  /* Example: tweak Lovelace card defaults while active */
  ${
      CFG.options.setVars
          ? `
  html.${CFG.className} {
    --ha-card-border-radius: 0px;
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

    // Observe URL changes (works for HA's client-side routing)
    function start() {
        injectCssOnce();
        onRouteChange();

        // Monkey-patch pushState/replaceState to detect in-app nav
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
