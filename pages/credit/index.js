import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function Credit() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [batches, setBatches] = useState([])
  const [prods, setProds] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // New batch form
  const [recipient, setRecipient] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [sentDate, setSentDate] = useState(today())
  const [items, setItems] = useState([])
  const [prodSearch, setProdSearch] = useState('')

  // Payment form
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  useEffect(() => { loadData() }, [])

  const showToast = (msg, c='#25d366') => { setToast({msg,c}); setTimeout(()=>setToast(''),3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const [br, pr] = await Promise.all([
      supabase.from('credit_batches').select('*,credit_batch_items(*),credit_payments(*),credit_returns(*)').eq('shop_id', shopId).order('created_at', { ascending:false }),
      supabase.from('products').select('*').eq('shop_id', shopId).eq('is_active', true).order('name'),
    ])
    setBatches(br.data || [])
    setProds(pr.data || [])
    setLoading(false)
  }

  const addItem = (p) => {
    if (items.find(i => i.product.id === p.id)) return
    const price = p.wholesale_price || p.sell_price || 0
    setItems(prev => [...prev, { product: p, qty: '', credit_rate: String(price) }])
    setProdSearch('')
  }

  const saveBatch = async () => {
    if (!recipient.trim()) { alert('Enter recipient name'); return }
    const valid = items.filter(i => parseFloat(i.qty) > 0)
    if (!valid.length) { alert('Add at least one product with quantity'); return }
    setSaving(true)
    const totalValue = valid.reduce((a, i) => a + (parseFloat(i.credit_rate)||0)*(parseFloat(i.qty)||0), 0)
    const { data: batch, error } = await supabase.from('credit_batches').insert({
      shop_id: shop.id, recipient_name: recipient.trim(), recipient_phone: recipientPhone.trim()||null,
      sent_date: sentDate, total_value: totalValue, status:'active', created_by: profile.id,
    }).select().single()
    if (error) { alert(error.message); setSaving(false); return }
    await supabase.from('credit_batch_items').insert(valid.map(i => ({
      batch_id: batch.id, product_id: i.product.id, product_name: i.product.name,
      image_emoji: i.product.image_emoji||'📦', qty: parseFloat(i.qty),
      credit_rate: parseFloat(i.credit_rate)||0,
      subtotal: (parseFloat(i.qty)||0)*(parseFloat(i.credit_rate)||0),
    })))
    // Deduct stock
    for (const i of valid) {
      await supabase.from('products').update({ wholesale_stock: Math.max(0,(i.product.wholesale_stock||0)-parseFloat(i.qty)), stock: Math.max(0,(i.product.stock||0)-parseFloat(i.qty)) }).eq('id', i.product.id)
    }
    const newBatch = { ...batch, credit_batch_items: valid.map(i=>({...i,product_name:i.product.name,image_emoji:i.product.image_emoji,qty:parseFloat(i.qty),credit_rate:parseFloat(i.credit_rate),subtotal:(parseFloat(i.qty)||0)*(parseFloat(i.credit_rate)||0)})), credit_payments:[], credit_returns:[] }
    setBatches(p => [newBatch, ...p])
    setRecipient(''); setRecipientPhone(''); setSentDate(today()); setItems([])
    setSaving(false); setTab('list')
    showToast('Credit batch saved!')
  }

  const recordPayment = async () => {
    const amt = parseFloat(payAmount)||0
    if (amt<=0) { alert('Enter valid amount'); return }
    setPaySaving(true)
    const { data: pmt, error } = await supabase.from('credit_payments').insert({
      batch_id: payModal.id, amount: amt, payment_date: payDate, note: payNote.trim()||null,
    }).select().single()
    if (error) { alert(error.message); setPaySaving(false); return }
    const totalPaid = [...(payModal.credit_payments||[]), pmt].reduce((a,p)=>a+(Number(p.amount)||0),0)
    const fullyPaid = totalPaid >= (payModal.total_value||0)
    if (fullyPaid) await supabase.from('credit_batches').update({ status:'paid' }).eq('id', payModal.id)
    setBatches(prev => prev.map(b => b.id===payModal.id ? { ...b, credit_payments:[...(b.credit_payments||[]),pmt], status:fullyPaid?'paid':b.status } : b))
    if (detail?.id===payModal.id) setDetail(d => ({ ...d, credit_payments:[...(d.credit_payments||[]),pmt], status:fullyPaid?'paid':d.status }))
    setPayModal(null); setPayAmount(''); setPayDate(today()); setPayNote('')
    setPaySaving(false)
    showToast('Payment recorded!')
  }

  const getPaid = b => (b.credit_payments||[]).reduce((a,p)=>a+(Number(p.amount)||0),0)
  const getOwing = b => Math.max(0,(b.total_value||0)-getPaid(b))

  const totalOut = batches.filter(b=>b.status!=='paid').reduce((a,b)=>a+(b.total_value||0),0)
  const totalOwed = batches.filter(b=>b.status!=='paid').reduce((a,b)=>a+getOwing(b),0)
  const totalCollected = batches.reduce((a,b)=>a+getPaid(b),0)

  const C = {
    card: { background:'#161b22', border:'1px solid #30363d', borderRadius:12, padding:16 },
    input: { background:'#0d1117', border:'1.5px solid #30363d', borderRadius:8, color:'#e6edf3', padding:'9px 12px', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
    label: { fontSize:10, color:'#7d8590', letterSpacing:0.8, display:'block', marginBottom:5 },
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0d1117'}}><div style={{width:36,height:36,border:'3px solid #30363d',borderTopColor:'#25d366',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Credit — TheDashboard</title></Head>
      <Layout title="Credit Management" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:#484f58}`}</style>
        {toast && <div style={{position:'fixed',top:20,right:20,background:toast.c,color:'#000',padding:'12px 20px',borderRadius:10,fontWeight:700,fontSize:13,zIndex:9999}}>{toast.msg}</div>}

        {/* Summary */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:20}}>
          {[
            {l:'Total Sent Out',v:fmtK(totalOut),c:'#ffb547'},
            {l:'Still Owed',v:fmtK(totalOwed),c:'#ff4d6d'},
            {l:'Collected',v:fmtK(totalCollected),c:'#25d366'},
            {l:'Active Batches',v:batches.filter(b=>b.status!=='paid').length,c:'#2196F3'},
          ].map(k=>(
            <div key={k.l} style={C.card}>
              <p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8}}>{k.l.toUpperCase()}</p>
              <p style={{fontSize:20,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[['list','📋 Batches'],['new','➕ New Batch']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:'9px 20px',borderRadius:8,border:'1px solid',borderColor:tab===k?'#25d366':'#30363d',background:tab===k?'rgba(37,211,102,0.15)':'transparent',color:tab===k?'#25d366':'#7d8590',fontWeight:tab===k?700:400,fontSize:13,cursor:'pointer'}}>{l}</button>
          ))}
        </div>

        {/* BATCHES LIST */}
        {tab==='list' && (
          <div>
            {detail ? (
              <div>
                <button onClick={()=>setDetail(null)} style={{marginBottom:16,padding:'8px 16px',borderRadius:8,border:'1px solid #30363d',background:'transparent',color:'#7d8590',fontSize:13,cursor:'pointer'}}>← Back to list</button>
                <div style={C.card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                    <div>
                      <h2 style={{fontSize:18,fontWeight:800}}>{detail.recipient_name}</h2>
                      {detail.recipient_phone&&<p style={{color:'#7d8590',fontSize:13,marginTop:2}}>{detail.recipient_phone}</p>}
                      <p style={{color:'#7d8590',fontSize:12,marginTop:2}}>Sent: {detail.sent_date}</p>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <span style={{background:detail.status==='paid'?'rgba(37,211,102,0.15)':'rgba(255,181,71,0.15)',color:detail.status==='paid'?'#25d366':'#ffb547',border:`1px solid ${detail.status==='paid'?'rgba(37,211,102,0.3)':'rgba(255,181,71,0.3)'}`,borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700}}>{detail.status?.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:10}}>ITEMS SENT</p>
                  <div style={{background:'#0d1117',borderRadius:8,overflow:'hidden',marginBottom:16}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead><tr style={{borderBottom:'1px solid #30363d'}}>{['Product','Qty','Rate','Subtotal'].map(h=><th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,color:'#7d8590',letterSpacing:0.5,fontWeight:600}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {(detail.credit_batch_items||[]).map((it,i)=>(
                          <tr key={i} style={{borderBottom:i<(detail.credit_batch_items||[]).length-1?'1px solid #30363d':'none'}}>
                            <td style={{padding:'9px 12px',fontSize:13}}>{it.image_emoji||'📦'} {it.product_name}</td>
                            <td style={{padding:'9px 12px',fontSize:13,color:'#7d8590'}}>{it.qty}</td>
                            <td style={{padding:'9px 12px',fontSize:13,color:'#ffb547'}}>{fmt(it.credit_rate)}</td>
                            <td style={{padding:'9px 12px',fontSize:13,fontWeight:700,color:'#2196F3'}}>{fmt(it.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financials */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
                    {[{l:'Total Value',v:fmt(detail.total_value),c:'#2196F3'},{l:'Total Paid',v:fmt(getPaid(detail)),c:'#25d366'},{l:'Still Owing',v:fmt(getOwing(detail)),c:getOwing(detail)>0?'#ff4d6d':'#25d366'}].map(k=>(
                      <div key={k.l} style={{background:'#0d1117',borderRadius:8,padding:12,textAlign:'center'}}>
                        <p style={{fontSize:16,fontWeight:800,color:k.c}}>{k.v}</p>
                        <p style={{fontSize:10,color:'#7d8590',marginTop:4}}>{k.l}</p>
                      </div>
                    ))}
                  </div>

                  {/* Payments history */}
                  <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:10}}>PAYMENT HISTORY</p>
                  {(detail.credit_payments||[]).length===0&&<p style={{color:'#484f58',fontSize:13,marginBottom:12}}>No payments recorded yet</p>}
                  {(detail.credit_payments||[]).sort((a,b)=>new Date(b.payment_date)-new Date(a.payment_date)).map((p,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #30363d'}}>
                      <div><p style={{fontSize:13,fontWeight:600,color:'#25d366'}}>{fmt(p.amount)}</p>{p.note&&<p style={{fontSize:11,color:'#7d8590',marginTop:1}}>{p.note}</p>}</div>
                      <p style={{fontSize:12,color:'#7d8590'}}>{p.payment_date}</p>
                    </div>
                  ))}

                  {getOwing(detail)>0&&(
                    <button onClick={()=>{setPayModal(detail);setPayAmount('');setPayDate(today());setPayNote('')}} style={{marginTop:14,width:'100%',padding:'12px',borderRadius:8,background:'#25d366',color:'#000',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>💵 Record Payment</button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {batches.map(b=>{
                  const paid=getPaid(b), owing=getOwing(b), pct=b.total_value>0?Math.round(paid/b.total_value*100):0
                  return(
                    <div key={b.id} onClick={()=>setDetail(b)} style={{...C.card,marginBottom:10,cursor:'pointer',borderColor:b.status==='paid'?'rgba(37,211,102,0.3)':'#30363d'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='#161b22'}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                        <div>
                          <p style={{fontWeight:700,fontSize:15}}>{b.recipient_name}</p>
                          <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>{b.sent_date} · {(b.credit_batch_items||[]).length} items</p>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <p style={{fontSize:15,fontWeight:800,color:'#2196F3'}}>{fmt(b.total_value)}</p>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:b.status==='paid'?'rgba(37,211,102,0.15)':'rgba(255,181,71,0.15)',color:b.status==='paid'?'#25d366':'#ffb547'}}>{b.status?.toUpperCase()}</span>
                        </div>
                      </div>
                      <div style={{height:4,background:'#30363d',borderRadius:2,marginBottom:6,overflow:'hidden'}}>
                        <div style={{height:'100%',width:pct+'%',background:pct>=100?'#25d366':'#2196F3',borderRadius:2}}/>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:11,color:'#25d366'}}>Paid: {fmt(paid)}</span>
                        {owing>0&&<span style={{fontSize:11,color:'#ff4d6d'}}>Owing: {fmt(owing)}</span>}
                        <span style={{fontSize:11,color:'#7d8590'}}>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
                {!batches.length&&<div style={{...C.card,textAlign:'center',padding:40}}><p style={{fontSize:36}}>🤝</p><p style={{color:'#484f58',marginTop:10}}>No credit batches yet. Create your first one.</p></div>}
              </div>
            )}
          </div>
        )}

        {/* NEW BATCH */}
        {tab==='new' && (
          <div style={{maxWidth:700}}>
            <div style={C.card}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={C.label}>RECIPIENT NAME *</label>
                  <input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="e.g. Hassan Garage" style={C.input}/>
                </div>
                <div>
                  <label style={C.label}>PHONE (OPTIONAL)</label>
                  <input value={recipientPhone} onChange={e=>setRecipientPhone(e.target.value)} placeholder="e.g. 0754 123 456" style={C.input}/>
                </div>
                <div>
                  <label style={C.label}>DATE SENT</label>
                  <input value={sentDate} onChange={e=>setSentDate(e.target.value)} type="date" style={C.input}/>
                </div>
              </div>

              <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:8}}>ADD PRODUCTS</p>
              <input value={prodSearch} onChange={e=>setProdSearch(e.target.value)} placeholder="Search products..." style={{...C.input,marginBottom:8}}/>
              {prodSearch && (
                <div style={{border:'1px solid #30363d',borderRadius:8,overflow:'hidden',marginBottom:12,maxHeight:180,overflowY:'auto'}}>
                  {prods.filter(p=>p.name.toLowerCase().includes(prodSearch.toLowerCase())&&!items.find(i=>i.product.id===p.id)).map(p=>(
                    <button key={p.id} onClick={()=>addItem(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',padding:'9px 12px',background:'none',border:'none',borderBottom:'1px solid #30363d',color:'#e6edf3',cursor:'pointer',fontSize:13}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span>{p.image_emoji||'📦'} {p.name}</span>
                      <span style={{color:'#25d366',fontWeight:700}}>+</span>
                    </button>
                  ))}
                  {prods.filter(p=>p.name.toLowerCase().includes(prodSearch.toLowerCase())&&!items.find(i=>i.product.id===p.id)).length===0&&<p style={{padding:'10px 12px',color:'#484f58',fontSize:13}}>No products found</p>}
                </div>
              )}

              {items.length>0&&(
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginBottom:6}}>
                    {['Product','Qty','Credit Rate',''].map(h=><p key={h} style={{fontSize:10,color:'#7d8590',letterSpacing:0.5,fontWeight:600}}>{h}</p>)}
                  </div>
                  {items.map((it,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,alignItems:'center',marginBottom:8}}>
                      <p style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.product.image_emoji||'📦'} {it.product.name}</p>
                      <input value={it.qty} onChange={e=>setItems(p=>p.map((x,j)=>j===i?{...x,qty:e.target.value}:x))} placeholder="Qty" type="number" style={{...C.input,padding:'8px 10px'}}/>
                      <input value={it.credit_rate} onChange={e=>setItems(p=>p.map((x,j)=>j===i?{...x,credit_rate:e.target.value}:x))} placeholder="Price" type="number" style={{...C.input,padding:'8px 10px'}}/>
                      <button onClick={()=>setItems(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ff4d6d',fontSize:16,cursor:'pointer'}}>✕</button>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid #30363d',marginTop:4}}>
                    <span style={{fontWeight:700}}>Total Value</span>
                    <span style={{fontWeight:800,color:'#25d366',fontSize:16}}>{fmt(items.reduce((a,i)=>(a+(parseFloat(i.qty)||0)*(parseFloat(i.credit_rate)||0)),0))}</span>
                  </div>
                </div>
              )}

              <button onClick={saveBatch} disabled={saving||!recipient||!items.filter(i=>parseFloat(i.qty)>0).length} style={{width:'100%',padding:'13px',borderRadius:8,background:saving||!recipient||!items.filter(i=>parseFloat(i.qty)>0).length?'#30363d':'#25d366',color:saving||!recipient?'#484f58':'#000',fontWeight:700,fontSize:15,border:'none',cursor:'pointer',marginTop:16}}>
                {saving?'Saving...':'💾 Save Credit Batch'}
              </button>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {payModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
            <div style={{background:'#161b22',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:480,border:'1px solid #30363d'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Record Payment — {payModal.recipient_name}</h2>
                <button onClick={()=>setPayModal(null)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <p style={{fontSize:13,color:'#ff4d6d',marginBottom:16}}>Still owing: <strong>{fmt(getOwing(payModal))}</strong></p>
              <div style={{marginBottom:12}}>
                <label style={{...C.label}}>AMOUNT RECEIVED (TZS) *</label>
                <input value={payAmount} onChange={e=>setPayAmount(e.target.value)} type="number" placeholder={`Max ${fmt(getOwing(payModal))}`} style={C.input}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={C.label}>PAYMENT DATE</label>
                <input value={payDate} onChange={e=>setPayDate(e.target.value)} type="date" style={C.input}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={C.label}>NOTE (OPTIONAL)</label>
                <input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="e.g. Partial payment via Mpesa" style={C.input}/>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setPayModal(null)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #30363d',background:'transparent',color:'#e6edf3',fontWeight:600,cursor:'pointer'}}>Cancel</button>
                <button onClick={recordPayment} disabled={paySaving} style={{flex:2,padding:'11px',borderRadius:8,background:'#25d366',color:'#000',fontWeight:700,border:'none',cursor:'pointer'}}>{paySaving?'Saving...':'💵 Record Payment'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
