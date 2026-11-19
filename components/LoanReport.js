import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { fmt, fmtK } from '../lib/supabase'

// Loan report: headline numbers, monthly given vs repaid, how old unpaid balances are,
// guarantor accountability, top debtors, then month → day → entries. Prints cleanly.
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Validated pair (dataviz validator: lightness, chroma, CVD, normal-vision, contrast all pass)
const GIVEN = '#3D3FAE', REPAID = '#0B8A7A'
// One hue, light → dark, for loan age (ordinal magnitude)
const AGE = [{ k: '0–30 days', c: '#F2B8A2' }, { k: '31–60 days', c: '#E58B6B' }, { k: '61–90 days', c: '#CF5C34' }, { k: 'Over 90 days', c: '#A3330F' }]
const KIND = {
  given: { l: 'Loan given', c: '#B93A16', i: '🔴' },
  repaid: { l: 'Repaid', c: '#0B7A6C', i: '💵' },
  waived: { l: 'Waived', c: '#9A5B00', i: '🤝' },
}
const INK = '#15183A', MUTED = '#5B607E', LINE = '#DCDFEC'
const card = { background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 14 }
const num = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const h3 = { fontSize: 14, fontWeight: 700, color: INK }
const sub = { fontSize: 12, color: MUTED, marginTop: 2 }

