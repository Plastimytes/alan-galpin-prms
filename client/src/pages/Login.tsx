import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Err } from '../ui';
const Brand = () => <div className="brand" style={{ border: 0, padding: 0, marginBottom: 20 }}><img src="/ucu-logo.jpg" alt="Uganda Christian University crest" style={{ width: 52, height: 54 }} /><div><b style={{ fontSize: 17 }}>ALAN GALPIN UCU</b><small style={{ fontSize: 12 }}>Patient Records Management System</small></div></div>;
const Frame = ({ children, pic }: { children: any; pic?: boolean }) => <div className="login"><div className="pic" style={{ backgroundImage: 'url(/clinic.jpg)' }}><div><b>Alan Galpin University Health Centre</b><br />Secure patient records for Uganda Christian University</div></div><div className="box"><div className="in"><Brand />{children}</div></div></div>;
export function Login({ expired }: { expired?: boolean }) {
  const { setUser } = useAuth(), nav = useNavigate(), [id, setId] = useState(''), [pw, setPw] = useState(''), [code, setCode] = useState(''), [mfa, setMfa] = useState(false), [show, setShow] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setErr(''); if (!id.trim() || !pw) return setErr('Enter your email or staff ID and your password.'); setBusy(true);
    try { const r = await api('/auth/login', { method: 'POST', body: { identifier: id, password: pw, code } }); if (r.mfa_required) { setMfa(true); } else { setUser(r.user); nav(r.mfa_setup_required ? '/security' : '/'); } }
    catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } }
  return <Frame><h1 style={{ marginBottom: 4 }}>Sign in</h1><p className="muted" style={{ marginTop: 0 }}>Use your institutional email, username or staff ID.</p>
    {expired && <div className="alert warn" role="alert">Your session expired. Sign in again to continue.</div>}<Err e={err} />
    <form onSubmit={submit} noValidate><label className="lab" htmlFor="id">Email, username or staff ID</label><input id="id" autoComplete="username" value={id} onChange={e => setId(e.target.value)} autoFocus />
      <label className="lab" htmlFor="pw" style={{ marginTop: 10 }}>Password</label><div className="row" style={{ flexWrap: 'nowrap' }}><input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /><button type="button" className="ib" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button></div>
      {mfa && <><label className="lab" htmlFor="code" style={{ marginTop: 10 }}>Verification code from your authenticator app</label><input id="code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} autoFocus /></>}
      <button className="btn" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
    <p className="small"><Link to="/forgot">Forgot password?</Link> · <Link to="/claim">Claim a patient account</Link></p>
    <p className="small muted">Need help? Contact the clinic reception or UCU Information Systems.</p>
    <details className="small"><summary>Demo accounts (local build)</summary><p>Password for all: <code>Demo@12345</code><br />admin · records · doctor · doctor2 · nurse · lab · pharmacy · patient · patient2</p></details></Frame>;
}
export function Forgot() { const [e, setE] = useState(''), [done, setDone] = useState(false), [err, setErr] = useState('');
  return <Frame><h1>Reset password</h1>{done ? <div className="alert ok">If that email is registered, a reset link has been issued. In this local build the link is printed in the server terminal because email is not configured.</div> : <form onSubmit={async ev => { ev.preventDefault(); try { await api('/auth/forgot', { method: 'POST', body: { email: e } }); setDone(true); } catch (x) { setErr((x as ApiError).message); } }}>
    <Err e={err} /><label className="lab" htmlFor="em">Email address</label><input id="em" type="email" value={e} onChange={x => setE(x.target.value)} /><button className="btn" style={{ marginTop: 12 }}>Send reset link</button></form>}<p><Link to="/login">Back to sign in</Link></p></Frame>; }
export function Reset() { const [q] = useSearchParams(), [pw, setPw] = useState(''), [ok, setOk] = useState(false), [err, setErr] = useState('');
  return <Frame><h1>Choose a new password</h1>{ok ? <div className="alert ok">Password updated. <Link to="/login">Sign in</Link></div> : <form onSubmit={async ev => { ev.preventDefault(); try { await api('/auth/reset', { method: 'POST', body: { token: q.get('token'), password: pw } }); setOk(true); } catch (x) { setErr((x as ApiError).message); } }}>
    <Err e={err} /><label className="lab" htmlFor="np">New password (10+ characters, with a letter and a number)</label><input id="np" type="password" value={pw} onChange={x => setPw(x.target.value)} /><button className="btn" style={{ marginTop: 12 }}>Update password</button></form>}</Frame>; }
export function Claim() { const [v, setV] = useState({ mrn: '', code: '', dob: '', email: '', password: '' }), [ok, setOk] = useState(false), [err, setErr] = useState(''); const s = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  return <Frame><h1>Claim your patient account</h1><p className="muted">Ask the clinic for a one-time invitation code after your identity is checked.</p>{ok ? <div className="alert ok">Account created. <Link to="/login">Sign in</Link></div> : <form onSubmit={async ev => { ev.preventDefault(); setErr(''); try { await api('/auth/claim', { method: 'POST', body: v }); setOk(true); } catch (x) { setErr((x as ApiError).message); } }}><Err e={err} />
    {[['mrn', 'Medical record number', 'text'], ['code', 'One-time code', 'text'], ['dob', 'Date of birth', 'date'], ['email', 'Email address', 'email'], ['password', 'Password (10+ characters, letter and number)', 'password']].map(([k, l, t]) => <div key={k} style={{ marginBottom: 8 }}><label className="lab" htmlFor={k}>{l}</label><input id={k} type={t} value={(v as any)[k]} onChange={s(k)} /></div>)}
    <button className="btn">Create account</button></form>}<p><Link to="/login">Back to sign in</Link></p></Frame>; }
