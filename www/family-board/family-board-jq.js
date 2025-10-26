// /config/www/family-board/family-board-jq.js
// Family Board (jQuery + FullCalendar v2)
// - Calendar section renders FullCalendar agenda (Mon–Fri).
// - Set local library paths in PATHS below (served via /local/...).
// - No HACS required.

const PATHS = {
    // REQUIRED: jQuery (place under /config/www/... and reference via /local/...)
    jqueryUrl: '/local/family-board/vendor/jquery-3.7.1.min.js',

    // RECOMMENDED for correct date handling with FC v2:
    momentUrl: '/local/family-board/vendor/moment.min.js',
    momentTzUrl: '/local/family-board/vendor/moment-timezone.min.js',

    // REQUIRED: FullCalendar v2 (jQuery plugin)
    fcCssUrl: '/local/family-board/vendor/fullcalendar.min.css',
    fcJsUrl: '/local/family-board/vendor/fullcalendar.min.js',
};

class FamilyBoardJQ extends HTMLElement {
    static getStubConfig() {
        return {
            title: 'Panogu Family',
            timezone: 'Europe/London',
            calendars: [
                // Change these to your actual entity IDs (use *_2 if that’s what you have)
                { entity: 'calendar.family', color: 'var(--family-color-family, #36B37E)' },
                { entity: 'calendar.anthony', color: 'var(--family-color-anthony, #7E57C2)' },
                { entity: 'calendar.joy', color: 'var(--family-color-joy, #F4B400)' },
                { entity: 'calendar.lizzie', color: 'var(--family-color-lizzie, #EC407A)' },
                { entity: 'calendar.toby', color: 'var(--family-color-toby, #42A5F5)' },
                { entity: 'calendar.routine', color: 'var(--family-color-routine, #b2fd7fff)' },
            ],
            sections: ['Calendar', 'Chores', 'Lists', 'Photos'],
            defaultSection: 'Calendar',
            // Chip metrics (optional)
            metrics: {
                family: {
                    done: 'input_number.completed_due_today_family',
                    todo: 'input_number.outstanding_family_today',
                },
                anthony: {
                    done: 'input_number.completed_due_today_anthony',
                    todo: 'input_number.outstanding_anthony_today',
                },
                joy: {
                    done: 'input_number.completed_due_today_joy',
                    todo: 'input_number.outstanding_joy_today',
                },
                lizzie: {
                    done: 'input_number.completed_due_today_lizzie',
                    todo: 'input_number.outstanding_lizzie_today',
                },
                toby: {
                    done: 'input_number.completed_due_today_toby',
                    todo: 'input_number.outstanding_toby_today',
                },
            },
            todos: {
                family: 'todo.family',
                anthony: 'todo.anthony',
                joy: 'todo.joy',
                lizzie: 'todo.lizzie',
                toby: 'todo.toby',
            },
            // FullCalendar defaults
            fc: {
                initialView: 'agendaWeek',
                hiddenDays: [0, 6], // Sun, Sat hidden
                allDaySlot: true,
                minTime: '06:00:00',
                maxTime: '22:00:00',
                slotDuration: '01:00:00',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay',
                },
                titleFormat: { month: 'MMMM', week: 'MMMM Do', day: 'MMMM Do' },
                timeFormat: 'HH:mm',
            },
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
            .then(() => this._renderShell())
            .catch((err) => {
                console.error('[family-board-jq] asset load failed', err);
                this._root.innerHTML = `<ha-card><div style="padding:12px;color:#b00020">Failed to load assets: ${String(
                    err
                )}</div></ha-card>`;
            });
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._$) return; // jQuery not ready yet
        this._updateHeader();
        this._updateChips();
        this._updateSidebarBadge();

        // If calendar is visible, refresh events (throttled by FullCalendar’s own lazy fetch).
        if (this._state.section === 'Calendar' && this._fcReady) {
            this._refetchFullCalendar(); // safe no-op if not yet mounted
        }

