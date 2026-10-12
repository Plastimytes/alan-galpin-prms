try { require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*?)\s*(#.*)?$/); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}
const express = require('express'), helmet = require('helmet'), cookieParser = require('cookie-parser'), rate = require('express-rate-limit'), path = require('path'), fs = require('fs');
const r1 = require('./routes1'), r2 = require('./routes2'), r3 = require('./routes3');
const app = express(); app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"] } } }));
app.use(express.json({ limit: '1mb' })); app.use(cookieParser());
app.use('/api/auth/login', rate({ windowMs: 15 * 60000, max: 30, standardHeaders: true, message: { error: 'Too many attempts. Try again later.' } }));
app.use('/api/auth/forgot', rate({ windowMs: 15 * 60000, max: 10 }));
app.use('/api', r1.router, r2.router, r3.router);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }); // never leak internals
const port = process.env.PORT || 4000; app.listen(port, '127.0.0.1', () => console.log(`PRMS API on http://localhost:${port}`));
