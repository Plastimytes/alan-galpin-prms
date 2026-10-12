const router = require('express').Router();
const db = require('./db'), S = require('./sec'), A = require('./auth'), U = require('./util');
const { wrap, missing, pick, ins, upd, today, age, mrn, rand } = U;
const bad = (res, msg, code = 400, extra = {}) => res.status(code).json({ error: msg, ...extra });
const PFIELDS = ['full_name', 'preferred_name', 'dob', 'sex', 'category', 'student_no', 'staff_no', 'phone', 'alt_phone', 'email', 'address', 'ec_name', 'ec_rel', 'ec_phone', 'language', 'accessibility', 'faculty', 'course', 'year_of_study', 'campus', 'hostel', 'department', 'blood_group', 'medical_history', 'source'];
const MIN = 'id,mrn,full_name,dob,category,student_no,course,year_of_study,status';
const asRow = r => ({ ...r, age: age(r.dob) });

// ---- Patients
router.get('/patients', A.need('patient.read', 'patient.min'), wrap((req, res) => {
  const { q = '', category = '', page = 1, sort = 'full_name', dir = 'asc' } = req.query, lim = 15, off = (Math.max(1, +page) - 1) * lim;
  const s = ['full_name', 'mrn', 'created_at', 'dob'].includes(sort) ? sort : 'full_name', d = dir === 'desc' ? 'DESC' : 'ASC';
  const like = `%${q}%`, ph = req.perms.includes('patient.read') ? 'OR phone LIKE @l' : '';
  const where = `status!='Merged' AND (@q='' OR full_name LIKE @l OR preferred_name LIKE @l OR mrn LIKE @l OR student_no LIKE @l OR staff_no LIKE @l ${ph} OR id IN (SELECT patient_id FROM appointments WHERE ref LIKE @l)) AND (@c='' OR category=@c)`;
  const p = { q, l: like, c: category };
  const rows = db.prepare(`SELECT ${MIN}, (SELECT COUNT(*) FROM allergies a WHERE a.patient_id=patients.id AND active=1) allergy_count FROM patients WHERE ${where} ORDER BY ${s} ${d} LIMIT ${lim} OFFSET ${off}`).all(p);
  res.json({ rows: rows.map(r => ({ ...asRow(r), allergy_count: req.perms.includes('clinical.read') ? r.allergy_count : undefined })), total: db.prepare(`SELECT COUNT(*) c FROM patients WHERE ${where}`).get(p).c, page: +page, limit: lim });
}));
router.get('/patients/duplicates', A.need('patient.read'), (req, res) => res.json(findDup(req.query)));
function findDup(b) {
  const out = []; const add = (r, why) => r && !out.find(o => o.id === r.id) && out.push({ id: r.id, mrn: r.mrn, full_name: r.full_name, dob: r.dob, student_no: r.student_no, why });
  if (b.full_name && b.dob) db.prepare("SELECT * FROM patients WHERE lower(full_name)=lower(?) AND dob=? AND status!='Merged'").all(b.full_name.trim(), b.dob).forEach(r => add(r, 'Same name and date of birth'));
  if (b.student_no) db.prepare("SELECT * FROM patients WHERE student_no=? AND status!='Merged'").all(b.student_no.trim()).forEach(r => add(r, 'Same student number'));
  if (b.phone) db.prepare("SELECT * FROM patients WHERE phone=? AND status!='Merged'").all(b.phone.trim()).forEach(r => add(r, 'Same telephone number'));
  return out;
}
const createPatient = (b, user, extra = {}) => db.transaction(() => {
  const id = ins('patients', { ...pick(b, PFIELDS), mrn: mrn(), privacy_ack: b.privacy_ack ? 1 : 0, created_by: user.id, ...extra });
  (b.allergies || []).filter(a => a.substance).forEach(a => ins('allergies', { patient_id: id, substance: a.substance.trim(), reaction: a.reaction || '', severity: a.severity || '' }));
  return id; })();
