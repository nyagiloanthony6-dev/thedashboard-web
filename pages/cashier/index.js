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
  const [saleMode, setSaleMode] = useState('both')
  const [splitCashPaid, setSplitCashPaid] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [editingPrice, setEditingPrice] = useState({})
  const [staffList, setStaffList] = useState([])
  const [broughtBy, setBroughtBy] = useState('')
  const [broughtByCustom, setBroughtByCustom] = useState('')

  useEffect(() => { loadData() }, [])

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
    // Apply sale mode: auto-set posTab if shop only sells one type
    const mode = shopData.sale_mode || 'both'
    setSaleMode(mode)
    if (mode === 'wholesale') setPosTab('wholesale')
    else setPosTab('retail')
    const shopId = shopData.id
    const [pr, cf, sr] = await Promise.all([
      supabase.from('products').select('*,product_field_values(field_id,value)').eq('shop_id', shopId).eq('is_active', true).order('name'),
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopId),
      supabase.from('sales').select('*,sale_items(*)').eq('shop_id', shopId).eq('cashier_id', user.id).order('created_at', { ascending: false }).limit(200),
    ])
    const prodList = pr.data || []
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

  const searchCustomers = async (query, field) => {
    if (!query || query.length < 2 || !shop) { setCustSuggestions([]); setShowCustDrop(false); return }
    setCustSearching(true)
    try {
      let q = supabase.from('customers').select('id,name,phone,email').eq('shop_id', shop.id)
      if (field === 'phone') { q = q.ilike('phone', `%${query}%`) } else { q = q.ilike('name', `%${query}%`) }
      const { data } = await q.limit(6)
      setCustSuggestions(data || [])
      setShowCustDrop((data || []).length > 0)
    } catch (e) { }
    setCustSearching(false)
  }

  const selectCustomer = (c) => { setSelectedCustomer(c); setCustName(c.name || ''); setCustPhone(c.phone || ''); setCustSuggestions([]); setShowCustDrop(false) }
  const clearCustomer = () => { setSelectedCustomer(null); setCustName(''); setCustPhone(''); setCustSuggestions([]); setShowCustDrop(false) }

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

  const todaySales = sales.filter(s => s.sale_date === today())
  const todayTotal = todaySales.reduce((a, s) => a + (Number(s.total) || 0), 0)
  const todayCount = todaySales.length
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthSales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(thisMonth))
  const monthTotal = monthSales.reduce((a, s) => a + (Number(s.total) || 0), 0)
  const thisYear = new Date().getFullYear().toString()
  const yearSales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(thisYear))
  const yearTotal = yearSales.reduce((a, s) => a + (Number(s.total) || 0), 0)
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dailyChart = Array.from({ length: daysInMonth }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    const dateStr = `${thisMonth}-${d}`
    const daySales = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10)) === dateStr)
    return { day: i + 1, total: daySales.reduce((a, s) => a + (Number(s.total) || 0), 0) }
  })
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlyChart = months.map((m, mi) => {
    const prefix = `${thisYear}-${String(mi + 1).padStart(2, '0')}`
    const total = sales.filter(s => (s.sale_date || s.created_at?.slice(0, 10))?.startsWith(prefix)).reduce((a, s) => a + (Number(s.total) || 0), 0)
    return { month: m, total }
  })

  // Category icons mapping
  const catIcons = {
    'All': '⚡', 'Stabilizer Bushes': '🔧', 'Cleaner': '🧴', 'Air Filter': '💨',
    'Sealants': '🔩', 'Arm Bushes': '⚙️', 'Brake Pads': '🛑', 'Engine Mount': '🏗️',
    'Spark Plugs': '⚡', 'Oils & Lubricants': '🛢️', 'Oil Filters': '🔄', 'Bulbs & Lights': '💡',
    'Pressing': '🗜️', 'Car Parts': '🚗', 'Clips & Fasten': '📎',
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080c18' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, border:'3px solid #1a2236', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <p style={{ color:'#4a5568', fontFamily:'system-ui', fontSize:13 }}>Loading POS...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head><title>POS — {shop?.name}</title></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080c18; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-8px) } to { opacity:1; transform:translateX(0) } }
        input::placeholder { color: #374151 }
        input:focus { outline: none; }
        ::-webkit-scrollbar { width: 3px; height: 3px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #1e2840; border-radius: 2px }
        .prod-card:hover { border-color: #6366f1 !important; transform: translateY(-1px); background: rgba(99,102,241,0.08) !important; }
        .prod-card { transition: all 0.15s ease; }
        .cat-btn:hover { background: rgba(99,102,241,0.12) !important; color: #a5b4fc !important; }
        .nav-btn:hover { background: rgba(99,102,241,0.15) !important; }
      `}</style>

      {/* Toast */}
      {toast && <div style={{ position:'fixed', top:16, right:16, background:toast.c, color:'#000', padding:'10px 20px', borderRadius:12, fontWeight:700, fontSize:13, zIndex:9999, animation:'fadeIn 0.2s', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>{toast.msg}</div>}

      {/* Receipt Modal */}
      {receipt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16, backdropFilter:'blur(4px)' }} onClick={e => e.target===e.currentTarget && setReceipt(null)}>
          <div style={{ background:'#fff', borderRadius:20, padding:'32px 28px', width:'100%', maxWidth:380, color:'#111', animation:'fadeIn 0.2s', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ textAlign:'center', marginBottom:20, paddingBottom:16, borderBottom:'2px dashed #e5e7eb' }}>
              <div style={{ width:44, height:44, background:'#4f46e5', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px', fontSize:20 }}>🧾</div>
              <p style={{ fontSize:17, fontWeight:900, letterSpacing:-0.5 }}>{shop?.name}</p>
              <p style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Receipt #{receipt.id}</p>
              <p style={{ fontSize:11, color:'#9ca3af' }}>{receipt.date.toLocaleString()}</p>
            </div>
            {receipt.items.map((it, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:10, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:600 }}>{it.name} × {it.qty}</p>
                  {it.pn && <p style={{ fontSize:10, color:'#9ca3af', fontFamily:'monospace' }}>#{it.pn}</p>}
                </div>
                <p style={{ fontSize:13, fontWeight:700 }}>{fmt(it.total)}</p>
              </div>
            ))}
            <div style={{ borderTop:'2px dashed #e5e7eb', paddingTop:14, marginTop:8 }}>
              {receipt.discount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'#6b7280' }}><span>Discount</span><span>-{fmt(receipt.discount)}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:18 }}><span>TOTAL</span><span style={{ color:'#4f46e5' }}>{fmt(receipt.total)}</span></div>
              {receipt.isSplit ? (
                <div style={{ marginTop:10, padding:'10px 14px', background:'#fefce8', borderRadius:10, border:'1px solid #fde68a' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#16a34a' }}><span>Cash Paid</span><span style={{ fontWeight:700 }}>{fmt(receipt.cashPaid)}</span></div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#dc2626', marginTop:4 }}><span>Balance Due</span><span style={{ fontWeight:700 }}>{fmt(receipt.loanBalance)}</span></div>
                </div>
              ) : (
                <p style={{ fontSize:12, color:'#9ca3af', marginTop:6 }}>Paid via {receipt.payMeth?.toUpperCase()}</p>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => window.print()} style={{ flex:1, padding:'11px', borderRadius:10, border:'1.5px solid #e5e7eb', background:'#f9fafb', color:'#374151', fontWeight:600, fontSize:13, cursor:'pointer' }}>🖨️ Print</button>
              <button onClick={() => setReceipt(null)} style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:'#4f46e5', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>Done ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT STYLES ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-receipt, #print-receipt * { visibility: visible !important; }
          #print-receipt { position: fixed; left: 0; top: 0; width: 80mm; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>

      {/* ── HIDDEN PRINT RECEIPT ── */}
      {receipt && (
        <div id="print-receipt" style={{ display:'none' }}>
          <style>{`
            #print-receipt { font-family: 'Courier New', monospace; font-size: 11px; color: #000; padding: 8px 10px; width: 80mm; }
            #print-receipt .center { text-align: center; }
            #print-receipt .bold { font-weight: bold; }
            #print-receipt .large { font-size: 15px; }
            #print-receipt .xlarge { font-size: 18px; }
            #print-receipt .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            #print-receipt .sep-solid { border: none; border-top: 1px solid #000; margin: 6px 0; }
            #print-receipt .row { display: flex; justify-content: space-between; margin: 3px 0; }
            #print-receipt .muted { color: #555; }
            #print-receipt .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin: 4px 0; }
            #print-receipt .footer { text-align: center; margin-top: 10px; font-size: 10px; color: #555; }
            @media print {
              #print-receipt { display: block !important; }
            }
          `}</style>

          {/* Shop header */}
          <div className="center bold large">{shop?.name}</div>
          {shop?.address && <div className="center muted" style={{ fontSize:10, marginTop:2 }}>{shop.address}</div>}
          <div className="center" style={{ fontSize:10, marginTop:2 }}>
            {[shop?.phone, shop?.email].filter(Boolean).join('  |  ')}
          </div>

          <hr className="sep-solid" />

          {/* Receipt meta */}
          <div className="center bold">RECEIPT</div>
          <div className="row muted" style={{ fontSize:10, marginTop:4 }}>
            <span>#{receipt.id}</span>
            <span>{receipt.date.toLocaleDateString('en-GB')} {receipt.date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</span>
          </div>
          {receipt.customer !== 'Walk-in' && (
            <div className="row" style={{ fontSize:10, marginTop:2 }}>
              <span className="muted">Customer:</span>
              <span className="bold">{receipt.customer}</span>
            </div>
          )}
          {receipt.payMeth && (
            <div className="row" style={{ fontSize:10 }}>
              <span className="muted">Payment:</span>
              <span className="bold">{(receipt.isSplit ? 'SPLIT' : receipt.payMeth).toUpperCase()}</span>
            </div>
          )}

          <hr className="sep" />

          {/* Items */}
          <div className="bold" style={{ fontSize:10, marginBottom:4 }}>ITEMS</div>
          {receipt.items.map((it, i) => (
            <div key={i} style={{ marginBottom:4 }}>
              <div style={{ fontWeight:'bold', fontSize:11 }}>{it.name}</div>
              {it.pn && <div className="muted" style={{ fontSize:9 }}>Part#: {it.pn}</div>}
              <div className="row" style={{ fontSize:11 }}>
                <span className="muted">{it.qty} × {it.price?.toLocaleString()}</span>
                <span className="bold">{it.total?.toLocaleString()}</span>
              </div>
            </div>
          ))}

          <hr className="sep" />

          {/* Totals */}
          {receipt.discount > 0 && (
            <div className="row muted" style={{ fontSize:11 }}>
              <span>Subtotal</span>
              <span>{receipt.subtotal?.toLocaleString()}</span>
            </div>
          )}
          {receipt.discount > 0 && (
            <div className="row muted" style={{ fontSize:11 }}>
              <span>Discount</span>
              <span>-{receipt.discount?.toLocaleString()}</span>
            </div>
          )}
          <div className="total-row">
            <span>TOTAL ({shop?.currency || 'TZS'})</span>
            <span>{receipt.total?.toLocaleString()}</span>
          </div>

          {receipt.isSplit && (
            <div style={{ marginTop:4, fontSize:11 }}>
              <div className="row">
                <span>Cash Paid</span>
                <span>{receipt.cashPaid?.toLocaleString()}</span>
              </div>
              <div className="row bold">
                <span>Balance Due</span>
                <span>{receipt.loanBalance?.toLocaleString()}</span>
              </div>
            </div>
          )}

          <hr className="sep-solid" />

          {/* Footer */}
          <div className="footer">
            <div>Thank you for your business!</div>
            <div style={{ marginTop:4 }}>Visit us again soon.</div>
            {shop?.phone && <div style={{ marginTop:4 }}>{shop.phone}</div>}
            <div style={{ marginTop:8, fontSize:9, letterSpacing:0.5 }}>— Powered by TheDashboard —</div>
            <div style={{ fontSize:9, color:'#888' }}>thedashboard.co.tz</div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ background:'#0d1120', borderBottom:'1px solid #1a2236', padding:'0 20px', display:'flex', justifyContent:'space-between', alignItems:'center', height:56, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:34, height:34, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color:'#fff', boxShadow:'0 2px 8px rgba(99,102,241,0.4)' }}>
            {shop?.name?.charAt(0)}
          </div>
          <div>
            <p style={{ fontWeight:700, fontSize:14, letterSpacing:-0.3 }}>{shop?.name}</p>
            <p style={{ fontSize:10, color:'#4b5563', letterSpacing:0.3 }}>{profile?.full_name} · Cashier</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[['pos','🛒','POS'], ['summary','📊','Summary'], ['history','📋','History']].map(([k, ic, l]) => (
            <button key={k} onClick={() => setTab(k)} className="nav-btn" style={{ padding:'7px 14px', borderRadius:8, border:'none', background: tab===k ? 'rgba(99,102,241,0.2)' : 'transparent', color: tab===k ? '#a5b4fc' : '#6b7280', fontWeight: tab===k ? 700 : 400, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5, borderBottom: tab===k ? '2px solid #6366f1' : '2px solid transparent' }}>{ic} {l}</button>
          ))}
          <div style={{ width:1, background:'#1a2236', margin:'8px 6px' }} />
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/auth/login'))} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #1a2236', background:'transparent', color:'#4b5563', fontSize:11, cursor:'pointer' }}>Exit</button>
        </div>
      </div>

      {/* ── POS TAB ── */}
      {tab === 'pos' && (
        <div style={{ display:'flex', height:'calc(100vh - 56px)' }}>

          {/* ── LEFT CATEGORY SIDEBAR ── */}
          <div style={{ width:160, background:'#0a0f1e', borderRight:'1px solid #1a2236', display:'flex', flexDirection:'column', flexShrink:0, overflowY:'auto' }}>
            <div style={{ padding:'12px 10px 8px', borderBottom:'1px solid #1a2236' }}>
              <p style={{ fontSize:9, color:'#374151', letterSpacing:1.5, fontWeight:700, textTransform:'uppercase' }}>Categories</p>
            </div>
            <div style={{ padding:'8px 6px', flex:1 }}>
              {categories.map(c => {
                const isActive = cat === c
                const icon = catIcons[c] || '📦'
                const count = c === 'All' ? products.filter(p => {
                  const stock = posTab === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
                  return stock > 0
                }).length : products.filter(p => {
                  const stock = posTab === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
                  return stock > 0 && p.category === c
                }).length
                return (
                  <button key={c} onClick={() => { setCat(c); setSearch('') }} className="cat-btn"
                    style={{ width:'100%', display:'flex', flexDirection:'column', alignItems:'flex-start', padding:'9px 10px', borderRadius:10, border:'none', background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent', cursor:'pointer', marginBottom:2, textAlign:'left', borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent', animation:'slideIn 0.15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, width:'100%' }}>
                      <span style={{ fontSize:14 }}>{icon}</span>
                      <span style={{ fontSize:11, fontWeight: isActive ? 700 : 500, color: isActive ? '#a5b4fc' : '#6b7280', lineHeight:1.2, flex:1 }}>{c}</span>
                    </div>
                    <span style={{ fontSize:9, color: isActive ? '#6366f1' : '#374151', marginTop:3, marginLeft:21, fontWeight:600 }}>{count} items</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── CENTER: Search + Products ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Search bar + Retail/Wholesale toggle */}
            <div style={{ padding:'10px 14px', background:'#0a0f1e', borderBottom:'1px solid #1a2236', display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ flex:1, position:'relative' }}>
                <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#374151' }}>🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search products or part number..."
                  style={{ width:'100%', background:'#111827', border:'1px solid #1f2937', borderRadius:10, color:'#e2e8f0', padding:'9px 14px 9px 34px', fontSize:13 }}
                />
                {search && <button onClick={() => setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:14 }}>✕</button>}
              </div>
              {saleMode === 'both' && (
                <div style={{ display:'flex', background:'#111827', borderRadius:10, border:'1px solid #1f2937', overflow:'hidden', flexShrink:0 }}>
                  {[{k:'retail',l:'Retail'},{k:'wholesale',l:'Wholesale'}].map(t => (
                    <button key={t.k} onClick={() => setPosTab(t.k)} style={{ padding:'9px 16px', border:'none', background: posTab===t.k ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent', color: posTab===t.k ? '#fff' : '#6b7280', fontWeight: posTab===t.k ? 700 : 400, fontSize:12, cursor:'pointer' }}>{t.l}</button>
                  ))}
                </div>
              )}
              {saleMode !== 'both' && (
                <div style={{ padding:'7px 14px', background:'rgba(99,102,241,0.12)', borderRadius:10, border:'1px solid rgba(99,102,241,0.25)', fontSize:12, fontWeight:700, color:'#a5b4fc', flexShrink:0 }}>
                  {saleMode === 'retail' ? '🏪 Retail' : '📦 Wholesale'}
                </div>
              )}
            </div>

            {/* Category label + product count */}
            <div style={{ padding:'8px 14px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14 }}>{catIcons[cat] || '📦'}</span>
                <span style={{ fontSize:12, fontWeight:700, color:'#9ca3af' }}>{cat}</span>
              </div>
              <span style={{ fontSize:11, color:'#374151' }}>{filtProds.length} products</span>
            </div>

            {/* Product grid */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, alignContent:'start' }}>
              {filtProds.map(p => {
                const price = posTab==='wholesale' ? (p.wholesale_price||0) : (p.sell_price||0)
                const stock = posTab==='wholesale' ? (p.wholesale_stock||0) : (p.retail_stock||p.stock||0)
                const pn = partField && p._cfv?.[partField.id]
                const inCart = cart.find(c => c.id===p.id && c.sale_type===(posTab==='wholesale'?'wholesale':'retail'))
                return (
                  <button key={p.id} onClick={() => addToCart(p)} className="prod-card"
                    style={{ background: inCart ? 'rgba(99,102,241,0.12)' : '#0d1120', border: `1.5px solid ${inCart?'#6366f1':'#1a2236'}`, borderRadius:14, padding:'14px 12px', textAlign:'left', cursor:'pointer', position:'relative' }}>
                    {inCart && (
                      <div style={{ position:'absolute', top:8, right:8, minWidth:22, height:22, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff', padding:'0 5px', boxShadow:'0 2px 8px rgba(99,102,241,0.5)' }}>{inCart.qty}</div>
                    )}
                    <div style={{ fontSize:26, marginBottom:8, lineHeight:1 }}>{p.image_emoji||'📦'}</div>
                    <p style={{ fontSize:12, fontWeight:600, color:'#d1d5db', lineHeight:1.3, marginBottom:3 }}>{p.name}</p>
                    {pn && <p style={{ fontSize:9, color:'#6366f1', fontFamily:'monospace', marginBottom:5, letterSpacing:0.5 }}>#{pn}</p>}
                    <p style={{ fontSize:14, fontWeight:800, color:'#34d399', letterSpacing:-0.3 }}>{fmt(price)}</p>
                    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                      <div style={{ width:5, height:5, borderRadius:'50%', background: stock > 10 ? '#34d399' : stock > 0 ? '#f59e0b' : '#ef4444' }} />
                      <p style={{ fontSize:9, color:'#4b5563' }}>{stock} in stock</p>
                    </div>
                  </button>
                )
              })}
              {!filtProds.length && (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'80px 20px', color:'#374151' }}>
                  <p style={{ fontSize:36 }}>📦</p>
                  <p style={{ marginTop:12, fontSize:14, fontWeight:600, color:'#4b5563' }}>No products found</p>
                  <p style={{ fontSize:12, color:'#374151', marginTop:4 }}>{search ? 'Try a different search' : 'No stock in this category'}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Cart ── */}
          <div style={{ width:320, background:'#0a0f1e', borderLeft:'1px solid #1a2236', display:'flex', flexDirection:'column', flexShrink:0 }}>
            {/* Cart header */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #1a2236', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:16 }}>🛒</span>
                <p style={{ fontWeight:700, fontSize:14 }}>Cart</p>
                {cart.length > 0 && <span style={{ background:'rgba(99,102,241,0.2)', color:'#a5b4fc', borderRadius:20, padding:'1px 8px', fontSize:11, fontWeight:700 }}>{cart.length}</span>}
              </div>
              {cart.length > 0 && <button onClick={() => setCart([])} style={{ fontSize:11, color:'#ef4444', background:'rgba(239,68,68,0.1)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer' }}>Clear</button>}
            </div>

            {/* Cart items */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 12px' }}>
              {cart.length === 0 && (
                <div style={{ textAlign:'center', padding:'50px 0', color:'#374151' }}>
                  <p style={{ fontSize:36 }}>🛒</p>
                  <p style={{ fontSize:13, marginTop:10, color:'#4b5563', fontWeight:600 }}>Cart is empty</p>
                  <p style={{ fontSize:11, marginTop:4 }}>Tap a product to add</p>
                </div>
              )}
              {cart.map((item, i) => {
                const pn = partField && item._cfv?.[partField.id]
                const epKey = item.id+item.sale_type
                const isEditingPrice = editingPrice.hasOwnProperty(epKey)
                return (
                  <div key={epKey} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid #111827' }}>
                    <span style={{ fontSize:20, flexShrink:0 }}>{item.image_emoji||'📦'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#d1d5db' }}>{item.name}</p>
                      {pn && <p style={{ fontSize:9, color:'#6366f1', fontFamily:'monospace' }}>#{pn}</p>}
                      <p style={{ fontSize:10, color:'#4b5563', marginTop:1 }}>{fmt(item.sell_price)} each</p>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
                      {isEditingPrice ? (
                        <input type="number" autoFocus value={editingPrice[epKey]}
                          onChange={e=>setEditingPrice(p=>({...p,[epKey]:e.target.value}))}
                          onBlur={()=>{
                            const newPrice = parseFloat(editingPrice[epKey])
                            const floor = item.min_sell_price
                            if (isNaN(newPrice) || newPrice <= 0) { setEditingPrice(p=>{const n={...p};delete n[epKey];return n}); return }
                            if (floor != null && newPrice < floor) { alert(`Minimum price for ${item.name} is ${fmt(floor)}`); setEditingPrice(p=>{const n={...p};delete n[epKey];return n}); return }
                            setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,sell_price:newPrice}:c))
                            setEditingPrice(p=>{const n={...p};delete n[epKey];return n})
                          }}
                          onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape'){setEditingPrice(p=>{const n={...p};delete n[epKey];return n})}}}
                          style={{ width:72,height:24,borderRadius:6,border:'1px solid #f59e0b',background:'#111827',color:'#fbbf24',fontSize:12,fontWeight:700,textAlign:'right',padding:'0 6px' }}
                        />
                      ) : (
                        <p onClick={()=>setEditingPrice(p=>({...p,[epKey]:String(item.sell_price)}))} title="Click to edit price"
                          style={{ fontSize:13, fontWeight:800, color:'#34d399', cursor:'pointer', borderBottom:'1px dashed rgba(52,211,153,0.4)' }}>{fmt(item.sell_price*item.qty)}</p>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <button onClick={()=>setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:Math.max(1,c.qty-1)}:c))} style={{ width:22,height:22,borderRadius:6,border:'1px solid #1f2937',background:'#111827',color:'#9ca3af',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                        <input type="number" min="1" value={item.qty}
                          onChange={e=>{const v=parseInt(e.target.value)||1;setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:Math.max(1,v)}:c))}}
                          style={{ width:38,height:22,borderRadius:6,border:'1px solid #6366f1',background:'#111827',color:'#e2e8f0',fontSize:12,fontWeight:700,textAlign:'center',padding:0 }}
                        />
                        <button onClick={()=>setCart(p=>p.map(c=>c.id===item.id&&c.sale_type===item.sale_type?{...c,qty:c.qty+1}:c))} style={{ width:22,height:22,borderRadius:6,border:'1px solid #1f2937',background:'#111827',color:'#9ca3af',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                        <button onClick={()=>setCart(p=>p.filter(c=>!(c.id===item.id&&c.sale_type===item.sale_type)))} style={{ width:22,height:22,borderRadius:6,border:'none',background:'rgba(239,68,68,0.12)',color:'#ef4444',fontSize:11,cursor:'pointer',marginLeft:2 }}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order summary + checkout */}
            {cart.length > 0 && (
              <div style={{ padding:'12px 14px', borderTop:'1px solid #1a2236', background:'#0a0f1e' }}>
                {/* Customer */}
                <div style={{ position:'relative', marginBottom:8 }} ref={custSearchRef}>
                  {selectedCustomer ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.25)', borderRadius:10, padding:'8px 10px' }}>
                      <span style={{ fontSize:14 }}>👤</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:700, color:'#34d399', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selectedCustomer.name}</p>
                        {selectedCustomer.phone && <p style={{ fontSize:10, color:'#4b5563' }}>{selectedCustomer.phone}</p>}
                      </div>
                      <button onClick={clearCustomer} style={{ background:'none', border:'none', color:'#4b5563', fontSize:14, cursor:'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6 }}>
                      <input value={custName} onChange={e => { setCustName(e.target.value); searchCustomers(e.target.value, 'name') }} onFocus={() => custName.length >= 2 && custSuggestions.length > 0 && setShowCustDrop(true)} placeholder="Customer name" style={{ flex:1, background:'#111827', border:'1px solid #1f2937', borderRadius:8, color:'#e2e8f0', padding:'7px 10px', fontSize:12 }}/>
                      <input value={custPhone} onChange={e => { setCustPhone(e.target.value); searchCustomers(e.target.value, 'phone') }} placeholder="Phone" style={{ width:90, background:'#111827', border:'1px solid #1f2937', borderRadius:8, color:'#e2e8f0', padding:'7px 8px', fontSize:12 }}/>
                    </div>
                  )}
                  {showCustDrop && custSuggestions.length > 0 && (
                    <div ref={custDropRef} style={{ position:'absolute', bottom:'100%', left:0, right:0, background:'#111827', border:'1px solid #6366f1', borderRadius:10, marginBottom:4, zIndex:200, overflow:'hidden', boxShadow:'0 -8px 24px rgba(0,0,0,0.5)' }}>
                      {custSuggestions.map(c => (
                        <button key={c.id} onMouseDown={() => selectCustomer(c)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'none', border:'none', borderBottom:'1px solid #1f2937', color:'#e2e8f0', cursor:'pointer', textAlign:'left' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(99,102,241,0.12)'}
                          onMouseLeave={e => e.currentTarget.style.background='none'}>
                          <span>👤</span>
                          <div><p style={{ fontSize:12, fontWeight:700 }}>{c.name}</p>{c.phone && <p style={{ fontSize:10, color:'#4b5563' }}>{c.phone}</p>}</div>
                          <span style={{ marginLeft:'auto', fontSize:10, color:'#6366f1', fontWeight:700 }}>SELECT</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Discount */}
                <input value={disc} onChange={e=>setDisc(e.target.value)} placeholder="Discount (TZS)" type="number" style={{ width:'100%', background:'#111827', border:'1px solid #1f2937', borderRadius:8, color:'#fbbf24', padding:'7px 10px', fontSize:12, marginBottom:8 }}/>

                {/* Brought By */}
                <div style={{ marginBottom:8 }}>
                  <p style={{ fontSize:9, color:'#374151', letterSpacing:1.2, marginBottom:5, fontWeight:700 }}>👤 BROUGHT BY</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom: broughtBy==='__custom__'?6:0 }}>
                    {[{v:'',l:'None'},...staffList.map(sf=>({v:sf.full_name,l:sf.full_name})),{v:'__custom__',l:'Other…'}].map(opt=>(
                      <button key={opt.v} onClick={()=>{setBroughtBy(opt.v);if(opt.v!=='__custom__')setBroughtByCustom('')}}
                        style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${broughtBy===opt.v?'#8b5cf6':'#1f2937'}`, background:broughtBy===opt.v?'rgba(139,92,246,0.18)':'transparent', color:broughtBy===opt.v?'#c4b5fd':'#4b5563', fontWeight:broughtBy===opt.v?700:400, fontSize:10, cursor:'pointer' }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  {broughtBy==='__custom__'&&<input autoFocus value={broughtByCustom} onChange={e=>setBroughtByCustom(e.target.value)} placeholder="Enter name" style={{ width:'100%', background:'#111827', border:'1px solid #8b5cf6', borderRadius:8, color:'#e2e8f0', padding:'7px 10px', fontSize:12 }}/>}
                </div>

                {/* Payment method */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                  {['cash','mpesa','tigo','airtel','loan','bank'].map(m => (
                    <button key={m} onClick={()=>setPayMeth(m)} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${payMeth===m?'#6366f1':'#1f2937'}`, background:payMeth===m?'rgba(99,102,241,0.18)':'transparent', color:payMeth===m?'#a5b4fc':'#4b5563', fontWeight:payMeth===m?700:400, fontSize:10, cursor:'pointer', textTransform:'uppercase' }}>{m}</button>
                  ))}
                </div>

                {/* Amount received */}
                {payMeth !== 'loan' && (
                  <div style={{ marginBottom:8 }}>
                    <input value={splitCashPaid} onChange={e=>setSplitCashPaid(e.target.value)} type="number" placeholder={`Amount received (default: ${fmt(finalTotal)})`} style={{ width:'100%', background:'#111827', border:'1px solid #1f2937', borderRadius:8, color:'#34d399', padding:'7px 10px', fontSize:12 }}/>
                    {isSplit && <p style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>💸 Loan balance: {fmt(loanBalance)}</p>}
                  </div>
                )}

                {/* Total */}
                <div style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))', border:'1px solid rgba(99,102,241,0.2)', borderRadius:12, padding:'10px 14px', marginBottom:10 }}>
                  {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#4b5563', marginBottom:4 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>}
                  {discAmt>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#f87171', marginBottom:4 }}><span>Discount</span><span>-{fmt(discAmt)}</span></div>}
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:20, color:'#fff' }}><span>Total</span><span style={{ color:'#34d399' }}>{fmt(finalTotal)}</span></div>
                </div>

                <button onClick={completeSale} disabled={saving} style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background: saving ? '#1f2937' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:800, fontSize:15, cursor:saving?'not-allowed':'pointer', letterSpacing:0.3, boxShadow: saving ? 'none' : '0 4px 16px rgba(99,102,241,0.4)' }}>
                  {saving ? '⏳ Processing...' : `Complete Sale · ${fmt(finalTotal)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div style={{ padding:'24px', maxWidth:960, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:28 }}>
            {[
              { l:'Today', v:fmtK(todayTotal), sub:`${todayCount} sales`, c:'#6366f1', bg:'rgba(99,102,241,0.08)', icon:'📅' },
              { l:'This Month', v:fmtK(monthTotal), sub:`${monthSales.length} sales`, c:'#34d399', bg:'rgba(52,211,153,0.08)', icon:'📆' },
              { l:'This Year', v:fmtK(yearTotal), sub:`${yearSales.length} sales`, c:'#a78bfa', bg:'rgba(167,139,250,0.08)', icon:'🗓️' },
            ].map(k => (
              <div key={k.l} style={{ background:k.bg, border:`1px solid ${k.c}25`, borderRadius:18, padding:'22px 20px', borderTop:`3px solid ${k.c}` }}>
                <p style={{ fontSize:12, color:k.c, fontWeight:600, marginBottom:10 }}>{k.icon} {k.l}</p>
                <p style={{ fontSize:28, fontWeight:900, color:'#fff', marginBottom:4, letterSpacing:-1 }}>{k.v}</p>
                <p style={{ fontSize:12, color:'#4b5563' }}>{k.sub}</p>
              </div>
            ))}
          </div>
          <div style={{ background:'#0d1120', border:'1px solid #1a2236', borderRadius:18, padding:'22px', marginBottom:16 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#6b7280', marginBottom:16, letterSpacing:1 }}>DAILY SALES — {new Date().toLocaleString('default',{month:'long'})} {new Date().getFullYear()}</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyChart} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <XAxis dataKey="day" tick={{ fill:'#374151', fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'#374151', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
                <Tooltip contentStyle={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, color:'#e2e8f0' }} formatter={v => [fmt(v),'Revenue']} labelFormatter={d=>`Day ${d}`}/>
                <Bar dataKey="total" fill="#6366f1" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background:'#0d1120', border:'1px solid #1a2236', borderRadius:18, padding:'22px' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#6b7280', marginBottom:16, letterSpacing:1 }}>MONTHLY SALES — {thisYear}</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyChart} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <XAxis dataKey="month" tick={{ fill:'#374151', fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'#374151', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
                <Tooltip contentStyle={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, color:'#e2e8f0' }} formatter={v=>[fmt(v),'Revenue']}/>
                <Bar dataKey="total" fill="#34d399" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div style={{ padding:'24px', maxWidth:960, margin:'0 auto' }}>
          <p style={{ fontSize:12, fontWeight:700, color:'#6b7280', marginBottom:16, letterSpacing:1 }}>RECENT SALES</p>
          <div style={{ background:'#0d1120', border:'1px solid #1a2236', borderRadius:18, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #1a2236', background:'rgba(99,102,241,0.06)' }}>
                  {['Date','Customer','Items','Payment','Total'].map(h => (
                    <th key={h} style={{ padding:'13px 16px', textAlign:'left', fontSize:10, color:'#4b5563', fontWeight:700, letterSpacing:1 }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.slice(0,50).map((s,i) => (
                  <tr key={s.id} style={{ borderBottom: i<49?'1px solid #111827':'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.05)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#4b5563' }}>{s.sale_date||s.created_at?.split('T')[0]}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600 }}>{s.customers?.name||'Walk-in'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#4b5563' }}>{(s.sale_items||[]).length} items</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:'rgba(99,102,241,0.15)', color:'#a5b4fc', borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{s.payment_method?.toUpperCase()}</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:14, fontWeight:800, color:'#34d399' }}>{fmt(s.total)}</td>
                  </tr>
                ))}
                {!sales.length && <tr><td colSpan={5} style={{ padding:'50px', textAlign:'center', color:'#374151' }}>No sales yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
