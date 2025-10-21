// fullcalendar-row.js
// Lovelace custom card embedding FullCalendar v6 (global build).
// - Event-driven single-flight loader (no await in hass path) to prevent hangs.
// - No CSS loading (intentionally omitted per your requirement).
// - Autodiscovery for HA calendar.* entities.
// - ResizeObserver for layout correctness in dashboards.
// - Locale / first day / 24h time mapped from Home Assistant.
// - Safe window.open (noopener,noreferrer).
// - Robust against race conditions in events loading.

let _fcLoader = {
  status: "idle",   // idle | loading | loaded | error
  waiters: [],      // callbacks to run when FC is ready
  src: null,        // last attempted script src
};

// Queue a callback to run when FullCalendar global is ready
function onFullCalendarReady(srcResolver, onReady, onError) {
  // Already loaded?
  if (window.FullCalendar?.Calendar) {
    onReady();
    return;
  }
  if (_fcLoader.status === "loaded") {
    onReady();
    return;
  }

  // Enqueue
  _fcLoader.waiters.push({ onReady, onError });

  // Kick off loading if not already
  if (_fcLoader.status !== "loading") {
    const src = srcResolver();
    _fcLoader.status = "loading";
    _fcLoader.src = src;

    // If script with same src already exists, attach listeners
    const abs = new URL(src, location.href).href;
    const existing = [...document.scripts].find((s) => s.src === abs);

    const done = () => {
      if (window.FullCalendar?.Calendar) {
        _fcLoader.status = "loaded";
        const toRun = _fcLoader.waiters.splice(0);
        toRun.forEach(w => { try { w.onReady && w.onReady(); } catch {} });
      } else {
        // Global didn't attach—treat as error and allow retry later
        _fcLoader.status = "error";
        const toRun = _fcLoader.waiters.splice(0);
        toRun.forEach(w => { try { w.onError && w.onError(new Error("FullCalendar global not available")); } catch {} });
      }
    };

    const fail = (err) => {
      _fcLoader.status = "error";
      const toRun = _fcLoader.waiters.splice(0);
      toRun.forEach(w => { try { w.onError && w.onError(err); } catch {} });
    };

    if (existing) {
      // If it's already in the DOM, wait for onload if possible; otherwise poll briefly
      if (existing.dataset._fcHooked !== "1") {
        existing.dataset._fcHooked = "1";
        existing.addEventListener("load", () => setTimeout(done, 0));
        existing.addEventListener("error", () => fail(new Error("FullCalendar script error")));
      }
      // Fallback: short poll in case load already fired before we hooked listeners
      let tries = 0;
      const poll = () => {
        if (window.FullCalendar?.Calendar) return done();
        if (++tries > 30) return done(); // give up; will mark error if still missing
        setTimeout(poll, 25);
      };
      poll();
    } else {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset._fcHooked = "1";
      s.addEventListener("load", () => {
        // Give the global a moment to attach
        setTimeout(done, 0);
      });
      s.addEventListener("error", () => fail(new Error(`Script load failed: ${src}`)));
      document.head.appendChild(s);
    }
  }
}

