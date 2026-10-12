const router = require('express').Router();
const fs = require('fs'), path = require('path');
const db = require('./db'), S = require('./sec'), A = require('./auth'), U = require('./util');
const { wrap, missing, pick, ins, upd } = U;
const pwOk = p => typeof p === 'string' && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
const PW_MSG = 'Password must be at least 10 characters and include a letter and a number.';
const bad = (res, msg, code = 400, extra = {}) => res.status(code).json({ error: msg, ...extra });
const DEFAULTS = {
  institution: 'Alan Galpin UCU', departments: ['General Consultation', 'Nursing', 'Counselling', 'Laboratory', 'Pharmacy', 'Maternal and Child Health'],
  faculties: ['Faculty of Engineering, Design and Technology', 'Faculty of Law', 'Faculty of Science and Technology', 'Faculty of Education and Arts', 'Faculty of Health Sciences'],
  courses: ['BSc Information Technology', 'BSc Computer Science', 'Bachelor of Laws', 'BSc Nursing', 'Bachelor of Education', 'BSc Software Engineering'],
  hostels: ['Hall A', 'Hall B', 'Hall C', 'Off campus'], campuses: ['Mukono Main Campus'], categories: ['Student', 'Staff', 'Other'],
  years: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'], academic_years: ['2025/2026', '2026/2027'],
  visit_types: ['Walk-in', 'Appointment', 'Follow-up', 'Referral', 'Emergency'], session_minutes: 30, retention_years: 10, min_cell: 1,
  ref_ranges: { temp: [36.1, 37.8], pulse: [60, 100], sys: [90, 140], dia: [60, 90], spo2: [94, 100], rr: [12, 20] },
};
const settingsAll = () => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, S.setting(k, DEFAULTS[k])]));
router.get('/health', (req, res) => { try { db.prepare('SELECT 1').get(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });

// ---- Authentication
router.post('/auth/login', wrap((req, res) => {
  const { identifier = '', password = '', code } = req.body || {};
  const id = String(identifier).trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(username)=? OR lower(staff_id)=?').get(id, id, id);
  if (!u) { S.audit(null, 'login.failed', 'user', id, 'denied', 'unknown account'); return bad(res, 'Incorrect sign-in details.', 401); }
  if (u.locked_until > Date.now()) return bad(res, 'Too many attempts. Try again in a few minutes.', 429);
  if (u.status !== 'Active') { S.audit(u, 'login.blocked', 'user', u.id, 'denied', u.status); return bad(res, 'This account is not active. Contact support.', 403); }
  if (!S.check(String(password), u.password_hash)) {
    const f = u.failed + 1; db.prepare('UPDATE users SET failed=?, locked_until=? WHERE id=?').run(f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, u.id);
    S.audit(u, 'login.failed', 'user', u.id, 'denied', `attempt ${f}`); return bad(res, 'Incorrect sign-in details.', 401);
  }
  if (u.mfa_enabled) {
    if (!code) return res.status(200).json({ mfa_required: true });
    if (!S.totpOk(u.mfa_secret, code)) { S.audit(u, 'login.mfa_failed', 'user', u.id, 'denied'); return bad(res, 'The verification code is incorrect.', 401); }
  }
  db.prepare('UPDATE users SET failed=0, locked_until=0 WHERE id=?').run(u.id);
  A.issue(res, u); S.audit(u, 'login.success', 'user', u.id);
  const mfaSetup = !u.mfa_enabled && process.env.REQUIRE_ADMIN_MFA === 'true' && ['super_admin', 'records_manager'].includes(u.role);
  res.json({ user: A.publicUser(u), mfa_setup_required: mfaSetup });
}));
router.post('/auth/logout', (req, res) => { res.clearCookie('prms_token'); res.json({ ok: true }); });
router.post('/auth/forgot', wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(String(req.body.email || '').toLowerCase());
  if (u) { const t = S.token(); db.prepare('UPDATE users SET reset_hash=?, reset_expires=? WHERE id=?').run(S.sha(t), Date.now() + 30 * 60000, u.id);
    S.audit(u, 'password.reset_requested', 'user', u.id);
    // Email delivery is not configured: the link is printed to the server console for local testing only.
    console.log(`\n[EMAIL NOT CONFIGURED] Password reset link for ${u.email}: http://localhost:5173/reset?token=${t}\n`); }
  res.json({ ok: true, message: 'If that email is registered, a reset link has been issued.' });
}));
router.post('/auth/reset', wrap((req, res) => {
  const { token, password } = req.body || {}; if (!pwOk(password)) return bad(res, PW_MSG);
  const u = db.prepare('SELECT * FROM users WHERE reset_hash=? AND reset_expires>?').get(S.sha(String(token || '')), Date.now());
  if (!u) return bad(res, 'This reset link is invalid or has expired.');
  db.prepare('UPDATE users SET password_hash=?, reset_hash=NULL, reset_expires=NULL, failed=0, locked_until=0 WHERE id=?').run(S.hash(password), u.id);
  S.audit(u, 'password.reset', 'user', u.id); res.json({ ok: true });
}));
router.post('/auth/claim', wrap((req, res) => { // patient account claiming: needs MRN + one-time code + DOB
  const { mrn, code, dob, email, password } = req.body || {}; if (!pwOk(password)) return bad(res, PW_MSG);
  if (missing(req.body || {}, ['mrn', 'code', 'dob', 'email']).length) return bad(res, 'Enter your record number, one-time code, date of birth and email.');
  const p = db.prepare('SELECT * FROM patients WHERE mrn=?').get(String(mrn).trim());
  if (!p || !p.claim_hash || p.claim_expires < Date.now() || p.claim_hash !== S.sha(String(code).trim()) || p.dob !== dob) return bad(res, 'These details could not be verified. Ask the clinic for a new invitation.', 400);
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(String(email).toLowerCase())) return bad(res, 'That email is already in use.');
  const id = ins('users', { email: String(email).toLowerCase(), name: p.full_name, password_hash: S.hash(password), role: 'patient', patient_id: p.id, verification: 'Verified' });
  db.prepare('UPDATE patients SET claim_hash=NULL, claim_expires=NULL WHERE id=?').run(p.id);
  S.audit({ id, name: p.full_name }, 'patient.account_claimed', 'patient', p.id); res.json({ ok: true });
}));
router.use(A.auth);
router.get('/auth/me', (req, res) => res.json({ user: A.publicUser(req.user) }));
router.patch('/auth/theme', (req, res) => { db.prepare('UPDATE users SET theme=? WHERE id=?').run(req.body.theme === 'dark' ? 'dark' : 'light', req.user.id); res.json({ ok: true }); });
router.post('/auth/password', wrap((req, res) => {
  const { current, next } = req.body || {}; if (!S.check(String(current || ''), req.user.password_hash)) return bad(res, 'Your current password is incorrect.');
  if (!pwOk(next)) return bad(res, PW_MSG); db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(S.hash(next), req.user.id);
  S.audit(req.user, 'password.changed', 'user', req.user.id); res.json({ ok: true });
}));
router.post('/auth/mfa/setup', wrap((req, res) => { const s = S.newSecret(); db.prepare('UPDATE users SET mfa_secret=?, mfa_enabled=0 WHERE id=?').run(s, req.user.id);
  res.json({ secret: s, uri: `otpauth://totp/AlanGalpinUCU:${encodeURIComponent(req.user.email)}?secret=${s}&issuer=AlanGalpinUCU` }); }));
