// fullcalendar-row.js
// Lovelace custom card embedding FullCalendar v6 with hour-by-hour views.
// - Fixes loader race condition with a single-flight promise + short retry.
// - Loads FullCalendar CSS (optional but recommended) and JS (CDN or /local).
// - Removes hard min-height to avoid unexpected grid gaps.
// - Works with any Home Assistant calendar.* entity (Google/CalDAV/Local).
//
// Example YAML:
// type: custom:fullcalendar-row
// view_layout: { grid-area: main }
// title: Week at a Glance
// initialView: timeGridWeek
// hiddenDays: [0, 6]
// allDaySlot: false
// nowIndicator: true
// cdn: false
// fcJsUrl:  /local/fullcalendar/index.global.min.js
// entities:
//   - entity: calendar.family
//     color: "#6a7f73"
//   - entity: calendar.kids
//     color: "#f39c12"
//   - entity: calendar.work
//     color: "#9aa6a0"
// headerToolbar:
//   left: prev,next today
//   center: title
//   right: dayGridMonth,timeGridWeek,timeGridDay,listWeek

let _fcLoadingPromise = null; // single-flight guard shared across instances

class FullCalendarRow extends HTMLElement {
  static getStubConfig() {
    return { entities: [], initialView: "timeGridDay" };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");

    this._config = this._normalizeConfig(config);

    if (!this._card) {
      this._card = document.createElement("ha-card");
      if (this._config.title) this._card.setAttribute("header", this._config.title);

      this._container = document.createElement("div");
      // No hard min-height to prevent layout gaps in grid-layout views
      this._container.style.cssText = "height:100%;min-height:0;padding:0;";
      this._card.appendChild(this._container);
      this.appendChild(this._card);
    }

    // Re-render if HA already provided
    if (this._hass && this._calendarReady) this._renderCalendar();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._calendarReady) {
      this._ensureFullCalendar()
        .then(() => {
          this._calendarReady = true;
          this._renderCalendar();
        })
        .catch((err) => {
          // Soft-fail: log error but don't crash the card
          console.error("FullCalendar load failed", err);
          this._showError("Failed to load FullCalendar assets (see console).");
        });
    }
  }

  // ---------- helpers ----------

  _normalizeConfig(raw) {
    const defaults = {
      title: "",
      entities: [],                 // [{ entity: 'calendar.x', color: '#hex' }, ...]
      initialView: "timeGridDay",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      allDaySlot: true,
      slotMinTime: "07:00:00",
      slotMaxTime: "21:00:00",
      hiddenDays: [],
      nowIndicator: true,
      // asset loading
      cdn: true,
      fcJsUrl:  "/local/fullcalendar/index.global.min.js",
    };
    const cfg = { ...defaults, ...raw };
    cfg.entities = (cfg.entities || []).map((e) => (typeof e === "string" ? { entity: e } : e));
    return cfg;
  }

  async _ensureFullCalendar() {
    // Fast path
    if (window.FullCalendar?.Calendar) return;

    // Single-flight across all card instances
    if (_fcLoadingPromise) {
      await _fcLoadingPromise;
      return;
    }

    const loadOnce = async () => {
      const cfg = this._config || {};

      // Load CSS (recommended) and JS
      if (cfg.cdn) {
        await this._loadScript("/local/fullcalendar/fullcalendar.min.js");
      } else {
        await this._loadScript(cfg.fcJsUrl || "/local/fullcalendar/fullcalendar.min.js");
      }

      // Retry up to ~500ms for global to attach (prevents false negatives)
      const start = performance.now();
      while (!window.FullCalendar?.Calendar && performance.now() - start < 500) {
        // Yield to event loop
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 25));
      }

      if (!window.FullCalendar?.Calendar) {
        // Do not throw hard; warn and let subsequent renders try again
        console.warn("FullCalendar not available yet after load attempt.");
      }
    };

    _fcLoadingPromise = loadOnce()
      .catch((err) => {
        console.error("FullCalendar asset load error:", err);
      })
      .finally(() => {
        // Keep promise cached so other instances await the same resolution
      });

    await _fcLoadingPromise;
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      try {
        const abs = new URL(src, location.href).href;
        if ([...document.scripts].some((s) => s.src === abs)) return resolve();

        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Script load failed: ${src}`));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  async _autoDiscoverCalendars() {
    // Prefer /api/calendars list; fallback to states
    try {
      const calendars = await this._hass.callApi("get", "calendars");
      if (Array.isArray(calendars) && calendars.length) {
        return calendars.map((c) => ({ entity: c.entity_id }));
      }
    } catch {
      // ignore
    }
    return Object.keys(this._hass.states)
      .filter((eid) => eid.startsWith("calendar."))
      .map((eid) => ({ entity: eid }));
  }

  _eventsSource() {
    return async (info, success, failure) => {
      try {
        const startISO = info.start.toISOString();
        const endISO = info.end.toISOString();

        let entities = this._config.entities;
        if (!entities?.length) entities = await this._autoDiscoverCalendars();

        const results = await Promise.all(
          entities.map(async (e) => {
            const entityId = e.entity;
            const list = await this._hass.callApi(
              "get",
              `calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
            );
            return (list || []).map((ev) => ({
              title: ev.summary || "(no title)",
              start: ev.start,
              end: ev.end,
              allDay: !!ev.all_day,
              backgroundColor: e.color || undefined,
              borderColor: e.color || undefined,
              extendedProps: {
                entity_id: entityId,
                raw: ev,
                location: ev.location,
                description: ev.description,
              },
            }));
          })
        );

        success(results.flat());
      } catch (err) {
        console.error("Events load error", err);
        failure(err);
      }
    };
  }

  _renderCalendar() {
    if (!this._container || !window.FullCalendar?.Calendar) return;

    // Clean previous
    if (this._calendar) {
      this._calendar.destroy();
      this._calendar = undefined;
    }

    if (!this._calendarDiv) {
      this._calendarDiv = document.createElement("div");
      // Pull colors from HA theme variables where possible
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

    const FC = window.FullCalendar;
    const cfg = this._config;
    const locale = this._hass?.locale?.language || navigator.language || "en";

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
      events: this._eventsSource(),
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
  getCardSize() { return 7; } // masonry mode hint
  getGridOptions() {          // sections mode hint
    return { rows: 8, columns: 12, min_rows: 4, max_rows: 12 };
  }
}

customElements.define("fullcalendar-row", FullCalendarRow);
