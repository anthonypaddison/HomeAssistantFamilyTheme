// Family Board - single custom card rendering header + sidebar + chips + main.
// Vanilla Web Component, no external libs required.
// Reads HA state via this.hass and calls services via this.hass.callService/this.hass.callApi.

class FamilyBoard extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Panogu Family',
      timezone: 'Europe/London',
      // Calendar sources: HA calendar entities and their colors (use your theme vars)
      calendars: [
        { entity: 'calendar.family',  color: 'var(--family-color-family, #36B37E)' },
        { entity: 'calendar.anthony', color: 'var(--family-color-anthony, #7E57C2)' },
        { entity: 'calendar.joy',     color: 'var(--family-color-joy, #F4B400)' },
        { entity: 'calendar.lizzie',  color: 'var(--family-color-lizzie, #EC407A)' },
        { entity: 'calendar.toby',    color: 'var(--family-color-toby, #42A5F5)' },
        { entity: 'calendar.routine', color: 'var(--family-color-routine, #b2fd7fff)' },
      ],
      // Sections available on the board
      sections: ['Calendar','Chores','Lists','Photos'],
      defaultSection: 'Calendar',
      minTime: '06:00:00',
      maxTime: '22:00:00',
      hiddenDays: [0,6],            // Sun/Sat hidden by default (work-week view)
      slotDuration: '01:00:00',
      // Optional: chip math entities (if you already compute these in helpers)
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

  setConfig(cfg) {
    this._config = { ...FamilyBoard.getStubConfig(), ...cfg };
    this._renderOnce();
  }

  set hass(hass) {
    this._hass = hass;
    // Update reactive bits cheaply
    this._updateHeader();
    this._updateChips();
    this._maybeRefreshCalendar();
    this._renderChoresIfVisible();
  }

  getCardSize() { return 6; }

  // -------------- Rendering --------------

  _renderOnce() {
    if (this._root) return;
    this._state = {
      section: this._config.defaultSection,
      personFocus: 'Family'
    };
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

      /* FAB */
      .fab {
        position: fixed; right: 24px; bottom: 24px; width: 56px; height:56px; border-radius:28px;
        background: var(--fab-color-default, var(--primary-color, #B9FBC0)); color:#0F172A;
        display:grid; place-items:center; box-shadow: 0 8px 24px rgba(0,0,0,.22); cursor:pointer; z-index: 1000;
      }
    `;

    const card = document.createElement('ha-card');
    card.innerHTML = `
      <div class="layout">
        <aside id="sidebar"></aside>
        <header>
          <div style="font-weight:800">Panogu Family</div>
          <div style="text-align:center">
            <div class="time" id="h-time">--:--</div>
            <div class="date" id="h-date">—</div>
          </div>
          <div id="mode-pill" style="background: rgba(0,0,0,.06); padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px;">FAMILY</div>
        </header>
        <div class="chips" id="chips"></div>
        <main><div class="main-pad" id="main"></div></main>
      </div>
      <button class="fab" id="fab" title="Add"><ha-icon icon="mdi:plus"></ha-icon></button>
    `;

    this._root.append(style, card);
    this._buildSidebar();
    this._buildChips();
    this._bindFab();
    this._renderMain();
  }

  // -------------- Header / Time --------------

  _updateHeader() {
    if (!this._hass) return;
    const timeEl = this._root.getElementById('h-time');
    const dateEl = this._root.getElementById('h-date');
    const now = new Date();
    const opts = this._hass?.locale || { language: 'en-GB' };
    const h = now.toLocaleTimeString(opts.language || 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const d = now.toLocaleDateString(opts.language || 'en-GB', { weekday:'long', day:'numeric', month:'long' });
    timeEl.textContent = h;
    dateEl.textContent = d;
  }

  // -------------- Sidebar --------------

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
    // Example badge for "Calendar events today"
    this._updateSidebarBadges();
  }

  _updateSidebarBadges() {
    // If you already populate input_number.events_today, show it; else hide
    const badge = this._root.querySelector('.sb-badge[data-sec="Calendar"]');
    if (!badge || !this._hass) return;
    const val = Number(this._hass.states?.['input_number.events_today']?.state || 0);
    badge.style.display = val > 0 ? 'flex' : 'none';
    badge.textContent = val;
  }

  // -------------- Chips --------------

  _buildChips() {
    const chips = this._root.getElementById('chips');
    chips.innerHTML = '';
    const persons = [
      { key:'family',  name:'Family',  icon:'mdi:account-group',  color:'var(--family-color-family, #36B37E)'},
      { key:'anthony', name:'Anthony', icon:'mdi:laptop',         color:'var(--family-color-anthony, #7E57C2)'},
      { key:'joy',     name:'Joy',     icon:'mdi:book-open-variant', color:'var(--family-color-joy, #F4B400)'},
      { key:'lizzie',  name:'Lizzie',  icon:'mdi:teddy-bear',     color:'var(--family-color-lizzie, #EC407A)'},
      { key:'toby',    name:'Toby',    icon:'mdi:soccer',         color:'var(--family-color-toby, #42A5F5)'},
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
      el.addEventListener('click', () => { this._state.personFocus = p.name; this._renderMain(); });
      chips.appendChild(el);
    });
    this._updateChips();
  }

  _updateChips() {
    if (!this._hass) return;
    const m = this._config.metrics || {};
    const keys = Object.keys(m);
    keys.forEach(k => {
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

  // -------------- Main sections --------------

  _renderMain() {
    const mount = this._root.getElementById('main');
    mount.innerHTML = '';
    if (this._state.section === 'Calendar') {
      this._renderCalendar(mount);
    } else if (this._state.section === 'Chores') {
      this._renderChores(mount);
    } else if (this._state.section === 'Lists') {
      this._renderLists(mount);
    } else if (this._state.section === 'Photos') {
      this._renderPhotos(mount);
    }
  }

  // ---- Calendar (simple proof, fetch via HA REST, render minimal list; swap later for your FullCalendar UI) ----
  async _renderCalendar(mount) {
    const el = document.createElement('div');
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <ha-icon icon="mdi:calendar-range"></ha-icon>
        <strong>${this._state.personFocus} · This Week</strong>
      </div>
      <div id="cal-list" style="display:grid; gap:6px;"></div>
    `;
    mount.appendChild(el);
    await this._loadCalendarRange(el.querySelector('#cal-list'));
  }

  async _loadCalendarRange(listEl) {
    if (!this._hass) return;
    const tz = this._config.timezone || 'Europe/London';
    const start = new Date();
    start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const startISO = start.toISOString(); const endISO = end.toISOString();

    // Filter which calendars to fetch by person focus (Family shows all)
    const focus = (this._state.personFocus || 'Family').toLowerCase();
    const sources = this._config.calendars.filter(s => focus === 'family' || s.entity.toLowerCase().includes(focus));

    // Fetch events per source
    const all = [];
    for (const src of sources) {
      try {
        const path = `calendars/${src.entity}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;
        const events = await this._hass.callApi('GET', path);
        // Map safely (supports all-day and timed)
        const mapped = events.map(ev => this._mapHaEvent(ev)).filter(Boolean).map(e => ({...e, color: src.color}));
        all.push(...mapped);
      } catch (e) {
        console.error('Calendar fetch failed', src.entity, e);
      }
    }
    // Sort by start
    all.sort((a,b) => (a.startTs||0) - (b.startTs||0));
    // Render simple rows
    listEl.innerHTML = all.map(e => `
      <div style="display:grid;grid-template-columns: 90px 1fr; gap:8px; align-items:center;">
        <div style="text-align:right; color:var(--secondary-text-color,#475569); font-weight:700;">${e.when}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:10px;height:10px;border-radius:999px;background:${e.color};display:inline-block"></span>
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
      // exclusive end for all-day single day
      const d = new Date(`${s.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+1);
      endIso = d.toISOString().slice(0,10);
    }
    const title = ev.summary || ev.title || 'Busy';
    const when  = allDay
      ? 'All day'
      : `${new Date(startIso).toTimeString().slice(0,5)}-${endIso ? new Date(endIso).toTimeString().slice(0,5) : ''}`;
    const startTs = new Date(hasSDT ? s.dateTime : `${s.date}T00:00:00Z`).getTime();
    return { id: ev.uid || `${startIso}-${title}`, title, startIso, endIso, allDay, where: ev.location, when, startTs };
  }

  // ---- Chores (simple list render from HA native todo.* entities) ----
  _renderChores(mount) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;" id="chores"></div>`;
    mount.appendChild(wrap);
    this._renderChoresIfVisible();
  }
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

  // ---- Lists placeholder ----
  _renderLists(mount) {
    mount.innerHTML = `<ha-card><div style="padding:12px">Lists: hook up your Todoist/Shopping aggregates here.</div></ha-card>`;
  }

  // ---- Photos placeholder ----
  _renderPhotos(mount) {
    mount.innerHTML = `<ha-card><div style="padding:12px">Photos: show Local Photos album or a grid here.</div></ha-card>`;
  }

  // -------------- FAB (contextual) --------------

  _bindFab() {
    const fab = this._root.getElementById('fab');
    fab.addEventListener('click', () => this._openAddDialog());
  }

  _openAddDialog() {
    // Minimal built-in dialog using ha-dialog
    const host = this._root;
    let dlg = host.getElementById('fb-dialog');
    if (!dlg) {
      dlg = document.createElement('ha-dialog');
      dlg.setAttribute('id', 'fb-dialog');
      dlg.innerHTML = `
        <style>
          ha-dialog { --mdc-dialog-min-width: 320px; }
          .fld { display:grid; gap:6px; margin-bottom:12px; }
          input, select { padding:8px; border-radius:8px; border:1px solid var(--divider-color); }
          .row { display:flex; gap:8px; justify-content:flex-end; }
          .row button { padding:6px 12px; border-radius:8px; border:0; font-weight:700; }
          .row .ok { background: var(--primary-color); color:#0F172A; }
        </style>
        <h2>Add ${this._state.section === 'Chores' ? 'Chore' : 'Event'}</h2>
        <div class="fld"><label>Title</label><input id="f-title" placeholder="Title"></div>
        <div id="cal-fields">
          <div class="fld"><label>Start</label><input id="f-start" type="datetime-local"></div>
          <div class="fld"><label>End</label><input id="f-end" type="datetime-local"></div>
          <div class="fld">
            <label>Calendar</label>
            <select id="f-cal">
              ${(this._config.calendars||[]).map(c=>`<option value="${c.entity}">${c.entity.split('.').pop()}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="todo-fields" style="display:none">
          <div class="fld"><label>List</label>
            <select id="f-list">
              ${Object.entries(this._config.todos||{}).map(([k,v])=>`<option value="${v}">${k}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row">
          <button class="ok" id="ok">Create</button>
          <button id="cancel">Cancel</button>
        </div>
      `;
      host.appendChild(dlg);
      dlg.querySelector('#cancel').addEventListener('click', ()=> dlg.close());
      dlg.querySelector('#ok').addEventListener('click', ()=> this._submitDialog(dlg));
    }
    const isChores = this._state.section === 'Chores';
    dlg.querySelector('#cal-fields').style.display = isChores ? 'none' : 'block';
    dlg.querySelector('#todo-fields').style.display = isChores ? 'block' : 'none';
    dlg.open();
  }

  async _submitDialog(dlg) {
    const title = dlg.querySelector('#f-title').value?.trim();
    if (!title || !this._hass) return;
    if (this._state.section === 'Chores') {
      const ent = dlg.querySelector('#f-list').value;
      await this._hass.callService('todo', 'add_item', { entity_id: ent, item: title });
    } else {
      const cal  = dlg.querySelector('#f-cal').value;
      const sRaw = dlg.querySelector('#f-start').value;
      const eRaw = dlg.querySelector('#f-end').value;
      const start = sRaw ? new Date(sRaw) : new Date();
      const end   = eRaw ? new Date(eRaw) : new Date(Date.now()+60*60*1000);
      await this._hass.callService('calendar', 'create_event', {
        entity_id: cal,
        summary: title,
        start_date_time: start.toISOString(),
        end_date_time: end.toISOString(),
      });
    }
    dlg.close();
  }

  // -------------- Calendar refresh heuristic --------------

  _maybeRefreshCalendar() {
    // In this simple list-based calendar render, we reload whenever Calendar section is visible.
    // In your FullCalendar port, call refetch on entity changes or on an interval.
    if (this._state.section !== 'Calendar') return;
    // No-op here; _renderCalendar loads per render.
  }
}

customElements.define('family-board', FamilyBoard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'family-board',
  name: 'Family Board',
  description: 'All-in-one family dashboard (header/sidebar/chips/main).'
});
