import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, btnP, btnG, inp, lbl, Msg, Toggle, Modal, tzs, mono } from './ui'
import { t } from './i18n'

const PKG = { pos: 'POS', store: 'Store', both: 'POS + Store' }

// Plans (products): price, the features they include, how many shops, and whether Store comes with them
export default function Plans({ plans, reload, shops }) {
  const [feats, setFeats] = useState([])
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState({})
  useEffect(() => {
    supabase.rpc('platform_list_features', { p_shop: null }).then(({ data }) => setFeats(data || []))
  }, [])
  const using = (p) => shops.filter(s => !s.parent_id && (s.plan_id === p.id || (!s.plan_id && s.sub_plan === p.name))).length
  const featLabel = (k) => (feats.find(f => f.key === k) || {}).label || k
  const shown = [...plans].sort((a, b) => (b.active - a.active) || (a.sort - b.sort) || a.monthly_price - b.monthly_price)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: T.muted, maxWidth: 640 }}>{t('Kila mpango una bei, vipengele vyake, idadi ya maduka, na kama Store imo. Duka linaona vipengele vya mpango wake tu.')}</p>
        <button onClick={() => setEdit({ name: '', package: 'pos', monthly_price: '', active: true, features: null, max_shops: 1, includes_store: false, description: '' })} style={btnP}>{t('+ Mpango')}</button>
      </div>
      <Msg err={msg.err} ok={msg.ok} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {shown.map(p => {
          const all = !p.features
          const missing = all ? [] : feats.filter(f => !p.features.includes(f.key) && f.enabled)
          return (
            <div key={p.id} style={{ ...card, opacity: p.active ? 1 : 0.55, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: T.muted }}>{PKG[p.package] || p.package}{!p.active && ' · ' + t('haitumiki')}</p>
                </div>
                <p style={{ ...mono, fontWeight: 700, fontSize: 18, color: T.green, whiteSpace: 'nowrap' }}>{tzs(p.monthly_price)}<span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{t('/mwezi')}</span></p>
              </div>
              {p.description && <p style={{ fontSize: 13, color: T.ink }}>{p.description}</p>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip>{(p.max_shops || 1) > 1 ? t('Maduka hadi {n}', { n: p.max_shops }) : t('Duka 1')}</Chip>
                <Chip>{all ? t('Vipengele vyote') : t('Vipengele {n}', { n: p.features.length })}</Chip>
                {p.includes_store && <Chip c="#0B7A6C">{t('Store imo')}</Chip>}
                <Chip c={T.muted}>{t('Maduka {n} yanatumia', { n: using(p) })}</Chip>
              </div>
              {missing.length > 0 && (
                <p style={{ fontSize: 12, color: T.muted }}><b>{t('Haina:')}</b> {missing.map(f => f.label).join(', ')}</p>
              )}
              <div style={{ marginTop: 'auto' }}>
                <button onClick={() => setEdit({ ...p, description: p.description || '' })} style={{ ...btnG, padding: '7px 14px', fontSize: 13 }}>{t('Badilisha')}</button>
              </div>
            </div>
          )
        })}
      </div>
      {edit && <EditPlan plan={edit} feats={feats} featLabel={featLabel} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); setMsg({ ok: t('Mpango umehifadhiwa') }); reload() }} />}
    </div>
  )
}

function Chip({ children, c }) {
  return <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: T.tint, color: c || T.ink }}>{children}</span>
}

function EditPlan({ plan, feats, onClose, onSaved }) {
  const [p, setP] = useState(plan)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const all = !p.features
  const has = (k) => all || p.features.includes(k)
  const toggle = (k) => {
    const cur = all ? feats.map(f => f.key) : p.features
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
    setP({ ...p, features: next.length === feats.length ? null : next })
  }
  const save = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('platform_save_plan', {
      p_id: p.id || null, p_name: p.name, p_package: p.package, p_price: Number(p.monthly_price) || 0, p_active: p.active,
      p_features: p.features, p_max_shops: Math.max(1, Number(p.max_shops) || 1), p_includes_store: !!p.includes_store, p_description: p.description || null,
    })
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }
  return (
    <Modal title={p.id ? p.name : t('Mpango mpya')} onClose={onClose} width={680}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <div><label style={lbl}>{t('Jina')}</label><input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} style={inp} placeholder={t('mf. POS Pro')} /></div>
        <div><label style={lbl}>{t('Bei kwa mwezi (TZS)')}</label><input type="number" min="0" value={p.monthly_price} onChange={e => setP({ ...p, monthly_price: e.target.value })} style={{ ...inp, ...mono }} /></div>
        <div><label style={lbl}>{t('Kifurushi')}</label>
          <select value={p.package} onChange={e => setP({ ...p, package: e.target.value })} style={inp}>
            {Object.entries(PKG).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label style={lbl}>{t('Idadi ya maduka (matawi)')}</label><input type="number" min="1" max="100" value={p.max_shops} onChange={e => setP({ ...p, max_shops: e.target.value })} style={{ ...inp, ...mono }} /></div>
      </div>
      <label style={lbl}>{t('Maelezo')}</label>
      <input value={p.description} onChange={e => setP({ ...p, description: e.target.value })} style={inp} placeholder={t('hiari')} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle on={!!p.includes_store} onChange={v => setP({ ...p, includes_store: v })} label={t('Store imo (inawashwa ukiweka mpango huu)')} />
          <span style={{ fontSize: 14 }}>{t('Store imo (inawashwa ukiweka mpango huu)')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle on={!!p.active} onChange={v => setP({ ...p, active: v })} label={t('Inatumika')} />
          <span style={{ fontSize: 14 }}>{t('Inatumika')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
        <label style={{ ...lbl, marginTop: 0 }}>{t('Vipengele vilivyomo')}</label>
        <button onClick={() => setP({ ...p, features: null })} style={{ border: 0, background: 'none', color: T.green, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('Chagua vyote')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
        {feats.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: has(f.key) ? T.tint : T.surface, cursor: 'pointer', fontSize: 14, opacity: f.enabled ? 1 : 0.55, textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: T.ink }}>
            <input type="checkbox" checked={has(f.key)} onChange={() => toggle(f.key)} style={{ width: 16, height: 16, accentColor: T.green }} />
            <span>{f.label}{!f.enabled && <span style={{ fontSize: 11, color: T.muted }}> · {t('imezimwa kwa wote')}</span>}</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{t('Mabadiliko yanaonekana kwa maduka yote ya mpango huu wakifungua upya. Data haifutwi.')}</p>
      {err && <p role="alert" style={{ color: T.danger || '#B42318', fontSize: 13, marginTop: 8 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? t('Inahifadhi…') : t('Hifadhi')}</button>
        <button onClick={onClose} style={btnG}>{t('Ghairi')}</button>
      </div>
    </Modal>
  )
}
