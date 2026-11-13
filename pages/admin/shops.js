import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { T, isPlatformAdmin } from '../../lib/store'
import { SLMark } from '../../components/store/Shell'
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
    </Page>
  )
}

function Page({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: T.surface, color: T.ink, fontFamily: 'Outfit, system-ui, sans-serif' }}>
      <Head><title>Serengeti Admin — Vifurushi</title></Head>
      <header style={{ background: '#fff', borderBottom: '1px solid ' + T.line, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <SLMark size={34} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 17 }}>Serengeti Admin</p>
          <p style={{ fontSize: 13, color: T.muted }}>Vifurushi vya maduka: POS · Store · Zote mbili</p>
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
