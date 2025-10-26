// Family Board — all-in-one Lovelace card with Calendar diagnostics.
// Anthony-ready: clear logs, visible errors, robust event mapping, quick range selector.

class FamilyBoard extends HTMLElement {
  /* ---------- Default config ---------- */
  static getStubConfig() {
    return {
      title: 'Panogu Family',
      timezone: 'Europe/London',
      calendars: [
        // Make sure these match your real entities. You can override in dashboard YAML.
        { entity: 'calendar.family',  color: 'var(--family-color-family, #36B37E)' },
        { entity: 'calendar.anthony', color: 'var(--family-color-anthony, #7E57C2)' },
        { entity: 'calendar.joy',     color: 'var(--family-color-joy, #F4B400)' },
        { entity: 'calendar.lizzie',  color: 'var(--family-color-lizzie, #EC407A)' },
        { entity: 'calendar.toby',    color: 'var(--family-color-toby, #42A5F5)' },
        { entity: 'calendar.routine', color: 'var(--family-color-routine, #b2fd7fff)' },
      ],
      sections: ['Calendar','Chores','Lists','Photos'],
      defaultSection: 'Calendar',
      minTime: '06:00:00',
      maxTime: '22:00:00',
      hiddenDays: [0,6],
      slotDuration: '01:00:00',
      // Chip metrics (optional; leave empty to disable)
      metrics: {
        family:  { done: 'input_number.completed_due_today_family',  todo: 'input_number.outstanding_family_today' },
        anthony:{ done: 'input_number.completed_due_today_anthony', todo: 'input_number.outstanding_anthony_today' },
        joy:    { done: 'input_number.completed_due_today_joy',     todo: 'input_number.outstanding_joy_today' },
        lizzie: { done: 'input_number.completed_due_today_lizzie',  todo: 'input_number.outstanding_lizzie_today' },
        toby:   { done: 'input_number.completed_due_today_toby',    todo: 'input_number.outstanding_toby_today' },
      },
      // To-do entities per person
      todos: {
        family: 'todo.family',
        anthony:'todo.anthony',
        joy:'todo.joy',
        lizzie:'todo.lizzie',
        toby:'todo.toby'
      }
    };
  }

  /* ---------- Lifecycle ---------- */
  setConfig(cfg) {
    this._config = { ...FamilyBoard.getStubConfig(), ...cfg };
    this._state = {
      section: this._config.defaultSection || 'Calendar',
      personFocus: 'Family',
      rangeDays: 7,   // default fetch horizon
      lastErrors: [], // visible diagnostics
    };
    this._renderOnce();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateHeader();
    this._updateChips();
    this._updateSidebarBadges();
    if (this._state.section === 'Calendar') this._loadCalendarRange();
    if (this._state.section === 'Chores') this._renderChoresIfVisible();
  }

  getCardSize() { return 6; }

