/**
 * Tests de la API de MOOD (server sin dependencias).
 * Levanta un servidor aparte con datos temporales y prueba los flujos principales.
 *
 *   node tools/test-api.js
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4499;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mood-test-'));
let ok = 0, fail = 0;
const results = [];

function check(name, cond, extra) {
  if (cond) { ok++; results.push(`  ok  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}${extra ? ' -> ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
}

async function req(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

const pad = (n) => (n < 10 ? '0' : '') + n;
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return dstr(x); };
const today = () => dstr(new Date());

(async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', MOOD_DATA: DATA },
    stdio: 'ignore',
  });

  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { const r = await fetch(BASE + '/api/state'); up = r.ok; } catch (_) { await new Promise((r) => setTimeout(r, 200)); }
    }
    if (!up) throw new Error('el servidor no arrancó');

    /* --- estado público --- */
    let r = await req('GET', '/api/state');
    check('GET /api/state', r.status === 200);
    check('7 actividades', r.data.activities.length === 7, r.data.activities.length);
    check('agenda con horarios', r.data.schedule.length > 20, r.data.schedule.length);
    check('5 planes', r.data.plans.length === 5);
    check('sin socio', r.data.member === null);

    /* --- admin login --- */
    r = await req('POST', '/api/admin/login', { pin: '0000' });
    check('PIN incorrecto rechazado', r.status === 401);
    r = await req('POST', '/api/admin/login', { pin: '1234' });
    check('PIN correcto', r.status === 200 && !!r.data.token);
    const token = r.data.token;

    /* --- socio --- */
    r = await req('POST', '/api/member', { name: 'Test Socio', phone: '260 400 1234' });
    check('crear socio', r.status === 200 && r.data.member.id);
    const memberId = r.data.member.id;
    check('plan por defecto', r.data.member.planId === 'small', r.data.member);
    check('sin créditos al inicio', (r.data.member.creditsLeft || 0) === 0, r.data.member.creditsLeft);

    /* elegir un horario futuro (pasado mañana) */
    r = await req('GET', `/api/state?member=${memberId}`);
    const st = r.data;
    const d2 = addDays(new Date(), 2);
    const wd2 = new Date(d2 + 'T12:00:00').getDay();
    const slot = st.schedule.find((s) => Number(s.weekday) === wd2);
    check('hay horario para la fecha de prueba', !!slot, { d2, wd2 });

    r = await req('POST', '/api/book', { memberId, date: d2, time: slot.time, activityId: slot.activityId });
    check('no deja reservar sin créditos', r.status === 409 && r.data.noCredits, r.data);

    /* admin asigna GOLD */
    r = await req('POST', '/api/admin/member', { id: memberId, planId: 'gold' }, token);
    check('admin asigna GOLD', r.status === 200 && r.data.member.planId === 'gold');

    r = await req('POST', '/api/book', { memberId, date: d2, time: slot.time, activityId: slot.activityId });
    check('reserva con GOLD', r.status === 200 && r.data.booking.code, r.data);
    const bookingId = r.data.booking.id;

    r = await req('POST', '/api/book', { memberId, date: d2, time: slot.time, activityId: slot.activityId });
    check('no duplica la reserva', r.status === 409);

    /* cupo en el estado público */
    r = await req('GET', `/api/state?member=${memberId}`);
    check('el cupo refleja la reserva', r.data.counts[`${d2}|${slot.time}|${slot.activityId}`] === 1, r.data.counts);

    /* cancelación normal */
    r = await req('POST', '/api/cancel', { memberId, bookingId });
    check('cancela con anticipación', r.status === 200, r.data);

    /* ventana de cancelación */
    await req('POST', '/api/admin/club', { cancelMinutes: 1440 }, token);
    const tomorrow = addDays(new Date(), 1);
    const wd1 = new Date(tomorrow + 'T12:00:00').getDay();
    const slot1 = st.schedule.filter((s) => Number(s.weekday) === wd1)[0];
    if (slot1) {
      r = await req('POST', '/api/book', { memberId, date: tomorrow, time: slot1.time, activityId: slot1.activityId });
      const id2 = r.data.booking && r.data.booking.id;
      r = await req('POST', '/api/cancel', { memberId, bookingId: id2 });
      check('bloquea cancelación dentro de la ventana', r.status === 409, r.data);
      if (id2) await req('POST', '/api/admin/cancel-booking', { id: id2 }, token);
    } else {
      check('bloquea cancelación dentro de la ventana', false, 'sin horario mañana');
    }
    await req('POST', '/api/admin/club', { cancelMinutes: 30 }, token);

    /* rutina */
    const wd3 = new Date(addDays(new Date(), 3) + 'T12:00:00').getDay();
    const slot3 = st.schedule.find((s) => Number(s.weekday) === wd3);
    r = await req('POST', '/api/routine', { memberId, items: [{ weekday: wd3, time: slot3.time, activityId: slot3.activityId }] });
    check('crea rutina', r.status === 200 && r.data.items.length === 1, r.data);
    check('reserva turnos de rutina', r.data.created >= 1, r.data.created);

    r = await req('GET', `/api/state?member=${memberId}`);
    check('la rutina aparece en el estado', r.data.routine.items.length === 1);
    check('los turnos tienen routineId', r.data.bookings.some((b) => b.routineId), r.data.bookings.slice(0, 2));

    /* novedades + upload */
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    r = await req('POST', '/api/admin/upload', { dataUrl: tinyPng }, token);
    check('sube imagen', r.status === 200 && /^\/uploads\//.test(r.data.url), r.data);
    r = await req('POST', '/api/admin/news', { news: { title: 'Clase nueva', text: 'Zumba los sábados', image: r.data.url, active: true } }, token);
    check('publica novedad', r.status === 200);
    r = await req('GET', '/api/state');
    check('la novedad llega a la app', r.data.news.length === 1 && r.data.news[0].title === 'Clase nueva');

    /* planes + pago manual */
    r = await req('POST', '/api/admin/plan', { id: 'small', price: 47000, mpLink: 'https://mpago.la/test' }, token);
    check('edita plan', r.status === 200 && r.data.plan.price === 47000);
    r = await req('POST', '/api/pay/start', { memberId, planId: 'small' });
    check('inicia pago con link', r.status === 200 && r.data.type === 'link', r.data);
    const payId = r.data.paymentId;
    r = await req('POST', '/api/admin/payment', { id: payId, action: 'confirm' }, token);
    check('admin confirma pago', r.status === 200 && r.data.payment.status === 'approved');
    r = await req('GET', `/api/state?member=${memberId}`);
    check('activa el abono al confirmar', r.data.member.planId === 'small' && r.data.member.creditsLeft === 8, r.data.member);

    /* horarios: bloque y edición */
    r = await req('POST', '/api/admin/bulk', { weekday: 0, activityId: 'zumba', from: '10:00', to: '12:00', every: 60, capacity: 15 }, token);
    check('genera bloque de horarios', r.status === 200 && r.data.created === 2, r.data);
    r = await req('GET', '/api/admin/state', null, token);
    check('admin ve los socios', r.data.members.length === 1);
    check('admin ve los pagos', r.data.payments.length === 1);

    /* clase nueva */
    r = await req('POST', '/api/admin/activity', { activity: { id: 'test', name: 'Test Class', color: '#123456', durationMin: 45, credits: 1, active: true } }, token);
    check('crea clase', r.status === 200 && r.data.activity.id === 'test');
    r = await req('POST', '/api/admin/activity/delete', { id: 'test' }, token);
    check('oculta clase', r.status === 200);

    /* persistencia sin token */
    r = await req('GET', '/api/admin/state');
    check('admin sin token da 401', r.status === 401);
  } catch (e) {
    fail++;
    results.push('FAIL  excepción: ' + e.message);
  } finally {
    child.kill();
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(results.join('\n'));
  console.log(`\n${ok} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
