const db = require('./db'), S = require('./sec');
const PERMS = {
  super_admin: ['users.manage', 'staff.verify', 'patient.read', 'patient.write', 'appt.manage', 'queue.manage', 'report.view', 'audit.view', 'settings.manage', 'patient.merge', 'patient.invite', 'system'],
  records_manager: ['patient.read', 'patient.write', 'appt.manage', 'queue.manage', 'report.view', 'patient.merge', 'patient.invite', 'audit.view'],
  doctor: ['patient.read', 'patient.write', 'clinical.read', 'clinical.write', 'diagnose', 'prescribe', 'appt.manage', 'queue.manage', 'triage', 'invest.manage', 'referral.manage', 'report.view', 'dispense'],
  nurse: ['patient.read', 'patient.write', 'clinical.read', 'clinical.write', 'triage', 'queue.manage', 'appt.manage', 'referral.manage', 'administer'],
  lab: ['invest.work', 'patient.min'],
  pharmacy: ['dispense', 'patient.min'],
  patient: ['self'],
};
const CLINICAL_STAFF = ['doctor', 'nurse', 'lab', 'pharmacy'];
// Admin privileges never include clinical content; clinical staff need verified credentials.
function permsFor(u) {
  if (CLINICAL_STAFF.includes(u.role) && u.verification !== 'Verified') return [];
  return PERMS[u.role] || [];
}
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, department: u.department, verification: u.verification,
  mfa_enabled: !!u.mfa_enabled, patient_id: u.patient_id, theme: u.theme, perms: permsFor(u), licence_expiry: u.licence_expiry });
const sessionMin = () => Number(process.env.SESSION_MINUTES) || S.setting('session_minutes', 30);
function issue(res, u) {
  const t = S.jwt.sign({ id: u.id }, S.JWT, { expiresIn: sessionMin() * 60 });
  res.cookie('prms_token', t, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: sessionMin() * 60000 });
}
function auth(req, res, next) {
  try {
    const p = S.jwt.verify(req.cookies.prms_token || '', S.JWT);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(p.id);
    if (!u || u.status !== 'Active') return res.status(401).json({ error: 'session_invalid' });
    req.user = u; req.perms = permsFor(u); issue(res, u); next(); // sliding session
  } catch { res.status(401).json({ error: 'session_expired' }); }
}
const need = (...ps) => (req, res, next) => {
  if (ps.some(p => req.perms.includes(p))) return next();
  S.audit(req.user, 'access.denied', req.path, '', 'denied', ps.join('|'));
  res.status(403).json({ error: 'You do not have permission to do this.' });
};
// Clinical access: clinical.read or an active, reasoned emergency (break-glass) grant.
const canClinical = (req, pid) => req.perms.includes('clinical.read') ||
  !!db.prepare('SELECT 1 FROM breakglass WHERE user_id=? AND patient_id=? AND expires>?').get(req.user.id, pid, Date.now());
const clinicalGuard = (getPid) => (req, res, next) => canClinical(req, getPid(req)) ? next() : (S.audit(req.user, 'access.denied', 'clinical', getPid(req), 'denied'),
  res.status(403).json({ error: 'You do not have permission to access this record.' }));
const ownPatient = req => req.user.role === 'patient' ? req.user.patient_id : null;
module.exports = { PERMS, permsFor, publicUser, issue, auth, need, canClinical, clinicalGuard, ownPatient };
