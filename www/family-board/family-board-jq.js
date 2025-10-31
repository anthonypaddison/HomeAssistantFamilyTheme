// /config/www/family-board/family-board-jq.js (v20)
// Family Board (jQuery + FullCalendar v2/3)
// Sidebar (views) + Header (title/time/section) + Chips (people) + Main (calendar/chores)

const PATHS = {
    jqueryUrl: '/local/family-board/vendor/jquery.min.3.7.1.js',
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    themeCssUrl: '/local/family-board/family-board.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js', // jQuery build
};

// Toggle: should person chips also filter CALENDAR sources?
const CHIP_FILTERS_CALENDAR = true;

class FamilyBoardJQ extends HTMLElement {
    // runtime fields
    _clockIntervalId = null;
    _resizeObserver = null;
    _rebuildTimer = null;
    _lastEvents = {}; // cache per source for offline fallback

    static getStubConfig() {
        return {
            mode: 'dashboard',
            title: 'Panogu Family',
            timezone: 'Europe/London',
            calendars: [], // [{ entity, color, owner?, label? }]
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

    setConfig(cfg) {
        // diag via ?diag=1
        const urlParams = new URLSearchParams(location.search);
        const diag = urlParams.get('diag');
        if (diag === '1') cfg = { ...cfg, diagnostics: { enabled: true } };

        this._config = { ...FamilyBoardJQ.getStubConfig(), ...cfg };
        // Normalize header.right for FC v2/3
        if (this._config?.fc?.header?.right?.includes(' '))
            this._config.fc.header.right = this._config.fc.header.right.replace(/\s+/g, ',');

        // restore persisted UI state
        const lastSec = localStorage.getItem('fb.section');
        const lastPer = localStorage.getItem('fb.person');
        this._state = {
            section: lastSec || this._config.defaultSection || 'Calendar',
            personFocus: lastPer || 'Family',
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
        if (this._state.section === 'Calendar' && this._fcReady) this._refetchFullCalendar();
        if (this._state.section === 'Chores') this._renderChores();
        this._updateChipCounts(); // show todo counts even while on calendar
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

    // ---------- Shadow root shell ----------
    _ensureRoot() {
        if (this._root) return;
        this._root = this.attachShadow({ mode: 'open' });
        this._styleHost = document.createElement('div'); // holds <link> stylesheets
        this._styleHost.setAttribute('part', 'styles');
        this._body = document.createElement('div'); // we re-render ONLY this node
        this._body.id = 'fb-body';
        this._root.append(this._styleHost, this._body);
    }

    // ---------- Assets ----------
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
                link.href = href;
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

    // ---------- Render entry ----------
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
        const $aside = $('<div/>');
        $('#sidebar').empty().append($aside);

        (this._config.sections || []).forEach((sec) => {
            const $btn = $(`
        <button class="sb-btn" title="${this._escapeAttr(
            sec
        )}" role="button" tabindex="0" aria-pressed="${this._state.section === sec}">
          <ha-icon icon="${this._escapeAttr(ICON[sec] ?? 'mdi:circle')}"></ha-icon>
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
            const isActive = (this._state.personFocus || 'Family').toLowerCase() === p.key;
            const $chip = $(`
        <div class="chip ${isActive ? 'active' : ''}" data-key="${this._escapeAttr(
                p.key
            )}" role="button" tabindex="0" aria-pressed="${isActive}" style="background:${p.color}">
          <div class="i"><ha-icon icon="${this._escapeAttr(p.icon)}"></ha-icon></div>
          <div class="n">${this._escapeHtml(p.name)}</div>
          <div class="v" id="chip-v-${this._escapeAttr(p.key)}"></div>
          <div class="bar"><div id="chip-bar-${this._escapeAttr(
              p.key
          )}" style="transform:scaleX(0)"></div></div>
        </div>
      `);
            const activate = () => {
                this._state.personFocus = p.name;
                localStorage.setItem('fb.person', this._state.personFocus);
                this.$('.chip').removeClass('active').attr('aria-pressed', 'false');
                $chip.addClass('active').attr('aria-pressed', 'true');
                // debounce calendar rebuild to avoid thrash
                if (this._state.section === 'Calendar' && CHIP_FILTERS_CALENDAR) {
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
                    try {
                        this.$('#fc').fullCalendar('option', 'height', 'auto');
                    } catch {}
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

    // ---------- Chips: todo counts ----------
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
        Object.entries(map).forEach(([k, v]) => {
            this.$(`#chip-v-${k}`).text(v > 0 ? String(v) : '');
            this.$(`#chip-bar-${k}`).css('transform', `scaleX(${Math.min(v / 10, 1)})`);
        });
    }

