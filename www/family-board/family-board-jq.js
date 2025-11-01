// /config/www/family-board/family-board-jq.js (v21)
// Family Board (jQuery + FullCalendar v2/3)

// ---------------- DEFAULT CONFIGURATION ----------------
const DEFAULTS = {
    title: 'Panogu Family',
    timezone: 'Europe/London',
    defaultSection: 'Calendar',
    fcDefaultView: 'month',
    fcFirstDay: 1,
    fcTimeFormat: 'HH:mm',
    fcContentHeight: 'auto',
    fcMinTime: '06:00:00',
    fcMaxTime: '22:00:00',
    fcSlotDuration: '00:30:00',
    layoutHideAppHeader: true,
    layoutCollapseSidebar: true,
    layoutFullBleedView: true,
    layoutSetVars: true,
    diagnosticsEnabled: false,
    simpleLegend: false,
    chipFiltersCalendar: true,
};

// Sidebar (views) + Header (title/time/section) + Chips (people) + Main (calendar/chores)
const PATHS = {
    jqueryUrl: '/local/family-board/vendor/jquery.min.3.7.1.js',
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    themeCssUrl: '/local/family-board/family-board.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js',
};

// Toggle: should person chips also filter CALENDAR sources?
const CHIP_FILTERS_CALENDAR = true;

class FamilyBoardJQ extends HTMLElement {
    // runtime fields
    _clockIntervalId = null;
    _resizeObserver = null;
    _onResizeBound = null;
    _rebuildTimer = null;
    _lastEvents = {};
    _preferredWideView = null;

    static getStubConfig() {
        return {
            mode: 'dashboard',
            title: 'Panogu Family',
            timezone: 'Europe/London',
            calendars: [
                { entity: 'calendar.family', color: 'var(--family-color-family,  #36B37E)' },
                { entity: 'calendar.anthony_2', color: 'var(--family-color-anthony,#7E57C2)' },
                { entity: 'calendar.joy_2', color: 'var(--family-color-joy,    #F4B400)' },
                { entity: 'calendar.lizzie_2', color: 'var(--family-color-lizzie, #EC407A)' },
                { entity: 'calendar.toby_2', color: 'var(--family-color-toby,   #42A5F5)' },
                { entity: 'calendar.routine', color: 'var(--family-color-routine,#b2fd7f)' },
            ],
            sections: ['Calendar', 'Chores'],
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
            diagnostics: { enabled: false },
            simpleLegend: false,
        };
    }

    setConfig(config) {
        // diagnosticsParam via ?diagnosticsParam=1
        const urlParams = new URLSearchParams(location.search);
        const diagnosticsParam = urlParams.get('diagnosticsParam');
        if (diagnosticsParam === '1') config = { ...config, diagnostics: { enabled: true } };

        this._config = { ...FamilyBoardJQ.getStubConfig(), ...config };

        // Normalize header.right for FC v2/3
        if (this._config?.fc?.header?.right?.includes(' '))
            this._config.fc.header.right = this._config.fc.header.right.replace(/\s+/g, ',');

        // restore persisted UI state
        const lastSection = localStorage.getItem('fb.section');
        const lastPerson = localStorage.getItem('fb.person');
        this._state = {
            section: lastSection ?? this._config.defaultSection ?? 'Calendar',
            personFocus: lastPerson ?? 'Family',
        };

        this._ensureRoot();
        this._ensureAssets()
            .then(() => this._renderEntry())
            .catch((err) => this._fatal(`Assets failed: ${String(err)}`));
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._$) return;

        this._updateHeader();

        // Calendar: ensure we fetch when hass arrives or when FC becomes ready
        if (this._state.section === 'Calendar') {
            if (this._fcReady) {
                // Rebuild to align sources with current person focus and fetch
                this._rebuildFullCalendar();
            } else {
                // Defer a fetch for when init completes
                clearTimeout(this._pendingRefetch);
                this._pendingRefetch = setTimeout(() => this._refetchFullCalendar(), 250);
            }
        }

