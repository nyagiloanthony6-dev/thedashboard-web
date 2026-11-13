import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

const COST_TYPES = ['clearing','transport','handling','customs','other']


function VendorOrderDetail({ detailData, calcLanded, C, fmt, fmtK, setPayModal, setPayForm, setCostModal, setCostForm, receiveOrder, setDetail, setDetailData, deleteOrder, openEditOrder, editingRates, setEditingRates, saveItemRates, ratesSaving, deleteShipmentCost }) {
  const lc = calcLanded(detailData)
  return (
    <div>
                  <div style={C.card}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                      <div>
                        <h2 style={{fontSize:16,fontWeight:800}}>{detailData.vendors?.name}</h2>
                        <p style={{fontSize:12,color:'#5B607E',marginTop:2}}>{detailData.order_number} · {detailData.order_date}</p>
                      </div>
                      <button onClick={()=>{setDetail(null);setDetailData(null)}} style={{background:'none',border:'none',color:'#5B607E',fontSize:18,cursor:'pointer'}}>✕</button>
                    </div>

                    {/* Items */}
                    <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>ORDER ITEMS</p>
                    <div style={{background:'#F6F7FB',borderRadius:8,overflow:'hidden',marginBottom:16}}>
                      <table style={{width:'100%',borderCollapse:'collapse'}}>
                        <thead>
                          <tr style={{borderBottom:'1px solid #DCDFEC'}}>
                            {['Product','Part No.','Boxes','Pcs/Box','Pcs Total','Curr','Rate→TZS','Unit Cost (TZS)','Total (TZS)'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:9,color:'#5B607E',letterSpacing:0.5,fontWeight:600}}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {(detailData.purchase_order_items||[]).map((it,i)=>(
                            <tr key={i} style={{borderBottom:i<(detailData.purchase_order_items||[]).length-1?'1px solid #DCDFEC':'none'}}>
                              <td style={{padding:'8px 10px'}}>
                                <p style={{fontSize:13,fontWeight:600}}>{it.image_emoji||'📦'} {it.product_name}</p>
                              </td>
                              <td style={{padding:'8px 10px',fontSize:11,color:'#0F7375',fontFamily:'monospace'}}>{it.part_number||'—'}</td>
                              <td style={{padding:'8px 10px',fontSize:12,color:'#5B607E'}}>{it.qty_boxes}</td>
                              <td style={{padding:'8px 10px',fontSize:12,color:'#5B607E'}}>{it.pieces_per_box}</td>
                              <td style={{padding:'8px 10px',fontSize:12,color:'#5B607E'}}>{(it.qty_boxes||0)*(it.pieces_per_box||1)}</td>
                              <td style={{padding:'8px 10px',fontSize:11,color:'#9A5B00'}}>{it.currency||'TZS'}</td>
                              <td style={{padding:'8px 10px'}}>
                                <input
                                  value={editingRates[it.id] !== undefined ? editingRates[it.id] : (it.exchange_rate||it.unit_cost_tzs/it.unit_cost||'')}
                                  onChange={e=>setEditingRates(p=>({...p,[it.id]:e.target.value}))}
                                  type="number"
                                  style={{width:80,background:'#F6F7FB',border:'1px solid #2196F350',borderRadius:6,color:'#2D2F8F',padding:'4px 6px',fontSize:12,outline:'none',fontFamily:'inherit'}}
                                  placeholder="rate"
                                />
                              </td>
                              <td style={{padding:'8px 10px',fontSize:12}}>
                                {it.currency&&it.currency!=='TZS'&&<p style={{color:'#8A8FAE',fontSize:10}}>{it.currency} {Number(it.unit_cost).toLocaleString()}</p>}
                                <p style={{color:'#9A5B00'}}>{fmt(Math.round(it.unit_cost_tzs||it.unit_cost))}</p>
                              </td>
                              <td style={{padding:'8px 10px',fontSize:13,fontWeight:700,color:'#2D2F8F'}}>{fmt(Math.round(it.total_cost_tzs||it.total_cost))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {Object.keys(editingRates).length > 0 && (
                      <button onClick={saveItemRates} disabled={ratesSaving} style={{width:'100%',padding:'9px',borderRadius:8,background:'#2D2F8F',color:'#FFFFFF',fontWeight:700,fontSize:13,border:'none',cursor:'pointer',marginBottom:12}}>
                        {ratesSaving ? 'Saving...' : `💱 Save ${Object.keys(editingRates).length} Updated Rate(s)`}
                      </button>
                    )}

                    {/* Shipment costs */}
                    <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>SHIPMENT COSTS</p>
                    {(detailData.shipment_costs||[]).map((c,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #DCDFEC'}}>
                        <div>
                          <span style={{...C.badge('#0F7375'),marginRight:8,fontSize:9}}>{c.cost_type.toUpperCase()}</span>
                          <span style={{fontSize:12,color:'#5B607E'}}>{c.description||'—'}</span>
                          {c.currency&&c.currency!=='TZS'&&<span style={{fontSize:10,color:'#8A8FAE',marginLeft:6}}>{c.currency} {Number(c.amount).toLocaleString()}</span>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:13,fontWeight:700,color:'#0F7375'}}>{fmt(Math.round(c.amount_tzs||c.amount))} TZS</span>
                          <button onClick={()=>deleteShipmentCost(c.id)} style={{background:'none',border:'none',color:'#B93A16',fontSize:14,cursor:'pointer',padding:'2px 6px'}} title="Delete cost">✕</button>
                        </div>
                      </div>
                    ))}
                    {!(detailData.shipment_costs||[]).length&&<p style={{fontSize:12,color:'#8A8FAE',marginBottom:8}}>No costs added yet</p>}
                    <button onClick={()=>setCostModal(true)} style={{width:'100%',padding:'8px',borderRadius:8,border:'1px dashed #a78bfa50',background:'transparent',color:'#0F7375',fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:16}}>+ Add Shipment Cost</button>

                    {/* ── LANDED COST BREAKDOWN ── */}
                    <div style={{background:'#FFFFFF',border:'1px solid #ffb54730',borderRadius:12,padding:16,marginBottom:16}}>
                      <p style={{fontSize:11,color:'#9A5B00',letterSpacing:0.8,fontWeight:700,marginBottom:14}}>💡 LANDED COST BREAKDOWN</p>
                      {[
                        {l:'Purchase Cost',v:fmt(lc.totalPurchase),c:'#2D2F8F'},
                        {l:'Shipment Costs',v:fmt(lc.totalCosts),c:'#0F7375'},
                      ].map(r=>(
                        <div key={r.l} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                          <span style={{fontSize:13,color:'#5B607E'}}>{r.l}</span>
                          <span style={{fontSize:13,fontWeight:700,color:r.c}}>{r.v}</span>
                        </div>
                      ))}
                      <div style={{borderTop:'1px solid #ffb54730',paddingTop:10,marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:15,fontWeight:800}}>Total Landed Cost</span>
                          <span style={{fontSize:18,fontWeight:900,color:'#9A5B00'}}>{fmt(lc.totalLanded)}</span>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                        {[
                          {l:'Per Box',v:fmt(Math.round(lc.costPerBox)),sub:`${lc.totalBoxes} boxes`,c:'#9A5B00'},
                          {l:'Per Piece',v:fmt(Math.round(lc.costPerPiece)),sub:`${lc.totalPieces} pieces`,c:'#0B7A6C'},
                          {l:'Shipment %',v:lc.totalLanded>0?Math.round(lc.totalCosts/lc.totalLanded*100)+'%':'0%',sub:'of total',c:'#0F7375'},
                        ].map(k=>(
                          <div key={k.l} style={{background:'#F6F7FB',borderRadius:8,padding:10,textAlign:'center'}}>
                            <p style={{fontSize:15,fontWeight:900,color:k.c}}>{k.v}</p>
                            <p style={{fontSize:10,color:'#5B607E',marginTop:3}}>{k.l}</p>
                            <p style={{fontSize:9,color:'#8A8FAE',marginTop:1}}>{k.sub}</p>
                          </div>
                        ))}
                      </div>

                      {/* Per item breakdown */}
                      {(detailData.purchase_order_items||[]).length > 1 && (
                        <div style={{marginTop:14}}>
                          <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>COST PER PRODUCT</p>
                          {(detailData.purchase_order_items||[]).map((it,i)=>{
                            const itemTotalTZS = Number(it.total_cost_tzs)||Number(it.total_cost)||0
                            const share = lc.totalPurchase>0 ? itemTotalTZS/lc.totalPurchase : 1/(detailData.purchase_order_items||[]).length
                            const itemCosts = lc.totalCosts * share
                            const itemLanded = itemTotalTZS + itemCosts
                            const pcsPerBox = Number(it.pieces_per_box)||1
                            const totalPcs = (Number(it.qty_boxes)||0) * pcsPerBox
                            const perBox = it.qty_boxes>0 ? itemLanded/Number(it.qty_boxes) : 0
                            const perPiece = totalPcs>0 ? itemLanded/totalPcs : 0
                            return (
                              <div key={i} style={{background:'#F6F7FB',borderRadius:8,padding:'10px 12px',marginBottom:6}}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                  <p style={{fontSize:12,fontWeight:700}}>{it.image_emoji||'📦'} {it.product_name}</p>
                                  <p style={{fontSize:11,color:'#9A5B00',fontWeight:700}}>{fmt(Math.round(itemLanded))} landed</p>
                                </div>
                                <div style={{display:'flex',gap:16,marginTop:4,flexWrap:'wrap'}}>
                                  <span style={{fontSize:11,color:'#0B7A6C'}}>Box: {fmt(Math.round(perBox))}</span>
                                  <span style={{fontSize:11,color:'#2D2F8F'}}>Piece: {fmt(Math.round(perPiece))}</span>
                                  <span style={{fontSize:11,color:'#5B607E'}}>{it.qty_boxes} boxes × {pcsPerBox} pcs = {totalPcs} pcs</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Payments */}
                    <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>PAYMENTS TO VENDOR</p>
                    {(detailData.vendor_payments||[]).map((p,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #DCDFEC'}}>
                        <div>
                          <p style={{fontSize:13,fontWeight:700,color:'#0B7A6C'}}>{fmt(p.amount)}</p>
                          <p style={{fontSize:10,color:'#5B607E',marginTop:1}}>{p.payment_date} · {p.payment_method?.toUpperCase()} {p.reference?`· Ref: ${p.reference}`:''}</p>
                        </div>
                        <span style={{...C.badge('#0B7A6C')}}>PAID</span>
                      </div>
                    ))}
                    {!(detailData.vendor_payments||[]).length&&<p style={{fontSize:12,color:'#8A8FAE',marginBottom:8}}>No payments yet</p>}

                    <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid #DCDFEC',marginBottom:16}}>
                      <span style={{fontSize:13,color:'#5B607E'}}>Total Paid</span>
                      <span style={{fontSize:14,fontWeight:700,color:'#0B7A6C'}}>{fmt(lc.totalPaid)}</span>
                    </div>
                    {lc.owing>0&&(
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
                        <span style={{fontSize:13,color:'#B93A16'}}>Still Owing</span>
                        <span style={{fontSize:16,fontWeight:800,color:'#B93A16'}}>{fmt(lc.owing)}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {lc.owing>0&&<button onClick={()=>{setPayForm({amount:String(lc.owing),payment_date:today(),payment_method:'bank',reference:'',notes:''});setPayModal(true)}} style={{padding:'11px',borderRadius:8,background:'#0B7A6C',color:'#FFFFFF',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>💳 Record Payment</button>}
                      {detailData.status==='pending'&&<button onClick={()=>receiveOrder(detailData)} style={{padding:'11px',borderRadius:8,background:'#2D2F8F',color:'#FFFFFF',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>📦 Mark as Received - Add to Warehouse</button>}
                      {detailData.status==='received'&&<div style={{padding:'10px',borderRadius:8,background:'rgba(11,122,108,0.1)',border:'1px solid rgba(11,122,108,0.3)',textAlign:'center'}}><p style={{color:'#0B7A6C',fontWeight:700}}>✅ Received on {detailData.received_date}</p></div>}
                      <div style={{display:'flex',gap:8,marginTop:4}}>
                        <button onClick={()=>openEditOrder(detailData)} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid #2196F330',background:'rgba(45,47,143,0.1)',color:'#2D2F8F',fontWeight:600,fontSize:13,cursor:'pointer'}}>✏️ Edit Order</button>
                        <button onClick={()=>deleteOrder(detailData)} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid rgba(185,58,22,0.3)',background:'transparent',color:'#B93A16',fontWeight:600,fontSize:13,cursor:'pointer'}}>🗑️ Delete Order</button>
                      </div>
                    </div>
                  </div>
                </div>
  )
}

export default function Vendors() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [vendors, setVendors] = useState([])
  const [orders, setOrders] = useState([])
  const [wProds, setWProds] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('orders')
  const [toast, setToast] = useState('')

  // Multi-currency
  const [rates, setRates] = useState({ RMB: 390, USD: 2600, EUR: 2800, GBP: 3200, KES: 20, UGX: 0.7 })
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesUpdated, setRatesUpdated] = useState(null)

  // Vendor modal
  const [vendorModal, setVendorModal] = useState(false)
  const [editVendor, setEditVendor] = useState(null)
  const [vendorForm, setVendorForm] = useState({ name:'', phone:'', email:'', address:'', country:'Tanzania', notes:'' })
  const [vendorSaving, setVendorSaving] = useState(false)

  // Order modal
  const [orderModal, setOrderModal] = useState(false)
  const [orderForm, setOrderForm] = useState({ vendor_id:'', order_date:today(), expected_date:'', notes:'', currency:'RMB', exchange_rate:'' })
  const [orderItems, setOrderItems] = useState([{ product_name:'', part_number:'', image_emoji:'📦', category:'', qty_boxes:'', pieces_per_box:'', unit_cost:'', currency:'RMB' }])
  const [orderSaving, setOrderSaving] = useState(false)
  const [bulkPasteText, setBulkPasteText] = useState('')
  const [showBulkPaste, setShowBulkPaste] = useState(false)
  const [bulkPasteError, setBulkPasteError] = useState('')
  const [editingRates, setEditingRates] = useState({}) // {item_id: rate_value}
  const [ratesSaving, setRatesSaving] = useState(false)

  // Order detail
  const [detail, setDetail] = useState(null)
  const [detailData, setDetailData] = useState(null)

  // Payment modal
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState({ amount:'', payment_date:today(), payment_method:'bank', reference:'', notes:'' })
  const [paySaving, setPaySaving] = useState(false)

  // Cost modal
  const [costModal, setCostModal] = useState(false)
  const [costForm, setCostForm] = useState({ cost_type:'clearing', description:'', amount:'', cost_date:today(), currency:'USD' })
  const [costSaving, setCostSaving] = useState(false)

  useEffect(() => { loadData() }, [])
  const showToast = (msg, c='#0B7A6C') => { setToast({msg,c}); setTimeout(()=>setToast(''),3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof)
    let shopData = prof.shops
    if (!shopData) {
      const { data: owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    if (!shopData) { alert('No shop found for this account'); return }
    setShop(shopData)
    const shopId = shopData.id
    const [vr, or, wp] = await Promise.all([
      supabase.from('vendors').select('*').eq('shop_id', shopId).eq('is_active', true).order('name'),
      supabase.from('purchase_orders').select('*,vendors(name),purchase_order_items(*),vendor_payments(*),shipment_costs(*)').eq('shop_id', shopId).order('created_at', { ascending: false }),
      supabase.from('warehouse_products').select('id,name,image_emoji,category,box_qty').order('name'),
    ])
    setVendors(vr.data || [])
    setOrders(or.data || [])
    setWProds(wp.data || [])
    setLoading(false)
  }

  const loadDetail = async (orderId) => {
    const { data } = await supabase.from('purchase_orders')
      .select('*,vendors(*),purchase_order_items(*),vendor_payments(*),shipment_costs(*)')
      .eq('id', orderId).single()
    setDetailData(data)
  }

  // ── EXCHANGE RATES ──────────────────────────────────────
  const fetchRates = async () => {
    setRatesLoading(true)
    try {
      // Try primary API
      const res = await fetch('https://open.er-api.com/v6/latest/USD')
      const data = await res.json()
      if (data.rates) {
        const usdToTzs = data.rates.TZS || 2600
        setRates({
          RMB: Math.round(usdToTzs / (data.rates.CNY || 7.2)),
          USD: Math.round(usdToTzs),
          EUR: Math.round(usdToTzs / (data.rates.EUR || 0.92)),
          GBP: Math.round(usdToTzs / (data.rates.GBP || 0.79)),
          KES: Math.round(usdToTzs / (data.rates.KES || 129)),
          UGX: Math.round(usdToTzs / (data.rates.UGX || 3700)),
          TZS: 1,
        })
        setRatesUpdated(new Date())
      }
    } catch(e) {
      alert('Could not fetch live rates. Please update manually.')
    }
    setRatesLoading(false)
  }

  const toTZS = (amount, currency) => {
    if (!currency || currency === 'TZS') return amount
    return amount * (rates[currency] || 1)
  }

  // ── VENDOR CRUD ──────────────────────────────────────
  const saveVendor = async () => {
    if (!vendorForm.name.trim()) { alert('Enter vendor name'); return }
    setVendorSaving(true)
    const payload = { shop_id: shop.id, name: vendorForm.name.trim(), phone: vendorForm.phone.trim()||null, email: vendorForm.email.trim()||null, address: vendorForm.address.trim()||null, country: vendorForm.country, notes: vendorForm.notes.trim()||null, is_active: true }
    if (editVendor) {
      const { error } = await supabase.from('vendors').update(payload).eq('id', editVendor.id)
      if (error) { alert(error.message); setVendorSaving(false); return }
      showToast('Vendor updated')
    } else {
      const { error } = await supabase.from('vendors').insert(payload)
      if (error) { alert(error.message); setVendorSaving(false); return }
      showToast('Vendor added!')
    }
    setVendorSaving(false); setVendorModal(false); setEditVendor(null)
    loadData()
  }

  const delVendor = async (id) => {
    if (!confirm('Delete this vendor?')) return
    await supabase.from('vendors').update({ is_active: false }).eq('id', id)
    setVendors(p => p.filter(v => v.id !== id))
    showToast('Vendor deleted')
  }

  // ── PURCHASE ORDER ───────────────────────────────────
  const saveOrder = async () => {
    if (!orderForm.vendor_id) { alert('Select a vendor'); return }
    const validItems = orderItems.filter(i => i.product_name.trim() && parseFloat(i.qty_boxes) > 0)
    if (!validItems.length) { alert('Add at least one item with name and quantity'); return }
    setOrderSaving(true)
    const orderNum = 'PO-' + Date.now().toString().slice(-6)
    const { data: order, error } = await supabase.from('purchase_orders').insert({
      shop_id: shop.id, vendor_id: orderForm.vendor_id, order_number: orderNum,
      order_date: orderForm.order_date, expected_date: orderForm.expected_date||null,
      notes: orderForm.notes.trim()||null, status: 'pending', created_by: profile.id,
    }).select().single()
    if (error) { alert(error.message); setOrderSaving(false); return }
     await supabase.from('purchase_order_items').insert(validItems.map(i => {
       const r = parseFloat(orderForm.exchange_rate)||rates[orderForm.currency||'RMB']||1
       const uc = parseFloat(i.unit_cost)||0
       const qb = parseInt(i.qty_boxes)||0
       return {
         order_id: order.id, product_name: i.product_name.trim(),
         part_number: (i.part_number||'').trim()||null,
         image_emoji: i.image_emoji||'📦', category: i.category.trim()||null,
         qty_boxes: qb, pieces_per_box: parseInt(i.pieces_per_box)||1,
         unit_cost: uc, total_cost: qb*uc, currency: orderForm.currency||'RMB',
         exchange_rate: r, unit_cost_tzs: uc*r, total_cost_tzs: qb*uc*r,
       }
     }))
    setOrderSaving(false); setOrderModal(false)
    setOrderForm({ vendor_id:'', order_date:today(), expected_date:'', notes:'', currency:'RMB', exchange_rate:'' })
    setOrderItems([{ product_name:'', image_emoji:'📦', category:'', qty_boxes:'', pieces_per_box:'', unit_cost:'' }])
    showToast('Purchase order created!')
    loadData()
  }

  // ── EDIT ITEM RATES ──────────────────────────────────
  const saveItemRates = async () => {
    if (!Object.keys(editingRates).length) return
    setRatesSaving(true)
    try {
      for (const [itemId, newRate] of Object.entries(editingRates)) {
        const r = parseFloat(newRate)
        if (!r || r <= 0) continue
        const { error } = await supabase.from('purchase_order_items').update({
          exchange_rate: r,
          unit_cost_tzs: null, // will recalc below
          total_cost_tzs: null,
        }).eq('id', itemId)
        if (error) { console.error('Rate save error:', error); showToast('Error: ' + error.message, '#B93A16'); continue }
        // Recalc TZS values
        const item = (detailData?.purchase_order_items||[]).find(i => i.id === itemId)
        if (item) {
          const uc = Number(item.unit_cost)||0
          const qb = Number(item.qty_boxes)||0
          await supabase.from('purchase_order_items').update({
            unit_cost_tzs: uc * r,
            total_cost_tzs: qb * uc * r,
          }).eq('id', itemId)
        }
      }
      setEditingRates({})
      showToast('Exchange rates updated!')
      if (detailData?.id) { loadDetail(detailData.id) }
      loadData()
    } catch(e) {
      showToast('Error: ' + e.message, '#B93A16')
    }
    setRatesSaving(false)
  }

  // ── BULK PASTE ───────────────────────────────────────
  const parseBulkPaste = () => {
    setBulkPasteError('')
    if (!bulkPasteText.trim()) return
    const lines = bulkPasteText.trim().split('\n').filter(l => l.trim())
    const parsed = []
    const notFound = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Skip header row
      const lowerLine = trimmed.toLowerCase()
      if (lowerLine.startsWith('item name') || lowerLine.startsWith('product name') ||
          lowerLine.startsWith('name') || lowerLine.startsWith('part no') ||
          lowerLine.startsWith('description')) continue

      let name = '', part = '', qty = 1, rate = ''

      if (trimmed.includes('\t')) {
        // Tab-separated format: NAME	PART_NO	QTY	RATE
        const cols = trimmed.split('\t').map(c => c.trim())
        if (cols.length >= 3) {
          // Detect if first col is name or part number
          // Part numbers typically contain hyphens + alphanumeric like 12361-21030
          const col0IsPartNo = /^[A-Z0-9]+-[A-Z0-9]+$/i.test(cols[0])
          if (col0IsPartNo) {
            // Format: PART_NO	QTY	RATE or PART_NO	QTY
            part = cols[0]
            qty = parseInt(cols[1]) || 1
            rate = (cols[2]||'').replace(/[¥$€£]/g, '').trim()
          } else {
            // Format: NAME	PART_NO	QTY	RATE
            name = cols[0]
            part = cols[1] || ''
            qty = parseInt(cols[2]) || 1
            rate = (cols[3]||'').replace(/[¥$€£]/g, '').trim()
          }
        } else if (cols.length === 2) {
          // PART_NO	QTY
          part = cols[0]; qty = parseInt(cols[1]) || 1
        }
      }
      // Space/plain: part_number qty
      else {
        const m = trimmed.match(/^(.+?)\s+(\d+)\s*$/)
        if (m) { part = m[1].trim(); qty = parseInt(m[2]) }
        else { part = trimmed }
      }

      // Try to match against warehouse products by part number in _cfv
      // or against existing purchase order items
      // Just use part number as-is, auto-fill name if found in prods
      // Match by part number against warehouse products
      // wProds has name, image_emoji, category but no _cfv
      // So match by checking if part number appears in product name or category
      const matchedProd = wProds.find(p =>
        p.name.toLowerCase().includes(part.toLowerCase()) ||
        part.toLowerCase().includes(p.name.toLowerCase())
      )

      const finalName = name || (matchedProd ? matchedProd.name : '')
      parsed.push({
        product_name: finalName,
        part_number: part,
        image_emoji: matchedProd?.image_emoji || '📦',
        category: matchedProd?.category || '',
        qty_boxes: String(qty),
        pieces_per_box: '',
        unit_cost: rate || '',
        currency: 'RMB',
        _matched: !!matchedProd,
      })
    }

    if (!parsed.length) { setBulkPasteError('No valid items found'); return }

    // Add to existing orderItems (skip empty placeholder)
    const existing = orderItems.filter(i => i.product_name.trim() || i.part_number.trim())
    setOrderItems([...existing, ...parsed])
    setBulkPasteText('')
    setShowBulkPaste(false)
    const unmatched = parsed.filter(p => !p._matched).map(p => p.part_number)
    if (unmatched.length) setBulkPasteError(unmatched.length + ' new items not in warehouse: ' + unmatched.slice(0,5).join(', ') + (unmatched.length > 5 ? '...' : '') + ' — please fill in product names')
  }

  // ── RECEIVE ORDER ─────────────────────────────────────
  const receiveOrder = async (order) => {
    if (!confirm(`Mark this order as received and add items to warehouse?`)) return

    // Update order status
    await supabase.from('purchase_orders').update({ status: 'received', received_date: today() }).eq('id', order.id)

    // Calculate landed cost allocation per item
    const items = order.purchase_order_items || []
    const costs = order.shipment_costs || []
    const totalPurchase = items.reduce((a,i) => a+(Number(i.total_cost_tzs)||Number(i.total_cost)||0), 0)
    const totalShipCosts = costs.reduce((a,c) => a+(Number(c.amount_tzs)||Number(c.amount)||0), 0)

    // Get warehouse
    let { data: wh } = await supabase.from('warehouse').select('id').eq('owner_id', profile.id).single()
    if (!wh) {
      const { data: newWh } = await supabase.from('warehouse').insert({ owner_id: profile.id, name: 'Central Warehouse' }).select('id').single()
      wh = newWh
    }

    for (const it of items) {
      const itemTotalTZS = Number(it.total_cost_tzs)||Number(it.total_cost)||0
      const share = totalPurchase > 0 ? itemTotalTZS / totalPurchase : 1 / items.length
      const itemShipCost = totalShipCosts * share
      const itemLandedTotal = itemTotalTZS + itemShipCost
      const pcsPerBox = Number(it.pieces_per_box)||1
      const totalPcs = (Number(it.qty_boxes)||0) * pcsPerBox
      const landedPerPiece = totalPcs > 0 ? Math.round(itemLandedTotal / totalPcs) : 0
      const r = Number(it.exchange_rate)||1
      const uc = Number(it.unit_cost)||0

      // Add to warehouse stock
      const { data: existing } = await supabase.from('warehouse_products').select('id,stock').ilike('name', it.product_name).limit(1)
      const ex = existing?.[0]
      if (ex) {
        await supabase.from('warehouse_products').update({ stock: (ex.stock||0) + it.qty_boxes }).eq('id', ex.id)
      } else if (wh) {
        await supabase.from('warehouse_products').insert({
          warehouse_id: wh.id, name: it.product_name, image_emoji: it.image_emoji||'📦',
          category: it.category||null, buy_price: Math.round(uc*r),
          box_qty: pcsPerBox, stock: it.qty_boxes||0, unit: 'unit',
        })
      }

      // Also update/create in shop products table with part number
      const { data: existingProd } = await supabase.from('products')
        .select('id,wholesale_stock').ilike('name', it.product_name).eq('shop_id', shop.id).limit(1)
      const exProd = existingProd?.[0]
      let prodId = exProd?.id
      if (exProd) {
        await supabase.from('products').update({
          wholesale_stock: (Number(exProd.wholesale_stock)||0) + it.qty_boxes,
          buy_price: Math.round(uc*r),
        }).eq('id', exProd.id)
      } else {
        const { data: newProd } = await supabase.from('products').insert({
          shop_id: shop.id, name: it.product_name, image_emoji: it.image_emoji||'📦',
          category: it.category||null, buy_price: Math.round(uc*r),
          sell_price: 0, wholesale_price: 0, box_qty: pcsPerBox,
          wholesale_stock: it.qty_boxes||0, retail_stock: 0, stock: 0,
          unit: 'unit', product_type: 'wholesale', is_active: true,
        }).select('id').single()
        prodId = newProd?.id
      }

      // Save part number to product_field_values if part_number exists
      if (it.part_number && prodId) {
        // Find or create the Part Number custom field for this shop
        let { data: partFields } = await supabase.from('product_custom_fields')
          .select('id').eq('shop_id', shop.id).ilike('field_name', '%part%').limit(1)
        let partFieldId = partFields?.[0]?.id
        if (!partFieldId) {
          const { data: newField } = await supabase.from('product_custom_fields').insert({
            shop_id: shop.id, field_name: 'Part Number', field_type: 'text',
          }).select('id').single()
          partFieldId = newField?.id
        }
        if (partFieldId) {
          // Upsert the field value
          const { data: existVal } = await supabase.from('product_field_values')
            .select('id').eq('product_id', prodId).eq('field_id', partFieldId).limit(1)
          if (existVal?.[0]) {
            await supabase.from('product_field_values').update({ value: it.part_number }).eq('id', existVal[0].id)
          } else {
            await supabase.from('product_field_values').insert({ product_id: prodId, field_id: partFieldId, value: it.part_number })
          }
        }
      }

      // Create stock batch record
      const _batchDate = new Date().toISOString().split('T')[0].replace(/-/g,'')
        const _batchPrefix = (it.product_name || 'ITEM').replace(/[^A-Z0-9]/gi,'').substring(0,4).toUpperCase()
        const _batchRef = _batchPrefix + '-' + _batchDate + '-' + Math.floor(Math.random()*900+100)
        await supabase.from('stock_batches').insert({
          batch_ref: _batchRef,
          shop_id: shop.id,
        purchase_order_id: order.id,
        product_name: it.product_name,
        part_number: it.part_number||null,
        category: it.category||null,
        image_emoji: it.image_emoji||'📦',
        vendor_id: order.vendor_id,
        vendor_name: order.vendors?.name||null,
        qty_boxes: it.qty_boxes||0,
        pieces_per_box: pcsPerBox,
        qty_pieces: totalPcs,
        qty_remaining: totalPcs,
        unit_cost: uc,
        currency: it.currency||'RMB',
        exchange_rate: r,
        unit_cost_tzs: Math.round(uc*r),
        total_cost_tzs: Math.round(itemLandedTotal),
        landed_cost_per_piece: landedPerPiece,
        order_date: order.order_date,
        received_date: today(),
        status: 'active',
      })
    }

    showToast('✅ Order received — stock batches recorded!')
    loadData()
    if (detail?.id === order.id) loadDetail(order.id)
  }

  // ── DELETE SHIPMENT COST ─────────────────────────────
  const deleteShipmentCost = async (costId) => {
    if (!confirm('Delete this shipment cost?')) return
    await supabase.from('shipment_costs').delete().eq('id', costId)
    setDetailData(p => ({ ...p, shipment_costs: (p.shipment_costs||[]).filter(c => c.id !== costId) }))
    showToast('Cost deleted')
    loadData()
  }

  // ── DELETE ORDER ─────────────────────────────────────
  const deleteOrder = async (order) => {
    if (!confirm(`Delete order ${order.order_number} from ${order.vendors?.name}? This cannot be undone.`)) return
    await supabase.from('shipment_costs').delete().eq('order_id', order.id)
    await supabase.from('vendor_payments').delete().eq('order_id', order.id)
    await supabase.from('purchase_order_items').delete().eq('order_id', order.id)
    await supabase.from('purchase_orders').delete().eq('id', order.id)
    setOrders(p => p.filter(o => o.id !== order.id))
    setDetail(null); setDetailData(null)
    showToast('Order deleted')
  }

  // ── EDIT ORDER ────────────────────────────────────────
  const [editOrderModal, setEditOrderModal] = useState(false)
  const [editOrderId, setEditOrderId] = useState(null)
  const [editOrderSaving, setEditOrderSaving] = useState(false)

  const openEditOrder = (order) => {
    setEditOrderId(order.id)
    setOrderForm({ vendor_id: order.vendor_id, order_date: order.order_date, expected_date: order.expected_date||'', notes: order.notes||'' })
    setOrderItems((order.purchase_order_items||[]).map(i => ({
      product_name: i.product_name, part_number: i.part_number||'',
      image_emoji: i.image_emoji||'📦', category: i.category||'',
      qty_boxes: String(i.qty_boxes||''), pieces_per_box: String(i.pieces_per_box||1),
      unit_cost: String(i.unit_cost||''), currency: i.currency||'RMB',
    })))
    setOrderForm(p => ({...p, currency: order.purchase_order_items?.[0]?.currency||'RMB', exchange_rate: String(order.purchase_order_items?.[0]?.exchange_rate||'') }))
    setEditOrderModal(true)
  }

  const saveEditOrder = async () => {
    if (!orderForm.vendor_id) { alert('Select a vendor'); return }
    const validItems = orderItems.filter(i => i.product_name.trim() && parseFloat(i.qty_boxes) > 0)
    if (!validItems.length) { alert('Add at least one item'); return }
    setEditOrderSaving(true)
    await supabase.from('purchase_orders').update({
      vendor_id: orderForm.vendor_id, order_date: orderForm.order_date,
      expected_date: orderForm.expected_date||null, notes: orderForm.notes.trim()||null,
    }).eq('id', editOrderId)
    // Replace items
    await supabase.from('purchase_order_items').delete().eq('order_id', editOrderId)
    await supabase.from('purchase_order_items').insert(validItems.map(i => {
      const r = parseFloat(orderForm.exchange_rate)||rates[orderForm.currency||'RMB']||1
      const uc = parseFloat(i.unit_cost)||0
      const qb = parseInt(i.qty_boxes)||0
      return {
        order_id: editOrderId,
        product_name: i.product_name.trim(),
        part_number: (i.part_number||'').trim()||null,
        image_emoji: i.image_emoji||'📦',
        category: i.category.trim()||null,
        qty_boxes: qb, pieces_per_box: parseInt(i.pieces_per_box)||1,
        unit_cost: uc, total_cost: qb*uc,
        currency: orderForm.currency||'RMB',
        exchange_rate: r, unit_cost_tzs: uc*r, total_cost_tzs: qb*uc*r,
      }
    }))
    setEditOrderSaving(false); setEditOrderModal(false); setEditOrderId(null)
    showToast('Order updated!')
    loadData()
    if (detail?.id === editOrderId) loadDetail(editOrderId)
  }

  // ── PAYMENT ──────────────────────────────────────────
  const savePayment = async () => {
    if (!payForm.amount) { alert('Enter amount'); return }
    setPaySaving(true)
    const { data, error } = await supabase.from('vendor_payments').insert({
      order_id: detail.id, vendor_id: detail.vendor_id, shop_id: shop.id,
      amount: parseFloat(payForm.amount), payment_date: payForm.payment_date,
      payment_method: payForm.payment_method, reference: payForm.reference.trim()||null,
      notes: payForm.notes.trim()||null,
    }).select().single()
    if (error) { alert(error.message); setPaySaving(false); return }
    setDetailData(p => ({ ...p, vendor_payments: [...(p.vendor_payments||[]), data] }))
    setPayModal(false); setPayForm({ amount:'', payment_date:today(), payment_method:'bank', reference:'', notes:'' })
    setPaySaving(false); showToast('Payment recorded!')
    loadData()
  }

  // ── SHIPMENT COST ─────────────────────────────────────
  const saveCost = async () => {
    if (!costForm.amount) { alert('Enter amount'); return }
    setCostSaving(true)
    const { data, error } = await supabase.from('shipment_costs').insert({
      order_id: detail.id, shop_id: shop.id,
      cost_type: costForm.cost_type, description: costForm.description.trim()||null,
      amount: parseFloat(costForm.amount), cost_date: costForm.cost_date,
      currency: costForm.currency||'TZS',
      amount_tzs: toTZS(parseFloat(costForm.amount)||0, costForm.currency||'TZS'),
    }).select().single()
    if (error) { alert(error.message); setCostSaving(false); return }
    setDetailData(p => ({ ...p, shipment_costs: [...(p.shipment_costs||[]), data] }))
    setCostModal(false); setCostForm({ cost_type:'clearing', description:'', amount:'', cost_date:today() })
    setCostSaving(false); showToast('Cost added!')
    loadData()
  }

  // ── CALCULATIONS ──────────────────────────────────────
  const calcLanded = (order) => {
    if (!order) return { totalPurchase:0, totalPaid:0, totalCosts:0, totalLanded:0, totalBoxes:0, totalPieces:0, costPerBox:0, costPerPiece:0, owing:0 }
    const items = order.purchase_order_items || []
    const payments = order.vendor_payments || []
    const costs = order.shipment_costs || []
    const totalPurchase = items.reduce((a,i) => a+(Number(i.total_cost_tzs)||Number(i.total_cost)||0), 0)
    const totalPaid = payments.reduce((a,p) => a+(Number(p.amount)||0), 0)
    const totalCosts = costs.reduce((a,c) => a+(Number(c.amount_tzs)||Number(c.amount)||0), 0)
    const totalLanded = totalPurchase + totalCosts
    const totalBoxes = items.reduce((a,i) => a+(Number(i.qty_boxes)||0), 0)
    const totalPieces = items.reduce((a,i) => a+(Number(i.qty_boxes)||0)*Math.max(1,Number(i.pieces_per_box)||1), 0)
    const costPerBox = totalBoxes > 0 ? totalLanded / totalBoxes : 0
    const costPerPiece = totalPieces > 0 ? totalLanded / totalPieces : 0
    return { totalPurchase, totalPaid, totalCosts, totalLanded, totalBoxes, totalPieces, costPerBox, costPerPiece, owing: Math.max(0, totalPurchase - totalPaid) }
  }

  const statusColor = s => s==='received'?'#0B7A6C':s==='cancelled'?'#B93A16':s==='partial'?'#2D2F8F':'#9A5B00'

  const C = {
    card: { background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, padding:16 },
    input: { background:'#F6F7FB', border:'1.5px solid #DCDFEC', borderRadius:8, color:'#15183A', padding:'9px 12px', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
    label: { fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 },
    badge: c => ({ background:c+'18', color:c, border:`1px solid ${c}30`, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }),
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F6F7FB'}}><div style={{width:36,height:36,border:'3px solid #DCDFEC',borderTopColor:'#9A5B00',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  const pendingOrders = orders.filter(o => o.status !== 'received' && o.status !== 'cancelled')
  const totalOwed = orders.reduce((a,o) => a + calcLanded(o).owing, 0)
  const totalSpend = orders.reduce((a,o) => a + calcLanded(o).totalLanded, 0)

  return (
    <>
      <Head><title>Vendors — TheDashboard</title></Head>
      <Layout title="Vendor & Purchasing" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder,textarea::placeholder,select::placeholder{color:#8A8FAE} select{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit} textarea{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit;resize:vertical}`}</style>
        {toast && <div style={{position:'fixed',top:20,right:20,background:toast.c,color:'#FFFFFF',padding:'12px 20px',borderRadius:10,fontWeight:700,fontSize:13,zIndex:9999}}>{toast.msg}</div>}

        {/* Summary */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20}}>
          {[
            {l:'Vendors',v:vendors.length,c:'#2D2F8F'},
            {l:'Open Orders',v:pendingOrders.length,c:'#9A5B00'},
            {l:'Total Spent',v:fmtK(totalSpend),c:'#0F7375'},
            {l:'Owed to Vendors',v:fmtK(totalOwed),c:'#B93A16'},
          ].map(k=>(
            <div key={k.l} style={C.card}>
              <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8}}>{k.l.toUpperCase()}</p>
              <p style={{fontSize:k.l.includes('Spent')||k.l.includes('Owed')?16:22,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Exchange Rates Panel */}
        <div style={{...C.card,marginBottom:16,borderColor:'rgba(45,47,143,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <p style={{fontSize:11,color:'#5B607E',letterSpacing:0.8,fontWeight:600}}>EXCHANGE RATES TO TZS {ratesUpdated&&<span style={{color:'#8A8FAE',fontWeight:400}}>· Updated {ratesUpdated.toLocaleTimeString()}</span>}</p>
            <button onClick={fetchRates} disabled={ratesLoading} style={{padding:'5px 14px',borderRadius:6,border:'1px solid #2196F330',background:'rgba(45,47,143,0.1)',color:'#2D2F8F',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              {ratesLoading?'Fetching...':'🔄 Fetch Live Rates'}
            </button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[['RMB','🇨🇳'],['USD','🇺🇸'],['EUR','🇪🇺'],['GBP','🇬🇧'],['KES','🇰🇪']].map(([cur,flag])=>(
              <div key={cur} style={{background:'#F6F7FB',borderRadius:8,padding:'8px 12px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:14}}>{flag}</span>
                <div>
                  <p style={{fontSize:10,color:'#5B607E'}}>{cur}</p>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input value={rates[cur]||''} onChange={e=>setRates(p=>({...p,[cur]:parseFloat(e.target.value)||0}))}
                      style={{background:'transparent',border:'none',color:'#2D2F8F',fontWeight:800,fontSize:13,width:70,outline:'none',fontFamily:'inherit'}}
                      type="number"/>
                    <span style={{fontSize:10,color:'#8A8FAE'}}>TZS</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontSize:10,color:'#8A8FAE',marginTop:8}}>Click Fetch Live Rates to auto-update, or edit manually. Values are used when converting purchases to TZS.</p>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[['orders','📋 Purchase Orders'],['vendors','🏢 Vendors']].map(([k,l])=>(
            <button key={k} onClick={()=>{setTab(k);setDetail(null);setDetailData(null)}} style={{padding:'9px 20px',borderRadius:8,border:'1px solid',borderColor:tab===k?'#9A5B00':'#DCDFEC',background:tab===k?'rgba(242,160,7,0.15)':'transparent',color:tab===k?'#9A5B00':'#5B607E',fontWeight:tab===k?700:400,fontSize:13,cursor:'pointer'}}>{l}</button>
          ))}
          <button onClick={()=>{ setOrderForm({ vendor_id:'', order_date:today(), expected_date:'', notes:'', currency:'RMB', exchange_rate:'' }); setOrderItems([{ product_name:'', part_number:'', image_emoji:'📦', category:'', qty_boxes:'', pieces_per_box:'', unit_cost:'', currency:'RMB' }]); setShowBulkPaste(false); setBulkPasteText(''); setBulkPasteError(''); setOrderModal(true) }} style={{marginLeft:'auto',padding:'9px 20px',borderRadius:8,background:'#9A5B00',color:'#FFFFFF',fontWeight:700,fontSize:13,border:'none',cursor:'pointer'}}>+ New Order</button>
          <button onClick={()=>{setEditVendor(null);setVendorForm({name:'',phone:'',email:'',address:'',country:'Tanzania',notes:''});setVendorModal(true)}} style={{padding:'9px 16px',borderRadius:8,background:'transparent',border:'1px solid #DCDFEC',color:'#5B607E',fontWeight:600,fontSize:13,cursor:'pointer'}}>+ Add Vendor</button>
        </div>

        {/* ORDERS TAB */}
        {tab==='orders' && (
          <div style={{display:'grid',gridTemplateColumns:detail?'1fr 1fr':'1fr',gap:16}}>
            {/* Orders list */}
            <div>
              {orders.map(o => {
                const lc = calcLanded(o)
                return (
                  <div key={o.id} onClick={()=>{setDetail(o);loadDetail(o.id)}} style={{...C.card,marginBottom:10,cursor:'pointer',borderColor:detail?.id===o.id?'#9A5B00':'#DCDFEC'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=detail?.id===o.id?'#9A5B00':'#2196F350'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=detail?.id===o.id?'#9A5B00':'#DCDFEC'}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                          <p style={{fontWeight:700,fontSize:14}}>{o.vendors?.name}</p>
                          <span style={C.badge(statusColor(o.status))}>{o.status?.toUpperCase()}</span>
                        </div>
                        <p style={{fontSize:11,color:'#5B607E'}}>{o.order_number} · {o.order_date} · {(o.purchase_order_items||[]).length} items</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{fontSize:15,fontWeight:800,color:'#9A5B00'}}>{fmtK(lc.totalLanded)}</p>
                        <p style={{fontSize:10,color:'#5B607E',marginTop:2}}>Landed cost</p>
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,alignItems:'center'}}>
                      <span style={{color:'#0B7A6C'}}>Paid: {fmtK(lc.totalPaid)}</span>
                      {lc.owing>0&&<span style={{color:'#B93A16'}}>Owing: {fmtK(lc.owing)}</span>}
                      <span style={{color:'#0F7375'}}>Costs: {fmtK(lc.totalCosts)}</span>
                      <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openEditOrder(o)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid #2196F330',background:'rgba(45,47,143,0.1)',color:'#2D2F8F',fontSize:10,fontWeight:600,cursor:'pointer'}}>Edit</button>
                        <button onClick={()=>deleteOrder(o)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid rgba(185,58,22,0.3)',background:'transparent',color:'#B93A16',fontSize:10,fontWeight:600,cursor:'pointer'}}>Del</button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!orders.length&&<div style={{...C.card,textAlign:'center',padding:40}}><p style={{fontSize:36}}>📋</p><p style={{color:'#8A8FAE',marginTop:10}}>No purchase orders yet. Create your first one.</p></div>}
            </div>

            {/* Detail panel */}
            {detail && detailData && <VendorOrderDetail
              detailData={detailData}
              calcLanded={calcLanded}
              C={C}
              fmt={fmt}
              fmtK={fmtK}
              setPayModal={setPayModal}
              setPayForm={setPayForm}
              setCostModal={setCostModal}
              setCostForm={setCostForm}
              receiveOrder={receiveOrder}
              setDetail={setDetail}
              setDetailData={setDetailData}
              deleteOrder={deleteOrder}
              openEditOrder={openEditOrder}
              deleteShipmentCost={deleteShipmentCost}
              editingRates={editingRates}
              setEditingRates={setEditingRates}
              saveItemRates={saveItemRates}
              ratesSaving={ratesSaving}
            />}
          </div>
        )}

        {/* VENDORS TAB */}
        {tab==='vendors' && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {vendors.map(v=>{
              const vOrders = orders.filter(o=>o.vendor_id===v.id)
              const vSpend = vOrders.reduce((a,o)=>a+calcLanded(o).totalLanded,0)
              const vOwed = vOrders.reduce((a,o)=>a+calcLanded(o).owing,0)
              return (
                <div key={v.id} style={C.card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:40,height:40,background:'#ffb54720',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,border:'1px solid #ffb54730'}}>🏢</div>
                      <div>
                        <p style={{fontWeight:700,fontSize:14}}>{v.name}</p>
                        {v.phone&&<p style={{fontSize:11,color:'#5B607E',marginTop:1}}>{v.phone}</p>}
                        {v.country&&<p style={{fontSize:10,color:'#8A8FAE',marginTop:1}}>📍 {v.country}</p>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>{setEditVendor(v);setVendorForm({name:v.name,phone:v.phone||'',email:v.email||'',address:v.address||'',country:v.country||'Tanzania',notes:v.notes||''});setVendorModal(true)}} style={{padding:'5px 10px',borderRadius:6,border:'1px solid #DCDFEC',background:'transparent',color:'#2D2F8F',fontSize:11,fontWeight:600,cursor:'pointer'}}>Edit</button>
                      <button onClick={()=>delVendor(v.id)} style={{padding:'5px 10px',borderRadius:6,border:'1px solid rgba(185,58,22,0.3)',background:'transparent',color:'#B93A16',fontSize:11,fontWeight:600,cursor:'pointer'}}>Del</button>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                    {[{l:'Orders',v:vOrders.length,c:'#2D2F8F'},{l:'Total Spent',v:fmtK(vSpend),c:'#9A5B00'},{l:'Owed',v:fmtK(vOwed),c:vOwed>0?'#B93A16':'#0B7A6C'}].map(k=>(
                      <div key={k.l} style={{background:'#F6F7FB',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                        <p style={{fontSize:13,fontWeight:800,color:k.c}}>{k.v}</p>
                        <p style={{fontSize:9,color:'#5B607E',marginTop:2}}>{k.l}</p>
                      </div>
                    ))}
                  </div>
                  {v.address&&<p style={{fontSize:11,color:'#8A8FAE'}}>📍 {v.address}</p>}
                  {v.email&&<p style={{fontSize:11,color:'#2D2F8F',marginTop:2}}>✉️ {v.email}</p>}
                  <button onClick={()=>{ setOrderForm({ vendor_id:v.id, order_date:today(), expected_date:'', notes:'', currency:'RMB', exchange_rate:'' }); setOrderItems([{ product_name:'', part_number:'', image_emoji:'📦', category:'', qty_boxes:'', pieces_per_box:'', unit_cost:'', currency:'RMB' }]); setShowBulkPaste(false); setBulkPasteText(''); setBulkPasteError(''); setOrderModal(true) }} style={{marginTop:12,width:'100%',padding:'8px',borderRadius:8,border:'1px solid rgba(242,160,7,0.3)',background:'rgba(242,160,7,0.08)',color:'#9A5B00',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ New Order from {v.name.split(' ')[0]}</button>
                </div>
              )
            })}
            {!vendors.length&&<div style={{...C.card,textAlign:'center',padding:40,gridColumn:'1/-1'}}><p style={{fontSize:36}}>🏢</p><p style={{color:'#8A8FAE',marginTop:10}}>No vendors yet. Add your first supplier.</p></div>}
          </div>
        )}

        {/* ── VENDOR MODAL ── */}
        {vendorModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(21,24,58,0.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setVendorModal(false)}>
            <div style={{background:'#FFFFFF',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500,border:'1px solid #DCDFEC'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>{editVendor?'Edit Vendor':'Add Vendor'}</h2>
                <button onClick={()=>setVendorModal(false)} style={{background:'none',border:'none',color:'#5B607E',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={C.label}>VENDOR NAME *</label>
                  <input value={vendorForm.name} onChange={e=>setVendorForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Toyota Parts Ltd" style={C.input}/>
                </div>
                <div><label style={C.label}>PHONE</label><input value={vendorForm.phone} onChange={e=>setVendorForm(p=>({...p,phone:e.target.value}))} placeholder="e.g. +255 741 000 000" style={C.input}/></div>
                <div><label style={C.label}>EMAIL</label><input value={vendorForm.email} onChange={e=>setVendorForm(p=>({...p,email:e.target.value}))} placeholder="vendor@email.com" style={C.input}/></div>
                <div><label style={C.label}>COUNTRY</label><input value={vendorForm.country} onChange={e=>setVendorForm(p=>({...p,country:e.target.value}))} placeholder="Tanzania" style={C.input}/></div>
                <div><label style={C.label}>ADDRESS / CITY</label><input value={vendorForm.address} onChange={e=>setVendorForm(p=>({...p,address:e.target.value}))} placeholder="e.g. Nairobi, Kenya" style={C.input}/></div>
                <div style={{gridColumn:'1/-1'}}><label style={C.label}>NOTES</label><textarea value={vendorForm.notes} onChange={e=>setVendorForm(p=>({...p,notes:e.target.value}))} placeholder="Payment terms, contacts..." rows={2}/></div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button onClick={()=>setVendorModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#15183A',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveVendor} disabled={vendorSaving} style={{flex:2,padding:'11px',borderRadius:8,background:'#9A5B00',color:'#FFFFFF',fontWeight:700,border:'none',cursor:'pointer'}}>{vendorSaving?'Saving...':'Save Vendor'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── NEW ORDER MODAL ── */}
        {orderModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(21,24,58,0.55)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px 0'}} onClick={e=>e.target===e.currentTarget&&setOrderModal(false)}>
            <div style={{background:'#FFFFFF',borderRadius:16,padding:24,width:'100%',maxWidth:680,border:'1px solid #DCDFEC',margin:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>New Purchase Order</h2>
                <button onClick={()=>setOrderModal(false)} style={{background:'none',border:'none',color:'#5B607E',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={C.label}>VENDOR *</label>
                  <select value={orderForm.vendor_id} onChange={e=>setOrderForm(p=>({...p,vendor_id:e.target.value}))}>
                    <option value="">Select vendor...</option>
                    {vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div><label style={C.label}>ORDER DATE</label><input value={orderForm.order_date} onChange={e=>setOrderForm(p=>({...p,order_date:e.target.value}))} type="date" style={C.input}/></div>
                <div><label style={C.label}>EXPECTED DELIVERY</label><input value={orderForm.expected_date} onChange={e=>setOrderForm(p=>({...p,expected_date:e.target.value}))} type="date" style={C.input}/></div>
                <div><label style={C.label}>NOTES</label><input value={orderForm.notes} onChange={e=>setOrderForm(p=>({...p,notes:e.target.value}))} placeholder="Optional" style={C.input}/></div>
                <div>
                  <label style={C.label}>CURRENCY</label>
                  <select value={orderForm.currency||'RMB'} onChange={e=>setOrderForm(p=>({...p,currency:e.target.value,exchange_rate:''}))} style={{...C.input}}>
                    {['RMB','USD','EUR','GBP','KES','TZS'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={C.label}>EXCHANGE RATE → TZS</label>
                  <input value={orderForm.exchange_rate} onChange={e=>setOrderForm(p=>({...p,exchange_rate:e.target.value}))}
                    placeholder={String(rates[orderForm.currency||'RMB']||'')} type="number"
                    style={{...C.input,color:'#2D2F8F'}}/>
                  {orderForm.exchange_rate && <p style={{fontSize:10,color:'#2D2F8F',marginTop:3}}>1 {orderForm.currency} = TZS {orderForm.exchange_rate}</p>}
                </div>
              </div>

              <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>ORDER ITEMS</p>
              <div style={{marginBottom:10}}>
                {!showBulkPaste ? (
                  <button onClick={()=>setShowBulkPaste(true)} style={{padding:'7px 14px',borderRadius:8,border:'1px dashed #2196F350',background:'rgba(45,47,143,0.06)',color:'#2D2F8F',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    📋 Paste Bulk List
                  </button>
                ) : (
                  <div style={{background:'#F6F7FB',borderRadius:10,padding:12,border:'1px solid #2196F330'}}>
                    <p style={{fontSize:11,color:'#5B607E',marginBottom:6}}>Paste from supplier list (tab-separated). Supports: Part No only, or Name + Part No + Qty + Rate:</p>
                    <textarea value={bulkPasteText} onChange={e=>setBulkPasteText(e.target.value)}
                      placeholder={'ITEM NAME\tITEM NO.\tMOQ PCS\trate\nEngine Mount\t12361-21030\t100\t¥21.00\nBushing\t12371-0D060B\t100\t¥9.00'}
                      rows={5} style={{width:'100%',background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:8,color:'#15183A',padding:'8px 10px',fontSize:12,fontFamily:'monospace',outline:'none',resize:'vertical'}}/>
                    {bulkPasteError && <p style={{fontSize:11,color:'#9A5B00',marginTop:4}}>{bulkPasteError}</p>}
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button onClick={parseBulkPaste} style={{padding:'8px 18px',borderRadius:8,background:'#2D2F8F',color:'#FFFFFF',fontWeight:700,fontSize:12,border:'none',cursor:'pointer'}}>Parse & Add</button>
                      <button onClick={()=>{setShowBulkPaste(false);setBulkPasteText('');setBulkPasteError('')}} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#5B607E',fontSize:12,cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              {orderItems.map((it,i)=>{ const itemTotal=(parseFloat(it.qty_boxes)||0)*(parseFloat(it.unit_cost)||0); const itemTZS=toTZS(itemTotal,it.currency||'TZS'); const orderRate=parseFloat(orderForm.exchange_rate)||rates[orderForm.currency||'RMB']||1; return(<div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 0.8fr 0.8fr 0.8fr auto 1fr auto',gap:6,marginBottom:6,alignItems:'center'}}>
                  <input value={it.product_name} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,product_name:e.target.value}:x))} placeholder="e.g. Brake Pad" style={{...C.input,padding:'7px 10px'}}/>
                  <input value={it.part_number||''} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,part_number:e.target.value}:x))} placeholder="Part number" style={{...C.input,padding:'7px 8px',fontSize:11,fontFamily:'monospace'}}/>
                  <input value={it.qty_boxes} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,qty_boxes:e.target.value}:x))} placeholder="100" type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <input value={it.pieces_per_box} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,pieces_per_box:e.target.value}:x))} placeholder="1" type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <input value={it.unit_cost} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,unit_cost:e.target.value}:x))} placeholder="¥21" type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <span style={{padding:'7px 6px',fontSize:11,color:'#9A5B00',fontWeight:600}}>{orderForm.currency||'RMB'}</span>
                  <div style={{textAlign:'right'}}>
                    <p style={{fontSize:9,color:'#8A8FAE'}}>{orderForm.currency} {itemTotal.toLocaleString()}</p>
                    <p style={{fontSize:11,color:'#9A5B00',fontWeight:700}}>{itemTotal>0?fmt(Math.round(itemTotal*orderRate)):'—'}</p>
                  </div>
                  <button onClick={()=>setOrderItems(p=>p.length>1?p.filter((_,j)=>j!==i):p)} style={{background:'none',border:'none',color:'#B93A16',fontSize:16,cursor:'pointer'}}>✕</button>
                </div>
              )})}
              <button onClick={()=>setOrderItems(p=>[...p,{product_name:'',image_emoji:'📦',category:'',qty_boxes:'',pieces_per_box:'',unit_cost:''}])} style={{width:'100%',padding:'8px',borderRadius:8,border:'1px dashed #DCDFEC',background:'transparent',color:'#5B607E',fontSize:12,cursor:'pointer',marginBottom:16}}>+ Add Item</button>

              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid #DCDFEC',marginBottom:16}}>
                <span style={{fontWeight:700}}>Total Order Value (in TZS)</span>
                <span style={{fontWeight:900,color:'#9A5B00',fontSize:16}}>{fmt(Math.round(orderItems.reduce((a,i)=>a+toTZS((parseFloat(i.qty_boxes)||0)*(parseFloat(i.unit_cost)||0),i.currency||'TZS'),0)))}</span>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setOrderModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#15183A',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveOrder} disabled={orderSaving} style={{flex:2,padding:'11px',borderRadius:8,background:orderSaving?'#DCDFEC':'#9A5B00',color:orderSaving?'#8A8FAE':'#000',fontWeight:700,border:'none',cursor:'pointer'}}>{orderSaving?'Creating...':'Create Purchase Order'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── PAYMENT MODAL ── */}
        {payModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(21,24,58,0.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setPayModal(false)}>
            <div style={{background:'#FFFFFF',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:480,border:'1px solid #DCDFEC'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Record Vendor Payment</h2>
                <button onClick={()=>setPayModal(false)} style={{background:'none',border:'none',color:'#5B607E',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{gridColumn:'1/-1'}}><label style={C.label}>AMOUNT (TZS) *</label><input value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} type="number" placeholder="Amount paid" style={C.input}/></div>
                <div><label style={C.label}>PAYMENT DATE</label><input value={payForm.payment_date} onChange={e=>setPayForm(p=>({...p,payment_date:e.target.value}))} type="date" style={C.input}/></div>
                <div><label style={C.label}>METHOD</label><select value={payForm.payment_method} onChange={e=>setPayForm(p=>({...p,payment_method:e.target.value}))}><option value="bank">Bank Transfer</option><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="cheque">Cheque</option></select></div>
                <div><label style={C.label}>REFERENCE / REF NO.</label><input value={payForm.reference} onChange={e=>setPayForm(p=>({...p,reference:e.target.value}))} placeholder="e.g. TRF-001" style={C.input}/></div>
                <div><label style={C.label}>NOTES</label><input value={payForm.notes} onChange={e=>setPayForm(p=>({...p,notes:e.target.value}))} placeholder="Optional" style={C.input}/></div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button onClick={()=>setPayModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#15183A',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={savePayment} disabled={paySaving} style={{flex:2,padding:'11px',borderRadius:8,background:'#0B7A6C',color:'#FFFFFF',fontWeight:700,border:'none',cursor:'pointer'}}>{paySaving?'Saving...':'Record Payment'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── COST MODAL ── */}
        {costModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(21,24,58,0.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setCostModal(false)}>
            <div style={{background:'#FFFFFF',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:480,border:'1px solid #DCDFEC'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Add Shipment Cost</h2>
                <button onClick={()=>setCostModal(false)} style={{background:'none',border:'none',color:'#5B607E',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div><label style={C.label}>COST TYPE</label><select value={costForm.cost_type} onChange={e=>setCostForm(p=>({...p,cost_type:e.target.value}))}>{COST_TYPES.map(t=><option key={t} value={t} style={{textTransform:'capitalize'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
                <div>
                  <label style={C.label}>AMOUNT *</label>
                  <div style={{display:'flex',gap:6}}>
                    <input value={costForm.amount} onChange={e=>setCostForm(p=>({...p,amount:e.target.value}))} type="number" placeholder="e.g. 150" style={{...C.input,flex:1}}/>
                    <select value={costForm.currency||'USD'} onChange={e=>setCostForm(p=>({...p,currency:e.target.value}))} style={{...C.input,width:80,padding:'9px 6px',fontSize:11}}>
                      {['TZS','USD','RMB','EUR','GBP','KES'].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {costForm.amount&&costForm.currency&&costForm.currency!=='TZS'&&(
                    <p style={{fontSize:10,color:'#2D2F8F',marginTop:4}}>≈ {fmt(Math.round(toTZS(parseFloat(costForm.amount)||0,costForm.currency)))} TZS</p>
                  )}
                </div>
                <div style={{gridColumn:'1/-1'}}><label style={C.label}>DESCRIPTION</label><input value={costForm.description} onChange={e=>setCostForm(p=>({...p,description:e.target.value}))} placeholder="e.g. Clearing at Dar es Salaam port" style={C.input}/></div>
                <div><label style={C.label}>DATE</label><input value={costForm.cost_date} onChange={e=>setCostForm(p=>({...p,cost_date:e.target.value}))} type="date" style={C.input}/></div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button onClick={()=>setCostModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#15183A',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveCost} disabled={costSaving} style={{flex:2,padding:'11px',borderRadius:8,background:'#0F7375',color:'#FFFFFF',fontWeight:700,border:'none',cursor:'pointer'}}>{costSaving?'Saving...':'Add Cost'}</button>
              </div>
            </div>
          </div>
        )}
      {/* ── EDIT ORDER MODAL ── */}
        {editOrderModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(21,24,58,0.55)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px 0'}} onClick={e=>e.target===e.currentTarget&&setEditOrderModal(false)}>
            <div style={{background:'#FFFFFF',borderRadius:16,padding:24,width:'100%',maxWidth:680,border:'1px solid #DCDFEC',margin:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Edit Purchase Order</h2>
                <button onClick={()=>setEditOrderModal(false)} style={{background:'none',border:'none',color:'#5B607E',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={C.label}>VENDOR *</label>
                  <select value={orderForm.vendor_id} onChange={e=>setOrderForm(p=>({...p,vendor_id:e.target.value}))}>
                    <option value="">Select vendor...</option>
                    {vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div><label style={C.label}>ORDER DATE</label><input value={orderForm.order_date} onChange={e=>setOrderForm(p=>({...p,order_date:e.target.value}))} type="date" style={C.input}/></div>
                <div><label style={C.label}>EXPECTED DELIVERY</label><input value={orderForm.expected_date} onChange={e=>setOrderForm(p=>({...p,expected_date:e.target.value}))} type="date" style={C.input}/></div>
                <div><label style={C.label}>NOTES</label><input value={orderForm.notes} onChange={e=>setOrderForm(p=>({...p,notes:e.target.value}))} placeholder="Optional" style={C.input}/></div>
                <div>
                  <label style={C.label}>CURRENCY</label>
                  <select value={orderForm.currency||'RMB'} onChange={e=>setOrderForm(p=>({...p,currency:e.target.value,exchange_rate:''}))} style={{...C.input}}>
                    {['RMB','USD','EUR','GBP','KES','TZS'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={C.label}>EXCHANGE RATE → TZS</label>
                  <input value={orderForm.exchange_rate} onChange={e=>setOrderForm(p=>({...p,exchange_rate:e.target.value}))}
                    placeholder={String(rates[orderForm.currency||'RMB']||'')} type="number"
                    style={{...C.input,color:'#2D2F8F'}}/>
                  {orderForm.exchange_rate && <p style={{fontSize:10,color:'#2D2F8F',marginTop:3}}>1 {orderForm.currency} = TZS {orderForm.exchange_rate}</p>}
                </div>
              </div>
              <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>ORDER ITEMS</p>
              <div style={{marginBottom:10}}>
                {!showBulkPaste ? (
                  <button onClick={()=>setShowBulkPaste(true)} style={{padding:'7px 14px',borderRadius:8,border:'1px dashed #2196F350',background:'rgba(45,47,143,0.06)',color:'#2D2F8F',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    📋 Paste Bulk List
                  </button>
                ) : (
                  <div style={{background:'#F6F7FB',borderRadius:10,padding:12,border:'1px solid #2196F330'}}>
                    <p style={{fontSize:11,color:'#5B607E',marginBottom:6}}>Paste part numbers + qty (tab-separated or space):</p>
                    <textarea value={bulkPasteText} onChange={e=>setBulkPasteText(e.target.value)}
                      placeholder={'ITEM NAME\tITEM NO.\tMOQ PCS\trate\nEngine Mount\t12361-21030\t100\t¥21.00\nBushing\t12371-0D060B\t100\t¥9.00'}
                      rows={6} style={{width:'100%',background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:8,color:'#15183A',padding:'8px 10px',fontSize:12,fontFamily:'monospace',outline:'none',resize:'vertical'}}/>
                    {bulkPasteError && <p style={{fontSize:11,color:'#9A5B00',marginTop:4}}>{bulkPasteError}</p>}
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button onClick={parseBulkPaste} style={{padding:'8px 18px',borderRadius:8,background:'#2D2F8F',color:'#FFFFFF',fontWeight:700,fontSize:12,border:'none',cursor:'pointer'}}>Parse & Add</button>
                      <button onClick={()=>{setShowBulkPaste(false);setBulkPasteText('');setBulkPasteError('')}} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#5B607E',fontSize:12,cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              {orderItems.map((it,i)=>{
                const itemTotal=(parseFloat(it.qty_boxes)||0)*(parseFloat(it.unit_cost)||0)
                const itemTZS=toTZS(itemTotal,it.currency||'TZS')
                return(
                <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 0.8fr 0.8fr 0.8fr auto',gap:6,marginBottom:6,alignItems:'center'}}>
                  <input value={it.product_name} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,product_name:e.target.value}:x))} placeholder="Product name" style={{...C.input,padding:'7px 10px'}}/>
                  <input value={it.part_number||''} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,part_number:e.target.value}:x))} placeholder="Part number" style={{...C.input,padding:'7px 8px',fontSize:11,fontFamily:'monospace'}}/>
                  <input value={it.qty_boxes} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,qty_boxes:e.target.value}:x))} type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <input value={it.pieces_per_box} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,pieces_per_box:e.target.value}:x))} type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <input value={it.unit_cost} onChange={e=>setOrderItems(p=>p.map((x,j)=>j===i?{...x,unit_cost:e.target.value}:x))} type="number" style={{...C.input,padding:'7px 8px'}}/>
                  <span style={{padding:'7px 8px',fontSize:11,color:'#9A5B00',fontWeight:600}}>{orderForm.currency||'RMB'}</span>
                  <p style={{fontSize:11,color:'#9A5B00',fontWeight:700,textAlign:'right'}}>{itemTotal>0?fmt(Math.round(itemTZS)):'—'}</p>
                  <button onClick={()=>setOrderItems(p=>p.length>1?p.filter((_,j)=>j!==i):p)} style={{background:'none',border:'none',color:'#B93A16',fontSize:16,cursor:'pointer'}}>✕</button>
                </div>
              )})}
              <button onClick={()=>setOrderItems(p=>[...p,{product_name:'',part_number:'',image_emoji:'📦',category:'',qty_boxes:'',pieces_per_box:'',unit_cost:'',currency:'RMB'}])} style={{width:'100%',padding:'8px',borderRadius:8,border:'1px dashed #DCDFEC',background:'transparent',color:'#5B607E',fontSize:12,cursor:'pointer',marginBottom:16}}>+ Add Item</button>
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid #DCDFEC',marginBottom:16}}>
                <span style={{fontWeight:700}}>Total (TZS)</span>
                <span style={{fontWeight:900,color:'#9A5B00',fontSize:16}}>{fmt(Math.round(orderItems.reduce((a,i)=>a+toTZS((parseFloat(i.qty_boxes)||0)*(parseFloat(i.unit_cost)||0),i.currency||'TZS'),0)))}</span>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setEditOrderModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #DCDFEC',background:'transparent',color:'#15183A',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveEditOrder} disabled={editOrderSaving} style={{flex:2,padding:'11px',borderRadius:8,background:editOrderSaving?'#DCDFEC':'#9A5B00',color:editOrderSaving?'#8A8FAE':'#000',fontWeight:700,border:'none',cursor:'pointer'}}>{editOrderSaving?'Saving...':'Save Changes'}</button>
              </div>
            </div>
          </div>
        )}

      </Layout>
    </>
  )
}
