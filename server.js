/**
 * MOOD · Training Club — servidor sin dependencias + SQLite.
 *
 *   node server.js                 -> http://localhost:4400
 *   PORT=8080 node server.js
 *   MOOD_DATA=/ruta/data node server.js
 *
 * Base: data/db.sqlite (WAL). Migra sola desde data/db.json si existe.
 * Node 22.5+ (recomendado Node 24) por node:sqlite.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store, uid, pad, minutes, hhmm } = require('./lib/store');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'web');
const DATA = process.env.MOOD_DATA ? path.resolve(process.env.MOOD_DATA) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.sqlite');
const PORT = Number(process.env.PORT || 4400);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

fs.mkdirSync(UPLOADS, { recursive: true });
const store = new Store(DB_FILE);

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const dstr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
const todayStr = () => dstr(new Date());
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const nowHHMM = () => hhmm(nowMin());
const iso = () => new Date().toISOString();
const clean = (s, n = 200) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const phoneKey = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const money = (n) => Number(n) || 0;
const code = () => 'MD' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);

const planOf = (id) => store.plan(id);
const memberOf = (id) => store.member(id);
const actOf = (id) => store.activity(id) || { id, name: 'Clase', durationMin: 60, color: '#CCC', credits: 1 };
const isPast = (date, time) => (date < todayStr()) || (date === todayStr() && minutes(time) <= nowMin());

/* Reservas de ejemplo para demos (no se guardan como socios reales). */
function demoBookings() {
  const names = ['Sofía R.', 'Martín', 'Cami', 'Nico', 'Lu', 'Agus', 'Fran', 'Meli', 'Tomi', 'Juli', 'Vale', 'Fede'];
  const schedule = store.schedule();
  const out = [];
  let k = 0;
  for (let i = 0; i < 6; i++) {
    const date = addDays(todayStr(), i);
    const wd = parseD(date).getDay();
    const slots = schedule.filter((s) => s.weekday === wd);
    const step = Math.max(1, Math.ceil(slots.length / 5));
    for (const slot of slots.filter((_, idx) => idx % step === 0).slice(0, 5)) {
      const count = 1 + ((i * 5 + slot.time.charCodeAt(0)) % 6);
      for (let j = 0; j < count; j++) {
        out.push({
          id: uid('b'), code: code(), memberId: 'demo', name: names[k++ % names.length],
          date, time: slot.time, activityId: slot.activityId, status: 'active',
          creditsUsed: 0, demo: true, createdAt: Date.now(),
        });
      }
    }
  }
  return out;
}

function creditsOf(m) {
  const p = planOf(m.planId);
  if (!p) return 0;
  if (p.credits == null) return Infinity;
  return m.creditsLeft == null ? p.credits : m.creditsLeft;
}

function grantPlan(member, planId) {
  const p = planOf(planId);
  if (!p) return null;
  return store.updateMember(member.id, { planId: p.id, creditsLeft: p.credits == null ? null : p.credits });
}

function overlaps(memberId, date, time, activityId) {
  const act = actOf(activityId);
  const s = minutes(time), e = s + Number(act.durationMin || 60);
  return store.memberBookingsOn(memberId, date).some((b) => {
    if (b.status !== 'active') return false;
    const bs = minutes(b.time), be = bs + Number(actOf(b.activityId).durationMin || 60);
    return s < be && bs < e;
  });
}

