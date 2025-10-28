// /config/www/family-board/family-board-jq.js
// Family Board (jQuery + FullCalendar v2/3)
// Adds `mode: 'simple-calendar'` for a lean Month/Week/Day calendar while keeping the full dashboard mode.

const PATHS = {
    jqueryUrl: '/local/family-board/vendor/jquery.min.3.7.1.js',
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js', // jQuery v2/v3 build
};

class FamilyBoardJQ extends HTMLElement {
    static getStubConfig() {
        return {
            // NEW: choose between 'dashboard' (existing UI) or 'simple-calendar'
            mode: 'dashboard',

            title: 'Panogu Family',
            timezone: 'Europe/London',

            // calendars provided in Lovelace YAML
            calendars: [
                // { entity: 'calendar.family', color: 'var(--family-color-family)' },
            ],

            // Sections used by dashboard mode
            sections: ['Calendar', 'Chores', 'Lists', 'Photos'],
            defaultSection: 'Calendar',
            metrics: {},

            todos: {
                family: 'todo.family',
                anthony: 'todo.anthony',
                joy: 'todo.joy',
                lizzie: 'todo.lizzie',
                toby: 'todo.toby',
            },

            // FullCalendar defaults. Supports both legacy `initialView` and `defaultView`.
            fc: {
                firstDay: 1, // Monday
                defaultView: 'month', // minimal mode uses this
                initialView: 'agendaWeek', // dashboard mode fallback if set
                header: {
                    // minimal header like your example; change right to show view buttons
                    left: 'prev',
                    center: 'title',
                    right: 'next',
                },
                timeFormat: 'HH:mm',
                contentHeight: 'auto',
                views: {
                    month: { fixedWeekCount: false, eventLimit: true, hiddenDays: [] },
                    agendaWeek: {
                        allDaySlot: true,
                        slotDuration: '00:30:00',
                        minTime: '06:00:00',
                        maxTime: '22:00:00',
                        hiddenDays: [],
                    },
                    agendaDay: {
                        allDaySlot: true,
                        slotDuration: '00:30:00',
                        minTime: '06:00:00',
                        maxTime: '22:00:00',
                        hiddenDays: [],
                    },
                },
            },

            // Dashboard layout options
            layoutOptions: {
                hideAppHeader: true,
                collapseSidebar: true,
                fullBleedView: true,
                setVars: true,
            },

            // Diagnostics panel (dashboard mode). Minimal mode keeps things clean and hides this by default.
            diagnostics: { enabled: true },
        };
    }

    setConfig(cfg) {
        this._config = { ...FamilyBoardJQ.getStubConfig(), ...cfg };
        this._state = {
            section: this._config.defaultSection || 'Calendar',
            personFocus: 'Family',
        };
        this._ensureRoot();
        this._ensureAssets()
            .then(() => this._renderEntry())
            .catch((err) => this._fatal(`Assets failed: ${String(err)}`));
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._$) return;