router.post('/auth/mfa/enable', wrap((req, res) => { const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!u.mfa_secret || !S.totpOk(u.mfa_secret, req.body.code)) return bad(res, 'The verification code is incorrect.');
  db.prepare('UPDATE users SET mfa_enabled=1 WHERE id=?').run(u.id); S.audit(u, 'mfa.enabled', 'user', u.id); res.json({ ok: true }); }));
router.post('/auth/mfa/disable', wrap((req, res) => { if (!S.check(String(req.body.password || ''), req.user.password_hash)) return bad(res, 'Your password is incorrect.');
  db.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL WHERE id=?').run(req.user.id); S.audit(req.user, 'mfa.disabled', 'user', req.user.id); res.json({ ok: true }); }));

// ---- Settings
router.get('/settings/public', (req, res) => res.json(settingsAll()));
router.get('/settings', A.need('settings.manage'), (req, res) => res.json(settingsAll()));
router.put('/settings', A.need('settings.manage'), wrap((req, res) => {
  for (const k of Object.keys(req.body || {})) if (k in DEFAULTS) S.putSetting(k, req.body[k]);
  S.audit(req.user, 'settings.updated', 'settings', '', 'success', Object.keys(req.body).join(',')); res.json(settingsAll());
}));

// ---- Users and staff verification
const USER_COLS = 'id,email,username,name,role,status,title,staff_id,department,category,licence_no,licence_body,licence_expiry,verification,mfa_enabled,created_at';
router.get('/users', A.need('users.manage', 'staff.verify'), (req, res) => res.json(db.prepare(`SELECT ${USER_COLS} FROM users WHERE role!='patient' ORDER BY name`).all()));
router.post('/users', A.need('users.manage'), wrap((req, res) => {
  const b = req.body || {}, m = missing(b, ['name', 'email', 'role', 'password']);
  if (m.length) return bad(res, 'Missing: ' + m.join(', ')); if (!pwOk(b.password)) return bad(res, PW_MSG);
  if (!A.PERMS[b.role] || b.role === 'patient') return bad(res, 'Choose a valid staff role.');
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(b.email.toLowerCase())) return bad(res, 'That email is already registered.', 409);
  const id = ins('users', { ...pick(b, ['name', 'title', 'staff_id', 'department', 'category', 'licence_no', 'licence_body', 'licence_expiry', 'role']), email: b.email.toLowerCase(), password_hash: S.hash(b.password) });
  S.audit(req.user, 'user.created', 'user', id, 'success', b.role); res.status(201).json({ id });
}));
router.patch('/users/:id', A.need('users.manage'), wrap((req, res) => {
  const o = pick(req.body, ['name', 'title', 'department', 'category', 'licence_no', 'licence_body', 'licence_expiry', 'role', 'status', 'staff_id']);
  if (o.role && !A.PERMS[o.role]) return bad(res, 'Invalid role.'); if (o.status && !['Active', 'Suspended', 'Deactivated'].includes(o.status)) return bad(res, 'Invalid status.');
  if (Number(req.params.id) === req.user.id && (o.status || o.role)) return bad(res, 'You cannot change your own role or status.');
  upd('users', req.params.id, o); S.audit(req.user, 'user.updated', 'user', req.params.id, 'success', JSON.stringify(o)); res.json({ ok: true });
}));
router.post('/users/:id/verify', A.need('staff.verify'), wrap((req, res) => {
  const v = req.body.verification; if (!['Verified', 'Rejected', 'Suspended', 'Expired Credentials', 'Pending Verification'].includes(v)) return bad(res, 'Invalid status.');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id); if (!u) return bad(res, 'Not found', 404);
  if (v === 'Verified' && CLIN(u) && (!u.licence_no || !u.licence_body)) return bad(res, 'Record a registration number and issuing body before verifying clinical staff.');
  db.prepare('UPDATE users SET verification=? WHERE id=?').run(v, u.id); S.notify(u.id, 'Verification status updated', v);
  S.audit(req.user, 'staff.verification', 'user', u.id, 'success', v); res.json({ ok: true });
}));
const CLIN = u => ['doctor', 'nurse', 'lab', 'pharmacy'].includes(u.role);
router.get('/users/clinicians', A.need('patient.read', 'appt.manage', 'queue.manage'), (req, res) =>
  res.json(db.prepare("SELECT id,name,title,role,department FROM users WHERE role IN ('doctor','nurse') AND verification='Verified' AND status='Active' ORDER BY name").all()));

// ---- Audit, system health, backups
router.get('/audit', A.need('audit.view'), wrap((req, res) => {
  const { event = '', q = '', page = 1 } = req.query, lim = 50, off = (Math.max(1, +page) - 1) * lim;
  const like = `%${q}%`, ev = `%${event}%`;
  const rows = db.prepare('SELECT * FROM audit WHERE event LIKE ? AND (user_name LIKE ? OR entity_id LIKE ? OR entity LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?').all(ev, like, like, like, lim, off);
  res.json({ rows: rows.map(({ prev_hash, hash, ...r }) => r), total: db.prepare('SELECT COUNT(*) c FROM audit WHERE event LIKE ? AND (user_name LIKE ? OR entity_id LIKE ? OR entity LIKE ?)').get(ev, like, like, like).c });
}));
router.get('/audit/verify', A.need('audit.view'), (req, res) => {
  let prev = '', bad_id = null;
  for (const r of db.prepare('SELECT * FROM audit ORDER BY id').iterate()) {
    const { id, prev_hash, hash, ...row } = r; const exp = S.sha(prev + JSON.stringify({ ts: row.ts, user_id: row.user_id, user_name: row.user_name, event: row.event, entity: row.entity, entity_id: row.entity_id, outcome: row.outcome, detail: row.detail }));
    if (prev_hash !== prev || hash !== exp) { bad_id = id; break; } prev = hash;
  }
  res.json({ intact: bad_id === null, first_broken_id: bad_id });
});
const bdir = path.join(__dirname, '..', 'data', 'backups');
router.get('/admin/system', A.need('system'), wrap((req, res) => {
  const f = path.join(__dirname, '..', 'data', 'prms.db'); fs.mkdirSync(bdir, { recursive: true });
  const c = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  res.json({ status: 'ok', uptime_s: Math.round(process.uptime()), node: process.version, db_mb: fs.existsSync(f) ? +(fs.statSync(f).size / 1048576).toFixed(2) : 0,
    counts: { patients: c('patients'), encounters: c('encounters'), users: c('users'), audit: c('audit') }, backups: fs.readdirSync(bdir).sort().reverse().slice(0, 10),
    integrations: { email: 'Not configured', sms: 'Not configured', sso: 'Not configured', lab_system: 'Not configured', pharmacy_system: 'Not configured' } });
}));
router.post('/admin/backup', A.need('system'), wrap(async (req, res) => {
  fs.mkdirSync(bdir, { recursive: true }); const n = `prms-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  await db.backup(path.join(bdir, n)); S.audit(req.user, 'backup.created', 'system', n); res.json({ file: n });
}));
module.exports = { router, pwOk, settingsAll, DEFAULTS };