        if (this._state.section === 'Chores') this._renderChores();
        this._updateChipCounts();
    }

    connectedCallback() {
        if (!this._clockIntervalId)
            this._clockIntervalId = setInterval(() => this._updateHeader(), 1000);
    }

    disconnectedCallback() {
        if (this._clockIntervalId) {
            clearInterval(this._clockIntervalId);
            this._clockIntervalId = null;
        }
        if (this._resizeObserver) {
            try {
                this._resizeObserver.disconnect();
            } catch {}
            this._resizeObserver = null;
        }
    }

    getCardSize() {
        return 6;
    }

    // ---------------- Shadow root shell ----------------
    _ensureRoot() {
        if (this._root) return;
        this._root = this.attachShadow({ mode: 'open' });
        this._styleHost = document.createElement('div'); // holds <link> stylesheets
        this._styleHost.setAttribute('part', 'styles');
        this._body = document.createElement('div'); // we re-render ONLY this node
        this._body.id = 'fb-body';
        this._root.append(this._styleHost, this._body);
    }

    // ---------------- Assets ----------------
    async _ensureAssets() {
        if (!window.jQuery) await this._loadScript(PATHS.jqueryUrl);
        this.$ = (sel, ctx) => window.jQuery(sel, ctx ?? this._body);
        this._$ = window.jQuery;

        if (PATHS.momentUrl && !window.moment) await this._loadScript(PATHS.momentUrl);
        if (PATHS.momentTzUrl && window.moment && !window.moment.tz)
            await this._loadScript(PATHS.momentTzUrl);

        if (PATHS.fcCssUrl) await this._loadCss(PATHS.fcCssUrl, true);
        if (PATHS.themeCssUrl) await this._loadCss(PATHS.themeCssUrl, true);

        if (!(this._$.fn && this._$.fn.fullCalendar)) await this._loadScript(PATHS.fcJsUrl);
        if (!(this._$.fn && this._$.fn.fullCalendar))
            throw new Error('FullCalendar jQuery build not detected.');

        if (window.moment && !window.__fbMomentZoneShimApplied) {
            const m = window.moment;
            const origUtcOffset = m.fn.utcOffset;
            // Replace .zone with a delegating function
            m.fn.zone = function (input) {
                if (typeof input === 'undefined') {
                    // getter
                    return origUtcOffset.call(this);
                }
                // Accept strings like "+00:00" or numbers (minutes)
                return origUtcOffset.call(this, input);
            };
            window.__fbMomentZoneShimApplied = true;
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
            if (intoShadow && this._styleHost) {
                if (
                    [...this._styleHost.querySelectorAll('link[rel="stylesheet"]')].some(
                        (l) => l.href === href
                    )
                )
                    return res();
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href + '?' + Math.floor(Date.now() / 1000);
                link.onload = res;
                link.onerror = () => rej(new Error(`css load failed (shadow): ${href}`));
                this._styleHost.appendChild(link);
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

    // ---------------- Render entry ----------------
    _renderEntry() {
        this._renderShell();
        this._renderSidebar();
        this._renderChips();
        this._renderMain();
    }

    _renderShell() {
        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div class="fb-layout">
        <aside id="sidebar"></aside>
        <header>
          <div class="fb-title">${this._escapeHtml(this._config.title ?? 'Family')}</div>
          <div class="fb-clock">
            <div class="time" id="h-time">--:--</div>
            <div class="date" id="h-date">-</div>
          </div>
          <div id="section-pill" class="fb-pill">${(
              this._state.section ?? 'Calendar'
          ).toUpperCase()}</div>
        </header>
        <div class="chips" id="chips"></div>
        <main id="main"></main>
      </div>`;
        this._body.innerHTML = '';
        this._body.append(card);
    }

    _renderSidebar() {
        const $ = this.$;
        const ICON = {
            Calendar: 'mdi:calendar',
            Chores: 'mdi:broom',
            Lists: 'mdi:format-list-bulleted',
            Photos: 'mdi:image-multiple',
        };
        const $aside = $('<div class="sidebar-aside">').attr('style', 'width: 100% !important;');
        $('#sidebar').empty().append($aside);

        (this._config.sections ?? []).forEach((sec) => {
            const $btn = $(`
        <button class="sb-btn" title="${this._escapeAttr(sec)}"
                aria-label="Open ${this._escapeAttr(sec)} section"
                role="button" tabindex="0" aria-pressed="${this._state.section === sec}">
          <ha-icon class="sb-icon" icon="${this._escapeAttr(ICON[sec] ?? 'mdi:circle')}"></ha-icon>
        </button>
      `);
            if (this._state.section === sec) $btn.addClass('active');
            $btn.on('click', () => {
                this._state.section = sec;
                localStorage.setItem('fb.section', this._state.section);
                this.$('#section-pill').text(sec.toUpperCase());
                this._renderMain();
                this._highlightSidebar();
            });
            $btn.on('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') $btn.click();
            });
            $aside.append($btn);
        });

        this._highlightSidebar();
    }

    _highlightSidebar() {
        const $buttons = this.$('.sb-btn');
        $buttons.removeClass('active').each((_, btn) => {
            if (btn.getAttribute('title') === this._state.section) {
                this.$(btn).addClass('active').attr('aria-pressed', 'true');
            } else {
                this.$(btn).attr('aria-pressed', 'false');
            }
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
                color: 'var(--family-color-anthony,#7E57C2)',
            },
            {
                key: 'joy',
                name: 'Joy',
                icon: 'mdi:book-open-variant',
                color: 'var(--family-color-joy,   #F4B400)',
            },
            {
                key: 'lizzie',
                name: 'Lizzie',
                icon: 'mdi:teddy-bear',
                color: 'var(--family-color-lizzie,#EC407A)',
            },
            {
                key: 'toby',
                name: 'Toby',
                icon: 'mdi:soccer',
                color: 'var(--family-color-toby,  #42A5F5)',
            },
        ];

        const $chips = $('#chips').empty();
        people.forEach((p) => {
            const isActive = (this._state.personFocus || 'Family').toLowerCase() === p.key;

            const $chip = $(`
        <div class="chip ${isActive ? 'active' : ''}"
             data-key="${this._escapeAttr(p.key)}"
             role="button" tabindex="0"
             aria-pressed="${isActive}"
             style="background:${p.color}">
          <div class="i"><ha-icon icon="${this._escapeAttr(p.icon)}"></ha-icon></div>
          <div class="n">${this._escapeHtml(p.name)}</div>
          <div class="cnt" id="chip-today-${this._escapeAttr(p.key)}"
               title="Tasks left today"
               aria-label="Tasks left today">0</div>
          <div class="bar"
               role="progressbar"
               aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"
               aria-label="${this._escapeAttr(p.name)} progress today">
            <div class="bar-fill" id="chip-progress-${this._escapeAttr(
                p.key
            )}" style="transform:scaleX(0)"></div>
          </div>
        </div>
      `);

            const activate = () => {
                this._state.personFocus = p.name;
                localStorage.setItem('fb.person', this._state.personFocus);
                this.$('.chip').removeClass('active').attr('aria-pressed', 'false');
                $chip.addClass('active').attr('aria-pressed', 'true');

                if (
                    this._state.section === 'Calendar' &&
                    typeof CHIP_FILTERS_CALENDAR !== 'undefined' &&
                    CHIP_FILTERS_CALENDAR
                ) {
                    clearTimeout(this._rebuildTimer);
                    this._rebuildTimer = setTimeout(() => this._rebuildFullCalendar(), 120);
                }
                if (this._state.section === 'Chores') this._renderChores();
            };

            $chip.on('click', activate);
            $chip.on('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') activate();
            });

            $chips.append($chip);
        });

        // Optional global pending counts (unrelated to "today" bar)
        this._updateChipCounts();
    }

    _renderMain() {
        const $ = this.$;
        const $main = $('#main').empty();

        if (this._state.section === 'Calendar') {
            $main.append(
                '<div id="fc-wrap"><div id="fc"><div class="fb-skeleton" style="height:420px;margin:12px"></div></div><div id="fc-legend" class="fb-legend"></div></div>'
            );
            this._initFullCalendar();
            this._renderLegend('#fc-legend');

            if (!this._resizeObserver)
                this._resizeObserver = new ResizeObserver(() => {
                    this._applyMeasuredHeight();
                });

            const wrap = this._body.querySelector('#fc-wrap');
            if (wrap) this._resizeObserver.observe(wrap);
            return;
        }

        if (this._state.section === 'Chores') {
            $main.append(
                '<div class="main-pad"><div id="chores" class="fb-chores-grid"></div></div>'
            );
            this._renderChores();
            return;
        }

        $main.append(
            '<div class="main-pad"><ha-card><div style="padding:12px">Not implemented</div></ha-card></div>'
        );
    }

    // ---------------- Header clock ----------------
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

    // ---------------- Chips: todo counts ----------------
    // Replace the whole _updateChipCounts() in family-board-jq.js
    _updateChipCounts() {
        const lists = this._config.todos ?? {};
        const count = (ent) => {
            if (!ent) return 0;
            const st = this._hass?.states?.[ent];
            return (st?.attributes?.items ?? []).filter((i) => i.status !== 'completed').length;
        };
        const map = {
            family: count(lists.family),
            anthony: count(lists.anthony),
            joy: count(lists.joy),
            lizzie: count(lists.lizzie),
            toby: count(lists.toby),
        };

        // Update number pill + progress fill using the IDs created in renderChips()
        Object.entries(map).forEach(([k, v]) => {
            const left = Math.max(0, Number(v) || 0); // tasks left today
            const ratio = Math.min(left / 10, 1); // simple visual scale (0..1)

            // Number pill
            this.$(`#chip-today-${k}`).text(String(left));

            // Progress fill
            this.$(`#chip-progress-${k}`).css('transform', `scaleX(${ratio})`);

            // Progressbar ARIA on the bar container (keep max at 10 for now)
            const $bar = this.$(`.chip[data-key="${k}"] .bar`);
            if ($bar.length) {
                $bar.attr({
                    'aria-valuemin': 0,
                    'aria-valuemax': 10,
                    'aria-valuenow': Math.round(ratio * 10),
                    'aria-label': `${k} progress today: ${Math.round(ratio * 10)}/10`,
                });
            }
        });
    }

    // ---------------- Calendar ----------------
    _renderLegend(selector) {
        const wrap = this.$(selector);
        if (!wrap.length) return;
        const legend = (this._config.calendars ?? [])
            .map((s) => {
                const label = s.label ?? String(s.entity ?? '').replace(/^calendar\./, '');
                return `
          <span class="fb-legend-item">
            <i class="fb-legend-swatch" style="background:${s.color}"></i>
            <span class="fb-legend-label">${this._escapeHtml(label)}</span>
          </span>`;
            })
            .join('');
        wrap.html(legend);
    }

    _eventSourcesForFocus() {
        if (!CHIP_FILTERS_CALENDAR)
            return (this._config.calendars ?? []).map((src) => this._srcToFc(src));

        const focus = (this._state.personFocus ?? 'Family').toLowerCase();
        const cfgSources = this._config.calendars ?? [];
        const match = (src, who) => {
            if (who === 'family') return true;
            if (src.owner) return String(src.owner).toLowerCase() === who;
            const id = String(src.entity ?? '').toLowerCase();
            return id.startsWith(`calendar.${who}`) || id.includes(`_${who}`);
        };
        const filtered = cfgSources.filter((s) => match(s, focus));
        return (filtered.length ? filtered : cfgSources).map((src) => this._srcToFc(src));
    }

    _srcToFc(src) {
        return {
            id: src.entity,
            color: src.color,
            events: (start, end, _tz, callback) => {
                // ---- NEW: defer until hass exists (prevents first-load hang) ----
                if (!this._hass || typeof this._hass.callApi !== 'function') {
                    this._showBanner('Waiting for Home Assistant…');
                    setTimeout(() => this._refetchFullCalendar(), 150);
                    callback([]); // return quickly so FC doesn’t stall
                    return;
                }

                const { startIso, endIso } = this._safeRangeToIso(start, end);
                const path = `calendars/${src.entity}?start=${encodeURIComponent(
                    startIso
                )}&end=${encodeURIComponent(endIso)}`;

                // Diagnostic
                const viewName = (() => {
                    try {
                        return this.$('#fc').fullCalendar('getView')?.name;
                    } catch {
                        return 'unknown';
                    }
                })();
                this._diag(`fetch ${src.entity} for ${viewName} :: ${startIso} → ${endIso}`);

                this._hass
                    .callApi('GET', path)
                    .then((events) => {
                        const mapped = events.map((ev) => this._mapHaEventToFc(ev)).filter(Boolean);
                        this._lastEvents[src.entity] = mapped; // cache
                        this._diag(`→ ${src.entity} returned ${mapped.length} mapped events`);
                        callback(mapped);
                        this._hideBanner();
                    })
                    .catch((_err) => {
                        if (this._lastEvents[src.entity]) {
                            this._showBanner('Network issue. Showing cached data.');
                            callback(this._lastEvents[src.entity]);
                        } else {
                            callback([]);
                            this._showBanner('Unable to load events right now.');
                        }
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
        } catch {}

        const fcCfg = this._config.fc ?? {};
        this._preferredWideView =
            this._preferredWideView ?? fcCfg.defaultView ?? fcCfg.initialView ?? 'agendaWeek';

        const isNarrow = () => (this._root.host?.offsetWidth ?? window.innerWidth) < 760;

        const header = { ...fcCfg.header };
        if (header?.right?.includes(' ')) header.right = header.right.replace(/\s+/g, ',');

        const initialView = isNarrow() ? 'agendaDay' : this._preferredWideView || 'agendaWeek';

        $fc.fullCalendar({
            header,
            defaultView: initialView,
            // Use local to avoid older moment.zone code paths
            timezone: 'local',
            // Agenda options
            allDaySlot: fcCfg.allDaySlot !== false,
            minTime: fcCfg.minTime ?? '06:00:00',
            maxTime: fcCfg.maxTime ?? '22:00:00',
            slotDuration: fcCfg.slotDuration ?? '00:30:00',
            hiddenDays: Array.isArray(fcCfg.hiddenDays) ? fcCfg.hiddenDays : [],
            timeFormat: fcCfg.timeFormat ?? 'HH:mm',

            // Let us set numeric height after FC lays out
            contentHeight: null,
            height: null,
            handleWindowResize: false,

            editable: false,
            selectable: false,
            lazyFetching: true,
            eventLimit: true,
            weekNumbers: false,
            views: fcCfg.views ?? undefined,

            eventSources: this._eventSourcesForFocus(),
            eventRender: (event, element) => {
                const color = event.color || (event.source && event.source.color);
                if (color) element.css('backgroundColor', color);
                if (event.textColor) element.css('color', event.textColor);
                element.attr('title', this._escapeAttr(event.title));
            },
            viewRender: (view) => {
                if (view.name !== 'agendaDay') this._preferredWideView = view.name;
                this._applyMeasuredHeight();
            },
            eventAfterAllRender: () => {
                try {
                    const count = ($fc.fullCalendar('clientEvents') || []).length;
                    this._diag(`eventAfterAllRender :: ${count} events in current view`);
                } catch {}
            },
        });

        // Responsive only when crossing the narrow threshold
        const onResize = () => {
            try {
                const narrow = isNarrow();
                const current = $fc.fullCalendar('getView')?.name;
                if (narrow && current !== 'agendaDay') {
                    $fc.fullCalendar('changeView', 'agendaDay');
                } else if (!narrow && current === 'agendaDay') {
                    $fc.fullCalendar('changeView', this._preferredWideView || 'agendaWeek');
                }
                // IMPORTANT: force a render after size changes
                $fc.fullCalendar('render');
                this._applyMeasuredHeight();
            } catch {}
        };
        window.removeEventListener('resize', this._onResizeBound);
        this._onResizeBound = onResize;
        window.addEventListener('resize', onResize);

        this._fcReady = true;

        requestAnimationFrame(() => {
            try {
                $fc.fullCalendar('render'); // draw week grid reliably
                this._applyMeasuredHeight(); // set numeric height
                this._rebuildFullCalendar(); // add sources + fetch now that FC is ready
            } catch {}
        });
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
        } catch {
            this._initFullCalendar();
        }
    }

    _refetchFullCalendar() {
        try {
            this.$('#fc').fullCalendar('refetchEvents');
        } catch {}
    }

    // ---------------- Chores ----------------
    _renderChores() {
        if (this._state.section !== 'Chores' || !this._hass) return;
        const $root = this.$('#chores');
        if (!$root.length) return;

        const lists = this._config.todos ?? {};
        const keys = ['anthony', 'joy', 'family', 'lizzie', 'toby'].filter((k) => lists[k]);

        // Person-focused filtering
        const focus = (this._state.personFocus || 'Family').toLowerCase();
        const filterKeys = focus === 'family' ? keys : keys.filter((k) => k === focus);

        const html = filterKeys
            .map((k) => {
                const ent = lists[k];
                const st = this._hass.states?.[ent];
                let items = (st?.attributes?.items ?? []).filter((it) => it.status !== 'completed');

                // optional: sort by due then priority
                items = items.sort(
                    (a, b) =>
                        (a.due ?? '').localeCompare(b.due ?? '') ||
                        (b.priority ?? 0) - (a.priority ?? 0)
                );

                const body = items.length
                    ? items
                          .map(
                              (it) => `
            <button class="fb-chore"
                    data-entity="${this._escapeAttr(ent)}"
                    data-id="${this._escapeAttr(String(it.uid ?? it.id ?? it.summary))}"
                    style="text-align:left;padding:4px;border:0;background:transparent;cursor:pointer">
              – ${this._escapeHtml(String(it.summary ?? ''))}
            </button>`
                          )
                          .join('')
                    : `<div class="fb-muted">Nothing pending</div>`;

                const title = k[0].toUpperCase() + k.slice(1);
                return `
        <ha-card>
          <div class="fb-card-title">${this._escapeHtml(title)}</div>
          <div class="fb-card-body">${body}</div>
        </ha-card>`;
            })
            .join('');

        $root.html(html);

        // mark-complete handler (if service available)
        this.$('.fb-chore').on('click', (e) => {
            const el = this.$(e.currentTarget);
            const entity_id = el.data('entity');
            const item = String(el.data('id'));
            this._hass
                ?.callService('todo', 'update_item', { entity_id, item, status: 'completed' })
                .then(() => this._renderChores())
                .catch(() => {
                    /* no-op */
                });
        });
    }

    // ---------------- Banners ----------------
    _showBanner(msg) {
        const host = this.$('#main');
        if (!host.length) return;
        const existing = this.$('#fb-banner');
        const html = `
      <div id="fb-banner"
           style="padding:6px 12px;background:var(--fb-surface, #fff);color:#b00020;border-radius:8px;margin:8px;border:1px solid var(--fb-grid,#e5e7eb)">
        ${this._escapeHtml(msg)}
      </div>`;
        existing.length ? existing.replaceWith(html) : host.prepend(html);
    }

    _hideBanner() {
        this.$('#fb-banner').remove();
    }

    // ---------------- Utils ----------------
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
        if (!ev || !ev.start) return null;

        const s = ev.start || {};
        const e = ev.end || {};

        const hasSD = typeof s.date === 'string';
        const hasED = typeof e.date === 'string';
        const hasSDT = typeof s.dateTime === 'string';
        const hasEDT = typeof e.dateTime === 'string';

        // 1) ALL-DAY (keep date-only strings; FC expects exclusive end)
        if (hasSD) {
            const startDate = s.date; // 'YYYY-MM-DD'
            let endDate = hasED ? e.date : null; // 'YYYY-MM-DD' or null

            if (!endDate) {
                const d = new Date(`${startDate}T00:00:00Z`);
                d.setUTCDate(d.getUTCDate() + 1);
                endDate = d.toISOString().slice(0, 10);
            }

            const titleBase = String(ev.summary ?? ev.title ?? 'Busy');
            return {
                id: ev.uid ?? `${startDate}-${titleBase}`.replace(/\s+/g, '_'),
                title: this._escapeHtml(titleBase),
                start: startDate, // date-only
                end: endDate, // date-only (exclusive)
                allDay: true,
                location: ev.location,
                description: ev.description,
                color: ev.color,
            };
        }

        // 2) TIMED (use Date objects to dodge Moment parsing quirks)
        if (hasSDT) {
            const startStr = s.dateTime;
            let endStr = hasEDT ? e.dateTime : null;
            if (!endStr) {
                const d = new Date(startStr);
                endStr = new Date(d.getTime() + 3600000).toISOString(); // +1h fallback
            }

            const start = new Date(startStr);
            const end = new Date(endStr);

            const titleBase = String(ev.summary ?? ev.title ?? 'Busy');
            const hh = String(start.getHours()).padStart(2, '0');
            const mm = String(start.getMinutes()).padStart(2, '0');

            return {
                id: ev.uid ?? `${startStr}-${titleBase}`.replace(/\s+/g, '_'),
                title: this._escapeHtml(`${hh}:${mm} ${titleBase}`),
                start, // Date object
                end, // Date object
                allDay: false,
                location: ev.location,
                description: ev.description,
                color: ev.color,
            };
        }

        return null;
    }

    _fatal(msg) {
        console.error('[family-board-jq] ' + msg);
        this._body.innerHTML = `<ha-card><div class="fb-error">${this._escapeHtml(
            msg
        )}</div></ha-card>`;
    }

    _diag(msg) {
        if (!this._config.diagnostics?.enabled) return;
        console.log('[family-board-jq]', msg);
    }

    // Replace escapeHtml() in family-board-jq.js
    _escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _escapeAttr(s) {
        return this._escapeHtml(String(s)).replace(/`/g, '&#96;');
    }

    /**
     * Update a single chip's "today" counters and progress.
     * @param {('family'|'anthony'|'joy'|'lizzie'|'toby')} key
     * @param {{completed:number,total:number}} totals
     */
    setChipTodayTotals(key, totals) {
        if (!key) return;
        const k = String(key).toLowerCase();
        const completed = Math.max(0, Number(totals?.completed ?? 0));
        const total = Math.max(0, Number(totals?.total ?? 0));
        const left = Math.max(0, total - completed);
        const ratio = total > 0 ? Math.min(completed / total, 1) : 0;

        const $left = this.$(`#chip-today-${k}`);
        if ($left.length) {
            $left.text(String(left));
            $left.attr('title', `${left} left today (of ${total})`);
        }

        const $fill = this.$(`#chip-progress-${k}`);
        if ($fill.length) $fill.css('transform', `scaleX(${ratio})`);

        const $bar = this.$(`.chip[data-key="${k}"] .bar`);
        if ($bar.length) {
            $bar.attr({
                'aria-valuemin': 0,
                'aria-valuemax': total,
                'aria-valuenow': completed,
                'aria-label': `${k} progress today: ${completed}/${total}`,
            });
        }
    }

    /** Batch update: { anthony:{completed:2,total:5}, joy:{...}, ... } */
    setAllChipTodayTotals(map) {
        if (!map || typeof map !== 'object') return;
        for (const [key, totals] of Object.entries(map)) this.setChipTodayTotals(key, totals);
    }

    /** Measure the available space and set a numeric height on FullCalendar. */
    _applyMeasuredHeight() {
        const wrap = this._body.querySelector('#fc-wrap');
        const $fc = this.$('#fc');
        if (!wrap || !$fc.length) return;

        const toolbar = this._body.querySelector('#fc-wrap .fc-toolbar');
        const legend = this._body.querySelector('#fc-legend');

        const wrapH = wrap.clientHeight || 0;
        const tbH = toolbar ? toolbar.offsetHeight + 24 : 0;
        const lgH = legend ? legend.offsetHeight + 12 : 0;

        const target = Math.max(360, wrapH - tbH - lgH);
        try {
            $fc.fullCalendar('option', 'height', target);
        } catch {}
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
(window.customCards = window.customCards ?? []).push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'Sidebar + header + chips + main view for Family dashboard.',
});
