import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, th, td, btnP, btnG, inp, lbl, Msg, Toggle, tzs, dmy, mono } from './ui'
import { t } from './i18n'

const PKG = { pos: 'POS', store: 'Store', both: 'POS + Store' }

export default function Settings({ plans, reloadPlans }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, alignItems: 'start' }}>
      <Plans plans={plans} reload={reloadPlans} />
      <div style={{ display: 'grid', gap: 14 }}>
        <Trial />
        <Admins />
      </div>
    </div>
  )
}

function Plans({ plans, reload }) {
  const [edit, setEdit] = useState(null) // {id?, name, package, monthly_price, active}
  const [msg, setMsg] = useState({})
  const save = async () => {
    setMsg({})
    const { error } = await supabase.rpc('platform_save_plan', { p_id: edit.id || null, p_name: edit.name, p_package: edit.package, p_price: Number(edit.monthly_price) || 0, p_active: edit.active })
    if (error) return setMsg({ err: error.message })
    setEdit(null); setMsg({ ok: t('Mpango umehifadhiwa') }); reload()
  }
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: 16 }}>{t('Mipango na bei')}</p>
        <button onClick={() => setEdit({ name: '', package: 'pos', monthly_price: '', active: true })} style={{ ...btnP, padding: '7px 14px', fontSize: 13 }}>{t('+ Mpango')}</button>
      </div>
      <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{t('Bei hizi zinajaza kiasi unaporekodi malipo, na kukadiria mapato ya mwezi.')}</p>
      <Msg err={msg.err} ok={msg.ok} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead><tr><th style={th}>{t('Mpango')}</th><th style={th}>{t('Kifurushi')}</th><th style={{ ...th, textAlign: 'right' }}>{t('Kwa mwezi')}</th><th style={th} /></tr></thead>
        <tbody>
          {plans.map(p => (
            <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
              <td style={td}><b>{p.name}</b>{!p.active && <span style={{ fontSize: 12, color: T.muted }}> · {t('haitumiki')}</span>}</td>
              <td style={td}>{PKG[p.package] || p.package}</td>
              <td style={{ ...td, textAlign: 'right', ...mono, fontWeight: 700 }}>{tzs(p.monthly_price)}</td>
              <td style={{ ...td, textAlign: 'right' }}><button onClick={() => setEdit({ ...p })} style={{ border: 0, background: 'none', color: T.green, fontWeight: 600, cursor: 'pointer' }}>{t('Badilisha')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <div style={{ background: T.surface, borderRadius: 12, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div><label style={lbl}>{t('Jina')}</label><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inp} placeholder={t('mf. POS Pro')} /></div>
            <div><label style={lbl}>{t('Bei kwa mwezi (TZS)')}</label><input type="number" min="0" value={edit.monthly_price} onChange={e => setEdit({ ...edit, monthly_price: e.target.value })} style={{ ...inp, ...mono }} /></div>
            <div><label style={lbl}>{t('Kifurushi')}</label>
              <select value={edit.package} onChange={e => setEdit({ ...edit, package: e.target.value })} style={inp}>
                {Object.entries(PKG).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label style={lbl}>{t('Inatumika')}</label><div style={{ paddingTop: 6 }}><Toggle on={edit.active} onChange={v => setEdit({ ...edit, active: v })} label={t('Inatumika')} /></div></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} style={btnP}>{t('Hifadhi')}</button>
            <button onClick={() => setEdit(null)} style={btnG}>{t('Ghairi')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Trial() {
  const [days, setDays] = useState('')
  const [msg, setMsg] = useState({})
  useEffect(() => { supabase.rpc('platform_get_settings').then(({ data }) => setDays(String(data?.trial_days ?? 14))) }, [])
  const save = async () => {
    const n = parseInt(days)
    if (!(n >= 1 && n <= 180)) return setMsg({ err: t('Weka siku kati ya 1 na 180') })
    const { error } = await supabase.rpc('platform_set_setting', { p_key: 'trial_days', p_value: n })
    setMsg(error ? { err: error.message } : { ok: t('Wateja wapya watapata siku {n} za majaribio', { n }) })
  }
  return (
    <div style={card}>
      <p style={{ fontWeight: 700, fontSize: 16 }}>{t('Kipindi cha majaribio')}</p>
      <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{t('Kwa maduka mapya yanayojisajili mtandaoni.')}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <input type="number" min="1" max="180" value={days} onChange={e => setDays(e.target.value)} style={{ ...inp, width: 110, ...mono }} aria-label={t('Siku za majaribio')} />
        <span style={{ color: T.muted }}>{t('siku')}</span>
        <button onClick={save} style={{ ...btnP, padding: '8px 16px' }}>{t('Hifadhi')}</button>
      </div>
      <Msg err={msg.err} ok={msg.ok} />
    </div>
  )
}

function Admins() {
  const [rows, setRows] = useState([])
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState({})
  const load = () => supabase.rpc('platform_list_admins').then(({ data, error }) => { if (error) setMsg({ err: error.message }); else setRows(data || []) })
  useEffect(() => { load() }, [])
  const add = async () => {
    setMsg({})
    const { error } = await supabase.rpc('platform_add_admin', { p_email: email })
    if (error) return setMsg({ err: error.message })
    setEmail(''); setMsg({ ok: t('Ameongezwa kama admin') }); load()
  }
  const remove = async (a) => {
    if (!window.confirm(t('Ondoa {e} kama admin?', { e: a.email }))) return
    const { error } = await supabase.rpc('platform_remove_admin', { p_user: a.user_id })
    if (error) setMsg({ err: error.message }); else load()
  }
  return (
    <div style={card}>
      <p style={{ fontWeight: 700, fontSize: 16 }}>{t('Watumiaji wa admin')}</p>
      <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{t('Wanaoweza kuingia Serengeti Admin. Akaunti lazima iwe imeshatengenezwa.')}</p>
      <Msg err={msg.err} ok={msg.ok} />
      {rows.map(a => (
        <div key={a.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid ' + T.line, padding: '10px 0' }}>
          <div><b>{a.email}</b>{a.me && <span style={{ fontSize: 12, color: T.muted }}> · {t('wewe')}</span>}<div style={{ fontSize: 12, color: T.muted }}>{t('tangu {d}', { d: dmy(a.added) })}</div></div>
          {!a.me && <button onClick={() => remove(a)} style={{ border: 0, background: 'none', color: '#B93A16', fontWeight: 600, cursor: 'pointer' }}>{t('Ondoa')}</button>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder={t('email ya akaunti')} style={inp} type="email" />
        <button onClick={add} style={{ ...btnP, padding: '8px 16px' }}>{t('Ongeza')}</button>
      </div>
    </div>
  )
}
