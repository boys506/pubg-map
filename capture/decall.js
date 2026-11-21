const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const Ne = String.fromCharCode(66, 109, 52, 105, 115, 56, 113, 81);
const Le = { lifetime: 'X', stats: 'r', player: 'g', match: 'c', season: 'J', survival: 'v', leaderboard: 'o', weapon: 'd' };
const Me = ['player', 'season', 'lifetime', 'weapon', 'leaderboard', 'match', 'stats', 'survival'].map(e => Le[e]).join('');
const qe = { staleTime: 'u2', ttl: 'obb', maxAge: 'FR7' };
const Ie = ['ttl', 'maxAge', 'staleTime'].map(e => qe[e]).join('');
const Ke = 'kh' + (66).toString() + 'Pu';
const Je = { a: Ne, b: Me, c: Ie, d: Ke };
const Ve = Object.keys(Je).sort().map(k => Je[k]).join('');
const KEY = crypto.createHash('sha256').update(Ve, 'utf8').digest();

function dec(encStr) {
  const buf = Buffer.from(encStr, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  const p = Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
  let text = zlib.inflateRawSync(p).toString('utf8');
  if (text.length) text = text.slice(1);
  return JSON.parse(text);
}

const DIR = 'D:\\dshwork\\pubg测距\\capture\\points_raw';
const OUT = 'D:\\dshwork\\pubg测距\\capture\\points.json';
const SIZE = { Erangel: 8, Miramar: 8, Sanhok: 4, Karakin: 2, Paramo: 3, Haven: 1, Vikendi: 8, Taego: 8, Deston: 8, Rondo: 8 };

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
const out = {};
const stats = {};
for (const f of files) {
  const [map, type] = f.replace(/\.json$/, '').split('__');
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  let pts;
  try { pts = dec(raw.data[3]); } catch (e) { console.log('FAIL', f, e.message); continue; }
  if (!Array.isArray(pts)) { console.log('weird', f, typeof pts, JSON.stringify(pts).slice(0, 120)); continue; }
  out[map] = out[map] || {};
  out[map][type] = pts;
  const flat = pts.flat();
  const mx = Math.max(...flat.map(Math.abs));
  stats[map] = stats[map] || { min: 1e9, max: 0, n: 0 };
  stats[map].min = Math.min(stats[map].min, mx);
  stats[map].max = Math.max(stats[map].max, mx);
  stats[map].n += pts.length;
}
for (const [m, s] of Object.entries(stats)) {
  console.log(m, 'sizeKm', SIZE[m], 'expected half', SIZE[m] * 1000 / 2, 'maxAbs', s.max.toFixed(1), 'points', s.n);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('written', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