        if (this._config.mode === 'dashboard') {
            this._updateHeader();
            this._updateSidebarBadge();
            if (this._state.section === 'Calendar' && this._fcReady)
                this._refetchFullCalendarDashboard();
            if (this._state.section === 'Chores') this._renderChoresIfVisible();
        } else {
            // simple-calendar: just refetch events
            if (this._fcReady) this._refetchSimple();
        }
    }

    getCardSize() {
        return 6;
    }

    // ---------- Asset loading ----------
    async _ensureAssets() {
        if (!window.jQuery) await this._loadScript(PATHS.jqueryUrl);
        this.$ = (sel, ctx) => window.jQuery(sel, ctx || this._root);
        this._$ = window.jQuery;
        if (PATHS.momentUrl && !window.moment) await this._loadScript(PATHS.momentUrl);
        if (PATHS.momentTzUrl && window.moment && !window.moment.tz)
            await this._loadScript(PATHS.momentTzUrl);
        if (PATHS.fcCssUrl) await this._loadCss(PATHS.fcCssUrl, true);
        if (!(this._$.fn && this._$.fn.fullCalendar)) {
            await this._loadScript(PATHS.fcJsUrl);
        }
        if (!(this._$.fn && this._$.fn.fullCalendar)) {
            throw new Error(
                'FullCalendar jQuery plugin not detected. Ensure fcJsUrl points to v2/v3 build.'
            );
        }
    }

    _loadScript(src) {
        return new Promise((res, rej) => {
            if ([...document.scripts].some((s) => s.src === src)) return res();
            const el = document.createElement('script');
            el.src = src;
            el.onload = res;
            el.onerror = () => rej(new Error(`script load failed: ${src}`));
            document.head.appendChild(el);
        });
    }
    _loadCss(href, intoShadow = false) {
        return new Promise((res, rej) => {
            if (intoShadow && this._root) {
                if (
                    [...this._root.querySelectorAll('link[rel="stylesheet"]')].some(
                        (l) => l.href === href
                    )
                )
                    return res();
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.onload = res;
                link.onerror = () => rej(new Error(`css load failed (shadow): ${href}`));
                this._root.appendChild(link);
            } else {
                if ([...document.styleSheets].some((s) => s.href === href)) return res();
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.onload = res;
                link.onerror = () => rej(new Error(`css load failed: ${href}`));
                document.head.appendChild(link);
            }
        });
    }

    // ---------- Entrypoint render ----------
    _ensureRoot() {
        if (!this._root) this._root = this.attachShadow({ mode: 'open' });
    }

    _renderEntry() {
        if (this._config.mode === 'simple-calendar') {
            this._renderSimpleShell();
            this._initFullCalendarSimple();
        } else {
            this._renderDashboardShell();
            this._renderMain();
        }
        this._diag(`Mode: ${this._config.mode}`);
    }

    // ---------- Minimal mode (simple calendar) ----------
    _renderSimpleShell() {
        const style = document.createElement('style');
        style.textContent = `
      :host { display:block; }
      ha-card { height:100%; }
      #wrap { padding:12px; }
      #title { font-weight:800; margin-bottom:8px; }
      #calendar { min-height: 640px; }
      .fc, .fc-view, .fc-view > table, .fc-view > .fc-scroller { height: 100% !important; }
    `;
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div id="wrap">
        <div id="title">${this._config.title || 'Family Calendar'}</div>
        <div id="calendar"></div>
      </div>
    `;
        this._root.innerHTML = '';
        this._root.append(style, card);
    }

    _initFullCalendarSimple() {
        const $cal = this.$('#calendar');
        if (!($cal.length && this._$?.fn?.fullCalendar)) {
            $cal.html('<div style="padding:8px;color:#b00020">FullCalendar not loaded.</div>');
            return;
        }
        try {
            $cal.fullCalendar('destroy');
        } catch (_) {}

        const fc = this._config.fc || {};
        const header = fc.header || { left: 'prev', center: 'title', right: 'next' };
        const defaultView = fc.defaultView || fc.initialView || 'month';
        const tz = this._config.timezone || 'local';

        $cal.fullCalendar({
            firstDay: typeof fc.firstDay === 'number' ? fc.firstDay : 1,
            timezone: tz,
            header,
            defaultView,
            contentHeight: fc.contentHeight || 'auto',
            timeFormat: fc.timeFormat || 'HH:mm',
            views: fc.views || {
                month: { fixedWeekCount: false, eventLimit: true },
                agendaWeek: {
                    allDaySlot: true,
                    slotDuration: '00:30:00',
                    minTime: '06:00:00',
                    maxTime: '22:00:00',
                },
                agendaDay: {
                    allDaySlot: true,
                    slotDuration: '00:30:00',
                    minTime: '06:00:00',
                    maxTime: '22:00:00',
                },
            },
            editable: false,
            eventLimit: true,
            handleWindowResize: true,
            events: [], // sources added below
            eventRender: (event, element) => {
                if (event.color) element.css('backgroundColor', event.color);
                if (event.textColor) element.css('color', event.textColor);
            },
        });

        // Add event sources (like your elsewhere implementation)
        (this._config.calendars || []).forEach((src) => {
            const opts = {
                color: src.color || undefined,
                textColor: src.textColor || undefined,
                className: src.className || undefined,
                events: (start, end, tzName, callback) => {
                    if (!this._hass) return callback([]);
                    const path = `calendars/${src.entity}?start=${encodeURIComponent(
                        start.toISOString()
                    )}&end=${encodeURIComponent(end.toISOString())}`;
                    this._hass
                        .callApi('GET', path)
                        .then((events) =>
                            callback(events.map((e) => this._mapHaEventToFc(e)).filter(Boolean))
                        )
                        .catch((err) => {
                            console.warn('[family-board-jq simple] fetch failed', src.entity, err);
                            callback([]);
                        });
                },
            };
            $cal.fullCalendar('addEventSource', opts);
        });

        this._fcReady = true;
        // No diagnostics pane in simple mode; keep it clean
    }

    _refetchSimple() {
        try {
            this.$('#calendar').fullCalendar('refetchEvents');
        } catch (_) {}
    }

    // ---------- Dashboard mode (existing UI) ----------
    _renderDashboardShell() {
        // Inject page-level CSS (controller is a separate file you already load)
        const style = document.createElement('style');
        style.textContent = `
      :host { display:block; }
      ha-card { height: 100%; background: var(--family-background, #fff); }
      .layout {
        display: grid;
        grid-template-columns: 80px 1fr;
        grid-template-rows: 48px 72px 1fr;
        grid-template-areas: "sidebar header" "sidebar chips" "sidebar main";
        height: calc(100vh - var(--header-height, 0px));
      }
      header {
        grid-area: header; display:flex; align-items:center; justify-content:space-between;
        padding: 8px 12px; background: var(--app-header-background-color, #CFBAF0);
        color: var(--primary-text-color, #0F172A); font-weight: 800;
      }
      header .time { font-size: 28px; line-height: 1; }
      header .date { font-size: 12px; opacity: .85; font-weight:700; }
      aside { grid-area: sidebar; display:flex; flex-direction:column; align-items:center;
        background: var(--app-header-background-color, #CFBAF0); padding: 8px 0; gap: 8px; }
      .sb-btn { width:56px; height:72px; display:grid; place-items:center; background:transparent; border:0; cursor:pointer; position:relative; color:#fff; }
      .sb-btn.active { color: var(--app-header-background-color, #0F172A); background: #fff; }
      .sb-badge { position:absolute; bottom:6px; right:6px; min-width:18px; height:18px; border-radius:12px; background:#fff; color:#0F172A; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; border:1px solid #0F172A; }
      .chips { grid-area: chips; display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; padding:8px; background: var(--app-header-background-color, #CFBAF0); }
      .chip { display:grid; grid-template-areas: "i n v" "bar bar bar"; grid-template-columns: 24px 1fr auto; grid-template-rows: auto 6px; border-radius:10px; padding:6px 8px; cursor:pointer; background: var(--primary-color, #B9FBC0); }
      .chip .i { grid-area:i; display:grid; place-items:center; }
      .chip .n { grid-area:n; font-weight:800; color:#0F172A; }
      .chip .v { grid-area:v; font-weight:800; color:#0F172A; }
      .chip .bar { grid-area:bar; height:8px; background: rgba(0,0,0,.10); border-radius: 999px; position:relative; overflow:hidden; }
      .chip .bar > div { position:absolute; inset:0; background: rgba(255,255,255,.85); transform-origin:left; }
      main { grid-area: main; height: 100%; overflow: hidden; }
      .main-pad { height:100%; padding: 12px; overflow:auto; background: #F8FAFC; }
      #fc-wrap { height:100%; }
      #fc { height:100%; min-height: 640px; }
      .fc, .fc-view, .fc-view > table, .fc-view > .fc-scroller { height: 100% !important; max-height: 100% !important; }
      #diag-pane { margin-top:10px; padding:8px; background:#fff; border:1px solid var(--divider-color); border-radius:8px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; white-space:pre-wrap; }
      ${this._config.diagnostics?.enabled ? '' : '#diag-pane{display:none;}'}
    `;
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div class="layout">
        <aside id="sidebar"></aside>
        <header>
          <div style="font-weight:800">${this._config.title || 'Family'}</div>
          <div style="text-align:center">
            <div class="time" id="h-time">--:--</div>
            <div class="date" id="h-date">-</div>
          </div>
          <div id="mode-pill" style="background: rgba(0,0,0,.06); padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px;">FAMILY</div>
        </header>
        <div class="chips" id="chips"></div>
        <main>
          <div class="main-pad" id="main"></div>
          <div id="diag-pane"><strong>Diagnostics</strong>\n<span id="diag-box"></span></div>
        </main>
      </div>
    `;
        this._root.innerHTML = '';
        this._root.append(style, card);

        const $ = this.$;
        const ICONS = {
            Calendar: 'mdi:calendar',
            Chores: 'mdi:broom',
            Lists: 'mdi:format-list-bulleted',
            Photos: 'mdi:image-multiple',
        };

        // Sidebar
        const $aside = $('<div/>');
        $('#sidebar').append($aside);
        this._config.sections.forEach((sec) => {
            const $btn = $(
                `<button class="sb-btn" title="${sec}">
           <ha-icon icon="${ICONS[sec] || 'mdi:circle'}"></ha-icon>
           <div class="sb-badge" data-sec="${sec}" style="display:none">0</div>
         </button>`
            );
            if (this._state.section === sec) $btn.addClass('active');
            $btn.on('click', () => {
                this._state.section = sec;
                this._renderMain();
                this._renderSidebar();
            });
            $aside.append($btn);
        });

        // Chips (people focus)
        const $chips = $('#chips').empty();
        [
            {
                key: 'family',
                name: 'Family',
                icon: 'mdi:account-group',
                color: 'var(--family-color-family, #36B37E)',
            },
            {
                key: 'anthony',
                name: 'Anthony',
                icon: 'mdi:laptop',
                color: 'var(--family-color-anthony, #7E57C2)',
            },
            {
                key: 'joy',
                name: 'Joy',
                icon: 'mdi:book-open-variant',
                color: 'var(--family-color-joy, #F4B400)',
            },
            {
                key: 'lizzie',
                name: 'Lizzie',
                icon: 'mdi:teddy-bear',
                color: 'var(--family-color-lizzie, #EC407A)',
            },
            {
                key: 'toby',
                name: 'Toby',
                icon: 'mdi:soccer',
                color: 'var(--family-color-toby, #42A5F5)',
            },
        ].forEach((p) => {
            const $chip = $(`
        <div class="chip" style="background:${p.color}">
          <div class="i"><ha-icon icon="${p.icon}"></ha-icon></div>
          <div class="n">${p.name}</div>
          <div class="v" id="chip-v-${p.key}">0/0</div>
          <div class="bar"><div id="chip-bar-${p.key}" style="transform:scaleX(0)"></div></div>
        </div>
      `);
            $chip.on('click', () => {
                this._state.personFocus = p.name;
                $('#mode-pill').text(p.name.toUpperCase());
                if (this._state.section === 'Calendar') this._rebuildFullCalendarDashboard();
            });
            $chips.append($chip);
        });

        this._diag(
            `jQuery: ${!!window.jQuery}, FC plugin: ${!!this._$?.fn
                ?.fullCalendar}, moment: ${!!window.moment}`
        );
    }

    _renderSidebar() {
        const $buttons = this.$('.sb-btn');
        $buttons.removeClass('active');
        $buttons.each((_, btn) => {
            if (btn.getAttribute('title') === this._state.section) this.$(btn).addClass('active');
        });
        this._updateSidebarBadge();
    }

    _updateSidebarBadge() {
        const $badge = this.$('.sb-badge[data-sec="Calendar"]');
        if (!$badge.length || !this._hass) return;
        const n = Number(this._hass.states?.['input_number.events_today']?.state || 0);
        $badge.css('display', n > 0 ? 'flex' : 'none').text(n);
    }

    _renderMain() {
        const $ = this.$;
        const $pad = $('#main')
            .empty()
            .append('<div id="fc-wrap"><div id="fc"></div></div>')
            .find('#fc');

        if (this._state.section === 'Calendar') {
            this._initFullCalendarDashboard();
            return;
        }

        // Other sections
        $('#main').empty().append('<div class="main-pad" id="pad"></div>');
        const $pane = $('#pad');

        if (this._state.section === 'Chores') {
            $pane.append(
                `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;" id="chores"></div>`
            );
            this._renderChoresIfVisible();
            return;
        }
        if (this._state.section === 'Lists') {
            $pane.append('<ha-card><div style="padding:12px">Lists placeholder</div></ha-card>');
            return;
        }
        if (this._state.section === 'Photos') {
            $pane.append('<ha-card><div style="padding:12px">Photos placeholder</div></ha-card>');
            return;
        }
    }

    _updateHeader() {
        if (!this._hass) return;
        const now = new Date();
        const lang = this._hass?.locale?.language || 'en-GB';
        this.$('#h-time').text(
            now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false })
        );
        this.$('#h-date').text(
            now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
        );
    }

    // ----- FullCalendar for dashboard mode (with focus chips) -----
    _eventSourcesForFocus() {
        const focus = (this._state.personFocus || 'Family').toLowerCase();
        const cfgSources = this._config.calendars || [];
        // Family shows all; person chip filters by entity id that contains their name
        const filtered = cfgSources.filter(
            (s) => focus === 'family' || s.entity.toLowerCase().includes(focus)
        );
        if (!filtered.length) this._diag(`No calendar sources for focus "${focus}"`);
        return filtered.map((src) => ({
            id: src.entity,
            color: src.color,
            events: (start, end, tz, callback) => {
                const path = `calendars/${src.entity}?start=${encodeURIComponent(
                    start.toISOString()
                )}&end=${encodeURIComponent(end.toISOString())}`;
                this._hass
                    .callApi('GET', path)
                    .then((events) =>
                        callback(events.map((ev) => this._mapHaEventToFc(ev)).filter(Boolean))
                    )
                    .catch((err) => {
                        this._diag(
                            `Fetch failed for ${src.entity}: ${err?.status || err?.code || err}`
                        );
                        callback([]);
                    });
            },
        }));
    }

    _initFullCalendarDashboard() {
        const $fc = this.$('#fc');
        if (!($fc.length && this._$?.fn?.fullCalendar)) {
            this._diag('FullCalendar not detected – check PATHS.fcJsUrl and ensure it is v2/v3.');
            $fc.html('<div style="padding:8px;color:#b00020">FullCalendar not loaded.</div>');
            return;
        }
        try {
            $fc.fullCalendar('destroy');
        } catch (_) {}

        const fcCfg = this._config.fc || {};
        const tz = this._config.timezone || 'local';

        $fc.fullCalendar({
            header: fcCfg.header || {
                left: 'prev,next today',
                center: 'title',
                right: 'month,agendaWeek,agendaDay',
            },
            defaultView: fcCfg.defaultView || fcCfg.initialView || 'agendaWeek',
            timezone: tz,
            allDaySlot: fcCfg.allDaySlot !== false,
            minTime: fcCfg.minTime || '06:00:00',
            maxTime: fcCfg.maxTime || '22:00:00',
            slotDuration: fcCfg.slotDuration || '01:00:00',
            hiddenDays: Array.isArray(fcCfg.hiddenDays) ? fcCfg.hiddenDays : [],
            timeFormat: fcCfg.timeFormat || 'HH:mm',
            views: fcCfg.views || undefined,
            contentHeight: fcCfg.contentHeight || 'auto',
            height: 'auto',
            handleWindowResize: true,
            editable: false,
            selectable: false,
            lazyFetching: true,
            eventLimit: true,
            weekNumbers: false,
            eventSources: this._eventSourcesForFocus(),
            viewRender: () => {
                requestAnimationFrame(() => {
                    try {
                        $fc.fullCalendar('option', 'height', 'auto');
                    } catch (_) {}
                });
            },
        });

        this._fcReady = true;
        this._diag('FullCalendar initialized (dashboard)');
    }

    _rebuildFullCalendarDashboard() {
        const $fc = this.$('#fc');
        if (!($fc.length && this._fcReady)) {
            this._initFullCalendarDashboard();
            return;
        }
        try {
            const sources = $fc.fullCalendar('getEventSources') || [];
            sources.forEach((s) => s.remove());
            this._eventSourcesForFocus().forEach((src) => $fc.fullCalendar('addEventSource', src));
            this._refetchFullCalendarDashboard();
            this._diag('FullCalendar sources rebuilt');
        } catch (e) {
            this._diag('Rebuild failed; reinitializing');
            this._initFullCalendarDashboard();
        }
    }

    _refetchFullCalendarDashboard() {
        try {
            this.$('#fc').fullCalendar('refetchEvents');
        } catch (_) {}
    }

    // ---------- Shared: HA -> FullCalendar event mapping ----------
    _mapHaEventToFc(ev) {
        const s = ev?.start || {},
            e = ev?.end || {};
        const hasSDT = typeof s.dateTime === 'string';
        const hasEDT = typeof e.dateTime === 'string';
        const hasSD = typeof s.date === 'string';
        const hasED = typeof e.date === 'string';
        if (!hasSDT && !hasSD) return null;

        const isAllDay = !!ev.all_day || (hasSD && (hasED || !hasEDT));
        let startStr = hasSDT ? s.dateTime : s.date;
        let endStr = hasEDT ? e.dateTime : hasED ? e.date : null;

        // All-day with missing end → next day (exclusive end)
        if (isAllDay && !endStr && hasSD) {
            const d = new Date(`${s.date}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            endStr = d.toISOString().slice(0, 10);
        }
        // Timed with missing end → add 1 hour so it renders in agenda views
        if (!isAllDay && hasSDT && !endStr) {
            const d = new Date(s.dateTime);
            endStr = new Date(d.getTime() + 60 * 60 * 1000).toISOString();
        }

        const title = ev.summary || ev.title || 'Busy';
        return {
            id: ev.uid || `${startStr}-${title}`.replace(/\s+/g, '_'),
            title,
            start: startStr,
            end: endStr || null,
            allDay: !!isAllDay,
            location: ev.location,
            description: ev.description,
            color: ev.color,
        };
    }

    // ---------- Chores (dashboard mode) ----------
    _renderChoresIfVisible() {
        if (this._state.section !== 'Chores' || !this._hass) return;
        const $root = this.$('#chores');
        if (!$root.length) return;
        const lists = this._config.todos || {};
        const keys = ['anthony', 'joy', 'family', 'lizzie', 'toby'].filter((k) => lists[k]);
        const html = keys
            .map((k) => {
                const ent = lists[k];
                const st = this._hass.states?.[ent];
                const items = (st?.attributes?.items || []).filter(
                    (it) => it.status !== 'completed'
                );
                return `
        <ha-card>
          <div style="padding:10px;font-weight:800">${k[0].toUpperCase() + k.slice(1)}</div>
          <div style="padding:0 10px 10px 10px;display:grid;gap:6px;">
            ${
                items.length
                    ? items.map((it) => `<div>– ${it.summary}</div>`).join('')
                    : `<div style="color:#64748B">Nothing pending</div>`
            }
          </div>
        </ha-card>`;
            })
            .join('');
        $root.html(html);
    }

    // ---------- Diagnostics ----------
    _fatal(msg) {
        console.error('[family-board-jq] ' + msg);
        this._root.innerHTML = `<ha-card><div style="padding:12px;color:#b00020">${msg}</div></ha-card>`;
    }
    _diag(msg) {
        if (this._config.mode === 'simple-calendar') return; // keep minimal UI clean
        const box = this._root.getElementById('diag-box');
        if (box) box.textContent += (box.textContent ? '\n' : '') + '[diag] ' + msg;
        console.log('[family-board-jq]', msg);
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
(window.customCards = window.customCards || []).push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'Dashboard with optional minimal Month/Week/Day calendar mode.',
});
