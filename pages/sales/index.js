import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'
import { loadModules, storeSell, storeReleaseForSale } from '../../lib/store'
import ReleaseSlipModal from '../../components/store/ReleaseSlipModal'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Sales() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [prods, setProds] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  // POS state
  const [tab, setTab] = useState('pos')
  const [posTab, setPosTab] = useState('retail')
  const [cart, setCart] = useState([])
  const [searchQ, setSearchQ] = useState('')
  const [cat, setCat] = useState('All')
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [selCust, setSelCust] = useState(null)
  const [custSearch, setCustSearch] = useState('')
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [payMeth, setPayMeth] = useState('cash')
  const [disc, setDisc] = useState('')
  const [discType, setDiscType] = useState('amount')
  const [transportFee, setTransportFee] = useState('')
  const [transportDest, setTransportDest] = useState('')
  const [splitCashPaid, setSplitCashPaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [receipt, setReceipt] = useState(null)
  // TheDashboard Store: record sales in the stock history / collect from store
  const [storeOn, setStoreOn] = useState(false)
  const [collectStore, setCollectStore] = useState(false)
  const [slip, setSlip] = useState(null)
  const [pendingReceipt, setPendingReceipt] = useState(null)

  // Brought By
  const [staffList, setStaffList] = useState([])
  const [broughtBy, setBroughtBy] = useState('')
  const [broughtByCustom, setBroughtByCustom] = useState('')

  // Bulk order
  const [bulkText, setBulkText] = useState('')
  const [bulkParsed, setBulkParsed] = useState([])
  const [bulkError, setBulkError] = useState('')
  const [bulkParsing, setBulkParsing] = useState(false)

  // Sales history
  const [period, setPeriod] = useState('today')
  const [saleDetail, setSaleDetail] = useState(null)
  const [selectedPerson, setSelectedPerson] = useState(null)

  // Brought By targets
  const [bbTargets, setBbTargets] = useState({}) // { [name]: { weekly, monthly } }
  const [editingTarget, setEditingTarget] = useState(null) // name being edited
  const [targetInput, setTargetInput] = useState('') // weekly target input value

  useEffect(() => { loadData() }, [])

  const showToast = (msg, color = '#2D2F8F') => {
    setToast({ msg, color })
    setTimeout(() => setToast(''), 3000)
  }

  const parseBulkOrder = () => {
    setBulkError(''); setBulkParsed([])
    if (!bulkText.trim()) { setBulkError('Paste your order list first'); return }
    const lines = bulkText.trim().split('\n').filter(l => l.trim())
    const results = []
    const notFound = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let qty = 1, name = trimmed

      // Format 1: Tab-separated "48702-60050\t10"
      if (trimmed.includes('\t')) {
        const parts = trimmed.split('\t')
        name = parts[0].trim()
        qty = parts[1] && /^\d+$/.test(parts[1].trim()) ? parseInt(parts[1].trim()) : 1
      }
      // Format 2: "10 Brake Pad" or "10x Brake Pad" (starts with number then text)
      else if (/^\d+[x× ]+[^\d]/.test(trimmed)) {
        const m = trimmed.match(/^(\d+)[x× ]+(.+)$/)
        if (m) { qty = parseInt(m[1]); name = m[2].trim() }
      }
      // Format 3: "Brake Pad x10" or "Brake Pad 10" (ends with number, name is not a part number)
      else if (/^(.+?)\s+[x×]?(\d+)\s*$/.test(trimmed) && !/^[\d]+-[\d]+$/.test(trimmed)) {
        const m = trimmed.match(/^(.+?)\s+[x×]?(\d+)\s*$/)
        if (m) { qty = parseInt(m[2]); name = m[1].trim() }
      }
      // Format 4: Pure part number or name (no qty) - e.g. "48702-60050" or "Brake Pad"
      // qty stays 1, name stays as-is

      // Search: exact part number first, then partial, then name
      const q = name.toLowerCase().trim()

      // 1. Exact part number match (highest priority)
      let match = prods.find(p =>
        Object.values(p._cfv || {}).some(v => String(v).toLowerCase() === q)
      )
      // 2. Partial part number match (part number contains search or vice versa)
      if (!match) match = prods.find(p =>
        Object.values(p._cfv || {}).some(v => {
          const pn = String(v).toLowerCase()
          return pn.includes(q) || q.includes(pn)
        })
      )
      // 3. Exact product name match
      if (!match) match = prods.find(p => p.name.toLowerCase() === q)
      // 4. Partial product name match
      if (!match) match = prods.find(p =>
        p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())
      )
      // 5. Debug: if still not found, log what _cfv values exist
      if (!match) {
        const sample = prods.slice(0,3).map(p => ({name:p.name, cfv:Object.values(p._cfv||{})}))
        console.log('No match for:', q, '| Sample _cfv:', JSON.stringify(sample))
      }

      if (match) {
        // Use wholesale price if retail is 0, and vice versa
        const retailPrice = match.sell_price || 0
        const wholesalePrice = match.wholesale_price || 0
        const isWholesaleTab = posTab === 'wholesale'
        const bestPrice = isWholesaleTab
          ? (wholesalePrice || retailPrice)
          : (retailPrice || wholesalePrice)
        const saleType = isWholesaleTab || (retailPrice === 0 && wholesalePrice > 0) ? 'wholesale' : 'retail'

        // Check available stock
        const availStock = saleType === 'wholesale'
          ? (match.wholesale_stock || 0)
          : (match.retail_stock || match.stock || 0)

        if (availStock <= 0) {
          notFound.push(match.name + ' (no stock)')
        } else {
          const existing = results.find(r => r.id === match.id)
          if (existing) existing.qty = Math.min(existing.qty + qty, availStock)
          else results.push({ ...match, qty: Math.min(qty, availStock), sell_price: bestPrice, sale_type: saleType, stock: availStock })
        }
      } else {
        notFound.push(name)
      }
    }

    setBulkParsed(results)
    if (notFound.length) setBulkError('Not found / out of stock: ' + notFound.join(', '))
  }

  const addBulkToCart = () => {
    if (!bulkParsed.length) return
    setCart(prev => {
      let updated = [...prev]
      for (const item of bulkParsed) {
        const ex = updated.find(c => c.id === item.id && c.sale_type === item.sale_type)
        if (ex) updated = updated.map(c => c.id === item.id && c.sale_type === item.sale_type ? { ...c, qty: c.qty + item.qty } : c)
        else updated.push(item)
      }
      return updated
    })
    setBulkText(''); setBulkParsed([]); setBulkError('')
    setTab('pos')
    showToast(bulkParsed.length + ' items added to cart')
  }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    loadModules(shopId).then(m => setStoreOn(m.kibali))

    const { data: sfData } = await supabase.from('app_users').select('id,full_name').eq('shop_id', shopId).eq('show_in_brought_by', true).order('full_name')
    setStaffList((sfData || []).filter(u => u.full_name))

    const [pr, cf, cu, sr] = await Promise.all([
      supabase.from('products').select('*').eq('shop_id', shopId).eq('is_active', true).order('name'),
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopId),
      supabase.from('customers').select('*').eq('shop_id', shopId).order('name'),
      supabase.from('sales').select('*,customers(name,phone),sale_items(qty,unit_price,line_total,line_profit,product_name,products(name,image_emoji,category))').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(500),
    ])

    const prodList = pr.data || []
    if (prodList.length) {
      const { data: cfv } = await supabase.from('product_field_values').select('*').in('product_id', prodList.map(p => p.id))
      const map = {}
      ;(cfv || []).forEach(v => { if (!map[v.product_id]) map[v.product_id] = {}; map[v.product_id][v.field_id] = v.value })
      prodList.forEach(p => { p._cfv = map[p.id] || {} })
    }
    setProds(prodList)
    setCustomFields(cf.data || [])
    setCustomers(cu.data || [])
    setSales(sr.data || [])

    // Load brought_by targets
    const { data: tgt } = await supabase.from('brought_by_targets').select('*').eq('shop_id', shopId)
    const tgtMap = {}
    ;(tgt || []).forEach(t => { tgtMap[t.name] = { weekly: t.weekly_target, monthly: t.monthly_target } })
    setBbTargets(tgtMap)

    setLoading(false)
  }

  const saveBbTarget = async (name, weekly) => {
    const shopId = shop?.id
    if (!shopId || !name) return
    const monthly = weekly * 4
    const { error } = await supabase.from('brought_by_targets').upsert(
      { shop_id: shopId, name, weekly_target: weekly, monthly_target: monthly },
      { onConflict: 'shop_id,name' }
    )
    if (!error) {
      setBbTargets(prev => ({ ...prev, [name]: { weekly, monthly } }))
    }
    setEditingTarget(null)
    setTargetInput('')
  }

  const addToCart = (p) => {
    const isWhs = posTab === 'wholesale'
    const price = isWhs ? (p.wholesale_price || 0) : (p.sell_price || 0)
    const stock = isWhs ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
    if (stock === 0) { showToast('Out of stock!', '#B93A16'); return }
    setCart(prev => {
      const ex = prev.find(c => c.id === p.id && c.sale_type === (isWhs ? 'wholesale' : 'retail'))
      if (ex) return ex.qty >= stock ? prev : prev.map(c => c.id === p.id && c.sale_type === ex.sale_type ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...p, sell_price: price, stock, qty: 1, sale_type: isWhs ? 'wholesale' : 'retail' }]
    })
  }

  const updateQty = (id, saleType, qty) => {
    if (qty <= 0) { setCart(p => p.filter(c => !(c.id === id && c.sale_type === saleType))); return }
    const prod = prods.find(p => p.id === id)
    const maxStock = saleType === 'wholesale' ? (prod?.wholesale_stock || 0) : (prod?.retail_stock || prod?.stock || 0)
    setCart(p => p.map(c => c.id === id && c.sale_type === saleType ? { ...c, qty: Math.min(qty, maxStock) } : c))
  }

  const subtotal = cart.reduce((a, c) => a + c.sell_price * c.qty, 0)
  const discAmt = discType === 'percent' ? Math.round(subtotal * (parseFloat(disc) || 0) / 100) : (parseFloat(disc) || 0)
  const transportAmt = parseFloat(transportFee) || 0
  const finalTotal = Math.max(0, subtotal - discAmt) + transportAmt

  const completeSale = async () => {
    if (!cart.length) { showToast('Add products first', '#B93A16'); return }
    setSaving(true)
    const shopId = shop.id
    let custId = selCust?.id || null
    if (!custId && (custName.trim() || custPhone.trim())) {
      const { data: nc } = await supabase.from('customers').insert({ shop_id: shopId, name: custName.trim() || 'Customer', phone: custPhone.trim() || null, total_spent: 0, visit_count: 0 }).select().single()
      if (nc) { custId = nc.id; setCustomers(p => [nc, ...p]) }
    }
    const grossProfit = cart.reduce((a, c) => {
      const costPerUnit = c.sale_type === 'wholesale' ? c.buy_price : (c.buy_price / (c.box_qty || 1))
      return a + (c.sell_price - costPerUnit) * c.qty
    }, 0)
    const totProfit = grossProfit - discAmt
    const receivedAmt = splitCashPaid ? parseFloat(splitCashPaid)||0 : 0
    const isSplit = payMeth !== 'loan' && receivedAmt > 0 && receivedAmt < finalTotal
    const cashPaid = isSplit ? receivedAmt : 0
    const loanBalance = isSplit ? Math.max(0, finalTotal - cashPaid) : 0
    const { data: sale, error: se } = await supabase.from('sales').insert({
      shop_id: shopId, cashier_id: profile.id, customer_id: custId,
      subtotal, discount: discAmt, total: finalTotal, total_profit: totProfit,
      payment_method: isSplit ? 'split' : payMeth, sale_date: today(),
      transport_fee: transportAmt || null, transport_destination: transportDest.trim() || null,
      cash_paid: isSplit ? cashPaid : null, loan_balance: isSplit ? loanBalance : null,
      brought_by: broughtBy === '__custom__' ? broughtByCustom.trim() || null : broughtBy.trim() || null,
    }).select().single()
    if (se) { setSaving(false); showToast('Error: ' + se.message, '#B93A16'); return }

    await supabase.from('sale_items').insert(cart.map(c => {
      const costUnit = c.sale_type === 'wholesale' ? c.buy_price : (c.buy_price / (c.box_qty || 1))
      const itemShare = subtotal > 0 ? (c.sell_price * c.qty / subtotal) : 0
      const itemDiscount = discAmt * itemShare
      const lineTotal = c.sell_price * c.qty - itemDiscount
      return { sale_id: sale.id, product_id: c.id, product_name: c.name, qty: c.qty, unit_price: c.sell_price, buy_price: costUnit, line_total: lineTotal, line_profit: lineTotal - costUnit * c.qty, sale_type: c.sale_type || 'retail' }
    }))

    // Stock: Store shops record the sale in the movement history, or (Chukua
    // stoo) create a release order so stock comes off when the store releases.
    const saleRef = 'Sale ' + (sale.id?.slice(-8)?.toUpperCase() || '')
    const storeItems = cart.map(c => ({ product_id: c.id, name: c.name, unit: c.unit, qty: c.qty, kind: c.sale_type === 'wholesale' ? 'wholesale' : 'retail' }))
    let newSlip = null
    try {
      if (storeOn && collectStore) {
        newSlip = await storeReleaseForSale({ items: storeItems, customer: custName.trim() || selCust?.name || '', phone: custPhone.trim(), saleRef, cashierName: profile?.full_name })
      } else if (storeOn) {
        await storeSell(storeItems, saleRef)
      } else {
        for (const c of cart) {
          if (c.sale_type === 'wholesale') await supabase.from('products').update({ wholesale_stock: Math.max(0, c.stock - c.qty) }).eq('id', c.id)
          else await supabase.from('products').update({ stock: Math.max(0, c.stock - c.qty), retail_stock: Math.max(0, c.stock - c.qty) }).eq('id', c.id)
        }
      }
    } catch (e) { showToast('Sale saved, but stock could not be updated: ' + e.message, '#B93A16') }
    if (custId) await supabase.from('customers').update({ total_spent: (selCust?.total_spent || 0) + finalTotal, visit_count: (selCust?.visit_count || 0) + 1 }).eq('id', custId)
    // Note: cash_paid is stored on the sale record itself - no need to add to loan_payments
    // loan_payments only tracks REPAYMENTS of the outstanding loan balance
    if (!newSlip) setProds(p => p.map(x => { const ci = cart.find(c => c.id === x.id); return ci ? { ...x, stock: Math.max(0, x.stock - ci.qty), retail_stock: Math.max(0, (x.retail_stock || x.stock || 0) - ci.qty) } : x }))

    const partField = customFields.find(f => f.field_name.toLowerCase().includes('part'))
    const receiptData = {
      id: sale.id?.slice(-8)?.toUpperCase(),
      fullId: sale.id,
      date: new Date(),
      cashier: profile?.full_name || 'Cashier',
      customer: custName || selCust?.name || 'Walk-in',
      items: cart.map(c => {
        const prod = prods.find(p => p.id === c.id)
        const pn = partField && prod?._cfv?.[partField.id]
        return { name: c.name, partNo: pn || null, qty: c.qty, unit: c.sale_type === 'wholesale' ? 'boxes' : 'pcs', price: c.sell_price, total: c.sell_price * c.qty }
      }),
      subtotal, discount: discAmt, transport: transportAmt, transportDest: transportDest.trim(),
      total: finalTotal, payMeth,
      cashPaid: isSplit ? cashPaid : finalTotal,
      loanBalance: isSplit ? loanBalance : 0,
      isSplit,
    }
    if (newSlip) { setSlip(newSlip); setPendingReceipt(receiptData); setCollectStore(false) }
    else setReceipt(receiptData)
    setSales(p => [{ ...sale, customers: selCust || null, sale_items: cart.map(c => ({ product_name: c.name, qty: c.qty, unit_price: c.sell_price, line_total: c.sell_price * c.qty })) }, ...p])
    setCart([]); setDisc(''); setCustName(''); setCustPhone(''); setSelCust(null); setPayMeth('cash'); setTransportFee(''); setTransportDest(''); setSplitCashPaid(''); setBroughtBy(''); setBroughtByCustom('')
    setSaving(false)
  }

  const now = new Date()
  const filterSale = s => {
    const d = new Date(s.sale_date || s.created_at)
    if (period === 'today') return d.toDateString() === now.toDateString()
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (period === 'year') return d.getFullYear() === now.getFullYear()
    return true
  }
  const filtSales = sales.filter(filterSale)
  const filtRev = filtSales.reduce((a, s) => a + (s.total || 0), 0)
  const filtProfit = filtSales.reduce((a, s) => a + (s.total_profit || 0), 0)

  const cats = ['All', ...new Set(prods.map(p => p.category).filter(Boolean))]
  const filtProds = prods.filter(p => {
    const q = searchQ.toLowerCase()
    const stock = posTab === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
    if (stock === 0 && posTab !== 'wholesale') return false
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || Object.values(p._cfv || {}).some(v => String(v).toLowerCase().includes(q))
    return matchQ && (cat === 'All' || p.category === cat)
  })
  const partField = customFields.find(f => f.field_name.toLowerCase().includes('part'))

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    input: { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}30`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }),
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F6F7FB' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #DCDFEC', borderTopColor: '#2D2F8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head><title>Sales / POS — TheDashboard</title></Head>
      <Layout title="Sales & POS" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:#8A8FAE}`}</style>

        <ReleaseSlipModal slip={slip} shopName={shop?.name} onClose={() => { setSlip(null); if (pendingReceipt) { setReceipt(pendingReceipt); setPendingReceipt(null) } }} />
        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: toast.color || '#2D2F8F', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, animation: 'fadeIn 0.2s ease' }}>
            {toast.msg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {[['pos', '🛒 POS'], ['bulk', '📋 Bulk Order'], ['history', '📋 Sales History'], ['broughtby', '👥 Brought By']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid', borderColor: tab === k ? '#2D2F8F' : '#DCDFEC', background: tab === k ? 'rgba(45,47,143,0.15)' : 'transparent', color: tab === k ? '#2D2F8F' : '#5B607E', fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        {/* POS TAB */}
        {tab === 'pos' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>

            {/* Left — Products */}
            <div>
              {/* Retail/Wholesale toggle */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: '#F6F7FB', borderRadius: 10, padding: 3, border: '1px solid #DCDFEC', width: 'fit-content' }}>
                {[{ k: 'retail', l: '🛒 Retail' }, { k: 'wholesale', l: '📦 Wholesale' }].map(t => (
                  <button key={t.k} onClick={() => { setPosTab(t.k); setCat('All') }} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: posTab === t.k ? '#2D2F8F' : 'transparent', color: posTab === t.k ? '#FFFFFF' : '#5B607E', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t.l}</button>
                ))}
              </div>

              {/* Search + Categories */}
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by name, part number, category..." style={{ ...C.input, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {cats.map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', borderColor: cat === c ? '#2D2F8F' : '#DCDFEC', background: cat === c ? 'rgba(45,47,143,0.15)' : 'transparent', color: cat === c ? '#2D2F8F' : '#5B607E', fontSize: 12, fontWeight: cat === c ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{c}</button>
                ))}
              </div>

              {/* Products grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {filtProds.map(p => {
                  const price = posTab === 'wholesale' ? (p.wholesale_price || 0) : (p.sell_price || 0)
                  const stock = posTab === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
                  const pn = partField && p._cfv?.[partField.id]
                  const inCart = cart.find(c => c.id === p.id && c.sale_type === (posTab === 'wholesale' ? 'wholesale' : 'retail'))
                  return (
                    <button key={p.id} onClick={() => addToCart(p)} style={{ background: inCart ? 'rgba(45,47,143,0.1)' : '#FFFFFF', border: `1px solid ${inCart ? '#2D2F8F' : '#DCDFEC'}`, borderRadius: 10, padding: 12, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', position: 'relative' }}
                      onMouseEnter={e => !inCart && (e.currentTarget.style.borderColor = '#2196F350')}
                      onMouseLeave={e => !inCart && (e.currentTarget.style.borderColor = '#DCDFEC')}>
                      {inCart && <div style={{ position: 'absolute', top: 6, right: 6, background: '#2D2F8F', color: '#FFFFFF', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>{inCart.qty}</div>}
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{p.image_emoji || '📦'}</div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#15183A', marginBottom: 1, lineHeight: 1.3 }}>{p.name}</p>
                      {pn && <p style={{ fontSize: 10, color: '#0F7375', marginBottom: 2, fontFamily:'monospace' }}>#{pn}</p>}
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#2D2F8F' }}>{fmt(price)}</p>
                      <p style={{ fontSize: 10, color: stock < 5 ? '#B93A16' : '#5B607E', marginTop: 2 }}>{stock} {posTab === 'wholesale' ? 'boxes' : 'pcs'}</p>
                    </button>
                  )
                })}
                {!filtProds.length && <p style={{ color: '#8A8FAE', fontSize: 13, gridColumn: '1/-1', padding: 20 }}>No products found</p>}
              </div>
            </div>

            {/* Right — Cart */}
            <div style={{ position: 'sticky', top: 70 }}>
              <div style={C.card}>
                <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 14 }}>CART {cart.length > 0 && `(${cart.length} items)`}</p>

                {!cart.length && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#8A8FAE' }}>
                    <p style={{ fontSize: 32 }}>🛒</p>
                    <p style={{ fontSize: 13, marginTop: 8 }}>Click products to add</p>
                  </div>
                )}

                {/* Cart items */}
                {cart.map(item => (
                  <div key={item.id + item.sale_type} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #DCDFEC' }}>
                    <span style={{ fontSize: 18 }}>{item.image_emoji || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      {(() => {
                        const pf = customFields.find(f => f.field_name.toLowerCase().includes('part'))
                        const prod = prods.find(p => p.id === item.id)
                        const pn = pf && prod?._cfv?.[pf.id]
                        return pn ? <p style={{ fontSize: 10, color: '#0F7375', fontFamily:'monospace', marginBottom: 1 }}>#{pn}</p> : null
                      })()}
                      <p style={{ fontSize: 10, color: '#5B607E' }}>{fmt(item.sell_price)} each</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => updateQty(item.id, item.sale_type, item.qty - 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #DCDFEC', background: '#F6F7FB', color: '#15183A', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.sale_type, item.qty + 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #DCDFEC', background: '#F6F7FB', color: '#2D2F8F', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#2D2F8F' }}>{fmt(item.sell_price * item.qty)}</p>
                    </div>
                    <button onClick={() => setCart(p => p.filter(c => !(c.id === item.id && c.sale_type === item.sale_type)))} style={{ background: 'none', border: 'none', color: '#B93A16', fontSize: 14, cursor: 'pointer', padding: 2 }}>✕</button>
                  </div>
                ))}

                {cart.length > 0 && (
                  <>
                    {/* Customer */}
                    <div style={{ marginBottom: 10, position: 'relative' }}>
                      <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 5 }}>CUSTOMER (OPTIONAL)</p>
                      {selCust ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(11,122,108,0.1)', border: '1px solid rgba(11,122,108,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#0B7A6C' }}>✓ {selCust.name}</p>
                            {selCust.phone && <p style={{ fontSize: 10, color: '#5B607E' }}>{selCust.phone}</p>}
                          </div>
                          <button onClick={() => { setSelCust(null); setCustSearch('') }} style={{ background: 'none', border: 'none', color: '#5B607E', cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <input value={custSearch} onChange={e => { setCustSearch(e.target.value); setCustName(e.target.value); setShowCustDrop(true) }} onFocus={() => setShowCustDrop(true)} placeholder="Search or type new name..." style={C.input} />
                          {showCustDrop && custSearch && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 8, zIndex: 100, maxHeight: 160, overflowY: 'auto' }}>
                              {customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).slice(0, 5).map(c => (
                                <button key={c.id} onClick={() => { setSelCust(c); setCustSearch(c.name); setCustName(c.name); setShowCustDrop(false) }}
                                  style={{ display: 'block', width: '100%', padding: '9px 12px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #DCDFEC', color: '#15183A', cursor: 'pointer', fontSize: 13 }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,24,58,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                                  {c.phone && <span style={{ color: '#5B607E', fontSize: 11, marginLeft: 8 }}>{c.phone}</span>}
                                </button>
                              ))}
                              <button onClick={() => { setCustName(custSearch); setShowCustDrop(false) }}
                                style={{ display: 'block', width: '100%', padding: '9px 12px', textAlign: 'left', background: 'none', border: 'none', color: '#2D2F8F', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                + New: "{custSearch}"
                              </button>
                            </div>
                          )}
                          {selCust === null && custSearch === '' && (
                            <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="Phone (optional)" style={{ ...C.input, marginTop: 6 }} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Discount */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 5 }}>DISCOUNT</p>
                        <input value={disc} onChange={e => setDisc(e.target.value)} placeholder="0" type="number" style={C.input} />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 5 }}>TYPE</p>
                        <div style={{ display: 'flex', gap: 4, height: 38 }}>
                          {[{ k: 'amount', l: 'TZS' }, { k: 'percent', l: '%' }].map(d => (
                            <button key={d.k} onClick={() => setDiscType(d.k)} style={{ padding: '0 12px', borderRadius: 8, border: '1px solid', borderColor: discType === d.k ? '#2D2F8F' : '#DCDFEC', background: discType === d.k ? 'rgba(45,47,143,0.15)' : 'transparent', color: discType === d.k ? '#2D2F8F' : '#5B607E', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{d.l}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Transport */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 5 }}>TRANSPORT FEE</p>
                        <input value={transportFee} onChange={e => setTransportFee(e.target.value)} placeholder="0" type="number" style={C.input} />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 5 }}>DESTINATION</p>
                        <input value={transportDest} onChange={e => setTransportDest(e.target.value)} placeholder="e.g. Kariakoo" style={C.input} />
                      </div>
                    </div>

                    {/* Brought By */}
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 6 }}>👤 BROUGHT BY <span style={{ color: '#8A8FAE', fontWeight: 400 }}>(OPTIONAL)</span></p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: broughtBy === '__custom__' ? 8 : 0 }}>
                        {[{ v: '', l: 'None' }, ...staffList.map(sf => ({ v: sf.full_name, l: sf.full_name })), { v: '__custom__', l: 'Other…' }].map(opt => (
                          <button key={opt.v} onClick={() => { setBroughtBy(opt.v); if (opt.v !== '__custom__') setBroughtByCustom('') }}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', borderColor: broughtBy === opt.v ? '#0F7375' : '#DCDFEC', background: broughtBy === opt.v ? 'rgba(15,115,117,0.15)' : 'transparent', color: broughtBy === opt.v ? '#0F7375' : '#5B607E', fontSize: 12, fontWeight: broughtBy === opt.v ? 700 : 400, cursor: 'pointer' }}>{opt.l}</button>
                        ))}
                      </div>
                      {broughtBy === '__custom__' && (
                        <input value={broughtByCustom} onChange={e => setBroughtByCustom(e.target.value)} placeholder="Enter name (freelancer / other)" autoFocus style={C.input} />
                      )}
                    </div>

                    {/* Payment method */}
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 6 }}>PAYMENT METHOD</p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {['cash', 'mpesa', 'tigo', 'airtel', 'loan', 'bank'].map(m => (
                          <button key={m} onClick={() => setPayMeth(m)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', borderColor: payMeth === m ? '#2D2F8F' : '#DCDFEC', background: payMeth === m ? 'rgba(45,47,143,0.15)' : 'transparent', color: payMeth === m ? '#2D2F8F' : '#5B607E', fontSize: 12, fontWeight: payMeth === m ? 700 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
                        ))}
                      </div>
                    </div>

                    {/* Amount received - auto-detects split */}
                    {payMeth !== 'loan' && (
                      <div style={{ marginBottom:12 }}>
                        <p style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, marginBottom:5 }}>AMOUNT RECEIVED</p>
                        <input value={splitCashPaid} onChange={e=>setSplitCashPaid(e.target.value)} type="number" placeholder={String(finalTotal)} style={{ ...C.input, color:'#0B7A6C', fontWeight:700, fontSize:16 }}/>
                        {splitCashPaid && parseFloat(splitCashPaid) < finalTotal && (
                          <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                            <p style={{ fontSize:11, color:'#0B7A6C' }}>Cash: {fmt(parseFloat(splitCashPaid)||0)}</p>
                            <p style={{ fontSize:11, color:'#9A5B00', fontWeight:700 }}>Loan: {fmt(Math.max(0, finalTotal - (parseFloat(splitCashPaid)||0)))}</p>
                          </div>
                        )}
                        {splitCashPaid && parseFloat(splitCashPaid) >= finalTotal && (
                          <p style={{ fontSize:11, color:'#0B7A6C', marginTop:4 }}>Fully paid</p>
                        )}
                      </div>
                    )}

                    {/* Totals */}
                    <div style={{ borderTop: '1px solid #DCDFEC', paddingTop: 12 }}>
                      {[
                        { l: 'Subtotal', v: fmt(subtotal), c: '#15183A' },
                        ...(discAmt > 0 ? [{ l: `Discount (${discType === 'percent' ? disc + '%' : 'TZS'})`, v: `-${fmt(discAmt)}`, c: '#9A5B00' }] : []),
                        ...(transportAmt > 0 ? [{ l: `Transport (${transportDest || '—'})`, v: fmt(transportAmt), c: '#2D2F8F' }] : []),
                      ].map(r => (
                        <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ color: '#5B607E', fontSize: 13 }}>{r.l}</span>
                          <span style={{ fontSize: 13, color: r.c }}>{r.v}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid #DCDFEC' }}>
                        <span style={{ fontSize: 18, fontWeight: 900 }}>TOTAL</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: '#2D2F8F' }}>{fmt(finalTotal)}</span>
                      </div>
                    </div>

                    {storeOn && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${collectStore ? '#2D2F8F' : '#DCDFEC'}`, background: collectStore ? 'rgba(45,47,143,0.06)' : '#FFFFFF', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 14, color: '#15183A', fontWeight: 500 }}>
                        <input type="checkbox" checked={collectStore} onChange={e => setCollectStore(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#2D2F8F', flexShrink: 0 }} />
                        <span><b>Chukua stoo</b> — mteja atachukua mzigo stoo<br /><span style={{ fontSize: 12, color: '#5B607E' }}>Inachapisha kibali cha stoo. Idadi inapungua mzigo ukitolewa stoo.</span></span>
                      </label>
                    )}
                    <button onClick={completeSale} disabled={saving} style={{ width: '100%', padding: '14px', borderRadius: 10, background: saving ? '#DCDFEC' : '#2D2F8F', color: saving ? '#5B607E' : '#FFFFFF', fontWeight: 900, fontSize: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginTop: 14 }}>
                      {saving ? 'Processing...' : '✅ Complete Sale'}
                    </button>
                    <button onClick={() => setCart([])} style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'transparent', border: '1px solid #ff4d6d30', color: '#B93A16', fontWeight: 600, fontSize: 12, cursor: 'pointer', marginTop: 8 }}>🗑️ Clear Cart</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BULK ORDER TAB */}
        {tab === 'bulk' && (
          <div style={{ maxWidth: 700 }}>
            <div style={{ ...C.card, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Paste your order list</p>
              <p style={{ fontSize: 12, color: '#5B607E', marginBottom: 16, lineHeight: 1.6 }}>
                One item per line. Supports formats like:<br/>
                <code style={{ color: '#2D2F8F', fontSize: 11 }}>48725-35020{'\t'}10</code> ← part number + tab + qty<br/>
                <code style={{ color: '#2D2F8F', fontSize: 11 }}>48725-35020</code> ← part number only (qty = 1)<br/>
                <code style={{ color: '#2D2F8F', fontSize: 11 }}>Brake Pad Front{'\t'}5</code> ← name + tab + qty<br/>
                <code style={{ color: '#2D2F8F', fontSize: 11 }}>10 Oil Filter</code> ← qty first then name<br/>
                <code style={{ color: '#2D2F8F', fontSize: 11 }}>Air Filter x3</code> ← name x qty
              </p>

              {/* Retail/Wholesale toggle */}
              <div style={{ display:'flex', gap:0, marginBottom:14, background:'#F6F7FB', borderRadius:10, padding:3, border:'1px solid #DCDFEC', width:'fit-content' }}>
                {[{k:'retail',l:'🛒 Retail'},{k:'wholesale',l:'📦 Wholesale'}].map(t=>(
                  <button key={t.k} onClick={()=>setPosTab(t.k)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:posTab===t.k?'#2D2F8F':'transparent', color:posTab===t.k? '#FFFFFF':'#5B607E', fontWeight:700, fontSize:12, cursor:'pointer' }}>{t.l}</button>
                ))}
              </div>

              <textarea
                value={bulkText}
                onChange={e=>setBulkText(e.target.value)}
                placeholder={"10 Brake Pad Front\n5 Oil Filter\nAir Filter x3\nSpark Plug - 8"}
                rows={10}
                style={{ width:'100%', background:'#F6F7FB', border:'1.5px solid #DCDFEC', borderRadius:8, color:'#15183A', padding:'12px', fontSize:13, fontFamily:'monospace', outline:'none', resize:'vertical', lineHeight:1.8 }}
              />
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                <button onClick={parseBulkOrder} style={{ flex:1, padding:'11px', borderRadius:8, background:'#2D2F8F', color:'#FFFFFF', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>
                  🔍 Parse Order
                </button>
                <button onClick={()=>{setBulkText('');setBulkParsed([]);setBulkError('')}} style={{ padding:'11px 16px', borderRadius:8, border:'1px solid #DCDFEC', background:'transparent', color:'#5B607E', fontSize:13, cursor:'pointer' }}>Clear</button>
              </div>
            </div>

            {/* Parse results */}
            {(bulkParsed.length > 0 || bulkError) && (
              <div style={C.card}>
                {bulkError && <div style={{ background:'rgba(242,160,7,0.1)', border:'1px solid rgba(242,160,7,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:14, color:'#9A5B00', fontSize:13 }}>{bulkError}</div>}

                {bulkParsed.length > 0 && (
                  <>
                    <p style={{ fontSize:11, color:'#5B607E', letterSpacing:0.8, marginBottom:12 }}>PARSED ITEMS ({bulkParsed.length})</p>
                    <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #DCDFEC' }}>
                          {['Product','Part No.','Qty','Unit Price','Total'].map(h=>(
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, color:'#5B607E', letterSpacing:0.5, fontWeight:600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkParsed.map((p, i) => {
                          const pf = customFields.find(f => f.field_name.toLowerCase().includes('part'))
                          const pn = pf && p._cfv?.[pf.id]
                          return (
                            <tr key={p.id} style={{ borderBottom: i < bulkParsed.length-1 ? '1px solid #DCDFEC' : 'none' }}>
                              <td style={{ padding:'9px 12px' }}>
                                <p style={{ fontSize:13, fontWeight:600 }}>{p.image_emoji||'📦'} {p.name}</p>
                                {pn && <p style={{ fontSize:10, color:'#0F7375', marginTop:2 }}>#{pn}</p>}
                              </td>
                              <td style={{ padding:'9px 12px', fontSize:11, color:'#0F7375' }}>{pn||'—'}</td>
                              <td style={{ padding:'9px 12px' }}>
                                <input type="number" value={p.qty} onChange={e=>setBulkParsed(prev=>prev.map((x,j)=>j===i?{...x,qty:parseInt(e.target.value)||1}:x))}
                                  style={{ width:60, background:'#F6F7FB', border:'1px solid #DCDFEC', borderRadius:6, color:'#15183A', padding:'4px 8px', fontSize:13, outline:'none' }}/>
                              </td>
                              <td style={{ padding:'9px 12px', fontSize:13, color:'#9A5B00' }}>{fmt(p.sell_price)}</td>
                              <td style={{ padding:'9px 12px', fontSize:13, fontWeight:700, color:'#2D2F8F' }}>{fmt(p.sell_price * p.qty)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'1px solid #DCDFEC', marginBottom:16 }}>
                      <span style={{ fontSize:16, fontWeight:800 }}>Total</span>
                      <span style={{ fontSize:20, fontWeight:900, color:'#2D2F8F' }}>{fmt(bulkParsed.reduce((a,p)=>a+p.sell_price*p.qty,0))}</span>
                    </div>
                    <button onClick={addBulkToCart} style={{ width:'100%', padding:'13px', borderRadius:8, background:'#0B7A6C', color:'#FFFFFF', fontWeight:800, fontSize:15, border:'none', cursor:'pointer' }}>
                      ✅ Add {bulkParsed.length} Items to Cart →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* SALES HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {/* Period filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[{ k: 'today', l: 'Today' }, { k: 'month', l: 'This Month' }, { k: 'year', l: 'This Year' }, { k: 'all', l: 'All Time' }].map(p => (
                <button key={p.k} onClick={() => setPeriod(p.k)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid', borderColor: period === p.k ? '#2D2F8F' : '#DCDFEC', background: period === p.k ? 'rgba(45,47,143,0.15)' : 'transparent', color: period === p.k ? '#2D2F8F' : '#5B607E', fontSize: 13, fontWeight: period === p.k ? 700 : 400, cursor: 'pointer' }}>{p.l}</button>
              ))}
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { l: 'Sales', v: filtSales.length, c: '#2D2F8F' },
                { l: 'Revenue', v: fmtK(filtRev), c: '#2D2F8F' },
                { l: 'Profit', v: fmtK(filtProfit), c: '#0B7A6C' },
                { l: 'Avg Sale', v: fmtK(filtSales.length > 0 ? filtRev / filtSales.length : 0), c: '#9A5B00' },
              ].map(k => (
                <div key={k.l} style={C.card}>
                  <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Sales table */}
            <div style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                    {['Date', 'Customer', 'Items', 'Payment', 'Total', 'Profit', '', ''].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtSales.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < filtSales.length - 1 ? '1px solid #DCDFEC' : 'none', cursor: 'pointer' }}
                      onClick={() => setSaleDetail(saleDetail?.id === s.id ? null : s)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,24,58,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#5B607E' }}>{s.sale_date || s.created_at?.split('T')[0]}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{s.customers?.name || 'Walk-in'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#5B607E' }}>{(s.sale_items || []).length}</td>
                      <td style={{ padding: '10px 14px' }}><span style={C.badge('#2D2F8F')}>{s.payment_method?.toUpperCase()}</span></td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#2D2F8F' }}>{fmtK(s.total)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#2D2F8F' }}>+{fmtK(s.total_profit)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#8A8FAE' }}>{saleDetail?.id === s.id ? '▲' : '▼'}</td>
                      <td style={{ padding: '6px 14px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => router.push('/sales/invoice/' + s.id)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #DCDFEC', background:'#FFFFFF', color:'#15183A', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>📄 Invoice</button>
                      </td>
                    </tr>
                  ))}
                  {!filtSales.length && (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No sales found for this period</td></tr>
                  )}
                </tbody>
              </table>

              {/* Sale detail */}
              {saleDetail && (
                <div style={{ padding: 16, background: 'rgba(45,47,143,0.05)', borderTop: '1px solid #2196F330' }}>
                  <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 10 }}>SALE ITEMS</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {(saleDetail.sale_items || []).map((it, i) => (
                      <div key={i} style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 8, padding: '10px 12px' }}>
                        <p style={{ fontSize: 12, fontWeight: 600 }}>{it.products?.image_emoji || '📦'} {it.product_name || it.products?.name}</p>
                        <p style={{ fontSize: 11, color: '#5B607E', marginTop: 3 }}>{it.qty} × {fmt(it.unit_price)}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#2D2F8F', marginTop: 3 }}>{fmt(it.line_total)}</p>
                      </div>
                    ))}
                  </div>
                  {saleDetail.discount > 0 && <p style={{ fontSize: 12, color: '#9A5B00', marginTop: 10 }}>Discount: -{fmt(saleDetail.discount)}</p>}
                  {saleDetail.transport_fee > 0 && <p style={{ fontSize: 12, color: '#2D2F8F', marginTop: 4 }}>Transport: {fmt(saleDetail.transport_fee)} → {saleDetail.transport_destination}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BROUGHT BY TAB */}
        {tab === 'broughtby' && (() => {
          const now2 = new Date()
          // period state reused from history tab
          const bbPeriodLabel = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', all: 'All Time' }

          // filter sales by period
          const getWeekStart = () => { const d = new Date(now2); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d }
          const bbFilter = s => {
            const d = new Date(s.sale_date || s.created_at)
            if (period === 'today') return d.toDateString() === now2.toDateString()
            if (period === 'week') return d >= getWeekStart()
            if (period === 'month') return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
            if (period === 'year') return d.getFullYear() === now2.getFullYear()
            return true
          }
          const bbSales = sales.filter(bbFilter)

          // Group by brought_by
          const grouped = {}
          for (const s of bbSales) {
            const key = s.brought_by?.trim() || '__none__'
            if (!grouped[key]) grouped[key] = { name: s.brought_by?.trim() || null, sales: [], total: 0, profit: 0, count: 0 }
            grouped[key].sales.push(s)
            grouped[key].total += s.total || 0
            grouped[key].profit += s.total_profit || 0
            grouped[key].count++
          }

          // Sort by total desc
          const rows = Object.values(grouped).sort((a, b) => b.total - a.total)
          const totalRev = rows.reduce((a, r) => a + r.total, 0)
          const withBB = rows.filter(r => r.name)
          const withoutBB = rows.find(r => !r.name)

          // Daily breakdown for selected person
          const personSales = selectedPerson
            ? bbSales.filter(s => (s.brought_by?.trim() || null) === selectedPerson)
            : []

          // Group person sales by day
          const byDay = {}
          for (const s of personSales) {
            const day = s.sale_date || s.created_at?.split('T')[0]
            if (!byDay[day]) byDay[day] = { total: 0, count: 0 }
            byDay[day].total += s.total || 0
            byDay[day].count++
          }
          const dayRows = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]))

          return (
            <div>
              {/* Period filter */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {[{ k: 'today', l: 'Today' }, { k: 'week', l: 'This Week' }, { k: 'month', l: 'This Month' }, { k: 'year', l: 'This Year' }, { k: 'all', l: 'All Time' }].map(p => (
                  <button key={p.k} onClick={() => { setPeriod(p.k); setSelectedPerson(null) }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid', borderColor: period === p.k ? '#0F7375' : '#DCDFEC', background: period === p.k ? 'rgba(15,115,117,0.15)' : 'transparent', color: period === p.k ? '#0F7375' : '#5B607E', fontSize: 13, fontWeight: period === p.k ? 700 : 400, cursor: 'pointer' }}>{p.l}</button>
                ))}
              </div>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { l: 'Total Sales', v: bbSales.length, c: '#0F7375' },
                  { l: 'Total Revenue', v: fmtK(totalRev), c: '#2D2F8F' },
                  { l: 'People Tracked', v: withBB.length, c: '#0B7A6C' },
                ].map(k => (
                  <div key={k.l} style={C.card}>
                    <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: selectedPerson ? '1fr 1fr' : '1fr', gap: 16 }}>
                {/* Leaderboard */}
                <div style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #DCDFEC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0F7375' }}>👥 Brought By — {bbPeriodLabel[period]}</p>
                    {withoutBB && <span style={{ fontSize: 11, color: '#8A8FAE' }}>{withoutBB.count} walk-in sales not tracked</span>}
                  </div>
                  {withBB.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#8A8FAE' }}>
                      <p style={{ fontSize: 32, marginBottom: 8 }}>👥</p>
                      <p>No "Brought By" data for this period</p>
                      <p style={{ fontSize: 12, marginTop: 6, color: '#DCDFEC' }}>Add it during sale on POS</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                          {['#', 'Name', 'Sales', 'Revenue', 'Profit', 'Share', 'Target Progress', ''].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {withBB.map((r, i) => {
                          const share = totalRev > 0 ? Math.round(r.total / totalRev * 100) : 0
                          const isSelected = selectedPerson === r.name
                          const tgt = bbTargets[r.name]
                          // Show weekly target progress if period is week/today, else monthly
                          const targetAmt = period === 'week' || period === 'today' ? tgt?.weekly : tgt?.monthly
                          const targetPct = targetAmt > 0 ? Math.min(100, Math.round(r.total / targetAmt * 100)) : null
                          const isEditingThis = editingTarget === r.name
                          return (
                            <tr key={r.name} onClick={() => !isEditingThis && setSelectedPerson(isSelected ? null : r.name)}
                              style={{ borderBottom: i < withBB.length - 1 ? '1px solid #DCDFEC' : 'none', cursor: 'pointer', background: isSelected ? 'rgba(15,115,117,0.08)' : 'transparent' }}
                              onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'rgba(21,24,58,0.02)')}
                              onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: i === 0 ? '#9A5B00' : i === 1 ? '#5B607E' : '#8A8FAE' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#0F7375' : '#15183A' }}>{r.name}</p>
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: 13, color: '#5B607E' }}>{r.count}</td>
                              <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#2D2F8F' }}>{fmtK(r.total)}</td>
                              <td style={{ padding: '10px 14px', fontSize: 13, color: '#0B7A6C' }}>+{fmtK(r.profit)}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 6, background: '#DCDFEC', borderRadius: 3, minWidth: 60 }}>
                                    <div style={{ height: '100%', width: share + '%', background: '#0F7375', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontSize: 11, color: '#0F7375', fontWeight: 700, minWidth: 28 }}>{share}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px', minWidth: 160 }}>
                                {isEditingThis ? (
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                    <input
                                      autoFocus
                                      type="number"
                                      value={targetInput}
                                      onChange={e => setTargetInput(e.target.value)}
                                      placeholder="Weekly target"
                                      style={{ width: 100, background: '#F6F7FB', border: '1.5px solid #0F7375', borderRadius: 6, color: '#15183A', padding: '4px 8px', fontSize: 12, outline: 'none' }}
                                      onKeyDown={e => { if (e.key === 'Enter') saveBbTarget(r.name, Number(targetInput)); if (e.key === 'Escape') { setEditingTarget(null); setTargetInput('') } }}
                                    />
                                    <button onClick={() => saveBbTarget(r.name, Number(targetInput))} style={{ background: '#a78bfa20', border: '1px solid #0F7375', color: '#0F7375', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>✓</button>
                                    <button onClick={() => { setEditingTarget(null); setTargetInput('') }} style={{ background: 'none', border: '1px solid #8A8FAE', color: '#8A8FAE', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>✕</button>
                                  </div>
                                ) : targetPct !== null ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                    <div style={{ flex: 1, minWidth: 80, height: 6, background: '#DCDFEC', borderRadius: 3 }}>
                                      <div style={{ height: '100%', width: targetPct + '%', background: targetPct >= 100 ? '#0B7A6C' : targetPct >= 70 ? '#9A5B00' : '#B93A16', borderRadius: 3 }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: targetPct >= 100 ? '#0B7A6C' : targetPct >= 70 ? '#9A5B00' : '#B93A16', minWidth: 32 }}>{targetPct}%</span>
                                    <span style={{ fontSize: 10, color: '#8A8FAE' }}>of {fmtK(targetAmt)}</span>
                                    <button onClick={() => { setEditingTarget(r.name); setTargetInput(tgt?.weekly || '') }} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 13, cursor: 'pointer', padding: 2 }} title="Edit target">✏️</button>
                                  </div>
                                ) : (
                                  <button onClick={e => { e.stopPropagation(); setEditingTarget(r.name); setTargetInput('') }} style={{ background: 'none', border: '1px dashed #DCDFEC', color: '#8A8FAE', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>+ Set target</button>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: 11, color: '#8A8FAE' }}>{isSelected ? '▲' : '▶'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Daily breakdown panel */}
                {selectedPerson && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #a78bfa40', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #DCDFEC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#0F7375' }}>📅 {selectedPerson} — Daily Breakdown</p>
                      <button onClick={() => setSelectedPerson(null)} style={{ background: 'none', border: 'none', color: '#8A8FAE', fontSize: 16, cursor: 'pointer' }}>✕</button>
                    </div>

                    {/* Person summary */}
                    {(() => { const r = withBB.find(x => x.name === selectedPerson); if (!r) return null;
                      const tgt = bbTargets[selectedPerson]
                      const wkPct = tgt?.weekly > 0 ? Math.min(100, Math.round(r.total / tgt.weekly * 100)) : null
                      const moPct = tgt?.monthly > 0 ? Math.min(100, Math.round(r.total / tgt.monthly * 100)) : null
                      return (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, borderBottom: '1px solid #DCDFEC' }}>
                            {[{ l: 'Sales', v: r.count, c: '#0F7375' }, { l: 'Revenue', v: fmtK(r.total), c: '#2D2F8F' }, { l: 'Profit', v: fmtK(r.profit), c: '#0B7A6C' }].map(k => (
                              <div key={k.l} style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <p style={{ fontSize: 18, fontWeight: 900, color: k.c }}>{k.v}</p>
                                <p style={{ fontSize: 10, color: '#5B607E', marginTop: 2 }}>{k.l.toUpperCase()}</p>
                              </div>
                            ))}
                          </div>
                          {/* Target progress */}
                          {tgt ? (
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #DCDFEC', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              {[{ l: 'Weekly Target', pct: wkPct, target: tgt.weekly }, { l: 'Monthly Target', pct: moPct, target: tgt.monthly }].map(t => (
                                <div key={t.l}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{t.l.toUpperCase()}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: t.pct >= 100 ? '#0B7A6C' : '#15183A' }}>{t.pct !== null ? t.pct + '%' : '—'}</span>
                                  </div>
                                  <div style={{ height: 8, background: '#DCDFEC', borderRadius: 4 }}>
                                    {t.pct !== null && <div style={{ height: '100%', width: t.pct + '%', background: t.pct >= 100 ? '#0B7A6C' : t.pct >= 70 ? '#9A5B00' : '#B93A16', borderRadius: 4, transition: 'width 0.4s' }} />}
                                  </div>
                                  <p style={{ fontSize: 10, color: '#8A8FAE', marginTop: 3 }}>Target: {fmtK(t.target)}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #DCDFEC', textAlign: 'center' }}>
                              <button onClick={() => { setEditingTarget(selectedPerson); setTargetInput('') }} style={{ background: 'none', border: '1px dashed #0F7375', color: '#0F7375', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>🎯 Set Weekly Target for {selectedPerson}</button>
                            </div>
                          )}
                        </>
                      )
                    })()}

                    {/* Day rows */}
                    <div style={{ overflowY: 'auto', maxHeight: 400 }}>
                      {dayRows.length === 0 ? (
                        <p style={{ padding: 24, textAlign: 'center', color: '#8A8FAE' }}>No sales</p>
                      ) : dayRows.map(([day, info]) => (
                        <div key={day} style={{ padding: '12px 16px', borderBottom: '1px solid #DCDFEC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600 }}>{day}</p>
                            <p style={{ fontSize: 11, color: '#5B607E', marginTop: 2 }}>{info.count} sale{info.count !== 1 ? 's' : ''}</p>
                          </div>
                          <p style={{ fontSize: 15, fontWeight: 800, color: '#2D2F8F' }}>{fmtK(info.total)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Individual sales list */}
                    <div style={{ padding: '10px 16px', borderTop: '1px solid #DCDFEC' }}>
                      <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8, marginBottom: 8 }}>ALL SALES</p>
                      {personSales.slice(0, 20).map((s, i) => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < Math.min(personSales.length, 20) - 1 ? '1px solid #ECEEF7' : 'none' }}>
                          <div>
                            <p style={{ fontSize: 12, color: '#15183A' }}>{s.customers?.name || 'Walk-in'}</p>
                            <p style={{ fontSize: 10, color: '#8A8FAE' }}>{s.sale_date || s.created_at?.split('T')[0]} · {s.payment_method?.toUpperCase()}</p>
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#2D2F8F' }}>{fmtK(s.total)}</p>
                        </div>
                      ))}
                      {personSales.length > 20 && <p style={{ fontSize: 11, color: '#8A8FAE', textAlign: 'center', marginTop: 8 }}>+{personSales.length - 20} more</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Receipt Modal */}
        {receipt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div style={{ background: '#fff', color: '#000', borderRadius: 12, padding: 28, width: '100%', maxWidth: 360, fontFamily: 'monospace' }}>
              <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px dashed #ccc', paddingBottom: 12 }}>
                <p style={{ fontSize: 18, fontWeight: 900 }}>{shop?.name}</p>
                <p style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Receipt #{receipt.id}</p>
                <p style={{ fontSize: 11, color: '#666' }}>{receipt.date.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: '#666' }}>Cashier: {receipt.cashier}</p>
              </div>
              {receipt.customer !== 'Walk-in' && <p style={{ fontSize: 12, marginBottom: 8 }}>Customer: <strong>{receipt.customer}</strong></p>}
              <div style={{ marginBottom: 12 }}>
                {receipt.items.map((it, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{it.name} × {it.qty} {it.unit}</span>
                      <span style={{ fontWeight: 700 }}>{fmt(it.total)}</span>
                    </div>
                    {it.partNo && <p style={{ fontSize: 10, color: '#888', marginTop: 1, fontFamily:'monospace' }}>Part No: {it.partNo}</p>}
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px dashed #ccc', paddingTop: 10 }}>
                {receipt.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}><span>Discount</span><span>-{fmt(receipt.discount)}</span></div>}
                {receipt.transport > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}><span>Transport ({receipt.transportDest})</span><span>{fmt(receipt.transport)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 900, fontSize: 16 }}>
                  <span>TOTAL</span><span>{fmt(receipt.total)}</span>
                </div>
                {receipt.isSplit ? (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #ccc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#0B7A6C' }}>
                      <span>Cash Paid ({receipt.payMeth?.toUpperCase()})</span>
                      <span style={{ fontWeight: 700 }}>{fmt(receipt.cashPaid)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#B93A16', marginTop: 3 }}>
                      <span>Balance (Loan)</span>
                      <span style={{ fontWeight: 700 }}>{fmt(receipt.loanBalance)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#0B7A6C', marginTop: 6 }}>
                    <span>Amount Paid ({receipt.payMeth?.toUpperCase()})</span>
                    <span style={{ fontWeight: 700 }}>{fmt(receipt.total)}</span>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '2px dashed #ccc' }}>
                <p style={{ fontSize: 11, color: '#888' }}>Thank you for your business!</p>
                <p style={{ fontSize: 10, color: '#aaa' }}>thedashboard.co.tz</p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => window.print()} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#f5f5f5', color: '#333', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨️ Print</button>
                <button onClick={() => { router.push('/sales/invoice/' + receipt.fullId); setReceipt(null) }} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#FFFFFF', color: '#15183A', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>📄 Invoice</button>
                <button onClick={() => setReceipt(null)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#2D2F8F', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Done ✓</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
