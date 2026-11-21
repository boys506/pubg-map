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

function decrypt(encStr, stripFirst) {
  const buf = Buffer.from(encStr, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(ct), d.final()]);
  let text;
  try { text = zlib.brotliDecompressSync(plain).toString('utf8'); }
  catch (e) { text = plain.toString('utf8'); }
  if (stripFirst) text = text.slice(1);
  return JSON.parse(text);
}

module.exports = { decrypt, Ve };
if (require.main === module) {
  const f = process.argv[2];
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('Ve =', Ve);
  const out = decrypt(raw.data[3], true);
  console.log('type:', typeof out, Array.isArray(out) ? 'len=' + out.length : Object.keys(out).slice(0, 10));
  console.log(JSON.stringify(out).slice(0, 900));
}
