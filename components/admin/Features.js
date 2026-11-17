import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, banner, Toggle } from './ui'
import { t } from './i18n'

// Feature switches: on/off for everyone, with overrides for one shop. Hiding never deletes data.
export default function Features({ shops }) {
  const [shopId, setShopId] = useState('')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const load = async (sid = shopId) => {
    const { data, error } = await supabase.rpc('platform_list_features', { p_shop: sid || null })
    if (error) { setErr(error.message); return }
    setErr(''); setRows(data || [])
  }
  useEffect(() => { load(shopId) }, [shopId])
  const setGlobal = async (f, on) => {
    setBusy(f.key)
    const { error } = await supabase.rpc('platform_set_feature', { p_key: f.key, p_enabled: on })
    setBusy(''); if (error) setErr(error.message); else load()
  }
  const setShop = async (f, val) => {   // val: null (follow everyone) | true | false
    setBusy(f.key)
    const { error } = await supabase.rpc('platform_set_shop_feature', { p_shop: shopId, p_key: f.key, p_enabled: val })
    setBusy(''); if (error) setErr(error.message); else load()
  }
  const shop = shops.find(x => x.id === shopId)
  return (
    <div>
      <div style={{ ...card, marginBottom: 14 }}>
        <p style={{ fontWeight: 700 }}>{t('Vipengele vinavyoonekana')}</p>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          {t('Zima tab kwa maduka yote, au chagua duka moja kuweka tofauti. Mabadiliko yanaonekana watumiaji wakifungua upya (web na app). Data haifutwi.')}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{t('Duka moja:')}</label>
          <select value={shopId} onChange={e => setShopId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid ' + T.line, fontSize: 14, minWidth: 240 }}>
            <option value="">{t('— Maduka yote (kwa wote) —')}</option>
            {shops.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ ...banner, borderColor: '#B93A16', color: '#B93A16' }}>{err}</div>}
      {!rows ? <p style={{ color: T.muted }}>{t('Inapakia…')}</p> : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: T.muted, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>{t('Kipengele')}</th>
              <th style={{ padding: '12px 16px' }}>{t('Kwa wote')}</th>
              {shop && <th style={{ padding: '12px 16px' }}>{shop.name}{rows[0]?.plan && <span style={{ fontWeight: 500 }}> · {rows[0].plan}</span>}</th>}
            </tr></thead>
            <tbody>
              {rows.map(f => {
                const base = f.enabled && f.plan_on !== false   // everyone's switch AND the shop's plan
                const effective = f.override === null || f.override === undefined ? base : f.override
                return (
                  <tr key={f.key} style={{ borderTop: '1px solid ' + T.line, opacity: busy === f.key ? 0.5 : 1 }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{f.label}</div>
                      {f.overrides > 0 && <div style={{ fontSize: 12, color: T.muted }}>{t('{n} duka lina mpangilio tofauti', { n: f.overrides })}</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Toggle on={f.enabled} onChange={on => setGlobal(f, on)} />
                    </td>
                    {shop && <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'inline-flex', background: T.tint, borderRadius: 999, padding: 3, gap: 2 }}>
                        {[[null, f.plan ? t(base ? 'Kama mpango (imewashwa)' : 'Kama mpango (imezimwa)') : t(f.enabled ? 'Kama wote (imewashwa)' : 'Kama wote (imezimwa)')], [true, t('Washa')], [false, t('Zima')]].map(([v, l]) => {
                          const on = (f.override ?? null) === v
                          return <button key={String(v)} onClick={() => !on && setShop(f, v)}
                            style={{ border: 0, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: on ? 700 : 500, cursor: on ? 'default' : 'pointer',
                              background: on ? (v === false ? '#B93A16' : v === true ? '#0B7A6C' : T.green) : 'transparent', color: on ? '#fff' : T.ink }}>{l}</button>
                        })}
                      </div>
                      <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: effective ? '#0B7A6C' : '#B93A16' }}>{effective ? t('Inaonekana') : t('Imefichwa')}</span>
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