function createBooking(member, date, time, activityId, opts = {}) {
  const slot = store.findSlot(parseD(date).getDay(), time, activityId);
  if (!slot) return { error: 'Ese horario no existe' };
  if (isPast(date, time)) return { error: 'Ese turno ya pasó' };
  if (store.activeCount(date, time, activityId) >= slot.capacity) return { error: 'No quedan lugares' };
  if (overlaps(member.id, date, time, activityId)) return { error: 'Se superpone con otro turno' };
  const act = actOf(activityId);
  const cost = Number(act.credits == null ? 1 : act.credits);
  const left = creditsOf(member);
  if (left < cost) return { error: 'Sin créditos suficientes', noCredits: true };
  const p = planOf(member.planId);
  if (p && p.credits != null && !opts.noCredits) {
    member = store.updateMember(member.id, { creditsLeft: Math.max(0, left - cost) });
  }
  const b = store.insertBooking({
    id: uid('b'), code: code(), memberId: member.id, name: member.name, date, time, activityId,
    status: 'active', creditsUsed: opts.noCredits ? 0 : cost, routineId: opts.routineId || null,
    demo: !!opts.demo, createdAt: Date.now(),
  });
  return { booking: b, member };
}

function cancelBooking(b, { byAdmin = false, quiet = false } = {}) {
  if (!b || b.status !== 'active') return { error: 'El turno no existe' };
  if (!byAdmin) {
    const club = store.getClub();
    const start = parseD(b.date); const [h, m] = b.time.split(':').map(Number);
    start.setHours(h, m, 0, 0);
    if (Date.now() > start.getTime() - Number(club.cancelMinutes || 0) * 60000) {
      return { error: `No se puede cancelar: faltan menos de ${club.cancelMinutes} minutos` };
    }
  }
  b.status = 'cancelled';
  b.cancelledAt = Date.now();
  b.cancelledBy = byAdmin ? 'admin' : 'member';
  store.updateBooking(b);
  if (!quiet) {
    const m = memberOf(b.memberId);
    const p = m && planOf(m.planId);
    if (m && p && p.credits != null && b.creditsUsed) {
      store.updateMember(m.id, { creditsLeft: Math.min(p.credits, (m.creditsLeft == null ? p.credits : m.creditsLeft) + b.creditsUsed) });
    }
  }
  return { ok: true };
}

function occurrences(item, days = 14) {
  const out = [];
  const today = todayStr();
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    if (parseD(d).getDay() !== Number(item.weekday)) continue;
    if (d === today && minutes(item.time) <= nowMin()) continue;
    out.push(d);
  }
  return out;
}

function syncRoutine(member) {
  const r = store.routine(member.id);
  const keep = new Set();
  for (const item of r.items) for (const date of occurrences(item)) keep.add(`${date}|${item.time}|${item.activityId}`);
  let created = 0, creditsUsed = 0, skipped = 0;

  for (const b of store.routineFuture(member.id, todayStr())) {
    if (!keep.has(`${b.date}|${b.time}|${b.activityId}`)) cancelBooking(b);
  }
  for (const item of r.items) {
    for (const date of occurrences(item)) {
      if (store.activeAt(member.id, date, item.time, item.activityId)) continue;
      const res = createBooking(member, date, item.time, item.activityId, { routineId: item.id });
      if (res.error) { skipped++; continue; }
      if (res.member) member = res.member;
      created++; creditsUsed += res.booking.creditsUsed;
    }
  }
  return { created, creditsUsed, skipped, creditsLeft: creditsOf(member) };
}

let lastMaintain = 0;
function maintainRoutines() {
  if (Date.now() - lastMaintain < 5 * 60e3) return;
  lastMaintain = Date.now();
  for (const r of store.routines()) {
    if (!r.items || !r.items.length) continue;
    const m = memberOf(r.memberId);
    if (m) { try { syncRoutine(m); } catch (_) {} }
  }
}

