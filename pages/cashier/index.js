import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function CashierPOS() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [products, setProducts] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [custSuggestions, setCustSuggestions] = useState([])
  const [custSearching, setCustSearching] = useState(false)
  const [showCustDrop, setShowCustDrop] = useState(false)
  const custSearchRef = useRef(null)
  const custDropRef = useRef(null)
  const [payMeth, setPayMeth] = useState('cash')
  const [disc, setDisc] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('pos')
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [posTab, setPosTab] = useState('retail')
  const [splitCashPaid, setSplitCashPaid] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [editingPrice, setEditingPrice] = useState({}) // {id+sale_type: tempValue}
  const [staffList, setStaffList] = useState([])
  const [broughtBy, setBroughtBy] = useState('')
  const [broughtByCustom, setBroughtByCustom] = useState('')

  useEffect(() => { loadData() }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (custDropRef.current && !custDropRef.current.contains(e.target) &&
          custSearchRef.current && !custSearchRef.current.contains(e.target)) {
        setShowCustDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showToast = (msg, c = '#25d366') => { setToast({ msg, c }); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    if (!prof) { router.push('/auth/login'); return }
    if (prof.role === 'shop_admin') { router.push('/dashboard'); return }
    if (prof.role === 'sales_rep') { router.push('/rep'); return }
    setProfile(prof)
    const shopData = prof.shops
    setShop(shopData)
    const shopId = shopData.id
    const [pr, cf, sr] = await Promise.all([
      supabase.from('products').select('*,product_field_values(field_id,value)').eq('shop_id', shopId).eq('is_active', true).order('name'),
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopId),
      supabase.from('sales').select('*,sale_items(*)').eq('shop_id', shopId).eq('cashier_id', user.id).order('created_at', { ascending: false }).limit(200),
    ])
    const prodList = pr.data || []
    const map = {}
    prodList.forEach(p => {
      const cfv = {}
      ;(p.product_field_values || []).forEach(v => { cfv[v.field_id] = v.value })
      p._cfv = cfv
    })
    setProducts(prodList)
    setCustomFields(cf.data || [])
    setSales(sr.data || [])
    const { data: sfData } = await supabase.from('app_users').select('id,full_name').eq('shop_id', shopId).order('full_name')
    setStaffList((sfData || []).filter(u => u.full_name))
    setLoading(false)
  }

  // Customer autocomplete
  const searchCustomers = async (query, field) => {
    if (!query || query.length < 2 || !shop) { setCustSuggestions([]); setShowCustDrop(false); return }
    setCustSearching(true)
    try {
      let q = supabase.from('customers').select('id,name,phone,email').eq('shop_id', shop.id)
      if (field === 'phone') {
        q = q.ilike('phone', `%${query}%`)
      } else {
        q = q.ilike('name', `%${query}%`)
      }
      const { data } = await q.limit(6)
      setCustSuggestions(data || [])
      setShowCustDrop((data || []).length > 0)
    } catch (e) { /* silent */ }
    setCustSearching(false)
  }

  const selectCustomer = (c) => {
    setSelectedCustomer(c)
    setCustName(c.name || '')
    setCustPhone(c.phone || '')
    setCustSuggestions([])
    setShowCustDrop(false)
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setCustName('')
    setCustPhone('')
    setCustSuggestions([])
    setShowCustDrop(false)
  }

  // Cart logic
  const partField = customFields.find(f => f.field_name.toLowerCase().includes('part'))
  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))]
  const filtProds = products.filter(p => {
    const stock = posTab === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
    if (stock <= 0) return false
    const q = search.toLowerCase()
    if (q) return p.name.toLowerCase().includes(q) || Object.values(p._cfv || {}).some(v => String(v).toLowerCase().includes(q))
    return cat === 'All' || p.category === cat
  })

  const addToCart = (p) => {
    const price = posTab === 'wholesale' ? (p.wholesale_price || 0) : (p.sell_price || 0)
    const saleType = posTab === 'wholesale' ? 'wholesale' : 'retail'
    setCart(prev => {
      const ex = prev.find(c => c.id === p.id && c.sale_type === saleType)
      if (ex) return prev.map(c => c.id === p.id && c.sale_type === saleType ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...p, qty: 1, sell_price: price, sale_type: saleType }]
    })
  }

  const subtotal = cart.reduce((a, c) => a + c.sell_price * c.qty, 0)
  const discAmt = parseFloat(disc) || 0
  const finalTotal = Math.max(0, subtotal - discAmt)
  const receivedAmt = splitCashPaid ? parseFloat(splitCashPaid) || 0 : 0
  const isSplit = payMeth !== 'loan' && receivedAmt > 0 && receivedAmt < finalTotal
  const loanBalance = isSplit ? finalTotal - receivedAmt : 0

  const completeSale = async () => {
    if (!cart.length) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const custId = selectedCustomer?.id || null
      const broughtByVal = broughtBy === '__custom__' ? broughtByCustom.trim() : broughtBy.trim() || null
      const { data: sale } = await supabase.from('sales').insert({
        shop_id: shop.id, cashier_id: user.id, customer_id: custId,
        subtotal, discount: discAmt, total: finalTotal,
        payment_method: isSplit ? 'split' : payMeth, sale_date: today(),
        cash_paid: isSplit ? receivedAmt : null,
        loan_balance: isSplit ? loanBalance : null,
        brought_by: broughtByVal,
      }).select().single()
      if (sale) {
        await supabase.from('sale_items').insert(cart.map(c => ({
          sale_id: sale.id, product_id: c.id, product_name: c.name,
          qty: c.qty, unit_price: c.sell_price, line_total: c.sell_price * c.qty,
          buy_price: c.buy_price || 0, sale_type: c.sale_type,
          line_profit: (c.sell_price - (c.buy_price || 0) / (c.box_qty || 1)) * c.qty,
        })))
        for (const c of cart) {
          const field = posTab === 'wholesale' ? 'wholesale_stock' : 'retail_stock'
          const cur = posTab === 'wholesale' ? (c.wholesale_stock || 0) : (c.retail_stock || c.stock || 0)
          await supabase.from('products').update({ [field]: Math.max(0, cur - c.qty) }).eq('id', c.id)
        }
        // Update customer stats if a known customer was linked
        if (custId) {
          const { data: cust } = await supabase.from('customers').select('total_spent,visit_count').eq('id', custId).single()
          if (cust) {
            await supabase.from('customers').update({
              total_spent: (cust.total_spent || 0) + finalTotal,
              visit_count: (cust.visit_count || 0) + 1,
            }).eq('id', custId)
          }
        }
        setReceipt({ id: sale.id.slice(-8).toUpperCase(), date: new Date(), customer: custName || 'Walk-in', items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.sell_price, total: c.sell_price * c.qty, pn: partField && c._cfv?.[partField.id] })), subtotal, discount: discAmt, total: finalTotal, payMeth: isSplit ? 'split' : payMeth, cashPaid: receivedAmt, loanBalance, isSplit })
        setCart([]); setDisc(''); clearCustomer(); setPayMeth('cash'); setSplitCashPaid(''); setBroughtBy(''); setBroughtByCustom('')
        loadData()
      }
    } catch (e) { showToast('Error: ' + e.message, '#ff4d6d') }
    setSaving(false)
  }

  // Sales summary
  const todaySales = sales.filter(s => s.sale_date === today())
  const todayTotal = todaySales.reduce((a, s) => a + (Number(s.total) || 0), 0)
  const todayCount = todaySales.length

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthSales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(thisMonth))
  const monthTotal = monthSales.reduce((a, s) => a + (Number(s.total) || 0), 0)

  const thisYear = new Date().getFullYear().toString()
  const yearSales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(thisYear))
  const yearTotal = yearSales.reduce((a, s) => a + (Number(s.total) || 0), 0)

  // Daily chart for this month
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dailyChart = Array.from({ length: daysInMonth }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    const dateStr = `${thisMonth}-${d}`
    const daySales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10)) === dateStr)
    return { day: i + 1, total: daySales.reduce((a, s) => a + (Number(s.total) || 0), 0) }
  })

  // Monthly chart for this year
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlyChart = months.map((m, mi) => {
    const prefix = `${thisYear}-${String(mi + 1).padStart(2, '0')}`
    const total = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(prefix)).reduce((a, s) => a + (Number(s.total) || 0), 0)
    return { month: m, total }
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0e1a' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid #1e2840', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#64748b', fontFamily: 'system-ui' }}>Loading POS...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head><title>POS — {shop?.name}</title></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0e1a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        input::placeholder { color: #475569 }
        input:focus { border-color: #3b82f6 !important; outline: none; }
        ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-track { background: #0f172a } ::-webkit-scrollbar-thumb { background: #1e2840; border-radius: 2px }
      `}</style>

      {/* Toast */}
      {toast && <div style={{ position:'fixed', top:16, right:16, background:toast.c, color:'#000', padding:'10px 18px', borderRadius:10, fontWeight:700, fontSize:13, zIndex:9999, animation:'fadeIn 0.2s' }}>{toast.msg}</div>}

      {/* Receipt Modal */}
      {receipt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }} onClick={e => e.target===e.currentTarget && setReceipt(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:380, color:'#111' }}>
            <div style={{ textAlign:'center', marginBottom:20, paddingBottom:16, borderBottom:'1px dashed #ddd' }}>
              <p style={{ fontSize:18, fontWeight:900, letterSpacing:-0.5 }}>{shop?.name}</p>
              <p style={{ fontSize:11, color:'#888', marginTop:2 }}>Receipt #{receipt.id}</p>
              <p style={{ fontSize:11, color:'#888' }}>{receipt.date.toLocaleString()}</p>
            </div>
            {receipt.items.map((it, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:600 }}>{it.name} × {it.qty}</p>
                  {it.pn && <p style={{ fontSize:10, color:'#888', fontFamily:'monospace' }}>#{it.pn}</p>}
                </div>
                <p style={{ fontSize:13, fontWeight:700 }}>{fmt(it.total)}</p>
              </div>
            ))}
            <div style={{ borderTop:'1px dashed #ddd', paddingTop:12, marginTop:12 }}>
              {receipt.discount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'#666' }}><span>Discount</span><span>-{fmt(receipt.discount)}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:17 }}><span>TOTAL</span><span>{fmt(receipt.total)}</span></div>
              {receipt.isSplit ? (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#fff8f0', borderRadius:8, border:'1px solid #fed7aa' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#16a34a' }}><span>Cash Paid</span><span style={{ fontWeight:700 }}>{fmt(receipt.cashPaid)}</span></div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#dc2626', marginTop:4 }}><span>Balance Due</span><span style={{ fontWeight:700 }}>{fmt(receipt.loanBalance)}</span></div>
                </div>
              ) : (
                <p style={{ fontSize:12, color:'#888', marginTop:6 }}>Paid via {receipt.payMeth?.toUpperCase()}</p>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => window.print()} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #ddd', background:'#f5f5f5', color:'#333', fontWeight:600, fontSize:13, cursor:'pointer' }}>🖨️ Print</button>
              <button onClick={() => setReceipt(null)} style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:'#3b82f6', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>Done ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#0f172a', borderBottom:'1px solid #1e2840', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, background:'#3b82f6', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:16, color:'#fff' }}>
            {shop?.name?.charAt(0)}
          </div>
          <div>
            <p style={{ fontWeight:700, fontSize:14 }}>{shop?.name}</p>
            <p style={{ fontSize:11, color:'#64748b' }}>{profile?.full_name} · Cashier</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['pos','🛒 POS'], ['summary','📊 Summary'], ['history','📋 History']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:'7px 14px', borderRadius:8, border:'none', background: tab===k ? '#3b82f6' : '#1e2840', color: tab===k ? '#fff' : '#94a3b8', fontWeight: tab===k ? 700 : 400, fontSize:12, cursor:'pointer' }}>{l}</button>
          ))}
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/auth/login'))} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #1e2840', background:'transparent', color:'#64748b', fontSize:12, cursor:'pointer' }}>Exit</button>
        </div>
      </div>

      {/* POS TAB */}
      {tab === 'pos' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', height:'calc(100vh - 61px)' }}>
          {/* Left: Products */}
          <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Search + filters */}
            <div style={{ padding:'12px 16px', background:'#0f172a', borderBottom:'1px solid #1e2840' }}>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products or part number..." style={{ flex:1, background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0', padding:'9px 14px', fontSize:13 }}/>
                <div style={{ display:'flex', background:'#1e2840', borderRadius:8, border:'1px solid #2d3f5e', overflow:'hidden' }}>
                  {[{k:'retail',l:'Retail'},{k:'wholesale',l:'Wholesale'}].map(t => (
                    <button key={t.k} onClick={()=>setPosTab(t.k)} style={{ padding:'9px 14px', border:'none', background:posTab===t.k?'#3b82f6':'transparent', color:posTab===t.k?'#fff':'#94a3b8', fontWeight:posTab===t.k?700:400, fontSize:12, cursor:'pointer' }}>{t.l}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                {categories.map(c => (
                  <button key={c} onClick={()=>setCat(c)} style={{ padding:'5px 12px', borderRadius:20, border:'none', background:cat===c?'#3b82f6':'#1e2840', color:cat===c?'#fff':'#64748b', fontWeight:cat===c?600:400, fontSize:11, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>{c}</button>
                ))}
              </div>
            </div>

            {/* Product grid */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, alignContent:'start' }}>
              {filtProds.map(p => {
                const price = posTab==='wholesale' ? (p.wholesale_price||0) : (p.sell_price||0)
                const stock = posTab==='wholesale' ? (p.wholesale_stock||0) : (p.retail_stock||p.stock||0)
                const pn = partField && p._cfv?.[partField.id]
                const inCart = cart.find(c => c.id===p.id && c.sale_type===(posTab==='wholesale'?'wholesale':'retail'))
                return (
                  <button key={p.id} onClick={()=>addToCart(p)} style={{ background: inCart ? 'rgba(59,130,246,0.15)' : '#0f172a', border: `1.5px solid ${inCart?'#3b82f6':'#1e2840'}`, borderRadius:12, padding:'12px 10px', textAlign:'left', cursor:'pointer', position:'relative', transition:'border-color 0.15s' }}>
                    {inCart && <div style={{ position:'absolute', top:6, right:6, width:20, height:20, background:'#3b82f6', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>{inCart.qty}</div>}
                    <div style={{ fontSize:24, marginBottom:6 }}>{p.image_emoji||'📦'}</div>
                    <p style={{ fontSize:12, fontWeight:600, color:'#e2e8f0', lineHeight:1.3, marginBottom:2 }}>{p.name}</p>
                    {pn && <p style={{ fontSize:9, color:'#3b82f6', fontFamily:'monospace', marginBottom:4 }}>#{pn}</p>}
                    <p style={{ fontSize:13, fontWeight:800, color:'#34d399' }}>{fmt(price)}</p>
                    <p style={{ fontSize:9, color:'#475569', marginTop:2 }}>{stock} in stock</p>
                  </button>
                )
              })}
              {!filtProds.length && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'60px 20px', color:'#475569' }}><p style={{ fontSize:32 }}>📦</p><p style={{ marginTop:8, fontSize:13 }}>No products found</p></div>}
            </div>
          </div>

          {/* Right: Cart */}
          <div style={{ background:'#0f172a', borderLeft:'1px solid #1e2840', display:'flex', flexDirection:'column' }}>
            {/* Cart header */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #1e2840', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ fontWeight:700, fontSize:14 }}>🛒 Cart <span style={{ color:'#64748b', fontWeight:400 }}>({cart.length})</span></p>
              {cart.length>0 && <button onClick={()=>setCart([])} style={{ fontSize:11, color:'#ef4444', background:'none', border:'none', cursor:'pointer' }}>Clear all</button>}
            </div>

            {/* Cart items */}
            <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
              {cart.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#475569' }}>
                  <p style={{ fontSize:32 }}>🛒</p>
                  <p style={{ fontSize:13, marginTop:8 }}>Cart is empty</p>
                  <p style={{ fontSize:11, marginTop:4 }}>Tap products to add</p>
                </div>
              )}
              {cart.map((item, i) => {
                const pn = partField && item._cfv?.[partField.id]
                const epKey = item.id+item.sale_type
                const isEditingPrice = editingPrice.hasOwnProperty(epKey)
                return (
                  <div key={epKey} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid #1e2840' }}>
                    <span style={{ fontSize:20 }}>{item.image_emoji||'📦'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</p>
                      {pn && <p style={{ fontSize:10, color:'#3b82f6', fontFamily:'monospace' }}>#{pn}</p>}
                      <p style={{ fontSize:11, color:'#64748b' }}>{fmt(item.sell_price)} each</p>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      {isEditingPrice ? (
                        <input
                          type="number"
                          autoFocus
                          value={editingPrice[epKey]}
                          onChange={e=>setEditingPrice(p=>({...p,[epKey]:e.target.value}))}
                          onBlur={()=>{
                            const newPrice = parseFloat(editingPrice[epKey])
                            const floor = item.min_sell_price
                            if (isNaN(newPrice) || newPrice <= 0) {
                              setEditingPrice(p=>{const n={...p};delete n[epKey];return n})
                              return
                            }
                            if (floor != null && newPrice < floor) {
                              alert(`Minimum price for ${item.name} is ${fmt(floor)}`)
                              setEditingPrice(p=>{const n={...p};delete n[epKey];return n})
                              return
                            }
                            setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,sell_price:newPrice}:c))
                            setEditingPrice(p=>{const n={...p};delete n[epKey];return n})
                          }}
                          onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape'){setEditingPrice(p=>{const n={...p};delete n[epKey];return n})}}}
                          style={{ width:80,height:24,borderRadius:6,border:'1px solid #f59e0b',background:'#1e2840',color:'#fbbf24',fontSize:13,fontWeight:700,textAlign:'right',padding:'0 4px' }}
                        />
                      ) : (
                        <p
                          onClick={()=>setEditingPrice(p=>({...p,[epKey]:String(item.sell_price)}))}
                          title="Click to edit price"
                          style={{ fontSize:13, fontWeight:700, color:'#34d399', cursor:'pointer', borderBottom:'1px dashed #34d399' }}
                        >{fmt(item.sell_price*item.qty)}</p>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <button onClick={()=>setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:Math.max(1,c.qty-1)}:c))} style={{ width:24,height:24,borderRadius:6,border:'1px solid #2d3f5e',background:'#1e2840',color:'#e2e8f0',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                        <input
                          type="number" min="1"
                          value={item.qty}
                          onChange={e=>{const v=parseInt(e.target.value)||1;setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:Math.max(1,v)}:c))}}
                          style={{ width:44,height:24,borderRadius:6,border:'1px solid #3b82f6',background:'#1e2840',color:'#e2e8f0',fontSize:13,fontWeight:700,textAlign:'center',padding:0 }}
                        />
                        <button onClick={()=>setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:c.qty+1}:c))} style={{ width:24,height:24,borderRadius:6,border:'1px solid #2d3f5e',background:'#1e2840',color:'#e2e8f0',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                        <button onClick={()=>setCart(p=>p.filter(c=>!(c.id===item.id&&c.sale_type===item.sale_type)))} style={{ width:24,height:24,borderRadius:6,border:'none',background:'rgba(239,68,68,0.15)',color:'#ef4444',fontSize:12,cursor:'pointer',marginLeft:2 }}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order summary */}
            {cart.length > 0 && (
              <div style={{ padding:'12px 14px', borderTop:'1px solid #1e2840' }}>
                {/* Customer autocomplete */}
                <div style={{ position:'relative', marginBottom:8 }} ref={custSearchRef}>
                  {selectedCustomer ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', borderRadius:8, padding:'7px 10px' }}>
                      <span style={{ fontSize:14 }}>👤</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:700, color:'#34d399', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selectedCustomer.name}</p>
                        {selectedCustomer.phone && <p style={{ fontSize:10, color:'#64748b' }}>{selectedCustomer.phone}</p>}
                      </div>
                      <button onClick={clearCustomer} style={{ background:'none', border:'none', color:'#64748b', fontSize:14, cursor:'pointer', padding:'0 2px' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6 }}>
                      <input
                        value={custName}
                        onChange={e => { setCustName(e.target.value); searchCustomers(e.target.value, 'name') }}
                        onFocus={() => custName.length >= 2 && custSuggestions.length > 0 && setShowCustDrop(true)}
                        placeholder="Customer name"
                        style={{ flex:1, background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontSize:12 }}
                      />
                      <input
                        value={custPhone}
                        onChange={e => { setCustPhone(e.target.value); searchCustomers(e.target.value, 'phone') }}
                        onFocus={() => custPhone.length >= 2 && custSuggestions.length > 0 && setShowCustDrop(true)}
                        placeholder="Phone"
                        style={{ width:100, background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontSize:12 }}
                      />
                    </div>
                  )}
                  {showCustDrop && custSuggestions.length > 0 && (
                    <div ref={custDropRef} style={{ position:'absolute', bottom:'100%', left:0, right:0, background:'#1e2840', border:'1px solid #3b82f6', borderRadius:8, marginBottom:4, zIndex:200, overflow:'hidden', boxShadow:'0 -4px 16px rgba(0,0,0,0.4)' }}>
                      {custSuggestions.map(c => (
                        <button key={c.id} onMouseDown={() => selectCustomer(c)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'none', border:'none', borderBottom:'1px solid #2d3f5e', color:'#e2e8f0', cursor:'pointer', textAlign:'left' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(59,130,246,0.15)'}
                          onMouseLeave={e => e.currentTarget.style.background='none'}>
                          <span style={{ fontSize:16 }}>👤</span>
                          <div>
                            <p style={{ fontSize:12, fontWeight:700 }}>{c.name}</p>
                            {c.phone && <p style={{ fontSize:10, color:'#64748b' }}>{c.phone}</p>}
                          </div>
                          <span style={{ marginLeft:'auto', fontSize:10, color:'#3b82f6', fontWeight:600 }}>SELECT</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Discount */}
                <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                  <input value={disc} onChange={e=>setDisc(e.target.value)} placeholder="Discount (TZS)" type="number" style={{ flex:1, background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontSize:12 }}/>
                </div>

                {/* Brought By */}
                <div style={{ marginBottom:10 }}>
                  <p style={{ fontSize:10, color:'#64748b', letterSpacing:1, marginBottom:6 }}>👤 BROUGHT BY (OPTIONAL)</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom: broughtBy==='__custom__'?8:0 }}>
                    {[{v:'',l:'None'},...staffList.map(sf=>({v:sf.full_name,l:sf.full_name})),{v:'__custom__',l:'Other…'}].map(opt=>(
                      <button key={opt.v} onClick={()=>{setBroughtBy(opt.v);if(opt.v!=='__custom__')setBroughtByCustom('')}}
                        style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${broughtBy===opt.v?'#a78bfa':'#2d3f5e'}`, background:broughtBy===opt.v?'rgba(167,139,250,0.2)':'transparent', color:broughtBy===opt.v?'#a78bfa':'#64748b', fontWeight:broughtBy===opt.v?700:400, fontSize:11, cursor:'pointer' }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  {broughtBy==='__custom__'&&(
                    <input autoFocus value={broughtByCustom} onChange={e=>setBroughtByCustom(e.target.value)}
                      placeholder="Enter name (freelancer / other)"
                      style={{ width:'100%', background:'#1e2840', border:'1px solid #a78bfa', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontSize:12 }}/>
                  )}
                  {broughtBy&&broughtBy!=='__custom__'&&<p style={{ fontSize:10, color:'#a78bfa', marginTop:4 }}>Order brought by: <b>{broughtBy}</b></p>}
                  {broughtBy==='__custom__'&&broughtByCustom.trim()&&<p style={{ fontSize:10, color:'#a78bfa', marginTop:4 }}>Order brought by: <b>{broughtByCustom.trim()}</b></p>}
                </div>

                {/* Payment method */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
                  {['cash','mpesa','tigo','airtel','loan','bank'].map(m => (
                    <button key={m} onClick={()=>setPayMeth(m)} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${payMeth===m?'#3b82f6':'#2d3f5e'}`, background:payMeth===m?'rgba(59,130,246,0.2)':'transparent', color:payMeth===m?'#3b82f6':'#64748b', fontWeight:payMeth===m?700:400, fontSize:11, cursor:'pointer', textTransform:'uppercase' }}>{m}</button>
                  ))}
                </div>

                {/* Amount received */}
                {payMeth !== 'loan' && (
                  <div style={{ marginBottom:10 }}>
                    <input value={splitCashPaid} onChange={e=>setSplitCashPaid(e.target.value)} type="number" placeholder={`Amount received (default: ${fmt(finalTotal)})`} style={{ width:'100%', background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#34d399', padding:'8px 12px', fontSize:12, fontWeight:600 }}/>
                    {isSplit && <p style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>💸 Loan balance: {fmt(loanBalance)}</p>}
                  </div>
                )}

                {/* Totals */}
                <div style={{ background:'#1e2840', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
                  {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748b', marginBottom:4 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>}
                  {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#f87171', marginBottom:4 }}><span>Discount</span><span>-{fmt(discAmt)}</span></div>}
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:18, color:'#fff' }}><span>Total</span><span style={{ color:'#34d399' }}>{fmt(finalTotal)}</span></div>
                </div>

                <button onClick={completeSale} disabled={saving} style={{ width:'100%', padding:'14px', borderRadius:10, border:'none', background:saving?'#1e3a5f':'#3b82f6', color:'#fff', fontWeight:800, fontSize:16, cursor:saving?'not-allowed':'pointer', letterSpacing:0.3 }}>
                  {saving ? 'Processing...' : `Complete Sale · ${fmt(finalTotal)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUMMARY TAB */}
      {tab === 'summary' && (
        <div style={{ padding:'20px', maxWidth:900, margin:'0 auto' }}>
          {/* KPI Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 }}>
            {[
              { l:'Today', v:fmtK(todayTotal), sub:`${todayCount} sales`, c:'#3b82f6', bg:'rgba(59,130,246,0.1)', icon:'📅' },
              { l:'This Month', v:fmtK(monthTotal), sub:`${monthSales.length} sales`, c:'#34d399', bg:'rgba(52,211,153,0.1)', icon:'📆' },
              { l:'This Year', v:fmtK(yearTotal), sub:`${yearSales.length} sales`, c:'#a78bfa', bg:'rgba(167,139,250,0.1)', icon:'🗓️' },
            ].map(k => (
              <div key={k.l} style={{ background:k.bg, border:`1px solid ${k.c}30`, borderRadius:16, padding:'20px 18px' }}>
                <p style={{ fontSize:13, color:k.c, fontWeight:600, marginBottom:8 }}>{k.icon} {k.l}</p>
                <p style={{ fontSize:26, fontWeight:900, color:'#fff', marginBottom:2 }}>{k.v}</p>
                <p style={{ fontSize:12, color:'#64748b' }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Daily bar chart */}
          <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:16, padding:'20px', marginBottom:20 }}>
            <p style={{ fontSize:13, fontWeight:700, color:'#94a3b8', marginBottom:16, letterSpacing:0.5 }}>DAILY SALES — {new Date().toLocaleString('default',{month:'long'})} {new Date().getFullYear()}</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyChart} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <XAxis dataKey="day" tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
                <Tooltip contentStyle={{ background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0' }} formatter={v => [fmt(v),'Revenue']} labelFormatter={d=>`Day ${d}`}/>
                <Bar dataKey="total" fill="#3b82f6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly bar chart */}
          <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:16, padding:'20px' }}>
            <p style={{ fontSize:13, fontWeight:700, color:'#94a3b8', marginBottom:16, letterSpacing:0.5 }}>MONTHLY SALES — {thisYear}</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyChart} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <XAxis dataKey="month" tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
                <Tooltip contentStyle={{ background:'#1e2840', border:'1px solid #2d3f5e', borderRadius:8, color:'#e2e8f0' }} formatter={v=>[fmt(v),'Revenue']}/>
                <Bar dataKey="total" fill="#34d399" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={{ padding:'20px', maxWidth:900, margin:'0 auto' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#94a3b8', marginBottom:16, letterSpacing:0.5 }}>RECENT SALES</p>
          <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:16, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #1e2840' }}>
                  {['Date','Customer','Items','Payment','Total'].map(h => (
                    <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:10, color:'#475569', fontWeight:600, letterSpacing:0.8 }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.slice(0,50).map((s,i) => (
                  <tr key={s.id} style={{ borderBottom: i<49?'1px solid #1e2840':'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(30,40,64,0.5)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#64748b' }}>{s.sale_date||s.created_at?.split('T')[0]}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600 }}>{s.customers?.name||'Walk-in'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#64748b' }}>{(s.sale_items||[]).length} items</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:'rgba(59,130,246,0.15)', color:'#3b82f6', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{s.payment_method?.toUpperCase()}</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:14, fontWeight:800, color:'#34d399' }}>{fmt(s.total)}</td>
                  </tr>
                ))}
                {!sales.length && <tr><td colSpan={5} style={{ padding:'40px', textAlign:'center', color:'#475569' }}>No sales yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
