// FullCalendar Row (v2.1.1) - Home Assistant custom card
// Author: Copilot for Anthony Paddison
// Tag: custom:fullcalendar-row
//
// Notes:
// - Requires jQuery + Moment + FullCalendar v2.1.1 (jQuery plugin).
// - Supports: entities (HA calendars), colors, hiddenDays, allDaySlot,
//   header toolbars (v5 names auto-mapped), min/max time, height 100%.
// - nowIndicator is not supported in FC v2 (ignored with console warning).

class FullCalendarRow extends HTMLElement {
  static getStubConfig() {
    return {
      cdn: false,
      // Use your own local files by default; set cdn:true to use CDN
      fcJsUrl: '/local/fullcalendar-2.1.1/fullcalendar.min.js',
      fcCssUrl: '/local/fullcalendar-2.1.1/fullcalendar.min.css',
      jqueryUrl: '/local/fullcalendar-2.1.1/jquery.min.js',
      momentUrl: '/local/fullcalendar-2.1.1/moment.min.js',

      initialView: 'agendaWeek', // v2 names: 'month' | 'agendaWeek' | 'agendaDay' | 'basicWeek' | 'basicDay'
      hiddenDays: [0, 6],
      allDaySlot: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'month,agendaWeek,agendaDay'
      },
      minTime: '06:00:00',
      maxTime: '20:00:00',
      entities: []
    };
  }

  setConfig(config) {
    if (!config || !config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('Configure at least one calendar entity under `entities:`');
    }

    this._config = Object.assign({}, FullCalendarRow.getStubConfig(), config);

    // Root once
    if (!this._root) {
      this._root = this.attachShadow({ mode: 'open' });
      // Card container
      this._card = document.createElement('ha-card');
      this._card.style.overflow = 'hidden';

      // Style to force full height
      const style = document.createElement('style');
      style.textContent = `
        :host { display: block; height: 100%; }
        ha-card { height: 100%; }
        #calendar { height: 100%; }
        /* Ensure FullCalendar grid stretches in the card */
        .fc, .fc-view, .fc-view > table, .fc-view > .fc-scroller {
          height: 100% !important;
          max-height: 100% !important;
        }
      `;

      // Calendar mount point
      this._calEl = document.createElement('div');
      this._calEl.id = 'calendar';

      this._card.appendChild(this._calEl);
      this._root.appendChild(style);
      this._root.appendChild(this._card);
    }

    // Load assets then init
    this._ensureAssets().then(() => this._initCalendar()).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('fullcalendar-row (v2): failed to load assets', e);
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._calendarReady) {
      this._refetchEvents();
    }
  }

  getCardSize() { return 6; }

  // ---------- Asset loading ----------
  async _ensureAssets() {
    const jqueryUrl = '/local/fullcalendar-2.1.1/jquery.min.js';
    const momentUrl = '/local/fullcalendar-2.1.1/moment.min.js';
    const fcJsUrl  = '/local/fullcalendar-2.1.1/fullcalendar.min.js';
    const fcCssUrl = '/local/fullcalendar-2.1.1/fullcalendar.min.css';

    // 1) jQuery
    if (!window.jQuery) {
      await this._loadScript(jqueryUrl);
    }
    const $ = window.jQuery;

    // 2) Moment
    if (!window.moment) {
      await this._loadScript(momentUrl);
    }

    // 3) FullCalendar v2
    if (!$.fn || !$.fn.fullCalendar) {
      await this._loadCss(fcCssUrl, /*intoShadow*/true);
      await this._loadScript(fcJsUrl);
    } else {
      // Ensure CSS applied inside the shadow root too
      await this._loadCss(fcCssUrl, /*intoShadow*/true);
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      // Prevent duplicate by URL
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Script load failed: ${src}`));
      document.head.appendChild(el);
    });
  }

  _loadCss(href, intoShadow = false) {
    return new Promise((resolve, reject) => {
      // If we want the CSS to style shadow DOM content, we must place a <link> in the shadow root.
      if (intoShadow && this._root) {
        const exists = [...this._root.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === href);
        if (exists) return resolve();
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`CSS load failed (shadow): ${href}`));
        this._root.appendChild(link);
      } else {
        if ([...document.styleSheets].some(s => s.href === href)) return resolve();
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`CSS load failed: ${href}`));
        document.head.appendChild(link);
      }
    });
  }

  // ---------- Calendar ----------
  _initCalendar() {
    const $ = window.jQuery;
    if (!this._calEl || !$.fn || !$.fn.fullCalendar) return;

    // Destroy previous instance
    if (this._calendarReady) {
      $(this._calEl).fullCalendar('destroy');
      this._calendarReady = false;
    }

    const cfg = this._config;

    // Map possible v5+ view names to v2 equivalents
    const mapView = (name) => {
      const m = {
        dayGridMonth: 'month',
        timeGridWeek: 'agendaWeek',
        timeGridDay: 'agendaDay',
        listWeek: 'basicWeek',
        listDay: 'basicDay',
      };
      return m[name] || name;
    };

    const mapToolbarStr = (str) => {
      if (!str) return '';
      // tokens separated by commas, spaces allowed
      return str.split(',').map(s => s.trim()).map(mapView).join(',');
    };

    const headerFromToolbar = (tb) => {
      if (!tb) return false;
      return {
        left: mapToolbarStr(tb.left || ''),
        center: mapToolbarStr(tb.center || ''),
        right: mapToolbarStr(tb.right || ''),
      };
    };

    const initialView = mapView(cfg.initialView || 'agendaWeek');

    if (cfg.nowIndicator) {
      // eslint-disable-next-line no-console
      console.warn('fullcalendar-row (v2): nowIndicator is not supported in FullCalendar v2. Ignoring.');
    }

    const eventSources = (cfg.entities || []).map(item => {
      const entity = (typeof item === 'string') ? item : item.entity;
      const color  = (typeof item === 'object') ? item.color : undefined;
      return {
        id: entity,
        color: color,
        events: (start, end, timezone, callback) => {
          this._fetchHaEvents(entity, start.toISOString(), end.toISOString())
            .then(events => callback(events.map(e => this._mapHaEventToFc(e))))
            .catch(err => {
              // eslint-disable-next-line no-console
              console.error('fullcalendar-row (v2): event fetch failed', err);
              callback([]);
            });
        }
      };
    });

    $(this._calEl).fullCalendar({
      header: headerFromToolbar(cfg.headerToolbar) || {
        left: 'prev,next today',
        center: 'title',
        right: 'month,agendaWeek,agendaDay'
      },
      defaultView: initialView,
      editable: false,
      selectable: false,
      eventLimit: true,
      weekNumbers: false,

      // Times & layout
      allDaySlot: cfg.allDaySlot !== false,
      minTime: cfg.minTime || cfg.slotMinTime || '06:00:00', // v2 uses minTime/maxTime
      maxTime: cfg.maxTime || cfg.slotMaxTime || '20:00:00',
      hiddenDays: cfg.hiddenDays || [],
      timezone: 'local',
      height: 'auto',
      contentHeight: 'auto',
      handleWindowResize: true,

      // Events
      eventSources,

      // Formatting similar to v5 'eventTimeFormat'
      timeFormat: 'HH:mm', // 24h; change to 'h(:mm)a' for 12h

      // Re-fetch when navigating
      viewRender: () => {}, // v2 calls events again on nav; no-op here
    });

    this._calendarReady = true;
  }

  async _refetchEvents() {
    const $ = window.jQuery;
    if (this._calendarReady) {
      $(this._calEl).fullCalendar('refetchEvents');
    }
  }

  // ---------- HA integration ----------
  async _fetchHaEvents(entityId, startISO, endISO) {
    if (!this._hass) return [];
    const path = `calendars/${entityId}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;
    return await this._hass.callApi('GET', path);
  }

  _mapHaEventToFc(ev) {
    const title = ev.summary || ev.title || 'Busy';
    return {
      id: ev.uid || ev.id || `${ev.start}-${title}`,
      title: title,
      start: ev.start, // ISO
      end: ev.end,     // ISO
      allDay: !!ev.all_day,
      // You can add more props if you later want popovers/tooltips:
      location: ev.location,
      description: ev.description,
    };
  }
}

customElements.define('fullcalendar-row', FullCalendarRow);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'fullcalendar-row',
  name: 'FullCalendar Row',
  description: 'A FullCalendar row card for Home Assistant calendars',
});
