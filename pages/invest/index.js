import { useEffect, useState } from 'react'
import Head from 'next/head'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://woxymyidsmoskeifnqpw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHlteWlkc21vc2tlaWZucXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzExNDcsImV4cCI6MjA5Mzc0NzE0N30.LR-q0IwqF6pjdmn-uVomrP_U5gMamL933wz8sCSJTXs'
)

const fmt  = (n) => 'TZS ' + Number(n||0).toLocaleString()
const fmtK = (n) => n>=1000000 ? 'TZS ' + (n/1000000).toFixed(1) + 'M' : n>=1000 ? 'TZS ' + (n/1000).toFixed(0) + 'K' : fmt(n)

const SHOP_ID = 'bb1e7780-cef6-4a35-871f-7668b0dd9de1'

export default function PublicInvestor() {
  const [products, setProducts] = useState([])
  const [shop, setShop]         = useState(null)
  const [selected, setSelected] = useState(null)
  const [cartons, setCartons]   = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: shopData }, { data: prods }] = await Promise.all([
      supabase.from('shops').select('name,address,phone').eq('id', SHOP_ID).single(),
      supabase.from('investor_fund_products').select('*').eq('shop_id', SHOP_ID).order('created_at'),
    ])
    setShop(shopData)
    setProducts(prods || [])
    if (prods?.length) {
      setSelected(prods[0])
      setCartons(String(prods[0].min_cartons || 10))
    }
    setLoading(false)
  }

  // Calculations
  const calc = () => {
    if (!selected || !cartons) return null
    const bpc      = selected.boxes_per_carton || 4
    const minC     = selected.min_cartons || 10
    const numC     = parseInt(cartons) || 0
    const boxes    = numC * bpc
    const capital  = boxes * (selected.buy_price || 0)
    const revenue  = boxes * (selected.sell_mid || 0)
    const gross    = revenue - capital
    const mgmt     = Math.round(gross * (selected.mgmt_fee || 5) / 100)
    const net      = gross - mgmt
    const invProfit= Math.round(net * (selected.inv_share || 70) / 100)
    const coProfit = Math.round(net * (selected.co_share  || 30) / 100)
    const total    = capital + invProfit
    const roi      = capital > 0 ? (invProfit / capital * 100) : 0
    const minOk    = numC >= minC
    return { numC, bpc, boxes, capital, revenue, gross, mgmt, net, invProfit, coProfit, total, roi, minOk, minC, minBoxes: minC * bpc, minCapital: minC * bpc * (selected.buy_price || 0) }
  }

  const r = calc()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0e1a' }}>
      <div style={{ width:40, height:40, border:'3px solid #1e2840', borderTopColor:'#25d366', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head>
        <title>Invest — {shop?.name || 'G2K Auto Parts'}</title>
        <meta name="description" content="Invest in G2K Auto Parts inventory fund and earn returns in 90 days"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </Head>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0a0e1a; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif; }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        input:focus { outline:none; border-color:#25d366 !important; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1e2840;border-radius:2px}
      `}</style>

      {/* Hero */}
      <div style={{ background:'linear-gradient(160deg,#0f1f12 0%,#0a0e1a 60%)', borderBottom:'1px solid #1e2840', padding:'40px 20px 32px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:'rgba(37,211,102,0.1)', border:'1px solid #25d36630', borderRadius:20, padding:'6px 16px', marginBottom:20 }}>
          <span style={{ width:8, height:8, background:'#25d366', borderRadius:'50%', display:'inline-block', animation:'pulse 2s infinite' }}/>
          <span style={{ fontSize:12, color:'#25d366', fontWeight:600 }}>Fund Open</span>
        </div>
        <h1 style={{ fontSize:32, fontWeight:900, marginBottom:8, lineHeight:1.2 }}>
          {shop?.name || 'G2K Auto Parts'}<br/>
          <span style={{ color:'#25d366' }}>Inventory Fund</span>
        </h1>
        <p style={{ fontSize:15, color:'#64748b', maxWidth:480, margin:'0 auto 8px' }}>
          Invest in real auto parts stock. Get your capital back + profit share after each 90-day cycle.
        </p>
        <p style={{ fontSize:12, color:'#334155', marginTop:6 }}>Dar es Salaam, Tanzania</p>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 16px 60px' }}>

        {/* How it works */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28, animation:'fadeUp 0.4s ease' }}>
          {[
            { icon:'💸', title:'You Invest', desc:'Buy cartons of fast-moving stock at landed cost' },
            { icon:'📦', title:'Stock Sells', desc:'Products sell at G2K shop over 90 days' },
            { icon:'💰', title:'You Earn', desc:'Get capital back + your % of net profit' },
          ].map(s => (
            <div key={s.title} style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:12, padding:'16px 12px', textAlign:'center' }}>
              <p style={{ fontSize:24, marginBottom:8 }}>{s.icon}</p>
              <p style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{s.title}</p>
              <p style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Product selector */}
        {products.length > 1 && (
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:11, color:'#475569', letterSpacing:0.8, fontWeight:600, marginBottom:10 }}>SELECT PRODUCT TO INVEST IN</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8 }}>
              {products.map(p => (
                <button key={p.id} onClick={() => { setSelected(p); setCartons(String(p.min_cartons || 10)) }}
                  style={{ padding:'12px', borderRadius:10, border:`2px solid ${selected?.id===p.id?'#25d366':'#1e2840'}`, background:selected?.id===p.id?'rgba(37,211,102,0.08)':'#0f172a', cursor:'pointer', textAlign:'left', transition:'border-color 0.15s' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:4 }}>{p.name}</p>
                  {p.description && <p style={{ fontSize:10, color:'#64748b' }}>{p.description}</p>}
                  {selected?.id===p.id && <p style={{ fontSize:10, color:'#25d366', marginTop:4, fontWeight:700 }}>✓ Selected</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* Product info */}
            <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:14, padding:20, marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <h2 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>{selected.name}</h2>
                  {selected.description && <p style={{ fontSize:12, color:'#64748b' }}>{selected.description}</p>}
                </div>
                <div style={{ background:'rgba(37,211,102,0.1)', border:'1px solid #25d36630', borderRadius:8, padding:'6px 12px', textAlign:'center' }}>
                  <p style={{ fontSize:11, color:'#25d366', fontWeight:600 }}>90-day cycle</p>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { l:'Boxes per Carton', v:`${selected.boxes_per_carton || 4} boxes`, c:'#2196F3' },
                  { l:'Min Investment', v:`${selected.min_cartons || 10} cartons`, c:'#ffb547' },
                  { l:`Min Boxes`, v:`${(selected.min_cartons||10)*(selected.boxes_per_carton||4)} boxes`, c:'#a78bfa' },
                ].map(k => (
                  <div key={k.l} style={{ background:'#0a0e1a', borderRadius:8, padding:10, textAlign:'center' }}>
                    <p style={{ fontSize:11, color:'#475569', marginBottom:4 }}>{k.l}</p>
                    <p style={{ fontSize:14, fontWeight:800, color:k.c }}>{k.v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Carton input */}
            <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:14, padding:20, marginBottom:16 }}>
              <p style={{ fontSize:11, color:'#475569', letterSpacing:0.8, fontWeight:600, marginBottom:12 }}>HOW MANY CARTONS DO YOU WANT TO INVEST?</p>
              <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                <button onClick={()=>setCartons(c=>String(Math.max(selected.min_cartons||10,parseInt(c||0)-1)))}
                  style={{ width:44, height:44, borderRadius:10, border:'1px solid #1e2840', background:'#0a0e1a', color:'#e2e8f0', fontSize:20, cursor:'pointer' }}>−</button>
                <input value={cartons} onChange={e=>setCartons(e.target.value)} type="number" min={selected.min_cartons||10}
                  style={{ flex:1, background:'#0a0e1a', border:'2px solid #25d36640', borderRadius:10, color:'#25d366', padding:'12px', fontSize:24, fontWeight:900, textAlign:'center' }}/>
                <button onClick={()=>setCartons(c=>String(parseInt(c||0)+1))}
                  style={{ width:44, height:44, borderRadius:10, border:'1px solid #1e2840', background:'#0a0e1a', color:'#e2e8f0', fontSize:20, cursor:'pointer' }}>+</button>
              </div>
              <p style={{ textAlign:'center', fontSize:12, color:'#475569' }}>
                {cartons} cartons = {(parseInt(cartons)||0)*(selected.boxes_per_carton||4)} boxes
              </p>
              {r && !r.minOk && (
                <div style={{ background:'rgba(255,77,109,0.08)', border:'1px solid #ff4d6d30', borderRadius:8, padding:10, marginTop:10, textAlign:'center' }}>
                  <p style={{ fontSize:12, color:'#ff4d6d', fontWeight:700 }}>⚠️ Minimum is {r.minC} cartons ({r.minBoxes} boxes)</p>
                  <p style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Min capital: TZS {r.minCapital.toLocaleString()}</p>
                </div>
              )}
              {r && r.minOk && parseInt(cartons) > 40 && (
                <div style={{ background:'rgba(255,181,71,0.08)', border:'1px solid #ffb54730', borderRadius:8, padding:10, marginTop:10, textAlign:'center' }}>
                  <p style={{ fontSize:12, color:'#ffb547', fontWeight:700 }}>⚠️ Orders above 40 cartons require prior arrangement</p>
                  <p style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Please contact us directly to discuss larger investments</p>
                </div>
              )}
            </div>

            {/* Results */}
            {r && r.minOk && r.capital > 0 && (
              <div style={{ animation:'fadeUp 0.3s ease' }}>
                {/* Capital & Return */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                  <div style={{ background:'rgba(255,77,109,0.08)', border:'1px solid #ff4d6d30', borderRadius:14, padding:20, textAlign:'center' }}>
                    <p style={{ fontSize:12, color:'#ff4d6d', fontWeight:600, marginBottom:6 }}>💸 YOU INVEST</p>
                    <p style={{ fontSize:26, fontWeight:900, color:'#ff4d6d' }}>{fmtK(r.capital)}</p>
                    <p style={{ fontSize:11, color:'#475569', marginTop:4 }}>{r.numC} cartons × {r.bpc} boxes</p>
                  </div>
                  <div style={{ background:'rgba(37,211,102,0.08)', border:'1px solid #25d36630', borderRadius:14, padding:20, textAlign:'center' }}>
                    <p style={{ fontSize:12, color:'#25d366', fontWeight:600, marginBottom:6 }}>💰 YOU RECEIVE</p>
                    <p style={{ fontSize:26, fontWeight:900, color:'#25d366' }}>{fmtK(r.total)}</p>
                    <p style={{ fontSize:11, color:'#475569', marginTop:4 }}>After 90 days</p>
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{ background:'#0f172a', border:'1px solid #1e2840', borderRadius:14, padding:20, marginBottom:16 }}>
                  <p style={{ fontSize:11, color:'#475569', letterSpacing:0.8, fontWeight:600, marginBottom:14 }}>HOW YOUR MONEY WORKS</p>
                  {[
                    { l:`Total sales revenue (${r.numC} cartons × ${r.bpc} boxes)`, v:`TZS ${r.revenue.toLocaleString()}`, c:'#2196F3', sub:'Expected from selling all stock' },
                    { l:'Minus: Your capital back', v:`−TZS ${r.capital.toLocaleString()}`, c:'#ff4d6d', sub:'Returned to you first' },
                    { l:'Gross Profit', v:`TZS ${r.gross.toLocaleString()}`, c:'#e2e8f0', sub:'', divider:true },
                    { l:`Management fee (${selected.mgmt_fee||5}%)`, v:`−TZS ${r.mgmt.toLocaleString()}`, c:'#475569', sub:'Operations cost' },
                    { l:'Net Profit', v:`TZS ${r.net.toLocaleString()}`, c:'#e2e8f0', sub:'', divider:true },
                    { l:`Your share (${selected.inv_share||70}% of net profit)`, v:`TZS ${r.invProfit.toLocaleString()}`, c:'#25d366', sub:'Your earnings', bold:true },
                    { l:`G2K share (${selected.co_share||30}% of net profit)`, v:`TZS ${r.coProfit.toLocaleString()}`, c:'#a78bfa', sub:'Company earnings' },

                  ].map((s, i) => (
                    <div key={i}>
                      {s.divider && <div style={{ borderTop:'1px dashed #1e2840', margin:'8px 0' }}/>}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
                        <div>
                          <p style={{ fontSize:12, color:s.bold?'#e2e8f0':'#94a3b8', fontWeight:s.bold?700:400 }}>{s.l}</p>
                          {s.sub && <p style={{ fontSize:10, color:'#475569', marginTop:1 }}>{s.sub}</p>}
                        </div>
                        <p style={{ fontSize:s.bold?15:13, fontWeight:s.bold?900:600, color:s.c }}>{s.v}</p>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid #1e2840', paddingTop:12, marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <p style={{ fontSize:14, fontWeight:700 }}>Total you receive after 90 days</p>
                    <p style={{ fontSize:20, fontWeight:900, color:'#25d366' }}>{fmtK(r.total)}</p>
                  </div>
                </div>

                {/* ROI highlight */}
                <div style={{ background:'linear-gradient(135deg,rgba(37,211,102,0.1),rgba(33,150,243,0.1))', border:'1px solid #25d36630', borderRadius:14, padding:20, textAlign:'center', marginBottom:20 }}>
                  <p style={{ fontSize:13, color:'#94a3b8', marginBottom:6 }}>Your return on investment</p>
                  <p style={{ fontSize:40, fontWeight:900, color:'#25d366', marginBottom:4 }}>{r.roi.toFixed(1)}%</p>
                  <p style={{ fontSize:12, color:'#475569' }}>in 90 days · {(r.roi*365/90).toFixed(1)}% annualized</p>
                  <div style={{ marginTop:12, padding:'8px 16px', background:'rgba(0,0,0,0.3)', borderRadius:8, display:'inline-block' }}>
                    <p style={{ fontSize:11, color:'#475569' }}>vs Bank savings: ~8%/year</p>
                  </div>
                </div>

                {/* CTA */}
                <div style={{ background:'#0f172a', border:'1px solid #25d36630', borderRadius:14, padding:24, textAlign:'center' }}>
                  <p style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Ready to invest?</p>
                  <p style={{ fontSize:13, color:'#64748b', marginBottom:16, lineHeight:1.6 }}>
                    Contact us to get started. Your capital is always returned in full before profit is shared.
                    Monthly sales reports provided as proof.
                  </p>
                  <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                    {shop?.phone && (
                      <a href={`tel:${shop.phone}`} style={{ padding:'12px 24px', borderRadius:10, background:'#25d366', color:'#000', fontWeight:700, fontSize:14, textDecoration:'none' }}>
                        📞 Call Us
                      </a>
                    )}
                    {shop?.phone && (
                      <a href={`https://wa.me/${shop.phone.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"
                        style={{ padding:'12px 24px', borderRadius:10, background:'#128C7E', color:'#fff', fontWeight:700, fontSize:14, textDecoration:'none' }}>
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                  <p style={{ fontSize:11, color:'#334155', marginTop:16 }}>
                    {shop?.name} · {shop?.address || 'Dar es Salaam, Tanzania'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {!products.length && (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#475569' }}>
            <p style={{ fontSize:32, marginBottom:12 }}>⏳</p>
            <p style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Fund products coming soon</p>
            <p style={{ fontSize:13 }}>Check back shortly</p>
          </div>
        )}
      </div>
    </>
  )
}