class FullCalendarRow extends HTMLElement {
  constructor() {
    super();
    this._config = undefined;
    this._hass = undefined;
    this._card = undefined;
    this._container = undefined;
    this._calendarDiv = undefined;
    this._calendar = undefined;
    this._calendarReady = false;
    this._eventsNonce = 0;
    this._ro = null;
    this._lastLocaleKey = "";
  }

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
      this._container.style.cssText = "height:100%;min-height:0;padding:0;";
      this._card.appendChild(this._container);
      this.appendChild(this._card);
    } else {
      if (this._config.title) this._card.setAttribute("header", this._config.title);
      else this._card.removeAttribute("header");
    }

    // Re-render if HA already provided and FC ready
    if (this._hass && this._calendarReady) {
      this._renderCalendar();
    }
  }

  set hass(hass) {
    this._hass = hass;

    // Use event-driven loader (no await)
    if (!this._calendarReady) {
      onFullCalendarReady(
        () => this._resolveFcSrc(),
        () => {
          this._calendarReady = true;
          this._renderCalendar();
        },
        (err) => {
          console.error("FullCalendar load failed", err);
          this._showError("Failed to load FullCalendar JS (see console). Retrying...");
          // Soft retry later
          setTimeout(() => {
            if (!this._calendarReady) {
              onFullCalendarReady(
                () => this._resolveFcSrc(),
                () => { this._calendarReady = true; this._renderCalendar(); },
                (e2) => console.warn("Retry: FullCalendar still not available", e2)
              );
            }
          }, 800);
        }
      );
    } else {
      this._applyRuntimeOptionUpdates();
    }
  }

  disconnectedCallback() {
    if (this._ro) {
      try { this._ro.disconnect(); } catch {}
      this._ro = null;
    }
    if (this._calendar) {
      try { this._calendar.destroy(); } catch {}
      this._calendar = undefined;
    }
    this._calendarDiv = undefined;
  }

  // ---------- helpers ----------

  _normalizeConfig(raw) {
    const defaults = {
      title: "",
      entities: [], // [{ entity: 'calendar.x', color: '#hex' }, ...] or "calendar.x"
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
      dayMaxEvents: true,
      expandRows: true,
      weekNumbers: false,
      stickyHeaderDates: true,
      moreLinkClick: "popover",
      // Asset loading
      cdn: true,
      // IMPORTANT: FullCalendar v6 global build filename
      fcJsUrl: "/local/fullcalendar/index.global.min.js",
    };
    const cfg = { ...defaults, ...raw };
    cfg.entities = (cfg.entities || []).map((e) => (typeof e === "string" ? { entity: e } : e));
    return cfg;
  }

  _resolveFcSrc() {
    const cfg = this._config || {};
    if (cfg.cdn) {
      // Official CDN global build for v6
      return "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.js";
    }
    // Local path override (must be the global build)
    return cfg.fcJsUrl || "/local/fullcalendar/index.global.min.js";
  }

  async _autoDiscoverCalendars() {
    try {
      const calendars = await this._hass.callApi("get", "calendars");
      if (Array.isArray(calendars) && calendars.length) {
        return calendars.map((c) => ({ entity: c.entity_id }));
      }
    } catch {
      // ignore
    }
    return Object.keys(this._hass.states || {})
      .filter((eid) => eid.startsWith("calendar."))
      .map((eid) => ({ entity: eid }));
  }

  _computeHaLocaleOptions() {
    const haLocale = this._hass?.locale || {};
    const lang = haLocale.language || navigator.language || "en";
    const firstDay = Number.isInteger(haLocale.first_day) ? haLocale.first_day : 1;

    const tf = haLocale.time_format || "system";
    let hour12;
    if (tf === "12") hour12 = true;
    else if (tf === "24") hour12 = false;
    else {
      const fmt = new Intl.DateTimeFormat(lang, { hour: "numeric" }).format(0);
      hour12 = /am|pm/i.test(fmt);
    }

    const key = `${lang}|${firstDay}|${hour12 ? "12h" : "24h"}`;
    return {
      lang,
      firstDay,
      hour12,
      localeKey: key,
      slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12 },
      eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12 },
      dir: this._hass?.locale?.rtl ? "rtl" : "ltr",
    };
  }

  _eventsSource() {
    return async (info, success, failure) => {
      const myNonce = ++this._eventsNonce;

      try {
        const startISO = info.start.toISOString();
        const endISO = info.end.toISOString();

        let entities = this._config.entities;
        if (!entities?.length) entities = await this._autoDiscoverCalendars();
        if (!entities?.length) {
          console.warn("fullcalendar-row: No calendar entities found.");
          if (this._eventsNonce === myNonce) success([]);
          return;
        }

        const results = await Promise.all(
          entities.map(async (e) => {
            const entityId = e.entity;
            const list = await this._hass.callApi(
              "get",
              `calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
            );
            return (list || []).map((ev) => {
              const isAllDay =
                !!ev.all_day ||
                (typeof ev.start === "string" && ev.start.length === 10) ||
                (typeof ev.end === "string" && ev.end.length === 10);

              const base = {
                title: ev.summary || "(no title)",
                start: ev.start,
                end: ev.end,
                allDay: isAllDay,
                extendedProps: {
                  entity_id: entityId,
                  raw: ev,
                  location: ev.location,
                  description: ev.description,
                },
              };

              if (e.color) {
                base.color = e.color;
                if (e.textColor) base.textColor = e.textColor;
              }
              return base;
            });
          })
        );

        if (this._eventsNonce === myNonce) {
          success(results.flat());
        }
      } catch (err) {
        console.error("fullcalendar-row: Events load error", err);
        if (this._eventsNonce === myNonce) failure(err);
      }
    };
  }

  _renderCalendar() {
    if (!this._container || !window.FullCalendar?.Calendar) return;

    if (this._calendar) {
      try { this._calendar.destroy(); } catch {}
      this._calendar = undefined;
    }

    if (!this._calendarDiv) {
      this._calendarDiv = document.createElement("div");
      this._calendarDiv.style.cssText = `
        height: 100%;
        min-height: 0;
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
    const lo = this._computeHaLocaleOptions();
    this._lastLocaleKey = lo.localeKey;

    this._calendar = new FC.Calendar(this._calendarDiv, {
      locale: lo.lang,
      direction: lo.dir,
      firstDay: lo.firstDay,
      slotLabelFormat: lo.slotLabelFormat,
      eventTimeFormat: lo.eventTimeFormat,
      timeZone: "local",

      initialView: cfg.initialView,
      headerToolbar: cfg.headerToolbar,
      stickyHeaderDates: cfg.stickyHeaderDates,
      weekNumbers: cfg.weekNumbers,

      allDaySlot: cfg.allDaySlot,
      nowIndicator: cfg.nowIndicator,
      hiddenDays: cfg.hiddenDays,
      slotMinTime: cfg.slotMinTime,
      slotMaxTime: cfg.slotMaxTime,
      dayMaxEvents: cfg.dayMaxEvents,
      expandRows: cfg.expandRows,
      moreLinkClick: cfg.moreLinkClick,

      height: "100%",

      events: this._eventsSource(),

      loading: (isLoading) => {
        if (isLoading) this._container.setAttribute("aria-busy", "true");
        else this._container.removeAttribute("aria-busy");
      },

      eventClick: (info) => {
        const raw = info.event.extendedProps?.raw || {};
        const url = raw.htmlLink || info.event.url;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },

      eventDidMount: (info) => {
        const raw = info.event.extendedProps?.raw || {};
        const desc = raw.description ? `\n${raw.description}` : "";
        info.el.title = `${info.event.title}${desc}`;
      },
    });

    this._calendar.render();

    if (!this._ro) {
      this._ro = new ResizeObserver(() => {
        if (this._calendar) {
          try { this._calendar.updateSize(); } catch {}
        }
      });
      this._ro.observe(this._card);
    }
  }

  _applyRuntimeOptionUpdates() {
    if (!this._calendar) return;
    const lo = this._computeHaLocaleOptions();
    if (lo.localeKey !== this._lastLocaleKey) {
      this._lastLocaleKey = lo.localeKey;
      try {
        this._calendar.setOption("locale", lo.lang);
        this._calendar.setOption("direction", lo.dir);
        this._calendar.setOption("firstDay", lo.firstDay);
        this._calendar.setOption("slotLabelFormat", lo.slotLabelFormat);
        this._calendar.setOption("eventTimeFormat", lo.eventTimeFormat);
        this._calendar.updateSize();
      } catch (e) {
        console.warn("fullcalendar-row: Failed to apply runtime locale options", e);
      }
    }
  }

  _showError(msg) {
    if (!this._card) return;
    const existing = this._card.querySelector("hui-warning");
    if (existing) existing.remove();
    const el = document.createElement("hui-warning");
    el.textContent = msg;
    this._card.appendChild(el);
  }

  // Lovelace layout hints
  getCardSize() { return 7; }
  getGridOptions() {
    return { rows: 8, columns: 12, min_rows: 4, max_rows: 12 };
  }
}

customElements.define("fullcalendar-row", FullCalendarRow);
