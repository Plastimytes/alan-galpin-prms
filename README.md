# Alan Galpin UCU Patient Records Management System

A full-stack patient records system for the Alan Galpin University Health Centre, Uganda Christian University.
Frontend: React, Vite and TypeScript. Backend: Node.js (JavaScript), Express and SQLite.

This is a working local build with fictional demonstration data. It is not production-ready. See "Before real use" below.

## Requirements

- Node.js 20 or newer (tested on Node 22) and npm
- No database server is needed. SQLite runs inside the backend.

## Quick start

    npm run setup      # installs root, server and client dependencies
    npm run seed       # loads fictional demo data (first time only)
    npm run dev        # starts the API on :4000 and the web app on :5173

Open http://localhost:5173

To run as a single server instead (serves the built web app and the API together):

    npm start          # builds the client, then serves everything on http://localhost:4000

To wipe and reload the demo data: `npm run seed -- --reset`

## Demo accounts

All demo accounts use the password `Demo@12345`. Sign in with the username shown.

| Username | Role |
|---|---|
| admin | Super administrator |
| records | Clinic administrator and records manager |
| doctor, doctor2 | Doctors (verified prescribers) |
| nurse | Nurse (verified, cannot diagnose or prescribe) |
| lab | Laboratory staff |
| pharmacy | Pharmacy staff |
| patient, patient2 | Patients (see only their own released records) |

The seed also creates a nurse awaiting credential verification so the verification workflow can be tried.

## What is implemented

Authentication and access
- Sign-in with email, username or staff ID, show or hide password, lockout after 5 failed attempts, sliding session expiry (30 minutes), password reset (link printed in the server terminal because email is not configured), TOTP two-step verification (set up under Privacy and security).
- Role-based access control enforced on the server for every sensitive route. Administrators cannot read clinical notes. Clinical staff need verified credentials before clinical permissions apply.
- Patient account claiming with a one-time code, date of birth and record number, created only after staff confirm identity.
- Emergency (break-glass) access with a mandatory reason, 60-minute limit, notification to administrators and audit logging.

Patients and clinical work
- Patient registration with generated medical record numbers, conditional academic fields, duplicate detection, privacy acknowledgement, authorised duplicate merge (API) that keeps original identifiers.
- Patient search, filters, sorting, pagination, minimum-information results.
- Patient profile with visit history, timeline, allergies, prescriptions, investigations, referrals, follow-ups and access history.
- Consultation form: presenting complaint, history, vital signs with BMI and out-of-range flags, examination, assessment, treatment plan. Autosave every 15 seconds, unsaved-change warning, sign, amend with reason (original preserved), addendum, release to patient.
- Prescriptions with allergy and duplicate warnings, override reason, status tracking (prescribed, dispensed, administered, discontinued, cancelled), printable prescription.
- Investigations (review before release), referrals (outcome required to complete), follow-ups.
- Queue with triage, status workflow, clinician assignment and an emergency action that needs no registration details.
- Appointments with day, week and month ranges. Patient requests stay "Requested" until staff confirm.

Administration
- Dashboards with real counts and charts, date-range filters, aggregate-only analytics with small-count suppression.
- Reports with CSV export and print or save-as-PDF, identifiable reports restricted by permission, exports logged.
- User management, staff credential verification, licence-expiry flags.
- Hash-chained audit log with an integrity check.
- Settings for departments, faculties, courses, hostels, categories, reference ranges and more (no hard-coded academic lists).
- Backup button (SQLite online backup), system health, integration placeholders.

Patient portal: dashboard, profile, correction requests, released visit summaries, prescriptions, released results, appointment requests, follow-ups, downloadable summary.

Interface: layout and palette follow the ALPHA MIS references, light and dark mode, responsive down to phones (drawer navigation, table rows become cards), keyboard focus states, text status labels, accessible chart data tables. The UCU crest is in the sidebar and on the sign-in page.

## Security design

- Passwords hashed with bcrypt. Sessions are signed tokens in an httpOnly, SameSite strict cookie.
- Clinical note content is encrypted at rest with AES-256-GCM. The key comes from `DATA_KEY` or is generated into `server/data/.secrets.json` (keep that file private and back it up securely; losing it makes notes unreadable).
- Other fields (demographics, prescriptions and so on) are stored unencrypted in SQLite. Use full-disk encryption on the host.
- All SQL uses parameter binding. Helmet headers, login rate limiting, CSV formula protection and generic error messages are enabled.
- The API listens on 127.0.0.1 only.

## Project layout

    server/src/   db.js (schema)  sec.js (crypto, TOTP, audit)  auth.js (roles and permissions)
                  routes1.js (auth, users, settings, audit)  routes2.js (patients, encounters, prescriptions, queue, appointments, investigations, referrals)
                  routes3.js (dashboard, reports, patient portal)  seed.js  index.js
    client/src/   App.tsx (layout and routes)  api.ts  auth.tsx  ui.tsx  pages/*

## Not built yet, or only partly built

These parts of the specification are missing or limited. Treat them as open work.

- Single sign-on, email and SMS delivery, laboratory, pharmacy and national health system integrations: configuration points only, nothing is connected.
- Document and image attachments, malware scanning, immunisation and procedure records, consent forms, safeguarding notes with restricted access, medication administration records, document templates.
- Appointment reminders and licence-expiry reminders are not sent automatically. Notifications are created for some events only.
- Offline use: the app shows when you are offline and blocks false "saved" messages, but there is no offline clinical documentation or sync. Keep a paper downtime procedure.
- Calendar is a grouped agenda by day, week or month, not a drag-and-drop calendar. Duplicate merge has an API but no screen.
- Drug interaction checking, dose calculation, paediatric reference ranges and diagnosis coding (ICD) are not included. The system does not invent clinical rules.
- PDF export uses the browser's print dialog. Prescriptions open in a printable page.
- Automated tests are not included. The API was exercised with manual scripted checks, and the interface has not been through browser, device, accessibility or load testing.

## Before real use

Do not enter real patient data until at least these are done: legal and data-protection review (Uganda Data Protection and Privacy Act and university policy), HTTPS behind a reverse proxy, a managed secret store, a hardened host with encrypted disk, tested backups and restore, mandatory MFA for administrators (`REQUIRE_ADMIN_MFA=true`), automated tests, an independent security review, and clinical sign-off on workflows and reference ranges.
