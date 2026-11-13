import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function FieldOrders() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [orders, setOrders] = useState([])
  const [prods, setProds] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [detail, setDetail] = useState(null)
  const [fulfilling, setFulfilling] = useState(false)
  const [toast, setToast] = useState('')

  // Commission approval
  const [commTab, setCommTab] = useState('orders')

  useEffect(() => { loadData() }, [])

  const showToast = (msg, c = '#0B7A6C') => { setToast({ msg, c }); setTimeout(() => setToast(''), 3500) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const [or, pr] = await Promise.all([
      supabase.from('field_orders').select('*,field_order_items(*),app_users!created_by(full_name,id)').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(200),
      supabase.from('products').select('id,name,buy_price,box_qty,retail_stock,stock').eq('shop_id', shopId).eq('is_active', true),
    ])
    setOrders(or.data || [])
    setProds(pr.data || [])
    setLoading(false)
  }

  const fulfill = async (order) => {
    if (!confirm(`Fulfill order for ${order.customer_name}? This will create a sale and deduct stock.`)) return
    setFulfilling(order.id)
    try {
      const shopId = shop.id
      const saleTotal = (order.field_order_items || []).reduce((a, i) => a + (Number(i.subtotal) || 0), 0)
      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
        shop_id: shopId, total: saleTotal, payment_method: 'cash', sale_date: today(),
        notes: `Field order from ${order.app_users?.full_name || 'Sales Rep'}: ${order.customer_name}`,
        field_order_id: order.id, created_by: profile.id,
      }).select().single()
      if (saleErr) throw saleErr
      const saleItems = (order.field_order_items || []).map(it => ({
        sale_id: sale.id, product_id: it.product_id, product_name: it.product_name,
        qty: it.qty, unit_price: it.unit_price, line_total: it.subtotal,
        buy_price: prods.find(p => p.id === it.product_id)?.buy_price || 0,
        line_profit: it.subtotal - ((prods.find(p => p.id === it.product_id)?.buy_price || 0) / (prods.find(p => p.id === it.product_id)?.box_qty || 1)) * it.qty,
        sale_type: 'retail',
      }))
      await supabase.from('sale_items').insert(saleItems)
      for (const it of order.field_order_items || []) {
        const prod = prods.find(p => p.id === it.product_id)
        if (prod) {
          const cur = Number(prod.retail_stock) || Number(prod.stock) || 0
          await supabase.from('products').update({ retail_stock: Math.max(0, cur - it.qty), stock: Math.max(0, cur - it.qty) }).eq('id', prod.id)
        }
      }
      const { data: repSet } = await supabase.from('sales_rep_settings').select('*').eq('user_id', order.created_by).eq('shop_id', shopId).single()
      let commAmt = 0
      if (repSet) commAmt = saleTotal * (Number(repSet.commission_rate) || 5) / 100
      await supabase.from('field_orders').update({ status: 'fulfilled', fulfilled_by: profile.id, fulfilled_at: new Date().toISOString(), commission_amount: commAmt }).eq('id', order.id)
      await supabase.from('commission_notifications').insert({ shop_id: shopId, user_id: order.created_by, type: 'fulfilled', message: `Your order for ${order.customer_name} (${fmt(saleTotal)}) has been fulfilled. Commission pending approval.`, reference_id: order.id, reference_type: 'field_order' })
      setOrders(p => p.map(o => o.id === order.id ? { ...o, status: 'fulfilled', commission_amount: commAmt } : o))
      setDetail(d => d?.id === order.id ? { ...d, status: 'fulfilled', commission_amount: commAmt } : d)
      showToast(`✅ Order fulfilled! Sale of ${fmt(saleTotal)} created.`)
    } catch (e) { showToast('Error: ' + e.message, '#B93A16') }
    setFulfilling(null)
  }

  const cancel = async (order) => {
    if (!confirm(`Cancel order for ${order.customer_name}?`)) return
    await supabase.from('field_orders').update({ status: 'cancelled' }).eq('id', order.id)
    setOrders(p => p.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o))
    setDetail(d => d?.id === order.id ? { ...d, status: 'cancelled' } : d)
    showToast('Order cancelled')
  }

  const del = async (order) => {
    if (!confirm(`Permanently delete this order for ${order.customer_name}?`)) return
    await supabase.from('field_order_items').delete().eq('order_id', order.id)
    await supabase.from('field_orders').delete().eq('id', order.id)
    setOrders(p => p.filter(o => o.id !== order.id))
    setDetail(null)
    showToast('Order deleted')
  }

  const approveComm = async (order) => {
    const commAmt = Number(order.commission_amount) || 0
    await supabase.from('field_orders').update({ commission_status: 'approved', commission_approved_by: profile.id, commission_approved_at: new Date().toISOString() }).eq('id', order.id)
    await supabase.from('commission_notifications').insert({ shop_id: shop.id, user_id: order.created_by, type: 'approved', message: `Commission of ${fmt(commAmt)} for order to ${order.customer_name} has been approved! 🎉`, reference_id: order.id, reference_type: 'field_order' })
    setOrders(p => p.map(o => o.id === order.id ? { ...o, commission_status: 'approved' } : o))
    setDetail(d => d?.id === order.id ? { ...d, commission_status: 'approved' } : d)
    showToast(`✅ Commission of ${fmt(commAmt)} approved!`)
  }

  const rejectComm = async (order) => {
    const reason = prompt('Reason for rejection:') || 'Rejected by admin'
    await supabase.from('field_orders').update({ commission_status: 'rejected', commission_approved_by: profile.id, commission_approved_at: new Date().toISOString(), commission_rejected_reason: reason }).eq('id', order.id)
    await supabase.from('commission_notifications').insert({ shop_id: shop.id, user_id: order.created_by, type: 'rejected', message: `Commission for order to ${order.customer_name} was not approved. Reason: ${reason}`, reference_id: order.id, reference_type: 'field_order' })
    setOrders(p => p.map(o => o.id === order.id ? { ...o, commission_status: 'rejected' } : o))
    setDetail(d => d?.id === order.id ? { ...d, commission_status: 'rejected' } : d)
    showToast('Commission rejected')
  }

  const filtOrders = orders.filter(o => filter === 'all' ? true : o.status === filter)
  const pending = orders.filter(o => o.status === 'pending').length
  const pendingComm = orders.filter(o => o.status === 'fulfilled' && o.commission_status === 'pending').length

  const statusColor = (s) => s === 'fulfilled' ? '#0B7A6C' : s === 'cancelled' ? '#B93A16' : '#9A5B00'
  const commColor = (s) => s === 'approved' ? '#0B7A6C' : s === 'rejected' ? '#B93A16' : '#9A5B00'

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}30`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }),
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F6F7FB' }}><div style={{ width: 36, height: 36, border: '3px solid #DCDFEC', borderTopColor: '#0F7375', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Field Orders — TheDashboard</title></Head>
      <Layout title="Field Orders" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: toast.c, color: '#FFFFFF', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999 }}>{toast.msg}</div>}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { l: 'Total Orders', v: orders.length, c: '#2D2F8F' },
            { l: 'Pending', v: pending, c: '#9A5B00' },
            { l: 'Fulfilled', v: orders.filter(o => o.status === 'fulfilled').length, c: '#0B7A6C' },
            { l: 'Comm. Pending', v: pendingComm, c: '#0F7375' },
          ].map(k => (
            <div key={k.l} style={C.card}>
              <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[{ k: 'pending', l: `⏳ Pending (${pending})` }, { k: 'fulfilled', l: '✅ Fulfilled' }, { k: 'cancelled', l: '❌ Cancelled' }, { k: 'all', l: 'All' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid', borderColor: filter === f.k ? '#0F7375' : '#DCDFEC', background: filter === f.k ? 'rgba(15,115,117,0.15)' : 'transparent', color: filter === f.k ? '#0F7375' : '#5B607E', fontWeight: filter === f.k ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>{f.l}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Orders list */}
          <div>
            {filtOrders.map(o => (
              <div key={o.id} onClick={() => setDetail(detail?.id === o.id ? null : o)}
                style={{ ...C.card, marginBottom: 10, cursor: 'pointer', borderColor: detail?.id === o.id ? '#0F7375' : '#DCDFEC' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = detail?.id === o.id ? '#0F7375' : '#2196F350'}
                onMouseLeave={e => e.currentTarget.style.borderColor = detail?.id === o.id ? '#0F7375' : '#DCDFEC'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>{o.customer_name}</p>
                    <p style={{ fontSize: 11, color: '#5B607E', marginTop: 2 }}>by {o.app_users?.full_name || '—'} · {new Date(o.created_at).toLocaleDateString()}</p>
                    <p style={{ fontSize: 11, color: '#5B607E', marginTop: 1 }}>{(o.field_order_items || []).length} items</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#0F7375' }}>{fmt(o.total)}</p>
                    <span style={C.badge(statusColor(o.status))}>{o.status?.toUpperCase()}</span>
                    {o.status === 'fulfilled' && o.commission_status && (
                      <div style={{ marginTop: 4 }}>
                        <span style={C.badge(commColor(o.commission_status))}>COMM: {o.commission_status?.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!filtOrders.length && <div style={{ ...C.card, textAlign: 'center', padding: 40 }}><p style={{ fontSize: 36 }}>📋</p><p style={{ color: '#8A8FAE', marginTop: 10 }}>No {filter === 'all' ? '' : filter} orders</p></div>}
          </div>

          {/* Detail panel */}
          {detail && (
            <div style={C.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 800 }}>{detail.customer_name}</h2>
                  <p style={{ fontSize: 12, color: '#5B607E', marginTop: 2 }}>by {detail.app_users?.full_name} · {new Date(detail.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Status badges */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={C.badge(statusColor(detail.status))}>{detail.status?.toUpperCase()}</span>
                {detail.status === 'fulfilled' && <span style={C.badge(commColor(detail.commission_status || 'pending'))}>COMMISSION: {(detail.commission_status || 'pending').toUpperCase()}</span>}
              </div>

              {/* Items */}
              <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 8 }}>ORDER ITEMS</p>
              <div style={{ background: '#F6F7FB', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                      {['Product', 'Qty', 'Unit Price', 'Total'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.5, fontWeight: 600 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.field_order_items || []).map((it, i) => (
                      <tr key={i} style={{ borderBottom: i < (detail.field_order_items || []).length - 1 ? '1px solid #DCDFEC' : 'none' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{it.image_emoji || '📦'} {it.product_name}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#5B607E' }}>{it.qty}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#9A5B00' }}>{fmt(it.unit_price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#0F7375' }}>{fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #DCDFEC', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#0F7375' }}>{fmt(detail.total)}</span>
              </div>

              {detail.notes && <p style={{ fontSize: 12, color: '#5B607E', marginBottom: 16, padding: '8px 12px', background: '#F6F7FB', borderRadius: 8 }}>📝 {detail.notes}</p>}

              {/* Commission info */}
              {detail.status === 'fulfilled' && (
                <div style={{ background: '#F6F7FB', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 6 }}>COMMISSION</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#0F7375' }}>{fmt(detail.commission_amount || 0)}</p>
                  <p style={{ fontSize: 11, color: commColor(detail.commission_status || 'pending'), marginTop: 4 }}>{(detail.commission_status || 'pending').toUpperCase()}</p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.status === 'pending' && (
                  <>
                    <button onClick={() => fulfill(detail)} disabled={fulfilling === detail.id} style={{ padding: '12px', borderRadius: 8, background: fulfilling === detail.id ? '#DCDFEC' : '#0B7A6C', color: fulfilling === detail.id ? '#8A8FAE' : '#000', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                      {fulfilling === detail.id ? 'Processing...' : '✅ Fulfill Order'}
                    </button>
                    <button onClick={() => cancel(detail)} style={{ padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(185,58,22,0.3)', color: '#B93A16', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>❌ Cancel Order</button>
                  </>
                )}
                {detail.status === 'fulfilled' && (detail.commission_status === 'pending' || !detail.commission_status) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => approveComm(detail)} style={{ flex: 2, padding: '11px', borderRadius: 8, background: '#0B7A6C', color: '#FFFFFF', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>✅ Approve Commission</button>
                    <button onClick={() => rejectComm(detail)} style={{ flex: 1, padding: '11px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(185,58,22,0.3)', color: '#B93A16', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Reject</button>
                  </div>
                )}
                <button onClick={() => del(detail)} style={{ padding: '9px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(185,58,22,0.2)', color: '#B93A16', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🗑️ Delete Order</button>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </>
  )
}
