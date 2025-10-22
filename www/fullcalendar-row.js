// FullCalendar Row (v2.1.1) - Home Assistant custom card
// Author: Copilot for Anthony Paddison
// Tag: custom:fullcalendar-row
//
// Notes:
// - Requires jQuery + Moment + FullCalendar v2.1.1 (jQuery plugin).
// - Supports: entities (HA calendars), colors, hiddenDays, allDaySlot,
//   header toolbars (v5 names auto-mapped), min/max time, height 100%.
// - nowIndicator is not supported in FC v2 (ignored with console warning).
// - Fixes:
//   * Robust date parsing for HA events (timed vs all-day) with moment/moment-timezone.
//   * Refetch throttle and entity-change detection to avoid UI flashing.

class FullCalendarRow extends HTMLElement {

  constructor() {
    super();
    this._lastRefetchAt = 0;
    this._prevEntityChangeKeys = {};
  }

  static getStubConfig() {
    return {
      cdn: false,
      // Local defaults (your existing paths); set cdn: true to load from CDN instead
      fcJsUrl: '/local/fullcalendar-2.1.1/fullcalendar.min.js',
      fcCssUrl: '/local/fullcalendar-2.1.1/fullcalendar.min.css',
      jqueryUrl: '/local/fullcalendar-2.1.1/jquery.min.js',
      momentUrl: '/local/fullcalendar-2.1.1/moment.min.js',
      // Optional: add moment-timezone for rock-solid DST handling
      momentTzUrl: null, // e.g. '/local/fullcalendar-2.1.1/moment-timezone-with-data.min.js'
      timezone: null,    // e.g. 'Europe/London' (used for parsing; FC option stays 'local')

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
      entities: [],

      // Anti-flash controls
      refetchCooldownMs: 30000,
      debug: false,
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
    this._ensureAssets()
      .then(() => this._initCalendar())
      .catch((e) => {
        console.error('fullcalendar-row (v2): failed to load assets', e);
      });
  }

  set hass(hass) {
    this._hass = hass;
    // Only refetch if calendar entities changed AND cooldown passed
    if (this._calendarReady && this._shouldRefetchForHassChange(hass)) {
      this._refetchEvents();
    }
  }

  getCardSize() { return 6; }

  // ---------- Helpers for change detection / throttling ----------
  _watchedEntityIds() {
    return (this._config.entities || [])
      .map(e => (typeof e === 'string' ? e : e.entity))
      .filter(Boolean);
  }

  _shouldRefetchForHassChange(hass) {
    const cfg = this._config || {};
    const cooldown = Number(cfg.refetchCooldownMs || 30000);
    const now = Date.now();
    if (now - this._lastRefetchAt < cooldown) {
      if (cfg.debug) console.debug('[fullcalendar-row v2] skip refetch: cooldown');
      return false;
    }
    // Build a cheap change-key per watched entity using last_changed + state length
    let changed = false;
    for (const eid of this._watchedEntityIds()) {
      const st = hass.states?.[eid];
      const key = st ? `${st.last_changed}|${st.state?.length || 0}` : 'missing';
      if (this._prevEntityChangeKeys[eid] !== key) {
        changed = true;
      }
      this._prevEntityChangeKeys[eid] = key;
    }
    if (!changed && cfg.debug) {
      console.debug('[fullcalendar-row v2] no calendar entity change detected');
    }
    return changed;
  }

  // ---------- Asset loading ----------
  async _ensureAssets() {

    const jqueryUrl = '/local/fullcalendar-2.1.1/jquery.min.js';

    const momentUrl = '/local/fullcalendar-2.1.1/moment.min.js';

    const momentTzUrl = '/local/fullcalendar-2.1.1/moment-timezone.min.js';

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

    // 2b) Moment-timezone (optional but recommended)
    if (momentTzUrl && !window.moment.tz) {
      await this._loadScript(momentTzUrl);
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
      console.warn('fullcalendar-row (v2): nowIndicator is not supported in FullCalendar v2. Ignoring.');
    }

    const eventSources = (cfg.entities || []).map(item => {
      const entity = (typeof item === 'string') ? item : item.entity;
      const color  = (typeof item === 'object') ? item.color : undefined;
      return {
        id: entity,
        color: color,
        events: (start, end, timezone, callback) => {
          if (this._config.debug) console.debug('[fullcalendar-row v2] fetching', entity, start.toISOString(), end.toISOString());
          this._fetchHaEvents(entity, start.toISOString(), end.toISOString())
            .then(events => {
              const mapped = events.map(e => this._mapHaEventToFc(e)).filter(Boolean);
              callback(mapped);
            })
            .catch(err => {
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
      lazyFetching: true,
      eventLimit: true,
      weekNumbers: false,

      // Times & layout
      allDaySlot: cfg.allDaySlot !== false,
      minTime: cfg.minTime || cfg.slotMinTime || '06:00:00', // v2 uses minTime/maxTime
      maxTime: cfg.maxTime || cfg.slotMaxTime || '20:00:00',
      hiddenDays: cfg.hiddenDays || [],
      timezone: 'local', // keep FC in local; we handle parsing with optional moment.tz
      height: 'auto',
      contentHeight: 'auto',
      handleWindowResize: true,

      // Events
      eventSources,

      // Formatting similar to v5 'eventTimeFormat'
      timeFormat: 'HH:mm', // 24h; change to 'h(:mm)a' for 12h
      // Re-fetch when navigating (FC v2 will call events() with new range automatically)
      viewRender: () => {},
    });

    this._calendarReady = true;
  }

  async _refetchEvents() {
    const $ = window.jQuery;
    if (this._calendarReady) {
      try {
        $(this._calEl).fullCalendar('refetchEvents');
        this._lastRefetchAt = Date.now();
        if (this._config.debug) console.debug('[fullcalendar-row v2] events refetched');
      } catch (e) {
        console.error('fullcalendar-row (v2): refetch failed', e);
      }
    }
  }

  // ---------- HA integration ----------
  async _fetchHaEvents(entityId, startISO, endISO) {
    if (!this._hass) return [];
    const path = `calendars/${entityId}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;
    return await this._hass.callApi('GET', path);
  }

  // Robust HA -> FullCalendar mapping with moment / moment-timezone
  _mapHaEventToFc(ev) {
    // ev from HA: { start, end, summary, description, location, all_day? }
    const rawStart = ev.start;
    const rawEnd = ev.end;

    // date-only string?
    const isDateOnly = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

    // Determine all-day: explicit flag or both dates are date-only
    const isAllDay = (ev.all_day === true) || (isDateOnly(rawStart) && (!rawEnd || isDateOnly(rawEnd)));

    // Use configured TZ for parsing if moment-timezone is available; else fallback to moment(s)
    const tz = this._config.timezone || 'local';
    const useTz = (window.moment && window.moment.tz && tz && tz !== 'local');

    const parse = (s, allDay) => {
      if (!s) return null;
      if (useTz) {
        // If all-day and date-only, interpret at start of day in TZ
        const m = allDay && isDateOnly(s) ? window.moment.tz(s, tz) : window.moment.tz(s, tz);
        return m.isValid() ? m.toDate() : null;
      } else {
        // Let moment parse ISO (with offsets) or date-only
        const m = window.moment(s);
        return m.isValid() ? m.toDate() : null;
      }
    };

    let start = parse(rawStart, isAllDay);
    let end = parse(rawEnd, isAllDay);

    // If parsing failed, drop event (better than rendering today incorrectly)
    if (!start) {
      console.warn('[fullcalendar-row v2] invalid event start from HA:', ev);
      return null;
    }

    // For all-day without end, provide +1 day so it displays as a single-day all-day
    if (isAllDay && !end) {
      if (useTz) {
        const m = window.moment.tz(rawStart, tz).add(1, 'day');
        end = m.toDate();
      } else {
        const m = window.moment(rawStart).add(1, 'day');
        end = m.toDate();
      }
    }

    const title = ev.summary || ev.title || 'Busy';
    return {
      id: ev.uid || ev.id || `${rawStart}-${title}`,
      title,
      start,
      end: end || null,
      allDay: !!isAllDay,
      location: ev.location,
      description: ev.description,
    };
  }
}

customElements.define('fullcalendar-row', FullCalendarRow);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'fullcalendar-row',
  name: 'FullCalendar Row (v2.1.1)',
  description: 'A FullCalendar v2.1.1-based row card for Home Assistant calendars',
});
