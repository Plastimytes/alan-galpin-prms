const router = require('express').Router();
const db = require('./db'), S = require('./sec'), A = require('./auth'), U = require('./util');
const { wrap, today, age, csv, range, ins } = U;
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const top = (rows, n = 8) => { const m = {}; rows.forEach(r => { const k = String(r || '').trim().toLowerCase(); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value })); };
const supp = rows => { const m = S.setting('min_cell', 1); const keep = rows.filter(r => r.value >= m), hid = rows.filter(r => r.value < m).reduce((a, r) => a + r.value, 0); return hid ? [...keep, { label: 'Other (small counts hidden)', value: hid }] : keep; };
const grp = (sql, ...a) => supp(db.prepare(sql).all(...a));
const days = (a, b) => { const o = [], d = new Date(a), e = new Date(b); while (d <= e && o.length < 400) { o.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return o; };
const series = (rows, ds) => { const m = Object.fromEntries(rows.map(r => [r.label, r.value])); return ds.map(d => ({ label: d.slice(5), value: m[d] || 0 })); };
const yest = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

router.use(A.auth);
router.get('/dashboard', A.need('report.view', 'clinical.read'), wrap((req, res) => {
  const [from, to] = range(req.query), T = today(), Y = yest(), n = (sql, ...a) => db.prepare(sql).get(...a).c;
  const WAIT = "('Registered','Checked In','Waiting for Triage','In Triage','Waiting for Clinician')";
  const clinicalStaff = req.perms.includes('clinical.read') && !req.perms.includes('report.view') || ['nurse'].includes(req.user.role);
  let cards;
  if (req.user.role === 'doctor' || req.user.role === 'nurse') {
    const me = req.user.id; cards = [
      { key: 'assigned', label: 'Patients assigned today', value: n('SELECT COUNT(*) c FROM queue WHERE qdate=? AND (clinician_id=? OR clinician_id IS NULL)', T, me), link: '/queue' },
      { key: 'waiting', label: 'Patients waiting', value: n(`SELECT COUNT(*) c FROM queue WHERE qdate=? AND status IN ${WAIT}`, T), link: '/queue', tone: 'warn' },
      { key: 'inprog', label: 'Consultations in progress', value: n("SELECT COUNT(*) c FROM queue WHERE qdate=? AND status='In Consultation'", T), link: '/queue', tone: 'info' },
      { key: 'done', label: 'Completed today', value: n("SELECT COUNT(*) c FROM encounters WHERE signed_by=? AND substr(signed_at,1,10)=?", me, T), link: '/consultations', tone: 'ok' },
      { key: 'pending', label: 'Pending clinical notes', value: n("SELECT COUNT(*) c FROM encounters WHERE clinician_id=? AND status IN ('Draft','Pending Signature')", me), link: '/consultations', tone: 'bad' },
      { key: 'fu', label: 'Follow-ups due', value: n("SELECT COUNT(*) c FROM followups WHERE status='Pending' AND due_date<=?", T), link: '/followups' },
      { key: 'rx', label: 'Prescriptions to complete', value: n("SELECT COUNT(*) c FROM prescriptions WHERE status='Prescribed' AND prescriber_id=?", me), link: '/prescriptions' },
      { key: 'ref', label: 'Referrals needing attention', value: n("SELECT COUNT(*) c FROM referrals WHERE status IN ('Pending','Sent')"), link: '/referrals' }];
    return res.json({ kind: 'clinical', cards, range: [from, to], refreshed: new Date().toISOString() });
  }
  const reg = d => n('SELECT COUNT(*) c FROM patients WHERE substr(created_at,1,10)=?', d), seen = d => n('SELECT COUNT(*) c FROM encounters WHERE visit_date=?', d), rxn = d => n('SELECT COUNT(*) c FROM prescriptions WHERE substr(created_at,1,10)=?', d);
  cards = [
    { key: 'total', label: 'Total registered patients', value: n("SELECT COUNT(*) c FROM patients WHERE status!='Merged'"), link: '/patients' },
    { key: 'regtoday', label: 'Registered today', value: reg(T), prev: reg(Y), link: '/patients' },
    { key: 'seen', label: 'Patients seen today', value: seen(T), prev: seen(Y), link: '/queue', tone: 'info' },
    { key: 'waiting', label: 'Currently waiting', value: n(`SELECT COUNT(*) c FROM queue WHERE qdate=? AND status IN ${WAIT}`, T), link: '/queue', tone: 'warn' },
    { key: 'appts', label: 'Active appointments', value: n("SELECT COUNT(*) c FROM appointments WHERE status IN ('Requested','Pending Confirmation','Confirmed') AND substr(start,1,10)>=?", T), link: '/appointments' },
    { key: 'comp', label: 'Completed consultations today', value: n("SELECT COUNT(*) c FROM encounters WHERE status IN ('Signed','Amended') AND substr(signed_at,1,10)=?", T), link: '/queue', tone: 'ok' },
    { key: 'fu', label: 'Pending follow-ups', value: n("SELECT COUNT(*) c FROM followups WHERE status='Pending'"), link: '/followups' },
    { key: 'rx', label: 'Prescriptions issued today', value: rxn(T), prev: rxn(Y), link: '/prescriptions' },
    { key: 'ref', label: 'Referrals pending', value: n("SELECT COUNT(*) c FROM referrals WHERE status IN ('Pending','Sent')"), link: '/referrals', tone: 'warn' },
    { key: 'verify', label: 'Staff awaiting verification', value: n("SELECT COUNT(*) c FROM users WHERE verification='Pending Verification' AND role NOT IN ('patient','super_admin','records_manager')"), link: '/admin/users', tone: 'bad' }];
  const ds = days(from, to), ev = db.prepare("SELECT visit_date, department, created_at, content FROM encounters WHERE visit_date BETWEEN ? AND ?").all(from, to);
  const waits = db.prepare('SELECT arrival, started FROM queue WHERE started IS NOT NULL AND qdate BETWEEN ? AND ?').all(from, to).map(r => (new Date(r.started) - new Date(r.arrival)) / 60000);
  const fu = db.prepare("SELECT status, COUNT(*) c FROM followups WHERE due_date BETWEEN ? AND ? GROUP BY status").all(from, to), fuDone = fu.find(x => x.status === 'Completed')?.c || 0, fuAll = fu.reduce((a, x) => a + x.c, 0);
  const content = ev.map(e => S.dec(e.content));
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0'), value: ev.filter(e => new Date(e.created_at).getHours() === h).length })).filter(x => x.value);
  const expiring = db.prepare("SELECT id,name,role,licence_expiry FROM users WHERE licence_expiry IS NOT NULL AND licence_expiry<=date('now','+60 day') ORDER BY licence_expiry").all();
  res.json({ kind: 'admin', cards, range: [from, to], refreshed: new Date().toISOString(), expiring,
    charts: {
      regDay: series(db.prepare('SELECT substr(created_at,1,10) label, COUNT(*) value FROM patients WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1').all(from, to), ds),
      regYear: grp("SELECT COALESCE(NULLIF(year_of_study,''),'Not stated') label, COUNT(*) value FROM patients WHERE category='Student' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1", from, to),
      regCourse: grp("SELECT COALESCE(NULLIF(course,''),'Not stated') label, COUNT(*) value FROM patients WHERE category='Student' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC LIMIT 8", from, to),
      regHostel: grp("SELECT COALESCE(NULLIF(hostel,''),'Not stated') label, COUNT(*) value FROM patients WHERE category='Student' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC", from, to),
      regCategory: grp("SELECT category label, COUNT(*) value FROM patients WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1", from, to),
      consultDay: series(db.prepare('SELECT visit_date label, COUNT(*) value FROM encounters WHERE visit_date BETWEEN ? AND ? GROUP BY 1').all(from, to), ds),
      consultDept: supp(top(ev.map(e => e.department), 10)), visitHour: hours,
      complaints: supp(top(content.map(c => c.complaint))), diagnoses: supp(top(content.map(c => c.diagnosis))),
      rxDrug: grp("SELECT drug label, COUNT(*) value FROM prescriptions WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC LIMIT 8", from, to),
    }, stats: { avg_wait_min: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null, followup_completion_pct: fuAll ? Math.round(fuDone / fuAll * 100) : null, referrals: db.prepare("SELECT COUNT(*) c FROM referrals WHERE substr(created_at,1,10) BETWEEN ? AND ?").get(from, to).c } });
}));
router.get('/lookups/patients', A.need('patient.read', 'patient.min'), (req, res) => res.json(db.prepare("SELECT id, mrn, full_name FROM patients WHERE status!='Merged' ORDER BY full_name LIMIT 500").all()));

// ---- Reports and exports
const REPORTS = {
  registrations: { perm: 'report.view', title: 'Patient registrations (aggregate)', run: (f, t) => db.prepare("SELECT substr(created_at,1,10) date, category, COALESCE(NULLIF(year_of_study,''),'-') year_of_study, COALESCE(NULLIF(course,''),'-') course, COALESCE(NULLIF(hostel,''),'-') hostel, COUNT(*) patients FROM patients WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1,2,3,4,5 ORDER BY 1").all(f, t) },
  attendance: { perm: 'report.view', title: 'Daily attendance by department (aggregate)', run: (f, t) => db.prepare('SELECT visit_date date, COALESCE(department,\'-\') department, visit_type, COUNT(*) visits FROM encounters WHERE visit_date BETWEEN ? AND ? GROUP BY 1,2,3 ORDER BY 1').all(f, t) },
  'waiting-time': { perm: 'report.view', title: 'Waiting time (aggregate)', run: (f, t) => db.prepare("SELECT qdate date, COUNT(*) patients, ROUND(AVG((julianday(started)-julianday(arrival))*1440)) avg_wait_minutes FROM queue WHERE started IS NOT NULL AND qdate BETWEEN ? AND ? GROUP BY 1").all(f, t) },
  'prescription-volume': { perm: 'report.view', title: 'Prescription volume (aggregate)', run: (f, t) => db.prepare('SELECT drug, status, COUNT(*) prescriptions FROM prescriptions WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1,2 ORDER BY 3 DESC').all(f, t) },
  'investigation-volume': { perm: 'report.view', title: 'Investigation volume (aggregate)', run: (f, t) => db.prepare('SELECT test, status, COUNT(*) investigations FROM investigations WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1,2').all(f, t) },
  'referral-patterns': { perm: 'report.view', title: 'Referral patterns (aggregate)', run: (f, t) => db.prepare('SELECT destination, status, COUNT(*) referrals FROM referrals WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1,2').all(f, t) },
  'common-diagnoses': { perm: 'report.view', title: 'Frequently recorded diagnoses (aggregate)', run: (f, t) => supp(top(db.prepare("SELECT content FROM encounters WHERE visit_date BETWEEN ? AND ? AND status IN ('Signed','Amended')").all(f, t).map(e => S.dec(e.content).diagnosis), 50)).map(r => ({ diagnosis: r.label, count: r.value })) },
  'staff-activity': { perm: 'report.view', title: 'Staff activity (counts of recorded actions)', run: (f, t) => db.prepare("SELECT user_name staff, event, COUNT(*) actions FROM audit WHERE substr(ts,1,10) BETWEEN ? AND ? AND event NOT LIKE 'login%' AND event NOT LIKE '%viewed' GROUP BY 1,2 ORDER BY 1,3 DESC").all(f, t) },
  'follow-up-tracking': { perm: 'clinical.read', title: 'Follow-up tracking (identifiable)', run: (f, t) => db.prepare('SELECT p.mrn, p.full_name, f.due_date, f.status FROM followups f JOIN patients p ON p.id=f.patient_id WHERE f.due_date BETWEEN ? AND ? ORDER BY f.due_date').all(f, t) },
  'appointment-attendance': { perm: 'appt.manage', title: 'Appointment attendance (identifiable)', run: (f, t) => db.prepare('SELECT a.ref, p.mrn, p.full_name, a.start, a.department, a.status FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE substr(a.start,1,10) BETWEEN ? AND ? ORDER BY a.start').all(f, t) },
};
router.get('/reports', (req, res) => res.json(Object.entries(REPORTS).filter(([, r]) => req.perms.includes(r.perm)).map(([key, r]) => ({ key, title: r.title, identifiable: r.perm !== 'report.view' }))));
router.get('/reports/:type', wrap((req, res) => {
  const r = REPORTS[req.params.type]; if (!r) return bad(res, 'Unknown report.', 404);
  if (!req.perms.includes(r.perm)) { S.audit(req.user, 'report.denied', 'report', req.params.type, 'denied'); return bad(res, 'You do not have permission to access this report.', 403); }
  const [f, t] = range(req.query), rows = r.run(f, t), csvOut = req.query.format === 'csv';
  S.audit(req.user, csvOut ? 'report.exported' : 'report.viewed', 'report', req.params.type, 'success', `${f}..${t}`);
  if (csvOut) { res.type('text/csv').set('Content-Disposition', `attachment; filename="${req.params.type}_${f}_${t}.csv"`); return res.send(csv(rows)); }
  res.json({ title: r.title, generated: new Date().toISOString(), filters: { from: f, to: t }, identifiable: r.perm !== 'report.view', rows });
}));

// ---- Patient portal (own records only; patient id always comes from the session, never the request)
const me = [A.need('self'), (req, res, next) => req.user.patient_id ? next() : bad(res, 'No patient record is linked to this account.', 403)];
const mine = req => req.user.patient_id;
const visitView = e => { const c = S.dec(e.content); return { id: e.id, date: e.visit_date, department: e.department, clinician: e.clinician, complaint: c.complaint, diagnosis: c.diagnosis, treatment: c.treatment, plan: c.plan, instructions: c.discharge }; };
router.get('/me/profile', me, (req, res) => { const { id, mrn, full_name, preferred_name, dob, sex, phone, alt_phone, email, address, ec_name, ec_rel, ec_phone, language, course, year_of_study, hostel, category } = db.prepare('SELECT * FROM patients WHERE id=?').get(mine(req)); res.json({ id, mrn, full_name, preferred_name, dob, age: age(dob), sex, phone, alt_phone, email, address, ec_name, ec_rel, ec_phone, language, course, year_of_study, hostel, category }); });
router.get('/me/summary', me, (req, res) => { const p = mine(req);
  res.json({ patient: db.prepare('SELECT mrn, full_name FROM patients WHERE id=?').get(p), next_appointment: db.prepare("SELECT ref,start,department,status FROM appointments WHERE patient_id=? AND start>=? AND status IN ('Confirmed','Requested','Pending Confirmation') ORDER BY start LIMIT 1").get(p, today()),
    last_visit: db.prepare("SELECT e.*, u.name clinician FROM encounters e LEFT JOIN users u ON u.id=e.clinician_id WHERE e.patient_id=? AND e.released=1 AND e.status IN ('Signed','Amended') ORDER BY e.visit_date DESC, e.id DESC LIMIT 1").all(p).map(visitView)[0] || null,
    active_prescriptions: db.prepare("SELECT COUNT(*) c FROM prescriptions WHERE patient_id=? AND status IN ('Prescribed','Dispensed','Administered')").get(p).c, followups: db.prepare("SELECT due_date, instructions FROM followups WHERE patient_id=? AND status='Pending' ORDER BY due_date").all(p),
    results: db.prepare('SELECT COUNT(*) c FROM investigations WHERE patient_id=? AND released=1').get(p).c }); });
router.get('/me/visits', me, (req, res) => res.json(db.prepare("SELECT e.*, u.name clinician FROM encounters e LEFT JOIN users u ON u.id=e.clinician_id WHERE e.patient_id=? AND e.released=1 AND e.status IN ('Signed','Amended') ORDER BY e.visit_date DESC").all(mine(req)).map(visitView)));
router.get('/me/visits/:id', me, (req, res) => { const e = db.prepare("SELECT e.*, u.name clinician FROM encounters e LEFT JOIN users u ON u.id=e.clinician_id WHERE e.id=? AND e.patient_id=? AND e.released=1 AND e.status IN ('Signed','Amended')").get(req.params.id, mine(req)); if (!e) return bad(res, 'You do not have permission to access this record.', 403);
  S.audit(req.user, 'portal.visit_viewed', 'encounter', e.id); res.json({ ...visitView(e), prescriptions: db.prepare('SELECT drug,dose,frequency,duration,instructions,status FROM prescriptions WHERE encounter_id=?').all(e.id) }); });
router.get('/me/prescriptions', me, (req, res) => res.json(db.prepare('SELECT r.drug,r.strength,r.dose,r.route,r.frequency,r.duration,r.instructions,r.status,r.created_at,u.name prescriber FROM prescriptions r LEFT JOIN users u ON u.id=r.prescriber_id WHERE r.patient_id=? ORDER BY r.id DESC').all(mine(req))));
router.get('/me/results', me, (req, res) => res.json(db.prepare('SELECT test,status,result,units,ref_range,result_at FROM investigations WHERE patient_id=? AND released=1 ORDER BY id DESC').all(mine(req))));
router.get('/me/appointments', me, (req, res) => res.json(db.prepare('SELECT ref,start,department,type,status,reason FROM appointments WHERE patient_id=? ORDER BY start DESC').all(mine(req))));
router.get('/me/followups', me, (req, res) => res.json(db.prepare('SELECT due_date,instructions,status FROM followups WHERE patient_id=? ORDER BY due_date').all(mine(req))));
router.post('/me/appointments', me, wrap((req, res) => { const b = req.body || {}; if (!b.start) return bad(res, 'Choose a preferred date and time.');
  const id = ins('appointments', { ref: 'AP-' + U.rand(6), patient_id: mine(req), start: b.start, reason: String(b.reason || '').slice(0, 300), department: b.department || null, type: b.type || 'Appointment', status: 'Requested' });
  S.audit(req.user, 'appointment.requested', 'appointment', id); res.status(201).json({ id, message: 'Your request was sent. It is not confirmed until the clinic accepts it.' }); }));
router.post('/me/requests', me, wrap((req, res) => { if (!String(req.body.text || '').trim()) return bad(res, 'Describe the change you need.');
  ins('requests', { patient_id: mine(req), kind: ['correction', 'access_help'].includes(req.body.kind) ? req.body.kind : 'correction', text: String(req.body.text).slice(0, 1000) }); S.audit(req.user, 'patient.request', 'patient', mine(req), 'success', req.body.kind); res.status(201).json({ ok: true }); }));
router.get('/me/export', me, (req, res) => { S.audit(req.user, 'portal.export', 'patient', mine(req)); const p = mine(req);
  res.set('Content-Disposition', 'attachment; filename="my-health-summary.json"').json({ generated: new Date().toISOString(), patient: db.prepare('SELECT mrn, full_name, dob FROM patients WHERE id=?').get(p),
    visits: db.prepare("SELECT e.*, u.name clinician FROM encounters e LEFT JOIN users u ON u.id=e.clinician_id WHERE e.patient_id=? AND e.released=1 AND e.status IN ('Signed','Amended')").all(p).map(visitView), prescriptions: db.prepare('SELECT drug,dose,frequency,duration,status FROM prescriptions WHERE patient_id=?').all(p) }); });
router.get('/requests', A.need('patient.write'), (req, res) => res.json(db.prepare('SELECT r.*, p.full_name, p.mrn FROM requests r JOIN patients p ON p.id=r.patient_id ORDER BY r.id DESC LIMIT 100').all()));
router.patch('/requests/:id', A.need('patient.write'), (req, res) => { db.prepare('UPDATE requests SET status=? WHERE id=?').run(req.body.status === 'Closed' ? 'Closed' : 'Open', req.params.id); S.audit(req.user, 'request.updated', 'request', req.params.id); res.json({ ok: true }); });
module.exports = { router };
