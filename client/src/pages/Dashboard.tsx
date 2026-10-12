import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, R, fmt, fmtD } from '../api';
import { useAuth } from '../auth';
import { Head, Bars, Line, HBars, Donut, Err, Table, Card, Badge } from '../ui';
import { PortalHome } from './Portal';
const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Previous month'], ['custom', 'Custom range']];
export function Dashboard() {
  const { user, can } = useAuth(); if (user!.role === 'patient') return <PortalHome />;
  if (!can('report.view', 'clinical.read')) return <Head title={`Welcome, ${user!.name}`} sub="Use the menu to open your work areas." />;
  return <Staff />;
}
function Staff() {
  const { user } = useAuth(), nav = useNavigate(), [d, setD] = useState<R | null>(null), [err, setErr] = useState(''), [range, setRange] = useState('30d'), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  useEffect(() => { if (range === 'custom' && !(from && to)) return; api(`/dashboard?range=${range}&from=${from}&to=${to}`).then(setD).catch(e => setErr(e.message)); }, [range, from, to]);
  const role = user!.role.replace('_', ' ');
  return <><Head title={`${greet}, ${user!.name.split(' ').slice(-1)[0]}`} sub={`Alan Galpin UCU · ${role} · ${new Date().toLocaleDateString([], { dateStyle: 'full' })}`}>
    {d?.kind === 'admin' && <div className="row hide-print"><select aria-label="Reporting period" value={range} onChange={e => setRange(e.target.value)} style={{ width: 'auto' }}>{RANGES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>
      {range === 'custom' && <><input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} /><input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto' }} /></>}</div>}</Head>
    <Err e={err} />{!d ? <p className="muted">Loading…</p> : <>
      <div className="grid">{d.cards.map((c: R) => <button key={c.key} className={'metric ' + (c.tone || '')} onClick={() => nav(c.link)}><span>{c.label}</span><strong>{c.value}</strong>{c.prev !== undefined && <small>Yesterday: {c.prev}</small>}</button>)}</div>
      {d.kind === 'clinical' && <div className="row card pad"><button className="btn" onClick={() => nav('/patients/new')}>Register patient</button><button className="btn" onClick={() => nav('/queue')}>Today's queue</button><button className="btn o" onClick={() => nav('/patients')}>Search patient</button><button className="btn o" onClick={() => nav('/consultations')}>My consultations</button>
        <p className="small muted" style={{ flexBasis: '100%', margin: 0 }}>This system documents care. It does not replace clinical judgement or emergency services.</p></div>}
      {d.kind === 'admin' && <>
        <p className="small muted">Period: {fmtD(d.range[0])} to {fmtD(d.range[1])} · Data refreshed {fmt(d.refreshed)} · Aggregate counts only; no identifiable patient data appears in charts.</p>
        <div className="grid2"><Line title="New patient registrations by day" data={d.charts.regDay} /><Line title="Consultations by day" data={d.charts.consultDay} /></div>
        <div className="grid2"><Bars title="Registrations by year of study" data={d.charts.regYear} /><HBars title="Registrations by course" data={d.charts.regCourse} /><HBars title="Registrations by hostel or residence" data={d.charts.regHostel} /><Donut title="Patients by category" data={d.charts.regCategory} /></div>
        <div className="grid2"><HBars title="Consultations by department" data={d.charts.consultDept} /><Bars title="Visits by hour of day" data={d.charts.visitHour} /><HBars title="Commonly recorded complaints" data={d.charts.complaints} /><HBars title="Frequently recorded diagnoses" data={d.charts.diagnoses} /><HBars title="Prescription volume by medication" data={d.charts.rxDrug} />
          <div className="card pad"><h3>Operations</h3><p>Average waiting time: <b>{d.stats.avg_wait_min ?? 'no data'}{d.stats.avg_wait_min !== null && ' min'}</b></p><p>Follow-up completion: <b>{d.stats.followup_completion_pct ?? 'no data'}{d.stats.followup_completion_pct !== null && '%'}</b></p><p>Referrals in period: <b>{d.stats.referrals}</b></p></div></div>
        {d.expiring.length > 0 && <Card title="Credentials expiring within 60 days"><Table cols={[{ k: 'name', h: 'Staff' }, { k: 'role', h: 'Role' }, { k: 'licence_expiry', h: 'Expires', r: r => <Badge s={r.licence_expiry < new Date().toISOString().slice(0, 10) ? 'Expired Credentials' : fmtD(r.licence_expiry)} /> }]} rows={d.expiring} /></Card>}</>}</>}</>;
}
