// /config/www/family-board/family-dashboard-controller.js
(() => {
    const CFG = {
        routeContains: '/family',
        className: 'family-board-active',
        options: { hideAppHeader: true, collapseSidebar: true, fullBleedView: true, setVars: true },
    };

    // All colours/radii are local here (copied from your theme palette), not global.
    const css = `
  html.${CFG.className} {
    /* === LOCAL TOKENS (only active on /family) === */

    /* Palette (from your previous theme file) */
    --palette-mint:     #B9FBC0;
    --palette-aqua:     #98F5E1;
    --palette-cyan:     #8EECF5;
    --palette-sky:      #90DBF4;
    --palette-bluegrey: #A3C4F3;
    --palette-lilac:    #CFBAF0;
    --palette-rose:     #FFCFD2;
    --palette-vanilla:  #FBF8CC;

    /* Core colours */
    --primary-color:        var(--palette-mint);
    --accent-color:         var(--palette-lilac);
    --primary-text-color:   #0F172A;
    --secondary-text-color: #475569;
    --divider-color:        #E5E7EB;

    /* Surfaces / backgrounds (light) */
    --family-background: #FFFFFF;
    --family-surface:    #FFFFFF;

    /* Local-only board variables (what the card consumes) */
    --fb-bg:          var(--family-background);
    --fb-surface:     var(--family-surface);
    --fb-surface-2:   var(--family-surface);
    --fb-text:        var(--primary-text-color);
    --fb-muted:       var(--secondary-text-color);
    --fb-accent:      var(--accent-color);
    --fb-grid:        var(--divider-color);
    --fb-today:       #F6F7FF;                          /* tweak if you want */
    --fb-weekend:     rgba(15, 23, 42, 0.04);           /* tweak if you want */
    --fb-pill-text:   #FFFFFF;
    --fb-print-text:  #111;

    /* Radius: local to this view only */
    --fb-radius: 12px;

    /* Reflect radius to HA cards IN THIS VIEW ONLY */
    --ha-card-border-radius: var(--fb-radius);
    --ha-card-box-shadow: none;
    --masonry-view-card-margin: 0px;

    /* Per-person colours (local; used by chips & events) */
    --family-color-family:  #36B37E;
    --family-color-anthony: #7E57C2;
    --family-color-joy:     #F4B400;
    --family-color-lizzie:  #EC407A;
    --family-color-toby:    #42A5F5;
    --family-color-routine: #b2fd7f;
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
    background: var(--family-background); color: var(--primary-text-color);
  }`
          : ''
  }

  ${
      CFG.options.setVars
          ? `
  html.${CFG.className} { --masonry-view-card-margin: 0px; }`
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
