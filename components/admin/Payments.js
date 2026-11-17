import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, th, td, btnP, btnG, inp, lbl, Msg, Modal, Kpi, tzs, dmy, mono, SearchBox } from './ui'
import { t } from './i18n'

const METHODS = [['mpesa', 'M-Pesa'], ['tigopesa', 'Mixx by Yas'], ['airtel', 'Airtel Money'], ['bank', 'Benki'], ['cash', 'Taslimu']]
const methodLabel = (m) => t((METHODS.find(x => x[0] === m) || [m, m])[1])

// Record a payment: saves it and extends the subscription by the months paid for
export function RecordPayment({ shop, shops, plans, onClose, onDone }) {
  const [shopId, setShopId] = useState(shop?.id || '')
  const sel = shops.find(x => x.id === shopId)
  const defPlan = plans.find(p => p.active && p.name === sel?.sub_plan) || plans.find(p => p.active)
  const [d, setD] = useState({ plan: defPlan?.id || '', months: '1', amount: defPlan ? String(defPlan.monthly_price || '') : '', paid_at: new Date().toISOString().slice(0, 10), method: 'mpesa', reference: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setD(x => ({ ...x, [k]: e.target.value }))
  const autoAmount = (planId, months) => { const p = plans.find(x => x.id === planId); return p && p.monthly_price ? String(p.monthly_price * (Number(months) || 0)) : d.amount }
  const months = Number(d.months) || 0
  const newExp = sel ? new Date(Math.max(Date.now(), sel.sub_expires_at ? new Date(sel.sub_expires_at).getTime() : 0)) : null
  if (newExp && months) newExp.setMonth(newExp.getMonth() + months)
  const save = async () => {
    setErr('')
    if (!shopId) return setErr(t('Chagua duka'))
    if (!(Number(d.amount) >= 0) || d.amount === '') return setErr(t('Andika kiasi'))
    setBusy(true)
    const { error } = await supabase.rpc('platform_record_payment', {
      p_shop: shopId, p_amount: Number(d.amount), p_paid_at: d.paid_at, p_method: d.method, p_reference: d.reference,
      p_months: months, p_plan: d.plan || null, p_note: d.note,
    })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone(t('{a} kutoka {s} imerekodiwa', { a: tzs(d.amount), s: sel?.name }) + (months ? t(' · usajili hadi {d}', { d: dmy(newExp) }) : ''))
  }
  return (
    <Modal title={t('Rekodi malipo')} onClose={onClose} width={500}>
      {!shop && <>
        <label style={lbl}>{t('Duka')}</label>
        <select value={shopId} onChange={e => setShopId(e.target.value)} style={inp}>
          <option value="">{t('— chagua duka —')}</option>
          {shops.filter(x => !x.parent_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </>}
      {shop && <p style={{ fontSize: 14 }}><b>{shop.name}</b> · {t('inaisha sasa {d}', { d: dmy(shop.sub_expires_at) })}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <div><label style={lbl}>{t('Mpango')}</label>
          <select value={d.plan} onChange={e => setD(x => ({ ...x, plan: e.target.value, amount: autoAmount(e.target.value, x.months) }))} style={inp}>
            <option value="">{t('— bila mpango —')}</option>
            {plans.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div><label style={lbl}>{t('Miezi inayolipiwa')}</label>
          <input type="number" min="0" max="60" value={d.months} onChange={e => setD(x => ({ ...x, months: e.target.value, amount: autoAmount(x.plan, e.target.value) }))} style={inp} /></div>
        <div><label style={lbl}>{t('Kiasi (TZS) *')}</label><input type="number" min="0" value={d.amount} onChange={set('amount')} style={{ ...inp, ...mono, fontSize: 16 }} /></div>
        <div><label style={lbl}>{t('Tarehe ya malipo')}</label><input type="date" value={d.paid_at} onChange={set('paid_at')} style={inp} /></div>
        <div><label style={lbl}>{t('Njia')}</label>
          <select value={d.method} onChange={set('method')} style={inp}>{METHODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
        <div><label style={lbl}>{t('Kumbukumbu (mf. namba ya muamala)')}</label><input value={d.reference} onChange={set('reference')} style={inp} /></div>
      </div>
      <label style={lbl}>{t('Maelezo')}</label><input value={d.note} onChange={set('note')} style={inp} placeholder={t('hiari')} />
      {sel && months > 0 && <p style={{ background: T.tint, borderRadius: 10, padding: 10, marginTop: 12, fontSize: 13 }}>{t('Usajili utaongezwa miezi {m}: hadi {d}, hali "Inatumika".', { m: months, d: dmy(newExp) })}</p>}
      {sel && months === 0 && <p style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{t('Miezi 0: malipo yanarekodiwa bila kuongeza muda (mf. ada ya kuanzisha au mafunzo).')}</p>}
      {err && <p style={{ color: '#B93A16', fontWeight: 600, marginTop: 10 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button disabled={busy} onClick={save} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? t('Inahifadhi…') : t('Hifadhi malipo')}</button>
        <button onClick={onClose} style={btnG}>{t('Ghairi')}</button>
      </div>
    </Modal>
  )
}

export default function Payments({ shops, plans, reload }) {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState({})
  const [q, setQ] = useState('')
  const [range, setRange] = useState('month')
  const [rec, setRec] = useState(false)
  const from = () => { const d = new Date(); if (range === 'month') d.setDate(1); else if (range === '90') d.setDate(d.getDate() - 90); else if (range === 'year') { d.setMonth(0); d.setDate(1) } else return null; return d.toISOString().slice(0, 10) }
  const load = () => supabase.rpc('platform_list_payments', { p_shop: null, p_from: from() }).then(({ data, error }) => { if (error) setMsg({ err: error.message }); else setRows(data || []) })
  useEffect(() => { load() }, [range])
  const voidIt = async (p) => {
    if (!window.confirm(t('Futa (void) malipo ya {a} kutoka {s}? Muda wa usajili hautabadilika.', { a: tzs(p.amount), s: p.shop }))) return
    const { error } = await supabase.rpc('platform_void_payment', { p_id: p.id })
    if (error) setMsg({ err: error.message }); else { setMsg({ ok: t('Malipo yamefutwa (void)') }); load(); reload() }
  }
  const list = (rows || []).filter(p => !q || (p.shop || '').toLowerCase().includes(q.toLowerCase()) || (p.reference || '').toLowerCase().includes(q.toLowerCase()))
  const total = list.filter(p => !p.voided).reduce((a, p) => a + Number(p.amount), 0)
  const byMethod = {}; list.filter(p => !p.voided).forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount) })
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3 }}>
          {[['month', 'Mwezi huu'], ['90', 'Siku 90'], ['year', 'Mwaka huu'], ['all', 'Yote']].map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} aria-pressed={range === v}
              style={{ border: 0, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: range === v ? 700 : 500, cursor: 'pointer', background: range === v ? T.green : 'transparent', color: range === v ? '#fff' : T.ink }}>{t(l)}</button>
          ))}
        </div>
        <button onClick={() => setRec(true)} style={btnP}>{t('+ Rekodi malipo')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Kpi l={t('Jumla ya malipo')} v={tzs(total)} c={T.green} sub={t('{n} malipo', { n: list.filter(p => !p.voided).length })} />
        {Object.entries(byMethod).map(([m, v]) => <Kpi key={m} l={methodLabel(m)} v={tzs(v)} />)}
      </div>
      <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder={t('Tafuta duka au kumbukumbu…')} /></div>
      <Msg err={msg.err} ok={msg.ok} />
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t('Tarehe')}</th><th style={th}>{t('Duka')}</th><th style={{ ...th, textAlign: 'right' }}>{t('Kiasi')}</th><th style={th}>{t('Njia')}</th><th style={th}>{t('Kumbukumbu')}</th><th style={th}>{t('Miezi')}</th><th style={th}>{t('Mpango')}</th><th style={th} /></tr></thead>
          <tbody>
            {rows === null && <tr><td style={{ ...td, color: T.muted }} colSpan={8}>{t('Inapakia…')}</td></tr>}
            {list.map(p => (
              <tr key={p.id} style={{ opacity: p.voided ? 0.45 : 1 }}>
                <td style={td}>{dmy(p.paid_at)}</td>
                <td style={td}><b>{p.shop}</b>{p.note && <div style={{ fontSize: 12, color: T.muted }}>{p.note}</div>}</td>
                <td style={{ ...td, textAlign: 'right', ...mono, fontWeight: 700, textDecoration: p.voided ? 'line-through' : 'none' }}>{tzs(p.amount)}</td>
                <td style={td}>{methodLabel(p.method)}</td>
                <td style={{ ...td, ...mono, fontSize: 13 }}>{p.reference || '—'}</td>
                <td style={td}>{p.months || '—'}</td>
                <td style={td}>{p.plan || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{p.voided ? <span style={{ fontSize: 12, color: T.muted }}>void</span>
                  : <button onClick={() => voidIt(p)} style={{ border: 0, background: 'none', color: '#B93A16', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Void</button>}</td>
              </tr>
            ))}
            {rows && list.length === 0 && <tr><td style={{ ...td, color: T.muted }} colSpan={8}>{t('Hakuna malipo kipindi hiki.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{t('Ankara (invoices) zinabaki kwenye Serengeti billing admin. Hapa tunarekodi malipo na kuongeza muda wa usajili.')}</p>
      {rec && <RecordPayment shops={shops} plans={plans} onClose={() => setRec(false)} onDone={(ok) => { setRec(false); setMsg({ ok }); load(); reload() }} />}
    </div>
  )
}
