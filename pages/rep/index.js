import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function SalesRep() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [products, setProducts] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [repSettings, setRepSettings] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('orders')
  const [orderModal, setOrderModal] = useState(false)
  const [orderCust, setOrderCust] = useState(null)
  const [orderCart, setOrderCart] = useState([])
  const [orderSearch, setOrderSearch] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderSaving, setOrderSaving] = useState(false)
  const [custModal, setCustModal] = useState(false)
  const [custForm, setCustForm] = useState({ name: '', phone: '', location: '', business_type: 'Garage' })
  const [custSaving, setCustSaving] = useState(false)
  const [custSearch, setCustSearch] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { loadData() }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    if (!prof) { router.push('/auth/login'); return }
    if (prof.role === 'shop_admin') { router.push('/dashboard'); return }
    if (prof.role === 'cashier') { router.push('/cashier'); return }
    setProfile(prof)
    const shopData = prof.shops
    setShop(shopData)
    const shopId = shopData.id

    const [pr, cf, cu, or_, rs, nt] = await Promise.all([
      supabase.from('products').select('*').eq('shop_id', shopId).eq('is_active', true).order('name'),
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopId),
      supabase.from('field_customers').select('*').eq('shop_id', shopId).eq('created_by', user.id).order('name'),
      supabase.from('field_orders').select('*,field_order_items(*)').eq('shop_id', shopId).eq('created_by', user.id).order('created_at', { ascending: false }),
      supabase.from('sales_rep_settings').select('*').eq('user_id', user.id).eq('shop_id', shopId).single(),
      supabase.from('commission_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ])

    const prods = pr.data || []
    if (prods.length) {
      const { data: cfv } = await supabase.from('product_field_values').select('*').in('product_id', prods.map(p => p.id))
      const map = {}
      ;(cfv || []).forEach(v => { if (!map[v.product_id]) map[v.product_id] = {}; map[v.product_id][v.field_id] = v.value })
      prods.forEach(p => { p._cfv = map[p.id] || {} })
    }

    setProducts(prods)
    setCustomFields(cf.data || [])
    setCustomers(cu.data || [])
    setOrders(or_.data || [])
    setRepSettings(rs.data || null)
    setNotifications(nt.data || [])
    setLoading(false)
  }

  const submitOrder = async () => {
    if (!orderCust) { showToast('Select a customer'); return }
    if (!orderCart.length) { showToast('Add products'); return }
    setOrderSaving(true)
    const total = orderCart.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0), 0)
    const { data: order, error } = await supabase.from('field_orders').insert({
      shop_id: shop.id, field_customer_id: orderCust.id, customer_name: orderCust.name,
      status: 'pending', total, notes: orderNotes.trim() || null, created_by: profile.id,
    }).select().single()
    if (error) { showToast('Error: ' + error.message); setOrderSaving(false); return }
    await supabase.from('field_order_items').insert(orderCart.map(it => ({
      order_id: order.id, product_id: it.product.id, product_name: it.product.name,
      image_emoji: it.product.image_emoji || '📦', qty: parseFloat(it.qty),
      unit_price: parseFloat(it.unit_price) || 0,
      subtotal: (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0),
    })))
    setOrders(p => [{ ...order, field_order_items: orderCart.map(it => ({ product_name: it.product.name, qty: it.qty, unit_price: it.unit_price, subtotal: (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0) })) }, ...p])
    setOrderModal(false); setOrderCart([]); setOrderCust(null); setOrderNotes('')
    setOrderSaving(false)
    showToast('✅ Order submitted to cashier!')
  }

  const saveCustomer = async () => {
    if (!custForm.name.trim()) { showToast('Enter name'); return }
    setCustSaving(true)
    const raw = custForm.phone.trim().replace(/\D/g, '')
    const phone = raw.startsWith('0') ? '255' + raw.slice(1) : raw.startsWith('255') ? raw : raw ? '255' + raw : null
    const { data, error } = await supabase.from('field_customers').insert({
      shop_id: shop.id, name: custForm.name.trim(), phone,
      location: custForm.location.trim() || null, business_type: custForm.business_type,
      status: 'prospect', created_by: profile.id,
    }).select().single()
    if (error) { showToast('Error: ' + error.message); setCustSaving(false); return }
    setCustomers(p => [data, ...p])
    setCustModal(false); setCustSaving(false)
    setCustForm({ name: '', phone: '', location: '', business_type: 'Garage' })
    showToast('Customer added!')
  }

  // Commission calc
  const now = new Date()
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthOrders = orders.filter(o => o.status === 'fulfilled' && new Date(o.fulfilled_at || o.created_at) >= mStart)
  const monthTotal = monthOrders.reduce((a, o) => a + (Number(o.total) || 0), 0)
  const target = Number(repSettings?.monthly_target) || 0
  const calcComm = (amt) => {
    if (!repSettings) return amt * 0.05
    if (repSettings.commission_type === 'tiered') {
      const t1 = target * (Number(repSettings.tier_1_cap) || 0.5)
      const t2 = target * (Number(repSettings.tier_2_cap) || 1.0)
      const r = monthTotal <= t1 ? (Number(repSettings.tiered_rate_1) || 2) : monthTotal <= t2 ? (Number(repSettings.tiered_rate_2) || 4) : (Number(repSettings.tiered_rate_3) || 7)
      return amt * r / 100
    }
    return amt * (Number(repSettings.commission_rate) || 5) / 100
  }
  const getCommAmt = (o) => (Number(o.commission_amount) || 0) > 0 ? Number(o.commission_amount) : calcComm(Number(o.total) || 0)
  const approvedComm = monthOrders.filter(o => o.commission_status === 'approved').reduce((a, o) => a + getCommAmt(o), 0)
  const pendingComm = monthOrders.filter(o => o.commission_status !== 'approved' && o.commission_status !== 'rejected').reduce((a, o) => a + getCommAmt(o), 0)
  const pct = target > 0 ? Math.min(100, Math.round(monthTotal / target * 100)) : 0
  const unread = notifications.filter(n => !n.is_read).length

  const T = {
    screen: { minHeight: '100vh', background: '#0d1117', color: '#e6edf3' },
    header: { background: '#161b22', borderBottom: '1px solid #30363d', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
    tabs: { display: 'flex', background: '#161b22', borderBottom: '1px solid #30363d' },
    tab: (active) => ({ flex: 1, padding: '10px', textAlign: 'center', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? '#a78bfa' : '#7d8590', background: 'none', border: 'none', borderBottom: active ? '2px solid #a78bfa' : '2px solid transparent', cursor: 'pointer' }),
    card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 14, marginBottom: 12 },
    input: { background: '#0d1117', border: '1.5px solid #30363d', borderRadius: 8, color: '#e6edf3', padding: '10px 12px', fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit' },
    btn: (c = '#a78bfa', tc = '#000') => ({ padding: '10px 16px', borderRadius: 8, background: c, color: tc, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }),
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1117' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head><title>Sales Rep — {shop?.name}</title></Head>
      <div style={T.screen}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box;margin:0;padding:0} input::placeholder,select::placeholder{color:#484f58} select{background:#0d1117;border:1.5px solid #30363d;border-radius:8px;color:#e6edf3;padding:10px 12px;font-size:14px;width:100%;outline:none}`}</style>

        {/* Header */}
        <div style={T.header}>
          <div>
            <p style={{ fontWeight: 800, fontSize: 14 }}>{shop?.name}</p>
            <p style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>{profile?.full_name} · SALES REP</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {unread > 0 && <div style={{ background: '#ff4d6d', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{unread}</div>}
            <button onClick={() => supabase.auth.signOut()} style={{ ...T.btn('#30363d', '#ff4d6d'), padding: '7px 12px', fontSize: 11 }}>Logout</button>
          </div>
        </div>

        {toast && <div style={{ background: '#a78bfa', padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#000' }}>{toast}</div>}

        {/* Tabs */}
        <div style={T.tabs}>
          {[['orders', '📦 Orders'], ['customers', '👥 Customers'], ['stats', '📊 Stats'], ['notifications', `🔔 ${unread > 0 ? `(${unread})` : ''}`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={T.tab(tab === k)}>{l}</button>
          ))}
        </div>

        <div style={{ padding: 14, maxWidth: 700, margin: '0 auto' }}>

          {/* ORDERS TAB */}
          {tab === 'orders' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 16 }}>My Orders</p>
                <button onClick={() => { setOrderModal(true); setOrderCart([]); setOrderCust(null); setOrderNotes('') }} style={T.btn()}>+ New Order</button>
              </div>
              {orders.map(o => (
                <div key={o.id} style={{ ...T.card, borderColor: o.status === 'fulfilled' ? 'rgba(37,211,102,0.3)' : o.status === 'cancelled' ? 'rgba(255,77,109,0.3)' : 'rgba(255,181,71,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{o.customer_name}</p>
                      <p style={{ fontSize: 11, color: '#7d8590', marginTop: 2 }}>{new Date(o.created_at).toLocaleDateString()} · {(o.field_order_items || []).length} items</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#a78bfa' }}>{fmt(o.total)}</p>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: o.status === 'fulfilled' ? 'rgba(37,211,102,0.15)' : o.status === 'cancelled' ? 'rgba(255,77,109,0.15)' : 'rgba(255,181,71,0.15)', color: o.status === 'fulfilled' ? '#25d366' : o.status === 'cancelled' ? '#ff4d6d' : '#ffb547' }}>{o.status.toUpperCase()}</span>
                    </div>
                  </div>
                  {o.status === 'fulfilled' && (
                    <p style={{ fontSize: 11, marginTop: 8, color: o.commission_status === 'approved' ? '#25d366' : '#ffb547' }}>
                      Commission: {o.commission_status === 'approved' ? `✅ ${fmt(o.commission_amount)}` : '⏳ Pending approval'}
                    </p>
                  )}
                </div>
              ))}
              {!orders.length && <div style={{ ...T.card, textAlign: 'center', padding: 40 }}><p style={{ fontSize: 36 }}>📦</p><p style={{ color: '#484f58', marginTop: 10 }}>No orders yet. Tap + New Order.</p></div>}
            </div>
          )}

          {/* CUSTOMERS TAB */}
          {tab === 'customers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontWeight: 800, fontSize: 16 }}>My Customers</p>
                <button onClick={() => setCustModal(true)} style={T.btn()}>+ Add</button>
              </div>
              <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customers..." style={{ ...T.input, marginBottom: 12 }} />
              {customers.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || '').includes(custSearch)).map(c => (
                <div key={c.id} style={T.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</p>
                      {c.phone && <p style={{ fontSize: 11, color: '#7d8590', marginTop: 2 }}>{c.phone}</p>}
                      {c.location && <p style={{ fontSize: 11, color: '#7d8590' }}>📍 {c.location}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>{c.business_type}</span>
                      <p style={{ fontSize: 10, color: c.status === 'active' ? '#25d366' : '#ffb547', marginTop: 4 }}>{c.status?.toUpperCase()}</p>
                    </div>
                  </div>
                  <button onClick={() => { setOrderCust(c); setOrderCart([]); setOrderNotes(''); setOrderModal(true) }} style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    📦 New Order for {c.name}
                  </button>
                </div>
              ))}
              {!customers.length && <div style={{ ...T.card, textAlign: 'center', padding: 40 }}><p style={{ fontSize: 36 }}>👥</p><p style={{ color: '#484f58', marginTop: 10 }}>No customers yet.</p></div>}
            </div>
          )}

          {/* STATS TAB */}
          {tab === 'stats' && (
            <div>
              <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>My Performance</p>
              <div style={{ ...T.card, borderColor: 'rgba(167,139,250,0.3)', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#7d8590', letterSpacing: 0.8, marginBottom: 12 }}>MY COMMISSION THIS MONTH</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[{ v: fmt(approvedComm), l: '✅ APPROVED', c: '#25d366' }, { v: fmt(pendingComm), l: '⏳ PENDING', c: '#ffb547' }, { v: fmt(approvedComm + pendingComm), l: 'TOTAL', c: '#a78bfa' }].map(s => (
                    <div key={s.l} style={{ background: '#0d1117', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: s.c }}>{s.v}</p>
                      <p style={{ fontSize: 9, color: '#7d8590', marginTop: 3 }}>{s.l}</p>
                    </div>
                  ))}
                </div>
                {pendingComm > 0 && approvedComm === 0 && <p style={{ fontSize: 11, color: '#ffb547', textAlign: 'center' }}>Waiting for admin to approve your commission</p>}
              </div>
              {target > 0 && (
                <div style={T.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>Monthly Target</p>
                    <p style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700 }}>{pct}%</p>
                  </div>
                  <div style={{ height: 8, background: '#30363d', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? '#25d366' : '#a78bfa', borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 12, color: '#7d8590' }}>{fmtK(monthTotal)} sold</p>
                    <p style={{ fontSize: 12, color: '#7d8590' }}>Target: {fmtK(target)}</p>
                  </div>
                  {monthTotal >= target && <p style={{ fontSize: 12, color: '#25d366', marginTop: 8, textAlign: 'center', fontWeight: 700 }}>🎉 Target achieved! Bonus rate active.</p>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                {[{ l: 'Orders This Month', v: monthOrders.length, c: '#a78bfa' }, { l: 'Total Sales', v: fmtK(monthTotal), c: '#2196F3' }, { l: 'My Customers', v: customers.length, c: '#ffb547' }, { l: 'All Orders', v: orders.length, c: '#4da6ff' }].map(k => (
                  <div key={k.l} style={T.card}><p style={{ fontSize: 10, color: '#7d8590', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p><p style={{ fontSize: 22, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p></div>
                ))}
              </div>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {tab === 'notifications' && (
            <div>
              <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Notifications</p>
              {notifications.map(n => (
                <div key={n.id} onClick={async () => { await supabase.from('commission_notifications').update({ is_read: true }).eq('id', n.id); setNotifications(p => p.map(x => x.id === n.id ? { ...x, is_read: true } : x)) }}
                  style={{ ...T.card, opacity: n.is_read ? 0.5 : 1, borderColor: n.type === 'approved' ? 'rgba(37,211,102,0.3)' : 'rgba(255,77,109,0.3)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: n.type === 'approved' ? '#25d366' : '#ff4d6d', fontWeight: 700, marginBottom: 4 }}>
                        {n.type === 'approved' ? '✅' : n.type === 'fulfilled' ? '📦' : '❌'} {n.message}
                      </p>
                      <p style={{ fontSize: 11, color: '#7d8590' }}>{new Date(n.created_at).toLocaleDateString()}</p>
                    </div>
                    {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', flexShrink: 0, marginLeft: 8, marginTop: 4 }} />}
                  </div>
                </div>
              ))}
              {!notifications.length && <div style={{ ...T.card, textAlign: 'center', padding: 40 }}><p style={{ fontSize: 36 }}>🔔</p><p style={{ color: '#484f58', marginTop: 10 }}>No notifications yet</p></div>}
            </div>
          )}
        </div>

        {/* New Order Modal */}
        {orderModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && setOrderModal(false)}>
            <div style={{ background: '#161b22', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', border: '1px solid #30363d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>New Order</h2>
                <button onClick={() => setOrderModal(false)} style={{ background: 'none', border: 'none', color: '#7d8590', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              {/* Customer selector */}
              {orderCust ? (
                <div style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 10, padding: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><p style={{ fontWeight: 700, color: '#25d366' }}>✓ {orderCust.name}</p><p style={{ fontSize: 11, color: '#7d8590', marginTop: 2 }}>{orderCust.business_type}</p></div>
                  <button onClick={() => setOrderCust(null)} style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', fontSize: 13 }}>Change</button>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: '#7d8590', letterSpacing: 0.8, marginBottom: 8 }}>SELECT CUSTOMER</p>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #30363d', borderRadius: 8 }}>
                    {customers.map(c => (
                      <button key={c.id} onClick={() => setOrderCust(c)} style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #30363d', color: '#e6edf3', cursor: 'pointer', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: '#7d8590', fontSize: 11, marginLeft: 8 }}>{c.business_type}</span>
                      </button>
                    ))}
                    {!customers.length && <p style={{ padding: '12px 14px', color: '#484f58', fontSize: 13 }}>No customers. Add one first.</p>}
                  </div>
                </div>
              )}
              {/* Product search */}
              <p style={{ fontSize: 11, color: '#7d8590', letterSpacing: 0.8, marginBottom: 6 }}>ADD PRODUCTS</p>
              <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search products or part number..." style={{ ...T.input, marginBottom: 8 }} />
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 14, border: '1px solid #30363d', borderRadius: 8 }}>
                {products.filter(p => !orderSearch || p.name.toLowerCase().includes(orderSearch.toLowerCase()) || Object.values(p._cfv || {}).some(v => String(v).toLowerCase().includes(orderSearch.toLowerCase()))).map(p => {
                  const inCart = orderCart.find(i => i.product.id === p.id)
                  const pf = customFields.find(f => f.field_name.toLowerCase().includes('part'))
                  const pn = pf && p._cfv?.[pf.id]
                  return (
                    <button key={p.id} onClick={() => { if (!inCart) setOrderCart(prev => [...prev, { product: p, qty: '1', unit_price: String(p.wholesale_price || p.sell_price || 0) }]) }}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #30363d', color: inCart ? '#484f58' : '#e6edf3', cursor: 'pointer', opacity: inCart ? 0.4 : 1 }}
                      onMouseEnter={e => !inCart && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.image_emoji} {p.name}</span>
                        {pn && <span style={{ fontSize: 10, color: '#a78bfa', display: 'block' }}>#{pn}</span>}
                      </div>
                      <span style={{ fontSize: 13, color: inCart ? '#484f58' : '#a78bfa', fontWeight: 700 }}>{inCart ? '✓' : '+'}</span>
                    </button>
                  )
                })}
              </div>
              {/* Cart items */}
              {orderCart.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: '#7d8590', letterSpacing: 0.8, marginBottom: 8 }}>ORDER ITEMS</p>
                  {orderCart.map((it, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600 }}>{it.product.name}</p>
                      <input value={it.qty} onChange={e => setOrderCart(p => p.map((c, j) => j === i ? { ...c, qty: e.target.value } : c))} placeholder="Qty" type="number" style={{ ...T.input, padding: '8px' }} />
                      <input value={it.unit_price} onChange={e => setOrderCart(p => p.map((c, j) => j === i ? { ...c, unit_price: e.target.value } : c))} placeholder="Price" type="number" style={{ ...T.input, padding: '8px' }} />
                      <button onClick={() => setOrderCart(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ff4d6d', fontSize: 16, cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #30363d', marginBottom: 12 }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span style={{ fontWeight: 800, color: '#a78bfa', fontSize: 16 }}>{fmt(orderCart.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0), 0))}</span>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#7d8590', letterSpacing: 0.8, marginBottom: 6 }}>NOTES (OPTIONAL)</p>
                <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Delivery instructions..." style={T.input} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setOrderModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#e6edf3', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitOrder} disabled={orderSaving || !orderCust || !orderCart.length} style={{ flex: 2, padding: '11px', borderRadius: 8, background: orderCust && orderCart.length ? '#a78bfa' : '#30363d', color: orderCust && orderCart.length ? '#000' : '#484f58', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  {orderSaving ? 'Submitting...' : '📦 Submit Order'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Customer Modal */}
        {custModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && setCustModal(false)}>
            <div style={{ background: '#161b22', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', maxWidth: 480, border: '1px solid #30363d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>Add Customer</h2>
                <button onClick={() => setCustModal(false)} style={{ background: 'none', border: 'none', color: '#7d8590', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              {[{ k: 'name', l: 'Full Name *', ph: 'e.g. Amina Hassan' }, { k: 'phone', l: 'Phone', ph: 'e.g. 0754 123 456' }, { k: 'location', l: 'Location / Area', ph: 'e.g. Kariakoo' }].map(f => (
                <div key={f.k} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: '#7d8590', letterSpacing: 0.8, marginBottom: 4 }}>{f.l.toUpperCase()}</p>
                  <input value={custForm[f.k]} onChange={e => setCustForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.ph} style={T.input} />
                </div>
              ))}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, color: '#7d8590', letterSpacing: 0.8, marginBottom: 6 }}>BUSINESS TYPE</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Garage', 'Spare Parts', 'Wholesaler', 'Other'].map(bt => (
                    <button key={bt} onClick={() => setCustForm(p => ({ ...p, business_type: bt }))} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid', borderColor: custForm.business_type === bt ? '#a78bfa' : '#30363d', background: custForm.business_type === bt ? 'rgba(167,139,250,0.15)' : 'transparent', color: custForm.business_type === bt ? '#a78bfa' : '#7d8590', fontSize: 12, fontWeight: custForm.business_type === bt ? 700 : 400, cursor: 'pointer' }}>{bt}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCustModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#e6edf3', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveCustomer} disabled={custSaving} style={{ flex: 2, padding: '11px', borderRadius: 8, background: '#a78bfa', color: '#000', fontWeight: 700, border: 'none', cursor: 'pointer' }}>{custSaving ? 'Saving...' : 'Save Customer'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
