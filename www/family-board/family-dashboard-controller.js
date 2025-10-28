// /config/www/family-board/family-dashboard-controller.js
// Scoped theming + layout controls for the Family dashboard only.
// Becomes active when the route contains `/family`.

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
    // Tweaks requested by Anthony:
    // - Chips, header, and sidebar surface: palette-lilac #CFBAF0
    // - Main view background: white
    // - Sidebar buttons: transparent when inactive, white when active
    // - HA app header: palette-lilac #CFBAF0
    const css = `
  /* ======== FAMILY DASHBOARD SCOPE ======== */
  html.${CFG.className} {

    /* --- Local palette (minimal, we only need lilac here) --- */
    --palette-lilac:    #CFBAF0;
    --primary-text-color:   #0F172A;
    --secondary-text-color: #475569;
    --divider-color:        #E5E7EB;

    /* --- Surfaces for this dashboard --- */
    --family-background: #FFFFFF;          /* MAIN view background (calendar area) */
    --family-surface:    var(--palette-lilac); /* Header, chips bar, in-card sidebar background */

    /* --- Variables consumed by the custom card CSS --- */
    --fb-bg:         var(--family-background);  /* main area white */
    --fb-surface:    var(--family-surface);     /* header + chips + in-card sidebar lilac */
    --fb-surface-2:  var(--family-background);  /* calendar body surface under toolbar */
    --fb-text:       var(--primary-text-color);
    --fb-muted:      var(--secondary-text-color);
    --fb-accent:     var(--palette-lilac);      /* FC toolbar buttons default to lilac */
    --fb-grid:       var(--divider-color);
    --fb-today:      #F6F7FF;
    --fb-weekend:    rgba(15, 23, 42, 0.04);
    --fb-pill-text:  #FFFFFF;
    --fb-print-text: #111;

    /* --- Corner radius (single source of truth) --- */
    --fb-radius: 12px;
    --ha-card-border-radius: var(--fb-radius);
    --ha-card-box-shadow: none;
    --masonry-view-card-margin: 0px;

    /* --- Per-person colours used by chips & events --- */
    --family-color-family:  #36B37E;
    --family-color-anthony: #7E57C2;
    --family-color-joy:     #F4B400;
    --family-color-lizzie:  #EC407A;
    --family-color-toby:    #42A5F5;
    --family-color-routine: #b2fd7f;

    /* --- OVERRIDE HA APP CHROME (header + left HA sidebar) LOCALLY --- */
    --app-header-background-color: var(--palette-lilac);   /* HA app header lilac */
    --app-header-text-color:       var(--primary-text-color);
    --app-header-border-bottom:    0;

    --sidebar-background-color:    var(--palette-lilac);   /* HA left sidebar lilac */
    --sidebar-text-color:          var(--primary-text-color);
    --sidebar-icon-color:          var(--secondary-text-color);
    --sidebar-selected-text-color: var(--primary-text-color);
    --sidebar-selected-icon-color: var(--primary-text-color);

    /* Some HA components still read this for page bg – keep it white here */
    --primary-background-color:    var(--family-background);
  }

  /* ======== LAYOUT/CHROME ENFORCEMENT (still scoped) ======== */

  /* Ensure the page shell is white where it should be */
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

  /* HA Header (if visible) */
  html.${CFG.className} app-header,
  html.${CFG.className} ha-top-app-bar-fixed {
    background: var(--app-header-background-color) !important;
    color: var(--app-header-text-color) !important;
    border-bottom: var(--app-header-border-bottom, 0) !important;
  }

  /* HA Left Sidebar (chrome) */
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

  /* Remove default paddings/margins in the panel view */
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