router.post('/patients', A.need('patient.write'), wrap((req, res) => {
  const b = req.body || {}, m = missing(b, ['full_name', 'dob']); if (m.length) return bad(res, 'Enter ' + m.map(x => x === 'full_name' ? 'the full name' : 'the date of birth').join(' and ') + '.');
  if (new Date(b.dob) > new Date()) return bad(res, 'Date of birth cannot be in the future.');
  const dups = findDup(b); if (dups.length && !b.force) return bad(res, 'Possible duplicate records found.', 409, { duplicates: dups });
  if (!b.privacy_ack) return bad(res, 'Record that the privacy notice was acknowledged.');
  const id = createPatient(b, req.user); const p = db.prepare('SELECT id,mrn,full_name FROM patients WHERE id=?').get(id);
  S.audit(req.user, 'patient.created', 'patient', id, 'success', dups.length ? 'registered despite duplicate warning' : ''); res.status(201).json(p);
}));
router.get('/patients/:id', A.need('patient.read'), wrap((req, res) => {
  const p = db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id); if (!p) return bad(res, 'Patient not found.', 404);
  const { claim_hash, claim_expires, ...pub } = p; const clin = A.canClinical(req, p.id);
  S.audit(req.user, 'patient.viewed', 'patient', p.id);
  res.json({ ...pub, age: age(p.dob), allergies: clin ? db.prepare('SELECT * FROM allergies WHERE patient_id=? AND active=1').all(p.id) : null, has_account: !!db.prepare('SELECT 1 FROM users WHERE patient_id=?').get(p.id), clinical_access: clin });
}));
router.put('/patients/:id', A.need('patient.write'), wrap((req, res) => {
  const o = pick(req.body, PFIELDS); delete o.source; if ('full_name' in o && !o.full_name) return bad(res, 'Full name is required.');
  upd('patients', req.params.id, { ...o, updated_at: new Date().toISOString() }); S.audit(req.user, 'patient.updated', 'patient', req.params.id, 'success', Object.keys(o).join(',')); res.json({ ok: true });
}));
router.post('/patients/:id/allergies', A.need('clinical.write'), A.clinicalGuard(r => r.params.id), wrap((req, res) => {
  if (!req.body.substance) return bad(res, 'Enter the substance.');
  const id = ins('allergies', { patient_id: req.params.id, ...pick(req.body, ['substance', 'reaction', 'severity']) }); S.audit(req.user, 'allergy.added', 'patient', req.params.id); res.status(201).json({ id });
}));
router.delete('/patients/:id/allergies/:aid', A.need('clinical.write'), wrap((req, res) => { db.prepare('UPDATE allergies SET active=0 WHERE id=? AND patient_id=?').run(req.params.aid, req.params.id); S.audit(req.user, 'allergy.deactivated', 'patient', req.params.id); res.json({ ok: true }); }));
router.post('/patients/:id/invite', A.need('patient.invite'), wrap((req, res) => {
  if (!req.body.identity_verified) return bad(res, 'Confirm that the patient\'s identity was checked in person or by an approved process.');
  const code = S.token().slice(0, 10).toUpperCase(); db.prepare('UPDATE patients SET claim_hash=?, claim_expires=? WHERE id=?').run(S.sha(code), Date.now() + 7 * 864e5, req.params.id);
  S.audit(req.user, 'patient.invited', 'patient', req.params.id, 'success', req.body.method || ''); res.json({ code, expires_days: 7 });
}));
router.post('/patients/merge', A.need('patient.merge'), wrap((req, res) => {
  const { keep_id, merge_id, reason } = req.body || {}; if (!keep_id || !merge_id || keep_id === merge_id || !reason) return bad(res, 'Choose two different records and give a reason.');
  const k = db.prepare('SELECT * FROM patients WHERE id=?').get(keep_id), m = db.prepare('SELECT * FROM patients WHERE id=?').get(merge_id); if (!k || !m) return bad(res, 'Record not found.', 404);
  db.transaction(() => { for (const t of ['allergies', 'encounters', 'prescriptions', 'appointments', 'queue', 'investigations', 'referrals', 'followups']) db.prepare(`UPDATE ${t} SET patient_id=? WHERE patient_id=?`).run(k.id, m.id);
    ins('patient_identifiers', { patient_id: k.id, kind: 'merged_mrn', value: m.mrn, note: reason }); db.prepare("UPDATE patients SET status='Merged', merged_into=? WHERE id=?").run(k.id, m.id); })();
  S.audit(req.user, 'patient.merged', 'patient', k.id, 'success', `${m.mrn} into ${k.mrn}: ${reason}`); res.json({ ok: true });
}));
router.post('/patients/:id/break-glass', A.need('patient.read'), wrap((req, res) => {
  if (String(req.body.reason || '').trim().length < 10) return bad(res, 'Give a clear reason (at least 10 characters).');
  ins('breakglass', { user_id: req.user.id, patient_id: req.params.id, reason: req.body.reason, expires: Date.now() + 60 * 60000 });
  S.audit(req.user, 'breakglass.activated', 'patient', req.params.id, 'success', req.body.reason);
  db.prepare("SELECT id FROM users WHERE role='super_admin'").all().forEach(a => S.notify(a.id, 'Emergency record access', `${req.user.name} opened a record for 60 minutes. Review the audit log.`));
  res.json({ ok: true, expires_minutes: 60 });
}));

