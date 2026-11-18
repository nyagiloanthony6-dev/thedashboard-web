import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function Loans() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [detail, setDetail] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [toast, setToast] = useState('')
  const [waiveAmt, setWaiveAmt] = useState('')
  const [waiveNote, setWaiveNote] = useState('')
  const [waiving, setWaiving] = useState(false)

  useEffect(() => { loadData() }, [])

  const showToast = (msg, c='#0B7A6C') => { setToast({msg,c}); setTimeout(()=>setToast(''),3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const { data } = await supabase.from('sales')
      .select('*,customers(name,phone),sale_items(qty,unit_price,line_total,product_name,products(name,image_emoji)),loan_payments(*)')
      .eq('shop_id', shopId).in('payment_method', ['loan','split'])
      .order('created_at', { ascending: false })
    setLoans(data || [])
    setLoading(false)
  }

  const recordPayment = async () => {
    const amt = parseFloat(payAmount)||0
    if (amt<=0) { alert('Enter valid amount'); return }
    setPaySaving(true)
    const { data: pmt, error } = await supabase.from('loan_payments').insert({
      sale_id: detail.id, amount: amt, payment_date: payDate, note: payNote.trim()||null,
    }).select().single()
    if (error) { alert(error.message); setPaySaving(false); return }
    const updatedPmts = [...(detail.loan_payments||[]), pmt]
    const totalPaid = updatedPmts.reduce((a,p)=>a+(Number(p.amount)||0),0)
    const loanTotal = detail.payment_method==='split' ? (Number(detail.loan_balance)||Math.max(0,(Number(detail.total)||0)-(Number(detail.cash_paid)||0))) : (Number(detail.total)||0)
    const fullyPaid = totalPaid + (Number(detail.loan_waiver)||0) >= loanTotal
    await supabase.from('sales').update({ loan_paid: fullyPaid, loan_paid_at: fullyPaid?(payDate||today()):null }).eq('id', detail.id)
    const updated = { ...detail, loan_payments: updatedPmts, loan_paid: fullyPaid, loan_paid_at: fullyPaid?(payDate||today()):null }
    setLoans(p => p.map(s => s.id===detail.id ? updated : s))
    setDetail(updated)
    setPayAmount(''); setPayDate(today()); setPayNote('')
    setPaySaving(false)
    showToast(fullyPaid ? '✅ Loan fully paid!' : '💵 Payment recorded!')
  }

  const getLoanPaid = s => (s.loan_payments||[]).reduce((a,p)=>a+(Number(p.amount)||0),0)
  // For split sales, initial cash portion is already paid - only loan_balance is owed
  const getLoanTotal = s => s.payment_method==='split' ? (Number(s.loan_balance)||Math.max(0,(Number(s.total)||0)-(Number(s.cash_paid)||0))) : (Number(s.total)||0)
  const getLoanOwing = s => Math.max(0, getLoanTotal(s) - getLoanPaid(s) - (Number(s.loan_waiver)||0))
  const canWaive = ['shop_admin', 'super_admin'].includes(profile?.role)

  // Forgive part or all of the balance (not money received; taken off profit)
  const waive = async () => {
    const amt = parseFloat(waiveAmt) || 0
    if (amt <= 0) return alert('Enter the amount to waive')
    if (!waiveNote.trim()) return alert('Write the reason for the waiver')
    if (!confirm(`Waive ${fmt(amt)}? The customer will no longer owe this amount.`)) return
    setWaiving(true)
    const { data, error } = await supabase.rpc('td_waive_loan', { p_sale: String(detail.id), p_amount: amt, p_note: waiveNote.trim() })
    setWaiving(false)
    if (error) return alert(error.message)
    const updated = { ...detail, loan_waiver: data.total_waiver, loan_waiver_note: (detail.loan_waiver_note ? detail.loan_waiver_note + ' | ' : '') + waiveNote.trim(),
      total_profit: (Number(detail.total_profit)||0) - amt, loan_paid: data.owing <= 0, loan_paid_at: data.owing <= 0 ? (detail.loan_paid_at || today()) : null }
    setLoans(p => p.map(x => x.id === detail.id ? updated : x)); setDetail(updated)
    setWaiveAmt(''); setWaiveNote('')
    showToast(data.owing <= 0 ? '✅ Waived · loan closed' : `Waived ${fmt(amt)} · still owing ${fmt(data.owing)}`)
  }

  const filtLoans = loans.filter(s => {
    const owing = getLoanOwing(s)
    if (filter==='pending') return owing > 0
    if (filter==='paid') return owing <= 0
    return true
  })

  const totalOut = loans.reduce((a,s)=>a+(Number(s.total)||0),0)
  const totalPaid = loans.reduce((a,s)=>a+getLoanPaid(s),0)
  const totalOwed = loans.reduce((a,s)=>a+getLoanOwing(s),0)

  const C = {
    card: { background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, padding:16 },
    input: { background:'#F6F7FB', border:'1.5px solid #DCDFEC', borderRadius:8, color:'#15183A', padding:'9px 12px', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
    label: { fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 },
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F6F7FB'}}><div style={{width:36,height:36,border:'3px solid #DCDFEC',borderTopColor:'#9A5B00',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Loans — TheDashboard</title></Head>
      <Layout title="Loan Management" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:#8A8FAE}`}</style>
        {toast && <div style={{position:'fixed',top:20,right:20,background:toast.c,color:'#FFFFFF',padding:'12px 20px',borderRadius:10,fontWeight:700,fontSize:13,zIndex:9999}}>{toast.msg}</div>}

        {/* Summary */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:24}}>
          {[
            {l:'Total Loaned',v:fmtK(totalOut),c:'#9A5B00'},
            {l:'Total Repaid',v:fmtK(totalPaid),c:'#0B7A6C'},
            {l:'Outstanding',v:fmtK(totalOwed),c:'#B93A16'},
            {l:'Loan Sales',v:loans.length,c:'#2D2F8F'},
          ].map(k=>(
            <div key={k.l} style={C.card}>
              <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8}}>{k.l.toUpperCase()}</p>
              <p style={{fontSize:20,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[{k:'pending',l:'⏳ Pending'},{k:'paid',l:'✅ Paid'},{k:'all',l:'All'}].map(f=>(
            <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:'8px 16px',borderRadius:8,border:'1px solid',borderColor:filter===f.k?'#9A5B00':'#DCDFEC',background:filter===f.k?'rgba(242,160,7,0.15)':'transparent',color:filter===f.k?'#9A5B00':'#5B607E',fontWeight:filter===f.k?700:400,fontSize:13,cursor:'pointer'}}>{f.l}</button>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:detail?'1fr 1fr':'1fr',gap:16}}>
          {/* Loan list */}
          <div>
            {filtLoans.map(s=>{
              const paid=getLoanPaid(s), owing=getLoanOwing(s), pct=s.total>0?Math.round(paid/s.total*100):0
              return(
                <div key={s.id} onClick={()=>setDetail(detail?.id===s.id?null:s)} style={{...C.card,marginBottom:10,cursor:'pointer',borderColor:detail?.id===s.id?'#9A5B00':owing<=0?'rgba(11,122,108,0.3)':'#DCDFEC'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=detail?.id===s.id?'#9A5B00':'#2196F350'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=detail?.id===s.id?'#9A5B00':owing<=0?'rgba(11,122,108,0.3)':'#DCDFEC'}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <p style={{fontWeight:700,fontSize:14}}>{s.customers?.name||'Walk-in'}</p>
                      {s.customers?.phone&&<p style={{fontSize:11,color:'#5B607E',marginTop:1}}>{s.customers.phone}</p>}
                      <p style={{fontSize:11,color:'#5B607E',marginTop:1}}>{s.sale_date||s.created_at?.split('T')[0]} · {(s.sale_items||[]).length} items</p>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <p style={{fontSize:15,fontWeight:800,color:'#9A5B00'}}>{fmt(s.total)}</p>
                      {owing>0?<p style={{fontSize:11,color:'#B93A16',marginTop:2}}>Owing: {fmt(owing)}</p>:<p style={{fontSize:11,color:'#0B7A6C',marginTop:2}}>✅ Fully paid</p>}
                    </div>
                  </div>
                  <div style={{height:4,background:'#DCDFEC',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',width:pct+'%',background:pct>=100?'#0B7A6C':'#9A5B00',borderRadius:2}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                    <span style={{fontSize:10,color:'#0B7A6C'}}>Paid: {fmt(paid)}</span>
                    <span style={{fontSize:10,color:'#5B607E'}}>{pct}%</span>
                  </div>
                </div>
              )
            })}
            {!filtLoans.length&&<div style={{...C.card,textAlign:'center',padding:40}}><p style={{fontSize:36}}>💸</p><p style={{color:'#8A8FAE',marginTop:10}}>No {filter==='all'?'':filter} loans found</p></div>}
          </div>

          {/* Detail panel */}
          {detail && (
            <div style={C.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <h2 style={{fontSize:16,fontWeight:800}}>{detail.customers?.name||'Walk-in'}</h2>
                <button onClick={()=>setDetail(null)} style={{background:'none',border:'none',color:'#5B607E',fontSize:18,cursor:'pointer'}}>✕</button>
              </div>

              <div style={{fontSize:13,marginTop:-8,marginBottom:14,display:'grid',gap:4}}>
                {detail.customers?.phone && <span style={{color:'#5B607E'}}>{detail.customers.phone}</span>}
                <span style={{color:detail.loan_guarantor_name?'#0F7375':'#9A5B00'}}>🤝 Guarantor: <b>{detail.loan_guarantor_name||'not set'}</b></span>
                {(Number(detail.loan_waiver)||0) > 0 && <span style={{color:'#9A5B00'}}>Waived <b>{fmt(detail.loan_waiver)}</b>{detail.loan_waiver_note ? ' · ' + detail.loan_waiver_note : ''}</span>}
              </div>

              {/* Items */}
              <p style={{fontSize:11,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>ITEMS PURCHASED</p>
              {(detail.sale_items||[]).map((it,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #DCDFEC'}}>
                  <span style={{fontSize:13}}>{it.products?.image_emoji||'📦'} {it.product_name||it.products?.name} × {it.qty}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#2D2F8F'}}>{fmt(it.line_total)}</span>
                </div>
              ))}

              {/* Summary */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,margin:'14px 0'}}>
                {[{l:'Sale Total',v:fmt(detail.total),c:'#9A5B00'},{l:detail.payment_method==='split'?'Cash Paid':'Paid',v:detail.payment_method==='split'?fmt(detail.cash_paid||0):fmt(getLoanPaid(detail)),c:'#2D2F8F'},{l:'Loan Repaid',v:fmt(getLoanPaid(detail)),c:'#0B7A6C'},{l:'Owing',v:fmt(getLoanOwing(detail)),c:getLoanOwing(detail)>0?'#B93A16':'#0B7A6C'},{l:'Date',v:detail.sale_date||detail.created_at?.split('T')[0],c:'#5B607E'}].map(k=>(
                  <div key={k.l} style={{background:'#F6F7FB',borderRadius:8,padding:10}}>
                    <p style={{fontSize:11,color:'#5B607E',marginBottom:2}}>{k.l}</p>
                    <p style={{fontSize:14,fontWeight:700,color:k.c}}>{k.v}</p>
                  </div>
                ))}
              </div>

              {/* Payment history */}
              <p style={{fontSize:11,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>PAYMENT HISTORY</p>
              {(detail.loan_payments||[]).length===0&&<p style={{color:'#8A8FAE',fontSize:13,marginBottom:12}}>No payments yet</p>}
              {[...(detail.loan_payments||[])].sort((a,b)=>new Date(b.payment_date)-new Date(a.payment_date)).map((p,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #DCDFEC'}}>
                  <div><p style={{fontSize:13,fontWeight:700,color:'#0B7A6C'}}>{fmt(p.amount)}</p>{p.note&&<p style={{fontSize:11,color:'#5B607E',marginTop:1}}>{p.note}</p>}</div>
                  <p style={{fontSize:12,color:'#5B607E'}}>{p.payment_date}</p>
                </div>
              ))}

              {/* Record payment */}
              {getLoanOwing(detail)>0&&(
                <div style={{marginTop:16,borderTop:'1px solid #DCDFEC',paddingTop:16}}>
                  <p style={{fontSize:11,color:'#5B607E',letterSpacing:0.8,marginBottom:10}}>RECORD PAYMENT</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                    <div>
                      <label style={C.label}>AMOUNT (TZS) *</label>
                      <input value={payAmount} onChange={e=>setPayAmount(e.target.value)} type="number" placeholder={`Max ${fmt(getLoanOwing(detail))}`} style={C.input}/>
                    </div>
                    <div>
                      <label style={C.label}>DATE</label>
                      <input value={payDate} onChange={e=>setPayDate(e.target.value)} type="date" style={C.input}/>
                    </div>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={C.label}>NOTE (OPTIONAL)</label>
                    <input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="e.g. Cash received" style={C.input}/>
                  </div>
                  <button onClick={recordPayment} disabled={paySaving||!payAmount} style={{width:'100%',padding:'12px',borderRadius:8,background:paySaving||!payAmount?'#DCDFEC':'#0B7A6C',color:paySaving||!payAmount?'#8A8FAE': '#FFFFFF',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>
                    {paySaving?'Saving...':'💵 Record Payment'}
                  </button>
                </div>
              )}
              {getLoanOwing(detail)>0&&canWaive&&(
                <div style={{marginTop:16,border:'1px solid rgba(154,91,0,0.3)',background:'#FDF6E7',borderRadius:10,padding:14}}>
                  <p style={{fontSize:11,color:'#9A5B00',letterSpacing:0.8,fontWeight:700,marginBottom:4}}>WAIVE BALANCE</p>
                  <p style={{fontSize:12,color:'#5B607E',marginBottom:10}}>Forgive part or all of what is owed. Not counted as money received; taken off the profit.</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,marginBottom:8}}>
                    <input value={waiveAmt} onChange={e=>setWaiveAmt(e.target.value)} type="number" placeholder={`Max ${fmt(getLoanOwing(detail))}`} style={C.input} aria-label="Amount to waive"/>
                    <button type="button" onClick={()=>setWaiveAmt(String(getLoanOwing(detail)))} style={{padding:'0 12px',borderRadius:8,border:'1px solid rgba(154,91,0,0.4)',background:'#fff',color:'#9A5B00',fontWeight:700,cursor:'pointer'}}>All</button>
                  </div>
                  <input value={waiveNote} onChange={e=>setWaiveNote(e.target.value)} placeholder="Reason (required) e.g. damaged part returned" style={{...C.input,marginBottom:10}} aria-label="Reason for waiver"/>
                  <button onClick={waive} disabled={waiving} style={{width:'100%',padding:'11px',borderRadius:8,background:'#9A5B00',color:'#fff',border:0,fontWeight:700,cursor:'pointer',opacity:waiving?0.6:1}}>{waiving?'Saving…':'Waive amount'}</button>
                </div>
              )}
              {getLoanOwing(detail)<=0&&<div style={{marginTop:12,padding:'10px',background:'rgba(11,122,108,0.1)',borderRadius:8,textAlign:'center'}}><p style={{color:'#0B7A6C',fontWeight:700}}>✅ Fully Paid</p></div>}
            </div>
          )}
        </div>
      </Layout>
    </>
  )
}
