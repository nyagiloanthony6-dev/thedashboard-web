import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function Batches() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | active | depleted
  const [detail, setDetail] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    let shopData = prof?.shops
    if (!shopData) {
      const { data: owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    setProfile(prof); setShop(shopData)
    const { data } = await supabase.from('stock_batches')
      .select('*')
      .eq('shop_id', shopData.id)
      .order('received_date', { ascending: false })
    setBatches(data || [])
    setLoading(false)
  }

  const filtBatches = batches.filter(b => {
    const q = search.toLowerCase()
    const matchSearch = !q || b.product_name?.toLowerCase().includes(q) || (b.part_number||'').toLowerCase().includes(q) || (b.vendor_name||'').toLowerCase().includes(q)
    const matchFilter = filter === 'all' || b.status === filter
    return matchSearch && matchFilter
  })

  // Summary stats
  const totalBatches = batches.length
  const activeBatches = batches.filter(b => b.status === 'active').length
  const totalPieces = batches.reduce((a, b) => a + (b.qty_pieces || 0), 0)
  const remainingPieces = batches.reduce((a, b) => a + (b.qty_remaining || 0), 0)
  const totalInvested = batches.reduce((a, b) => a + (b.total_cost_tzs || 0), 0)

  // Group by product for summary
  const byProduct = {}
  batches.forEach(b => {
    const key = b.part_number || b.product_name
    if (!byProduct[key]) byProduct[key] = { name: b.product_name, part: b.part_number, batches: 0, totalPcs: 0, remaining: 0, totalCost: 0, avgCostPerPc: 0 }
    byProduct[key].batches++
    byProduct[key].totalPcs += b.qty_pieces || 0
    byProduct[key].remaining += b.qty_remaining || 0
    byProduct[key].totalCost += b.total_cost_tzs || 0
  })
  const productSummary = Object.values(byProduct).map(p => ({
    ...p,
    avgCostPerPc: p.totalPcs > 0 ? Math.round(p.totalCost / p.totalPcs) : 0
  })).sort((a, b) => b.totalPcs - a.totalPcs)

  const statusColor = s => s === 'active' ? '#25d366' : '#484f58'
  const pctRemaining = b => b.qty_pieces > 0 ? Math.round(b.qty_remaining / b.qty_pieces * 100) : 0

  const C = {
    card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 16 },
    input: { background: '#0d1117', border: '1.5px solid #30363d', borderRadius: 8, color: '#e6edf3', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}30`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }),
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0d1117' }}><div style={{ width:36, height:36, border:'3px solid #30363d', borderTopColor:'#a78bfa', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Stock Batches — TheDashboard</title></Head>
      <Layout title="Stock Batches" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
          {[
            { l:'Total Batches', v:totalBatches, c:'#2196F3' },
            { l:'Active Batches', v:activeBatches, c:'#25d366' },
            { l:'Pieces Received', v:totalPieces.toLocaleString(), c:'#ffb547' },
            { l:'Pieces Remaining', v:remainingPieces.toLocaleString(), c:'#a78bfa' },
            { l:'Total Invested', v:fmtK(totalInvested), c:'#ff4d6d' },
          ].map(k => (
            <div key={k.l} style={C.card}>
              <p style={{ fontSize:10, color:'#7d8590', letterSpacing:0.8 }}>{k.l.toUpperCase()}</p>
              <p style={{ fontSize:18, fontWeight:900, color:k.c, marginTop:6 }}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by product, part number or vendor..." style={{ ...C.input, flex:1, minWidth:200 }}/>
          <div style={{ display:'flex', gap:6 }}>
            {[['all','All'],['active','Active'],['depleted','Depleted']].map(([k,l]) => (
              <button key={k} onClick={()=>setFilter(k)} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid', borderColor:filter===k?'#a78bfa':'#30363d', background:filter===k?'rgba(167,139,250,0.15)':'transparent', color:filter===k?'#a78bfa':'#7d8590', fontWeight:filter===k?700:400, fontSize:12, cursor:'pointer' }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:detail?'1fr 380px':'1fr', gap:16 }}>
          {/* Batch list */}
          <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:12, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #30363d' }}>
                  {['Batch Ref','Product','Part No.','Vendor','Received','Boxes','Pieces','Remaining','Cost/Pc','Status'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, color:'#7d8590', letterSpacing:0.8, fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtBatches.map((b, i) => {
                  const pct = pctRemaining(b)
                  return (
                    <tr key={b.id} onClick={() => setDetail(detail?.id === b.id ? null : b)}
                      style={{ borderBottom: i < filtBatches.length-1 ? '1px solid #30363d' : 'none', cursor:'pointer', background: detail?.id === b.id ? 'rgba(167,139,250,0.05)' : 'transparent' }}
                      onMouseEnter={e => detail?.id !== b.id && (e.currentTarget.style.background='rgba(255,255,255,0.02)')}
                      onMouseLeave={e => detail?.id !== b.id && (e.currentTarget.style.background='transparent')}>
                      <td style={{ padding:'10px 14px' }}>
                        <p style={{ fontSize:11, fontFamily:'monospace', color:'#a78bfa', fontWeight:700 }}>{b.batch_ref||'—'}</p>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <p style={{ fontSize:13, fontWeight:600 }}>{b.image_emoji||'📦'} {b.product_name}</p>
                        <p style={{ fontSize:10, color:'#484f58', marginTop:1 }}>{b.category||''}</p>
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:11, color:'#a78bfa', fontFamily:'monospace' }}>{b.part_number||'—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#7d8590' }}>{b.vendor_name||'—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:11, color:'#7d8590' }}>{b.received_date}</td>
                      <td style={{ padding:'10px 14px', fontSize:13 }}>{b.qty_boxes}</td>
                      <td style={{ padding:'10px 14px', fontSize:13 }}>{b.qty_pieces}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:4, background:'#30363d', borderRadius:2, minWidth:40 }}>
                            <div style={{ height:'100%', width:pct+'%', background:pct>50?'#25d366':pct>20?'#ffb547':'#ff4d6d', borderRadius:2 }}/>
                          </div>
                          <span style={{ fontSize:11, color:pct>50?'#25d366':pct>20?'#ffb547':'#ff4d6d', fontWeight:700, minWidth:30 }}>{b.qty_remaining}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#ffb547', fontWeight:700 }}>{fmt(b.landed_cost_per_piece)}</td>
                      <td style={{ padding:'10px 14px' }}><span style={C.badge(statusColor(b.status))}>{b.status?.toUpperCase()}</span></td>
                    </tr>
                  )
                })}
                {!filtBatches.length && <tr><td colSpan={9} style={{ padding:40, textAlign:'center', color:'#484f58' }}>No batches yet. Receive a purchase order to create the first batch.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {detail && (
            <div style={C.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  {detail.batch_ref&&<p style={{fontSize:10,color:'#a78bfa',fontFamily:'monospace',fontWeight:700,marginBottom:4}}>{detail.batch_ref}</p>}
              <h2 style={{ fontSize:15, fontWeight:800 }}>{detail.image_emoji} {detail.product_name}</h2>
                  {detail.part_number && <p style={{ fontSize:11, color:'#a78bfa', fontFamily:'monospace', marginTop:2 }}>#{detail.part_number}</p>}
                </div>
                <button onClick={()=>setDetail(null)} style={{ background:'none', border:'none', color:'#7d8590', fontSize:18, cursor:'pointer' }}>✕</button>
              </div>

              <span style={C.badge(statusColor(detail.status))}>{detail.status?.toUpperCase()}</span>

              <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { l:'Vendor', v:detail.vendor_name||'—', c:'#e6edf3' },
                  { l:'Order Date', v:detail.order_date||'—', c:'#7d8590' },
                  { l:'Received', v:detail.received_date, c:'#25d366' },
                  { l:'Boxes', v:detail.qty_boxes, c:'#e6edf3' },
                  { l:'Pcs/Box', v:detail.pieces_per_box, c:'#e6edf3' },
                  { l:'Total Pieces', v:detail.qty_pieces, c:'#ffb547' },
                  { l:'Remaining', v:detail.qty_remaining, c:detail.qty_remaining>0?'#25d366':'#ff4d6d' },
                  { l:'Sold', v:(detail.qty_pieces||0)-(detail.qty_remaining||0), c:'#2196F3' },
                ].map(k => (
                  <div key={k.l} style={{ background:'#0d1117', borderRadius:8, padding:10 }}>
                    <p style={{ fontSize:9, color:'#7d8590', letterSpacing:0.8 }}>{k.l.toUpperCase()}</p>
                    <p style={{ fontSize:14, fontWeight:700, color:k.c, marginTop:4 }}>{k.v}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ marginTop:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:11, color:'#7d8590' }}>Stock used</span>
                  <span style={{ fontSize:11, fontWeight:700 }}>{100-pctRemaining(detail)}%</span>
                </div>
                <div style={{ height:8, background:'#30363d', borderRadius:4 }}>
                  <div style={{ height:'100%', width:(100-pctRemaining(detail))+'%', background:'#2196F3', borderRadius:4, transition:'width 0.3s' }}/>
                </div>
              </div>

              {/* Cost breakdown */}
              <div style={{ marginTop:14, background:'#0d1117', borderRadius:10, padding:12 }}>
                <p style={{ fontSize:10, color:'#ffb547', letterSpacing:0.8, fontWeight:700, marginBottom:10 }}>LANDED COST</p>
                {[
                  { l:`Unit Cost (${detail.currency})`, v:`${detail.currency} ${(detail.unit_cost||0).toLocaleString()}` },
                  { l:'Exchange Rate', v:`1 ${detail.currency} = TZS ${detail.exchange_rate}` },
                  { l:'Unit Cost (TZS)', v:fmt(detail.unit_cost_tzs) },
                  { l:'Total Landed Cost', v:fmt(detail.total_cost_tzs) },
                  { l:'Cost per Piece', v:fmt(detail.landed_cost_per_piece), bold:true, c:'#ffb547' },
                ].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #30363d' }}>
                    <span style={{ fontSize:12, color:'#7d8590' }}>{r.l}</span>
                    <span style={{ fontSize:12, fontWeight:r.bold?800:600, color:r.c||'#e6edf3' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Product Summary */}
        {productSummary.length > 0 && (
          <div style={{ marginTop:24 }}>
            <p style={{ fontSize:11, color:'#7d8590', letterSpacing:0.8, marginBottom:12 }}>PRODUCT BATCH SUMMARY</p>
            <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #30363d' }}>
                    {['Product','Part No.','Batches','Total Received','Remaining','Avg Cost/Pc','Total Invested'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, color:'#7d8590', letterSpacing:0.8, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productSummary.map((p, i) => (
                    <tr key={i} style={{ borderBottom: i < productSummary.length-1 ? '1px solid #30363d' : 'none' }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600 }}>{p.name}</td>
                      <td style={{ padding:'10px 14px', fontSize:11, color:'#a78bfa', fontFamily:'monospace' }}>{p.part||'—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:'#2196F3' }}>{p.batches}</td>
                      <td style={{ padding:'10px 14px', fontSize:13 }}>{p.totalPcs.toLocaleString()} pcs</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color: p.remaining>0?'#25d366':'#ff4d6d', fontWeight:700 }}>{p.remaining.toLocaleString()} pcs</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:'#ffb547', fontWeight:700 }}>{fmt(p.avgCostPerPc)}</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:'#a78bfa', fontWeight:700 }}>{fmtK(p.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
