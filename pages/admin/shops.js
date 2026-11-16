import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { T, isPlatformAdmin } from '../../lib/store'
import { TDMark } from '../../components/store/Shell'
import Icon from '../../components/store/Icon'

// Serengeti Labs platform admin: choose each shop's package.
const PACKAGES = [
  { v: 'pos', label: 'POS pekee', desc: 'TheDashboard POS' },
  { v: 'store', label: 'Store pekee', desc: 'TheDashboard Store' },
  { v: 'both', label: 'Zote mbili', desc: 'POS + Store' },
]
const pkgOf = (s) => s.pos && s.store ? 'both' : s.store ? 'store' : 'pos'
const PKG_COLOR = { pos: '#2D2F8F', store: '#0F7375', both: '#9A5B00' }

export default function AdminShops() {
  const [allowed, setAllowed] = useState(null)
  const [shops, setShops] = useState([])
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(null)
  const [ask, setAsk] = useState(null) // { shop, pkg }
  const [done, setDone] = useState('')
  const [view, setView] = useState('packages') // packages | features

  const load = async () => {
    const { data, error } = await supabase.rpc('platform_list_shops')
    if (error) { setErr(error.message); return }
    setErr(''); setShops(data || [])
  }
  useEffect(() => { isPlatformAdmin().then(ok => { setAllowed(ok); if (ok) load() }) }, [])

  const counts = useMemo(() => shops.reduce((a, s) => ({ ...a, [pkgOf(s)]: a[pkgOf(s)] + 1 }), { pos: 0, store: 0, both: 0 }), [shops])
  const list = shops.filter(s =>
    (filter === 'all' || pkgOf(s) === filter) &&
    (!q || (s.name || '').toLowerCase().includes(q.toLowerCase()) || (s.phone || '').includes(q)))

  const apply = async () => {
    const { shop, pkg } = ask
    setAsk(null); setBusy(shop.id)
    const { error } = await supabase.rpc('platform_set_package', { p_shop: shop.id, p_package: pkg })
    setBusy(null)
    if (error) { setErr(error.message); return }
    setDone(`${shop.name}: sasa ${PACKAGES.find(p => p.v === pkg).label}`)
    setTimeout(() => setDone(''), 4000)
    load()
  }

  if (allowed === null) return <Page><p style={{ color: T.muted }}>Inapakia…</p></Page>
  if (!allowed) return (
    <Page>
      <div style={card}><p style={{ fontWeight: 700, fontSize: 18 }}>Huna ruhusa</p>
        <p style={{ color: T.muted, marginTop: 6 }}>Ukurasa huu ni wa Serengeti Labs pekee.</p></div>
    </Page>
  )

  return (
    <Page>
      <div role="tablist" style={{ display: 'inline-flex', background: T.tint, borderRadius: 999, padding: 4, marginBottom: 18 }}>
        {[['packages', 'Vifurushi (POS / Store)'], ['features', 'Vipengele (tabs)']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            style={{ border: 0, borderRadius: 999, padding: '9px 18px', fontSize: 14, fontWeight: view === v ? 700 : 500, cursor: 'pointer',
              background: view === v ? T.green : 'transparent', color: view === v ? '#fff' : T.ink }}>{l}</button>
        ))}
      </div>
      {view === 'features' ? <FeaturesPanel shops={shops} /> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[['all', 'Maduka yote', shops.length, T.ink], ...PACKAGES.map(p => [p.v, p.label, counts[p.v], PKG_COLOR[p.v]])].map(([v, l, n, c]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ ...card, textAlign: 'left', cursor: 'pointer', padding: 16, borderColor: filter === v ? c : T.line, boxShadow: filter === v ? `0 0 0 2px ${c}33` : 'none' }}>
            <p style={{ fontSize: 13, color: T.muted }}>{l}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: c, fontFamily: 'JetBrains Mono, monospace' }}>{n}</p>
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 420 }}>
        <span style={{ position: 'absolute', left: 12, top: 11, color: T.muted }}><Icon name="search" size={18} /></span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tafuta duka au simu…" style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: 10, border: '1px solid ' + T.line, fontSize: 15, background: '#fff' }} />
      </div>

      {err && <div style={{ ...banner, borderColor: '#B93A16', color: '#B93A16' }}>{err}</div>}
      {done && <div style={{ ...banner, borderColor: '#0B7A6C', color: '#0B7A6C' }}>✓ {done}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {list.map(s => {
          const cur = pkgOf(s)
          return (
            <div key={s.id} style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
              <div style={{ minWidth: 200 }}>
                <p style={{ fontWeight: 700, fontSize: 16 }}>{s.name}</p>
                <p style={{ fontSize: 13, color: T.muted }}>{[s.phone, s.subscription, s.created_at && 'tangu ' + new Date(s.created_at).toLocaleDateString('en-GB')].filter(Boolean).join(' · ')}</p>
              </div>
              <div role="radiogroup" aria-label={'Kifurushi cha ' + s.name} style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 4, gap: 2, opacity: busy === s.id ? 0.5 : 1 }}>
                {PACKAGES.map(p => {
                  const on = cur === p.v
                  return (
                    <button key={p.v} role="radio" aria-checked={on} disabled={busy === s.id}
                      onClick={() => !on && setAsk({ shop: s, pkg: p.v })}
                      style={{ border: 0, borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: on ? 700 : 500, cursor: on ? 'default' : 'pointer',
                        background: on ? PKG_COLOR[p.v] : 'transparent', color: on ? '#fff' : T.ink }}>
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {list.length === 0 && !err && <p style={{ color: T.muted }}>Hakuna duka.</p>}
      </div>

      {ask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }} onClick={() => setAsk(null)}>
          <div style={{ ...card, maxWidth: 420, width: '100%', padding: 22 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, fontSize: 18 }}>Badilisha kifurushi?</p>
            <p style={{ marginTop: 8 }}><b>{ask.shop.name}</b>: {PACKAGES.find(p => p.v === pkgOf(ask.shop)).label} → <b style={{ color: PKG_COLOR[ask.pkg] }}>{PACKAGES.find(p => p.v === ask.pkg).label}</b></p>
            <p style={{ color: T.muted, fontSize: 14, marginTop: 8 }}>
              {ask.pkg === 'store' ? 'Kurasa za POS (mauzo, cashier, ripoti…) zitafichwa. Data haifutwi.'
                : ask.pkg === 'pos' ? 'Store itafichwa (oda za kutoa store, pokea mzigo). Data haifutwi.'
                : 'Duka litaona POS na Store.'}
              {' '}Watumiaji wataona mabadiliko wakifungua upya ukurasa.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setAsk(null)} style={{ ...btn, background: '#fff', color: T.ink, border: '1px solid ' + T.line }}>Ghairi</button>
              <button onClick={apply} style={{ ...btn, background: T.green, color: '#fff' }}>Ndiyo, badilisha</button>
            </div>
          </div>
        </div>
      )}
      </>}
    </Page>
  )
}

