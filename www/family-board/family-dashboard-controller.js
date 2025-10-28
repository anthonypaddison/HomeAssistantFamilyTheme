// /config/www/family-board/family-dashboard-controller.js
(() => {
    const CFG = {
        routeContains: '/family',
        className: 'family-board-active',
        options: { hideAppHeader: true, collapseSidebar: true, fullBleedView: true, setVars: true },
    };

    const css = `
  html.${CFG.className} {
    --family-background: var(--primary-background-color, #0b1020);
    --family-text: var(--primary-text-color, #e6eaf6);
  }
  ${
      CFG.options.hideAppHeader
          ? `
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed { display: none !important; }`
          : ''
  }
  ${
      CFG.options.collapseSidebar
          ? `
  html.${CFG.className} ha-sidebar { --mdc-drawer-width: 72px !important; }`
          : ''
  }
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
        document.documentElement.classList.toggle(CFG.className, active);
    }

    function start() {
        injectCssOnce();
        onRouteChange();
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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
