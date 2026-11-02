/**
 * Benchmark rápido de la base SQLite: 1.000 socios y 12.000 reservas.
 *   node tools/bench.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, uid } = require('../lib/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mood-bench-'));
const store = new Store(path.join(dir, 'db.sqlite'));
const pad = (n) => (n < 10 ? '0' : '') + n;
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return dstr(x); };
const today = dstr(new Date());
const schedule = store.schedule();

console.log('Generando 1.000 socios y 12.000 reservas…');
const members = [];
let t = Date.now();
store.tx(() => {
  for (let i = 1; i <= 1000; i++) {
    members.push(store.insertMember({
      id: uid('m'), name: `Socio ${i}`, phone: `2604${String(i).padStart(6, '0')}`,
      planId: i % 7 === 0 ? 'gold' : 'medium', creditsLeft: i % 7 === 0 ? null : 12, createdAt: Date.now(),
    }));
  }
  for (let i = 0; i < 12000; i++) {
    const m = members[i % members.length];
    const slot = schedule[i % schedule.length];
    store.insertBooking({
      id: uid('b'), code: 'MD' + String(i).padStart(5, '0'), memberId: m.id, name: m.name,
      date: addDays(today, i % 30), time: slot.time, activityId: slot.activityId,
      status: i % 20 === 0 ? 'cancelled' : 'active', creditsUsed: 1, createdAt: Date.now(),
    });
  }
});
console.log(`Inserción: ${Date.now() - t} ms`);

const bench = (label, fn) => {
  const a = process.hrtime.bigint();
  let r;
  for (let i = 0; i < 100; i++) r = fn();
  const ms = Number(process.hrtime.bigint() - a) / 1e6 / 100;
  console.log(`${label}: ${ms.toFixed(3)} ms`);
  return r;
};

bench('buscar socio por teléfono', () => store.memberByPhone('2604000500'));
bench('reservas de un socio', () => store.memberBookings(members[10].id, addDays(today, -60)));
bench('cupo de un horario', () => store.activeCount(addDays(today, 1), schedule[8].time, schedule[8].activityId));
bench('conteos 35 días', () => store.countsRange(today, addDays(today, 35)));
bench('agenda admin 42 días', () => store.bookingsRange(addDays(today, -7), addDays(today, 35)));
const c = store.countsRange(today, addDays(today, 35));
console.log(`Filas de conteo: ${Object.keys(c).length} · reservas totales: ${store.one('SELECT COUNT(*) n FROM bookings').n}`);
store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log(`Tamaño DB: ${(fs.statSync(path.join(dir, 'db.sqlite')).size / 1024 / 1024).toFixed(1)} MB`);
store.close();
fs.rmSync(dir, { recursive: true, force: true });