/* ------------------------------------------------------------------ */
/* Mercado Pago                                                        */
/* ------------------------------------------------------------------ */
function baseUrl(req) {
  const mp = store.getMp();
  return (mp.publicUrl || PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`).replace(/\/+$/, '');
}

async function mpFetch(pathname, opts = {}) {
  const token = store.getMp().accessToken || process.env.MP_ACCESS_TOKEN || '';
  if (!token) throw new Error('Mercado Pago no está configurado');
  const res = await fetch('https://api.mercadopago.com' + pathname, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  if (!res.ok) throw new Error(data.message || data.error || `MP ${res.status}`);
  return data;
}

async function mpPreference(payment, req) {
  const plan = planOf(payment.planId);
  const member = memberOf(payment.memberId);
  const base = baseUrl(req);
  const pref = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        id: plan.id, title: `MOOD · Abono ${plan.name}`,
        description: plan.credits == null ? 'Clases ilimitadas' : `${plan.credits} créditos`,
        quantity: 1, currency_id: 'ARS', unit_price: money(plan.price),
      }],
      payer: {
        name: member ? member.name : '',
        ...(member && member.phone ? { phone: { number: String(member.phone).replace(/\D/g, '') } } : {}),
      },
      external_reference: payment.id,
      notification_url: `${base}/api/mp/webhook`,
      back_urls: {
        success: `${base}/?pago=${payment.id}#/abonos`,
        failure: `${base}/?pago=${payment.id}#/abonos`,
        pending: `${base}/?pago=${payment.id}#/abonos`,
      },
      auto_return: 'approved',
      statement_descriptor: 'MOOD TRAINING CLUB',
    }),
  });
  payment.preferenceId = pref.id;
  payment.initPoint = pref.init_point;
  store.updatePayment(payment);
  return pref;
}

