// /config/www/family-board/family-board-jq.js
// Family Board (jQuery + FullCalendar v2/3)

const PATHS = {
    jqueryUrl: '/local/family-board/vendor/jquery.min.3.7.1.js',
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    themeCssUrl: '/local/family-board/family-board.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js',
};

class FamilyBoardJQ extends HTMLElement {
    static getStubConfig() {
        return {
            // Choose 'dashboard' or 'simple-calendar'
            mode: 'dashboard',
            title: 'Panogu Family',
            timezone: 'Europe/London',

            // Calendars (colors shown in legend + used by events)
            calendars: [
                // { entity: 'calendar.family',  color: 'var(--family-color-family)' },
            ],

            // Dashboard sections (used only in "dashboard" mode)
            sections: ['Calendar', 'Chores', 'Lists', 'Photos'],
            defaultSection: 'Calendar',

            // Home Assistant todo.* entities (dashboard "Chores" section)
            todos: {
                family: 'todo.family',
                anthony: 'todo.anthony',
                joy: 'todo.joy',
                lizzie: 'todo.lizzie',
                toby: 'todo.toby',
            },

            // FullCalendar defaults (works for both modes)
            fc: {
                firstDay: 1, // Monday
                defaultView: 'month', // for v2/v3 jQuery build
                initialView: 'agendaWeek', // fallback for dashboard mode
                header: {
                    left: 'prev next today',
                    center: 'title',
                    right: 'month agendaWeek agendaDay',
                },
                timeFormat: 'HH:mm',
                contentHeight: 'auto',
                views: {
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
            },

            // Kiosk-ish layout tweaks (these are handled by your controller too)
            layoutOptions: {
                hideAppHeader: true,
                collapseSidebar: true,
                fullBleedView: true,
                setVars: true,
            },

            // Diagnostics (dashboard mode only)
            diagnostics: { enabled: true },

            // Optional: show small color legend in simple mode as well
            simpleLegend: true,
        };
    }

    setConfig(cfg) {
        this._config = { ...FamilyBoardJQ.getStubConfig(), ...cfg };
        this._state = {
            section: this._config.defaultSection || 'Calendar',
            personFocus: 'Family', // chips change this in dashboard mode
        };
        this._ensureRoot();
        this._ensureAssets()
            .then(() => this._renderEntry())
            .catch((err) => this._fatal(`Assets failed: ${String(err)}`));
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._$) return;

        // Dashboard mode: update header clock + dynamic panes
        if (this._config.mode === 'dashboard') {
            this._updateHeader();
            this._updateSidebarBadge();
            if (this._state.section === 'Calendar' && this._fcReady)
                this._refetchFullCalendarDashboard();
            if (this._state.section === 'Chores') this._renderChoresIfVisible();
        } else {
            // Simple calendar: just refetch
            if (this._fcReady) this._refetchSimple();
        }
    }

    getCardSize() {
        return 6;
    }

    // ---- Asset loading --------------------------------------------------------

