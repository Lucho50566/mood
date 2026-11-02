/**
 * Backup consistente de MOOD (SQLite + imágenes).
 *
 *   node tools/backup.js                 -> backups/mood-YYYY-MM-DD-HHMM.sqlite
 *   MOOD_DATA=/ruta/data node tools/backup.js
 *
 * Se puede correr con el servidor prendido (WAL). Programalo con cron/Task Scheduler.
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA = process.env.MOOD_DATA ? path.resolve(process.env.MOOD_DATA) : path.join(__dirname, '..', 'data');
const OUT = process.env.MOOD_BACKUP ? path.resolve(process.env.MOOD_BACKUP) : path.join(__dirname, '..', 'backups');
const DB = path.join(DATA, 'db.sqlite');
const UPLOADS = path.join(DATA, 'uploads');
const KEEP_DAYS = Number(process.env.MOOD_BACKUP_DAYS || 14);

if (!fs.existsSync(DB)) {
  console.error('No existe', DB);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const now = new Date();
const pad = (n) => (n < 10 ? '0' : '') + n;
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const target = path.join(OUT, `mood-${stamp}.sqlite`);

const db = new DatabaseSync(DB);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

let files = 0;
if (fs.existsSync(UPLOADS)) {
  const dest = path.join(OUT, `mood-${stamp}-uploads`);
  fs.cpSync(UPLOADS, dest, { recursive: true });
  files = fs.readdirSync(dest).length;
}

// Limpieza de backups viejos
const cutoff = Date.now() - KEEP_DAYS * 86400e3;
for (const name of fs.readdirSync(OUT)) {
  if (!name.startsWith('mood-')) continue;
  const full = path.join(OUT, name);
  try { if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true }); } catch (_) {}
}

console.log(`Backup OK: ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} KB) · ${files} imágenes`);
