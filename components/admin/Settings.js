import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, th, td, btnP, btnG, inp, lbl, Msg, Toggle, tzs, dmy, mono } from './ui'
import { t } from './i18n'

const PKG = { pos: 'POS', store: 'Store', both: 'POS + Store' }

export default function Settings({ plans, reloadPlans }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, alignItems: 'start' }}>
      <Trial />
      <Admins />
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