    async _ensureAssets() {
        // jQuery
        if (!window.jQuery) await this._loadScript(PATHS.jqueryUrl);
        this.$ = (sel, ctx) => window.jQuery(sel, ctx ?? this._root);
        this._$ = window.jQuery;

        // Moment (+TZ)
        if (PATHS.momentUrl && !window.moment) await this._loadScript(PATHS.momentUrl);
        if (PATHS.momentTzUrl && window.moment && !window.moment.tz)
            await this._loadScript(PATHS.momentTzUrl);

        // FullCalendar CSS (base) -> shadow root
        if (PATHS.fcCssUrl) await this._loadCss(PATHS.fcCssUrl, true);
        // Theme CSS (overrides) -> shadow root (load AFTER fc css to win specificity)
        if (PATHS.themeCssUrl) await this._loadCss(PATHS.themeCssUrl, true);

        // FullCalendar JS (jQuery build)
        if (!(this._$.fn && this._$.fn.fullCalendar)) await this._loadScript(PATHS.fcJsUrl);
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

    // ---- Render entry ---------------------------------------------------------

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

    // ---- Simple calendar mode -------------------------------------------------

    _renderSimpleShell() {
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div id="wrap">
        <div id="title">${this._config.title ?? 'Family Calendar'}</div>
        ${this._config.simpleLegend ? '<div id="fc-legend" class="fb-legend"></div>' : ''}
        <div id="calendar"></div>
      </div>
    `;
        this._root.innerHTML = '';
        this._root.append(card);
    }

    _initFullCalendarSimple() {
        const $cal = this.$('#calendar');
        if (!($cal.length && this._$?.fn?.fullCalendar)) {
            $cal.html('<div class="fb-error">FullCalendar not loaded.</div>');
            return;
        }

        // Destroy any previous instance
        try {
            $cal.fullCalendar('destroy');
        } catch (_) {}

        const fc = this._config.fc ?? {};
        const header = fc.header ?? {
            left: 'prev next today',
            center: 'title',
            right: 'month agendaWeek agendaDay',
        };
        const defaultView = fc.defaultView ?? fc.initialView ?? 'month';
        const tz = this._config.timezone ?? 'local';

        $cal.fullCalendar({
            firstDay: typeof fc.firstDay === 'number' ? fc.firstDay : 1,
            timezone: tz,
            header,
            defaultView,
            contentHeight: fc.contentHeight ?? 'auto',
            timeFormat: fc.timeFormat ?? 'HH:mm',
            views: fc.views ?? {
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
                element.attr('title', event.title);
            },
        });

        // Add event sources
        (this._config.calendars ?? []).forEach((src) => {
            const opts = {
                color: src.color ?? undefined,
                textColor: src.textColor ?? undefined,
                className: src.className ?? undefined,
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
        // Build legend if enabled
        if (this._config.simpleLegend) this._renderLegend('#fc-legend');
    }

    _refetchSimple() {
        try {
            this.$('#calendar').fullCalendar('refetchEvents');
        } catch (_) {}
    }

    _renderLegend(selector) {
        const wrap = this.$(selector);
        if (!wrap.length) return;
        const legend = (this._config.calendars ?? [])
            .map(
                (s) => `<span class="fb-legend-item">
          <i class="fb-legend-swatch" style="background:${s.color}"></i>
          <span class="fb-legend-label">${s.entity.replace('calendar.', '')}</span>
        </span>`
            )
            .join('');
        wrap.html(legend);
    }

    // ---- Dashboard mode -------------------------------------------------------

    _renderDashboardShell() {
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div class="fb-layout">
        <aside id="sidebar"></aside>
        <header>
          <div class="fb-title">${this._config.title ?? 'Family'}</div>
          <div class="fb-clock">
            <div class="time" id="h-time">--:--</div>
            <div class="date" id="h-date">-</div>
          </div>
          <div id="mode-pill" class="fb-pill">FAMILY</div>
        </header>
        <div class="chips" id="chips"></div>
        <main>
          <div class="main-pad" id="main"></div>
          <div id="diag-pane"><strong>Diagnostics</strong>\n<span id="diag-box"></span></div>
        </main>
      </div>
    `;
        this._root.innerHTML = '';
        this._root.append(card);

        const $ = this.$;
        const ICONS = {
            Calendar: 'mdi:calendar',
            Chores: 'mdi:broom',
            Lists: 'mdi:format-list-bulleted',
            Photos: 'mdi:image-multiple',
        };

        // Sidebar buttons
        const $aside = $('<div/>');
        $('#sidebar').append($aside);
        this._config.sections.forEach((sec) => {
            const $btn = $(
                `<button class="sb-btn" title="${sec}">
           <ha-icon icon="${ICONS[sec] ?? 'mdi:circle'}"></ha-icon>
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

        // People chips
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

        // Diagnostics toggle
        if (!this._config.diagnostics?.enabled) $('#diag-pane').hide();

        // Quick log
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

    _renderMain() {
        const $ = this.$;
        const $container = $('#main').empty();

        if (this._state.section === 'Calendar') {
            $container.append(
                '<div id="fc-wrap"><div id="fc"></div><div id="fc-legend" class="fb-legend"></div></div>'
            );
            this._initFullCalendarDashboard();
            this._renderLegend('#fc-legend');
            return;
        }

        // Other sections
        $container.append('<div class="main-pad" id="pad"></div>');
        const $pane = $('#pad');

        if (this._state.section === 'Chores') {
            $pane.append('<div id="chores" class="fb-chores-grid"></div>');
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
        const lang = this._hass?.locale?.language ?? 'en-GB';
        this.$('#h-time').text(
            now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false })
        );
        this.$('#h-date').text(
            now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
        );
    }

    _updateSidebarBadge() {
        const $badge = this.$('.sb-badge[data-sec="Calendar"]');
        if (!($badge.length && this._hass)) return;
        const n = Number(this._hass.states?.['input_number.events_today']?.state ?? 0);
        $badge.css('display', n > 0 ? 'flex' : 'none').text(n);
    }

    // ---- FullCalendar in dashboard mode --------------------------------------

    _eventSourcesForFocus() {
        const focus = (this._state.personFocus ?? 'Family').toLowerCase();
        const cfgSources = this._config.calendars ?? [];

        // Family = all; otherwise match entity ids that start with calendar.<name> or contain _<name>
        const match = (entity, who) => {
            if (who === 'family') return true;
            const id = entity.toLowerCase();
            return id.startsWith(`calendar.${who}`) || id.includes(`_${who}`);
        };

        const filtered = cfgSources.filter((s) => match(s.entity, focus));
        if (!filtered.length) this._diag(`No calendar sources for focus "${focus}"`);

        return filtered.map((src) => ({
            id: src.entity,
            color: src.color,
            events: (start, end, _tz, callback) => {
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
                            `Fetch failed for ${src.entity}: ${err?.status ?? err?.code ?? err}`
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
            $fc.html('<div class="fb-error">FullCalendar not loaded.</div>');
            return;
        }
        try {
            $fc.fullCalendar('destroy');
        } catch (_) {}

        const fcCfg = this._config.fc ?? {};
        const tz = this._config.timezone ?? 'local';

        $fc.fullCalendar({
            header: fcCfg.header ?? {
                left: 'prev,next today',
                center: 'title',
                right: 'month,agendaWeek,agendaDay',
            },
            defaultView: fcCfg.defaultView ?? fcCfg.initialView ?? 'agendaWeek',
            timezone: tz,
            allDaySlot: fcCfg.allDaySlot !== false,
            minTime: fcCfg.minTime ?? '06:00:00',
            maxTime: fcCfg.maxTime ?? '22:00:00',
            slotDuration: fcCfg.slotDuration ?? '01:00:00',
            hiddenDays: Array.isArray(fcCfg.hiddenDays) ? fcCfg.hiddenDays : [],
            timeFormat: fcCfg.timeFormat ?? 'HH:mm',
            views: fcCfg.views ?? undefined,
            contentHeight: fcCfg.contentHeight ?? 'auto',
            height: 'auto',
            handleWindowResize: true,
            editable: false,
            selectable: false,
            lazyFetching: true,
            eventLimit: true,
            weekNumbers: false,
            eventSources: this._eventSourcesForFocus(),
            eventRender: (event, element) => {
                if (event.color) element.css('backgroundColor', event.color);
                if (event.textColor) element.css('color', event.textColor);
                element.attr('title', event.title);
            },
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
            const sources = $fc.fullCalendar('getEventSources') ?? [];
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

    // ---- Chores (dashboard) ---------------------------------------------------

    _renderChoresIfVisible() {
        if (this._state.section !== 'Chores' || !this._hass) return;
        const $root = this.$('#chores');
        if (!$root.length) return;
        const lists = this._config.todos ?? {};
        const keys = ['anthony', 'joy', 'family', 'lizzie', 'toby'].filter((k) => lists[k]);
        const html = keys
            .map((k) => {
                const ent = lists[k];
                const st = this._hass.states?.[ent];
                const items = (st?.attributes?.items ?? []).filter(
                    (it) => it.status !== 'completed'
                );
                return `
        <ha-card>
          <div class="fb-card-title">${k[0].toUpperCase() + k.slice(1)}</div>
          <div class="fb-card-body">
            ${
                items.length
                    ? items.map((it) => `<div>– ${it.summary}</div>`).join('')
                    : `<div class="fb-muted">Nothing pending</div>`
            }
          </div>
        </ha-card>`;
            })
            .join('');
        $root.html(html);
    }

    // ---- HA -> FC event mapping ----------------------------------------------

    _mapHaEventToFc(ev) {
        const s = ev?.start ?? {},
            e = ev?.end ?? {};
        const hasSDT = typeof s.dateTime === 'string';
        const hasEDT = typeof e.dateTime === 'string';
        const hasSD = typeof s.date === 'string';
        const hasED = typeof e.date === 'string';
        if (!hasSDT && !hasSD) return null;

        const isAllDay = !!ev.all_day || (hasSD && !hasEDT);

        let startStr = hasSDT ? s.dateTime : `${s.date}T00:00:00`;
        let endStr = hasEDT ? e.dateTime : hasED ? `${e.date}T00:00:00` : null;

        // All-day: ensure exclusive end (next day 00:00)
        if (isAllDay) {
            if (!endStr && hasSD) {
                const d = new Date(`${s.date}T00:00:00Z`);
                d.setUTCDate(d.getUTCDate() + 1);
                endStr = d.toISOString();
            } else if (hasED) {
                const d = new Date(`${e.date}T00:00:00Z`);
                endStr = d.toISOString();
            }
        }

        // Timed with no end -> +1 hour
        if (!isAllDay && hasSDT && !endStr) {
            const d = new Date(startStr);
            endStr = new Date(d.getTime() + 60 * 60 * 1000).toISOString();
        }

        const titleBase = ev.summary ?? ev.title ?? 'Busy';
        const start = new Date(startStr);
        const showTime = !isAllDay;
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');
        const title = showTime ? `${hh}:${mm} ${titleBase}` : titleBase;

        return {
            id: ev.uid ?? `${startStr}-${titleBase}`.replace(/\s+/g, '_'),
            title,
            start: startStr,
            end: endStr ?? null,
            allDay: !!isAllDay,
            location: ev.location,
            description: ev.description,
            color: ev.color,
        };
    }

    // ---- Diagnostics / Errors -------------------------------------------------

    _fatal(msg) {
        console.error('[family-board-jq] ' + msg);
        this._root.innerHTML = `<ha-card><div class="fb-error">${msg}</div></ha-card>`;
    }

    _diag(msg) {
        if (this._config.mode === 'simple-calendar') return; // keep minimal UI clean
        const box = this._root.getElementById('diag-box');
        if (box) box.textContent += (box.textContent ? '\n' : '') + '[diag] ' + msg;
        console.log('[family-board-jq]', msg);
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
(window.customCards = window.customCards ?? []).push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'Dashboard with optional minimal Month/Week/Day calendar mode.',
});
