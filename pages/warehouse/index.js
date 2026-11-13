import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK } from '../../lib/supabase'

export default function Warehouse() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [wProds, setWProds] = useState([])
  const [transfers, setTransfers] = useState([])
  const [allShops, setAllShops] = useState([])
  const [warehouseId, setWarehouseId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('stock')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  // Add/edit product modal
  const [showProdModal, setShowProdModal] = useState(false)
  const [editProd, setEditProd] = useState(null)
  const [prodSaving, setProdSaving] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', image_emoji: '📦', buy_price: '', box_qty: '1', stock: '', unit: 'unit' })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  // Transfer modal
  const [showTransModal, setShowTransModal] = useState(false)
  const [transProd, setTransProd] = useState(null)
  const [transShop, setTransShop] = useState('')
  const [transQty, setTransQty] = useState('')
  const [transWhsPrice, setTransWhsPrice] = useState('')
  const [transRetPrice, setTransRetPrice] = useState('')
  const [transSaving, setTransSaving] = useState(false)

  useEffect(() => { loadData() }, [])
  const showToast = (msg, c = '#0B7A6C') => { setToast({ msg, c }); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)

    // Get or create warehouse
    let { data: whArr } = await supabase.from('warehouse').select('*').eq('owner_id', user.id).limit(1)
    let wh = Array.isArray(whArr) ? whArr[0] || null : whArr
    if (!wh) {
      const { data: newWh } = await supabase.from('warehouse').insert({ owner_id: user.id, name: 'Central Warehouse' }).select().single()
      wh = newWh
    }
    if (!wh) { setLoading(false); return }
    setWarehouseId(wh.id)

    const [pr, tr, sh] = await Promise.all([
      supabase.from('warehouse_products').select('*').eq('warehouse_id', wh.id).order('name'),
      supabase.from('warehouse_transfers').select('*,shops(name)').eq('warehouse_id', wh.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('shops').select('id,name').eq('id', prof.shop_id),
    ])
    setWProds(pr.data || [])
    setTransfers(tr.data || [])
    setAllShops(sh.data || [])
    setLoading(false)
  }

  const saveProd = async () => {
    if (!form.name || !form.buy_price || !form.stock) { alert('Fill in name, buy price and stock'); return }
    setProdSaving(true)
    const d = { warehouse_id: warehouseId, name: form.name.trim(), category: form.category.trim() || null, image_emoji: form.image_emoji || '📦', buy_price: parseFloat(form.buy_price) || 0, box_qty: parseInt(form.box_qty) || 1, stock: parseInt(form.stock) || 0, unit: form.unit || 'unit' }
    if (editProd) {
      const { data } = await supabase.from('warehouse_products').update(d).eq('id', editProd.id).select().single()
      setWProds(p => p.map(x => x.id === editProd.id ? data : x))
    } else {
      const { data } = await supabase.from('warehouse_products').insert(d).select().single()
      if (data) setWProds(p => [...p, data])
    }
    setProdSaving(false); setShowProdModal(false); setEditProd(null)
    showToast(editProd ? 'Product updated' : 'Product added')
  }

  const delProd = async (id) => {
    if (!confirm('Delete this product from warehouse?')) return
    await supabase.from('warehouse_products').delete().eq('id', id)
    setWProds(p => p.filter(x => x.id !== id))
    showToast('Product deleted')
  }

  const openEdit = (p) => { setEditProd(p); setForm({ name: p.name, category: p.category || '', image_emoji: p.image_emoji || '📦', buy_price: String(p.buy_price || ''), box_qty: String(p.box_qty || 1), stock: String(p.stock || ''), unit: p.unit || 'unit' }); setShowProdModal(true) }

  const openTransfer = (p) => { setTransProd(p); setTransQty(''); setTransWhsPrice(''); setTransRetPrice(''); setTransShop(allShops[0]?.id || ''); setShowTransModal(true) }

  const confirmTransfer = async () => {
    if (!transProd || !transShop || !transQty) { alert('Select shop and enter quantity'); return }
    const qty = parseInt(transQty)
    if (!qty || qty <= 0) { alert('Enter valid quantity'); return }
    if (qty > transProd.stock) { alert('Not enough warehouse stock'); return }
    setTransSaving(true)
    const targetShop = allShops.find(s => s.id === transShop)
    const pieces = qty * (transProd.box_qty || 1)
    const newStock = transProd.stock - qty

    // Deduct from warehouse
    await supabase.from('warehouse_products').update({ stock: newStock }).eq('id', transProd.id)
    setWProds(p => p.map(x => x.id === transProd.id ? { ...x, stock: newStock } : x))

    // Check if product exists in shop
    const { data: existingArr } = await supabase.from('products').select('id,wholesale_stock,retail_stock,stock').eq('shop_id', transShop).ilike('name', transProd.name).limit(1)
    const existing = existingArr?.[0] || null

    if (existing) {
      await supabase.from('products').update({
        wholesale_stock: (existing.wholesale_stock || 0) + qty,
        ...(transWhsPrice ? { wholesale_price: parseFloat(transWhsPrice) } : {}),
        ...(transRetPrice ? { sell_price: parseFloat(transRetPrice) } : {}),
      }).eq('id', existing.id)
    } else {
      await supabase.from('products').insert({
        shop_id: transShop, name: transProd.name, category: transProd.category || '',
        image_emoji: transProd.image_emoji || '📦',
        buy_price: Math.round((transProd.buy_price || 0) / (transProd.box_qty || 1)),
        wholesale_price: parseFloat(transWhsPrice) || 0, sell_price: parseFloat(transRetPrice) || 0,
        wholesale_stock: qty, retail_stock: 0, stock: 0, box_qty: 1,
        product_type: transRetPrice ? 'both' : 'wholesale', unit: transProd.unit || 'unit', is_active: true,
      })
    }

    // Record transfer
    const { data: tr } = await supabase.from('warehouse_transfers').insert({
      warehouse_id: warehouseId, shop_id: transShop, product_name: transProd.name,
      image_emoji: transProd.image_emoji || '📦', qty_boxes: qty, qty_pieces: pieces,
      buy_price: transProd.buy_price, wholesale_price: parseFloat(transWhsPrice) || 0,
      sell_price: parseFloat(transRetPrice) || 0, transferred_by: profile.id,
    }).select('*,shops(name)').single()
    if (tr) setTransfers(p => [tr, ...p])

    setTransSaving(false); setShowTransModal(false)
    showToast(`✅ ${qty} boxes transferred to ${targetShop?.name}!`)
  }

  const filtProds = wProds.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase()))
  const totalValue = wProds.reduce((a, p) => a + (p.buy_price || 0) * (p.stock || 0), 0)

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    input: { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    label: { fontSize: 10, color: '#5B607E', letterSpacing: 0.8, display: 'block', marginBottom: 5 },
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F6F7FB' }}><div style={{ width: 36, height: 36, border: '3px solid #DCDFEC', borderTopColor: '#9A5B00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Warehouse — TheDashboard</title></Head>
      <Layout title="Warehouse" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder,select::placeholder{color:#8A8FAE} select{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit}`}</style>
        {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: toast.c, color: '#FFFFFF', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999 }}>{toast.msg}</div>}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { l: 'Products', v: wProds.length, c: '#9A5B00' },
            { l: 'Total Stock Value', v: fmtK(totalValue), c: '#2D2F8F' },
            { l: 'Total Boxes', v: wProds.reduce((a, p) => a + (p.stock || 0), 0), c: '#0F7375' },
            { l: 'Transfers', v: transfers.length, c: '#0B7A6C' },
          ].map(k => (
            <div key={k.l} style={C.card}>
              <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['stock', '📦 Stock'], ['transfers', '🔄 Transfer History']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid', borderColor: tab === k ? '#9A5B00' : '#DCDFEC', background: tab === k ? 'rgba(242,160,7,0.15)' : 'transparent', color: tab === k ? '#9A5B00' : '#5B607E', fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        {/* STOCK TAB */}
        {tab === 'stock' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." style={{ ...C.input, flex: 1 }} />
              <button onClick={() => { setEditProd(null); setForm({ name: '', category: '', image_emoji: '📦', buy_price: '', box_qty: '1', stock: '', unit: 'unit' }); setShowProdModal(true) }} style={{ padding: '9px 18px', borderRadius: 8, background: '#9A5B00', color: '#FFFFFF', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Product</button>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                    {['Product', 'Category', 'Buy Price / Box', 'Box Qty', 'Stock (Boxes)', 'Total Value', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtProds.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < filtProds.length - 1 ? '1px solid #DCDFEC' : 'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,24,58,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 14px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{p.image_emoji || '📦'} {p.name}</p>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#5B607E' }}>{p.category || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#9A5B00' }}>{fmt(p.buy_price)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#5B607E' }}>{p.box_qty} pcs/box</td>
                      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: p.stock < 5 ? '#B93A16' : '#15183A' }}>{p.stock} boxes</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#2D2F8F' }}>{fmtK((p.buy_price || 0) * (p.stock || 0))}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openTransfer(p)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(11,122,108,0.3)', background: 'rgba(11,122,108,0.1)', color: '#0B7A6C', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>🔄 Transfer</button>
                          <button onClick={() => openEdit(p)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #DCDFEC', background: 'transparent', color: '#2D2F8F', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => delProd(p.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(185,58,22,0.3)', background: 'transparent', color: '#B93A16', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtProds.length && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No products in warehouse</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRANSFERS TAB */}
        {tab === 'transfers' && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                  {['Date', 'Product', 'Shop', 'Boxes', 'Pieces', 'Whs Price', 'Retail Price'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < transfers.length - 1 ? '1px solid #DCDFEC' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,24,58,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#5B607E' }}>{t.created_at?.split('T')[0]}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{t.image_emoji || '📦'} {t.product_name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#2D2F8F' }}>{t.shops?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#9A5B00' }}>{t.qty_boxes}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#5B607E' }}>{t.qty_pieces}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#0B7A6C' }}>{t.wholesale_price > 0 ? fmt(t.wholesale_price) : '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#2D2F8F' }}>{t.sell_price > 0 ? fmt(t.sell_price) : '—'}</td>
                  </tr>
                ))}
                {!transfers.length && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No transfers yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Add/Edit Product Modal */}
        {showProdModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && setShowProdModal(false)}>
            <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 520, border: '1px solid #DCDFEC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>{editProd ? 'Edit Product' : 'Add to Warehouse'}</h2>
                <button onClick={() => setShowProdModal(false)} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={C.label}>PRODUCT NAME *</label>
                  <input value={form.name} onChange={set('name')} placeholder="e.g. Brake Pad Front" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>CATEGORY</label>
                  <input value={form.category} onChange={set('category')} placeholder="e.g. Brakes" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>EMOJI</label>
                  <input value={form.image_emoji} onChange={set('image_emoji')} placeholder="📦" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>BUY PRICE / BOX *</label>
                  <input value={form.buy_price} onChange={set('buy_price')} type="number" placeholder="e.g. 50000" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>PIECES PER BOX</label>
                  <input value={form.box_qty} onChange={set('box_qty')} type="number" placeholder="1" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>STOCK (BOXES) *</label>
                  <input value={form.stock} onChange={set('stock')} type="number" placeholder="e.g. 100" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>UNIT</label>
                  <input value={form.unit} onChange={set('unit')} placeholder="unit" style={C.input} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowProdModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #DCDFEC', background: 'transparent', color: '#15183A', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveProd} disabled={prodSaving} style={{ flex: 2, padding: '11px', borderRadius: 8, background: '#9A5B00', color: '#FFFFFF', fontWeight: 700, border: 'none', cursor: 'pointer' }}>{prodSaving ? 'Saving...' : 'Save Product'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Modal */}
        {showTransModal && transProd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && setShowTransModal(false)}>
            <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, border: '1px solid #DCDFEC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>Transfer Stock</h2>
                <button onClick={() => setShowTransModal(false)} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ background: '#F6F7FB', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{transProd.image_emoji} {transProd.name}</p>
                  <p style={{ fontSize: 11, color: '#5B607E', marginTop: 2 }}>{transProd.box_qty} pcs/box</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#9A5B00' }}>{transProd.stock} boxes</p>
                  <p style={{ fontSize: 10, color: '#5B607E' }}>available</p>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={C.label}>DESTINATION SHOP *</label>
                <select value={transShop} onChange={e => setTransShop(e.target.value)} style={C.input}>
                  <option value="">Select shop...</option>
                  {allShops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={C.label}>QUANTITY (BOXES) *</label>
                <input value={transQty} onChange={e => setTransQty(e.target.value)} type="number" placeholder={`Max ${transProd.stock}`} style={C.input} />
                {transQty && <p style={{ fontSize: 11, color: '#5B607E', marginTop: 4 }}>= {parseInt(transQty || 0) * (transProd.box_qty || 1)} pieces</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={C.label}>WHOLESALE PRICE</label>
                  <input value={transWhsPrice} onChange={e => setTransWhsPrice(e.target.value)} type="number" placeholder="per box" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>RETAIL PRICE</label>
                  <input value={transRetPrice} onChange={e => setTransRetPrice(e.target.value)} type="number" placeholder="per piece" style={C.input} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowTransModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #DCDFEC', background: 'transparent', color: '#15183A', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={confirmTransfer} disabled={transSaving || !transShop || !transQty} style={{ flex: 2, padding: '11px', borderRadius: 8, background: !transShop || !transQty ? '#DCDFEC' : '#0B7A6C', color: !transShop || !transQty ? '#8A8FAE' : '#000', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  {transSaving ? 'Transferring...' : '🔄 Transfer to Shop'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
