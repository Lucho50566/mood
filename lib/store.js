/**
 * MOOD · Training Club — capa de datos SQLite (node:sqlite, sin dependencias).
 *
 * - WAL + synchronous NORMAL: rápido y seguro para un club con miles de cuentas.
 * - Migra automáticamente desde data/db.json si la base está vacía.
 * - Las colecciones chicas (planes, clases, novedades) guardan JSON; reservas y socios
 *   usan columnas reales con índices.
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const PLANS = [
  { id: 'small', group: 'estandar', name: 'SMALL', credits: 8, price: 45000, mpLink: '' },
  { id: 'medium', group: 'estandar', name: 'MEDIUM', credits: 12, price: 50000, mpLink: '' },
  { id: 'extra', group: 'estandar', name: 'EXTRA LARGE', credits: 20, price: 55000, mpLink: '' },
  { id: 'mood', group: 'mood', name: 'MOOD', credits: 12, price: 55000, mpLink: '' },
  { id: 'gold', group: 'mood', name: 'GOLD', credits: null, price: 60000, mpLink: '' },
];

const ACTIVITIES = [
  { id: 'musculacion', name: 'Musculación', color: '#F2C14E', durationMin: 60, credits: 1, active: true },
  { id: 'crossfit', name: 'CrossFit', color: '#E62BAB', durationMin: 60, credits: 1, active: true },
  { id: 'endurance', name: 'Endurance', color: '#7C5CFF', durationMin: 60, credits: 1, active: true },
  { id: 'fullcontact', name: 'Full Contact', color: '#FF6B57', durationMin: 60, credits: 1, active: true },
  { id: 'spinning', name: 'Spinning', color: '#3DDC97', durationMin: 45, credits: 1, active: true },
  { id: 'jiujitsu', name: 'Jiu-Jitsu', color: '#4EA8FF', durationMin: 90, credits: 1, active: true },
  { id: 'zumba', name: 'Zumba', color: '#FF4FA3', durationMin: 60, credits: 1, active: true },
];

const OPEN_HOURS = {
  0: [],
  1: [['06:00', '11:00'], ['14:00', '22:30']],
  2: [['06:00', '11:00'], ['14:00', '22:30']],
  3: [['06:00', '11:00'], ['14:00', '22:30']],
  4: [['06:00', '11:00'], ['14:00', '22:30']],
  5: [['06:00', '11:00'], ['14:00', '22:30']],
  6: [['09:00', '12:00'], ['18:00', '20:00']],
};

const pad = (n) => (n < 10 ? '0' : '') + n;
const uid = (p) => p + require('crypto').randomBytes(4).toString('hex').toUpperCase();
const minutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function defaultClub() {
  return {
    name: 'MOOD', sub: 'Training Club', address: 'La Consulta, Mendoza',
    whatsapp: '', instagram: '', adminPin: '1234', cancelMinutes: 30, defaultPlanId: 'small',
  };
}

function defaultMp() { return { accessToken: '', publicUrl: '' }; }

function defaultSchedule() {
  const out = [];
  Object.keys(OPEN_HOURS).map(Number).forEach((wd) => {
    OPEN_HOURS[wd].forEach(([from, to]) => {
      for (let t = minutes(from); t + 60 <= minutes(to); t += 60) {
        out.push({ id: uid('s'), weekday: wd, time: hhmm(t), activityId: 'musculacion', capacity: 25 });
      }
    });
  });
  [2, 4].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '18:30', activityId: 'jiujitsu', capacity: 20 }));
  // CrossFit: lunes a viernes 20:00 y martes/jueves 15:30 (flyer).
  [1, 2, 3, 4, 5].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '20:00', activityId: 'crossfit', capacity: 20 }));
  [2, 4].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '15:30', activityId: 'crossfit', capacity: 20 }));
  // Endurance: mismos bloques que CrossFit (flyer).
  [1, 2, 3, 4, 5].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '20:00', activityId: 'endurance', capacity: 20 }));
  [2, 4].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '15:30', activityId: 'endurance', capacity: 20 }));
  // Spinning: lunes, miércoles y viernes 14:30 y 20:00.
  [1, 3, 5].forEach((d) => {
    out.push({ id: uid('s'), weekday: d, time: '14:30', activityId: 'spinning', capacity: 16 });
    out.push({ id: uid('s'), weekday: d, time: '20:00', activityId: 'spinning', capacity: 16 });
  });
  // Full Contact: martes y jueves 21:00.
  [2, 4].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '21:00', activityId: 'fullcontact', capacity: 16 }));
  // Zumba: lunes y miércoles 19:00.
  [1, 3].forEach((d) => out.push({ id: uid('s'), weekday: d, time: '19:00', activityId: 'zumba', capacity: 20 }));
  return out;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedule (
  id TEXT PRIMARY KEY, weekday INTEGER NOT NULL, time TEXT NOT NULL,
  activity_id TEXT NOT NULL, capacity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS schedule_day ON schedule(weekday, time);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, phone_key TEXT UNIQUE,
  plan_id TEXT, credits_left INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, member_id TEXT NOT NULL, name TEXT,
  date TEXT NOT NULL, time TEXT NOT NULL, activity_id TEXT NOT NULL, status TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0, routine_id TEXT, demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, cancelled_at INTEGER, cancelled_by TEXT
);
CREATE INDEX IF NOT EXISTS bookings_slot ON bookings(date, time, activity_id, status);
CREATE INDEX IF NOT EXISTS bookings_member ON bookings(member_id, status);
CREATE INDEX IF NOT EXISTS bookings_routine ON bookings(routine_id, status);
CREATE TABLE IF NOT EXISTS routines (member_id TEXT PRIMARY KEY, items TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_member ON payments(member_id);
CREATE TABLE IF NOT EXISTS news (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
`;

class Store {
  constructor(dbFile) {
    this.file = dbFile;
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    this.db = new DatabaseSync(dbFile);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA synchronous=NORMAL;');
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(SCHEMA);
    this.q = (sql) => this.db.prepare(sql);
    this.one = (sql, ...p) => this.q(sql).get(...p);
    this.all = (sql, ...p) => this.q(sql).all(...p);
    this.run = (sql, ...p) => this.q(sql).run(...p);
    this.migrateFromJson();
    this.seedDefaults();
  }

  tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { try { this.db.exec('ROLLBACK'); } catch (_) {} throw e; }
  }

  seedDefaults() {
    const count = this.one('SELECT COUNT(*) AS n FROM plans');
    if (!count.n) for (const p of PLANS) this.run('INSERT INTO plans(id,data) VALUES(?,?)', p.id, JSON.stringify(p));
    const act = this.one('SELECT COUNT(*) AS n FROM activities');
    if (!act.n) for (const a of ACTIVITIES) this.run('INSERT INTO activities(id,data) VALUES(?,?)', a.id, JSON.stringify(a));
    const sch = this.one('SELECT COUNT(*) AS n FROM schedule');
    if (!sch.n) for (const s of defaultSchedule()) this.run('INSERT INTO schedule(id,weekday,time,activity_id,capacity) VALUES(?,?,?,?,?)', s.id, s.weekday, s.time, s.activityId, s.capacity);
    if (!this.one('SELECT value FROM meta WHERE key=?', 'club')) this.setClub(defaultClub());
    if (!this.one('SELECT value FROM meta WHERE key=?', 'mp')) this.setMp(defaultMp());
  }

  /** Importa data/db.json (versión anterior) una sola vez. */
  migrateFromJson() {
    const legacy = path.join(path.dirname(this.file), 'db.json');
    if (!fs.existsSync(legacy)) return;
    if (this.one('SELECT COUNT(*) AS n FROM members').n || this.one('SELECT COUNT(*) AS n FROM bookings').n) return;
    let db;
    try { db = JSON.parse(fs.readFileSync(legacy, 'utf8')); } catch (_) { return; }
    if (!db || !db.v) return;
    this.tx(() => {
      for (const p of db.plans || []) this.run('INSERT OR REPLACE INTO plans(id,data) VALUES(?,?)', p.id, JSON.stringify(p));
      for (const a of db.activities || []) this.run('INSERT OR REPLACE INTO activities(id,data) VALUES(?,?)', a.id, JSON.stringify(a));
      for (const s of db.schedule || []) this.run('INSERT OR REPLACE INTO schedule(id,weekday,time,activity_id,capacity) VALUES(?,?,?,?,?)', s.id, s.weekday, s.time, s.activityId, s.capacity);
      for (const m of db.members || []) this.insertMember(m);
      for (const b of db.bookings || []) this.insertBooking(b);
      for (const r of db.routines || []) this.setRoutine(r.memberId, r.items || []);
      for (const p of db.payments || []) this.insertPayment(p);
      for (const n of db.news || []) this.upsertNews(n);
      if (db.club) this.setClub(db.club);
      if (db.mp) this.setMp(db.mp);
    });
    try { fs.renameSync(legacy, legacy + '.migrated'); } catch (_) {}
  }

  close() { try { this.db.close(); } catch (_) {} }

  /* ---------------- club / mp ---------------- */
  getClub() {
    const row = this.one('SELECT value FROM meta WHERE key=?', 'club');
    return row ? Object.assign(defaultClub(), JSON.parse(row.value)) : defaultClub();
  }
  setClub(club) { this.run('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', 'club', JSON.stringify(Object.assign(defaultClub(), club))); }
  updateClub(patch) { const c = Object.assign(this.getClub(), patch); this.setClub(c); return c; }

  getMp() {
    const row = this.one('SELECT value FROM meta WHERE key=?', 'mp');
    return row ? Object.assign(defaultMp(), JSON.parse(row.value)) : defaultMp();
  }
  setMp(mp) { this.run('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', 'mp', JSON.stringify(Object.assign(defaultMp(), mp))); }
  updateMp(patch) { const m = Object.assign(this.getMp(), patch); this.setMp(m); return m; }

  /* ---------------- planes ---------------- */
  plans() { return this.all('SELECT data FROM plans').map((r) => JSON.parse(r.data)); }
  plan(id) { const r = this.one('SELECT data FROM plans WHERE id=?', id); return r ? JSON.parse(r.data) : null; }
  updatePlan(id, patch) {
    const p = this.plan(id); if (!p) return null;
    Object.assign(p, patch);
    this.run('UPDATE plans SET data=? WHERE id=?', JSON.stringify(p), id);
    return p;
  }

  /* ---------------- actividades ---------------- */
  activities() { return this.all('SELECT data FROM activities').map((r) => JSON.parse(r.data)); }
  activity(id) { const r = this.one('SELECT data FROM activities WHERE id=?', id); return r ? JSON.parse(r.data) : null; }
  upsertActivity(a) {
    const cur = this.activity(a.id);
    const val = Object.assign({ active: true, durationMin: 60, credits: 1, color: '#E62BAB' }, cur || {}, a);
    this.run('INSERT OR REPLACE INTO activities(id,data) VALUES(?,?)', val.id, JSON.stringify(val));
    return val;
  }

  /* ---------------- horarios ---------------- */
  schedule() {
    return this.all('SELECT * FROM schedule ORDER BY weekday, time').map((r) => ({
      id: r.id, weekday: r.weekday, time: r.time, activityId: r.activity_id, capacity: r.capacity,
    }));
  }
  slot(id) {
    const r = this.one('SELECT * FROM schedule WHERE id=?', id);
    return r ? { id: r.id, weekday: r.weekday, time: r.time, activityId: r.activity_id, capacity: r.capacity } : null;
  }
  findSlot(weekday, time, activityId) {
    const r = this.one('SELECT * FROM schedule WHERE weekday=? AND time=? AND activity_id=?', weekday, time, activityId);
    return r ? { id: r.id, weekday: r.weekday, time: r.time, activityId: r.activity_id, capacity: r.capacity } : null;
  }
  upsertSlot(s) {
    const id = s.id || uid('s');
    this.run('INSERT OR REPLACE INTO schedule(id,weekday,time,activity_id,capacity) VALUES(?,?,?,?,?)', id, Number(s.weekday), s.time, s.activityId, Math.max(1, Number(s.capacity) || 20));
    return this.slot(id);
  }
  removeSlot(id) { this.run('DELETE FROM schedule WHERE id=?', id); }
  bulkSlots(weekday, activityId, from, to, every, capacity) {
    let created = 0;
    this.tx(() => {
      for (let t = from; t + every <= to; t += every) {
        const time = hhmm(t);
        if (this.findSlot(weekday, time, activityId)) continue;
        this.upsertSlot({ weekday, time, activityId, capacity });
        created++;
      }
    });
    return created;
  }

  /* ---------------- socios ---------------- */
  rowToMember(r) {
    if (!r) return null;
    return {
      id: r.id, name: r.name, phone: r.phone, planId: r.plan_id,
      creditsLeft: r.credits_left, createdAt: r.created_at,
    };
  }
  members() { return this.all('SELECT * FROM members ORDER BY name').map((r) => this.rowToMember(r)); }
  member(id) { return this.rowToMember(this.one('SELECT * FROM members WHERE id=?', id)); }
  memberByPhone(phoneKey) { return this.rowToMember(this.one('SELECT * FROM members WHERE phone_key=?', phoneKey)); }
  insertMember(m) {
    const phoneKey = String(m.phone || '').replace(/\D/g, '').slice(-10);
    this.run('INSERT OR REPLACE INTO members(id,name,phone,phone_key,plan_id,credits_left,created_at) VALUES(?,?,?,?,?,?,?)',
      m.id, m.name, m.phone || '', phoneKey, m.planId || null, m.creditsLeft == null ? null : m.creditsLeft, m.createdAt || Date.now());
    return this.member(m.id);
  }
  updateMember(id, patch) {
    const m = this.member(id); if (!m) return null;
    const v = Object.assign(m, patch);
    const phoneKey = String(v.phone || '').replace(/\D/g, '').slice(-10);
    this.run('UPDATE members SET name=?, phone=?, phone_key=?, plan_id=?, credits_left=? WHERE id=?',
      v.name, v.phone || '', phoneKey, v.planId || null, v.creditsLeft == null ? null : v.creditsLeft, id);
    return this.member(id);
  }

  /* ---------------- reservas ---------------- */
  rowToBooking(r) {
    if (!r) return null;
    return {
      id: r.id, code: r.code, memberId: r.member_id, name: r.name,
      date: r.date, time: r.time, activityId: r.activity_id, status: r.status,
      creditsUsed: r.credits_used, routineId: r.routine_id || null,
      demo: !!r.demo, createdAt: r.created_at,
      cancelledAt: r.cancelled_at || null, cancelledBy: r.cancelled_by || null,
    };
  }
  insertBooking(b) {
    this.run(`INSERT OR REPLACE INTO bookings(id,code,member_id,name,date,time,activity_id,status,credits_used,routine_id,demo,created_at,cancelled_at,cancelled_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.id, b.code, b.memberId, b.name || '', b.date, b.time, b.activityId, b.status || 'active',
      b.creditsUsed || 0, b.routineId || null, b.demo ? 1 : 0, b.createdAt || Date.now(),
      b.cancelledAt || null, b.cancelledBy || null);
    return this.booking(b.id);
  }
  updateBooking(b) {
    this.run(`UPDATE bookings SET status=?, credits_used=?, routine_id=?, cancelled_at=?, cancelled_by=?, name=? WHERE id=?`,
      b.status, b.creditsUsed || 0, b.routineId || null, b.cancelledAt || null, b.cancelledBy || null, b.name || '', b.id);
    return this.booking(b.id);
  }
  booking(id) { return this.rowToBooking(this.one('SELECT * FROM bookings WHERE id=?', id)); }
  activeCount(date, time, activityId) {
    const r = this.one(`SELECT COUNT(*) AS n FROM bookings WHERE status='active' AND date=? AND time=? AND activity_id=?`, date, time, activityId);
    return r.n;
  }
  activeAt(memberId, date, time, activityId) {
    return this.rowToBooking(this.one(`SELECT * FROM bookings WHERE status='active' AND member_id=? AND date=? AND time=? AND activity_id=?`, memberId, date, time, activityId));
  }
  memberBookings(memberId, fromDate) {
    return this.all('SELECT * FROM bookings WHERE member_id=? AND date>=? ORDER BY date,time', memberId, fromDate).map((r) => this.rowToBooking(r));
  }
  memberBookingsOn(memberId, date) {
    return this.all('SELECT * FROM bookings WHERE member_id=? AND date=?', memberId, date).map((r) => this.rowToBooking(r));
  }
  activeMemberBookings(memberId, fromDate) {
    return this.all(`SELECT * FROM bookings WHERE member_id=? AND status='active' AND date>=? ORDER BY date,time`, memberId, fromDate).map((r) => this.rowToBooking(r));
  }
  bookingsRange(fromDate, toDate) {
    return this.all('SELECT * FROM bookings WHERE date>=? AND date<=? ORDER BY date,time', fromDate, toDate).map((r) => this.rowToBooking(r));
  }
  countsRange(fromDate, toDate) {
    const out = {};
    for (const r of this.all(`SELECT date,time,activity_id,COUNT(*) AS n FROM bookings WHERE status='active' AND date>=? AND date<=? GROUP BY date,time,activity_id`, fromDate, toDate)) {
      out[`${r.date}|${r.time}|${r.activity_id}`] = r.n;
    }
    return out;
  }
  routineFuture(memberId, today) {
    return this.all(`SELECT * FROM bookings WHERE member_id=? AND routine_id IS NOT NULL AND status='active' AND date>=?`, memberId, today).map((r) => this.rowToBooking(r));
  }
  upcomingCounts(today, nowTime) {
    const out = {};
    for (const r of this.all(`SELECT member_id,COUNT(*) AS n FROM bookings WHERE status='active' AND (date>? OR (date=? AND time>?)) GROUP BY member_id`, today, today, nowTime)) {
      out[r.member_id] = r.n;
    }
    return out;
  }
  seedDemo(bookings) {
    this.tx(() => { for (const b of bookings) this.insertBooking(b); });
  }
  clearDemo() { this.run('DELETE FROM bookings WHERE demo=1'); }

  /* ---------------- rutinas ---------------- */
  routines() { return this.all('SELECT * FROM routines').map((r) => ({ memberId: r.member_id, items: JSON.parse(r.items) })); }
  routine(memberId) {
    const r = this.one('SELECT * FROM routines WHERE member_id=?', memberId);
    return { memberId, items: r ? JSON.parse(r.items) : [] };
  }
  setRoutine(memberId, items) {
    this.run('INSERT OR REPLACE INTO routines(member_id,items) VALUES(?,?)', memberId, JSON.stringify(items || []));
  }

  /* ---------------- pagos ---------------- */
  insertPayment(p) {
    this.run('INSERT OR REPLACE INTO payments(id,member_id,data,created_at) VALUES(?,?,?,?)', p.id, p.memberId, JSON.stringify(p), p.createdAt || Date.now());
    return this.payment(p.id);
  }
  updatePayment(p) {
    this.run('UPDATE payments SET data=?, member_id=?, created_at=? WHERE id=?', JSON.stringify(p), p.memberId, p.createdAt || Date.now(), p.id);
    return this.payment(p.id);
  }
  payment(id) {
    const r = this.one('SELECT data FROM payments WHERE id=?', id);
    return r ? JSON.parse(r.data) : null;
  }
  paymentsForMember(memberId, limit = 12) {
    return this.all('SELECT data FROM payments WHERE member_id=? ORDER BY created_at DESC LIMIT ?', memberId, limit).map((r) => JSON.parse(r.data));
  }
  recentPayments(limit = 80) {
    return this.all('SELECT data FROM payments ORDER BY created_at DESC LIMIT ?', limit).map((r) => JSON.parse(r.data));
  }

  /* ---------------- novedades ---------------- */
  news() { return this.all('SELECT data FROM news ORDER BY created_at DESC').map((r) => JSON.parse(r.data)); }
  upsertNews(n) {
    this.run('INSERT OR REPLACE INTO news(id,data,created_at) VALUES(?,?,?)', n.id, JSON.stringify(n), n.createdAt || Date.now());
    return n;
  }
  removeNews(id) { this.run('DELETE FROM news WHERE id=?', id); }
}

module.exports = { Store, PLANS, ACTIVITIES, OPEN_HOURS, uid, pad, minutes, hhmm };