  /* ---------- One-time DOM ---------- */
  _renderOnce() {
    if (this._root) return;
    this._root = this.attachShadow({ mode: 'open' });
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

      .row { display:flex; align-items:center; gap:8px; }
      .pill { background: rgba(0,0,0,.06); padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px; }

      .range-select { margin-left:auto; display:flex; gap:6px; }
      .range-select button { padding:4px 8px; border-radius:8px; border:1px solid var(--divider-color); background:#fff; cursor:pointer; }
      .range-select button.active { background:var(--primary-color,#B9FBC0); color:#0F172A; border-color:transparent; }

      .diag { margin:10px 0; padding:8px; background:#fff; border:1px solid var(--divider-color); border-radius:8px; }
      .diag h4 { margin:0 0 6px 0; font-size:13px; }
      .diag .list { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size:12px; }
      .err { color: #b00020; font-weight:700; }

      .event-row { display:grid; grid-template-columns: 90px 1fr; gap:8px; align-items:center; }
      .event-time { text-align:right; color:var(--secondary-text-color,#475569); font-weight:700; }
      .dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
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
          <div id="mode-pill" class="pill">FAMILY</div>
        </header>
        <div class="chips" id="chips"></div>
        <main><div class="main-pad" id="main"></div></main>
      </div>
    `;

    this._root.append(style, card);
    this._buildSidebar();
    this._buildChips();
    this._renderMain(); // initial
  }

  /* ---------- Header ---------- */
  _updateHeader() {
    if (!this._hass) return;
    const timeEl = this._root.getElementById('h-time');
    const dateEl = this._root.getElementById('h-date');
    const now = new Date();
    const lang = this._hass?.locale?.language || 'en-GB';
    timeEl.textContent = now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
    dateEl.textContent = now.toLocaleDateString(lang, { weekday:'long', day:'numeric', month:'long' });
  }

  /* ---------- Sidebar ---------- */
  _buildSidebar() {
    const sections = this._config.sections;
    const aside = this._root.getElementById('sidebar');
    aside.innerHTML = '';
    const ICONS = { Calendar:'mdi:calendar', Chores:'mdi:broom', Lists:'mdi:format-list-bulleted', Photos:'mdi:image-multiple' };
    sections.forEach(sec => {
      const btn = document.createElement('button');
      btn.className = 'sb-btn';
      btn.innerHTML = `<ha-icon icon="${ICONS[sec] || 'mdi:circle'}"></ha-icon><div class="sb-badge" data-sec="${sec}" style="display:none">0</div>`;
      if (this._state.section === sec) btn.classList.add('active');
      btn.title = sec;
      btn.addEventListener('click', () => { this._state.section = sec; this._renderMain(); this._buildSidebar(); });
      aside.appendChild(btn);
    });
    this._updateSidebarBadges();
  }

  _updateSidebarBadges() {
    const badge = this._root.querySelector('.sb-badge[data-sec="Calendar"]');
    if (!badge || !this._hass) return;
    const val = Number(this._hass.states?.['input_number.events_today']?.state || 0);
    badge.style.display = val > 0 ? 'flex' : 'none';
    badge.textContent = val;
  }

  /* ---------- Chips ---------- */
  _buildChips() {
    const chips = this._root.getElementById('chips');
    chips.innerHTML = '';
    const persons = [
      { key:'family',  name:'Family',  icon:'mdi:account-group',     color:'var(--family-color-family, #36B37E)'},
      { key:'anthony', name:'Anthony', icon:'mdi:laptop',            color:'var(--family-color-anthony, #7E57C2)'},
      { key:'joy',     name:'Joy',     icon:'mdi:book-open-variant', color:'var(--family-color-joy, #F4B400)'},
      { key:'lizzie',  name:'Lizzie',  icon:'mdi:teddy-bear',        color:'var(--family-color-lizzie, #EC407A)'},
      { key:'toby',    name:'Toby',    icon:'mdi:soccer',            color:'var(--family-color-toby, #42A5F5)'},
    ];
    persons.forEach(p => {
      const el = document.createElement('div');
      el.className = 'chip';
      el.style.background = p.color;
      el.innerHTML = `
        <div class="i"><ha-icon icon="${p.icon}"></ha-icon></div>
        <div class="n">${p.name}</div>
        <div class="v" id="chip-v-${p.key}">0/0</div>
        <div class="bar"><div id="chip-bar-${p.key}" style="transform:scaleX(0)"></div></div>
      `;
      el.addEventListener('click', () => {
        this._state.personFocus = p.name;
        const mode = this._root.getElementById('mode-pill');
        if (mode) mode.textContent = p.name.toUpperCase();
        if (this._state.section === 'Calendar') this._loadCalendarRange(/*force*/true);
      });
      chips.appendChild(el);
    });
    this._updateChips();
  }

  _updateChips() {
    if (!this._hass) return;
    const m = this._config.metrics || {};
    Object.keys(m).forEach(k => {
      const done = Number(this._hass.states?.[m[k].done]?.state || 0);
      const todo = Number(this._hass.states?.[m[k].todo]?.state || 0);
      const total = Math.max(0, done + todo);
      const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
      const v = this._root.getElementById(`chip-v-${k}`);
      const bar = this._root.getElementById(`chip-bar-${k}`);
      if (v) v.textContent = `${done}/${total}`;
      if (bar) bar.style.transform = `scaleX(${pct/100})`;
    });
  }

  /* ---------- Main ---------- */
  _renderMain() {
    const mount = this._root.getElementById('main');
    mount.innerHTML = '';

    if (this._state.section === 'Calendar') {
      const wrapper = document.createElement('div');
      // header row with range buttons
      wrapper.innerHTML = `
        <div class="row" style="margin-bottom:8px;">
          <ha-icon icon="mdi:calendar-range"></ha-icon>
          <strong>${this._state.personFocus} · Upcoming</strong>
          <div class="range-select">
            <button data-d="1">Today</button>
            <button data-d="7" class="active">7d</button>
            <button data-d="14">14d</button>
            <button data-d="30">30d</button>
          </div>
        </div>
        <div class="diag">
          <h4>Calendar sources</h4>
          <div class="list" id="diag-sources"></div>
          <div class="list err" id="diag-errors" style="display:none"></div>
        </div>
        <div id="cal-list" style="display:grid; gap:6px;"></div>
      `;
      mount.appendChild(wrapper);

      // bind range buttons
      wrapper.querySelectorAll('.range-select button').forEach(btn => {
        btn.addEventListener('click', () => {
          wrapper.querySelectorAll('.range-select button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._state.rangeDays = Number(btn.dataset.d);
          this._loadCalendarRange(/*force*/true);
        });
      });

      // initial load
      this._loadCalendarRange(/*force*/true);
      return;
    }

    if (this._state.section === 'Chores') {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;" id="chores"></div>`;
      mount.appendChild(wrap);
      this._renderChoresIfVisible();
      return;
    }

    if (this._state.section === 'Lists') {
      mount.innerHTML = `<ha-card><div style="padding:12px">Lists: wire your shopping/project aggregates here.</div></ha-card>`;
      return;
    }

    if (this._state.section === 'Photos') {
      mount.innerHTML = `<ha-card><div style="padding:12px">Photos: render Local Photos album grid here.</div></ha-card>`;
      return;
    }
  }

  /* ---------- Calendar loading + diagnostics ---------- */
  async _loadCalendarRange(force=false) {
    if (!this._hass || this._state.section !== 'Calendar') return;
    const listEl = this._root.getElementById('cal-list');
    const diagSrc = this._root.getElementById('diag-sources');
    const diagErr = this._root.getElementById('diag-errors');
    if (!listEl || !diagSrc) return;

    // Show what we will query and whether entity exists in hass.states
    const focus = (this._state.personFocus || 'Family').toLowerCase();
    const sources = (this._config.calendars || []).filter(s =>
      focus === 'family' || s.entity.toLowerCase().includes(focus)
    );

    const lines = sources.map(s => {
      const exists = !!this._hass.states?.[s.entity];
      return `${s.entity} ${exists ? '✓' : '✗ (not in hass.states)'}`;
    });
    diagSrc.textContent = lines.length ? lines.join('\n') : '(no calendar entities selected)';

    // Range
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + (this._state.rangeDays || 7));
    const startISO = start.toISOString(), endISO = end.toISOString();

    // Fetch
    const all = [];
    const errors = [];
    for (const src of sources) {
      const path = `calendars/${src.entity}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;
      try {
        const events = await this._hass.callApi('GET', path);
        const mapped = events.map(ev => this._mapHaEvent(ev)).filter(Boolean).map(e => ({...e, color: src.color}));
        all.push(...mapped);
      } catch (e) {
        errors.push(`GET /api/${path} → ${e?.code || e?.status || 'error'}`);
      }
    }

    // Show any errors
    if (errors.length) {
      diagErr.style.display = 'block';
      diagErr.textContent = errors.join('\n');
    } else {
      diagErr.style.display = 'none';
      diagErr.textContent = '';
    }

    // Sort + render
    all.sort((a,b) => (a.startTs||0) - (b.startTs||0));
    if (!all.length) {
      listEl.innerHTML = `<div class="diag"><strong>No events found</strong> for ${this._state.personFocus} in next ${this._state.rangeDays} days.</div>`;
      return;
    }
    listEl.innerHTML = all.map(e => `
      <div class="event-row">
        <div class="event-time">${e.when}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="dot" style="background:${e.color};"></span>
          <div><strong>${e.title}</strong>${e.where ? ` · <span style="color:#64748B">${e.where}</span>` : ''}</div>
        </div>
      </div>
    `).join('');
  }

  _mapHaEvent(ev) {
    const s = ev?.start || {}, e = ev?.end || {};
    const hasSDT = typeof s.dateTime === 'string', hasEDT = typeof e.dateTime === 'string';
    const hasSD = typeof s.date === 'string', hasED = typeof e.date === 'string';
    if (!hasSDT && !hasSD) return null;
    const allDay = !!ev.all_day || (hasSD && (hasED || !hasEDT));
    let startIso = hasSDT ? s.dateTime : s.date;
    let endIso   = hasEDT ? e.dateTime : (hasED ? e.date : null);
    if (allDay && !endIso && hasSD) {
      const d = new Date(`${s.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+1);
      endIso = d.toISOString().slice(0,10);
    }
    const title = ev.summary || ev.title || 'Busy';
    const when  = allDay
      ? 'All day'
      : `${new Date(startIso).toTimeString().slice(0,5)}–${endIso ? new Date(endIso).toTimeString().slice(0,5) : ''}`;
    const startTs = new Date(hasSDT ? s.dateTime : `${s.date}T00:00:00Z`).getTime();
    return { id: ev.uid || `${startIso}-${title}`, title, startIso, endIso, allDay, where: ev.location, when, startTs };
  }

  /* ---------- Chores (basic) ---------- */
  _renderChoresIfVisible() {
    if (this._state.section !== 'Chores' || !this._hass) return;
    const root = this._root.getElementById('chores');
    if (!root) return;
    const lists = this._config.todos || {};
    const keys = ['anthony','joy','family','lizzie','toby'].filter(k => lists[k]);
    root.innerHTML = keys.map(k => {
      const ent = lists[k];
      const st  = this._hass.states?.[ent];
      const items = (st?.attributes?.items || []).filter(it => it.status !== 'completed');
      return `
        <ha-card>
          <div style="padding:10px;font-weight:800">${k[0].toUpperCase()+k.slice(1)}</div>
          <div style="padding:0 10px 10px 10px;display:grid;gap:6px;">
            ${items.length ? items.map(it => `<div>• ${it.summary}</div>`).join('') : `<div style="color:#64748B">Nothing pending</div>`}
          </div>
        </ha-card>`;
    }).join('');
  }
}

customElements.define('family-board', FamilyBoard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'family-board',
  name: 'Family Board',
  description: 'All-in-one family dashboard with calendar diagnostics.'
});