// ---- Encounters (clinical notes)
const CONTENT = ['complaint', 'complaints', 'onset', 'duration', 'hpi', 'history', 'vitals', 'exam', 'impression', 'diagnosis', 'diagnosis_certainty', 'differentials', 'assessment', 'treatment', 'procedures', 'education', 'plan', 'disposition', 'discharge', 'care_notes', 'consent', 'restricted_note'];
const DX_ONLY = ['impression', 'diagnosis', 'diagnosis_certainty', 'differentials', 'assessment'];
const cleanContent = (req, c) => { const o = {}; CONTENT.forEach(k => { if (c && c[k] !== undefined) o[k] = c[k]; }); if (!req.perms.includes('diagnose')) DX_ONLY.forEach(k => delete o[k]); return o; };
const encRow = (e, full) => { const c = S.dec(e.content); const base = { id: e.id, enc_no: e.enc_no, patient_id: e.patient_id, clinician_id: e.clinician_id, visit_type: e.visit_type, department: e.department, visit_date: e.visit_date, status: e.status, released: !!e.released, signed_at: e.signed_at, clinician: e.clinician };
  return full ? { ...base, content: c } : { ...base, complaint: c.complaint, diagnosis: c.diagnosis, treatment: c.treatment }; };
const EQ = 'SELECT e.*, u.name clinician FROM encounters e LEFT JOIN users u ON u.id=e.clinician_id';
router.post('/encounters', A.need('clinical.write'), A.clinicalGuard(r => r.body.patient_id), wrap((req, res) => {
  const b = req.body || {}; if (!b.patient_id) return bad(res, 'Choose a patient.');
  if (b.idem_key) { const ex = db.prepare('SELECT * FROM encounters WHERE idem_key=?').get(b.idem_key); if (ex) return res.json(encRow(db.prepare(EQ + ' WHERE e.id=?').get(ex.id))); }
  const id = ins('encounters', { enc_no: 'E-' + new Date().getFullYear() + '-' + rand(6), patient_id: b.patient_id, clinician_id: req.user.id, visit_type: b.visit_type || 'Walk-in', department: b.department || req.user.department,
    visit_date: today(), content: S.enc(cleanContent(req, b.content)), appointment_id: b.appointment_id || null, idem_key: b.idem_key || null });
  if (b.queue_id) db.prepare("UPDATE queue SET encounter_id=?, status='In Consultation', clinician_id=?, started=? WHERE id=?").run(id, req.user.id, new Date().toISOString(), b.queue_id);
  S.audit(req.user, 'encounter.created', 'encounter', id); res.status(201).json(encRow(db.prepare(EQ + ' WHERE e.id=?').get(id), true));
}));
const loadEnc = req => db.prepare(EQ + ' WHERE e.id=?').get(req.params.id);
const encGuard = (req, res, next) => { const e = loadEnc(req); if (!e) return bad(res, 'Visit not found.', 404); req.enc = e; return A.clinicalGuard(() => e.patient_id)(req, res, next); };
router.get('/encounters', A.need('clinical.read'), wrap((req, res) => {
  const { status = '', mine = '' } = req.query;
  res.json(db.prepare(EQ.replace('e.*,', 'e.*, p.full_name patient_name, p.mrn,') + " JOIN patients p ON p.id=e.patient_id WHERE (?='' OR e.status=?) AND (?='' OR e.clinician_id=?) ORDER BY e.visit_date DESC, e.id DESC LIMIT 200").all(status, status, mine, req.user.id)
    .map(e => ({ ...encRow(e), patient_name: e.patient_name, mrn: e.mrn })));
}));
router.get('/encounters/:id', A.need('patient.read', 'patient.min'), encGuard, wrap((req, res) => {
  S.audit(req.user, 'encounter.viewed', 'encounter', req.enc.id);
  res.json({ ...encRow(req.enc, true), amendments: db.prepare('SELECT a.id,a.kind,a.reason,a.text,a.at,u.name by_name FROM note_amendments a LEFT JOIN users u ON u.id=a.by_user WHERE encounter_id=? ORDER BY a.id').all(req.enc.id) });
}));
router.put('/encounters/:id', A.need('clinical.write'), encGuard, wrap((req, res) => {
  const e = req.enc; if (!['Draft', 'Pending Signature'].includes(e.status)) return bad(res, 'Signed notes cannot be edited. Use an amendment or addendum.', 409);
  if (e.clinician_id !== req.user.id && !req.perms.includes('diagnose')) return bad(res, 'Only the author or a doctor can edit this draft.', 403);
  const prev = S.dec(e.content), next = { ...prev, ...cleanContent(req, req.body.content) };
  upd('encounters', e.id, { content: S.enc(next), updated_at: new Date().toISOString(), status: 'Draft', ...pick(req.body, ['visit_type', 'department']) });
  S.audit(req.user, 'encounter.saved', 'encounter', e.id); res.json({ ok: true, saved_at: new Date().toISOString() });
}));
router.post('/encounters/:id/sign', A.need('clinical.write'), encGuard, wrap((req, res) => {
  const e = req.enc; if (!['Draft', 'Pending Signature'].includes(e.status)) return bad(res, 'This note is already signed.', 409);
  const c = S.dec(e.content); if (!c.complaint || !String(c.complaint).trim()) return bad(res, 'Record the presenting complaint before signing.');
  upd('encounters', e.id, { status: 'Signed', signed_by: req.user.id, signed_at: new Date().toISOString() });
  db.prepare("UPDATE queue SET status='Completed' WHERE encounter_id=?").run(e.id); S.audit(req.user, 'encounter.signed', 'encounter', e.id); res.json({ ok: true });
}));
router.post('/encounters/:id/amend', A.need('clinical.write'), encGuard, wrap((req, res) => {
  const e = req.enc; if (!['Signed', 'Amended'].includes(e.status)) return bad(res, 'Only signed notes can be amended.', 409);
  if (String(req.body.reason || '').trim().length < 5) return bad(res, 'Give the reason for the amendment.');
  db.transaction(() => { ins('note_amendments', { encounter_id: e.id, kind: 'Amendment', reason: req.body.reason, snapshot: e.content, by_user: req.user.id });
    upd('encounters', e.id, { content: S.enc({ ...S.dec(e.content), ...cleanContent(req, req.body.content) }), status: 'Amended', updated_at: new Date().toISOString() }); })();
  S.audit(req.user, 'encounter.amended', 'encounter', e.id, 'success', req.body.reason); res.json({ ok: true });
}));
router.post('/encounters/:id/addendum', A.need('clinical.write'), encGuard, wrap((req, res) => {
  if (!['Signed', 'Amended'].includes(req.enc.status)) return bad(res, 'Addenda apply to signed notes.', 409); if (!String(req.body.text || '').trim()) return bad(res, 'Enter the addendum text.');
  ins('note_amendments', { encounter_id: req.enc.id, kind: 'Addendum', text: req.body.text, by_user: req.user.id }); S.audit(req.user, 'encounter.addendum', 'encounter', req.enc.id); res.json({ ok: true });
}));
router.post('/encounters/:id/release', A.need('diagnose'), encGuard, wrap((req, res) => {
  if (!['Signed', 'Amended'].includes(req.enc.status)) return bad(res, 'Sign the note before releasing it to the patient.', 409);
  const r = req.body.released ? 1 : 0; upd('encounters', req.enc.id, { released: r }); S.audit(req.user, r ? 'encounter.released' : 'encounter.unreleased', 'encounter', req.enc.id);
  const u = db.prepare('SELECT id FROM users WHERE patient_id=?').get(req.enc.patient_id); if (r && u) S.notify(u.id, 'A visit summary is available', 'Sign in to view it.'); res.json({ ok: true });
}));
router.get('/patients/:id/encounters', A.need('patient.read'), A.clinicalGuard(r => r.params.id), wrap((req, res) => {
  const { type = '', dept = '', status = '' } = req.query; S.audit(req.user, 'history.viewed', 'patient', req.params.id);
  res.json(db.prepare(EQ + " WHERE e.patient_id=? AND (?='' OR e.visit_type=?) AND (?='' OR e.department=?) AND (?='' OR e.status=?) ORDER BY e.visit_date DESC, e.id DESC").all(req.params.id, type, type, dept, dept, status, status).map(e => encRow(e)));
}));
router.get('/patients/:id/timeline', A.need('patient.read'), A.clinicalGuard(r => r.params.id), wrap((req, res) => {
  const id = req.params.id, t = [];
  db.prepare('SELECT * FROM encounters WHERE patient_id=?').all(id).forEach(e => t.push({ type: 'Visit', date: e.visit_date, title: (S.dec(e.content).complaint || 'Visit') + ' (' + e.status + ')', ref: e.id }));
  db.prepare('SELECT * FROM prescriptions WHERE patient_id=?').all(id).forEach(r => t.push({ type: 'Medication', date: r.created_at.slice(0, 10), title: `${r.drug} ${r.dose || ''} (${r.status})`, ref: r.id }));
  db.prepare('SELECT * FROM investigations WHERE patient_id=?').all(id).forEach(r => t.push({ type: 'Investigation', date: r.created_at.slice(0, 10), title: `${r.test} (${r.status})`, ref: r.id }));
  db.prepare('SELECT * FROM referrals WHERE patient_id=?').all(id).forEach(r => t.push({ type: 'Referral', date: r.created_at.slice(0, 10), title: `${r.destination} (${r.status})`, ref: r.id }));
  db.prepare('SELECT * FROM followups WHERE patient_id=?').all(id).forEach(r => t.push({ type: 'Follow-up', date: r.due_date, title: `${r.instructions || 'Review'} (${r.status})`, ref: r.id }));
  res.json(t.sort((a, b) => String(b.date).localeCompare(String(a.date))));
}));

