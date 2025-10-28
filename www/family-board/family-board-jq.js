// /config/www/family-board/family-board-jq.js
// Family Board (jQuery + FullCalendar v2/3) - DASHBOARD LAYOUT
// Sidebar (views) + Header (family/time/section) + Chips (people) + Main (one view).
// Loads jQuery, Moment(+TZ), FC (jQuery build), and theme CSS into the card's shadow root.

const PATHS = {
    jqueryUrl: '/local/family-board/vendor/jquery.min.3.7.1.js',
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    themeCssUrl: '/local/family-board/family-board.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js', // jQuery v2/v3 build
};

// Toggle: should person chips also filter CALENDAR sources?
const CHIP_FILTERS_CALENDAR = true;

class FamilyBoardJQ extends HTMLElement {
    static getStubConfig() {
        return {
            mode: 'dashboard',
            title: 'Panogu Family',
            timezone: 'Europe/London',
            calendars: [],
            sections: ['Calendar', 'Chores'], // keep it lean (you can add 'Lists','Photos' later)
            defaultSection: 'Calendar',
            todos: {
                family: 'todo.family',
                anthony: 'todo.anthony',
                joy: 'todo.joy',
                lizzie: 'todo.lizzie',
                toby: 'todo.toby',
            },
            fc: {
                firstDay: 1,
                defaultView: 'month',
                initialView: 'agendaWeek',
                header: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay',
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
            layoutOptions: {
                hideAppHeader: true,
                collapseSidebar: true,
                fullBleedView: true,
                setVars: true,
            },
            diagnostics: { enabled: false }, // off by default (clean UI)
            simpleLegend: false, // dashboard shows its own legend when calendar is active
        };
    }

    setConfig(cfg) {
        this._config = { ...FamilyBoardJQ.getStubConfig(), ...cfg };
        // Normalize header.right for FC v2/3 (comma-separated)
        if (this._config?.fc?.header?.right?.includes(' ')) {
            this._config.fc.header.right = this._config.fc.header.right.replace(/\s+/g, ',');
        }
        this._state = { section: this._config.defaultSection || 'Calendar', personFocus: 'Family' };
        this._ensureRoot();
        this._ensureAssets()
            .then(() => this._renderEntry())
            .catch((err) => this._fatal(`Assets failed: ${String(err)}`));
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._$) return;
        this._updateHeader();
        if (this._state.section === 'Calendar' && this._fcReady) this._refetchFullCalendar();
        if (this._state.section === 'Chores') this._renderChores();
    }

    getCardSize() {
        return 6;
    }

