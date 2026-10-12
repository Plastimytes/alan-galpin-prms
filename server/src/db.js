const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(process.env.DB_FILE || path.join(dir, 'prms.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL, status TEXT DEFAULT 'Active', title TEXT, staff_id TEXT, department TEXT, category TEXT, licence_no TEXT, licence_body TEXT, licence_expiry TEXT,
 verification TEXT DEFAULT 'Pending Verification', mfa_secret TEXT, mfa_enabled INTEGER DEFAULT 0, patient_id INTEGER, failed INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0,
 claim_hash TEXT, claim_expires INTEGER, reset_hash TEXT, reset_expires INTEGER, theme TEXT DEFAULT 'light', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY, mrn TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, preferred_name TEXT, dob TEXT, sex TEXT, category TEXT DEFAULT 'Student',
 student_no TEXT, staff_no TEXT, phone TEXT, alt_phone TEXT, email TEXT, address TEXT, ec_name TEXT, ec_rel TEXT, ec_phone TEXT, language TEXT, accessibility TEXT,
 faculty TEXT, course TEXT, year_of_study TEXT, campus TEXT, hostel TEXT, department TEXT, blood_group TEXT, medical_history TEXT, status TEXT DEFAULT 'Active',
 privacy_ack INTEGER DEFAULT 0, source TEXT, merged_into INTEGER, claim_hash TEXT, claim_expires INTEGER, created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_p_name ON patients(full_name); CREATE INDEX IF NOT EXISTS ix_p_sn ON patients(student_no);
CREATE TABLE IF NOT EXISTS patient_identifiers(id INTEGER PRIMARY KEY, patient_id INTEGER, kind TEXT, value TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS allergies(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), substance TEXT NOT NULL, reaction TEXT, severity TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS encounters(id INTEGER PRIMARY KEY, enc_no TEXT UNIQUE, patient_id INTEGER NOT NULL REFERENCES patients(id), clinician_id INTEGER, visit_type TEXT, department TEXT,
 visit_date TEXT, status TEXT DEFAULT 'Draft', content TEXT, released INTEGER DEFAULT 0, appointment_id INTEGER, idem_key TEXT UNIQUE, signed_by INTEGER, signed_at TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_e_p ON encounters(patient_id, visit_date);
CREATE TABLE IF NOT EXISTS note_amendments(id INTEGER PRIMARY KEY, encounter_id INTEGER NOT NULL REFERENCES encounters(id), kind TEXT, reason TEXT, snapshot TEXT, text TEXT, by_user INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS prescriptions(id INTEGER PRIMARY KEY, rx_no TEXT UNIQUE, patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER, prescriber_id INTEGER, drug TEXT NOT NULL, generic TEXT,
 strength TEXT, form TEXT, dose TEXT, route TEXT, frequency TEXT, duration TEXT, quantity TEXT, instructions TEXT, warnings TEXT, status TEXT DEFAULT 'Prescribed', override_reason TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rx_events(id INTEGER PRIMARY KEY, rx_id INTEGER, status TEXT, reason TEXT, by_user INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY, ref TEXT UNIQUE, patient_id INTEGER NOT NULL REFERENCES patients(id), clinician_id INTEGER, department TEXT, type TEXT, start TEXT, status TEXT DEFAULT 'Requested', reason TEXT, created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS queue(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER, appointment_id INTEGER, number INTEGER, qdate TEXT, arrival TEXT, started TEXT,
 visit_type TEXT, triage TEXT DEFAULT 'Unassessed', status TEXT DEFAULT 'Checked In', clinician_id INTEGER);
CREATE TABLE IF NOT EXISTS investigations(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER, test TEXT NOT NULL, priority TEXT DEFAULT 'Routine', status TEXT DEFAULT 'Requested',
 result TEXT, units TEXT, ref_range TEXT, requested_by INTEGER, reviewed_by INTEGER, released INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, result_at TEXT);
CREATE TABLE IF NOT EXISTS referrals(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER, destination TEXT NOT NULL, reason TEXT, summary TEXT, priority TEXT DEFAULT 'Routine',
 status TEXT DEFAULT 'Pending', outcome TEXT, referred_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER, due_date TEXT, instructions TEXT, status TEXT DEFAULT 'Pending', created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, patient_id INTEGER, kind TEXT, text TEXT, status TEXT DEFAULT 'Open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, body TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS breakglass(id INTEGER PRIMARY KEY, user_id INTEGER, patient_id INTEGER, reason TEXT, expires INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, ts TEXT, user_id INTEGER, user_name TEXT, event TEXT, entity TEXT, entity_id TEXT, outcome TEXT, detail TEXT, prev_hash TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);
module.exports = db;