// ---- Prescriptions
const RXF = ['drug', 'generic', 'strength', 'form', 'dose', 'route', 'frequency', 'duration', 'quantity', 'instructions', 'warnings'];
const RQ = 'SELECT r.*, u.name prescriber, p.full_name patient_name, p.mrn FROM prescriptions r LEFT JOIN users u ON u.id=r.prescriber_id JOIN patients p ON p.id=r.patient_id';
router.get('/prescriptions', A.need('clinical.read', 'dispense'), wrap((req, res) => {
  const { status = '', patient_id = '' } = req.query; res.json(db.prepare(RQ + " WHERE (?='' OR r.status=?) AND (?='' OR r.patient_id=?) ORDER BY r.id DESC LIMIT 200").all(status, status, patient_id, patient_id));
}));
router.post('/prescriptions', A.need('prescribe'), A.clinicalGuard(r => r.body.patient_id), wrap((req, res) => {
  const b = req.body || {}, m = missing(b, ['patient_id', 'drug', 'dose', 'route', 'frequency', 'duration']); if (m.length) return bad(res, 'Complete the required fields: ' + m.join(', ') + '.');
  if (!b.confirm) return bad(res, 'Confirm the prescription before finalising.');
  const names = [b.drug, b.generic].filter(Boolean).map(x => x.toLowerCase());
  const al = db.prepare('SELECT * FROM allergies WHERE patient_id=? AND active=1').all(b.patient_id).filter(a => names.some(n => n.includes(a.substance.toLowerCase()) || a.substance.toLowerCase().includes(n.split(' ')[0])));
  if (al.length && !String(b.override_reason || '').trim()) return bad(res, 'Allergy alert: ' + al.map(a => a.substance + (a.reaction ? ` (${a.reaction})` : '')).join(', ') + '. Give an override reason to continue.', 409, { allergy_alert: al });
  const dup = db.prepare("SELECT * FROM prescriptions WHERE patient_id=? AND status IN ('Prescribed','Dispensed','Administered') AND lower(drug)=lower(?)").get(b.patient_id, b.drug);
  if (dup && !b.ack_duplicate) return bad(res, `${dup.drug} is already an active prescription (${dup.rx_no}). Acknowledge to prescribe again.`, 409, { duplicate: dup.rx_no });
  const id = ins('prescriptions', { ...pick(b, RXF), rx_no: 'RX-' + new Date().getFullYear() + '-' + rand(6), patient_id: b.patient_id, encounter_id: b.encounter_id || null, prescriber_id: req.user.id, override_reason: b.override_reason || null });
  ins('rx_events', { rx_id: id, status: 'Prescribed', by_user: req.user.id, reason: b.override_reason || '' }); S.audit(req.user, 'prescription.created', 'prescription', id, 'success', al.length ? 'allergy override' : ''); res.status(201).json({ id });
}));
const RXT = { Prescribed: ['Dispensed', 'Cancelled', 'Discontinued'], Dispensed: ['Administered', 'Discontinued'], Administered: ['Discontinued'] };
router.patch('/prescriptions/:id/status', A.need('prescribe', 'dispense', 'administer'), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(req.params.id); if (!r) return bad(res, 'Not found', 404); const s = req.body.status;
  if (!(RXT[r.status] || []).includes(s)) return bad(res, `A ${r.status} prescription cannot become ${s}.`, 409);
  const need = { Dispensed: 'dispense', Administered: 'administer', Cancelled: 'prescribe', Discontinued: 'prescribe' }[s]; if (!req.perms.includes(need)) return bad(res, 'You do not have permission to do this.', 403);
  if (['Cancelled', 'Discontinued'].includes(s) && !String(req.body.reason || '').trim()) return bad(res, 'Give a reason.');
  upd('prescriptions', r.id, { status: s, updated_at: new Date().toISOString() }); ins('rx_events', { rx_id: r.id, status: s, reason: req.body.reason || '', by_user: req.user.id }); S.audit(req.user, 'prescription.' + s.toLowerCase(), 'prescription', r.id); res.json({ ok: true });
}));
router.get('/prescriptions/:id/events', A.need('clinical.read', 'dispense'), (req, res) => res.json(db.prepare('SELECT e.*, u.name by_name FROM rx_events e LEFT JOIN users u ON u.id=e.by_user WHERE rx_id=? ORDER BY e.id').all(req.params.id)));
router.get('/prescriptions/:id/print', A.need('clinical.read', 'dispense'), wrap((req, res) => {
  const r = db.prepare(RQ + ' WHERE r.id=?').get(req.params.id); if (!r) return res.status(404).send('Not found');
  S.audit(req.user, 'prescription.printed', 'prescription', r.id); const x = s => String(s ?? '-').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  res.type('html').send(`<!doctype html><meta charset=utf-8><title>${x(r.rx_no)}</title><style>body{font:14px Inter,Arial,sans-serif;max-width:720px;margin:24px auto;color:#242629}header{display:flex;gap:14px;align-items:center;border-bottom:3px solid #00A9B7;padding-bottom:10px}img{height:56px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:7px;border-bottom:1px solid #E5E7EB}td:first-child{color:#73777A;width:34%}.n{margin-top:20px;font-size:12px;color:#73777A}@media print{button{display:none}}</style>
<header><img src="/ucu-logo.jpg" alt=""><div><h1>ALAN GALPIN UCU</h1>Patient Records Management System · Prescription</div></header>
<table><tr><td>Reference</td><td><b>${x(r.rx_no)}</b></td></tr><tr><td>Patient</td><td>${x(r.patient_name)} (${x(r.mrn)})</td></tr><tr><td>Date</td><td>${x(r.created_at)}</td></tr><tr><td>Medication</td><td><b>${x(r.drug)}</b> ${x(r.strength)} ${x(r.form)}</td></tr><tr><td>Dose / route</td><td>${x(r.dose)} · ${x(r.route)}</td></tr><tr><td>Frequency / duration</td><td>${x(r.frequency)} · ${x(r.duration)}</td></tr><tr><td>Quantity</td><td>${x(r.quantity)}</td></tr><tr><td>Instructions</td><td>${x(r.instructions)}</td></tr><tr><td>Warnings</td><td>${x(r.warnings)}</td></tr><tr><td>Status</td><td>${x(r.status)}</td></tr><tr><td>Prescriber</td><td>${x(r.prescriber)} (electronically authenticated)</td></tr></table>
<p class=n>Confidential medical document. Use only as directed by the prescriber. Signed copy requires prescriber authentication.</p><button onclick="print()">Print</button>`);
}));

