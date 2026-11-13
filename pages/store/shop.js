import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { useKibali, rpc, swWords, STATUS, fmtTime, isToday, itemSummary, ui, loadProducts, loadReserved, KIND, defaultKind, hasBoth, resKey, categoriesOf, T } from '../../lib/store'
import Shell from '../../components/store/Shell'
import Icon from '../../components/store/Icon'
import OrderModal from '../../components/store/OrderModal'

const TABS = [
  { href: '/store/shop', label: 'Oda mpya', icon: 'plus' },
  { href: '/store/shop?tab=orders', label: 'Oda', icon: 'list' },
]
const blankLine = () => ({ key: Math.random().toString(36).slice(2), product_id: '', search: '', qty: '', kind: 'retail' })

export default function StoreShop() {
  const k = useKibali()
  const router = useRouter()
  const tab = router.query.tab === 'orders' ? 'orders' : 'new'

  const [products, setProducts] = useState([])
  const [reserved, setReserved] = useState({})
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState({ customer: '', phone: '', collector: '', ref: '' })
  const [lines, setLines] = useState([blankLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [cat, setCat] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [justCreated, setJustCreated] = useState(null)

  const load = useCallback(async () => {
    if (!k.shop?.id) return
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const [p, r, o] = await Promise.all([
      loadProducts(k.shop.id).then(r => { setLoadErr(''); return r }).catch(e => { setLoadErr(e.message); return [] }),
      loadReserved(),
      supabase.from('release_orders').select('*,release_order_items(*)').gte('created_at', since.toISOString()).order('created_at', { ascending: false }),
    ])
    setProducts(p)
    setReserved(r)
    setOrders(o.data || [])
  }, [k.shop?.id])

  useEffect(() => {
    if (!k.modules.kibali) return
    load(); const t = setInterval(load, 15000); return () => clearInterval(t)
  }, [load, k.modules.kibali])

  const cats = useMemo(() => categoriesOf(products), [products])
  const pickable = cat ? products.filter(p => p.category === cat) : products
  const byName = useMemo(() => Object.fromEntries(products.map(p => [p.name.toLowerCase(), p])), [products])
  const byId = useMemo(() => Object.fromEntries(products.map(p => [String(p.id), p])), [products])
  const avail = (p, kind) => (kind === 'wholesale' ? p?.wholesale : p?.retail || 0) - (reserved[resKey(p?.id, kind)] || 0)

  const setLine = (key, patch) => setLines(ls => ls.map(l => {
    if (l.key !== key) return l
    const n = { ...l, ...patch }
    if ('search' in patch) {
      const key = patch.search.trim().toLowerCase()
      const p = byName[key] || products.find(x => (x.part_number || '').toLowerCase() === key)
      n.product_id = p?.id || ''
      if (p && String(p.id) !== String(l.product_id)) n.kind = defaultKind(p)
    }
    return n
  }))

  const create = async () => {
    setError('')
    const items = []
    for (const [i, l] of lines.entries()) {
      if (!l.search && !l.qty) continue
      if (!l.product_id) return setError(`Mstari ${i + 1}: chagua bidhaa kutoka kwenye orodha`)
      const q = Number(l.qty)
      if (!Number.isInteger(q) || q < 1) return setError(`Mstari ${i + 1}: idadi iwe namba kamili, 1 au zaidi`)
      items.push({ product_id: l.product_id, qty: q, kind: l.kind })
    }
    if (!items.length) return setError('Ongeza angalau bidhaa moja')
    setSaving(true)
    try {
      const res = await rpc('kibali_create_order', { p_customer: form.customer, p_phone: form.phone, p_collector: form.collector, p_sale_ref: form.ref, p_items: items })
      setForm({ customer: '', phone: '', collector: '', ref: '' }); setLines([blankLine()])
      await load()
      setJustCreated(res.order_id); setOpenId(res.order_id)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const totalUnits = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0)
  const short = lines.find(l => l.product_id && Number(l.qty) > avail(byId[String(l.product_id)], l.kind))

  return (
    <Shell k={k} title={tab === 'new' ? 'Oda mpya' : 'Oda za leo'} tabs={TABS}>
      {k.modules.kibali && !k.can('order.create') && <div style={ui.banner('#9A5B00')}>Akaunti yako haina ruhusa ya kutengeneza oda za Store.</div>}
      {tab === 'new' && k.can('order.create') && (
        <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
          <div style={{ ...ui.card, display: 'grid', gap: 10 }}>
            <div><label>Mteja</label><input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="mf. Juma Hardware" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              <div><label>Simu</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="si lazima" /></div>
              <div><label>Atakayechukua</label><input value={form.collector} onChange={e => setForm({ ...form, collector: e.target.value })} placeholder="mf. Baraka (dereva)" /></div>
              <div><label>Ref ya mauzo</label><input value={form.ref} onChange={e => setForm({ ...form, ref: e.target.value })} placeholder="si lazima" /></div>
            </div>
          </div>

          <div style={ui.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <p style={ui.h}>Bidhaa</p>
              {cats.length > 0 && (
                <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 'auto', minWidth: 180, padding: '7px 10px', fontSize: 13 }} aria-label="Kundi">
                  <option value="">Makundi yote</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            <datalist id="kb-products">{pickable.map(p => <option key={p.id} value={p.name}>{[p.part_number, p.category].filter(Boolean).join(' · ')}{p.part_number || p.category ? ' · ' : ''}{p.product_type === 'wholesale' ? `Jumla ${avail(p, 'wholesale')}` : hasBoth(p) ? `Rejareja ${avail(p, 'retail')} · Jumla ${avail(p, 'wholesale')}` : `Rejareja ${avail(p, 'retail')}`}</option>)}</datalist>
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((l, i) => {
                const p = byId[String(l.product_id)]
                const q = Number(l.qty)
                const a = p ? avail(p, l.kind) : null
                return (
                  <div key={l.key} style={{ display: 'grid', gap: 8, paddingBottom: 12, borderBottom: `1px solid ${T.line}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 46px', gap: 8 }}>
                      <input list="kb-products" value={l.search} onChange={e => setLine(l.key, { search: e.target.value })} placeholder={`Bidhaa ${i + 1}`} aria-label={`Bidhaa ${i + 1}`} />
                      <input type="number" min="1" step="1" inputMode="numeric" value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} placeholder="Idadi" aria-label={`Idadi ${i + 1}`} style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 18, textAlign: 'center' }} />
                      <button onClick={() => setLines(ls => ls.length > 1 ? ls.filter(x => x.key !== l.key) : [blankLine()])} aria-label="Ondoa" style={{ ...ui.btn, padding: 0, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} /></button>
                    </div>
                    {(q > 0 || l.search) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                        <span style={{ color: T.green, fontWeight: 700, letterSpacing: 0.2 }}>{q > 0 ? `${swWords(q)} (${q}) ${(p?.unit || '').toUpperCase()}` : ''}</span>
                        {l.search && !p && <span style={{ color: T.warning, fontWeight: 600 }}>Chagua kutoka kwenye orodha</span>}
                        {p && <span style={{ color: q > a ? T.danger : T.success, fontWeight: 600 }}>{q > a ? `! ${KIND[l.kind].sw}: zipo ${a} tu` : `✓ ${KIND[l.kind].sw}: ${a} zipo`}</span>}
                      </div>
                    )}
                    {p && (hasBoth(p)) && (
                      <div role="group" aria-label="Aina ya stock" style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3, width: 'fit-content' }}>
                        {['retail', 'wholesale'].map(kd => {
                          const on = l.kind === kd
                          return (
                            <button key={kd} type="button" onClick={() => setLine(l.key, { kind: kd })} aria-pressed={on}
                              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, border: 'none', background: on ? T.raised : 'transparent', color: on ? KIND[kd].c : T.muted, boxShadow: on ? '0 0 0 1px ' + T.line : 'none' }}>
                              {KIND[kd].sw} · {avail(p, kd)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLines(ls => [...ls, blankLine()])} style={{ ...ui.btn, width: '100%', marginTop: 12, borderStyle: 'dashed', color: T.green, height: 46 }}>+ Ongeza bidhaa</button>
          </div>

          {error && <div style={ui.banner('#B93A16')}>{error}</div>}
          {loadErr && <div style={ui.banner(T.danger)}>{loadErr}</div>}
          {short && <div style={ui.banner(T.warning)}>Store haina za kutosha kwa baadhi ya bidhaa. Unaweza kuendelea, lakini store itatoa kilichopo tu.</div>}
          <div style={{ position: 'sticky', bottom: 84, zIndex: 5, background: T.raised, border: `1px solid ${T.line}`, borderTop: `2px solid ${T.green}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: T.muted }}>
              <span>Bidhaa {lines.filter(l => l.product_id && Number(l.qty) > 0).length} · Vipimo vyote {totalUnits}</span>
              {short && <span style={{ color: T.danger, fontWeight: 600 }}>Stock haitoshi</span>}
            </div>
            <button disabled={saving} onClick={create} style={{ ...ui.primary, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="print" size={20} />{saving ? 'Inahifadhi…' : 'Tengeneza oda na chapisha'}
            </button>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
          {orders.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: '#5B607E' }}>Hakuna oda leo bado.</div>}
          {orders.map(o => (
            <button key={o.id} className="kb-card-btn" onClick={() => setOpenId(o.id)} style={{ ...ui.card, textAlign: 'left', color: T.ink, display: 'grid', gap: 4, width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ ...ui.mono, fontSize: 16, fontWeight: 700, textDecoration: o.status === 'CANCELLED' ? 'line-through' : 'none' }}>{o.order_no}</span>
                <span>{o.flagged && <span style={{ ...ui.pill('CANCELLED'), color: '#B93A16', background: '#FBE1D8', marginRight: 6 }}>FLAG</span>}<span style={ui.pill(o.status)}>{STATUS[o.status].label}</span></span>
              </div>
              <span style={{ fontWeight: 700 }}>{o.customer_name || 'Mteja wa papo hapo'}</span>
              <span style={ui.muted}>{itemSummary(o.release_order_items)}</span>
              <span style={ui.muted}>{fmtTime(o.created_at)} · {o.created_by_name}</span>
            </button>
          ))}
        </div>
      )}

      {openId && (
        <OrderModal k={k} orderId={openId} autoPrint={openId === justCreated}
          onClose={() => { setOpenId(null); setJustCreated(null) }} onChanged={load} />
      )}
    </Shell>
  )
}