// Feature switches: on/off for everyone, with overrides for one shop. Hiding never deletes data.
function FeaturesPanel({ shops }) {
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
        <p style={{ fontWeight: 700 }}>Vipengele vinavyoonekana</p>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          Zima tab kwa maduka yote, au chagua duka moja kuweka tofauti. Mabadiliko yanaonekana watumiaji wakifungua upya (web na app). Data haifutwi.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Duka moja:</label>
          <select value={shopId} onChange={e => setShopId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid ' + T.line, fontSize: 14, minWidth: 240 }}>
            <option value="">— Maduka yote (kwa wote) —</option>
            {shops.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ ...banner, borderColor: '#B93A16', color: '#B93A16' }}>{err}</div>}
      {!rows ? <p style={{ color: T.muted }}>Inapakia…</p> : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: T.muted, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Kipengele</th>
              <th style={{ padding: '12px 16px' }}>Kwa wote</th>
              {shop && <th style={{ padding: '12px 16px' }}>{shop.name}</th>}
            </tr></thead>
            <tbody>
              {rows.map(f => {
                const effective = f.override === null || f.override === undefined ? f.enabled : f.override
                return (
                  <tr key={f.key} style={{ borderTop: '1px solid ' + T.line, opacity: busy === f.key ? 0.5 : 1 }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{f.label}</div>
                      {f.overrides > 0 && <div style={{ fontSize: 12, color: T.muted }}>{f.overrides} duka lina mpangilio tofauti</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Toggle on={f.enabled} onChange={on => setGlobal(f, on)} />
                    </td>
                    {shop && <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'inline-flex', background: T.tint, borderRadius: 999, padding: 3, gap: 2 }}>
                        {[[null, `Kama wote (${f.enabled ? 'imewashwa' : 'imezimwa'})`], [true, 'Washa'], [false, 'Zima']].map(([v, l]) => {
                          const on = (f.override ?? null) === v
                          return <button key={String(v)} onClick={() => !on && setShop(f, v)}
                            style={{ border: 0, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: on ? 700 : 500, cursor: on ? 'default' : 'pointer',
                              background: on ? (v === false ? '#B93A16' : v === true ? '#0B7A6C' : T.green) : 'transparent', color: on ? '#fff' : T.ink }}>{l}</button>
                        })}
                      </div>
                      <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: effective ? '#0B7A6C' : '#B93A16' }}>{effective ? 'Inaonekana' : 'Imefichwa'}</span>
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
function Toggle({ on, onChange }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{ width: 46, height: 26, borderRadius: 999, border: 0, cursor: 'pointer', position: 'relative', background: on ? '#0B7A6C' : '#C9CCDD', transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
}

function Page({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: T.surface, color: T.ink, fontFamily: 'Outfit, system-ui, sans-serif' }}>
      <Head><title>Serengeti Admin — Vifurushi</title></Head>
      <header style={{ background: '#fff', borderBottom: '1px solid ' + T.line, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <TDMark size={34} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 17 }}>Serengeti Admin</p>
          <p style={{ fontSize: 13, color: T.muted }}>Vifurushi na vipengele vya maduka</p>
        </div>
        <Link href="/" style={{ fontSize: 14, color: T.green, fontWeight: 600 }}>← Rudi</Link>
      </header>
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>{children}</main>
    </div>
  )
}

const card = { background: '#fff', border: '1px solid ' + T.line, borderRadius: 14, padding: '14px 16px' }
const banner = { border: '1px solid', borderRadius: 10, padding: '10px 14px', marginBottom: 12, background: '#fff', fontWeight: 600 }
const btn = { border: 0, borderRadius: 999, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