// ---- Queue, triage and emergency
const QQ = 'SELECT q.*, p.full_name, p.mrn, u.name clinician FROM queue q JOIN patients p ON p.id=q.patient_id LEFT JOIN users u ON u.id=q.clinician_id';
const QSTAT = ['Registered', 'Checked In', 'Waiting for Triage', 'In Triage', 'Waiting for Clinician', 'In Consultation', 'Awaiting Investigation', 'Awaiting Prescription or Treatment', 'Ready for Discharge', 'Completed', 'Cancelled', 'Referred'];
router.get('/queue', A.need('queue.manage', 'patient.read'), (req, res) => {
  const rows = db.prepare(QQ + ' WHERE q.qdate=? ORDER BY q.number').all(req.query.date || today());
  const w = { Emergency: 0, Urgent: 1, Routine: 2, Unassessed: 3 }; // display only; priority is set by clinical triage
  res.json({ statuses: QSTAT, rows: rows.map(r => ({ ...r, waiting_min: ['Completed', 'Cancelled', 'Referred'].includes(r.status) ? null : Math.round((Date.now() - new Date(r.arrival)) / 60000) })).sort((a, b) => (w[a.triage] - w[b.triage]) || a.number - b.number) });
});
router.post('/queue', A.need('queue.manage'), wrap((req, res) => {
  const b = req.body || {}; if (!b.patient_id) return bad(res, 'Choose a patient.');
  if (db.prepare("SELECT 1 FROM queue WHERE patient_id=? AND qdate=? AND status NOT IN ('Completed','Cancelled','Referred')").get(b.patient_id, today())) return bad(res, 'This patient is already in today\'s queue.', 409);
  const n = db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM queue WHERE qdate=?').get(today()).n;
  const id = ins('queue', { patient_id: b.patient_id, appointment_id: b.appointment_id || null, number: n, qdate: today(), arrival: new Date().toISOString(), visit_type: b.visit_type || 'Walk-in', status: 'Checked In' });
  if (b.appointment_id) db.prepare("UPDATE appointments SET status='Checked In' WHERE id=?").run(b.appointment_id); S.audit(req.user, 'queue.checkin', 'queue', id); res.status(201).json({ id, number: n });
}));
router.patch('/queue/:id', A.need('queue.manage'), wrap((req, res) => {
  const o = pick(req.body, ['status', 'triage', 'clinician_id']); if (o.status && !QSTAT.includes(o.status)) return bad(res, 'Invalid status.');
  if (o.triage) { if (!req.perms.includes('triage')) return bad(res, 'Only clinical staff can assign triage priority.', 403); if (!['Emergency', 'Urgent', 'Routine', 'Unassessed'].includes(o.triage)) return bad(res, 'Invalid triage.'); }
  upd('queue', req.params.id, o); S.audit(req.user, 'queue.updated', 'queue', req.params.id, 'success', JSON.stringify(o)); res.json({ ok: true });
}));
router.post('/queue/emergency', A.need('queue.manage'), wrap((req, res) => { // minimum record: nothing is required, details are completed later
  const b = req.body || {}, pid = b.patient_id || createPatient({ full_name: b.full_name || 'Unidentified emergency patient', dob: b.dob || null, source: 'Emergency', privacy_ack: 0 }, req.user, { status: 'Incomplete registration' });
  const n = db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM queue WHERE qdate=?').get(today()).n;
  const id = ins('queue', { patient_id: pid, number: n, qdate: today(), arrival: new Date().toISOString(), visit_type: 'Emergency', triage: 'Emergency', status: 'Waiting for Clinician' });
  db.prepare("SELECT id FROM users WHERE role IN ('doctor','nurse') AND status='Active'").all().forEach(u => S.notify(u.id, 'Emergency case in queue', 'Immediate assessment required.'));
  S.audit(req.user, 'emergency.escalated', 'queue', id, 'success', b.note || ''); res.status(201).json({ id, patient_id: pid });
}));

