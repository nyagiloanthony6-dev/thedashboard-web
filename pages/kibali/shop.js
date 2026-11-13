import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { useKibali, rpc, swWords, STATUS, fmtTime, isToday, itemSummary, ui, loadProducts, loadReserved, KIND, defaultKind, hasBoth, resKey } from '../../lib/kibali'
import Shell from '../../components/kibali/Shell'
import OrderModal from '../../components/kibali/OrderModal'

const TABS = [
  { href: '/kibali/shop', label: 'Oda mpya', icon: '＋' },
  { href: '/kibali/shop?tab=orders', label: 'Oda', icon: '☰' },
]
const blankLine = () => ({ key: Math.random().toString(36).slice(2), product_id: '', search: '', qty: '', kind: 'retail' })

export default function KibaliShop() {
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
  const [justCreated, setJustCreated] = useState(null)

  const load = useCallback(async () => {
    if (!k.shop?.id) return
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const [p, r, o] = await Promise.all([
      loadProducts(k.shop.id),
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

  const byName = useMemo(() => Object.fromEntries(products.map(p => [p.name.toLowerCase(), p])), [products])
  const byId = useMemo(() => Object.fromEntries(products.map(p => [String(p.id), p])), [products])
  const avail = (p, kind) => (kind === 'wholesale' ? p?.wholesale : p?.retail || 0) - (reserved[resKey(p?.id, kind)] || 0)

  const setLine = (key, patch) => setLines(ls => ls.map(l => {
    if (l.key !== key) return l
    const n = { ...l, ...patch }
    if ('search' in patch) {
      const p = byName[patch.search.trim().toLowerCase()]
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
      {tab === 'new' && (
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
            <p style={{ fontWeight: 800, marginBottom: 10 }}>Bidhaa</p>
            <datalist id="kb-products">{products.map(p => <option key={p.id} value={p.name}>Rejareja {avail(p, 'retail')} · Jumla {avail(p, 'wholesale')}</option>)}</datalist>
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((l, i) => {
                const p = byId[String(l.product_id)]
                const q = Number(l.qty)
                const a = p ? avail(p, l.kind) : null
                return (
                  <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 36px', gap: 8, alignItems: 'start' }}>
                    <div>
                      <input list="kb-products" value={l.search} onChange={e => setLine(l.key, { search: e.target.value })} placeholder={`Bidhaa ${i + 1}`} aria-label={`Bidhaa ${i + 1}`} />
                      <div style={{ fontSize: 11, marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8, minHeight: 15 }}>
                        <span style={{ color: '#58a6ff', fontWeight: 700 }}>{q > 0 ? `${swWords(q)} (${q}) ${(p?.unit || '').toUpperCase()}` : ''}</span>
                        {l.search && !p && <span style={{ color: '#f0b429' }}>Chagua kutoka kwenye orodha</span>}
                        {p && <span style={{ color: q > a ? '#ff4d6d' : '#3fb950', fontWeight: 700 }}>{q > a ? `! ${KIND[l.kind].sw}: zipo ${a} tu` : `✓ ${KIND[l.kind].sw}: ${a} zipo`}</span>}
                      </div>
                      {p && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {['retail', 'wholesale'].map(kd => {
                            const on = l.kind === kd, show = hasBoth(p) || defaultKind(p) === kd
                            if (!show) return null
                            return (
                              <button key={kd} type="button" onClick={() => setLine(l.key, { kind: kd })}
                                style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: '1px solid', borderColor: on ? KIND[kd].c : '#30363d', background: on ? KIND[kd].c + '22' : 'transparent', color: on ? KIND[kd].c : '#7d8590' }}>
                                {KIND[kd].sw} · {avail(p, kd)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <input type="number" min="1" step="1" inputMode="numeric" value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} placeholder="Idadi" aria-label={`Idadi ${i + 1}`} style={{ fontWeight: 800, fontSize: 16 }} />
                    <button onClick={() => setLines(ls => ls.length > 1 ? ls.filter(x => x.key !== l.key) : [blankLine()])} aria-label="Ondoa" style={{ ...ui.btn, padding: '10px 0' }}>×</button>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLines(ls => [...ls, blankLine()])} style={{ ...ui.btn, width: '100%', marginTop: 12, borderStyle: 'dashed', color: '#58a6ff' }}>+ Ongeza bidhaa</button>
          </div>

          {error && <div style={ui.banner('#ff4d6d')}>{error}</div>}
          {short && <div style={ui.banner('#f0b429')}>Stoo haina za kutosha kwa baadhi ya bidhaa. Unaweza kuendelea, lakini stoo itatoa kilichopo tu.</div>}
          <button disabled={saving} onClick={create} style={{ ...ui.primary, padding: 16, fontSize: 16 }}>
            {saving ? 'Inahifadhi…' : `🖨 Tengeneza oda na chapisha${totalUnits ? ` · vipimo ${totalUnits}` : ''}`}
          </button>
        </div>
      )}

      {tab === 'orders' && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
          {orders.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: '#7d8590' }}>Hakuna oda leo bado.</div>}
          {orders.map(o => (
            <button key={o.id} onClick={() => setOpenId(o.id)} style={{ ...ui.card, textAlign: 'left', color: '#e6edf3', display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ ...ui.mono, fontSize: 16, fontWeight: 700, textDecoration: o.status === 'CANCELLED' ? 'line-through' : 'none' }}>{o.order_no}</span>
                <span>{o.flagged && <span style={{ ...ui.pill('CANCELLED'), color: '#ff4d6d', background: 'rgba(255,77,109,0.12)', marginRight: 6 }}>FLAG</span>}<span style={ui.pill(o.status)}>{STATUS[o.status].label}</span></span>
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
