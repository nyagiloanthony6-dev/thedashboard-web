import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

// Daily cash report
//   cash collected = revenue − loans given
//   cash remained  = revenue − loans − expenses − petty cash + loan repayments received
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const N = v => Number(v) || 0
const money = v => (N(v) < 0 ? '−' : '') + 'TZS ' + Math.round(Math.abs(N(v))).toLocaleString()
const plain = v => (N(v) < 0 ? '−' : '') + Math.round(Math.abs(N(v))).toLocaleString()
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

export default function DailyCash() {
  const now = new Date()
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showEmpty, setShowEmpty] = useState(false)
  const [edit, setEdit] = useState(null) // { day, amount, note }
  const [saving, setSaving] = useState(false)

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    let shopData = prof?.shops
    if (!shopData) {
      const { data: owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    setProfile(prof); setShop(shopData)
  })() }, [])

  const limited = !!profile && !['super_admin', 'shop_admin'].includes(profile.role)

  const load = async () => {
    if (!shop?.id) return
    setLoading(true); setErr('')
    let from = new Date(ym.y, ym.m, 1), last = new Date(ym.y, ym.m + 1, 0)
    let to = last > now ? now : last
    if (limited) { from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2); to = now }
    const { data, error } = await supabase.rpc('td_daily_cash', { p_shop: shop.id, p_from: iso(from), p_to: iso(to) })
    if (error) {
      setErr(/td_daily_cash|function/i.test(error.message) ? 'The daily cash report is not set up yet. Run the "daily cash" SQL (20261120020000_daily_cash.sql) in Supabase.' : error.message)
      setRows([])
    } else setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [shop?.id, ym.y, ym.m, limited])

  const savePetty = async () => {
    const amt = parseFloat(String(edit.amount).replace(/,/g, '')) || 0
    if (amt < 0) { alert('Petty cash cannot be negative.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('td_set_petty_cash', { p_shop: shop.id, p_day: edit.day, p_amount: amt, p_note: edit.note || null })
    setSaving(false)
    if (error) { alert(error.message); return }
    setEdit(null); load()
  }

  const todayIso = iso(now)
  const active = r => r.day === todayIso || N(r.revenue) || N(r.expenses) || N(r.petty_cash) || N(r.repaid)
  const shown = (showEmpty || limited) ? rows : rows.filter(active)
  const T = rows.reduce((a, r) => ({
    n: a.n + N(r.sales_count), revenue: a.revenue + N(r.revenue), loan: a.loan + N(r.loan), cash_in: a.cash_in + N(r.cash_in),
    expenses: a.expenses + N(r.expenses), petty: a.petty + N(r.petty_cash), repaid: a.repaid + N(r.repaid), remained: a.remained + N(r.remained),
    sl: a.sl + N(r.staff_loan), sr: a.sr + N(r.staff_repaid),
  }), { n: 0, revenue: 0, loan: 0, cash_in: 0, expenses: 0, petty: 0, repaid: 0, remained: 0, sl: 0, sr: 0 })
  const hasStaff = T.sl > 0 || T.sr > 0
  const isCur = ym.y === now.getFullYear() && ym.m === now.getMonth()

  const exportCSV = () => {
    const head = ['Date','Sales','Revenue','Loans','Cash collected','Expenses','Petty cash','Loan repayments','Cash remained','Note']
    const lines = [...rows].reverse().map(r => [r.day, r.sales_count, N(r.revenue), N(r.loan), N(r.cash_in), N(r.expenses), N(r.petty_cash), N(r.repaid), N(r.remained), JSON.stringify(r.note || '')].join(','))
    lines.push(['TOTAL', T.n, T.revenue, T.loan, T.cash_in, T.expenses, T.petty, T.repaid, T.remained, ''].join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `daily_cash_${ym.y}-${String(ym.m+1).padStart(2,'0')}.csv`; a.click()
  }

  const th = { padding: '10px 10px', fontSize: 10, letterSpacing: 0.8, color: '#5B607E', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '2px solid #DCDFEC' }
  const td = { padding: '10px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #ECEEF7', fontVariantNumeric: 'tabular-nums' }
  const card = { background: '#fff', border: '1px solid #DCDFEC', borderRadius: 14, padding: 16 }
  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #DCDFEC', background: '#fff', color: '#15183A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

  return (
    <>
      <Head><title>Daily cash — TheDashboard</title></Head>
      <Layout title="Daily cash report" shop={shop} profile={profile}>
        <style>{`
          .dc-wrap{overflow-x:auto}
          @media print { body *{visibility:hidden} .dc-print, .dc-print *{visibility:visible} .dc-print{position:absolute;left:0;top:0;width:100%} .dc-noprint{display:none!important} }
        `}</style>
        <div className="dc-print">
          <div className="dc-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Link href="/reports" style={{ color: '#5B607E', fontSize: 13, marginRight: 8 }}>← Reports</Link>
            {limited ? <div style={{ fontWeight: 800, fontSize: 16 }}>Last 3 days</div> : <>
            <button style={btn} onClick={() => setYm(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })}>‹</button>
            <div style={{ fontWeight: 800, fontSize: 16, minWidth: 110, textAlign: 'center' }}>{MON[ym.m]} {ym.y}</div>
            <button style={{ ...btn, opacity: isCur ? 0.4 : 1 }} disabled={isCur} onClick={() => setYm(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })}>›</button>
            </>}
            <div style={{ flex: 1 }} />
            {!limited && <label style={{ fontSize: 12, color: '#5B607E', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> Show days with no activity
            </label>}
            <button style={btn} onClick={exportCSV} disabled={!rows.length}>⬇ CSV</button>
            <button style={{ ...btn, background: '#2D2F8F', color: '#fff', borderColor: '#2D2F8F' }} onClick={() => window.print()}>🖨 Print / PDF</button>
          </div>

          {err && <div style={{ ...card, borderColor: '#B93A1655', color: '#B93A16', marginBottom: 16, fontSize: 13 }}>{err}</div>}

          {!err && !limited && (
            <div style={{ background: '#2D2F8F', borderRadius: 16, padding: 20, color: '#fff', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: 1.2, color: '#C9CBF2', fontWeight: 700 }}>CASH REMAINED · {MON[ym.m].toUpperCase()} {ym.y}{shop?.name ? ` · ${shop.name.toUpperCase()}` : ''}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4, color: T.remained >= 0 ? '#fff' : '#FFB49C' }}>{money(T.remained)}</div>
                  <div style={{ fontSize: 12, color: '#C9CBF2', marginTop: 2 }}>{T.n} sales · {rows.filter(active).length} days with activity</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px,1fr))', gap: 8 }}>
                  {[['Revenue', T.revenue, ''], ['Loans', T.loan, '−'], ['Cash collected', T.cash_in, '='], ['Expenses', T.expenses, '−'], ['Petty cash', T.petty, '−'], ['Repayments', T.repaid, '+'], ...(hasStaff ? [['Staff loans', T.sl, '−'], ['Staff repaid', T.sr, '+']] : [])].map(([l, v, sg]) => (
                    <div key={l} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{sg ? sg + ' ' : ''}{plain(v)}</div>
                      <div style={{ fontSize: 10, color: '#C9CBF2', letterSpacing: 0.6 }}>{l.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#C9CBF2', marginTop: 12 }}>Cash remained = Revenue − Loans − Expenses − Petty cash + Loan repayments{hasStaff ? ' − Staff loans + Staff repayments' : ''}</div>
            </div>
          )}

          {!err && (
            <div style={{ ...card, padding: 0 }} className="dc-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead>
                  <tr style={{ background: '#F6F7FB' }}>
                    <th style={{ ...th, textAlign: 'left' }}>DATE</th>
                    <th style={th}>SALES</th>
                    <th style={th}>REVENUE</th>
                    <th style={{ ...th, color: '#B93A16' }}>− LOANS</th>
                    <th style={th}>= CASH COLLECTED</th>
                    <th style={{ ...th, color: '#B93A16' }}>− EXPENSES</th>
                    <th style={{ ...th, color: '#9A5B00' }}>− PETTY CASH<div style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>cash left at shop</div></th>
                    <th style={{ ...th, color: '#0B7A6C' }}>+ REPAYMENTS</th>
                    {hasStaff && <th style={{ ...th, color: '#3D3FAE' }}>− STAFF LOANS</th>}
                    {hasStaff && <th style={{ ...th, color: '#0B7A6C' }}>+ STAFF REPAID</th>}
                    <th style={th}>= CASH REMAINED</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !rows.length && <tr><td colSpan={hasStaff ? 11 : 9} style={{ ...td, textAlign: 'center', color: '#5B607E' }}>Loading…</td></tr>}
                  {!loading && shown.length === 0 && <tr><td colSpan={hasStaff ? 11 : 9} style={{ ...td, textAlign: 'center', color: '#5B607E', padding: 30 }}>No sales or expenses in {MON[ym.m]} {ym.y}.</td></tr>}
                  {shown.map(r => {
                    const d = new Date(r.day + 'T00:00:00'); const isToday = r.day === todayIso
                    const editing = edit && edit.day === r.day
                    return (
                      <tr key={r.day} style={{ background: isToday ? '#F3F3FC' : undefined }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                          {DOW[d.getDay()]} {d.getDate()} {MON[d.getMonth()]}{isToday && <span style={{ marginLeft: 6, fontSize: 10, color: '#2D2F8F', fontWeight: 800 }}>TODAY</span>}
                          {r.note && <div style={{ fontSize: 11, color: '#5B607E', fontWeight: 400, marginTop: 2 }}>📝 {r.note}</div>}
                        </td>
                        <td style={{ ...td, color: '#5B607E' }}>{r.sales_count}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{plain(r.revenue)}</td>
                        <td style={{ ...td, color: N(r.loan) ? '#B93A16' : '#B8BBD0' }}>{plain(r.loan)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{plain(r.cash_in)}</td>
                        <td style={{ ...td, color: N(r.expenses) ? '#B93A16' : '#B8BBD0' }}>{plain(r.expenses)}</td>
                        <td style={{ ...td }}>
                          {(limited && r.day !== todayIso) ? (
                            <span title="Only the shop admin can change past days" style={{ color: '#9A5B00', fontWeight: 600 }}>{plain(r.petty_cash)} 🔒</span>
                          ) : editing ? (
                            <div className="dc-noprint" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                              <input autoFocus value={edit.amount} onChange={e => setEdit(p => ({ ...p, amount: e.target.value.replace(/[^0-9.]/g, '') }))} onKeyDown={e => { if (e.key === 'Enter') savePetty(); if (e.key === 'Escape') setEdit(null) }} placeholder="Amount" style={{ width: 110, padding: '5px 8px', border: '1px solid #F2A007', borderRadius: 6, textAlign: 'right' }} />
                              <input value={edit.note} onChange={e => setEdit(p => ({ ...p, note: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') savePetty() }} placeholder="Note (optional)" style={{ width: 150, padding: '5px 8px', border: '1px solid #DCDFEC', borderRadius: 6 }} />
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => setEdit(null)} style={{ ...btn, padding: '3px 8px', fontSize: 11 }}>Cancel</button>
                                <button disabled={saving} onClick={savePetty} style={{ ...btn, padding: '3px 10px', fontSize: 11, background: '#0B7A6C', color: '#fff', borderColor: '#0B7A6C' }}>{saving ? '…' : 'Save'}</button>
                              </div>
                            </div>
                          ) : (
                            <button title="Set petty cash" onClick={() => setEdit({ day: r.day, amount: N(r.petty_cash) ? String(N(r.petty_cash)) : '', note: r.note || '' })}
                              style={{ background: N(r.petty_cash) ? 'transparent' : '#F2A00714', border: N(r.petty_cash) ? 'none' : '1px dashed #F2A00788', borderRadius: 6, padding: '3px 8px', color: '#9A5B00', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              {N(r.petty_cash) ? plain(r.petty_cash) : <span className="dc-noprint">+ Set</span>}
                              {N(r.petty_cash) ? <span className="dc-noprint" style={{ marginLeft: 4, fontSize: 11 }}>✏️</span> : null}
                            </button>
                          )}
                          {r.set_by && N(r.petty_cash) > 0 && !editing && <div style={{ fontSize: 10, color: '#9A5B00', marginTop: 2 }}>by {r.set_by}</div>}
                        </td>
                        <td style={{ ...td, color: N(r.repaid) ? '#0B7A6C' : '#B8BBD0' }}>{plain(r.repaid)}</td>
                        {hasStaff && <td style={{ ...td, color: N(r.staff_loan) ? '#3D3FAE' : '#B8BBD0' }}>{plain(r.staff_loan)}</td>}
                        {hasStaff && <td style={{ ...td, color: N(r.staff_repaid) ? '#0B7A6C' : '#B8BBD0' }}>{plain(r.staff_repaid)}</td>}
                        <td style={{ ...td, fontWeight: 900, color: N(r.remained) >= 0 ? '#0B7A6C' : '#B93A16' }}>{plain(r.remained)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {rows.length > 0 && !limited && (
                  <tfoot>
                    <tr style={{ background: '#F6F7FB' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 900, borderTop: '2px solid #DCDFEC' }}>TOTAL</td>
                      <td style={{ ...td, fontWeight: 800, borderTop: '2px solid #DCDFEC' }}>{T.n}</td>
                      <td style={{ ...td, fontWeight: 800, borderTop: '2px solid #DCDFEC' }}>{plain(T.revenue)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#B93A16', borderTop: '2px solid #DCDFEC' }}>{plain(T.loan)}</td>
                      <td style={{ ...td, fontWeight: 800, borderTop: '2px solid #DCDFEC' }}>{plain(T.cash_in)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#B93A16', borderTop: '2px solid #DCDFEC' }}>{plain(T.expenses)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#9A5B00', borderTop: '2px solid #DCDFEC' }}>{plain(T.petty)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#0B7A6C', borderTop: '2px solid #DCDFEC' }}>{plain(T.repaid)}</td>
                      {hasStaff && <td style={{ ...td, fontWeight: 800, color: '#3D3FAE', borderTop: '2px solid #DCDFEC' }}>{plain(T.sl)}</td>}
                      {hasStaff && <td style={{ ...td, fontWeight: 800, color: '#0B7A6C', borderTop: '2px solid #DCDFEC' }}>{plain(T.sr)}</td>}
                      <td style={{ ...td, fontWeight: 900, fontSize: 15, color: T.remained >= 0 ? '#0B7A6C' : '#B93A16', borderTop: '2px solid #DCDFEC' }}>{plain(T.remained)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p className="dc-noprint" style={{ fontSize: 12, color: '#5B607E', marginTop: 12 }}>
            Click <b>+ Set</b> in the Petty cash column to enter the cash left at the shop (petty cash) for that day.{limited ? ' Cashiers can set today only; the shop admin can change past days.' : ''} Loans include the unpaid part of split sales.
          </p>
        </div>
      </Layout>
    </>
  )
}