// ---- Appointments (patients may only request; staff confirm)
const AQ = 'SELECT a.*, p.full_name, p.mrn, u.name clinician FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.clinician_id';
const ASTAT = ['Requested', 'Pending Confirmation', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show', 'Rescheduled'];
router.get('/appointments', A.need('appt.manage', 'patient.read'), (req, res) => {
  const { from = '', to = '', status = '' } = req.query; res.json(db.prepare(AQ + " WHERE (?='' OR substr(a.start,1,10)>=?) AND (?='' OR substr(a.start,1,10)<=?) AND (?='' OR a.status=?) ORDER BY a.start LIMIT 300").all(from, from, to, to, status, status));
});
router.post('/appointments', A.need('appt.manage'), wrap((req, res) => {
  const b = req.body || {}, m = missing(b, ['patient_id', 'start']); if (m.length) return bad(res, 'Choose the patient and the date and time.');
  const id = ins('appointments', { ...pick(b, ['patient_id', 'clinician_id', 'department', 'type', 'start', 'reason']), ref: 'AP-' + rand(6), status: 'Confirmed', created_by: req.user.id });
  S.audit(req.user, 'appointment.created', 'appointment', id); res.status(201).json({ id });
}));
router.patch('/appointments/:id', A.need('appt.manage'), wrap((req, res) => {
  const o = pick(req.body, ['status', 'start', 'clinician_id', 'department']); if (o.status && !ASTAT.includes(o.status)) return bad(res, 'Invalid status.');
  const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id); upd('appointments', a.id, o);
  const pu = db.prepare('SELECT id FROM users WHERE patient_id=?').get(a.patient_id); if (pu && o.status) S.notify(pu.id, 'Appointment update', `Your appointment ${a.ref} is now: ${o.status}.`);
  S.audit(req.user, 'appointment.updated', 'appointment', a.id, 'success', JSON.stringify(o)); res.json({ ok: true });
}));

