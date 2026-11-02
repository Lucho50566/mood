/* MOOD · Training Club — PWA de turnos (vanilla JS, sin dependencias) */
(() => {
  'use strict';

  /* ============================================================
     Utilidades
  ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + Math.random().toString(36).slice(2, 7).toUpperCase();
  const money = (n) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Number(n) || 0);
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const todayStr = () => dstr(new Date());
  const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
  const WEEK = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const WEEK_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const isToday = (s) => s === todayStr();
  const isTomorrow = (s) => s === addDays(todayStr(), 1);
  const dayLabel = (s) => (isToday(s) ? 'HOY' : isTomorrow(s) ? 'MAÑ' : WEEK[parseD(s).getDay()]);
  const longDate = (s) => `${WEEK_LONG[parseD(s).getDay()]} ${parseD(s).getDate()} de ${MONTH_LONG[parseD(s).getMonth()]}`;
  const shortDate = (s) => `${WEEK_LONG[parseD(s).getDay()]} ${parseD(s).getDate()} ${MONTH[parseD(s).getMonth()]}`;
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const toMin = (t) => minutes(t);
  const started = (date, time) => (date < todayStr()) || (date === todayStr() && toMin(time) <= nowMin());
  const startMs = (date, time) => { const d = parseD(date); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };

  function countdown(date, time) {
    const diff = startMs(date, time) - Date.now();
    if (diff <= 0) return 'en curso';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `en ${mins} min`;
    const hh = Math.floor(mins / 60), mm = mins % 60;
    if (hh < 24) return mm ? `en ${hh} h ${mm} min` : `en ${hh} h`;
    const days = Math.floor(hh / 24);
    return days === 1 ? 'mañana' : `en ${days} días`;
  }

  function dayStrip(date, opts) {
    const days = [];
    for (let i = 0; i < 10; i++) {
      const d = addDays(todayStr(), i);
      const wd = parseD(d).getDay();
      const has = state.schedule.some((s) => s.weekday === wd);
      days.push(`<button class="day ${date === d ? 'on' : ''} ${has ? '' : 'off'}" data-action="${(opts && opts.action) || 'set-date'}" data-date="${d}">
        <span>${dayLabel(d)}</span><b>${parseD(d).getDate()}</b></button>`);
    }
    return `<div class="daystrip">${days.join('')}</div>`;
  }

  /* ============================================================
     Estado + API
  ============================================================ */
  const MEMBER_KEY = 'mood.member.v2';
  const ADMIN_KEY = 'mood.admin.token';
  const PAY_KEY = 'mood.pay.pending';
  let state = { club: {}, plans: [], activities: [], schedule: [], news: [], member: null, bookings: [], routine: { items: [] }, counts: {}, payments: [], mpEnabled: false };
  let adminData = null;
  let installEvt = null;
  const ui = { turnosTab: 'up', day: todayStr(), adminTab: 'agenda', adminDay: todayStr(), bookDate: todayStr(), routineDraft: null };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.data = data; e.status = res.status; throw e; }
    return data;
  }

  async function load() {
    const id = localStorage.getItem(MEMBER_KEY) || '';
    state = await api('/api/state?member=' + encodeURIComponent(id));
    if (state.member) localStorage.setItem(MEMBER_KEY, state.member.id);
    else localStorage.removeItem(MEMBER_KEY);
    ui.routineDraft = state.routine.items.map((x) => ({ ...x }));
  }

  async function refresh() { await load(); render(); }

  /* ============================================================
     Estado derivado
  ============================================================ */
  const me = () => state.member;
  const plan = () => state.plans.find((p) => p.id === (state.member && state.member.planId)) || null;
  const unlimited = () => { const p = plan(); return !!p && p.credits == null; };
  const creditsLeft = () => {
    const p = plan(); if (!p) return 0;
    if (p.credits == null) return Infinity;
    return state.member && state.member.creditsLeft != null ? state.member.creditsLeft : p.credits;
  };
  const activityOf = (id) => state.activities.find((a) => a.id === id) || { id, name: 'Clase', color: '#9B9BA2', durationMin: 60, credits: 1 };
  const countAt = (date, time, activityId) => state.counts[`${date}|${time}|${activityId}`] || 0;

  function buildSession(date, slot) {
    const act = activityOf(slot.activityId);
    const mine = state.bookings.find((b) => b.status === 'active' && b.date === date && b.time === slot.time && b.activityId === slot.activityId) || null;
    const booked = countAt(date, slot.time, slot.activityId);
    const start = toMin(slot.time);
    return {
      key: `${date}|${slot.time}|${slot.activityId}`,
      slotId: slot.id, date, time: slot.time, activityId: slot.activityId, activity: act,
      endTime: toHHMM(start + act.durationMin), capacity: slot.capacity,
      booked: Math.max(booked, mine ? 1 : 0), spots: Math.max(0, slot.capacity - booked),
      mine, full: booked >= slot.capacity && !mine, past: started(date, slot.time),
    };
  }

  function sessionsOn(date, filter) {
    const wd = parseD(date).getDay();
    const list = state.schedule
      .filter((s) => s.weekday === wd)
      .map((s) => buildSession(date, s))
      .sort((a, b) => a.time.localeCompare(b.time));
    return filter && filter !== 'all' ? list.filter((s) => s.activityId === filter) : list;
  }

  const myBookings = (mode) => state.bookings
    .filter((b) => (mode === 'past'
      ? b.status !== 'active' || started(b.date, b.time)
      : b.status === 'active' && !started(b.date, b.time)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const nextBooking = () => state.bookings
    .filter((b) => b.status === 'active' && !started(b.date, b.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || null;

  const canCancel = (b) => Date.now() <= startMs(b.date, b.time) - Number(state.club.cancelMinutes || 0) * 60000;

  function canAfford(act) {
    const cost = Number(act.credits == null ? 1 : act.credits);
    return unlimited() || creditsLeft() >= cost;
  }

  /* ============================================================
     Acciones
  ============================================================ */
  async function book(session) {
    if (!me()) return toast('Completá tus datos primero', 'err');
    if (session.mine) return toast('Ya tenés ese turno', 'err');
    if (session.past) return toast('Ese turno ya pasó', 'err');
    if (session.full) return toast('No quedan lugares en ese turno', 'err');
    try {
      await api('/api/book', { method: 'POST', body: JSON.stringify({ memberId: me().id, date: session.date, time: session.time, activityId: session.activityId }) });
      closeSheet();
      await refresh();
      toast('¡Turno reservado!');
    } catch (e) {
      if (e.data && e.data.noCredits) { closeSheet(); openSheet(noCreditsSheet()); return; }
      toast(e.message, 'err');
    }
  }

  async function cancelBooking(id) {
    try {
      await api('/api/cancel', { method: 'POST', body: JSON.stringify({ memberId: me().id, bookingId: id }) });
      closeSheet();
      await refresh();
      toast('Turno cancelado');
    } catch (e) { toast(e.message, 'err'); }
  }

  async function saveRoutine(items) {
    try {
      const r = await api('/api/routine', { method: 'POST', body: JSON.stringify({ memberId: me().id, items }) });
      await refresh();
      const bits = [];
      if (r.created) bits.push(`${r.created} turnos reservados`);
      if (r.skipped) bits.push(`${r.skipped} no se pudieron reservar`);
      toast(bits.length ? bits.join(' · ') : 'Rutina actualizada');
      return r;
    } catch (e) { toast(e.message, 'err'); return null; }
  }

  async function startPayment(planId) {
    try {
      const r = await api('/api/pay/start', { method: 'POST', body: JSON.stringify({ memberId: me().id, planId }) });
      localStorage.setItem(PAY_KEY, r.paymentId);
      if (r.url) { window.location.href = r.url; return; }
      closeSheet();
      openSheet(manualPaymentSheet(r.paymentId));
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ============================================================
     Iconos
  ============================================================ */
  const S = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    home: S('<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.6V21h13V9.6"/>'),
    cal: S('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8.5 14.5h2M13.5 14.5h2M8.5 17.5h2"/>'),
    ticket: S('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v1a2.5 2.5 0 0 0 0 5v1A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-1a2.5 2.5 0 0 0 0-5z"/><path d="M9 9v6"/>'),
    user: S('<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c.8-3.3 3.7-5.2 7.5-5.2s6.7 1.9 7.5 5.2"/>'),
    right: S('<path d="m9 5 7 7-7 7"/>'),
    left: S('<path d="m15 5-7 7 7 7"/>'),
    clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
    users: S('<circle cx="9" cy="8" r="3"/><path d="M3 19c.7-2.8 3-4.4 6-4.4s5.3 1.6 6 4.4"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.9.5 3.1 1.9 3.5 3.9"/>'),
    check: S('<path d="m5 12.5 4.5 4.5L19 7"/>'),
    x: S('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    minus: S('<path d="M5 12h14"/>'),
    trash: S('<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>'),
    lock: S('<rect x="4.5" y="10" width="15" height="10.5" rx="2.6"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>'),
    wa: S('<path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-3.9A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2.5 2.8 5 5.4 5.4l.9-1.5-1.9-1-.8.8c-.7-.4-1.4-1.1-1.8-1.8l.8-.8-1-1.9z"/>'),
    ig: S('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/>'),
    map: S('<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    share: S('<path d="M8 12v7.5h8V12"/><path d="M12 15V3.5M8.5 7 12 3.5 15.5 7"/>'),
    ics: S('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5"/>'),
    gear: S('<circle cx="12" cy="12" r="3.1"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.6l1.9 1.1M17.2 15.3l1.9 1.1M4.9 16.4l1.9-1.1M17.2 8.7l1.9-1.1"/>'),
    flame: S('<path d="M12 3.5c3.2 3 5.5 5.8 5.5 9a5.5 5.5 0 1 1-11 0c0-1.7.7-3.1 1.8-4.4.6 1 1.3 1.6 2.2 1.9-.2-2.4.3-4.4 1.5-6.5z"/>'),
    arrowUp: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    repeat: S('<path d="M4 9a4 4 0 0 1 4-4h9"/><path d="m14.5 2.5 2.5 2.5-2.5 2.5"/><path d="M20 15a4 4 0 0 1-4 4H7"/><path d="m9.5 21.5-2.5-2.5 2.5-2.5"/>'),
    card: S('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>'),
    megaphone: S('<path d="m4 10 12-5v14L4 14z"/><path d="M4 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1"/><path d="M8 14.5V19a1.5 1.5 0 0 0 3 0v-3.2"/><path d="M19 9.5a3 3 0 0 1 0 5"/>'),
    image: S('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/>'),
    edit: S('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 6.5 3 3"/>'),
    copy: S('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>'),
    qr: S('<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2v2h-2zM20.5 14.5v2M18.5 18.5h2M14.5 20.5h2"/>'),
    install: S('<path d="M12 3.5v11M8 11l4 4 4-4"/><path d="M4.5 16v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  };

  /* ============================================================
     UI base
  ============================================================ */
  const app = $('#app');
  const navEl = $('#nav');
  const sheetEl = $('#sheet');
  const toastEl = $('#toast');

  const TABS = [
    { id: 'inicio', label: 'Inicio', icon: 'home', href: '#/inicio' },
    { id: 'reservar', label: 'Reservar', icon: 'cal', href: '#/reservar' },
    { id: 'turnos', label: 'Turnos', icon: 'ticket', href: '#/turnos' },
    { id: 'perfil', label: 'Perfil', icon: 'user', href: '#/perfil' },
  ];

  function renderNav(active) {
    navEl.innerHTML = `<div class="nav-inner">${TABS.map((t) => `
      <a href="${t.href}" class="${t.id === active ? 'on' : ''}">${I[t.icon]}<span>${t.label}</span></a>`).join('')}</div>`;
    navEl.hidden = active === 'bienvenida' || active === 'admin';
  }

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.className = 'toast'; }, 2800);
  }

  function openSheet(html) {
    sheetEl.innerHTML = `<div class="ov" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    sheetEl.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    sheetEl.hidden = true;
    sheetEl.innerHTML = '';
    document.body.style.overflow = '';
  }

  function header() {
    const p = plan();
    return `<header class="top">
      <img class="logo" src="img/logo.jpg" alt="MOOD Training Club">
      <div class="brand">
        <div class="display name">${esc(state.club.name || 'MOOD')}</div>
        <div class="sub">${esc(state.club.sub || 'Training Club')}</div>
      </div>
      <div class="spacer"></div>
      <span class="plan-chip"><i></i>${p ? esc(p.name) : 'SIN ABONO'}</span>
    </header>`;
  }

  const route = () => {
    const h = (location.hash || '#/inicio').replace(/^#\/?/, '');
    const [name, query] = h.split('?');
    return { name: name || 'inicio', q: new URLSearchParams(query || '') };
  };

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  /* ============================================================
     Vistas públicas
  ============================================================ */
  function viewWelcome() {
    return `<div class="view" style="padding-top:26px">
      <div class="center">
        <img src="img/logo.jpg" alt="MOOD" style="width:104px;height:104px;border-radius:50%;margin:0 auto;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 20px 50px rgba(204,34,153,.25)">
        <h1 class="display h1 mt20">BIENVENIDO<br>A <span class="pink">MOOD</span></h1>
        <p class="muted small mt10" style="max-width:280px;margin-left:auto;margin-right:auto">
          Reservá tus clases, armá tu rutina y pagá tu abono desde el celular.
        </p>
      </div>
      <form data-form="welcome" class="card mt26" style="padding:18px">
        <div class="field" style="margin-top:0">
          <label class="label" for="w-name">Nombre y apellido</label>
          <input class="input" id="w-name" name="name" placeholder="Ej: Luciano Correa" autocomplete="name" required>
        </div>
        <div class="field">
          <label class="label" for="w-phone">Teléfono</label>
          <input class="input" id="w-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="Ej: 260 400 0000" required>
        </div>
        <button class="btn btn-primary btn-lg mt20" type="submit">EMPEZAR ${I.right}</button>
        <p class="tiny muted center mt10">Con tu teléfono el club te reconoce en cualquier dispositivo.</p>
      </form>
    </div>`;
  }

  function viewOffline(err) {
    return `<div class="view" style="padding-top:40px">
      <div class="center">
        <div class="success-ico" style="background:rgba(242,193,78,.12);color:#F2C14E;border-color:rgba(242,193,78,.35)">${I.clock}</div>
        <h1 class="display h2">SIN CONEXIÓN</h1>
        <p class="muted small mt6">No pude hablar con el servidor del club.<br>${esc(err || '')}</p>
      </div>
      <button class="btn btn-primary btn-lg mt20" data-action="retry">REINTENTAR</button>
      <p class="tiny muted center mt14">Si estás en el club, pedí que revisen la PC del servidor.</p>
    </div>`;
  }

  function newsCard(n, i) {
    return `<button class="news-card" data-action="open-news" data-id="${n.id}">
      ${n.image ? `<img src="${esc(n.image)}" alt="">` : '<div class="news-noimg"></div>'}
      <div class="news-body">
        <b>${esc(n.title || 'Novedad')}</b>
      </div>
    </button>`;
  }

  function viewHome() {
    const nb = nextBooking();
    const p = plan();
    let list = sessionsOn(todayStr()).filter((s) => !s.past);
    let listLabel = 'HOY EN MOOD';
    if (!list.length) {
      for (let i = 1; i <= 7 && !list.length; i++) {
        const d = addDays(todayStr(), i);
        list = sessionsOn(d);
        if (list.length) listLabel = `${dayLabel(d) === 'MAÑ' ? 'MAÑANA' : WEEK_LONG[parseD(d).getDay()].toUpperCase()} EN MOOD`;
      }
    }
    const mix = [];
    for (const s of list) if (!mix.some((x) => x.activityId === s.activityId)) mix.push(s);
    for (const s of list) { if (mix.length >= 4) break; if (!mix.includes(s)) mix.push(s); }
    const homeList = mix.slice(0, 4).sort((a, b) => a.time.localeCompare(b.time));
    const rt = state.routine.items || [];
    const news = state.news || [];

    const hero = nb ? (() => {
      const act = activityOf(nb.activityId);
      const d = parseD(nb.date);
      return `<div class="card hero">
        <div class="hero-top">
          <div><div class="eyebrow">Tu próximo turno</div>
            <h2 class="display hero-title">${esc(act.name)}</h2></div>
          <span class="badge mine">confirmado</span>
        </div>
        <div class="hero-row">
          <div class="hero-date"><b>${d.getDate()}</b><span>${MONTH[d.getMonth()]}</span></div>
          <div class="hero-info"><b>${nb.time} hs</b><span>${shortDate(nb.date)} · ${act.durationMin} min</span></div>
        </div>
        <div class="count-badge"><i></i>${countdown(nb.date, nb.time)}</div>
        <div class="hero-row" style="margin-top:14px;gap:8px">
          <a class="btn btn-primary flex1" href="#/turnos" style="flex:1">Ver mi turno</a>
          <a class="btn btn-ghost" href="#/reservar">Reservar otro</a>
        </div>
      </div>`;
    })() : (plan() && (unlimited() || creditsLeft() > 0)) ? `<div class="card hero">
        <div class="hero-top"><div><div class="eyebrow">Reservá en segundos</div>
          <h2 class="display hero-title">ENTRENÁ<br>CON <span class="pink">MOOD</span></h2></div></div>
        <p class="muted small mt10" style="max-width:300px">Elegí tu clase, reservá tu lugar y listo. Sin mensajes, sin vueltas.</p>
        <a class="btn btn-primary btn-lg mt14" href="#/reservar">RESERVAR TURNO ${I.right}</a>
      </div>` : `<div class="card hero">
        <div class="hero-top"><div><div class="eyebrow">Tu abono</div>
          <h2 class="display hero-title">${plan() ? 'RENOVÁ TU<br><span class="pink">ABONO</span>' : 'ELEGÍ TU<br><span class="pink">ABONO</span>'}</h2></div></div>
        <p class="muted small mt10" style="max-width:310px">${plan() ? `Te quedan ${creditsLeft()} créditos. Renová tu plan para seguir reservando.` : 'Para reservar necesitás un abono activo. Podés pagarlo acá mismo con Mercado Pago.'}</p>
        <a class="btn btn-primary btn-lg mt14" href="#/abonos">${plan() ? 'RENOVAR ABONO' : 'VER ABONOS'} ${I.right}</a>
      </div>`;

    return `<div class="view">
      ${header()}
      ${hero}

      ${news.length ? `<div class="section-head"><span class="pill-title">NOVEDADES</span></div>
      <div class="news-strip">${news.slice(0, 6).map(newsCard).join('')}</div>` : ''}

      <div class="section-head"><span class="pill-title">${listLabel}</span><a class="link" href="#/reservar">Ver todo</a></div>
      ${list.length ? `<div class="sessions">${homeList.map((s) => sessionRow(s)).join('')}</div>`
        : `<div class="empty"><b>No hay clases cargadas</b>El club todavía no publicó la agenda.</div>`}

      <div class="section-head"><span class="pill-title">TU RUTINA</span><a class="link" href="#/rutina">${rt.length ? 'Editar' : 'Armar'}</a></div>
      ${rt.length ? `<div class="card" style="padding:14px">
        <div class="row" style="justify-content:space-between">
          <div><b style="font-size:14px">${rt.length} clase${rt.length === 1 ? '' : 's'} por semana</b>
          <div class="tiny muted mt4">Se reservan solas, 2 semanas para adelante.</div></div>
          <a class="btn btn-soft btn-sm" href="#/rutina">CAMBIAR</a>
        </div>
        <div class="divider"></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${rt.map((it) => `<span class="badge mine">${WEEK[Number(it.weekday)]} ${it.time} · ${esc(activityOf(it.activityId).name)}</span>`).join('')}</div>
      </div>` : `<button class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px;width:100%;text-align:left;border-color:var(--line)" data-action="go" data-href="#/rutina">
        <span style="color:var(--pink-3)">${I.repeat}</span>
        <span style="flex:1"><b style="font-size:13.5px">Armá tu rutina semanal</b><br><span class="tiny muted">Tus clases quedan reservadas automáticamente.</span></span>${I.right}
      </button>`}

      <div class="section-head"><span class="pill-title">CLASES DEL CLUB</span><a class="link" href="#/reservar">Reservar</a></div>
      <div class="acts">
        ${state.activities.map((a) => `<div class="act">
          <span class="dot" style="background:${a.color}"></span>
          <div><b>${esc(a.name)}</b><small>${a.durationMin} min${a.credits === 0 ? ' · incluida' : ''}</small></div>
        </div>`).join('')}
      </div>

      <div class="section-head"><span class="pill-title">TU ABONO</span><a class="link" href="#/abonos">${p ? 'Ver abonos' : 'Contratar'}</a></div>
      <div class="card">
        ${p ? `<div class="plan-row">
          <div>
            <div class="plan-name">${esc(p.name)}</div>
            <div class="plan-credits">${p.credits == null ? 'Clases ilimitadas' : `${creditsLeft()} de ${p.credits} créditos disponibles`}</div>
          </div>
          ${p.credits == null ? `<div class="credits-big">∞<small>ILIMITADO</small></div>` : `<div class="credits-big">${creditsLeft()}<small>CRÉDITOS</small></div>`}
        </div>
        ${p.credits == null ? '' : `<div class="bar" style="margin-top:14px"><i style="width:${Math.max(0, Math.round((creditsLeft() / p.credits) * 100))}%"></i></div>`}
        <div class="divider"></div>
        <div class="between">
          <span class="small muted">${p.credits == null ? 'Tu abono está activo.' : 'Cada clase descuenta 1 crédito.'}</span>
          <a class="btn btn-ghost btn-sm" href="#/abonos">Pagar / cambiar</a>
        </div>` : `<div class="plan-row">
          <div><div class="plan-name">SIN ABONO</div><div class="plan-credits">Activá un plan para reservar</div></div>
          <div class="credits-big">0<small>CRÉDITOS</small></div>
        </div>
        <a class="btn btn-primary btn-block mt14" href="#/abonos">ELEGIR ABONO</a>`}
      </div>

      <div class="section-head"><span class="pill-title">EL CLUB</span></div>
      <div class="list">
        ${state.club.whatsapp ? `<a class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px" href="https://wa.me/${state.club.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noreferrer">
          <span style="color:#3DDC97">${I.wa}</span><b style="flex:1;font-size:13.5px">WhatsApp del club</b>${I.right}</a>` : ''}
        ${state.club.instagram ? `<a class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px" href="https://instagram.com/${esc(state.club.instagram.replace(/^@/, ''))}" target="_blank" rel="noreferrer">
          <span style="color:#E62BAB">${I.ig}</span><b style="flex:1;font-size:13.5px">@${esc(state.club.instagram.replace(/^@/, ''))}</b>${I.right}</a>` : ''}
        ${state.club.address ? `<a class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px" href="https://maps.google.com/?q=${encodeURIComponent((state.club.name || 'MOOD') + ' ' + state.club.address)}" target="_blank" rel="noreferrer">
          <span style="color:#F2C14E">${I.map}</span><b style="flex:1;font-size:13.5px">${esc(state.club.address)}</b>${I.right}</a>` : ''}
      </div>
      <p class="tiny muted center" style="margin:22px 0 4px">MOOD Training Club · v2.0</p>
    </div>`;
  }

  function sessionRow(s, opts) {
    const o = opts || {};
    const mine = !!s.mine;
    const cls = ['ses', mine ? 'mine' : '', s.full && !mine ? 'full' : '', s.past ? 'past' : ''].join(' ');
    const spots = mine ? '<span class="spots ok">Reservado</span>'
      : s.past ? '<span class="spots none">Ya pasó</span>'
      : s.full ? '<span class="spots none">Completo</span>'
      : s.spots === 1 ? '<span class="spots low">Último lugar</span>'
      : `<span class="spots">${s.spots} lugares</span>`;
    const pct = Math.min(100, Math.round((s.booked / Math.max(1, s.capacity)) * 100));
    const cta = mine
      ? `<button class="btn btn-soft btn-sm" data-action="go" data-href="#/turnos">VER</button>`
      : s.past || s.full
        ? `<button class="btn btn-ghost btn-sm" disabled>${s.full ? 'Lleno' : '—'}</button>`
        : `<button class="btn btn-primary btn-sm" data-action="ask-book" data-key="${s.key}">RESERVAR</button>`;
    return `<div class="${cls}">
      <div class="ses-time"><b>${s.time}</b><span>${s.activity.durationMin} min</span></div>
      <div style="min-width:0">
        <div class="ses-name"><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${s.activity.color};margin-right:6px;vertical-align:1px"></span>${esc(s.activity.name)}</div>
        <div class="ses-sub"><span>${s.booked}/${s.capacity} anotados</span><span class="sep">·</span><span>${s.activity.credits > 0 ? `${s.activity.credits} crédito${s.activity.credits === 1 ? '' : 's'}` : 'incluida'}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="ses-cta">${spots}${o.hideCta ? '' : cta}</div>
    </div>`;
  }


  /* ============================================================
     Reservar
  ============================================================ */
  function viewBook(q) {
    const date = q.get('d') || defaultBookDate();
    const filter = q.get('a') || 'all';
    ui.bookDate = date;
    const all = sessionsOn(date, filter);
    const list = all.filter((s) => !s.past);
    const acts = state.activities;
    const actName = filter !== 'all' ? (acts.find((a) => a.id === filter) || {}).name || 'esa actividad' : '';
    return `<div class="view">
      ${header()}
      <div class="section-head" style="margin-top:6px"><h1 class="display h1">RESERVAR</h1></div>
      <p class="muted small">Elegí el día y la clase. Los lugares se actualizan al instante.</p>
      <div class="mt14">${dayStrip(date)}</div>
      <div class="mt14"><div class="chips">
        <button class="chip ${filter === 'all' ? 'on' : ''}" data-action="set-filter" data-filter="all">Todas</button>
        ${acts.map((a) => `<button class="chip ${filter === a.id ? 'on' : ''}" data-action="set-filter" data-filter="${a.id}"><span class="dot" style="background:${filter === a.id ? '#0B0B0B' : a.color}"></span>${esc(a.name)}</button>`).join('')}
      </div></div>
      <div class="section-head"><span class="pill-title">${longDate(date).toUpperCase()}</span><span class="link">${list.length} clases</span></div>
      ${list.length ? `<div class="sessions">${list.map((s) => sessionRow(s)).join('')}</div>`
        : all.length ? `<div class="empty"><b>Ya no quedan clases hoy</b>Mirá la agenda de mañana.</div>`
        : filter !== 'all'
          ? `<div class="empty"><b>Horarios de ${esc(actName)} a confirmar</b>Todavía no están cargados. Consultá en recepción.</div>`
          : `<div class="empty"><b>No hay clases ese día</b>Probá con otro día o actividad.</div>`}
      <p class="tiny muted center" style="margin-top:18px">Podés cancelar sin costo hasta ${state.club.cancelMinutes} minutos antes.</p>
    </div>`;
  }

  function defaultBookDate() {
    if (sessionsOn(todayStr()).some((s) => !s.past)) return todayStr();
    for (let i = 1; i <= 10; i++) {
      const d = addDays(todayStr(), i);
      if (sessionsOn(d).length) return d;
    }
    return todayStr();
  }

  /* ============================================================
     Mis turnos
  ============================================================ */
  function viewTurnos() {
    const upcoming = myBookings('up');
    const past = myBookings('past').reverse();
    const tab = ui.turnosTab || 'up';
    const list = tab === 'up' ? upcoming : past;
    const rt = state.routine.items || [];
    return `<div class="view">
      ${header()}
      <div class="section-head" style="margin-top:6px"><h1 class="display h1">MIS TURNOS</h1></div>
      ${rt.length ? `<button class="card flat" style="display:flex;align-items:center;gap:12px;padding:13px 14px;width:100%;text-align:left;border-color:var(--line);margin-bottom:12px" data-action="go" data-href="#/rutina">
        <span style="color:var(--pink-3)">${I.repeat}</span>
        <span style="flex:1"><b style="font-size:13px">Rutina semanal activa</b><br><span class="tiny muted">${rt.length} clase${rt.length === 1 ? '' : 's'} fija${rt.length === 1 ? '' : 's'} por semana</span></span>${I.right}
      </button>` : ''}
      <div class="seg">
        <button class="${tab === 'up' ? 'on' : ''}" data-action="turnos-tab" data-tab="up">Próximos (${upcoming.length})</button>
        <button class="${tab === 'past' ? 'on' : ''}" data-action="turnos-tab" data-tab="past">Historial</button>
      </div>
      <div class="list mt14">
        ${list.length ? list.map((b) => bookingCard(b)).join('') : `<div class="empty"><b>${tab === 'up' ? 'No tenés turnos reservados' : 'Todavía no hay historial'}</b>${tab === 'up' ? 'Buscá una clase y reservá tu lugar.' : ''}</div>`}
      </div>
      ${tab === 'up' && !list.length ? `<a class="btn btn-primary btn-lg mt14" href="#/reservar">RESERVAR TURNO</a>` : ''}
    </div>`;
  }

  function bookingCard(b) {
    const act = activityOf(b.activityId);
    const d = parseD(b.date);
    const active = b.status === 'active';
    const past = started(b.date, b.time);
    const cancelable = active && !past && canCancel(b);
    return `<div class="card" style="padding:14px">
      <div class="row" style="align-items:flex-start">
        <div class="hero-date" style="background:${active && !past ? '#fff' : 'rgba(255,255,255,.07)'};color:${active && !past ? '#0B0B0B' : '#9B9BA2'}">
          <b>${d.getDate()}</b><span>${MONTH[d.getMonth()]}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div class="between"><b style="font-size:14.5px">${esc(act.name)}</b>
            <span class="badge ${b.status === 'cancelled' ? 'off' : past ? 'off' : 'ok'}">${b.status === 'cancelled' ? 'Cancelado' : past ? 'Finalizado' : isToday(b.date) ? countdown(b.date, b.time).replace('en ', '') : `${WEEK[parseD(b.date).getDay()]} ${parseD(b.date).getDate()}`}</span>
          </div>
          <div class="small muted mt6">${b.time} hs · ${act.durationMin} min${b.routineId ? ' · rutina' : ''}</div>
          <div class="row mt10" style="gap:6px">
            <span class="badge mine"><span class="code">${b.code}</span></span>
            ${active && !past ? `<span class="tiny muted">Mostrá el código al entrar</span>` : ''}
          </div>
        </div>
      </div>
      ${active && !past ? `<div class="row mt14" style="gap:8px">
        <a class="btn btn-ghost btn-sm" style="flex:1" href="${calendarUrl(b)}" target="_blank" rel="noreferrer">${I.ics} Calendario</a>
        <button class="btn ${cancelable ? 'btn-danger' : 'btn-ghost'} btn-sm" style="flex:1" data-action="${cancelable ? 'ask-cancel' : 'no-cancel'}" data-id="${b.id}">${cancelable ? 'Cancelar' : 'No cancelable'}</button>
      </div>` : ''}
    </div>`;
  }

  function viewRoutine() {
    const draft = ui.routineDraft || [];
    const cost = draft.reduce((a, it) => a + Number(activityOf(it.activityId).credits || 0), 0);
    return `<div class="view">
      ${header()}
      <div class="section-head" style="margin-top:6px"><h1 class="display h1">MI RUTINA</h1></div>
      <p class="muted small">Elegí tus clases fijas de la semana. Las reservamos solas <b>2 semanas para adelante</b> y se van renovando.</p>

      <div class="list mt14">
        ${draft.length ? draft.map((it, i) => `<div class="card" style="padding:13px 14px">
          <div class="between">
            <div class="row"><span class="badge mine">${WEEK[Number(it.weekday)]}</span><b style="font-size:14px">${it.time} hs</b><span style="color:${activityOf(it.activityId).color}">${esc(activityOf(it.activityId).name)}</span></div>
            <button class="icon-btn danger" data-action="routine-remove" data-idx="${i}" aria-label="Quitar">${I.x}</button>
          </div>
        </div>`).join('') : `<div class="empty"><b>Todavía no armaste tu rutina</b>Agregá tus clases fijas y listo.</div>`}
      </div>

      <button class="btn btn-ghost btn-block mt14" data-action="routine-pick">${I.plus} AGREGAR CLASE</button>
      ${draft.length ? `<button class="btn btn-primary btn-lg mt10" data-action="routine-save">GUARDAR RUTINA</button>` : ''}

      <div class="card mt14" style="padding:14px">
        <div class="kv"><span>Clases por semana</span><b>${draft.length}</b></div>
        <div class="kv"><span>Créditos por semana</span><b>${unlimited() ? 'Ilimitados (GOLD)' : cost}</b></div>
        <div class="kv"><span>Se reserva hasta</span><b>${addDays(todayStr(), 14).split('-').reverse().join('/')}</b></div>
      </div>
      <p class="tiny muted center mt14" style="line-height:1.6">${unlimited() ? 'Tu GOLD reserva sin descontar créditos.' : 'Cada clase descuenta sus créditos al reservarse.<br>Si no hay cupo o créditos, esa semana se saltea.'}</p>
    </div>`;
  }

  /* ============================================================
     Abonos + pagos
  ============================================================ */
  function viewAbonos() {
    const cur = state.member && state.member.planId;
    const group = (id, title, sub) => {
      const items = state.plans.filter((p) => p.group === id);
      return `<div class="abono-group">
        <div class="abono-head"><span class="pill-title">${title}</span><span class="sub">${sub}</span></div>
        ${items.map((p) => `<div class="abono ${cur === p.id ? 'sel' : ''}" data-action="ask-plan" data-plan="${p.id}" role="button" tabindex="0">
          <span class="arw">➤</span>
          <span><b>${esc(p.name)}</b><small>${p.credits == null ? 'Clases ilimitadas' : p.credits + ' créditos'}</small></span>
          <span class="price">${money(p.price)}</span>
        </div>`).join('')}
      </div>`;
    };
    const pays = state.payments || [];
    const stLabel = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
    return `<div class="view" style="padding-bottom:10px">
      ${header()}
      <div class="section-head" style="margin-top:6px"><h1 class="display h1">ABONOS</h1></div>
      <p class="muted small" style="margin-top:-4px">Elegí tu plan y pagalo desde el celular.</p>
      <div class="mt14">${group('estandar', 'ESTÁNDAR', 'Una sola actividad')}</div>
      ${group('mood', 'MOOD', 'Dos o más actividades')}
      <p class="tiny muted center mt14" style="line-height:1.6">Si pagás en efectivo en el club, avisanos desde la app y lo activan al instante.</p>

      ${pays.length ? `<div class="section-head"><span class="pill-title">MIS PAGOS</span></div>
      <div class="list">${pays.slice().reverse().map((p) => `<div class="card" style="padding:12px 14px">
        <div class="between"><div><b style="font-size:13px">${esc((state.plans.find((x) => x.id === p.planId) || {}).name || p.planId)}</b>
          <div class="tiny muted mt4">${new Date(p.createdAt).toLocaleDateString('es-AR')} · ${money(p.amount)}</div></div>
          <span class="badge ${p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'off' : 'warn'}">${stLabel[p.status] || p.status}</span></div>
      </div>`).join('')}</div>` : ''}
    </div>`;
  }

  function sheetPlan(id) {
    const p = state.plans.find((x) => x.id === id);
    if (!p) return;
    const current = state.member && state.member.planId === p.id;
    const canPay = !!(p.mpLink || state.mpEnabled);
    openSheet(`
      <div class="grab"></div>
      <span class="pill-title">${p.group === 'estandar' ? 'ESTÁNDAR' : 'MOOD'}</span>
      <h3 class="display h2 mt10">${esc(p.name)}</h3>
      <p class="muted small mt6">${p.credits == null ? 'Clases ilimitadas' : p.credits + ' créditos'} · ${money(p.price)}</p>
      <div class="card mt14" style="padding:14px">
        <div class="kv"><span>Créditos</span><b>${p.credits == null ? 'Ilimitados' : p.credits}</b></div>
        <div class="kv"><span>Actividades</span><b>${p.group === 'estandar' ? 'Una' : 'Dos o más'}</b></div>
        <div class="kv"><span>Precio</span><b>${money(p.price)}</b></div>
      </div>
      ${current ? '<p class="tiny" style="color:var(--ok);margin-top:10px">Este es tu abono actual. Podés renovarlo o cambiarlo.</p>' : ''}
      <button class="btn btn-primary btn-lg mt14" data-action="pay-plan" data-plan="${p.id}">${canPay ? 'PAGAR CON MERCADO PAGO' : 'AVISAR PAGO AL CLUB'}</button>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Volver</button>
      <p class="tiny muted center mt10">${state.mpEnabled ? 'Al aprobarse el pago, los créditos se cargan solos.' : canPay ? 'Te llevamos a Mercado Pago. Al volver, el club confirma y carga los créditos.' : 'El club confirma el pago y te carga los créditos.'}</p>
    `);
  }

  function manualPaymentSheet(paymentId) {
    return `<div class="grab"></div>
      <div class="center" style="padding:6px 0 2px">
        <div class="success-ico" style="background:rgba(242,193,78,.12);color:#F2C14E;border-color:rgba(242,193,78,.35)">${I.card}</div>
        <h3 class="display h2 mt12">PAGO AVISADO</h3>
        <p class="muted small mt6">El club va a confirmar tu pago y activar el abono. Ref: <b>${paymentId.slice(-6)}</b></p>
      </div>
      <button class="btn btn-soft btn-lg mt14" data-action="check-pay">VERIFICAR PAGO</button>
      <button class="btn btn-primary btn-lg mt14" data-action="go" data-href="#/abonos">VOLVER A ABONOS</button>`;
  }

  function paymentResultSheet(ok, planName) {
    return `<div class="grab"></div>
      <div class="center" style="padding:6px 0 2px">
        <div class="success-ico" style="background:${ok ? 'rgba(61,220,151,.12)' : 'rgba(255,82,82,.12)'};color:${ok ? '#3DDC97' : '#FF9B9B'};border-color:${ok ? 'rgba(61,220,151,.35)' : 'rgba(255,82,82,.35)'}">${ok ? I.check : I.x}</div>
        <h3 class="display h2 mt12">${ok ? 'PAGO APROBADO' : 'PAGO PENDIENTE'}</h3>
        <p class="muted small mt6">${ok ? `Ya está activo tu abono ${esc(planName || '')}.` : 'Todavía no nos llegó la confirmación. Actualizá en un rato.'}</p>
      </div>
      <button class="btn btn-primary btn-lg mt14" data-action="go" data-href="#/inicio">IR AL INICIO</button>`;
  }

  function noCreditsSheet() {
    const p = plan();
    return `<div class="grab"></div>
      <h3 class="display h2">SIN CRÉDITOS</h3>
      <p class="muted small mt6">${p ? `Te quedan ${creditsLeft()} de ${p.credits} créditos en tu abono ${esc(p.name)}.` : 'Necesitás un abono activo para reservar.'}</p>
      <p class="tiny muted mt10">Renová o cambiá tu abono y seguí entrenando.</p>
      <button class="btn btn-primary btn-lg mt14" data-action="go" data-href="#/abonos">VER ABONOS</button>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Volver</button>`;
  }

  let checkingPay = false;
  async function checkPaymentStatus(force = false) {
    if (checkingPay && !force) return;
    const url = new URLSearchParams(location.search);
    const fromUrl = url.get('pago');
    const pending = localStorage.getItem(PAY_KEY);
    const ref = fromUrl || pending;
    if (!ref) return;
    checkingPay = true;
    setTimeout(() => { checkingPay = false; }, 65000);
    if (fromUrl) {
      history.replaceState(null, '', location.pathname + location.hash);
      location.hash = '#/abonos';
    }
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const r = await api('/api/pay/status?ref=' + encodeURIComponent(ref));
        if (r.status === 'approved') {
          localStorage.removeItem(PAY_KEY);
          await refresh();
          const p = state.plans.find((x) => x.id === r.planId);
          openSheet(paymentResultSheet(true, p && p.name));
          return;
        }
        if (r.status === 'rejected') {
          localStorage.removeItem(PAY_KEY);
          await refresh();
          openSheet(paymentResultSheet(false));
          return;
        }
      } catch (_) {}
      if (tries < 20) setTimeout(poll, 3000);
      else if (tries === 20) { checkingPay = false; toast('Seguimos esperando la confirmación del pago'); }
    };
    poll();
  }

  /* ============================================================
     Perfil
  ============================================================ */
  function viewPerfil() {
    const p = plan();
    const m = me() || {};
    const initial = (m.name || 'M').trim().charAt(0).toUpperCase();
    const mine = state.bookings;
    const done = mine.filter((b) => b.status === 'active' && started(b.date, b.time)).length;
    const upcoming = mine.filter((b) => b.status === 'active' && !started(b.date, b.time)).length;
    return `<div class="view">
      ${header()}
      <div class="section-head" style="margin-top:6px"><h1 class="display h1">PERFIL</h1></div>
      <div class="card">
        <div class="row">
          <div class="avatar">${esc(initial)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:750;font-size:16px">${esc(m.name || 'Tu nombre')}</div>
            <div class="small muted">${esc(m.phone || 'Agregá tu teléfono')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="edit-member">Editar</button>
        </div>
        <div class="divider"></div>
        <div class="row" style="justify-content:space-between">
          <div class="stat"><b>${upcoming}</b><span>Próximos</span></div>
          <div class="stat"><b>${done}</b><span>Completados</span></div>
          <div class="stat"><b>${p && p.credits == null ? '∞' : (p ? creditsLeft() : 0)}</b><span>Créditos</span></div>
        </div>
      </div>

      <div class="section-head"><span class="pill-title">TU ABONO</span><a class="link" href="#/abonos">${p ? 'Renovar' : 'Contratar'}</a></div>
      <div class="card">
        ${p ? `<div class="plan-row">
          <div><div class="plan-name">${esc(p.name)}</div><div class="plan-credits">${p.credits == null ? 'Clases ilimitadas' : `${p.credits} créditos`}</div></div>
          <div class="credits-big">${p.credits == null ? '∞' : creditsLeft()}<small>${p.credits == null ? 'ILIMITADO' : 'DISPONIBLES'}</small></div>
        </div>` : `<div class="between"><span class="muted small">Sin abono activo</span><a class="btn btn-primary btn-sm" href="#/abonos">ELEGIR</a></div>`}
      </div>

      <div class="section-head"><span class="pill-title">AJUSTES</span></div>
      <div class="list">
        <button class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px;width:100%;text-align:left;border-color:var(--line)" data-action="open-routine">
          <span style="color:#4EA8FF">${I.repeat}</span><b style="flex:1;font-size:13.5px">Mi rutina semanal</b>${I.right}
        </button>
        <button class="card flat" id="install-btn" style="display:${installEvt ? 'flex' : 'none'};align-items:center;gap:12px;padding:14px;width:100%;text-align:left;border-color:var(--line)" data-action="install">
          <span style="color:#3DDC97">${I.install}</span><b style="flex:1;font-size:13.5px">Instalar la app en el teléfono</b>${I.right}
        </button>
        ${!installEvt ? `<button class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px;width:100%;text-align:left;border-color:var(--line)" data-action="install-help">
          <span style="color:${window.isSecureContext ? '#3DDC97' : '#F2C14E'}">${I.install}</span><b style="flex:1;font-size:13.5px">${window.isSecureContext ? 'Cómo instalar la app' : 'Instalar: necesitás HTTPS'}</b>${I.right}
        </button>` : ''}
        <button class="card flat" style="display:flex;align-items:center;gap:12px;padding:14px;width:100%;text-align:left;border-color:var(--line)" data-action="admin">
          <span style="color:#9B9BA2">${I.lock}</span><b style="flex:1;font-size:13.5px">Modo administración</b>${I.right}
        </button>
      </div>
      <p class="tiny muted center mt20">MOOD Training Club · La Consulta, Mendoza<br>Hecho para entrenar mejor.</p>
    </div>`;
  }


  /* ============================================================
     Sheets públicos
  ============================================================ */
  function sheetBook(key) {
    const [date, time, activityId] = key.split('|');
    const slot = state.schedule.find((s) => s.time === time && s.activityId === activityId && s.weekday === parseD(date).getDay());
    if (!slot) return;
    const s = buildSession(date, slot);
    const cost = Number(s.activity.credits == null ? 1 : s.activity.credits);
    const left = creditsLeft();
    openSheet(`
      <div class="grab"></div>
      <div class="between"><span class="eyebrow">Confirmá tu turno</span><span class="badge ${s.spots <= 2 ? 'warn' : 'ok'}">${s.spots} lugares</span></div>
      <h3 class="display h2 mt6">${esc(s.activity.name)}</h3>
      <div class="row mt10" style="gap:10px;color:#CFCFD4">
        <span class="badge mine">${I.cal} ${shortDate(date)}</span>
        <span class="badge mine">${I.clock} ${s.time} hs</span>
        <span class="badge mine">${s.activity.durationMin} min</span>
      </div>
      <div class="card mt14" style="padding:14px">
        <div class="kv"><span>Créditos</span><b>${unlimited() ? 'Ilimitados (GOLD)' : `${cost} de ${left}`}</b></div>
        <div class="kv"><span>Lugar</span><b>${s.booked + 1} de ${s.capacity}</b></div>
        <div class="kv"><span>Cancelación</span><b>Hasta ${state.club.cancelMinutes} min antes</b></div>
      </div>
      ${!canAfford(s.activity) ? `<p class="small" style="color:#FF9B9B;margin-top:10px">No te alcanzan los créditos. Podés renovar tu abono.</p>` : ''}
      <button class="btn btn-primary btn-lg mt14" data-action="do-book" data-key="${s.key}" ${!canAfford(s.activity) ? 'disabled' : ''}>CONFIRMAR TURNO</button>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Volver</button>
      <p class="tiny muted center mt10">Al reservar aceptás el código de convivencia del club.</p>
    `);
  }

  function sheetCancel(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b) return;
    const act = activityOf(b.activityId);
    const ok = canCancel(b);
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">${ok ? '¿Cancelar turno?' : 'Ya no se puede cancelar'}</h3>
      <p class="muted small mt6">${esc(act.name)} · ${shortDate(b.date)} ${b.time} hs</p>
      ${ok
        ? `<p class="tiny muted mt10">Se te devuelven los créditos de este turno.</p>
           <button class="btn btn-danger btn-lg mt14" data-action="do-cancel" data-id="${id}">SÍ, CANCELAR</button>
           <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Mantener turno</button>`
        : `<p class="tiny muted mt10">Las cancelaciones cierran <b>${state.club.cancelMinutes} minutos antes</b> de la clase. Si no podés ir, avisale al club.</p>
           <button class="btn btn-primary btn-block mt14" data-action="close-sheet">ENTENDIDO</button>`}
    `);
  }

  function sheetMember() {
    const m = me() || {};
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">Tus datos</h3>
      <form data-form="member">
        <div class="field"><label class="label">Nombre</label><input class="input" name="name" value="${esc(m.name || '')}" required></div>
        <div class="field"><label class="label">Teléfono</label><input class="input" name="phone" inputmode="tel" value="${esc(m.phone || '')}"></div>
        <button class="btn btn-primary btn-lg mt14" type="submit">GUARDAR</button>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  function sheetNews(id) {
    const n = state.news.find((x) => x.id === id);
    if (!n) return;
    openSheet(`
      <div class="grab"></div>
      ${n.image ? `<img src="${esc(n.image)}" alt="" style="width:100%;border-radius:16px;display:block;margin-bottom:14px">` : ''}
      <span class="pill-title">NOVEDAD</span>
      <h3 class="display h2 mt8">${esc(n.title || '')}</h3>
      ${n.text ? `<p class="muted small mt10" style="white-space:pre-line;line-height:1.6">${esc(n.text)}</p>` : ''}
      ${n.ctaLabel && n.ctaUrl ? `<a class="btn btn-primary btn-lg mt14" href="${esc(n.ctaUrl)}" target="${n.ctaUrl.startsWith('#') ? '_self' : '_blank'}" rel="noreferrer">${esc(n.ctaLabel)}</a>` : ''}
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cerrar</button>
    `);
  }

  function sheetInstallHelp() {
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">Instalar MOOD</h3>
      <div class="card mt12" style="padding:14px">
        <b style="font-size:13px">Android (Chrome)</b>
        <p class="tiny muted mt6">Menú ⋮ → <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</p>
      </div>
      <div class="card mt10" style="padding:14px">
        <b style="font-size:13px">iPhone (Safari)</b>
        <p class="tiny muted mt6">Botón <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.</p>
      </div>
      <div class="card mt10" style="padding:14px;border-color:rgba(242,193,78,.45)">
        <b style="font-size:13px;color:#F2C14E">Si abriste la app con una IP (http://192.168…)</b>
        <p class="tiny muted mt6">El teléfono no permite instalar apps desde HTTP. Usá la URL <b>https://</b> del túnel
        (<b>Compartir Mood (tunel).bat</b>) o un dominio propio. Tampoco la abras desde el navegador
        interno de Telegram/Instagram: usá Chrome o Safari.</p>
      </div>
      <button class="btn btn-primary btn-block mt14" data-action="close-sheet">LISTO</button>
    `);
  }

  function sheetRoutinePick(activityId, weekday) {
    const acts = state.activities.filter((a) => state.schedule.some((s) => s.activityId === a.id));
    if (!acts.length) { toast('Todavía no hay horarios cargados', 'err'); return; }
    const act = acts.find((a) => a.id === activityId) || acts[0];
    const days = Array.from(new Set(state.schedule.filter((s) => s.activityId === act.id).map((s) => Number(s.weekday))))
      .sort((a, b) => ((a || 7) - (b || 7)));
    const wd = days.includes(Number(weekday)) ? Number(weekday) : days[0];
    const times = state.schedule.filter((s) => s.activityId === act.id && Number(s.weekday) === wd).map((s) => s.time).sort();
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">Agregar a mi rutina</h3>
      <p class="muted small mt6">Se repite todas las semanas.</p>
      <form data-form="routine-add">
        <div class="field"><label class="label">Clase</label>
          <select class="input" name="activityId" data-routine="act">
            ${acts.map((a) => `<option value="${a.id}" ${a.id === act.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select></div>
        <div class="formrow">
          <div class="field"><label class="label">Día</label>
            <select class="input" name="weekday" data-routine="day">
              ${days.map((d) => `<option value="${d}" ${d === wd ? 'selected' : ''}>${WEEK_LONG[d]}</option>`).join('')}
            </select></div>
          <div class="field"><label class="label">Hora</label>
            <select class="input" name="time">
              ${times.map((t) => `<option value="${t}">${t} hs</option>`).join('')}
            </select></div>
        </div>
        <button class="btn btn-primary btn-lg mt14" type="submit">AGREGAR</button>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  /* ============================================================
     ADMIN
  ============================================================ */
  const adminToken = () => sessionStorage.getItem(ADMIN_KEY) || '';
  async function adminApi(path, opts = {}) {
    try {
      return await api(path, { ...opts, headers: { ...(opts.headers || {}), 'x-admin-token': adminToken() } });
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem(ADMIN_KEY); adminData = null; throw e; }
      throw e;
    }
  }
  async function loadAdmin() {
    adminData = await adminApi('/api/admin/state');
  }

  function viewAdmin() {
    if (!adminToken()) return adminGate();
    if (!adminData) {
      loadAdmin().then(() => render()).catch((e) => { sessionStorage.removeItem(ADMIN_KEY); render(); });
      return `<div class="view" style="padding-top:40px"><div class="center"><div class="success-ico">${I.clock}</div><p class="muted small mt10">Cargando panel…</p></div></div>`;
    }
    const tabs = [['agenda', 'Agenda'], ['socios', 'Socios'], ['horarios', 'Horarios'], ['clases', 'Clases'], ['cobros', 'Cobros'], ['difusion', 'Difusión'], ['ajustes', 'Ajustes']];
    const body = ui.adminTab === 'agenda' ? adminAgenda()
      : ui.adminTab === 'socios' ? adminSocios()
      : ui.adminTab === 'horarios' ? adminHorarios()
      : ui.adminTab === 'clases' ? adminClases()
      : ui.adminTab === 'cobros' ? adminCobros()
      : ui.adminTab === 'difusion' ? adminDifusion() : adminAjustes();
    return `<div class="view">
      <div class="top">
        <button class="btn btn-ghost btn-sm" data-action="go" data-href="#/perfil" style="width:auto">${I.left}</button>
        <div class="brand"><div class="display name">PANEL DEL CLUB</div><div class="sub">ADMINISTRACIÓN</div></div>
        <div class="spacer"></div>
        <button class="link-btn" data-action="admin-exit">Salir</button>
      </div>
      <div class="admin-tabs">${tabs.map(([id, label]) => `<button class="${ui.adminTab === id ? 'on' : ''}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="mt14">${body}</div>
    </div>`;
  }

  function adminGate() {
    return `<div class="view" style="padding-top:38px">
      <div class="center">
        <div class="success-ico" style="background:rgba(204,34,153,.12);color:var(--pink-3);border-color:rgba(204,34,153,.35)">${I.lock}</div>
        <h1 class="display h2">MODO CLUB</h1>
        <p class="muted small mt6">Ingresá el PIN para administrar el club.</p>
      </div>
      <form data-form="admin-pin" class="card mt20">
        <label class="label" for="pin">PIN de administración</label>
        <input class="input" id="pin" name="pin" inputmode="numeric" maxlength="6" placeholder="••••" style="text-align:center;letter-spacing:.5em;font-size:22px">
        <button class="btn btn-primary btn-lg mt14" type="submit">ENTRAR</button>
        <button class="btn btn-ghost btn-block mt10" type="button" data-action="go" data-href="#/perfil">Volver</button>
      </form>
    </div>`;
  }

  function adminSessions(date) {
    const wd = parseD(date).getDay();
    return adminData.schedule.filter((s) => Number(s.weekday) === wd)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((slot) => ({
        slot,
        act: activityOf(slot.activityId),
        bookings: adminData.bookings.filter((b) => b.status === 'active' && b.date === date && b.time === slot.time && b.activityId === slot.activityId),
      }));
  }

  function adminAgenda() {
    const list = adminSessions(ui.adminDay);
    const total = list.reduce((a, s) => a + s.bookings.length, 0);
    return `<div>${dayStrip(ui.adminDay, { action: 'admin-day' })}
      <div class="section-head"><span class="pill-title">${total} RESERVAS · ${list.length} CLASES</span><span class="link">${WEEK_LONG[parseD(ui.adminDay).getDay()]}</span></div>
      ${list.length ? `<div class="list">${list.map(({ slot, act, bookings }) => `<div class="card" style="padding:13px 14px">
        <div class="between">
          <div class="row"><b class="display" style="font-size:17px;font-style:italic">${slot.time}</b><span class="small">${esc(act.name)}</span></div>
          <span class="badge ${bookings.length >= slot.capacity ? 'warn' : bookings.length ? 'ok' : 'off'}">${bookings.length}/${slot.capacity}</span>
        </div>
        ${bookings.length ? `<div class="row mt10" style="flex-wrap:wrap;gap:6px">${bookings.map((b) => `<button class="chip" data-action="admin-unbook" data-id="${b.id}" title="Quitar">${esc(b.name)} ✕</button>`).join('')}</div>` : '<div class="tiny muted mt6">Sin reservas todavía.</div>'}
      </div>`).join('')}</div>` : `<div class="empty"><b>No hay clases</b>Cargá horarios en la pestaña Horarios.</div>`}
    </div>`;
  }

  function adminHorarios() {
    const days = [1, 2, 3, 4, 5, 6, 0];
    return `<div>${days.map((wd) => {
      const slots = adminData.schedule.filter((s) => Number(s.weekday) === wd).sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="card mt10" style="padding:14px">
        <div class="between"><b style="font-size:14px">${WEEK_LONG[wd]}</b>
          <div class="row" style="gap:6px">
            <button class="btn btn-ghost btn-sm" data-action="bulk-slot" data-wd="${wd}">BLOQUE</button>
            <button class="btn btn-ghost btn-sm" data-action="add-slot" data-wd="${wd}">${I.plus}</button>
          </div></div>
        ${slots.length ? `<div class="mt10">${slots.map((s) => `<div class="kv admin-slot">
          <div class="row"><b>${s.time}</b><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${activityOf(s.activityId).color}"></span><span>${esc(activityOf(s.activityId).name)}</span><span class="tiny muted">· ${s.capacity} cupos</span></div>
          <div class="row" style="gap:4px">
            <button class="icon-btn" data-action="edit-slot" data-id="${s.id}" title="Editar">${I.edit}</button>
            <button class="icon-btn danger" data-action="del-slot" data-id="${s.id}" title="Borrar">${I.trash}</button>
          </div>
        </div>`).join('')}</div>` : '<div class="tiny muted mt6">Sin horarios.</div>'}
      </div>`;
    }).join('')}</div>`;
  }

  function adminClases() {
    return `<div>
      <button class="btn btn-primary btn-block" data-action="add-activity">${I.plus} NUEVA CLASE</button>
      <div class="list mt12">${adminData.activities.map((a) => `<div class="card" style="padding:13px 14px;${a.active === false ? 'opacity:.45' : ''}">
        <div class="between">
          <div class="row"><span style="width:10px;height:10px;border-radius:50%;background:${a.color};display:inline-block"></span><b style="font-size:14px">${esc(a.name)}</b></div>
          <div class="row" style="gap:4px">
            <button class="icon-btn" data-action="edit-activity" data-id="${a.id}">${I.edit}</button>
            <button class="icon-btn danger" data-action="del-activity" data-id="${a.id}">${I.trash}</button>
          </div>
        </div>
        <div class="tiny muted mt6">${a.durationMin} min · ${a.credits > 0 ? `${a.credits} crédito${a.credits === 1 ? '' : 's'}` : 'incluida'}${a.active === false ? ' · oculta' : ''}</div>
      </div>`).join('')}</div>
    </div>`;
  }

  function adminCobros() {
    const st = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
    return `<div>
      <div class="card" style="padding:13px 14px;border-color:${adminData.mp.enabled ? 'rgba(61,220,151,.35)' : 'rgba(242,193,78,.35)'}">
        <div class="between">
          <div><b style="font-size:13px">${adminData.mp.enabled ? 'Mercado Pago automático' : 'Mercado Pago manual'}</b>
            <div class="tiny muted mt4">${adminData.mp.enabled ? 'Al aprobarse el pago, los créditos se cargan solos.' : 'Cargá el Access Token en Ajustes para acreditar automáticamente.'}</div></div>
          <span class="badge ${adminData.mp.enabled ? 'ok' : 'warn'}">${adminData.mp.enabled ? 'AUTO' : 'MANUAL'}</span>
        </div>
      </div>
      <div class="section-head" style="margin-top:0"><span class="pill-title">PLANES Y PRECIOS</span></div>
      <div class="list">${adminData.plans.map((p) => `<form data-form="plan" class="card" style="padding:14px">
        <input type="hidden" name="id" value="${p.id}">
        <div class="between"><b style="font-size:14px">${esc(p.name)}</b><span class="tiny muted">${p.group === 'estandar' ? 'Estándar' : 'MOOD'}</span></div>
        <div class="formrow mt10">
          <div class="field" style="margin-top:0"><label class="label">Precio</label><input class="input" name="price" type="number" value="${p.price}"></div>
          <div class="field" style="margin-top:0"><label class="label">Créditos (vacío = ilimitado)</label><input class="input" name="credits" type="number" value="${p.credits == null ? '' : p.credits}"></div>
        </div>
        <div class="field"><label class="label">Link de pago (Mercado Pago)</label><input class="input" name="mpLink" value="${esc(p.mpLink || '')}" placeholder="https://mpago.la/..."></div>
        <button class="btn btn-ghost btn-block btn-sm" type="submit">GUARDAR PLAN</button>
      </form>`).join('')}</div>

      <div class="section-head"><span class="pill-title">PAGOS</span></div>
      ${adminData.payments.length ? `<div class="list">${adminData.payments.map((p) => `<div class="card" style="padding:13px 14px">
        <div class="between">
          <div><b style="font-size:13px">${esc(p.memberName || 'Socio')}</b>
            <div class="tiny muted mt4">${esc(p.planName || p.planId)} · ${money(p.amount)} · ${new Date(p.createdAt).toLocaleDateString('es-AR')}</div></div>
          <span class="badge ${p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'off' : 'warn'}">${st[p.status] || p.status}</span>
        </div>
        ${p.status === 'pending' ? `<div class="row mt10" style="gap:8px">
          <button class="btn btn-primary btn-sm" style="flex:1" data-action="pay-confirm" data-id="${p.id}">CONFIRMAR</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" data-action="pay-reject" data-id="${p.id}">RECHAZAR</button>
        </div>` : ''}
      </div>`).join('')}</div>` : '<div class="empty"><b>Sin pagos todavía</b>Acá aparecen los pagos de la app.</div>'}
    </div>`;
  }

  function adminDifusion() {
    return `<div>
      <button class="btn btn-primary btn-block" data-action="add-news">${I.plus} NUEVA NOVEDAD / FLYER</button>
      <p class="tiny muted mt8">Se muestra en Inicio de todos los socios.</p>
      <div class="list mt12">${adminData.news.length ? adminData.news.slice().reverse().map((n) => `<div class="card" style="padding:12px;display:flex;gap:12px;align-items:center">
        ${n.image ? `<img src="${esc(n.image)}" style="width:64px;height:64px;border-radius:10px;object-fit:cover" alt="">` : `<div style="width:64px;height:64px;border-radius:10px;background:rgba(255,255,255,.06);display:grid;place-items:center;color:var(--muted)">${I.image}</div>`}
        <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(n.title || 'Novedad')}</b><div class="tiny muted mt4">${n.active === false ? 'Oculta' : 'Publicada'}</div></div>
        <button class="icon-btn" data-action="edit-news" data-id="${n.id}">${I.edit}</button>
        <button class="icon-btn danger" data-action="del-news" data-id="${n.id}">${I.trash}</button>
      </div>`).join('') : '<div class="empty"><b>No hay novedades</b>Subí un flyer o anuncio.</div>'}</div>
    </div>`;
  }

  function adminAjustes() {
    const c = adminData.club;
    const mp = adminData.mp;
    return `<div>
      <form data-form="club" class="card">
        <div class="field" style="margin-top:0"><label class="label">Nombre</label><input class="input" name="name" value="${esc(c.name)}"></div>
        <div class="field"><label class="label">Dirección</label><input class="input" name="address" value="${esc(c.address)}"></div>
        <div class="formrow">
          <div class="field"><label class="label">WhatsApp</label><input class="input" name="whatsapp" value="${esc(c.whatsapp)}" placeholder="5492604..."></div>
          <div class="field"><label class="label">Instagram</label><input class="input" name="instagram" value="${esc(c.instagram)}" placeholder="mood.trainingclub"></div>
        </div>
        <div class="formrow">
          <div class="field"><label class="label">Cancelar hasta (min antes)</label><input class="input" name="cancelMinutes" type="number" min="0" max="1440" value="${c.cancelMinutes}"></div>
          <div class="field"><label class="label">PIN admin</label><input class="input" name="adminPin" inputmode="numeric" maxlength="6" value="${esc(c.adminPin)}"></div>
        </div>
        <button class="btn btn-primary btn-block mt14" type="submit">GUARDAR</button>
      </form>

      <div class="section-head"><span class="pill-title">MERCADO PAGO</span></div>
      <form data-form="mp" class="card">
        <div class="field" style="margin-top:0"><label class="label">Access Token</label>
          <input class="input" name="accessToken" type="password" placeholder="${mp.hasToken ? 'Configurado (escribí para cambiarlo)' : 'APP_USR-...'}"></div>
        <div class="field"><label class="label">URL pública del servidor</label>
          <input class="input" name="publicUrl" value="${esc(mp.publicUrl || '')}" placeholder="https://mood.midominio.com"></div>
        <button class="btn btn-primary btn-block" type="submit">GUARDAR MP</button>
        <p class="tiny muted mt10" style="line-height:1.6">Para cobrar automático necesitás una URL pública (HTTPS) y configurar el webhook. Si preferís algo simple, pegá un <b>link de pago</b> por plan en Cobros.</p>
      </form>

      <div class="section-head"><span class="pill-title">DATOS DE PRUEBA</span></div>
      <div class="card">
        <p class="tiny muted">Cargar reservas de ejemplo (para mostrarla con movimiento) o borrarlas.</p>
        <div class="row mt10" style="gap:8px">
          <button class="btn btn-ghost btn-sm" style="flex:1" data-action="seed-demo">CARGAR DEMO</button>
          <button class="btn btn-danger btn-sm" style="flex:1" data-action="clear-demo">BORRAR DEMO</button>
        </div>
      </div>
      <p class="tiny muted center mt16">MOOD · panel v2.0</p>
    </div>`;
  }


  /* ============================================================
     Admin · socios + sheets
  ============================================================ */
  function adminSocios() {
    const list = adminData.members.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return `<div>
      <div class="section-head" style="margin-top:0"><span class="pill-title">SOCIOS</span><span class="link">${list.length}</span></div>
      ${list.length ? `<div class="list">${list.map((m) => {
        const p = adminData.plans.find((x) => x.id === m.planId);
        return `<button class="card" style="padding:13px 14px;width:100%;text-align:left" data-action="edit-member-admin" data-id="${m.id}">
          <div class="between">
            <div><b style="font-size:14px">${esc(m.name)}</b><div class="tiny muted mt4">${esc(m.phone || 'sin teléfono')}</div></div>
            <div style="text-align:right"><span class="badge ${p ? 'mine' : 'off'}">${p ? esc(p.name) : 'SIN ABONO'}</span>
              <div class="tiny muted mt4">${p && p.credits == null ? 'ilimitado' : `${m.creditsLeft == null ? 0 : m.creditsLeft} créditos`} · ${m.upcoming} turnos</div></div>
          </div>
        </button>`;
      }).join('')}</div>` : '<div class="empty"><b>Todavía no hay socios</b>Se crean cuando alguien entra a la app.</div>'}
    </div>`;
  }

  function sheetMemberAdmin(id) {
    const m = adminData.members.find((x) => x.id === id);
    if (!m) return;
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">Editar socio</h3>
      <form data-form="member-admin">
        <input type="hidden" name="id" value="${m.id}">
        <div class="field"><label class="label">Nombre</label><input class="input" name="name" value="${esc(m.name)}"></div>
        <div class="field"><label class="label">Teléfono</label><input class="input" name="phone" value="${esc(m.phone || '')}"></div>
        <div class="formrow">
          <div class="field"><label class="label">Abono</label>
            <select class="input" name="planId">${adminData.plans.map((p) => `<option value="${p.id}" ${p.id === m.planId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field"><label class="label">Créditos</label><input class="input" name="creditsLeft" type="number" min="0" value="${m.creditsLeft == null ? '' : m.creditsLeft}" placeholder="—"></div>
        </div>
        <button class="btn btn-primary btn-lg mt14" type="submit">GUARDAR</button>
        <p class="tiny muted center mt10">Cambiar el abono reinicia los créditos del plan. Después podés ajustarlos a mano.</p>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  function sheetSlot(wd, slot) {
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">${slot ? 'Editar horario' : 'Nuevo horario'}</h3>
      <p class="muted small mt6">${WEEK_LONG[wd]}</p>
      <form data-form="slot-admin">
        <input type="hidden" name="id" value="${slot ? slot.id : ''}">
        <input type="hidden" name="weekday" value="${wd}">
        <div class="field"><label class="label">Clase</label>
          <select class="input" name="activityId">${adminData.activities.filter((a) => a.active !== false).map((a) => `<option value="${a.id}" ${slot && slot.activityId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="formrow">
          <div class="field"><label class="label">Hora</label><input class="input" name="time" type="time" value="${slot ? slot.time : '18:00'}" required></div>
          <div class="field"><label class="label">Cupos</label><input class="input" name="capacity" type="number" min="1" max="200" value="${slot ? slot.capacity : 20}" required></div>
        </div>
        <button class="btn btn-primary btn-lg mt14" type="submit">GUARDAR HORARIO</button>
        ${slot ? `<button class="btn btn-danger btn-block mt10" type="button" data-action="del-slot" data-id="${slot.id}">ELIMINAR</button>` : ''}
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  function sheetBulk(wd) {
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">Agregar bloque</h3>
      <p class="muted small mt6">${WEEK_LONG[wd]} · genera varios horarios de una vez</p>
      <form data-form="bulk">
        <input type="hidden" name="weekday" value="${wd}">
        <div class="field"><label class="label">Clase</label>
          <select class="input" name="activityId">${adminData.activities.filter((a) => a.active !== false).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div class="formrow">
          <div class="field"><label class="label">Desde</label><input class="input" name="from" type="time" value="06:00" required></div>
          <div class="field"><label class="label">Hasta</label><input class="input" name="to" type="time" value="22:00" required></div>
        </div>
        <div class="formrow">
          <div class="field"><label class="label">Cada (min)</label><input class="input" name="every" type="number" min="15" max="240" step="15" value="60" required></div>
          <div class="field"><label class="label">Cupos</label><input class="input" name="capacity" type="number" min="1" max="200" value="25" required></div>
        </div>
        <button class="btn btn-primary btn-lg mt14" type="submit">GENERAR HORARIOS</button>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  function sheetActivity(id) {
    const a = adminData.activities.find((x) => x.id === id) || { name: '', color: '#E62BAB', durationMin: 60, credits: 1, active: true };
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">${id ? 'Editar clase' : 'Nueva clase'}</h3>
      <form data-form="activity-admin">
        <input type="hidden" name="id" value="${id || ''}">
        <div class="field"><label class="label">Nombre</label><input class="input" name="name" value="${esc(a.name)}" required></div>
        <div class="formrow">
          <div class="field"><label class="label">Duración (min)</label><input class="input" name="durationMin" type="number" min="15" max="180" step="5" value="${a.durationMin}"></div>
          <div class="field"><label class="label">Créditos</label><input class="input" name="credits" type="number" min="0" max="10" value="${a.credits}"></div>
        </div>
        <div class="formrow">
          <div class="field"><label class="label">Color</label><input class="input" name="color" type="color" value="${a.color}" style="padding:4px;height:46px"></div>
          <div class="field"><label class="label">Visible</label>
            <label class="row" style="height:46px;gap:8px"><input type="checkbox" name="active" ${a.active !== false ? 'checked' : ''}> Mostrar en la app</label></div>
        </div>
        <button class="btn btn-primary btn-lg mt14" type="submit">GUARDAR CLASE</button>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  function sheetNewsAdmin(id) {
    const n = adminData.news.find((x) => x.id === id) || { title: '', text: '', image: '', ctaLabel: '', ctaUrl: '', active: true };
    openSheet(`
      <div class="grab"></div>
      <h3 class="display h2">${id ? 'Editar novedad' : 'Nueva novedad'}</h3>
      <form data-form="news-admin">
        <input type="hidden" name="id" value="${id || ''}">
        <div class="field"><label class="label">Título</label><input class="input" name="title" value="${esc(n.title)}" placeholder="Ej: Nueva clase de Zumba" required></div>
        <div class="field"><label class="label">Texto</label><textarea class="input" name="text" rows="3" placeholder="Detalles, horarios, promo...">${esc(n.text)}</textarea></div>
        <div class="formrow">
          <div class="field"><label class="label">Botón (texto)</label><input class="input" name="ctaLabel" value="${esc(n.ctaLabel)}" placeholder="Reservar"></div>
          <div class="field"><label class="label">Botón (link)</label><input class="input" name="ctaUrl" value="${esc(n.ctaUrl)}" placeholder="https://..."></div>
        </div>
        <div class="field"><label class="label">Imagen / flyer</label>
          <input class="input" name="file" type="file" accept="image/*">
          <input type="hidden" name="image" value="${esc(n.image)}">
          ${n.image ? `<img src="${esc(n.image)}" style="width:100%;border-radius:12px;margin-top:8px" alt="">` : ''}
        </div>
        <label class="row" style="gap:8px;margin-top:6px"><input type="checkbox" name="active" ${n.active !== false ? 'checked' : ''}> Publicada</label>
        <button class="btn btn-primary btn-lg mt14" type="submit">GUARDAR NOVEDAD</button>
      </form>
      <button class="btn btn-ghost btn-block mt10" data-action="close-sheet">Cancelar</button>
    `);
  }

  /* ============================================================
     ICS / utilidades
  ============================================================ */
  function calendarUrl(b) {
    const act = activityOf(b.activityId);
    const d = parseD(b.date); const [h, m] = b.time.split(':').map(Number);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    const end = new Date(start.getTime() + act.durationMin * 60000);
    const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${act.name} · ${state.club.name || 'MOOD'}`,
      dates: `${f(start)}/${f(end)}`,
      details: `Código de reserva: ${b.code}`,
      location: state.club.address || 'MOOD Training Club',
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  function fileToDataUrl(file, maxW = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  /* ============================================================
     Render
  ============================================================ */
  function render() {
    const { name, q } = route();
    if (!me() && name !== 'bienvenida') { location.hash = '#/bienvenida'; return; }
    let html = '';
    let active = name;
    switch (name) {
      case 'bienvenida': html = viewWelcome(); break;
      case 'reservar': html = viewBook(q); break;
      case 'turnos': html = viewTurnos(); break;
      case 'rutina': html = viewRoutine(); active = 'reservar'; break;
      case 'perfil': html = viewPerfil(); break;
      case 'abonos': html = viewAbonos(); break;
      case 'admin': html = viewAdmin(); break;
      default: html = viewHome(); active = 'inicio';
    }
    app.innerHTML = html;
    renderNav(active);
    if (name === 'reservar') {
      const on = document.querySelector('.chip.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    window.scrollTo({ top: 0 });
  }

  /* ============================================================
     Eventos
  ============================================================ */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    try {
      if (a === 'close-sheet') return closeSheet();
      if (a === 'go') { closeSheet(); return go(el.dataset.href); }
      if (a === 'retry') { try { await load(); render(); } catch (err) { toast('Sigue sin conexión', 'err'); } return; }
      if (a === 'ask-book') return sheetBook(el.dataset.key);
      if (a === 'do-book') {
        const [date, time, activityId] = el.dataset.key.split('|');
        const slot = state.schedule.find((s) => s.time === time && s.activityId === activityId && s.weekday === parseD(date).getDay());
        if (slot) return book(buildSession(date, slot));
        return;
      }
      if (a === 'ask-cancel') return sheetCancel(el.dataset.id);
      if (a === 'do-cancel') return cancelBooking(el.dataset.id);
      if (a === 'no-cancel') { toast(`No se puede cancelar: cierra ${state.club.cancelMinutes} min antes`, 'err'); return; }
      if (a === 'set-date') { ui.day = el.dataset.date; return go(`#/reservar?d=${el.dataset.date}${currentFilter()}`); }
      if (a === 'set-filter') { const d = ui.bookDate || todayStr(); return go(`#/reservar?d=${d}&a=${el.dataset.filter}`); }
      if (a === 'turnos-tab') { ui.turnosTab = el.dataset.tab; return render(); }
      if (a === 'edit-member') return sheetMember();
      if (a === 'open-routine' || a === 'routine-pick') return sheetRoutinePick();
      if (a === 'routine-remove') {
        ui.routineDraft.splice(Number(el.dataset.idx), 1);
        return render();
      }
      if (a === 'routine-save') { await saveRoutine(ui.routineDraft); return; }
      if (a === 'ask-plan') return sheetPlan(el.dataset.plan);
      if (a === 'pay-plan') return startPayment(el.dataset.plan);
      if (a === 'open-news') return sheetNews(el.dataset.id);
      if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt = null; } return; }
      if (a === 'install-help') return sheetInstallHelp();
      if (a === 'check-pay') { toast('Verificando pago…'); return checkPaymentStatus(true); }
      if (a === 'admin') { ui.adminTab = 'agenda'; adminData = null; return go('#/admin'); }
      if (a === 'admin-tab') { ui.adminTab = el.dataset.tab; return render(); }
      if (a === 'admin-day') { ui.adminDay = el.dataset.date; return render(); }
      if (a === 'admin-exit') { adminData = null; ui.adminTab = 'agenda'; return go('#/perfil'); }
      if (a === 'admin-unbook') {
        if (!confirm('¿Quitar esta reserva?')) return;
        await adminApi('/api/admin/cancel-booking', { method: 'POST', body: JSON.stringify({ id: el.dataset.id }) });
        await loadAdmin(); await refresh(); return;
      }
      if (a === 'add-slot') return sheetSlot(Number(el.dataset.wd));
      if (a === 'edit-slot') {
        const s = adminData.schedule.find((x) => x.id === el.dataset.id);
        return s ? sheetSlot(Number(s.weekday), s) : null;
      }
      if (a === 'del-slot') {
        if (!confirm('¿Eliminar este horario?')) return;
        await adminApi('/api/admin/slot/delete', { method: 'POST', body: JSON.stringify({ id: el.dataset.id }) });
        closeSheet(); await loadAdmin(); await refresh(); toast('Horario eliminado'); return;
      }
      if (a === 'bulk-slot') return sheetBulk(Number(el.dataset.wd));
      if (a === 'add-activity') return sheetActivity('');
      if (a === 'edit-activity') return sheetActivity(el.dataset.id);
      if (a === 'del-activity') {
        if (!confirm('¿Ocultar esta clase? Los horarios se mantienen.')) return;
        await adminApi('/api/admin/activity/delete', { method: 'POST', body: JSON.stringify({ id: el.dataset.id }) });
        await loadAdmin(); await refresh(); return;
      }
      if (a === 'add-news') return sheetNewsAdmin('');
      if (a === 'edit-news') return sheetNewsAdmin(el.dataset.id);
      if (a === 'del-news') {
        if (!confirm('¿Borrar esta novedad?')) return;
        await adminApi('/api/admin/news/delete', { method: 'POST', body: JSON.stringify({ id: el.dataset.id }) });
        await loadAdmin(); await refresh(); return;
      }
      if (a === 'pay-confirm' || a === 'pay-reject') {
        await adminApi('/api/admin/payment', { method: 'POST', body: JSON.stringify({ id: el.dataset.id, action: a === 'pay-confirm' ? 'confirm' : 'reject' }) });
        await loadAdmin(); await refresh(); toast(a === 'pay-confirm' ? 'Pago confirmado' : 'Pago rechazado'); return;
      }
      if (a === 'seed-demo') {
        await adminApi('/api/admin/seed-demo', { method: 'POST', body: '{}' });
        await loadAdmin(); await refresh(); toast('Reservas demo cargadas'); return;
      }
      if (a === 'clear-demo') {
        if (!confirm('¿Borrar las reservas de prueba?')) return;
        await adminApi('/api/admin/clear-demo', { method: 'POST', body: '{}' });
        await loadAdmin(); await refresh(); toast('Demo borrada'); return;
      }
      if (a === 'edit-member-admin') return sheetMemberAdmin(el.dataset.id);
    } catch (err) { toast(err.message || 'Error', 'err'); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-routine]');
    if (!el) return;
    const form = el.closest('form');
    const act = form.querySelector('[name=activityId]').value;
    const wd = form.querySelector('[name=weekday]').value;
    sheetRoutinePick(act, Number(wd));
  });

  function currentFilter() {
    const { q } = route();
    const a = q.get('a');
    return a && a !== 'all' ? `&a=${a}` : '';
  }

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const data = new FormData(f);
    const kind = f.dataset.form;
    try {
      if (kind === 'welcome') {
        const name = String(data.get('name') || '').trim();
        const phone = String(data.get('phone') || '').trim();
        if (name.length < 2) return toast('Poné tu nombre', 'err');
        const r = await api('/api/member', { method: 'POST', body: JSON.stringify({ name, phone }) });
        localStorage.setItem(MEMBER_KEY, r.member.id);
        await load(); location.hash = '#/inicio'; render();
        toast(`¡Bienvenido, ${name.split(' ')[0]}!`);
        return;
      }
      if (kind === 'member') {
        await api('/api/member/update', { method: 'POST', body: JSON.stringify({ memberId: me().id, name: data.get('name'), phone: data.get('phone') }) });
        closeSheet(); await refresh(); toast('Datos guardados'); return;
      }
      if (kind === 'admin-pin') {
        const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ pin: data.get('pin') }) });
        sessionStorage.setItem(ADMIN_KEY, r.token);
        adminData = null; await loadAdmin(); render(); return;
      }
      if (kind === 'routine-add') {
        const item = { id: uid('r'), weekday: Number(data.get('weekday')), time: String(data.get('time')), activityId: String(data.get('activityId')) };
        if (ui.routineDraft.some((x) => x.weekday === item.weekday && x.time === item.time && x.activityId === item.activityId)) {
          toast('Esa clase ya está en tu rutina', 'err'); return;
        }
        ui.routineDraft.push(item);
        closeSheet(); render(); toast('Agregado a tu rutina');
        return;
      }
      if (kind === 'club') {
        await adminApi('/api/admin/club', { method: 'POST', body: JSON.stringify({
          name: data.get('name'), address: data.get('address'), whatsapp: data.get('whatsapp'), instagram: data.get('instagram'),
          cancelMinutes: data.get('cancelMinutes'), adminPin: data.get('adminPin'),
        }) });
        await loadAdmin(); await refresh(); toast('Club actualizado'); return;
      }
      if (kind === 'mp') {
        const payload = { publicUrl: data.get('publicUrl') };
        const token = String(data.get('accessToken') || '').trim();
        if (token) payload.accessToken = token;
        await adminApi('/api/admin/mp', { method: 'POST', body: JSON.stringify(payload) });
        await loadAdmin(); toast('Mercado Pago actualizado'); return;
      }
      if (kind === 'plan') {
        await adminApi('/api/admin/plan', { method: 'POST', body: JSON.stringify({
          id: data.get('id'), price: data.get('price'),
          credits: String(data.get('credits')).trim() === '' ? null : data.get('credits'),
          mpLink: data.get('mpLink'),
        }) });
        await loadAdmin(); await refresh(); toast('Plan actualizado'); return;
      }
      if (kind === 'slot-admin') {
        await adminApi('/api/admin/slot', { method: 'POST', body: JSON.stringify({ slot: {
          id: data.get('id') || undefined, weekday: Number(data.get('weekday')), activityId: data.get('activityId'),
          time: data.get('time'), capacity: data.get('capacity'),
        } }) });
        closeSheet(); await loadAdmin(); await refresh(); toast('Horario guardado'); return;
      }
      if (kind === 'bulk') {
        const r = await adminApi('/api/admin/bulk', { method: 'POST', body: JSON.stringify({
          weekday: Number(data.get('weekday')), activityId: data.get('activityId'),
          from: data.get('from'), to: data.get('to'), every: data.get('every'), capacity: data.get('capacity'),
        }) });
        closeSheet(); await loadAdmin(); await refresh(); toast(`${r.created} horarios creados`); return;
      }
      if (kind === 'activity-admin') {
        await adminApi('/api/admin/activity', { method: 'POST', body: JSON.stringify({ activity: {
          id: data.get('id') || undefined, name: data.get('name'), durationMin: data.get('durationMin'),
          credits: data.get('credits'), color: data.get('color'), active: data.get('active') === 'on',
        } }) });
        closeSheet(); await loadAdmin(); await refresh(); toast('Clase guardada'); return;
      }
      if (kind === 'news-admin') {
        let image = String(data.get('image') || '');
        const file = f.querySelector('input[type=file]').files[0];
        if (file) {
          const dataUrl = await fileToDataUrl(file);
          const up = await adminApi('/api/admin/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
          image = up.url;
        }
        await adminApi('/api/admin/news', { method: 'POST', body: JSON.stringify({ news: {
          id: data.get('id') || undefined, title: data.get('title'), text: data.get('text'),
          ctaLabel: data.get('ctaLabel'), ctaUrl: data.get('ctaUrl'), image,
          active: data.get('active') === 'on', createdAt: Date.now(),
        } }) });
        closeSheet(); await loadAdmin(); await refresh(); toast('Novedad publicada'); return;
      }
      if (kind === 'member-admin') {
        const payload = {
          id: data.get('id'), name: data.get('name'), phone: data.get('phone'),
          planId: data.get('planId'),
        };
        const credits = String(data.get('creditsLeft') || '').trim();
        if (credits !== '') payload.creditsLeft = credits;
        await adminApi('/api/admin/member', { method: 'POST', body: JSON.stringify(payload) });
        closeSheet(); await loadAdmin(); await refresh(); toast('Socio actualizado'); return;
      }
    } catch (err) { toast(err.message || 'Error', 'err'); }
  });

  sheetEl.addEventListener('click', (e) => { if (e.target.classList.contains('ov')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('hashchange', () => render());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    if (route().name === 'perfil') render();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && localStorage.getItem(PAY_KEY)) checkPaymentStatus(); });
  window.addEventListener('focus', () => { if (localStorage.getItem(PAY_KEY)) checkPaymentStatus(); });

  /* ============================================================
     Arranque
  ============================================================ */
  async function boot() {
    try { await load(); }
    catch (e) {
      app.innerHTML = viewOffline(e.message);
      renderNav('bienvenida');
      return;
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (!state.member) location.hash = '#/bienvenida';
    render();
    checkPaymentStatus();
  }

  boot();
})();