        if (this._state.section === 'Chores') this._renderChoresIfVisible();
    }

    getCardSize() {
        return 6;
    }

    /* ---------------- Assets ---------------- */

    async _ensureAssets() {
        // jQuery
        if (!window.jQuery) await this._loadScript(PATHS.jqueryUrl);
        this.$ = (sel, ctx) => window.jQuery(sel, ctx || this._root);
        this._$ = window.jQuery;

        // moment (+timezone) first, then FullCalendar
        if (PATHS.momentUrl && !window.moment) await this._loadScript(PATHS.momentUrl);
        if (PATHS.momentTzUrl && window.moment && !window.moment.tz)
            await this._loadScript(PATHS.momentTzUrl);

        if (PATHS.fcCssUrl) await this._loadCss(PATHS.fcCssUrl, true /*into Shadow*/);
        if (PATHS.fcJsUrl && !(this._$.fn && this._$.fn.fullCalendar))
            await this._loadScript(PATHS.fcJsUrl);
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
                const exists = [...this._root.querySelectorAll('link[rel="stylesheet"]')].some(
                    (l) => l.href === href
                );
                if (exists) return res();
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

    /* ---------------- Shell ---------------- */

    _ensureRoot() {
        if (this._root) return;
        this._root = this.attachShadow({ mode: 'open' });
    }

    _renderShell() {
        const style = document.createElement('style');
        style.textContent = `
      :host { display:block; }
      ha-card { height: 100%; background: var(--family-background, #fff); }
      .layout {
        display: grid;
        grid-template-columns: 80px 1fr;
        grid-template-rows: 48px 72px 1fr;
        grid-template-areas:
          "sidebar header"
          "sidebar chips"
          "sidebar main";
        height: calc(100vh - var(--header-height, 0px));
      }
      header {
        grid-area: header;
        display:flex; align-items:center; justify-content:space-between;
        padding: 8px 12px;
        background: var(--app-header-background-color, #CFBAF0);
        color: var(--primary-text-color, #0F172A);
        font-weight: 800;
      }
      header .time { font-size: 28px; line-height: 1; }
      header .date { font-size: 12px; opacity: .85; font-weight:700; }
      aside {
        grid-area: sidebar;
        display:flex; flex-direction:column; align-items:center;
        background: var(--app-header-background-color, #CFBAF0);
        padding: 8px 0; gap: 8px;
      }
      .sb-btn {
        width: 56px; height: 72px; display:grid; place-items:center;
        background: transparent; border:0; cursor:pointer; position:relative;
        color: var(--family-background, #fff);
      }
      .sb-btn.active { color: var(--app-header-background-color, #0F172A); background: var(--family-background, #fff); }
      .sb-badge {
        position:absolute; bottom:6px; right:6px;
        min-width: 18px; height:18px; border-radius: 12px;
        background:#fff; color:#0F172A; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center;
        border: 1px solid #0F172A;
      }
      .chips {
        grid-area: chips; display:grid; grid-template-columns: repeat(5, 1fr);
        gap: 8px; padding: 8px;
        background: var(--app-header-background-color, #CFBAF0);
      }
      .chip {
        display:grid; grid-template-areas: "i n v" "bar bar bar";
        grid-template-columns: 24px 1fr auto; grid-template-rows: auto 6px;
        border-radius: 10px; padding: 6px 8px; cursor: pointer;
        background: var(--primary-color, #B9FBC0);
      }
      .chip .i { grid-area:i; display:grid; place-items:center; }
      .chip .n { grid-area:n; font-weight:800; color:#0F172A; }
      .chip .v { grid-area:v; font-weight:800; color:#0F172A; }
      .chip .bar { grid-area:bar; height:8px; background: rgba(0,0,0,.10); border-radius: 999px; position:relative; overflow:hidden; }
      .chip .bar > div { position:absolute; inset:0; background: rgba(255,255,255,.85); transform-origin:left; }
      main { grid-area: main; height: 100%; overflow: hidden; }
      .main-pad { height:100%; padding: 12px; overflow:auto; background: #F8FAFC; }
      /* FullCalendar should occupy all remaining height */
      #fc-wrap, #fc {
        height: 100%;
      }
      /* Force FullCalendar to fill height inside the shadow root */
      .fc, .fc-view, .fc-view > table, .fc-view > .fc-scroller {
        height: 100% !important;
        max-height: 100% !important;
      }
    `;

        const card = document.createElement('ha-card');
        card.innerHTML = `
      <div class="layout">
        <aside id="sidebar"></aside>
        <header>
          <div style="font-weight:800">${this._config.title || 'Family'}</div>
          <div style="text-align:center">
            <div class="time" id="h-time">--:--</div>
            <div class="date" id="h-date">—</div>
          </div>
          <div id="mode-pill" style="background: rgba(0,0,0,.06); padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px;">FAMILY</div>
        </header>
        <div class="chips" id="chips"></div>
        <main><div class="main-pad" id="main"></div></main>
      </div>
    `;

        this._root.innerHTML = '';
        this._root.append(style, card);

        // Sidebar
        const $ = this.$;
        const $aside = $('<div/>');
        $('#sidebar').append($aside);
        const ICONS = {
            Calendar: 'mdi:calendar',
            Chores: 'mdi:broom',
            Lists: 'mdi:format-list-bulleted',
            Photos: 'mdi:image-multiple',
        };
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

        // Chips
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
                if (this._state.section === 'Calendar') this._rebuildFullCalendar(); // swap sources & refetch
            });
            $chips.append($chip);
        });

        // Main area
        this._renderMain();
    }

    _renderSidebar() {
        const $ = this.$;
        const $buttons = this.$('.sb-btn');
        $buttons.removeClass('active');
        $buttons.each((_, btn) => {
            const title = btn.getAttribute('title');
            if (title === this._state.section) $(btn).addClass('active');
        });
        this._updateSidebarBadge();
    }

    _updateSidebarBadge() {
        const $ = this.$;
        const $badge = $('.sb-badge[data-sec="Calendar"]');
        if (!$badge.length || !this._hass) return;
        const n = Number(this._hass.states?.['input_number.events_today']?.state || 0);
        $badge.css('display', n > 0 ? 'flex' : 'none').text(n);
    }

    _renderMain() {
        const $ = this.$;
        const $mount = $('#main').empty().append('<div class="main-pad" id="pad"></div>');
        const $pad = $('#pad');

        if (this._state.section === 'Calendar') {
            $pad.html(`
        <div id="fc-wrap" style="height:100%;">
          <div id="fc"></div>
        </div>
      `);
            this._initFullCalendar();
            return;
        }

        if (this._state.section === 'Chores') {
            $pad.append(
                `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;" id="chores"></div>`
            );
            this._renderChoresIfVisible();
            return;
        }

        if (this._state.section === 'Lists') {
            $pad.append(
                '<ha-card><div style="padding:12px">Lists: hook your shopping/project aggregates here.</div></ha-card>'
            );
            return;
        }

        if (this._state.section === 'Photos') {
            $pad.append(
                '<ha-card><div style="padding:12px">Photos: render Local Photos album grid here.</div></ha-card>'
            );
            return;
        }
    }

    /* ---------------- Header/Chips ---------------- */

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

    _updateChips() {
        if (!this._hass) return;
        const m = this._config.metrics || {};
        Object.keys(m).forEach((k) => {
            const done = Number(this._hass.states?.[m[k].done]?.state || 0);
            const todo = Number(this._hass.states?.[m[k].todo]?.state || 0);
            const total = Math.max(0, done + todo);
            const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
            this.$(`#chip-v-${k}`).text(`${done}/${total}`);
            this.$(`#chip-bar-${k}`).css('transform', `scaleX(${pct / 100})`);
        });
    }

    /* ---------------- FullCalendar ---------------- */

    _eventSourcesForFocus() {
        const focus = (this._state.personFocus || 'Family').toLowerCase();
        const cfgSources = this._config.calendars || [];
        const filtered = cfgSources.filter(
            (s) => focus === 'family' || s.entity.toLowerCase().includes(focus)
        );
        return filtered.map((src) => ({
            id: src.entity,
            color: src.color,
            events: (start, end, tz, callback) => {
                // FullCalendar v2 passes moment objects; convert to ISO
                const startISO = start.toISOString();
                const endISO = end.toISOString();
                const path = `calendars/${src.entity}?start=${encodeURIComponent(
                    startISO
                )}&end=${encodeURIComponent(endISO)}`;
                this._hass
                    .callApi('GET', path)
                    .then((events) => {
                        const mapped = events.map((ev) => this._mapHaEventToFc(ev)).filter(Boolean);
                        callback(mapped);
                    })
                    .catch((err) => {
                        console.error('[family-board-jq] calendar fetch failed', src.entity, err);
                        callback([]);
                    });
            },
        }));
    }

    _initFullCalendar() {
        const $ = this.$;
        const $fc = $('#fc');
        if (!($fc.length && this._$.fn && this._$.fn.fullCalendar)) {
            $fc.html(
                '<div style="padding:8px;color:#b00020">FullCalendar not loaded. Check PATHS.fcJsUrl/fcCssUrl.</div>'
            );
            return;
        }
        // Destroy any previous instance to avoid double-init in shadow root
        try {
            $fc.fullCalendar('destroy');
        } catch (_) {}

        const fcCfg = this._config.fc || {};
        const tz = this._config.timezone || 'local';

        $fc.fullCalendar({
            header: fcCfg.headerToolbar || {
                left: 'prev,next today',
                center: 'title',
                right: 'month,agendaWeek,agendaDay',
            },
            defaultView: fcCfg.initialView || 'agendaWeek',
            timezone: tz,
            allDaySlot: fcCfg.allDaySlot !== false,
            minTime: fcCfg.minTime || '06:00:00',
            maxTime: fcCfg.maxTime || '22:00:00',
            slotDuration: fcCfg.slotDuration || '01:00:00',
            hiddenDays: Array.isArray(fcCfg.hiddenDays) ? fcCfg.hiddenDays : [],
            timeFormat: fcCfg.timeFormat || 'HH:mm',
            titleFormat: fcCfg.titleFormat || { month: 'MMMM', week: 'MMMM Do', day: 'MMMM Do' },
            // Behavior
            height: 'auto',
            handleWindowResize: true,
            editable: false,
            selectable: false,
            lazyFetching: true,
            eventLimit: true,
            weekNumbers: false,

            // Data
            eventSources: this._eventSourcesForFocus(),

            // When view changes (prev/next/today/change view), FC will refetch automatically.
            viewRender: () => {},
        });

        this._fcReady = true;
    }

    _rebuildFullCalendar() {
        const $ = this.$;
        const $fc = $('#fc');
        if (!($fc.length && this._fcReady)) {
            this._initFullCalendar();
            return;
        }
        // Replace event sources (since person focus changed)
        try {
            const sources = $fc.fullCalendar('getEventSources') || [];
            sources.forEach((src) => src.remove());
            this._eventSourcesForFocus().forEach((src) => $fc.fullCalendar('addEventSource', src));
            this._refetchFullCalendar();
        } catch (e) {
            console.warn('[family-board-jq] rebuild failed, reinitializing', e);
            this._initFullCalendar();
        }
    }

    _refetchFullCalendar() {
        const $ = this.$;
        try {
            $('#fc').fullCalendar('refetchEvents');
        } catch (_) {}
    }

    _mapHaEventToFc(ev) {
        // ev = { start: {dateTime}|{date}, end: {dateTime}|{date}, summary, location, description, all_day? }
        const s = ev?.start || {},
            e = ev?.end || {};
        const hasSDT = typeof s.dateTime === 'string',
            hasEDT = typeof e.dateTime === 'string';
        const hasSD = typeof s.date === 'string',
            hasED = typeof e.date === 'string';
        if (!hasSDT && !hasSD) return null;

        const isAllDay = !!ev.all_day || (hasSD && (hasED || !hasEDT));

        // Build start/end strings acceptable by FC v2:
        let startStr = hasSDT ? s.dateTime : s.date; // 'YYYY-MM-DDTHH:mm:ssZ' or 'YYYY-MM-DD'
        let endStr = hasEDT ? e.dateTime : hasED ? e.date : null;

        // All-day with no end: make it single-day exclusive-end
        if (isAllDay && !endStr && hasSD) {
            const d = new Date(`${s.date}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            endStr = d.toISOString().slice(0, 10); // keep 'YYYY-MM-DD'
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
        };
    }

    /* ---------------- Chores ---------------- */

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
                    ? items.map((it) => `<div>• ${it.summary}</div>`).join('')
                    : `<div style="color:#64748B">Nothing pending</div>`
            }
          </div>
        </ha-card>`;
            })
            .join('');
        $root.html(html);
    }
}

customElements.define('family-board-jq', FamilyBoardJQ);
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'family-board-jq',
    name: 'Family Board (jQuery + FullCalendar)',
    description: 'All-in-one family dashboard; Calendar uses FullCalendar v2.',
});