    // ---------- Assets ----------
    async _ensureAssets() {
        if (!window.jQuery) await this._loadScript(PATHS.jqueryUrl);
        this.$ = (sel, ctx) => window.jQuery(sel, ctx ?? this._root);
        this._$ = window.jQuery;

        if (PATHS.momentUrl && !window.moment) await this._loadScript(PATHS.momentUrl);
        if (PATHS.momentTzUrl && window.moment && !window.moment.tz)
            await this._loadScript(PATHS.momentTzUrl);

        if (PATHS.fcCssUrl) await this._loadCss(PATHS.fcCssUrl, true);
        if (PATHS.themeCssUrl) await this._loadCss(PATHS.themeCssUrl, true);

        if (!(this._$.fn && this._$.fn.fullCalendar)) await this._loadScript(PATHS.fcJsUrl);
        if (!(this._$.fn && this._$.fn.fullCalendar))
            throw new Error('FullCalendar jQuery build not detected.');
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

    // ---------- UI Shell ----------
    _ensureRoot() {
        if (!this._root) this._root = this.attachShadow({ mode: 'open' });
    }
    _renderEntry() {
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
          <div id="section-pill" class="fb-pill">CALENDAR</div>
        </header>
        <div class="chips" id="chips"></div>
        <main id="main"></main>
      </div>`;
        this._root.innerHTML = '';
        this._root.append(card);

        this._renderSidebar();
        this._renderChips();
        this._renderMain(); // draws the initial view
    }

    _renderSidebar() {
        const $ = this.$;
        const ICON = {
            Calendar: 'mdi:calendar',
            Chores: 'mdi:broom',
            Lists: 'mdi:format-list-bulleted',
            Photos: 'mdi:image-multiple',
        };
        const $aside = $('<div/>');
        $('#sidebar').empty().append($aside);
        this._config.sections.forEach((sec) => {
            const $btn = $(
                `<button class="sb-btn" title="${sec}">
           <ha-icon icon="${ICON[sec] ?? 'mdi:circle'}"></ha-icon>
         </button>`
            );
            if (this._state.section === sec) $btn.addClass('active');
            $btn.on('click', () => {
                this._state.section = sec;
                $('#section-pill').text(sec.toUpperCase());
                this._renderMain();
                this._highlightSidebar();
            });
            $aside.append($btn);
        });
        this._highlightSidebar();
    }

    _highlightSidebar() {
        const $buttons = this.$('.sb-btn');
        $buttons.removeClass('active');
        $buttons.each((_, btn) => {
            if (btn.getAttribute('title') === this._state.section) this.$(btn).addClass('active');
        });
    }

    _renderChips() {
        const $ = this.$;
        const people = [
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
        ];
        const $chips = $('#chips').empty();
        people.forEach((p) => {
            const $chip = $(`
        <div class="chip" style="background:${p.color}">
          <div class="i"><ha-icon icon="${p.icon}"></ha-icon></div>
          <div class="n">${p.name}</div>
          <div class="v" id="chip-v-${p.key}"></div>
          <div class="bar"><div id="chip-bar-${p.key}" style="transform:scaleX(0)"></div></div>
        </div>
      `);
            $chip.on('click', () => {
                this._state.personFocus = p.name;
                // If Calendar is active and you want chips to filter it too:
                if (this._state.section === 'Calendar' && CHIP_FILTERS_CALENDAR) {
                    this._rebuildFullCalendar();
                }
                if (this._state.section === 'Chores') {
                    this._renderChores(); // refilter lists
                }
            });
            $chips.append($chip);
        });
    }

    _renderMain() {
        const $ = this.$;
        const $main = $('#main').empty();
        if (this._state.section === 'Calendar') {
            $main.append(
                '<div id="fc-wrap"><div id="fc"></div><div id="fc-legend" class="fb-legend"></div></div>'
            );
            this._initFullCalendar();
            this._renderLegend('#fc-legend');
            return;
        }
        if (this._state.section === 'Chores') {
            $main.append(
                '<div class="main-pad"><div id="chores" class="fb-chores-grid"></div></div>'
            );
            this._renderChores();
            return;
        }
        // Optional future sections:
        $main.append(
            '<div class="main-pad"><ha-card><div style="padding:12px">Not implemented</div></ha-card></div>'
        );
    }

    // ---------- Header clock ----------
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

    // ---------- Calendar ----------
    _renderLegend(selector) {
        const wrap = this.$(selector);
        if (!wrap.length) return;
        const legend = (this._config.calendars ?? [])
            .map(
                (
                    s
                ) => `<span class="fb-legend-item"><i class="fb-legend-swatch" style="background:${
                    s.color
                }"></i>
                 <span class="fb-legend-label">${s.entity.replace('calendar.', '')}</span></span>`
            )
            .join('');
        wrap.html(legend);
    }

    _eventSourcesForFocus() {
        // If CHIP_FILTERS_CALENDAR is false, always return all calendars.
        if (!CHIP_FILTERS_CALENDAR)
            return (this._config.calendars ?? []).map((src) => this._srcToFc(src));

        const focus = (this._state.personFocus ?? 'Family').toLowerCase();
        const cfgSources = this._config.calendars ?? [];
        const match = (entity, who) => {
            if (who === 'family') return true;
            const id = entity.toLowerCase();
            return id.startsWith(`calendar.${who}`) || id.includes(`_${who}`);
        };
        const filtered = cfgSources.filter((s) => match(s.entity, focus));
        return (filtered.length ? filtered : cfgSources).map((src) => this._srcToFc(src));
    }

    _srcToFc(src) {
        return {
            id: src.entity,
            color: src.color,
            events: (start, end, _tz, callback) => {
                const { startIso, endIso } = this._safeRangeToIso(start, end);
                const path = `calendars/${src.entity}?start=${encodeURIComponent(
                    startIso
                )}&end=${encodeURIComponent(endIso)}`;
                this._hass
                    ?.callApi('GET', path)
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
        };
    }

    _initFullCalendar() {
        const $fc = this.$('#fc');
        if (!($fc.length && this._$?.fn?.fullCalendar)) {
            $fc.html('<div class="fb-error">FullCalendar not loaded.</div>');
            return;
        }
        try {
            $fc.fullCalendar('destroy');
        } catch (_) {}
        const fcCfg = this._config.fc ?? {};
        const tz = this._config.timezone ?? 'local';
        const header = fcCfg.header ?? {
            left: 'prev,next today',
            center: 'title',
            right: 'month,agendaWeek,agendaDay',
        };
        if (header.right && header.right.includes(' '))
            header.right = header.right.replace(/\s+/g, ',');

        $fc.fullCalendar({
            header,
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
    }

    _rebuildFullCalendar() {
        const $fc = this.$('#fc');
        if (!($fc.length && this._fcReady)) {
            this._initFullCalendar();
            return;
        }
        try {
            const sources = $fc.fullCalendar('getEventSources') ?? [];
            sources.forEach((s) => s.remove());
            this._eventSourcesForFocus().forEach((src) => $fc.fullCalendar('addEventSource', src));
            this._refetchFullCalendar();
        } catch (e) {
            this._initFullCalendar();
        }
    }

    _refetchFullCalendar() {
        try {
            this.$('#fc').fullCalendar('refetchEvents');
        } catch (_) {}
    }

    _safeRangeToIso(start, end) {
        const toIso = (x) => {
            if (!x) return new Date().toISOString();
            if (typeof x.toDate === 'function') return x.toDate().toISOString(); // moment
            if (typeof x.toISOString === 'function') return x.toISOString(); // Date
            try {
                return new Date(x).toISOString();
            } catch {
                return new Date().toISOString();
            }
        };
        return { startIso: toIso(start), endIso: toIso(end) };
    }

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
        if (!isAllDay && hasSDT && !endStr) {
            const d = new Date(startStr);
            endStr = new Date(d.getTime() + 60 * 60 * 1000).toISOString();
        }

        const titleBase = ev.summary ?? ev.title ?? 'Busy';
        const start = new Date(startStr);
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');
        const title = isAllDay ? titleBase : `${hh}:${mm} ${titleBase}`;

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

    _fatal(msg) {
        console.error('[family-board-jq] ' + msg);
        this._root.innerHTML = `<ha-card><div class="fb-error">${msg}</div></ha-card>`;
    }
    _diag(msg) {
        if (!this._config.diagnostics?.enabled) return;
        console.log('[family-board-jq]', msg);
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
(window.customCards = window.customCards ?? []).push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'Sidebar + headers + chips + main view for Family dashboard.',
});
