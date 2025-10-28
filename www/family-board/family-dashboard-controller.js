// /config/www/family-board/family-dashboard-controller.js
// Scoped theming + layout controls for the Family dashboard only.
// Applies when the current route contains `/family` by toggling a class on <html>.

(() => {
    const CFG = {
        routeContains: '/family',
        className: 'family-board-active',
        options: {
            hideAppHeader: true, // set to false if you want the HA header visible
            collapseSidebar: true, // compact sidebar width in this view
            fullBleedView: true, // remove default paddings/margins around the view
            setVars: true, // set common HA layout variables
        },
    };

    // All variables below are LOCAL to /family (no global theme needed).
    // Tweak colours/radius here to taste.
    const css = `
  /* ======== FAMILY DASHBOARD SCOPE ======== */
  html.${CFG.className} {

    /* --- Local palette (lifted from your previous theme) --- */
    --palette-mint:     #B9FBC0;
    --palette-aqua:     #98F5E1;
    --palette-cyan:     #8EECF5;
    --palette-sky:      #90DBF4;
    --palette-bluegrey: #A3C4F3;
    --palette-lilac:    #CFBAF0;
    --palette-rose:     #FFCFD2;
    --palette-vanilla:  #FBF8CC;

    /* --- Core colours --- */
    --primary-color:        var(--palette-mint);
    --accent-color:         var(--palette-lilac);
    --primary-text-color:   #0F172A;
    --secondary-text-color: #475569;
    --divider-color:        #E5E7EB;

    /* --- Base surfaces for this dashboard --- */
    --family-background: #FFFFFF;  /* page background */
    --family-surface:    #FFFFFF;  /* header/sidebar/card surface */

    /* --- Variables consumed by the custom card CSS --- */
    --fb-bg:         var(--family-background);
    --fb-surface:    var(--family-surface);
    --fb-surface-2:  var(--family-surface);
    --fb-text:       var(--primary-text-color);
    --fb-muted:      var(--secondary-text-color);
    --fb-accent:     var(--accent-color);
    --fb-grid:       var(--divider-color);
    --fb-today:      #F6F7FF;
    --fb-weekend:    rgba(15, 23, 42, 0.04);
    --fb-pill-text:  #FFFFFF;
    --fb-print-text: #111;

    /* --- Corner radius (single source of truth for the board) --- */
    --fb-radius: 12px;

    /* Reflect radius/spacing to HA cards IN THIS VIEW ONLY */
    --ha-card-border-radius: var(--fb-radius);
    --ha-card-box-shadow: none;
    --masonry-view-card-margin: 0px;

    /* --- Per-person colours used by chips & calendar events --- */
    --family-color-family:  #36B37E;
    --family-color-anthony: #7E57C2;
    --family-color-joy:     #F4B400;
    --family-color-lizzie:  #EC407A;
    --family-color-toby:    #42A5F5;
    --family-color-routine: #b2fd7f;

    /* --- OVERRIDE HA APP CHROME (header + sidebar) LOCALLY --- */
    --app-header-background-color: var(--family-surface);
    --app-header-text-color:       var(--primary-text-color);
    --app-header-border-bottom:    0;

    --sidebar-background-color:    var(--family-surface);
    --sidebar-text-color:          var(--primary-text-color);
    --sidebar-icon-color:          var(--secondary-text-color);
    --sidebar-selected-text-color: var(--primary-text-color);
    --sidebar-selected-icon-color: var(--primary-color);

    /* Ensure HA components that read only primary bg pick up our background */
    --primary-background-color:    var(--family-background);
  }

  /* ======== LAYOUT/CHROME ENFORCEMENT (still scoped) ======== */

  /* Full-bleed background for the entire app shell while on /family */
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

  /* Header styling (in case you unhide it) */
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed {
    background: var(--app-header-background-color) !important;
    color: var(--app-header-text-color) !important;
    border-bottom: var(--app-header-border-bottom, 0) !important;
  }

  /* Sidebar surface + icons */
  html.${CFG.className} ha-sidebar {
    background: var(--sidebar-background-color) !important;
    color: var(--sidebar-text-color) !important;
  }
  html.${CFG.className} ha-sidebar::part(container) {
    background: var(--sidebar-background-color) !important;
  }
  html.${CFG.className} ha-sidebar ha-icon {
    color: var(--sidebar-icon-color) !important;
  }
  html.${CFG.className} ha-sidebar a[aria-current="page"] ha-icon,
  html.${CFG.className} ha-sidebar a[aria-current="page"] {
    color: var(--sidebar-selected-icon-color) !important;
  }

  /* Remove default paddings/margins in the panel view for true full-bleed */
  html.${CFG.className} #view,
  html.${CFG.className} hui-view,
  html.${CFG.className} hui-panel-view {
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Hide the HA header if configured */
  ${
      CFG.options.hideAppHeader
          ? `
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed { display: none !important; }`
          : ''
  }

  /* Collapse sidebar width if configured */
  ${
      CFG.options.collapseSidebar
          ? `
  html.${CFG.className} ha-sidebar { --mdc-drawer-width: 72px !important; }`
          : ''
  }

  `; // end css
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