    // ---------- Calendar ----------
    _renderLegend(selector) {
        const wrap = this.$(selector);
        if (!wrap.length) return;
        const legend = (this._config.calendars ?? [])
            .map((s) => {
                const label = s.label || (s.entity || '').replace('calendar.', '');
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
            const id = String(src.entity || '').toLowerCase();
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
                const { startIso, endIso } = this._safeRangeToIso(start, end);
                const path = `calendars/${src.entity}?start=${encodeURIComponent(
                    startIso
                )}&end=${encodeURIComponent(endIso)}`;

                this._hass
                    ?.callApi('GET', path)
                    .then((events) => {
                        const mapped = events.map((ev) => this._mapHaEventToFc(ev)).filter(Boolean);
                        this._lastEvents[src.entity] = mapped; // cache
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
        const tz = this._config.timezone ?? 'local';
        const isNarrow = () => (this._root.host?.offsetWidth || window.innerWidth) < 760;
        const header = { ...fcCfg.header };
        if (header?.right?.includes(' ')) header.right = header.right.replace(/\s+/g, ',');

        $fc.fullCalendar({
            header,
            defaultView: isNarrow()
                ? 'agendaDay'
                : fcCfg.defaultView ?? fcCfg.initialView ?? 'agendaWeek',
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
                element.attr('title', this._escapeAttr(event.title));
            },
            viewRender: () => {
                requestAnimationFrame(() => {
                    try {
                        $fc.fullCalendar('option', 'height', 'auto');
                    } catch {}
                });
            },
        });

        // respond to window resizes with view change for mobile/desktop
        const onResize = () => {
            try {
                const target = isNarrow() ? 'agendaDay' : fcCfg.defaultView ?? 'agendaWeek';
                $fc.fullCalendar('changeView', target);
            } catch {}
        };
        window.removeEventListener('resize', this._onResizeBound);
        this._onResizeBound = onResize;
        window.addEventListener('resize', onResize);

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
        } catch {
            this._initFullCalendar();
        }
    }

    _refetchFullCalendar() {
        try {
            this.$('#fc').fullCalendar('refetchEvents');
        } catch {}
    }

    // ---------- Chores ----------
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
                        (a.due || '').localeCompare(b.due || '') ||
                        (b.priority || 0) - (a.priority || 0)
                );

                const body = items.length
                    ? items
                          .map(
                              (it) => `
            <button class="fb-chore" data-entity="${this._escapeAttr(
                ent
            )}" data-id="${this._escapeAttr(
                                  String(it.uid || it.id || it.summary)
                              )}" style="text-align:left;padding:4px;border:0;background:transparent;cursor:pointer">
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
            // Best-effort—adjust if your integration differs:
            this._hass
                ?.callService('todo', 'update_item', { entity_id, item, status: 'completed' })
                .then(() => this._renderChores())
                .catch(() => {
                    /* no-op */
                });
        });
    }

    // ---------- Banners ----------
    _showBanner(msg) {
        const host = this.$('#main');
        if (!host.length) return;
        const existing = this.$('#fb-banner');
        if (existing.length) {
            existing.text(msg);
            return;
        }
        host.prepend(
            `<div id="fb-banner" style="padding:6px 12px;background:#fff;color:#b00020;border-radius:8px;margin:8px">${this._escapeHtml(
                msg
            )}</div>`
        );
    }
    _hideBanner() {
        this.$('#fb-banner').remove();
    }

    // ---------- Utils ----------
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
            endStr = new Date(d.getTime() + 3600000).toISOString();
        }

        const titleBase = String(ev.summary ?? ev.title ?? 'Busy');
        const start = new Date(startStr);
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');
        const title = isAllDay ? titleBase : `${hh}:${mm} ${titleBase}`;

        return {
            id: ev.uid ?? `${startStr}-${titleBase}`.replace(/\s+/g, '_'),
            title: this._escapeHtml(title),
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
        this._body.innerHTML = `<ha-card><div class="fb-error">${this._escapeHtml(
            msg
        )}</div></ha-card>`;
    }

    _diag(msg) {
        if (!this._config.diagnostics?.enabled) return;
        console.log('[family-board-jq]', msg);
    }

    _escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }
    _escapeAttr(s) {
        return this._escapeHtml(s).replace(/`/g, '&#96;');
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
(window.customCards = window.customCards ?? []).push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'Sidebar + header + chips + main view for Family dashboard.',
});
