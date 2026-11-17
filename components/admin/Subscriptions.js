import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, th, td, btnP, btnG, inp, lbl, Msg, Modal, StatusPill, DaysLeft, dmy, SearchBox, tzs } from './ui'
import { t } from './i18n'

const FILTERS = [['all', 'Zote'], ['ending', 'Zinaisha siku 7'], ['trial', 'Majaribio'], ['active', 'Zinatumika'], ['expired', 'Zimeisha'], ['suspended', 'Zimesimamishwa']]

export default function Subscriptions({ shops, plans, reload, onPay }) {
  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)   // shop
  const [msg, setMsg] = useState({})
  const ending = (x) => ['trial', 'active'].includes(x.status) && x.sub_expires_at && (new Date(x.sub_expires_at) - Date.now()) < 7 * 86400000
  const main = shops.filter(x => !x.parent_id)
  const list = main.filter(x => (f === 'all' || (f === 'ending' ? ending(x) : x.status === f)) && (!q || x.name.toLowerCase().includes(q.toLowerCase()) || (x.phone || '').includes(q) || (x.owner_phone || '').includes(q) || (x.owner || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => new Date(a.sub_expires_at || 0) - new Date(b.sub_expires_at || 0))
  const count = (k) => k === 'all' ? main.length : k === 'ending' ? main.filter(ending).length : main.filter(x => x.status === k).length
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} aria-pressed={f === k}
            style={{ padding: '7px 13px', borderRadius: 999, border: '1px solid ' + (f === k ? T.green : T.line), background: f === k ? T.green : '#fff', color: f === k ? '#fff' : T.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t(l)} <span style={{ opacity: 0.7 }}>{count(k)}</span>
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} /></div>
      <Msg err={msg.err} ok={msg.ok} />
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t('Duka')}</th><th style={th}>{t('Hali')}</th><th style={th}>{t('Mpango')}</th><th style={th}>{t('Inaisha')}</th><th style={th}>{t('Imebaki')}</th><th style={th}>{t('Imelipwa')}</th><th style={th} /></tr></thead>
          <tbody>
            {list.map(x => (
              <tr key={x.id}>
                <td style={td}><b>{x.name}</b>{x.branches > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.tint, borderRadius: 999, padding: '2px 8px', marginLeft: 6 }}>{t('+{n} matawi', { n: x.branches })}</span>}<div style={{ fontSize: 12, color: T.muted }}>{[x.owner, x.owner_phone || x.phone].filter(Boolean).join(' · ')}</div></td>
                <td style={td}><StatusPill s={x.status} /></td>
                <td style={td}>{x.sub_plan || '—'}</td>
                <td style={td}>{dmy(x.sub_expires_at)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><DaysLeft date={x.sub_expires_at} status={x.status} /></td>
                <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{x.paid_total ? tzs(x.paid_total) : '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button onClick={() => onPay(x)} style={{ ...btnP, padding: '7px 12px', fontSize: 12 }}>{t('+ Malipo')}</button>{' '}
                  <button onClick={() => setEdit(x)} style={{ ...btnG, padding: '7px 12px', fontSize: 12 }}>{t('Badilisha')}</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td style={{ ...td, color: T.muted }} colSpan={7}>{t('Hakuna duka.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EditSub shop={edit} plans={plans} onClose={() => setEdit(null)} onDone={(ok) => { setEdit(null); setMsg({ ok }); reload() }} />}
    </div>
  )
}

function EditSub({ shop, plans, onClose, onDone }) {
  const [status, setStatus] = useState(shop.subscription === 'suspended' ? 'suspended' : shop.subscription === 'trial' ? 'trial' : 'active')
  const [plan, setPlan] = useState(shop.sub_plan || '')
  const [exp, setExp] = useState(shop.sub_expires_at ? new Date(shop.sub_expires_at).toISOString().slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const extend = async (m) => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('platform_extend', { p_shop: shop.id, p_months: m })
    setBusy(false)
    if (error) setErr(error.message); else onDone(t('{s}: imeongezwa miezi {m}', { s: shop.name, m }))
  }
  const save = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('platform_set_subscription', { p_shop: shop.id, p_status: status, p_plan: plan || null, p_expires: exp ? new Date(exp + 'T23:59:00').toISOString() : null })
    setBusy(false)
    if (error) setErr(error.message); else onDone(t('{s}: imehifadhiwa', { s: shop.name }))
  }
  return (
    <Modal title={t('Usajili · {s}', { s: shop.name })} onClose={onClose}>
      <p style={{ fontSize: 13, color: T.muted }}>{t('Sasa:')} <StatusPill s={shop.status} /> · {t('inaisha {d}', { d: dmy(shop.sub_expires_at) })}</p>
      <label style={lbl}>{t('Ongeza muda (kuanzia leo au tarehe ya kuisha, iliyo mbele)')}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[1, 3, 6, 12].map(m => <button key={m} disabled={busy} onClick={() => extend(m)} style={{ ...btnG, padding: '8px 14px' }}>{t('+{m} mwezi', { m })}</button>)}
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{t('Kama mteja amelipa, tumia + Malipo badala yake: inarekodi malipo na kuongeza muda pamoja.')}</p>
      <hr style={{ border: 0, borderTop: '1px solid ' + T.line, margin: '16px 0 4px' }} />
      <label style={lbl}>{t('Hali')}</label>
      <div style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3 }}>
        {[['active', 'Inatumika'], ['trial', 'Majaribio'], ['suspended', 'Simamisha']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} aria-pressed={status === v}
            style={{ flex: 1, border: 0, borderRadius: 999, padding: '8px 0', fontWeight: status === v ? 700 : 500, cursor: 'pointer', background: status === v ? (v === 'suspended' ? '#B93A16' : T.green) : 'transparent', color: status === v ? '#fff' : T.ink }}>{t(l)}</button>
        ))}
      </div>
      <label style={lbl}>{t('Mpango')}</label>
      <select value={plan} onChange={e => setPlan(e.target.value)} style={inp}>
        <option value="">{t('— chagua —')}</option>
        {plans.filter(p => p.active || p.name === plan).map(p => <option key={p.id} value={p.name}>{t('{p} · {v}/mwezi', { p: p.name, v: tzs(p.monthly_price) })}</option>)}
        {plan && !plans.some(p => p.name === plan) && <option value={plan}>{plan}</option>}
      </select>
      <label style={lbl}>{t('Tarehe ya kuisha')}</label>
      <input type="date" value={exp} onChange={e => setExp(e.target.value)} style={inp} />
      {status === 'suspended' && <p style={{ fontSize: 12, color: '#B93A16', marginTop: 8 }}>{t('Kusimamisha kunaonyesha hali tu kwenye admin; hakufungi akaunti ya duka.')}</p>}
      {err && <p style={{ color: '#B93A16', fontWeight: 600, marginTop: 10 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button disabled={busy} onClick={save} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{t('Hifadhi')}</button>
        <button onClick={onClose} style={btnG}>{t('Ghairi')}</button>
      </div>
    </Modal>
  )
}
