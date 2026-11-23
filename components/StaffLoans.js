import { useEffect, useState } from 'react'
import { supabase, fmt, fmtK, today } from '../lib/supabase'

// Staff loans (advances): given to staff, repaid in parts.
// Cash out on the day given, cash in on repayment (daily cash report). Not counted against profit.
export default function StaffLoans({ shopId, staff = [], period = 'month', onToast }) {
  const [loans, setLoans] = useState([])
  const [pays, setPays] = useState([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showGive, setShowGive] = useState(false)
  const [give, setGive] = useState({ staff_id: '', staff_name: '', amount: '', note: '', loan_date: today() })
  const [payFor, setPayFor] = useState(null) // { id, amount, note, bal }
  const [saving, setSaving] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const toast = (m, bad) => onToast ? onToast(m, bad) : alert(m)

  const load = async () => {
    if (!shopId) return
    setLoading(true)
    const [lr, pr] = await Promise.all([
      supabase.from('staff_loans').select('*').eq('shop_id', shopId).order('loan_date', { ascending: false }).limit(2000),
      supabase.from('staff_loan_payments').select('*').eq('shop_id', shopId).order('paid_date', { ascending: false }).limit(5000),
    ])
    if (lr.error) { setReady(!/staff_loans/.test(lr.error.message)); setLoans([]); setPays([]) }
    else { setReady(true); setLoans(lr.data || []); setPays(pr.data || []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [shopId])

  const paidOf = id => pays.filter(p => p.loan_id === id).reduce((a, p) => a + (Number(p.amount) || 0), 0)
  const rows = loans.map(l => { const paid = paidOf(l.id); return { ...l, paid, bal: Math.max(0, (Number(l.amount) || 0) - paid) } })
  const open = rows.filter(r => r.bal > 0)
  const owed = open.reduce((a, r) => a + r.bal, 0)
  const now = new Date()
  const inPeriod = d => {
    const x = new Date(d + 'T00:00:00')
    if (period === 'today') return x.toDateString() === now.toDateString()
    if (period === 'month') return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear()
    if (period === 'year') return x.getFullYear() === now.getFullYear()
    return true
  }
  const givenP = rows.filter(r => inPeriod(r.loan_date)).reduce((a, r) => a + (Number(r.amount) || 0), 0)
  const repaidP = pays.filter(p => inPeriod(p.paid_date)).reduce((a, p) => a + (Number(p.amount) || 0), 0)
  const per = {}
  open.forEach(r => { per[r.staff_name] = per[r.staff_name] || { n: 0, bal: 0 }; per[r.staff_name].n++; per[r.staff_name].bal += r.bal })
  const shown = rows.filter(r => r.bal > 0 || (showPaid ? true : inPeriod(r.loan_date)))

  const saveGive = async () => {
    const amt = parseFloat(String(give.amount).replace(/,/g, '')) || 0
    const nm = give.staff_name.trim()
    if (!nm || amt <= 0) { toast('Choose the staff member and enter the amount.', true); return }
    setSaving(true)
    const { error } = await supabase.from('staff_loans').insert({ shop_id: shopId, staff_id: give.staff_id || null, staff_name: nm, amount: amt, note: give.note.trim() || null, loan_date: give.loan_date || today() })
    setSaving(false)
    if (error) { toast(/staff_loans/.test(error.message) ? 'Run the staff loans SQL in Supabase first.' : error.message, true); return }
    setShowGive(false); setGive({ staff_id: '', staff_name: '', amount: '', note: '', loan_date: today() }); toast('Staff loan recorded'); load()
  }
  const savePay = async () => {
    const amt = parseFloat(String(payFor.amount).replace(/,/g, '')) || 0
    if (amt <= 0) { toast('Enter how much was repaid.', true); return }
    setSaving(true)
    const { error } = await supabase.rpc('td_staff_loan_pay', { p_loan: payFor.id, p_amount: amt, p_date: payFor.date || today(), p_note: payFor.note || null })
    setSaving(false)
    if (error) { toast(error.message, true); return }
    setPayFor(null); toast('Repayment saved'); load()
  }
  const del = async l => {
    if (!confirm(`Delete ${l.staff_name}'s loan of ${fmt(l.amount)} and its repayments?`)) return
    const { error } = await supabase.from('staff_loans').delete().eq('id', l.id)
    if (error) { toast(error.message, true); return }
    load()
  }

  const card = { background: '#fff', border: '1px solid #DCDFEC', borderRadius: 14, padding: 16 }
  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #DCDFEC', background: '#fff', color: '#15183A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const input = { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const lbl = { fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5, display: 'block' }

  if (!ready) return <div style={{ ...card, borderColor: '#B93A1655', color: '#B93A16', fontSize: 13 }}>Run the staff loans SQL (20261123000000_staff_loans.sql) in Supabase to start recording staff loans.</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#3D3FAE', borderRadius: 16, padding: 18, color: '#fff' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: '#D6D7F7', fontWeight: 700 }}>STILL OWED BY STAFF</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>{fmt(Math.round(owed))}</div>
          <div style={{ fontSize: 12, color: '#D6D7F7', marginTop: 2 }}>{open.length} open loan{open.length !== 1 ? 's' : ''}</div>
          {Object.keys(per).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {Object.entries(per).sort((a, b) => b[1].bal - a[1].bal).map(([nm, v]) => (
                <div key={nm} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>👤 {nm}</div>
                  <div style={{ fontSize: 10, color: '#D6D7F7' }}>{fmtK(v.bal)} · {v.n} loan{v.n !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={card}><div style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 700 }}>GIVEN (PERIOD)</div><div style={{ fontSize: 22, fontWeight: 900, color: '#3D3FAE', marginTop: 6 }}>{fmtK(givenP)}</div><div style={{ fontSize: 11, color: '#5B607E', marginTop: 4 }}>Money out</div></div>
        <div style={card}><div style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 700 }}>REPAID (PERIOD)</div><div style={{ fontSize: 22, fontWeight: 900, color: '#0B7A6C', marginTop: 6 }}>{fmtK(repaidP)}</div><div style={{ fontSize: 11, color: '#5B607E', marginTop: 4 }}>Money back in</div></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setShowGive(v => !v)} style={{ ...btn, background: '#3D3FAE', color: '#fff', borderColor: '#3D3FAE' }}>+ Give staff loan</button>
        <label style={{ fontSize: 12, color: '#5B607E', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} /> Show all fully repaid loans
        </label>
        <span style={{ fontSize: 12, color: '#5B607E', marginLeft: 'auto' }}>Staff loans are not counted against profit: staff pay them back.</span>
      </div>

      {showGive && (
        <div style={{ ...card, marginBottom: 16, borderColor: '#3D3FAE55' }}>
          <div style={{ fontWeight: 800, color: '#3D3FAE', marginBottom: 12 }}>🤝 New staff loan</div>
          <span style={lbl}>WHICH STAFF MEMBER? *</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {staff.map(u => {
              const on = give.staff_id === u.id
              return <button key={u.id} onClick={() => setGive(p => ({ ...p, staff_id: u.id, staff_name: u.full_name || 'Staff' }))} style={{ ...btn, padding: '6px 12px', borderColor: on ? '#3D3FAE' : '#DCDFEC', background: on ? '#3D3FAE15' : '#fff', color: on ? '#3D3FAE' : '#5B607E' }}>👤 {u.full_name}</button>
            })}
          </div>
          <input style={{ ...input, marginBottom: 12 }} value={give.staff_id ? '' : give.staff_name} onChange={e => setGive(p => ({ ...p, staff_id: '', staff_name: e.target.value }))} placeholder={give.staff_id ? `Selected: ${give.staff_name} · or type another name` : 'Or type a name (staff not in the system)'} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
            <div><span style={lbl}>AMOUNT TZS *</span><input style={input} value={give.amount} onChange={e => setGive(p => ({ ...p, amount: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="e.g. 50000" /></div>
            <div><span style={lbl}>REASON / NOTE</span><input style={input} value={give.note} onChange={e => setGive(p => ({ ...p, note: e.target.value }))} placeholder="e.g. School fees advance" /></div>
            <div><span style={lbl}>DATE</span><input type="date" style={input} value={give.loan_date} onChange={e => setGive(p => ({ ...p, loan_date: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => setShowGive(false)} style={btn}>Cancel</button>
            <button disabled={saving} onClick={saveGive} style={{ ...btn, background: '#B93A16', color: '#fff', borderColor: '#B93A16', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Record staff loan'}</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ background: '#F6F7FB' }}>
              {['Staff', 'Given', 'Amount', 'Repaid', 'Balance', ''].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 10, letterSpacing: 0.8, color: '#5B607E', textAlign: h === 'Staff' || h === 'Given' || h === '' ? 'left' : 'right', borderBottom: '2px solid #DCDFEC' }}>{h.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#5B607E' }}>Loading…</td></tr>}
            {!loading && !shown.length && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#5B607E' }}>No staff loans for this period.</td></tr>}
            {shown.map(l => {
              const lp = pays.filter(p => p.loan_id === l.id)
              const pct = Number(l.amount) > 0 ? l.paid / Number(l.amount) * 100 : 0
              const paying = payFor?.id === l.id
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid #ECEEF7', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>👤 {l.staff_name}</div>
                    {l.note && <div style={{ fontSize: 12, color: '#5B607E', marginTop: 2 }}>{l.note}</div>}
                    {lp.length > 0 && <div style={{ marginTop: 6 }}>{lp.map(p => <div key={p.id} style={{ fontSize: 11, color: '#0B7A6C' }}>+ {fmt(Number(p.amount))} on {p.paid_date}{p.note ? ` · ${p.note}` : ''}</div>)}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#5B607E', whiteSpace: 'nowrap' }}>{l.loan_date}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{fmt(Number(l.amount))}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'right', color: '#0B7A6C' }}>
                    {fmt(Math.round(l.paid))}
                    <div style={{ height: 6, borderRadius: 3, background: '#ECEEF7', marginTop: 6, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, pct)}%`, height: 6, background: '#0B8A7A' }} /></div>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 14, textAlign: 'right', fontWeight: 800, color: l.bal > 0 ? '#B93A16' : '#0B7A6C' }}>{l.bal > 0 ? fmt(Math.round(l.bal)) : '✅ Repaid'}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    {paying ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                        <input autoFocus style={input} value={payFor.amount} onChange={e => setPayFor(p => ({ ...p, amount: e.target.value.replace(/[^0-9.]/g, '') }))} onKeyDown={e => { if (e.key === 'Enter') savePay(); if (e.key === 'Escape') setPayFor(null) }} placeholder={`Amount (max ${fmt(Math.round(l.bal))})`} />
                        <input style={input} value={payFor.note} onChange={e => setPayFor(p => ({ ...p, note: e.target.value }))} placeholder="Note e.g. salary deduction" />
                        <input type="date" style={input} value={payFor.date} onChange={e => setPayFor(p => ({ ...p, date: e.target.value }))} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setPayFor(null)} style={{ ...btn, padding: '5px 10px', fontSize: 12 }}>Cancel</button>
                          <button disabled={saving} onClick={savePay} style={{ ...btn, padding: '5px 10px', fontSize: 12, background: '#0B7A6C', color: '#fff', borderColor: '#0B7A6C' }}>{saving ? '…' : 'Save repayment'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {l.bal > 0 && <button onClick={() => setPayFor({ id: l.id, amount: '', note: '', date: today() })} style={{ ...btn, padding: '6px 12px', fontSize: 12, background: '#0B7A6C', color: '#fff', borderColor: '#0B7A6C' }}>+ Repayment</button>}
                        <button onClick={() => del(l)} title="Delete" style={{ ...btn, padding: '6px 10px', fontSize: 12 }}>🗑</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
