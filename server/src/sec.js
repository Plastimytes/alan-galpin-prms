const crypto = require('crypto'), fs = require('fs'), path = require('path'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const db = require('./db');
// Secrets: environment first, otherwise generated once for local development.
const sf = path.join(__dirname, '..', 'data', '.secrets.json');
let S = {}; try { S = JSON.parse(fs.readFileSync(sf)); } catch {}
if (!S.jwt) S.jwt = crypto.randomBytes(32).toString('hex');
if (!S.key) S.key = crypto.randomBytes(32).toString('hex');
try { fs.writeFileSync(sf, JSON.stringify(S), { mode: 0o600 }); } catch {}
const JWT = process.env.JWT_SECRET || S.jwt, KEY = Buffer.from(process.env.DATA_KEY || S.key, 'hex');
const enc = o => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const b = Buffer.concat([c.update(JSON.stringify(o || {}), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), b]).toString('base64'); };
const dec = s => { if (!s) return {}; const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')); };
const hash = p => bcrypt.hashSync(p, 11), check = (p, h) => bcrypt.compareSync(p, h);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = b => { let bits = '', o = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; };
const b32dec = s => { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const totp = (secret, t = Date.now()) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(c).digest(), o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); };
const totpOk = (secret, code) => [-1, 0, 1].some(w => totp(secret, Date.now() + w * 30000) === String(code).trim());
const newSecret = () => b32enc(crypto.randomBytes(20));
// Tamper-evident audit chain: each row hashes the previous row's hash.
const audit = (u, event, entity, entity_id, outcome = 'success', detail = '') => db.transaction(() => {
  const last = db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get(), prev = last ? last.hash : '';
  const row = { ts: new Date().toISOString(), user_id: u?.id ?? null, user_name: u?.name ?? 'anonymous', event, entity: entity || '', entity_id: String(entity_id ?? ''), outcome, detail: String(detail).slice(0, 300) };
  const h = sha(prev + JSON.stringify(row));
  db.prepare('INSERT INTO audit(ts,user_id,user_name,event,entity,entity_id,outcome,detail,prev_hash,hash) VALUES(@ts,@user_id,@user_name,@event,@entity,@entity_id,@outcome,@detail,@prev,@h)').run({ ...row, prev, h });
})();
const setting = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); try { return r ? JSON.parse(r.value) : d; } catch { return d; } };
const putSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
const notify = (user_id, title, body = '') => db.prepare('INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)').run(user_id, title, body);
module.exports = { JWT, enc, dec, hash, check, sha, token, totp, totpOk, newSecret, audit, setting, putSetting, notify, jwt };