export default function LoanReport({ loans, loanAmount, owingOf, onOpen, shopName }) {
  const [openMonth, setOpenMonth] = useState(null)
  const [openDay, setOpenDay] = useState(null)
  const now = Date.now()

  // ── Build months, days and entries ─────────────────────────────
  const months = {}
  const M = (d) => {
    const k = d.getFullYear() + '-' + d.getMonth()
    if (!months[k]) months[k] = { key: k, label: MN[d.getMonth()] + ' ' + d.getFullYear(), short: MN[d.getMonth()] + " '" + String(d.getFullYear()).slice(2), y: d.getFullYear(), m: d.getMonth(), given: 0, nGiven: 0, repaid: 0, nRepaid: 0, waived: 0, owing: 0, days: {} }
    return months[k]
  }
  const D = (mo, d) => {
    const k = d.getDate()
    if (!mo.days[k]) mo.days[k] = { day: k, given: 0, nGiven: 0, repaid: 0, waived: 0, items: [] }
    return mo.days[k]
  }
  const ages = AGE.map(a => ({ ...a, amt: 0, n: 0 }))
  const guar = {}, debt = {}
  loans.forEach(x => {
    const who = x.customers?.name || 'Walk-in'
    const d = new Date(x.sale_date || x.created_at), mo = M(d), dy = D(mo, d), a = loanAmount(x), ow = owingOf(x)
    mo.given += a; mo.nGiven += 1; mo.owing += ow
    dy.given += a; dy.nGiven += 1
    dy.items.push({ kind: 'given', who, amt: a, g: x.loan_guarantor_name, sale: x })
    ;(x.loan_payments || []).forEach(p => {
      const pd = new Date(p.payment_date || p.created_at), pm = M(pd), pdy = D(pm, pd), pa = Number(p.amount) || 0
      pm.repaid += pa; pm.nRepaid += 1; pdy.repaid += pa
      pdy.items.push({ kind: 'repaid', who, amt: pa, note: p.note, sale: x })
    })
    const w = Number(x.loan_waiver) || 0
    if (w > 0) {
      const wd = new Date(x.loan_waived_at || x.sale_date || x.created_at), wm = M(wd), wdy = D(wm, wd)
      wm.waived += w; wdy.waived += w
      wdy.items.push({ kind: 'waived', who, amt: w, note: x.loan_waiver_note, sale: x })
    }
    if (ow > 0) {
      const days = Math.floor((now - d.getTime()) / 86400000)
      const b = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3
      ages[b].amt += ow; ages[b].n += 1
      const g = x.loan_guarantor_name || 'Not set'
      guar[g] = guar[g] || { name: g, amt: 0, n: 0 }; guar[g].amt += ow; guar[g].n += 1
      const ck = x.customer_id || who + (x.customers?.phone || '')
      debt[ck] = debt[ck] || { name: who, phone: x.customers?.phone, amt: 0, n: 0, oldest: d, sale: x }
      debt[ck].amt += ow; debt[ck].n += 1; if (d < debt[ck].oldest) { debt[ck].oldest = d; debt[ck].sale = x }
    }
  })
  const list = Object.values(months).sort((a, b) => b.y - a.y || b.m - a.m)
  const T = list.reduce((t, mo) => ({ given: t.given + mo.given, repaid: t.repaid + mo.repaid, waived: t.waived + mo.waived, owing: t.owing + mo.owing }), { given: 0, repaid: 0, waived: 0, owing: 0 })
  const collected = T.given > 0 ? Math.round(((T.repaid + T.waived) / T.given) * 100) : 0
  const openLoans = loans.filter(x => owingOf(x) > 0).length
  const chart = [...list].reverse().slice(-12).map(m => ({ name: m.short, Given: Math.round(m.given), Repaid: Math.round(m.repaid) }))
  const guarList = Object.values(guar).sort((a, b) => b.amt - a.amt)
  const debtList = Object.values(debt).sort((a, b) => b.amt - a.amt).slice(0, 6)
  const maxG = Math.max(1, ...guarList.map(g => g.amt)), maxA = Math.max(1, ...ages.map(a => a.amt))
  const printedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const ChartTip = ({ active, payload, label }) => active && payload?.length ? (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 12px', boxShadow: '0 8px 24px rgba(21,24,58,.12)', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map(p => <p key={p.dataKey} style={{ color: INK, ...num }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 6 }} />{p.dataKey}: <b>{fmt(p.value)}</b></p>)}
    </div>
  ) : null

  return (
    <div className="loan-report">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .loan-report, .loan-report * { visibility: visible !important; }
          .loan-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 8mm; }
          .lr-noprint { display: none !important; }
          .lr-print { display: block !important; }
          .lr-card { break-inside: avoid; box-shadow: none !important; }
        }
        .lr-print { display: none; }
        .lr-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 900px) { .lr-grid2 { grid-template-columns: 1fr; } .lr-kpis { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
        .lr-row:hover { background: #F5F6FB; }
      `}</style>

      {/* Print header */}
      <div className="lr-print" style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 20, fontWeight: 800 }}>Loan report · {shopName || ''}</p>
        <p style={{ fontSize: 12, color: MUTED }}>Printed {printedOn} · TheDashboard</p>
      </div>

      {/* Hero */}
      <div className="lr-card" style={{ ...card, padding: 20, marginBottom: 14, background: 'linear-gradient(135deg, #2D2F8F 0%, #1E1F66 100%)', color: '#fff', border: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 12, letterSpacing: 1.2, opacity: 0.75, fontWeight: 600 }}>STILL OWED TO YOU</p>
            <p style={{ fontSize: 38, fontWeight: 900, marginTop: 4, ...num }}>{fmt(Math.round(T.owing))}</p>
            <p style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{openLoans} open loan{openLoans !== 1 ? 's' : ''} · {loans.length} loans in total</p>
          </div>
          <div style={{ minWidth: 220, flex: '0 1 300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.85 }}><span>Collected so far</span><b style={num}>{collected}%</b></div>
            <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,.18)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, collected)}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, #21C29E, #F2A007)' }} />
            </div>
            <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Repaid + waived, out of all loans given</p>
            <button className="lr-noprint" onClick={() => window.print()} style={{ marginTop: 12, border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.1)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print / PDF</button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="lr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 14 }}>
        {[
          { l: 'Loans given', v: T.given, c: GIVEN, i: '🧾', s: `${loans.length} loans` },
          { l: 'Repaid', v: T.repaid, c: REPAID, i: '💵', s: T.given ? `${Math.round(T.repaid / T.given * 100)}% of given` : '—' },
          { l: 'Waived', v: T.waived, c: '#9A5B00', i: '🤝', s: T.given ? `${Math.round(T.waived / T.given * 100)}% of given` : '—' },
          { l: 'Still owing', v: T.owing, c: '#B93A16', i: '⏳', s: `${openLoans} open` },
        ].map(k => (
          <div key={k.l} className="lr-card" style={{ ...card, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 9, background: k.c + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{k.i}</span>
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{k.l}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: INK, marginTop: 8, ...num }}>{fmtK(k.v)}</p>
            <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{k.s}</p>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      {chart.length > 0 && (
        <div className="lr-card" style={{ ...card, padding: 16, marginBottom: 14 }}>
          <p style={h3}>Loans given vs repaid, by month</p>
          <p style={sub}>Repaid counts in the month the money came in</p>
          <div style={{ height: 240, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={48} tickFormatter={v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : v} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(45,47,143,0.05)' }} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: INK }} />
                <Bar dataKey="Given" fill={GIVEN} radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Repaid" fill={REPAID} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Age + guarantors */}
      <div className="lr-grid2" style={{ marginBottom: 14 }}>
        <div className="lr-card" style={{ ...card, padding: 16 }}>
          <p style={h3}>How old are unpaid balances?</p>
          <p style={sub}>Still owing, by days since the sale</p>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {ages.map(a => (
              <div key={a.k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: INK, fontWeight: 600 }}>{a.k} <span style={{ color: MUTED, fontWeight: 400 }}>· {a.n} loan{a.n !== 1 ? 's' : ''}</span></span>
                  <b style={{ color: INK, ...num }}>{fmt(Math.round(a.amt))}</b>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: '#F2F3F8', marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(a.amt / maxA) * 100}%`, height: '100%', borderRadius: 5, background: a.c, minWidth: a.amt > 0 ? 6 : 0 }} />
                </div>
              </div>
            ))}
          </div>
          {ages[3].amt > 0 && <p style={{ fontSize: 12, color: '#A3330F', marginTop: 10, fontWeight: 600 }}>⚠ {fmt(Math.round(ages[3].amt))} is over 90 days old. Follow up first.</p>}
        </div>

        <div className="lr-card" style={{ ...card, padding: 16 }}>
          <p style={h3}>Guarantors</p>
          <p style={sub}>Still owing on loans each staff member guaranteed</p>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {guarList.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Nothing owing.</p>}
            {guarList.slice(0, 6).map(g => (
              <div key={g.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: g.name === 'Not set' ? '#9A5B00' : INK, fontWeight: 600 }}>🤝 {g.name} <span style={{ color: MUTED, fontWeight: 400 }}>· {g.n} loan{g.n !== 1 ? 's' : ''}</span></span>
                  <b style={{ color: INK, ...num }}>{fmt(Math.round(g.amt))}</b>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: '#F2F3F8', marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(g.amt / maxG) * 100}%`, height: '100%', borderRadius: 5, background: g.name === 'Not set' ? '#D9B36A' : GIVEN, minWidth: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top debtors */}
      {debtList.length > 0 && (
        <div className="lr-card" style={{ ...card, padding: 0, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 8px' }}><p style={h3}>Who owes the most</p><p style={sub}>Click a customer to open their oldest open loan</p></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {debtList.map((c, i) => {
                const days = Math.floor((now - c.oldest.getTime()) / 86400000)
                return (
                  <tr key={i} className="lr-row" onClick={() => onOpen(c.sale)} style={{ cursor: 'pointer', borderTop: `1px solid #ECEEF7` }}>
                    <td style={{ padding: '10px 16px', width: 34, color: MUTED, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '10px 8px' }}><b>{c.name}</b>{c.phone && <span style={{ color: MUTED }}> · {c.phone}</span>}<div style={{ fontSize: 11, color: MUTED }}>{c.n} open loan{c.n !== 1 ? 's' : ''}</div></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: days > 90 ? '#FBE1D8' : days > 30 ? '#FDF0D2' : '#ECEEF7', color: days > 90 ? '#A3330F' : days > 30 ? '#7A4800' : MUTED, whiteSpace: 'nowrap' }}>{days} days</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: '#B93A16', ...num }}>{fmt(Math.round(c.amt))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Month → day → entries */}
      <p style={{ ...h3, margin: '6px 0 10px' }}>Month by month</p>
      {!list.length && <div style={{ ...card, padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No loans yet.</div>}
      {list.map(mo => {
        const open = openMonth === mo.key
        const days = Object.values(mo.days).sort((a, b) => b.day - a.day)
        const pct = mo.given > 0 ? Math.min(100, Math.round(((mo.given - mo.owing) / mo.given) * 100)) : null
        return (
          <div key={mo.key} className="lr-card" style={{ ...card, marginBottom: 10, overflow: 'hidden' }}>
            <button onClick={() => { setOpenMonth(open ? null : mo.key); setOpenDay(null) }} aria-expanded={open}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(140px,1.1fr) 2fr auto', alignItems: 'center', gap: 16, padding: '14px 16px', border: 0, cursor: 'pointer', textAlign: 'left', background: open ? 'rgba(45,47,143,0.06)' : '#fff', fontFamily: 'inherit' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: open ? '#2D2F8F' : INK }}>{mo.label}</p>
                <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{mo.nGiven} loan{mo.nGiven !== 1 ? 's' : ''} · {mo.nRepaid} repayment{mo.nRepaid !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, ...num }}>
                  <span><span style={{ color: MUTED }}>Given </span><b style={{ color: INK }}>{fmtK(mo.given)}</b></span>
                  <span><span style={{ color: MUTED }}>Repaid </span><b style={{ color: '#0B7A6C' }}>{fmtK(mo.repaid)}</b></span>
                  {mo.waived > 0 && <span><span style={{ color: MUTED }}>Waived </span><b style={{ color: '#9A5B00' }}>{fmtK(mo.waived)}</b></span>}
                  <span><span style={{ color: MUTED }}>Owing </span><b style={{ color: mo.owing > 0 ? '#B93A16' : MUTED }}>{fmtK(mo.owing)}</b></span>
                </div>
                {pct !== null && <div title={`${pct}% of this month's loans settled`} style={{ height: 6, borderRadius: 4, background: '#F2F3F8', marginTop: 7, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: REPAID, borderRadius: 4 }} />
                </div>}
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED, ...num }}>{pct !== null ? `${pct}% settled` : 'no new loans'} <span aria-hidden="true">{open ? '▲' : '▼'}</span></span>
            </button>
            {open && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, borderTop: `1px solid #ECEEF7` }}>
                <thead><tr style={{ background: '#FAFBFE' }}>
                  {['DATE', 'GIVEN', 'REPAID', 'WAIVED'].map((h, i) => <th key={h} style={{ fontSize: 10, color: MUTED, letterSpacing: 0.8, fontWeight: 600, padding: i === 0 ? '8px 10px 8px 16px' : i === 3 ? '8px 16px 8px 10px' : '8px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {days.map(dy => {
                    const dk = mo.key + '-' + dy.day, dOpen = openDay === dk
                    const cell = (v, c) => <span style={{ color: v ? c : '#C4C7DA', ...num }}>{v ? fmtK(v) : '—'}</span>
                    return [
                      <tr key={dk} className="lr-row" onClick={() => setOpenDay(dOpen ? null : dk)} style={{ cursor: 'pointer', borderTop: '1px solid #ECEEF7', background: dOpen ? '#F5F6FB' : undefined }}>
                        <td style={{ padding: '9px 10px 9px 16px', fontWeight: 600 }}>{dy.day} {MN[mo.m]} <span style={{ color: '#8A8FAE', fontSize: 11 }}>{dOpen ? '▲' : '▼'}</span></td>
                        <td style={{ padding: 9, textAlign: 'right' }}>{cell(dy.given, GIVEN)}{dy.nGiven > 1 && <span style={{ color: '#8A8FAE', fontSize: 11 }}> ({dy.nGiven})</span>}</td>
                        <td style={{ padding: 9, textAlign: 'right' }}>{cell(dy.repaid, '#0B7A6C')}</td>
                        <td style={{ padding: '9px 16px 9px 9px', textAlign: 'right' }}>{cell(dy.waived, '#9A5B00')}</td>
                      </tr>,
                      ...(dOpen ? dy.items.map((it, ix) => (
                        <tr key={dk + '-' + ix} className="lr-row" onClick={() => onOpen(it.sale)} style={{ cursor: 'pointer', background: '#FAFBFE', borderTop: '1px solid #ECEEF7' }} title="Open loan">
                          <td colSpan={3} style={{ padding: '8px 10px 8px 30px' }}>
                            <span style={{ fontWeight: 600 }}>{KIND[it.kind].i} {it.who}</span>
                            <span style={{ color: MUTED, fontSize: 12 }}> · {KIND[it.kind].l}{it.g ? ` · 🤝 ${it.g}` : ''}{it.note ? ` · ${it.note}` : ''}</span>
                          </td>
                          <td style={{ padding: '8px 16px 8px 9px', textAlign: 'right', fontWeight: 700, color: KIND[it.kind].c, ...num }}>{fmt(it.amt)}</td>
                        </tr>
                      )) : []),
                    ]
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
      <p style={{ fontSize: 11, color: '#8A8FAE', marginTop: 6 }}>Given = loan amount on the day of the sale. Repaid and waived are counted on the day they happened. "Owing" is what is left today on that month's loans.</p>
    </div>
  )
}
