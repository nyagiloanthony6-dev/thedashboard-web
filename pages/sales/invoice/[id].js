import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase, fmt } from '../../../lib/supabase'

export default function Invoice() {
  const router = useRouter()
  const { id } = router.query
  const [sale, setSale] = useState(null)
  const [shop, setShop] = useState(null)
  const [customFields, setCustomFields] = useState([])
  const [prodCfv, setProdCfv] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (id) loadData() }, [id])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    let shopData = prof?.shops
    if (!shopData) {
      const { data: owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    setShop(shopData)

    const [sr, cfr] = await Promise.all([
      supabase.from('sales').select('*,sale_items(*),customers(name,phone,email,address),app_users!cashier_id(full_name)').eq('id', id).single(),
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopData.id),
    ])
    setSale(sr.data)
    setCustomFields(cfr.data || [])

    if (sr.data?.sale_items?.length) {
      const productIds = sr.data.sale_items.map(i => i.product_id).filter(Boolean)
      const { data: cfvRows } = await supabase.from('product_field_values').select('product_id,field_id,value').in('product_id', productIds)
      const map = {}
      ;(cfvRows || []).forEach(v => {
        if (!map[v.product_id]) map[v.product_id] = {}
        map[v.product_id][v.field_id] = v.value
      })
      setProdCfv(map)
    }
    setLoading(false)
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'sans-serif' }}><p>Loading invoice...</p></div>
  if (!sale) return <div style={{ padding:40, fontFamily:'sans-serif' }}><p>Invoice not found.</p></div>

  const partField = customFields.find(f => f.field_name.toLowerCase().includes('part'))
  const isSplit = sale.payment_method === 'split'
  const invoiceNo = 'INV-' + sale.id?.slice(-8)?.toUpperCase()
  const items = sale.sale_items || []

  return (
    <>
      <Head>
        <title>{invoiceNo} — {shop?.name}</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; background: #fff; }
            .invoice { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
          }
          body { background: #e8e8e8; font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; }
          * { box-sizing: border-box; }
        `}</style>
      </Head>

      <div className="no-print" style={{ maxWidth:780, margin:'0 auto 16px', display:'flex', gap:10 }}>
        <button onClick={() => router.back()} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #ccc', background:'#fff', cursor:'pointer', fontSize:13 }}>← Back</button>
        <button onClick={() => window.print()} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#2196F3', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:13 }}>🖨️ Print / Save PDF</button>
      </div>

      <div className="invoice" style={{ maxWidth:780, margin:'0 auto', background:'#fff', borderRadius:12, boxShadow:'0 4px 32px rgba(0,0,0,0.12)', padding:'44px 52px', color:'#111' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:40, paddingBottom:24, borderBottom:'3px solid #1a1a2e' }}>
          <div>
            <h1 style={{ fontSize:30, fontWeight:900, color:'#1a1a2e', margin:'0 0 6px', letterSpacing:-1 }}>{shop?.name}</h1>
            {shop?.address && <p style={{ fontSize:12, color:'#666', margin:'2px 0' }}>📍 {shop.address}</p>}
            {shop?.phone && <p style={{ fontSize:12, color:'#666', margin:'2px 0' }}>📞 {shop.phone}</p>}
            {shop?.email && <p style={{ fontSize:12, color:'#666', margin:'2px 0' }}>✉️ {shop.email}</p>}
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ background:'#1a1a2e', color:'#fff', borderRadius:8, padding:'6px 20px', marginBottom:10, display:'inline-block' }}>
              <p style={{ fontSize:13, letterSpacing:3, margin:0, fontWeight:700 }}>INVOICE</p>
            </div>
            <p style={{ fontSize:20, fontWeight:900, color:'#1a1a2e', margin:'4px 0 2px' }}>{invoiceNo}</p>
            <p style={{ fontSize:12, color:'#666', margin:0 }}>{new Date(sale.sale_date || sale.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</p>
          </div>
        </div>

        {/* Bill To + Details */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:32, padding:20, background:'#f7f8fa', borderRadius:10 }}>
          <div>
            <p style={{ fontSize:10, letterSpacing:2, color:'#999', fontWeight:700, marginBottom:8 }}>BILL TO</p>
            <p style={{ fontSize:16, fontWeight:800, margin:'0 0 4px', color:'#1a1a2e' }}>{sale.customers?.name || 'Walk-in Customer'}</p>
            {sale.customers?.phone && <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>{sale.customers.phone}</p>}
            {sale.customers?.email && <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>{sale.customers.email}</p>}
            {sale.customers?.address && <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>{sale.customers.address}</p>}
          </div>
          <div>
            <p style={{ fontSize:10, letterSpacing:2, color:'#999', fontWeight:700, marginBottom:8 }}>DETAILS</p>
            {[
              ['Invoice No', invoiceNo],
              ['Date', new Date(sale.sale_date || sale.created_at).toLocaleDateString()],
              ['Served by', sale.app_users?.full_name || '—'],
              ['Payment', sale.payment_method?.toUpperCase()],
            ].map(([l,v]) => (
              <div key={l} style={{ display:'flex', gap:8, fontSize:12, marginBottom:4 }}>
                <span style={{ color:'#888', minWidth:80 }}>{l}:</span>
                <span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Items */}
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:28 }}>
          <thead>
            <tr style={{ background:'#1a1a2e' }}>
              {['#','Description','Part No.','Qty','Unit Price','Amount'].map((h,i) => (
                <th key={h} style={{ padding:'11px 14px', textAlign: i>=3?'right':'left', fontSize:10, letterSpacing:1, color:'#fff', fontWeight:700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const pn = partField && prodCfv[it.product_id]?.[partField.id]
              return (
                <tr key={i} style={{ borderBottom:'1px solid #eee', background:i%2===0?'#fff':'#fafafa' }}>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#aaa' }}>{i+1}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600 }}>{it.product_name}</td>
                  <td style={{ padding:'10px 14px', fontSize:11, color:'#7b2cf7', fontFamily:'monospace' }}>{pn||'—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, textAlign:'right' }}>{it.qty}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, textAlign:'right', color:'#555' }}>{fmt(it.unit_price)}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, textAlign:'right' }}>{fmt(it.line_total || it.unit_price * it.qty)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:32 }}>
          <div style={{ width:300 }}>
            {sale.discount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13, color:'#666', borderBottom:'1px solid #eee' }}>
                <span>Discount</span><span style={{ color:'#e05c00' }}>-{fmt(sale.discount)}</span>
              </div>
            )}
            {sale.transport_fee > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13, color:'#666', borderBottom:'1px solid #eee' }}>
                <span>Transport {sale.transport_destination?`(${sale.transport_destination})`:''}</span>
                <span>{fmt(sale.transport_fee)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 0', fontSize:20, fontWeight:900, borderTop:'2px solid #1a1a2e', marginTop:6 }}>
              <span>TOTAL</span><span style={{ color:'#1a1a2e' }}>{fmt(sale.total)}</span>
            </div>
            {isSplit ? (
              <div style={{ background:'#fff8f0', border:'1px solid #ffd0a0', borderRadius:8, padding:'10px 14px', marginTop:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#25a244', marginBottom:6 }}>
                  <span>Cash Paid</span><span style={{ fontWeight:700 }}>{fmt(sale.cash_paid||0)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, color:'#e05c00', fontWeight:800, borderTop:'1px dashed #ffd0a0', paddingTop:6 }}>
                  <span>Balance Due</span><span>{fmt(sale.loan_balance||0)}</span>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13, color:'#25a244' }}>
                <span>Amount Paid ({sale.payment_method?.toUpperCase()})</span>
                <span style={{ fontWeight:700 }}>{fmt(sale.total)}</span>
              </div>
            )}
          </div>
        </div>

        {sale.notes && (
          <div style={{ padding:14, background:'#f7f8fa', borderRadius:8, marginBottom:24 }}>
            <p style={{ fontSize:10, color:'#999', letterSpacing:1.5, marginBottom:4 }}>NOTES</p>
            <p style={{ fontSize:13, color:'#444', margin:0 }}>{sale.notes}</p>
          </div>
        )}

        <div style={{ borderTop:'2px solid #eee', paddingTop:20, textAlign:'center' }}>
          <p style={{ fontSize:13, color:'#888', margin:0 }}>Thank you for your business!</p>
          <p style={{ fontSize:11, color:'#bbb', marginTop:4 }}>thedashboard.co.tz</p>
        </div>
      </div>
    </>
  )
}
