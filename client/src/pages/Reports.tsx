import { useEffect, useState } from 'react';
import { api, R, fmt } from '../api';
import { Head, Card, Table, Err } from '../ui';
export function Reports() {
  const [list, setList] = useState<R[]>([]), [key, setKey] = useState(''), [range, setRange] = useState('30d'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [rep, setRep] = useState<R | null>(null), [err, setErr] = useState('');
  useEffect(() => { api('/reports').then(l => { setList(l); setKey(l[0]?.key || ''); }); }, []);
  const qs = `range=${range}&from=${from}&to=${to}`;
  useEffect(() => { if (!key || (range === 'custom' && !(from && to))) return; setErr(''); api(`/reports/${key}?${qs}`).then(setRep).catch(e => setErr(e.message)); }, [key, range, from, to]);
  const cols = rep?.rows?.[0] ? Object.keys(rep.rows[0]).map(k => ({ k, h: k.replace(/_/g, ' ') })) : [];
  return <><Head title="Reports" sub="Aggregate reports for management. Identifiable reports are limited to authorised roles, and exports are logged." />
    <div className="card bar hide-print"><select aria-label="Report" value={key} onChange={e => setKey(e.target.value)} style={{ minWidth: 260 }}>{list.map(r => <option key={r.key} value={r.key}>{r.title}</option>)}</select>
      <select aria-label="Period" value={range} onChange={e => setRange(e.target.value)}>{[['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Previous month'], ['custom', 'Custom']].map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>
      {range === 'custom' && <><input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} /></>}
      <div className="sp" /><a className="btn o" href={`/api/reports/${key}?${qs}&format=csv`}>Export CSV</a><button className="btn o" onClick={() => window.print()}>Print or save as PDF</button></div>
    <Err e={err} />{rep && <Card title={rep.title} sub={`Period ${rep.filters.from} to ${rep.filters.to} · Generated ${fmt(rep.generated)}`}>{rep.identifiable && <div className="alert warn" style={{ margin: 12 }}>This report contains patient-identifiable information. Handle it as confidential.</div>}<Table cols={cols} rows={rep.rows} empty="No data for this period." /></Card>}</>;
}
