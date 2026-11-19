import { useState } from 'react'
import { fmt, fmtK } from '../lib/supabase'

// Loan report: month → day → entries (loans given, repayments, waivers).
// Given counts on the day of the sale; repaid and waived on the day they happened;
// "still owing" is what is left today on that month's loans.
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const KIND = {
  given: { l: 'Loan given', c: '#B93A16', i: '🔴' },
  repaid: { l: 'Repaid', c: '#0B7A6C', i: '💵' },
  waived: { l: 'Waived', c: '#9A5B00', i: '🤝' },
}

export default function LoanReport({ loans, loanAmount, owingOf, onOpen }) {
  const [openMonth, setOpenMonth] = useState(null)
  const [openDay, setOpenDay] = useState(null)

  const months = {}
  const M = (d) => {
    const k = d.getFullYear() + '-' + d.getMonth()
    if (!months[k]) months[k] = { key: k, label: MN[d.getMonth()] + ' ' + d.getFullYear(), y: d.getFullYear(), m: d.getMonth(), given: 0, nGiven: 0, repaid: 0, nRepaid: 0, waived: 0, owing: 0, days: {} }
    return months[k]
  }
  const D = (mo, d) => {
    const k = d.getDate()
    if (!mo.days[k]) mo.days[k] = { day: k, given: 0, nGiven: 0, repaid: 0, waived: 0, items: [] }
    return mo.days[k]
  }
  loans.forEach(x => {
    const who = x.customers?.name || 'Walk-in'
    const d = new Date(x.sale_date || x.created_at), mo = M(d), dy = D(mo, d), a = loanAmount(x)
    mo.given += a; mo.nGiven += 1; mo.owing += owingOf(x)
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
  })
  const list = Object.values(months).sort((a, b) => b.y - a.y || b.m - a.m)
  const T = list.reduce((t, mo) => ({ given: t.given + mo.given, repaid: t.repaid + mo.repaid, waived: t.waived + mo.waived, owing: t.owing + mo.owing }), { given: 0, repaid: 0, waived: 0, owing: 0 })

  const card = { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12 }
  const num = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const th = { fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600, padding: '6px 10px', textAlign: 'right' }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        {[{ l: 'GIVEN', v: T.given, c: '#2D2F8F' }, { l: 'REPAID', v: T.repaid, c: '#0B7A6C' }, { l: 'WAIVED', v: T.waived, c: '#9A5B00' }, { l: 'STILL OWING', v: T.owing, c: '#B93A16' }].map(k => (
          <div key={k.l} style={{ ...card, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 900, color: k.c, ...num }}>{fmtK(k.v)}</p>
            <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginTop: 2 }}>{k.l}</p>
          </div>
        ))}
      </div>

      {!list.length && <div style={{ ...card, padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No loans yet.</div>}

      {list.map(mo => {
        const open = openMonth === mo.key
        const days = Object.values(mo.days).sort((a, b) => b.day - a.day)
        return (
          <div key={mo.key} style={{ ...card, marginBottom: 10, overflow: 'hidden' }}>
            <button onClick={() => { setOpenMonth(open ? null : mo.key); setOpenDay(null) }} aria-expanded={open}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', border: 0, cursor: 'pointer', textAlign: 'left', background: open ? 'rgba(45,47,143,0.08)' : '#F5F6FB', fontFamily: 'inherit' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: open ? '#2D2F8F' : '#15183A' }}>{mo.label}</p>
                <p style={{ fontSize: 12, color: '#5B607E', marginTop: 2 }}>{mo.nGiven} loan{mo.nGiven !== 1 ? 's' : ''} · {mo.nRepaid} repayment{mo.nRepaid !== 1 ? 's' : ''}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#2D2F8F', ...num }}>Given {fmtK(mo.given)}</p>
                  <p style={{ fontSize: 12, ...num }}>
                    <span style={{ color: '#0B7A6C' }}>Repaid {fmtK(mo.repaid)}</span>
                    {mo.waived > 0 && <span style={{ color: '#9A5B00' }}> · Waived {fmtK(mo.waived)}</span>}
                  </p>
                  {mo.owing > 0 && <p style={{ fontSize: 12, color: '#B93A16', ...num }}>Still owing {fmtK(mo.owing)}</p>}
                </div>
                <span aria-hidden="true" style={{ color: '#5B607E' }}>{open ? '▲' : '▼'}</span>
              </div>
            </button>
            {open && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid #ECEEF7' }}>
                  <th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>DATE</th><th style={th}>GIVEN</th><th style={th}>REPAID</th><th style={{ ...th, paddingRight: 16 }}>WAIVED</th>
                </tr></thead>
                <tbody>
                  {days.map(dy => {
                    const dk = mo.key + '-' + dy.day, dOpen = openDay === dk
                    const cell = (v, c) => <span style={{ color: v ? c : '#C4C7DA', ...num }}>{v ? fmtK(v) : '—'}</span>
                    return [
                      <tr key={dk} onClick={() => setOpenDay(dOpen ? null : dk)} style={{ cursor: 'pointer', borderBottom: '1px solid #ECEEF7', background: dOpen ? '#F5F6FB' : 'transparent' }}>
                        <td style={{ padding: '9px 10px 9px 16px', fontWeight: 600 }}>{dy.day} {MN[mo.m]} <span style={{ color: '#8A8FAE', fontSize: 11 }}>{dOpen ? '▲' : '▼'}</span></td>
                        <td style={{ padding: 9, textAlign: 'right' }}>{cell(dy.given, '#2D2F8F')}{dy.nGiven > 1 && <span style={{ color: '#8A8FAE', fontSize: 11 }}> ({dy.nGiven})</span>}</td>
                        <td style={{ padding: 9, textAlign: 'right' }}>{cell(dy.repaid, '#0B7A6C')}</td>
                        <td style={{ padding: '9px 16px 9px 9px', textAlign: 'right' }}>{cell(dy.waived, '#9A5B00')}</td>
                      </tr>,
                      ...(dOpen ? dy.items.map((it, ix) => (
                        <tr key={dk + '-' + ix} onClick={() => onOpen(it.sale)} style={{ cursor: 'pointer', background: '#FAFBFE', borderBottom: '1px solid #ECEEF7' }} title="Open loan">
                          <td colSpan={3} style={{ padding: '8px 10px 8px 28px' }}>
                            <span style={{ fontWeight: 600 }}>{KIND[it.kind].i} {it.who}</span>
                            <span style={{ color: '#5B607E', fontSize: 12 }}> · {KIND[it.kind].l}{it.g ? ` · 🤝 ${it.g}` : ''}{it.note ? ` · ${it.note}` : ''}</span>
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
      <p style={{ fontSize: 11, color: '#8A8FAE', marginTop: 6 }}>Given = loan amount on the day of the sale. Repaid and waived are counted on the day they happened. "Still owing" is what is left today on that month's loans.</p>
    </div>
  )
}