// ---- Investigations, referrals, follow-ups
const IQ = 'SELECT i.*, p.full_name, p.mrn, u.name requester FROM investigations i JOIN patients p ON p.id=i.patient_id LEFT JOIN users u ON u.id=i.requested_by';
router.get('/investigations', A.need('clinical.read', 'invest.work'), (req, res) => res.json(db.prepare(IQ + " WHERE (?='' OR i.patient_id=?) ORDER BY i.id DESC LIMIT 200").all(req.query.patient_id || '', req.query.patient_id || '')));
router.post('/investigations', A.need('invest.manage'), A.clinicalGuard(r => r.body.patient_id), wrap((req, res) => {
  if (missing(req.body, ['patient_id', 'test']).length) return bad(res, 'Choose the patient and the test.'); const id = ins('investigations', { ...pick(req.body, ['patient_id', 'encounter_id', 'test', 'priority']), requested_by: req.user.id });
  S.audit(req.user, 'investigation.requested', 'investigation', id); res.status(201).json({ id });
}));
const IST = ['Requested', 'Collected', 'In Progress', 'Completed', 'Reviewed', 'Released', 'Cancelled'];
router.patch('/investigations/:id', A.need('invest.manage', 'invest.work'), wrap((req, res) => {
  const i = db.prepare('SELECT * FROM investigations WHERE id=?').get(req.params.id), o = pick(req.body, ['status', 'result', 'units', 'ref_range']); if (!i) return bad(res, 'Not found', 404);
  if (o.status && !IST.includes(o.status)) return bad(res, 'Invalid status.'); const result = o.result ?? i.result;
  if (['Completed', 'Reviewed', 'Released'].includes(o.status) && !String(result || '').trim()) return bad(res, 'Record a result before marking this investigation completed.');
  if (['Reviewed', 'Released'].includes(o.status)) { if (!req.perms.includes('invest.manage')) return bad(res, 'A clinician must review results.', 403); o.reviewed_by = req.user.id; }
  if (o.status === 'Completed') o.result_at = new Date().toISOString(); if (o.status === 'Released') { if (i.status !== 'Reviewed' && !i.reviewed_by) return bad(res, 'Review the result before releasing it.', 409); o.released = 1; }
  upd('investigations', i.id, o); S.audit(req.user, 'investigation.updated', 'investigation', i.id, 'success', o.status || '');
  if (o.status === 'Released') { const pu = db.prepare('SELECT id FROM users WHERE patient_id=?').get(i.patient_id); if (pu) S.notify(pu.id, 'A test result is available', 'Sign in to view it.'); } res.json({ ok: true });
}));
const RQF = 'SELECT r.*, p.full_name, p.mrn, u.name referrer FROM referrals r JOIN patients p ON p.id=r.patient_id LEFT JOIN users u ON u.id=r.referred_by';
router.get('/referrals', A.need('clinical.read'), (req, res) => res.json(db.prepare(RQF + " WHERE (?='' OR r.patient_id=?) ORDER BY r.id DESC LIMIT 200").all(req.query.patient_id || '', req.query.patient_id || '')));
router.post('/referrals', A.need('referral.manage'), A.clinicalGuard(r => r.body.patient_id), wrap((req, res) => {
  if (missing(req.body, ['patient_id', 'destination', 'reason']).length) return bad(res, 'Enter the patient, destination and reason.');
  const id = ins('referrals', { ...pick(req.body, ['patient_id', 'encounter_id', 'destination', 'reason', 'summary', 'priority']), referred_by: req.user.id }); S.audit(req.user, 'referral.created', 'referral', id); res.status(201).json({ id });
}));
router.patch('/referrals/:id', A.need('referral.manage'), wrap((req, res) => {
  const o = pick(req.body, ['status', 'outcome']); if (o.status && !['Pending', 'Sent', 'Accepted', 'Completed', 'Cancelled'].includes(o.status)) return bad(res, 'Invalid status.');
  if (o.status === 'Completed' && !String(o.outcome || '').trim()) return bad(res, 'Record the outcome or feedback before marking a referral completed.');
  upd('referrals', req.params.id, o); S.audit(req.user, 'referral.updated', 'referral', req.params.id, 'success', o.status || ''); res.json({ ok: true });
}));
const FQ = 'SELECT f.*, p.full_name, p.mrn FROM followups f JOIN patients p ON p.id=f.patient_id';
router.get('/followups', A.need('clinical.read', 'appt.manage'), (req, res) => res.json(db.prepare(FQ + " WHERE (?='' OR f.patient_id=?) ORDER BY f.due_date LIMIT 200").all(req.query.patient_id || '', req.query.patient_id || '')));
router.post('/followups', A.need('clinical.write', 'appt.manage'), wrap((req, res) => {
  if (missing(req.body, ['patient_id', 'due_date']).length) return bad(res, 'Choose the patient and the due date.'); const id = ins('followups', { ...pick(req.body, ['patient_id', 'encounter_id', 'due_date', 'instructions']), created_by: req.user.id });
  S.audit(req.user, 'followup.created', 'followup', id); res.status(201).json({ id });
}));
router.patch('/followups/:id', A.need('clinical.write', 'appt.manage'), wrap((req, res) => { const o = pick(req.body, ['status', 'due_date']); if (o.status && !['Pending', 'Completed', 'Missed', 'Cancelled'].includes(o.status)) return bad(res, 'Invalid status.'); upd('followups', req.params.id, o); res.json({ ok: true }); }));

// ---- Notifications
router.get('/notifications', (req, res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)));
router.post('/notifications/read', (req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });
module.exports = { router, createPatient };