async function mpSyncPayment(payment) {
  let p = null;
  if (payment.mpPaymentId) {
    p = await mpFetch(`/v1/payments/${payment.mpPaymentId}`);
  } else {
    const found = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(payment.id)}`);
    p = found.results && found.results[0];
  }
  if (!p) return payment;
  payment.mpPaymentId = p.id;
  payment.status = p.status === 'approved' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending';
  payment.statusDetail = p.status_detail;
  if (payment.status === 'approved' && !payment.approvedAt) {
    payment.approvedAt = Date.now();
    const m = memberOf(payment.memberId);
    if (m) grantPlan(m, payment.planId);
  }
  store.updatePayment(payment);
  return payment;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.sqlite': 'application/octet-stream',
};

const tokens = new Map();
const loginFails = new Map(); // ip -> { n, until }
function loginThrottle(ip) {
  const now = Date.now();
  const rec = loginFails.get(ip);
  if (rec && rec.until > now && rec.n >= 8) return Math.ceil((rec.until - now) / 1000);
  return 0;
}
function loginFail(ip) {
  const now = Date.now();
  const rec = loginFails.get(ip) || { n: 0, until: 0 };
  if (rec.until < now) { rec.n = 0; rec.until = now + 10 * 60e3; }
  rec.n++;
  loginFails.set(ip, rec);
}
function adminAuth(req) {
  const t = req.headers['x-admin-token'];
  const exp = t && tokens.get(t);
  return !!(exp && exp > Date.now());
}

function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function publicState(memberId) {
  const today = todayStr();
  const m = memberOf(memberId);
  const club = store.getClub();
  const mp = store.getMp();
  return {
    serverTime: Date.now(),
    club: {
      name: club.name, sub: club.sub, address: club.address,
      whatsapp: club.whatsapp, instagram: club.instagram, cancelMinutes: club.cancelMinutes,
    },
    plans: store.plans(),
    activities: store.activities().filter((a) => a.active !== false),
    schedule: store.schedule(),
    news: store.news().filter((n) => n.active !== false),
    member: m ? { id: m.id, name: m.name, phone: m.phone, planId: m.planId, creditsLeft: m.creditsLeft } : null,
    bookings: m ? store.memberBookings(m.id, addDays(today, -60)).map((b) => ({ ...b, member: 'me' })) : [],
    routine: m ? store.routine(m.id) : { items: [] },
    counts: store.countsRange(today, addDays(today, 35)),
    payments: m ? store.paymentsForMember(m.id, 12).map((p) => ({ id: p.id, planId: p.planId, amount: p.amount, status: p.status, createdAt: p.createdAt })) : [],
    mpEnabled: !!(mp.accessToken || process.env.MP_ACCESS_TOKEN),
  };
}

function adminState() {
  const today = todayStr();
  const club = store.getClub();
  const mp = store.getMp();
  const upcoming = store.upcomingCounts(today, nowHHMM());
  return {
    serverTime: Date.now(),
    club,
    plans: store.plans(),
    activities: store.activities(),
    schedule: store.schedule(),
    members: store.members().map((m) => ({ ...m, upcoming: upcoming[m.id] || 0 })),
    bookings: store.bookingsRange(addDays(today, -7), addDays(today, 35)),
    routines: store.routines(),
    payments: store.recentPayments(80),
    news: store.news(),
    mp: { enabled: !!(mp.accessToken || process.env.MP_ACCESS_TOKEN), publicUrl: mp.publicUrl, hasToken: !!mp.accessToken },
  };
}

async function handleApi(req, res, u) {
  const p = u.pathname;

  if (p === '/api/state' && req.method === 'GET') {
    maintainRoutines();
    return send(res, 200, publicState(u.searchParams.get('member') || ''));
  }

  if (p === '/api/member' && req.method === 'POST') {
    const b = await readBody(req);
    const name = clean(b.name, 80);
    const phone = clean(b.phone, 30);
    if (name.length < 2) return send(res, 400, { error: 'Poné tu nombre' });
    const key = phoneKey(phone);
    let m = key ? store.memberByPhone(key) : null;
    if (!m) {
      const club = store.getClub();
      const plan = planOf(club.defaultPlanId);
      m = store.insertMember({
        id: uid('m'), name, phone, planId: club.defaultPlanId || null,
        creditsLeft: plan && plan.credits != null ? 0 : null, createdAt: Date.now(),
      });
    } else if (name && name !== m.name) {
      m = store.updateMember(m.id, { name });
    }
    return send(res, 200, { member: { id: m.id, name: m.name, phone: m.phone, planId: m.planId, creditsLeft: m.creditsLeft } });
  }

  if (p === '/api/member/update' && req.method === 'POST') {
    const b = await readBody(req);
    const m = memberOf(b.memberId);
    if (!m) return send(res, 404, { error: 'Socio no encontrado' });
    const patch = {};
    if (b.name) patch.name = clean(b.name, 80);
    if (b.phone) patch.phone = clean(b.phone, 30);
    const out = store.updateMember(m.id, patch);
    return send(res, 200, { member: out });
  }

  if (p === '/api/book' && req.method === 'POST') {
    const b = await readBody(req);
    const m = memberOf(b.memberId);
    if (!m) return send(res, 404, { error: 'Socio no encontrado' });
    const r = createBooking(m, clean(b.date, 10), clean(b.time, 5), clean(b.activityId, 40));
    if (r.error) return send(res, 409, r);
    return send(res, 200, { booking: r.booking, creditsLeft: creditsOf(r.member || m) });
  }

  if (p === '/api/cancel' && req.method === 'POST') {
    const b = await readBody(req);
    const bk = store.booking(b.bookingId);
    if (!bk || bk.memberId !== b.memberId) return send(res, 404, { error: 'Turno no encontrado' });
    const r = cancelBooking(bk);
    if (r.error) return send(res, 409, r);
    const m = memberOf(b.memberId);
    return send(res, 200, { ok: true, creditsLeft: m ? creditsOf(m) : 0 });
  }

  if (p === '/api/routine' && req.method === 'POST') {
    const b = await readBody(req);
    const m = memberOf(b.memberId);
    if (!m) return send(res, 404, { error: 'Socio no encontrado' });
    const items = (Array.isArray(b.items) ? b.items : []).map((it) => ({
      id: it.id || uid('r'), weekday: Number(it.weekday), time: clean(it.time, 5), activityId: clean(it.activityId, 40),
    })).filter((it) => Number.isFinite(it.weekday) && it.activityId && it.time);
    store.setRoutine(m.id, items);
    const out = syncRoutine(m);
    return send(res, 200, { ...out, items, creditsLeft: creditsOf(memberOf(m.id) || m) });
  }

  if (p === '/api/pay/start' && req.method === 'POST') {
    const b = await readBody(req);
    const m = memberOf(b.memberId);
    const plan = planOf(b.planId);
    if (!m || !plan) return send(res, 404, { error: 'Datos inválidos' });
    const mp = store.getMp();
    const mpReady = !!(mp.accessToken || process.env.MP_ACCESS_TOKEN);
    const pay = {
      id: uid('p'), memberId: m.id, memberName: m.name, planId: plan.id, planName: plan.name,
      amount: money(plan.price), status: 'pending',
      provider: mpReady ? 'mp' : (plan.mpLink ? 'link' : 'manual'), createdAt: Date.now(),
    };
    store.insertPayment(pay);
    if (mpReady) {
      try {
        const pref = await mpPreference(pay, req);
        return send(res, 200, { type: 'mp', paymentId: pay.id, url: pref.init_point, sandbox: pref.sandbox_init_point });
      } catch (e) {
        if (plan.mpLink) {
          pay.provider = 'link'; store.updatePayment(pay);
          return send(res, 200, { type: 'link', paymentId: pay.id, url: plan.mpLink });
        }
        return send(res, 200, { type: 'manual', paymentId: pay.id, message: 'El club confirmará tu pago' });
      }
    }
    if (plan.mpLink) return send(res, 200, { type: 'link', paymentId: pay.id, url: plan.mpLink });
    return send(res, 200, { type: 'manual', paymentId: pay.id, message: 'El club confirmará tu pago' });
  }

  if (p === '/api/pay/status' && req.method === 'GET') {
    const pay = store.payment(u.searchParams.get('ref'));
    if (!pay) return send(res, 404, { error: 'Pago no encontrado' });
    if (pay.provider === 'mp' && !pay.approvedAt) {
      try { await mpSyncPayment(pay); } catch (_) {}
    }
    return send(res, 200, { status: pay.status, planId: pay.planId, paymentId: pay.id });
  }

  if (p === '/api/mp/webhook' && (req.method === 'POST' || req.method === 'GET')) {
    const q = u.searchParams;
    let paymentId = q.get('data.id') || q.get('id');
    let type = q.get('type') || q.get('topic');
    if (req.method === 'POST') {
      try {
        const b = await readBody(req);
        paymentId = (b.data && b.data.id) || paymentId;
        type = b.type || type;
      } catch (_) {}
    }
    if (paymentId && (!type || String(type).includes('payment'))) {
      try {
        const mp = await mpFetch(`/v1/payments/${paymentId}`);
        const pay = store.payment(mp.external_reference);
        if (pay) {
          pay.mpPaymentId = mp.id;
          pay.status = mp.status === 'approved' ? 'approved' : mp.status === 'rejected' ? 'rejected' : 'pending';
          pay.statusDetail = mp.status_detail;
          if (pay.status === 'approved' && !pay.approvedAt) {
            pay.approvedAt = Date.now();
            const m = memberOf(pay.memberId);
            if (m) grantPlan(m, pay.planId);
          }
          store.updatePayment(pay);
        }
      } catch (_) {}
    }
    return send(res, 200, { ok: true });
  }

  /* ---------------- admin ---------------- */
  if (p === '/api/admin/login' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
    const wait = loginThrottle(ip);
    if (wait) return send(res, 429, { error: `Demasiados intentos. Probá en ${wait} s.` });
    const b = await readBody(req);
    if (String(b.pin) !== String(store.getClub().adminPin)) {
      loginFail(ip);
      return send(res, 401, { error: 'PIN incorrecto' });
    }
    loginFails.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + 12 * 3600e3);
    return send(res, 200, { token });
  }

  if (p.startsWith('/api/admin/') && !adminAuth(req)) return send(res, 401, { error: 'Sesión vencida' });

  if (p === '/api/admin/state' && req.method === 'GET') return send(res, 200, adminState());

  if (p === '/api/admin/club' && req.method === 'POST') {
    const b = await readBody(req);
    const patch = {};
    for (const k of ['name', 'sub', 'address', 'whatsapp', 'instagram']) if (k in b) patch[k] = clean(b[k], 120);
    if ('cancelMinutes' in b) patch.cancelMinutes = Math.max(0, Math.min(1440, Number(b.cancelMinutes) || 0));
    if ('defaultPlanId' in b) patch.defaultPlanId = clean(b.defaultPlanId, 20);
    if (b.adminPin && /^\d{4,6}$/.test(String(b.adminPin))) patch.adminPin = String(b.adminPin);
    const club = store.updateClub(patch);
    return send(res, 200, { club });
  }

  if (p === '/api/admin/activity' && req.method === 'POST') {
    const b = await readBody(req);
    const a = b.activity || {};
    if (!a.id) a.id = clean(a.name, 30).toLowerCase().replace(/[^a-z0-9]+/g, '') || uid('a');
    const val = store.upsertActivity({
      id: a.id, name: clean(a.name, 40) || 'Clase',
      color: /^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : '#E62BAB',
      durationMin: Math.max(15, Math.min(180, Number(a.durationMin) || 60)),
      credits: Math.max(0, Math.min(10, Number(a.credits == null ? 1 : a.credits))),
      active: a.active !== false,
    });
    return send(res, 200, { activity: val });
  }

  if (p === '/api/admin/activity/delete' && req.method === 'POST') {
    const b = await readBody(req);
    const a = store.activity(b.id);
    if (a) store.upsertActivity({ ...a, active: false });
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/slot' && req.method === 'POST') {
    const b = await readBody(req);
    const s = b.slot || {};
    const wd = Number(s.weekday), time = clean(s.time, 5), activityId = clean(s.activityId, 40);
    if (!Number.isFinite(wd) || wd < 0 || wd > 6 || !/^\d\d:\d\d$/.test(time) || !activityId) {
      return send(res, 400, { error: 'Datos del horario inválidos' });
    }
    return send(res, 200, { slot: store.upsertSlot({ id: s.id, weekday: wd, time, activityId, capacity: s.capacity }) });
  }

  if (p === '/api/admin/slot/delete' && req.method === 'POST') {
    const b = await readBody(req);
    store.removeSlot(b.id);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/bulk' && req.method === 'POST') {
    const b = await readBody(req);
    const wd = Number(b.weekday), activityId = clean(b.activityId, 40);
    const from = minutes(b.from), to = minutes(b.to), every = Math.max(15, Number(b.every) || 60);
    const cap = Math.max(1, Math.min(200, Number(b.capacity) || 25));
    if (!Number.isFinite(wd) || !activityId || !(to > from)) return send(res, 400, { error: 'Rango inválido' });
    const created = store.bulkSlots(wd, activityId, from, to, every, cap);
    return send(res, 200, { created });
  }

  if (p === '/api/admin/plan' && req.method === 'POST') {
    const b = await readBody(req);
    const patch = {};
    if ('price' in b) patch.price = Math.max(0, money(b.price));
    if ('mpLink' in b) patch.mpLink = clean(b.mpLink, 300);
    if ('credits' in b) patch.credits = b.credits === '' || b.credits == null ? null : Math.max(1, Number(b.credits));
    const plan = store.updatePlan(b.id, patch);
    if (!plan) return send(res, 404, { error: 'Plan no encontrado' });
    return send(res, 200, { plan });
  }

  if (p === '/api/admin/news' && req.method === 'POST') {
    const b = await readBody(req);
    const n = b.news || {};
    if (!n.title && !n.image) return send(res, 400, { error: 'Falta título o imagen' });
    const val = {
      id: n.id || uid('n'), title: clean(n.title, 90), text: clean(n.text, 600),
      image: clean(n.image, 400), ctaLabel: clean(n.ctaLabel, 40), ctaUrl: clean(n.ctaUrl, 400),
      active: n.active !== false, createdAt: n.createdAt || Date.now(),
    };
    store.upsertNews(val);
    return send(res, 200, { news: val });
  }

  if (p === '/api/admin/news/delete' && req.method === 'POST') {
    const b = await readBody(req);
    store.removeNews(b.id);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/upload' && req.method === 'POST') {
    const b = await readBody(req);
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(b.dataUrl || ''));
    if (!m) return send(res, 400, { error: 'Imagen inválida' });
    const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return send(res, 413, { error: 'Imagen muy grande' });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return send(res, 200, { url: `/uploads/${name}` });
  }

  if (p === '/api/admin/member' && req.method === 'POST') {
    const b = await readBody(req);
    let m = memberOf(b.id);
    if (!m) return send(res, 404, { error: 'Socio no encontrado' });
    if (b.planId && planOf(b.planId)) m = grantPlan(m, b.planId) || m;
    const patch = {};
    if (b.name) patch.name = clean(b.name, 80);
    if (b.phone) patch.phone = clean(b.phone, 30);
    if ('creditsLeft' in b && b.creditsLeft !== '' && b.creditsLeft != null) {
      const plan = planOf(m.planId);
      patch.creditsLeft = plan && plan.credits != null ? Math.max(0, Math.min(plan.credits, Number(b.creditsLeft) || 0)) : null;
    }
    if (Object.keys(patch).length) m = store.updateMember(m.id, patch) || m;
    return send(res, 200, { member: m });
  }

  if (p === '/api/admin/cancel-booking' && req.method === 'POST') {
    const b = await readBody(req);
    const bk = store.booking(b.id);
    const r = cancelBooking(bk, { byAdmin: true });
    if (r.error) return send(res, 409, r);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/payment' && req.method === 'POST') {
    const b = await readBody(req);
    const pay = store.payment(b.id);
    if (!pay) return send(res, 404, { error: 'Pago no encontrado' });
    if (b.action === 'confirm') {
      pay.status = 'approved'; pay.approvedAt = Date.now(); pay.confirmedBy = 'admin';
      const m = memberOf(pay.memberId); if (m) grantPlan(m, pay.planId);
    } else if (b.action === 'reject') {
      pay.status = 'rejected';
    }
    store.updatePayment(pay);
    return send(res, 200, { payment: pay });
  }

  if (p === '/api/admin/mp' && req.method === 'POST') {
    const b = await readBody(req);
    const patch = {};
    if ('accessToken' in b) patch.accessToken = clean(b.accessToken, 400);
    if ('publicUrl' in b) patch.publicUrl = clean(b.publicUrl, 300).replace(/\/+$/, '');
    store.updateMp(patch);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/seed-demo' && req.method === 'POST') {
    const out = demoBookings();
    store.seedDemo(out);
    return send(res, 200, { created: out.length });
  }

  if (p === '/api/admin/clear-demo' && req.method === 'POST') {
    store.clearDemo();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'API no encontrada' });
}

/* Demo pública (Render): si la base está vacía, carga reservas de ejemplo al arrancar. */
if (process.env.MOOD_DEMO === '1') {
  try {
    const from = todayStr();
    const upcoming = store.bookingsRange(from, addDays(from, 14)).filter((b) => b.status === 'active');
    if (!upcoming.length) {
      const created = demoBookings();
      store.seedDemo(created);
      console.log(`Demo: ${created.length} reservas de ejemplo`);
    }
  } catch (e) {
    console.error('Demo seed:', e.message);
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (u.pathname.startsWith('/api/')) return await handleApi(req, res, u);

    if (u.pathname.startsWith('/uploads/')) {
      const file = path.join(UPLOADS, path.basename(u.pathname));
      return fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('No encontrado'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
        res.end(data);
      });
    }

    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.join(WEB, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('Prohibido'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Service-Worker-Allowed': '/',
      });
      res.end(data);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || 'Error interno' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MOOD Training Club en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
  const mp = store.getMp();
  if (mp.publicUrl) console.log(`URL pública: ${mp.publicUrl}`);
});
