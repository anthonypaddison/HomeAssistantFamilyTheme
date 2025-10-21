// fullcalendar-row.js
// Lovelace custom card embedding FullCalendar v6 with hour-by-hour views.
//
// Requires a Lovelace resource entry pointing to /local/fullcalendar-row.js.
// Usage example in a dashboard:
//
// type: custom:fullcalendar-row
// entities:
//   - entity: calendar.family
//     color: '#6a7f73'
//   - entity: calendar.work
//     color: '#9aa6a0'
// initialView: timeGridWeek
// slotMinTime: '07:00:00'
// slotMaxTime: '21:00:00'
// headerToolbar:
//   left: 'prev,next today'
//   center: 'title'
//   right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
// hiddenDays: [0,6]
// allDaySlot: false
// nowIndicator: true
// cdn: true  // set false if self-hosting FullCalendar assets
// fcJsUrl:  '/local/fullcalendar/index.global.min.js' // used when cdn=false

class FullCalendarCard extends HTMLElement {
  static getConfigElement() { return null; } // (Optional) build an editor later
  static getStubConfig() { return { entities: [], initialView: "timeGridDay" }; }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = this._normalizeConfig(config);
    // Prepare root
    if (!this._card) {
      this._card = document.createElement("ha-card");
      this._card.setAttribute("header", this._config.title || "");
      this._container = document.createElement("div");
      this._container.style.cssText = "height: 100%; min-height: 420px; padding: 8px;";
      this._card.appendChild(this._container);
      this.appendChild(this._card);
    }
    // Re-render if hass already present
    if (this._hass && this._calendarReady) this._renderCalendar();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._calendarReady) {
      // First time: load FC, then render
      this._ensureFullCalendar().then(() => {
        this._calendarReady = true;
        this._renderCalendar();
      }).catch((err) => {
        console.error("FullCalendar load failed", err);
        this._showError("Failed to load FullCalendar assets. See browser console.");
      });
    } else if (this._calendar) {
      // Locale/timezone updates on hass changes: optional
    }
  }

  // ---- Internal helpers ----

  _normalizeConfig(raw) {
    const defaults = {
      title: "",
      entities: [],
      initialView: "timeGridDay",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      allDaySlot: true,
      slotMinTime: "00:00:00",
      slotMaxTime: "24:00:00",
      hiddenDays: [],
      nowIndicator: true,
      cdn: true,
      fcJsUrl: "/config/fullcalendar.min.js",
    };
    const cfg = { ...defaults, ...raw };
    cfg.entities = (cfg.entities || []).map(e => (typeof e === "string" ? { entity: e } : e));
    return cfg;
  }

  async _ensureFullCalendar() {
    if (window.FullCalendar?.Calendar) return;
    const cfg = this._config || {};
    if (cfg.cdn) {
      await this._loadScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.js");
    } else {
      await this._loadScript(cfg.fcJsUrl);
    }
    if (!window.FullCalendar?.Calendar) {
      throw new Error("FullCalendar not available after loading.");
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const abs = new URL(src, location.href).href;
      if ([...document.scripts].some(s => s.src === abs)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Script load failed: ${src}`));
      document.head.appendChild(s);
    });
  }

  _buildEventsSource() {
    return async (info, success, failure) => {
      try {
        const startISO = info.start.toISOString();
        const endISO = info.end.toISOString();

        let entities = this._config.entities;
        if (!entities?.length) {
          // Auto-discover calendar entities if none provided
          entities = await this._autoDiscoverCalendars();
        }
        const results = await Promise.all(
          entities.map(async e => {
            const entityId = e.entity;
            const list = await this._hass.callApi(
              "get",
              `calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
            );
            return (list || []).map(ev => ({
              title: ev.summary || "(no title)",
              start: ev.start,
              end: ev.end,
              allDay: !!ev.all_day,
              backgroundColor: e.color || undefined,
              borderColor: e.color || undefined,
              extendedProps: { entity_id: entityId, raw: ev, location: ev.location, description: ev.description },
            }));
          })
        );
        success(results.flat());
      } catch (err) {
        console.error(err);
        failure(err);
      }
    };
  }

  async _autoDiscoverCalendars() {
    // Try REST calendars list; otherwise infer from states
    try {
      const calendars = await this._hass.callApi("get", "calendars");
      if (Array.isArray(calendars) && calendars.length) {
        return calendars.map(c => ({ entity: c.entity_id }));
      }
    } catch {/* ignore */}
    return Object.keys(this._hass.states)
      .filter(eid => eid.startsWith("calendar."))
      .map(eid => ({ entity: eid }));
  }

  _renderCalendar() {
    if (!this._container || !window.FullCalendar?.Calendar) return;
    const FC = window.FullCalendar;

    // Clean previous
    if (this._calendar) {
      this._calendar.destroy();
      this._calendar = undefined;
    }
    // Build mount point
    if (!this._calendarDiv) {
      this._calendarDiv = document.createElement("div");
      this._calendarDiv.style.cssText = `
        height: 100%;
        --fc-border-color: var(--divider-color, #e0e0e0);
        --fc-page-bg-color: var(--card-background-color, #fafafa);
        --fc-neutral-bg-color: var(--primary-background-color, #fff);
        --fc-text-color: var(--primary-text-color, #1f1f1f);
        --fc-now-indicator-color: var(--primary-color, #03a9f4);
      `;
      this._container.innerHTML = "";
      this._container.appendChild(this._calendarDiv);
    }

    const locale = this._hass?.locale?.language || navigator.language || "en";
    const cfg = this._config;

    this._calendar = new FC.Calendar(this._calendarDiv, {
      locale,
      timeZone: "local",
      initialView: cfg.initialView,
      headerToolbar: cfg.headerToolbar,
      allDaySlot: cfg.allDaySlot,
      nowIndicator: cfg.nowIndicator,
      hiddenDays: cfg.hiddenDays,
      slotMinTime: cfg.slotMinTime,
      slotMaxTime: cfg.slotMaxTime,
      height: "100%",
      expandRows: true,
      dayMaxEvents: true,
      events: this._buildEventsSource(),
      eventClick: (info) => {
        const raw = info.event.extendedProps?.raw || {};
        const url = raw.htmlLink || info.event.url;
        if (url) window.open(url, "_blank", "noopener");
      },
      eventDidMount: (info) => {
        const raw = info.event.extendedProps?.raw || {};
        const desc = raw.description ? `\n${raw.description}` : "";
        info.el.title = `${info.event.title}${desc}`;
      },
    });

    this._calendar.render();
  }

  _showError(msg) {
    if (!this._card) return;
    const el = document.createElement("hui-warning");
    el.textContent = msg;
    this._card.appendChild(el);
  }

  // Lovelace layout hints
  getCardSize() { return 7; }     // masonry hint
  getGridOptions() {               // sections view hint
    return { rows: 8, columns: 12, min_rows: 5, max_rows: 12 };
  }
}

// Register the custom element
customElements.define("fullcalendar-row", FullCalendarCard);
