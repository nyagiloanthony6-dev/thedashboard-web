import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'



export default function Investors() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop]       = useState(null)
  const [investors, setInvestors] = useState([])
  const [batches, setBatches]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('dashboard')
  const [detail, setDetail]       = useState(null)
  const [toast, setToast]         = useState('')
  const [settings, setSettings] = useState({ mgmt_fee:5, inv_share:70, co_share:30 })
  const [settingsModal, setSettingsModal] = useState(false)
  const [invModal, setInvModal]   = useState(false)
  const [batchModal, setBatchModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [sim, setSim] = useState({capital:'1000000',buy_price:'55000',sell_low:'70000',sell_mid:'75000',sell_high:'90000',mgmt_fee:'5',inv_share:'70',co_share:'30',cycles:'3',product_name:'Reinzosil Victor Reinz',boxes_per_carton:'4',min_cartons:'10'})
  const [simProducts, setSimProducts] = useState([])
  const [fundProducts, setFundProducts] = useState([])
  const [fundProdModal, setFundProdModal] = useState(false)
  const [fpForm, setFpForm] = useState({
    name:'', description:'',
    china_buy_price:'', clearing_fees:'',
    sell_price:'',
    boxes_per_carton:'4', min_cartons:'10',
    mgmt_fee:'5', inv_share:'70', co_share:'30'
  })
  const [fpSaving, setFpSaving] = useState(false)
  const [editFp, setEditFp] = useState(null) // product being edited
  const [invForm, setInvForm]     = useState({ name:'', phone:'', email:'', notes:'', mgmt_fee:'5', inv_share:'70', co_share:'30' })
  const [batchForm, setBatchForm] = useState({ investor_id:'', product:'Reinzosil Victor Reinz', buy_price:'55000', boxes:'', sell_price:'', start_date:today(), expected_end_date:'', notes:'' })

  useEffect(() => { loadData() }, [])
  const showToast = (msg, c='#25d366') => { setToast({msg,c}); setTimeout(()=>setToast(''),3000) }

  const loadData = async () => {
    const { data:{user} } = await supabase.auth.getUser()
    const { data:prof } = await supabase.from('app_users').select('*,shops(*)').eq('id',user.id).single()
    let shopData = prof?.shops
    if (!shopData) {
      const { data:owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id',user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    setProfile(prof); setShop(shopData)
    const shopId = shopData.id
    const [inv, bat] = await Promise.all([
      supabase.from('investors').select('*').eq('shop_id',shopId).order('created_at',{ascending:false}),
      supabase.from('investor_batches').select('*,investors(name,phone)').eq('shop_id',shopId).order('created_at',{ascending:false}),
    ])
    setInvestors(inv.data||[])
    setBatches(bat.data||[])
    // Load products for simulator
    const { data:prods } = await supabase.from('products')
      .select('name,buy_price,sell_price,wholesale_price')
      .eq('shop_id',shopId).eq('is_active',true)
      .gt('buy_price',0).order('name')
    setSimProducts(prods||[])
    // Load fund products (curated by admin)
    const { data:fp } = await supabase.from('investor_fund_products')
      .select('*').eq('shop_id',shopId).order('created_at',{ascending:false})
    setFundProducts(fp||[])
    // Load fund settings
    const { data:sets } = await supabase.from('investor_fund_settings')
      .select('*').eq('shop_id',shopId).single()
    if (sets) setSettings({ mgmt_fee:sets.mgmt_fee||5, inv_share:sets.inv_share||70, co_share:sets.co_share||30 })
    setLoading(false)
  }

  const openEditFp = (p) => {
    setEditFp(p)
    setFpForm({
      name: p.name||'', description: p.description||'',
      china_buy_price: String(p.china_buy_price||''),
      clearing_fees: String(p.clearing_fees||''),
      sell_price: String(p.sell_mid||''),
      boxes_per_carton: String(p.boxes_per_carton||4),
      min_cartons: String(p.min_cartons||10),
      mgmt_fee: String(p.mgmt_fee||5),
      inv_share: String(p.inv_share||70),
      co_share: String(p.co_share||30),
    })
    setFundProdModal(true)
  }

  const saveFundProduct = async () => {
    if (!fpForm.name.trim()||!fpForm.china_buy_price||!fpForm.sell_price) { alert('Fill name, china buy price and sell price'); return }
    const _invS = parseFloat(fpForm.inv_share)||0
    const _coS  = parseFloat(fpForm.co_share)||0
    if (_invS+_coS !== 100) { alert(`Investor + Company must equal 100% (currently ${_invS+_coS}%)`); return }
    setFpSaving(true)
    const chinaBuy   = parseFloat(fpForm.china_buy_price)||0
    const clearing   = parseFloat(fpForm.clearing_fees)||0
    const landedCost = chinaBuy + clearing
    const sellP      = parseFloat(fpForm.sell_price)||0
    const payload = {
      name:fpForm.name.trim(), description:fpForm.description||null,
      china_buy_price: chinaBuy, clearing_fees: clearing,
      buy_price: landedCost,
      sell_low: sellP, sell_mid: sellP, sell_high: sellP,
      boxes_per_carton: parseInt(fpForm.boxes_per_carton)||4,
      min_cartons: parseInt(fpForm.min_cartons)||10,
      mgmt_fee: parseFloat(fpForm.mgmt_fee)||5,
      inv_share: parseFloat(fpForm.inv_share)||70,
      co_share: parseFloat(fpForm.co_share)||30,
    }
    let data, error
    if (editFp) {
      ({ data, error } = await supabase.from('investor_fund_products').update(payload).eq('id',editFp.id).select().single())
      if (!error) setFundProducts(p=>p.map(x=>x.id===editFp.id?data:x))
    } else {
      ({ data, error } = await supabase.from('investor_fund_products').insert({shop_id:shop.id,...payload}).select().single())
      if (!error) setFundProducts(p=>[data,...p])
    }
    if (!error) {
      setFundProdModal(false); setEditFp(null)
      setFpForm({name:'',description:'',china_buy_price:'',clearing_fees:'',sell_price:'',boxes_per_carton:'4',min_cartons:'10',mgmt_fee:'5',inv_share:'70',co_share:'30'})
      showToast(editFp?'Product updated! ✅':'Product added to fund! ✅')
    } else alert(error.message)
    setFpSaving(false)
  }

  const deleteFundProduct = async (id) => {
    if (!confirm('Remove this product from the fund?')) return
    await supabase.from('investor_fund_products').delete().eq('id',id)
    setFundProducts(p=>p.filter(x=>x.id!==id))
    showToast('Removed')
  }

  const saveSettings = async () => {
    const total = (parseFloat(settings.inv_share)||0) + (parseFloat(settings.co_share)||0)
    if (total !== 100) { alert(`Investor + Company shares must equal 100% (currently ${total}%)`); return }
    const { error } = await supabase.from('investor_fund_settings').upsert({
      shop_id: shop.id,
      mgmt_fee: parseFloat(settings.mgmt_fee)||5,
      inv_share: parseFloat(settings.inv_share)||70,
      co_share: parseFloat(settings.co_share)||30,
    }, { onConflict:'shop_id' })
    if (!error) { setSettingsModal(false); showToast('Settings saved! ✅') }
    else alert(error.message)
  }

  const calcBatch = (b, overrideSettings) => {
    // Use investor-specific rates if available, else override, else global settings
    const inv = investors.find(i=>i.id===b.investor_id)
    const s = overrideSettings || (inv && inv.mgmt_fee!=null ? inv : settings)
    const mgmtFeePct  = (s.mgmt_fee||5) / 100
    const invSharePct = (s.inv_share||70) / 100
    const coSharePct  = (s.co_share||30) / 100
    const capital     = (b.buy_price||0)*(b.boxes||0)
    const revenue     = (b.actual_sell_price||b.sell_price||0)*(b.boxes||0)
    const grossProfit = revenue - capital
    const mgmtFee     = Math.round(grossProfit * mgmtFeePct)
    const netProfit   = grossProfit - mgmtFee
    const invProfit   = Math.round(netProfit * invSharePct)
    const coProfit    = Math.round(netProfit * coSharePct)
    const invTotal    = capital + invProfit
    const roi         = capital > 0 ? invProfit/capital : 0
    return { capital, revenue, grossProfit, mgmtFee, netProfit, invProfit, coProfit, invTotal, roi }
  }

  const getInvestorSummary = (id) => {
    const ibs = batches.filter(b=>b.investor_id===id)
    const completed = ibs.filter(b=>b.status==='completed')
    return {
      totalInvested: ibs.reduce((a,b)=>a+(b.buy_price||0)*(b.boxes||0),0),
      activeBatches: ibs.filter(b=>b.status!=='completed').length,
      completedBatches: completed.length,
      totalReturned: completed.reduce((a,b)=>a+(b.investor_total||calcBatch(b).invTotal),0),
      totalProfit: completed.reduce((a,b)=>a+(b.investor_profit||calcBatch(b).invProfit),0),
    }
  }

  const saveInvestor = async () => {
    if (!invForm.name.trim()) { alert('Enter investor name'); return }
    setSaving(true)
    const invShare = parseFloat(invForm.inv_share)||70
    const coShare  = parseFloat(invForm.co_share)||30
    if (invShare+coShare !== 100) { alert(`Investor + Company must equal 100% (currently ${invShare+coShare}%)`); setSaving(false); return }
    const { data, error } = await supabase.from('investors').insert({
      shop_id:shop.id, name:invForm.name.trim(), phone:invForm.phone||null, email:invForm.email||null, notes:invForm.notes||null,
      mgmt_fee:parseFloat(invForm.mgmt_fee)||5, inv_share:invShare, co_share:coShare,
    }).select().single()
    if (!error) { setInvestors(p=>[data,...p]); setInvModal(false); setInvForm({name:'',phone:'',email:'',notes:'',mgmt_fee:'5',inv_share:'70',co_share:'30'}); showToast('Investor added! ✅') }
    else alert(error.message)
    setSaving(false)
  }

  const saveBatch = async () => {
    if (!batchForm.investor_id||!batchForm.boxes||!batchForm.buy_price) { alert('Fill all required fields'); return }
    const _sellP = parseFloat(batchForm.sell_price)||0
    const _buyP  = parseFloat(batchForm.buy_price)||0
    if (_sellP > 0 && _sellP > _buyP * 10) {
      if (!confirm(`⚠️ Sell price TZS ${_sellP.toLocaleString()} looks very high vs buy price TZS ${_buyP.toLocaleString()}. Make sure this is price PER BOX not total revenue. Continue?`)) return
    }
    const sellP = parseFloat(batchForm.sell_price)||0
    const buyP  = parseFloat(batchForm.buy_price)||0
    if (sellP > 0 && sellP > buyP * 20) { if (!confirm(`Sell price TZS ${sellP.toLocaleString()} seems very high vs buy price TZS ${buyP.toLocaleString()}. Is this per BOX (not total)? Click OK to continue.`)) return }
    setSaving(true)
    const { data, error } = await supabase.from('investor_batches').insert({
      shop_id:shop.id, investor_id:batchForm.investor_id, product:batchForm.product,
      buy_price:parseFloat(batchForm.buy_price), boxes:parseInt(batchForm.boxes),
      capital_invested:parseFloat(batchForm.buy_price)*parseInt(batchForm.boxes),
      sell_price:parseFloat(batchForm.sell_price)||null, start_date:batchForm.start_date,
      expected_end_date:batchForm.expected_end_date||null, notes:batchForm.notes||null, status:'active',
    }).select('*,investors(name,phone)').single()
    if (!error) {
      setBatches(p=>[data,...p]); setBatchModal(false)
      setBatchForm({investor_id:'',product:'Reinzosil Victor Reinz',buy_price:'55000',boxes:'',sell_price:'',start_date:today(),expected_end_date:'',notes:''})
      showToast('Batch created! 📦')
    } else alert(error.message)
    setSaving(false)
  }

  const completeBatch = async (batch, sellPrice) => {
    if (!sellPrice) { alert('Enter actual sell price'); return }
    const c = calcBatch({...batch, actual_sell_price:parseFloat(sellPrice)})
    await supabase.from('investor_batches').update({
      actual_sell_price:parseFloat(sellPrice), actual_revenue:c.revenue,
      gross_profit:c.grossProfit, mgmt_fee:c.mgmtFee, net_profit:c.netProfit,
      investor_profit:c.invProfit, company_profit:c.coProfit, investor_total:c.invTotal,
      roi:c.roi, status:'completed', end_date:today(),
    }).eq('id',batch.id)
    showToast('Batch completed! ✅'); loadData()
  }

  const totalCapital   = batches.reduce((a,b)=>a+(b.buy_price||0)*(b.boxes||0),0)
  const activeBatches  = batches.filter(b=>b.status==='active')
  const completedBatches = batches.filter(b=>b.status==='completed')
  const totalReturned  = completedBatches.reduce((a,b)=>a+(b.investor_total||calcBatch(b).invTotal),0)
  const totalCoProfit  = completedBatches.reduce((a,b)=>a+(b.company_profit||calcBatch(b).coProfit),0)

  const C = {
    card:  { background:'#161b22', border:'1px solid #30363d', borderRadius:12, padding:16 },
    input: { background:'#0d1117', border:'1.5px solid #30363d', borderRadius:8, color:'#e6edf3', padding:'9px 12px', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
    label: { fontSize:10, color:'#7d8590', letterSpacing:0.8, display:'block', marginBottom:4, fontWeight:600 },
    badge: (c) => ({ background:c+'18', color:c, border:`1px solid ${c}30`, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }),
    btn:   (bg,c='#000') => ({ padding:'10px 20px', borderRadius:8, background:bg, color:c, fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }),
  }
  const statusColor = s => s==='completed'?'#25d366':'#2196F3'

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}><div style={{width:36,height:36,border:'3px solid #30363d',borderTopColor:'#a78bfa',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Investors — TheDashboard</title></Head>
      <Layout title="Investor Fund" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        {toast && <div style={{position:'fixed',top:16,right:16,background:toast.c,color:'#000',padding:'10px 18px',borderRadius:10,fontWeight:700,zIndex:9999,animation:'fadeIn 0.2s'}}>{toast.msg}</div>}

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:900,marginBottom:4}}>💰 Investor Fund</h1>
            <p style={{fontSize:12,color:'#7d8590'}}>{settings.mgmt_fee}% Management Fee · {settings.inv_share}% Investor · {settings.co_share}% Company</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{const url=window.location.origin+'/invest';navigator.clipboard.writeText(url);showToast('Link copied! 🔗')}} style={{...C.btn('#1e2840','#25d366'),border:'1px solid #25d36640'}}>🔗 Share Link</button>
          <button onClick={()=>window.open('/invest','_blank')} style={{...C.btn('#1e2840','#2196F3'),border:'1px solid #2196F340'}}>👁️ Preview</button>
          <button onClick={()=>setSettingsModal(true)} style={{...C.btn('#30363d','#7d8590'),border:'1px solid #30363d'}}>⚙️ Settings</button>
            <button onClick={()=>setBatchModal(true)} style={C.btn('#2196F3','#fff')}>+ New Batch</button>
            <button onClick={()=>setInvModal(true)} style={C.btn('#25d366')}>+ Add Investor</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:6,marginBottom:20}}>
          {[['dashboard','📊 Dashboard'],['batches','📦 Batches'],['investors','👥 Investors'],['simulate','🧮 Simulator']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:tab===k?'#2196F3':'#1c2333',color:tab===k?'#fff':'#7d8590',fontWeight:tab===k?700:400,fontSize:13,cursor:'pointer'}}>{l}</button>
          ))}
        </div>

        {/* DASHBOARD */}
        {tab==='dashboard' && (<>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:24}}>
            {[
              {l:'Total Investors',v:investors.length,c:'#2196F3',i:'👥'},
              {l:'Active Batches',v:activeBatches.length,c:'#ffb547',i:'📦'},
              {l:'Capital Deployed',v:fmtK(totalCapital),c:'#ff4d6d',i:'💸'},
              {l:'Total Returned',v:fmtK(totalReturned),c:'#25d366',i:'✅'},
              {l:'Company Profit',v:fmtK(totalCoProfit),c:'#a78bfa',i:'🏢'},
            ].map(k=>(
              <div key={k.l} style={{...C.card,border:`1px solid ${k.c}30`}}>
                <p style={{fontSize:20,marginBottom:6}}>{k.i}</p>
                <p style={{fontSize:22,fontWeight:900,color:k.c}}>{k.v}</p>
                <p style={{fontSize:10,color:'#7d8590',marginTop:4,letterSpacing:0.5}}>{k.l.toUpperCase()}</p>
              </div>
            ))}
          </div>

          <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12}}>ACTIVE BATCHES</p>
          <div style={{display:'grid',gap:12,marginBottom:24}}>
            {!activeBatches.length && <div style={{...C.card,textAlign:'center',padding:40,color:'#484f58'}}><p style={{fontSize:32}}>📦</p><p style={{marginTop:8}}>No active batches</p></div>}
            {activeBatches.map(b=>{
              const c = calcBatch(b)
              const days = b.start_date ? Math.floor((new Date()-new Date(b.start_date))/86400000) : 0
              return (
              <div key={b.id} style={{...C.card,borderColor:'#2196F330'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div>
                    <p style={{fontSize:15,fontWeight:800}}>{b.investors?.name}</p>
                    <p style={{fontSize:12,color:'#7d8590',marginTop:2}}>{b.product} · {b.boxes} boxes · Day {days}</p>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <p style={{fontSize:18,fontWeight:900,color:'#ff4d6d'}}>{fmt(c.capital)}</p>
                    <p style={{fontSize:10,color:'#7d8590'}}>Capital deployed</p>
                  </div>
                </div>
                <div style={{height:6,background:'#30363d',borderRadius:3,marginBottom:12}}>
                  <div style={{height:'100%',width:Math.min(100,days/90*100)+'%',background:'#2196F3',borderRadius:3}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
                  {[
                    {l:'Buy Price',v:fmt(b.buy_price||0)},
                    {l:'Expected Sell',v:fmt(b.sell_price||0)},
                    {l:'Est. Inv. Profit',v:fmt(c.invProfit),c:'#25d366'},
                    {l:'Est. ROI',v:`${(c.roi*100).toFixed(1)}%`,c:'#ffb547'},
                  ].map(st=>(
                    <div key={st.l} style={{background:'#0d1117',borderRadius:8,padding:10,textAlign:'center'}}>
                      <p style={{fontSize:9,color:'#7d8590',letterSpacing:0.5,marginBottom:4}}>{st.l.toUpperCase()}</p>
                      <p style={{fontSize:12,fontWeight:700,color:st.c||'#e6edf3'}}>{st.v}</p>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <input id={`sell-${b.id}`} placeholder="Actual sell price when all sold" type="number" style={{...C.input,flex:1}}/>
                  <button onClick={()=>completeBatch(b,document.getElementById(`sell-${b.id}`).value)} style={{...C.btn('#25d366'),whiteSpace:'nowrap'}}>✅ Mark Sold</button>
                </div>
              </div>
            )})}
          </div>

          {completedBatches.length>0 && (<>
            <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12}}>COMPLETED BATCHES</p>
            <div style={{...C.card,overflow:'hidden',padding:0}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'1px solid #30363d'}}>
                    {['Investor','Product','Boxes','Capital','Inv. Profit','Co. Profit','ROI','End Date'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:9,color:'#7d8590',letterSpacing:0.8,fontWeight:600}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completedBatches.map((b,i)=>{
                    const c = calcBatch(b)
                    return (
                    <tr key={b.id} style={{borderBottom:i<completedBatches.length-1?'1px solid #30363d':'none'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'10px 14px',fontSize:13,fontWeight:600}}>{b.investors?.name}</td>
                      <td style={{padding:'10px 14px',fontSize:12,color:'#7d8590'}}>{b.product}</td>
                      <td style={{padding:'10px 14px',fontSize:12}}>{b.boxes}</td>
                      <td style={{padding:'10px 14px',fontSize:12,color:'#ff4d6d',fontWeight:700}}>{fmt(c.capital)}</td>
                      <td style={{padding:'10px 14px',fontSize:12,color:'#25d366',fontWeight:700}}>{fmt(b.investor_profit||c.invProfit)}</td>
                      <td style={{padding:'10px 14px',fontSize:12,color:'#a78bfa',fontWeight:700}}>{fmt(b.company_profit||c.coProfit)}</td>
                      <td style={{padding:'10px 14px',fontSize:12,color:'#ffb547',fontWeight:700}}>{((b.roi||c.roi)*100).toFixed(1)}%</td>
                      <td style={{padding:'10px 14px',fontSize:11,color:'#7d8590'}}>{b.end_date||'—'}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </>)}
        </>)}

        {/* BATCHES TAB */}
        {tab==='batches' && (
          <div style={{...C.card,overflow:'hidden',padding:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'1px solid #30363d'}}>
                  {['Investor','Product','Boxes','Capital','Buy','Sell','Gross Profit','Mgmt 5%','Net Profit','Inv 70%','Co 30%','ROI','Status'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:9,color:'#7d8590',letterSpacing:0.8,fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b,i)=>{
                  const c = calcBatch(b)
                  return (
                  <tr key={b.id} style={{borderBottom:i<batches.length-1?'1px solid #30363d':'none'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:600}}>{b.investors?.name}</td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'#7d8590'}}>{b.product}</td>
                    <td style={{padding:'10px 14px',fontSize:12}}>{b.boxes}</td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'#ff4d6d',fontWeight:700}}>{fmt(c.capital)}</td>
                    <td style={{padding:'10px 14px',fontSize:11,color:'#7d8590'}}>{fmt(b.buy_price||0)}</td>
                    <td style={{padding:'10px 14px',fontSize:11,color:'#7d8590'}}>{fmt(b.actual_sell_price||b.sell_price||0)}</td>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:700}}>{fmt(b.gross_profit||c.grossProfit)}</td>
                    <td style={{padding:'10px 14px',fontSize:11,color:'#484f58'}}>{fmt(b.mgmt_fee||c.mgmtFee)}</td>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:700,color:'#2196F3'}}>{fmt(b.net_profit||c.netProfit)}</td>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:700,color:'#25d366'}}>{fmt(b.investor_profit||c.invProfit)}</td>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:700,color:'#a78bfa'}}>{fmt(b.company_profit||c.coProfit)}</td>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:700,color:'#ffb547'}}>{((b.roi||c.roi)*100).toFixed(1)}%</td>
                    <td style={{padding:'10px 14px'}}><span style={C.badge(statusColor(b.status))}>{b.status?.toUpperCase()}</span></td>
                  </tr>
                )})}
                {!batches.length && <tr><td colSpan={13} style={{padding:40,textAlign:'center',color:'#484f58'}}>No batches yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* INVESTORS TAB */}
        {tab==='investors' && (
          <div style={{display:'grid',gap:12}}>
            {investors.map(inv=>{
              const s = getInvestorSummary(inv.id)
              const invBatches = batches.filter(b=>b.investor_id===inv.id)
              return (
              <div key={inv.id} style={{...C.card,cursor:'pointer',borderColor:detail?.id===inv.id?'#2196F3':'#30363d'}} onClick={()=>setDetail(detail?.id===inv.id?null:inv)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <p style={{fontSize:16,fontWeight:800}}>{inv.name}</p>
                    <p style={{fontSize:12,color:'#7d8590',marginTop:2}}>{inv.phone||''}{inv.email?' · '+inv.email:''}</p>
                    <p style={{fontSize:11,color:'#ffb547',marginTop:3}}>Mgmt {inv.mgmt_fee||5}% · Investor {inv.inv_share||70}% · Co {inv.co_share||30}%</p>
                  </div>
                  <div style={{display:'flex',gap:16,alignItems:'center'}}>
                    {[
                      {l:'Invested',v:fmtK(s.totalInvested),c:'#ff4d6d'},
                      {l:'Returned',v:fmtK(s.totalReturned),c:'#25d366'},
                      {l:'Profit Earned',v:fmtK(s.totalProfit),c:'#ffb547'},
                    ].map(k=>(
                      <div key={k.l} style={{textAlign:'right'}}>
                        <p style={{fontSize:16,fontWeight:900,color:k.c}}>{k.v}</p>
                        <p style={{fontSize:10,color:'#7d8590'}}>{k.l}</p>
                      </div>
                    ))}
                    <span style={C.badge('#2196F3')}>{s.activeBatches} active</span>
                  </div>
                </div>

                {detail?.id===inv.id && (
                  <div style={{marginTop:16,borderTop:'1px solid #30363d',paddingTop:16}}>
                    <p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8,marginBottom:10}}>BATCH HISTORY</p>
                    {invBatches.map(b=>{
                      const c = calcBatch(b)
                      return (
                      <div key={b.id} style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:8,border:`1px solid ${statusColor(b.status)}30`}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                          <div>
                            <p style={{fontSize:13,fontWeight:700}}>{b.product} · {b.boxes} boxes</p>
                            <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>{b.start_date} → {b.end_date||'In progress'}</p>
                          </div>
                          <span style={C.badge(statusColor(b.status))}>{b.status?.toUpperCase()}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
                          {[
                            {l:'Capital',v:fmt(c.capital),c:'#ff4d6d'},
                            {l:'Revenue',v:fmt(b.actual_revenue||c.revenue),c:'#2196F3'},
                            {l:'Mgmt 5%',v:fmt(b.mgmt_fee||c.mgmtFee),c:'#484f58'},
                            {l:'Net Profit',v:fmt(b.net_profit||c.netProfit),c:'#e6edf3'},
                            {l:'Inv 70%',v:fmt(b.investor_profit||c.invProfit),c:'#25d366'},
                            {l:'ROI',v:`${((b.roi||c.roi)*100).toFixed(1)}%`,c:'#ffb547'},
                          ].map(st=>(
                            <div key={st.l} style={{textAlign:'center'}}>
                              <p style={{fontSize:9,color:'#7d8590',letterSpacing:0.5,marginBottom:2}}>{st.l}</p>
                              <p style={{fontSize:12,fontWeight:700,color:st.c}}>{st.v}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )})}
                    <button onClick={e=>{e.stopPropagation();setBatchForm(p=>({...p,investor_id:inv.id}));setBatchModal(true)}}
                      style={{...C.btn('#2196F3','#fff'),width:'100%',marginTop:8}}>
                      + New Batch for {inv.name}
                    </button>
                  </div>
                )}
              </div>
            )})}
            {!investors.length && <div style={{...C.card,textAlign:'center',padding:40,color:'#484f58'}}><p style={{fontSize:32}}>👥</p><p style={{marginTop:8}}>No investors yet</p></div>}
          </div>
        )}

        {/* FUND PRODUCTS MODAL */}
        {fundProdModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
            <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>⚙️ {editFp?'Edit':'Add'} Fund Product</h2>
                <button onClick={()=>{setFundProdModal(false);setEditFp(null);setFpForm({name:'',description:'',china_buy_price:'',clearing_fees:'',sell_price:'',boxes_per_carton:'4',min_cartons:'10',mgmt_fee:'5',inv_share:'70',co_share:'30'})}} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <p style={{fontSize:12,color:'#7d8590',marginBottom:16}}>Configure which products appear in the investor simulator. Investors only see these — not your full stock.</p>

              {/* Existing fund products */}
              {fundProducts.length>0 && (
                <div style={{marginBottom:20}}>
                  <p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8,marginBottom:8,fontWeight:600}}>CURRENT FUND PRODUCTS</p>
                  {fundProducts.map(p=>(
                    <div key={p.id} style={{background:'#0d1117',borderRadius:8,padding:10,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <p style={{fontSize:13,fontWeight:700}}>{p.name}</p>
                        <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>
                      China: TZS {(p.china_buy_price||0).toLocaleString()} + Clear: TZS {(p.clearing_fees||0).toLocaleString()} = Landed: TZS {(p.buy_price||0).toLocaleString()} · Sell: TZS {(p.sell_mid||0).toLocaleString()}
                    </p>
                    <p style={{fontSize:10,color:'#ffb547',marginTop:1}}>Split: {p.mgmt_fee||5}% mgmt · {p.inv_share||70}% investor · {p.co_share||30}% company</p>
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>openEditFp(p)} style={{background:'none',border:'none',color:'#2196F3',fontSize:12,cursor:'pointer',fontWeight:600}}>✏️ Edit</button>
                        <button onClick={()=>deleteFundProduct(p.id)} style={{background:'none',border:'none',color:'#ff4d6d',fontSize:16,cursor:'pointer'}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8,marginBottom:10,fontWeight:600}}>ADD NEW FUND PRODUCT</p>
              {/* Product Info */}
              <div style={{marginBottom:10}}>
                <label style={C.label}>PRODUCT NAME *</label>
                <input value={fpForm.name} onChange={e=>setFpForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Reinzosil Victor Reinz" style={C.input}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={C.label}>SHORT DESCRIPTION</label>
                <input value={fpForm.description} onChange={e=>setFpForm(p=>({...p,description:e.target.value}))} placeholder="e.g. Premium gasket sealant" style={C.input}/>
              </div>

              {/* Cost Breakdown */}
              <div style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:14,border:'1px solid #30363d'}}>
                <p style={{fontSize:10,color:'#ffb547',fontWeight:700,letterSpacing:0.8,marginBottom:10}}>COST STRUCTURE (per box)</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div>
                    <label style={C.label}>CHINA BUY PRICE (TZS) *</label>
                    <input value={fpForm.china_buy_price} onChange={e=>setFpForm(p=>({...p,china_buy_price:e.target.value}))} placeholder="e.g. 45000" type="number" style={C.input}/>
                  </div>
                  <div>
                    <label style={C.label}>CLEARING FEES (TZS)</label>
                    <input value={fpForm.clearing_fees} onChange={e=>setFpForm(p=>({...p,clearing_fees:e.target.value}))} placeholder="e.g. 10000" type="number" style={C.input}/>
                  </div>
                </div>
                {(fpForm.china_buy_price||fpForm.clearing_fees) && (() => {
                  const china = parseFloat(fpForm.china_buy_price)||0
                  const clear = parseFloat(fpForm.clearing_fees)||0
                  const landed = china + clear
                  return (
                    <div style={{background:'#161b22',borderRadius:8,padding:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0'}}>
                        <span style={{color:'#7d8590'}}>China Buy Price</span>
                        <span>TZS {china.toLocaleString()}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0'}}>
                        <span style={{color:'#7d8590'}}>Clearing Fees</span>
                        <span>TZS {clear.toLocaleString()}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'6px 0',borderTop:'1px solid #30363d',marginTop:4}}>
                        <span style={{color:'#ffb547',fontWeight:700}}>Full Landed Price</span>
                        <span style={{color:'#ffb547',fontWeight:900}}>TZS {landed.toLocaleString()}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Carton Config */}
              <div style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:14,border:'1px solid #30363d'}}>
                <p style={{fontSize:10,color:'#2196F3',fontWeight:700,letterSpacing:0.8,marginBottom:10}}>📦 CARTON CONFIGURATION</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div>
                    <label style={C.label}>BOXES PER CARTON</label>
                    <input value={fpForm.boxes_per_carton} onChange={e=>setFpForm(p=>({...p,boxes_per_carton:e.target.value}))} type="number" min="1" style={C.input} placeholder="e.g. 4"/>
                    <p style={{fontSize:10,color:'#484f58',marginTop:3}}>How many boxes in one carton</p>
                  </div>
                  <div>
                    <label style={C.label}>MINIMUM CARTONS TO INVEST</label>
                    <input value={fpForm.min_cartons} onChange={e=>setFpForm(p=>({...p,min_cartons:e.target.value}))} type="number" min="1" style={C.input} placeholder="e.g. 10"/>
                    <p style={{fontSize:10,color:'#484f58',marginTop:3}}>Minimum order quantity</p>
                  </div>
                </div>
                {fpForm.boxes_per_carton && fpForm.min_cartons && (()=>{
                  const bpc = parseInt(fpForm.boxes_per_carton)||4
                  const minC = parseInt(fpForm.min_cartons)||10
                  const minBoxes = bpc * minC
                  const minCapital = minBoxes * ((parseFloat(fpForm.china_buy_price)||0)+(parseFloat(fpForm.clearing_fees)||0))
                  return (
                    <div style={{background:'#161b22',borderRadius:8,padding:10,marginTop:8}}>
                      <p style={{fontSize:12,color:'#2196F3',fontWeight:700}}>
                        Min investment: {minC} cartons × {bpc} boxes = {minBoxes} boxes
                      </p>
                      {minCapital>0 && <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>
                        Min capital required: TZS {minCapital.toLocaleString()}
                      </p>}
                    </div>
                  )
                })()}
              </div>

              {/* Sell Price */}
              <div style={{marginBottom:14}}>
                <label style={C.label}>SELL PRICE PER BOX (TZS) *</label>
                <input value={fpForm.sell_price} onChange={e=>setFpForm(p=>({...p,sell_price:e.target.value}))} placeholder="e.g. 70000" type="number" style={C.input}/>
              </div>

              {/* Profit Calc Preview */}
              {fpForm.sell_price && fpForm.china_buy_price && (() => {
                const china = parseFloat(fpForm.china_buy_price)||0
                const clear = parseFloat(fpForm.clearing_fees)||0
                const landed = china + clear
                const sell   = parseFloat(fpForm.sell_price)||0
                const gross  = sell - landed
                const mgmt   = Math.round(gross * (parseFloat(fpForm.mgmt_fee)||5) / 100)
                const net    = gross - mgmt
                const inv    = Math.round(net * (parseFloat(fpForm.inv_share)||70) / 100)
                const co     = Math.round(net * (parseFloat(fpForm.co_share)||30) / 100)
                const margin = landed > 0 ? ((sell-landed)/sell*100).toFixed(0) : 0
                return (
                  <div style={{background:'rgba(37,211,102,0.05)',border:'1px solid #25d36630',borderRadius:10,padding:12,marginBottom:14}}>
                    <p style={{fontSize:10,color:'#25d366',fontWeight:700,letterSpacing:0.8,marginBottom:8}}>PROFIT CALCULATION PREVIEW (per box)</p>
                    {[
                      {l:'Sell Price', v:`TZS ${sell.toLocaleString()}`, c:'#e6edf3'},
                      {l:'Landed Cost', v:`TZS ${landed.toLocaleString()}`, c:'#ff4d6d'},
                      {l:'Gross Profit', v:`TZS ${gross.toLocaleString()} (${margin}% margin)`, c:'#e6edf3'},
                      {l:`Mgmt Fee (${fpForm.mgmt_fee||5}%)`, v:`TZS ${mgmt.toLocaleString()}`, c:'#7d8590'},
                      {l:'Net Profit', v:`TZS ${net.toLocaleString()}`, c:'#2196F3', bold:true},
                      {l:`Investor (${fpForm.inv_share||70}%)`, v:`TZS ${inv.toLocaleString()}`, c:'#25d366', bold:true},
                      {l:`Company (${fpForm.co_share||30}%)`, v:`TZS ${co.toLocaleString()}`, c:'#a78bfa', bold:true},
                    ].map(r=>(
                      <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #1e2840'}}>
                        <span style={{fontSize:12,color:'#7d8590'}}>{r.l}</span>
                        <span style={{fontSize:12,fontWeight:r.bold?800:500,color:r.c}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Profit Split */}
              <div style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:14,border:'1px solid #30363d'}}>
                <p style={{fontSize:10,color:'#ffb547',fontWeight:700,letterSpacing:0.8,marginBottom:10}}>PROFIT SPLIT CONFIGURATION</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[{l:'Mgmt Fee %',k:'mgmt_fee'},{l:'Investor %',k:'inv_share'},{l:'Company %',k:'co_share'}].map(f=>(
                    <div key={f.k}>
                      <label style={C.label}>{f.l}</label>
                      <input value={fpForm[f.k]} onChange={e=>setFpForm(p=>({...p,[f.k]:e.target.value}))} type="number" min="0" max="100" style={{...C.input,textAlign:'center',fontWeight:700,color:'#ffb547'}}/>
                    </div>
                  ))}
                </div>
                {(parseFloat(fpForm.inv_share)||0)+(parseFloat(fpForm.co_share)||0)!==100 &&
                  <p style={{fontSize:11,color:'#ff4d6d',marginTop:8,fontWeight:700}}>⚠️ Investor + Company must = 100%</p>
                }
              </div>
              <button onClick={saveFundProduct} disabled={fpSaving} style={{...C.btn('#25d366'),width:'100%',opacity:fpSaving?0.6:1}}>
                {fpSaving?'Saving...':(editFp?'Save Changes':'+ Add to Fund')}
              </button>
            </div>
          </div>
        )}

        {/* SETTINGS MODAL */}
        {settingsModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
            <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:400}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>⚙️ Fund Settings</h2>
                <button onClick={()=>setSettingsModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <p style={{fontSize:12,color:'#7d8590',marginBottom:16}}>Set the profit split structure for all batches. Investor + Company must equal 100%.</p>
              {[
                {label:'Management Fee %',key:'mgmt_fee',help:'Paid to operator before profit split'},
                {label:'Investor Share %',key:'inv_share',help:'% of net profit after management fee'},
                {label:'Company Share %',key:'co_share',help:'% of net profit after management fee'},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={C.label}>{f.label}</label>
                  <input value={settings[f.key]} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}
                    type="number" min="0" max="100" style={C.input}/>
                  <p style={{fontSize:10,color:'#484f58',marginTop:3}}>{f.help}</p>
                </div>
              ))}
              {/* Live preview */}
              <div style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:16,border:'1px solid #30363d'}}>
                <p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8,marginBottom:8}}>PREVIEW (on TZS 500,000 net profit)</p>
                {(()=>{
                  const mgmt = Math.round(500000*(parseFloat(settings.mgmt_fee)||0)/100)
                  const net = 500000 - mgmt
                  const inv = Math.round(net*(parseFloat(settings.inv_share)||0)/100)
                  const co = Math.round(net*(parseFloat(settings.co_share)||0)/100)
                  const total = (parseFloat(settings.inv_share)||0)+(parseFloat(settings.co_share)||0)
                  return (<>
                    {[
                      {l:`Mgmt Fee (${settings.mgmt_fee}%)`,v:`TZS ${mgmt.toLocaleString()}`,c:'#7d8590'},
                      {l:`Investor (${settings.inv_share}%)`,v:`TZS ${inv.toLocaleString()}`,c:'#25d366'},
                      {l:`Company (${settings.co_share}%)`,v:`TZS ${co.toLocaleString()}`,c:'#a78bfa'},
                    ].map(st=>(
                      <div key={st.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0'}}>
                        <span style={{fontSize:12,color:'#7d8590'}}>{st.l}</span>
                        <span style={{fontSize:12,fontWeight:700,color:st.c}}>{st.v}</span>
                      </div>
                    ))}
                    {total!==100&&<p style={{fontSize:11,color:'#ff4d6d',marginTop:8,fontWeight:700}}>⚠️ Investor + Company = {total}% (must equal 100%)</p>}
                  </>)
                })()}
              </div>
              <button onClick={saveSettings} style={{...C.btn('#25d366'),width:'100%'}}>Save Settings</button>
            </div>
          </div>
        )}

        {/* ADD INVESTOR MODAL */}
        {invModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
            <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:440}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>👤 Add Investor</h2>
                <button onClick={()=>setInvModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              {[{label:'Full Name *',key:'name',ph:'e.g. John Mwangi'},{label:'Phone',key:'phone',ph:'0712345678'},{label:'Email',key:'email',ph:'john@email.com'},{label:'Notes',key:'notes',ph:'Optional'}].map(f=>(
                <div key={f.key} style={{marginBottom:12}}>
                  <label style={C.label}>{f.label}</label>
                  <input value={invForm[f.key]} onChange={e=>setInvForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={C.input}/>
                </div>
              ))}
              <div style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:12,border:'1px solid #30363d'}}>
                <p style={{fontSize:10,color:'#ffb547',fontWeight:700,letterSpacing:0.8,marginBottom:10}}>💰 PROFIT SPLIT FOR THIS INVESTOR</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                  {[{label:'Mgmt Fee %',key:'mgmt_fee'},{label:'Investor %',key:'inv_share'},{label:'Company %',key:'co_share'}].map(f=>(
                    <div key={f.key}>
                      <label style={C.label}>{f.label}</label>
                      <input value={invForm[f.key]} onChange={e=>setInvForm(p=>({...p,[f.key]:e.target.value}))} type="number" min="0" max="100" style={{...C.input,textAlign:'center',fontWeight:700}}/>
                    </div>
                  ))}
                </div>
                {(()=>{
                  const total = (parseFloat(invForm.inv_share)||0)+(parseFloat(invForm.co_share)||0)
                  const mgmt = Math.round(500000*(parseFloat(invForm.mgmt_fee)||0)/100)
                  const net = 500000-mgmt
                  const inv = Math.round(net*(parseFloat(invForm.inv_share)||0)/100)
                  const co = Math.round(net*(parseFloat(invForm.co_share)||0)/100)
                  return (<>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#7d8590',marginBottom:4}}>
                      <span>Preview on TZS 500k profit:</span>
                      <span style={{color:total===100?'#25d366':'#ff4d6d',fontWeight:700}}>Inv+Co = {total}% {total===100?'✅':'⚠️ must be 100%'}</span>
                    </div>
                    <div style={{display:'flex',gap:12,fontSize:11}}>
                      <span style={{color:'#7d8590'}}>Mgmt: <b style={{color:'#ffb547'}}>TZS {mgmt.toLocaleString()}</b></span>
                      <span style={{color:'#7d8590'}}>Investor: <b style={{color:'#25d366'}}>TZS {inv.toLocaleString()}</b></span>
                      <span style={{color:'#7d8590'}}>Co: <b style={{color:'#a78bfa'}}>TZS {co.toLocaleString()}</b></span>
                    </div>
                  </>)
                })()}
              </div>
              <button onClick={saveInvestor} disabled={saving} style={{...C.btn('#25d366'),width:'100%',marginTop:8,opacity:saving?0.6:1}}>{saving?'Saving...':'Add Investor'}</button>
            </div>
          </div>
        )}

        {/* NEW BATCH MODAL */}
        {batchModal && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
            <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>📦 New Batch</h2>
                <button onClick={()=>setBatchModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{marginBottom:12}}>
                <label style={C.label}>INVESTOR *</label>
                <select value={batchForm.investor_id} onChange={e=>setBatchForm(p=>({...p,investor_id:e.target.value}))} style={C.input}>
                  <option value="">Select investor...</option>
                  {investors.map(inv=><option key={inv.id} value={inv.id}>{inv.name}</option>)}
                </select>
              </div>
              {[
                {label:'Product',key:'product',ph:'Reinzosil Victor Reinz'},
                {label:'Buy Price per Box (TZS) *',key:'buy_price',ph:'55000',type:'number'},
                {label:'Number of Boxes *',key:'boxes',ph:'e.g. 20',type:'number'},
                {label:'Expected Sell Price PER BOX (TZS)',key:'sell_price',ph:'e.g. 75000 per box',type:'number'},
                {label:'Start Date',key:'start_date',type:'date'},
                {label:'Expected End Date',key:'expected_end_date',type:'date'},
                {label:'Notes',key:'notes',ph:'Optional'},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:12}}>
                  <label style={C.label}>{f.label}</label>
                  <input value={batchForm[f.key]} onChange={e=>setBatchForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||''} type={f.type||'text'} style={f.key==='sell_price'?{...C.input,borderColor:'#ffb547'}:C.input}/>
                  {f.key==='sell_price'&&batchForm.sell_price&&<p style={{fontSize:10,color:'#ffb547',marginTop:3}}>⚠️ Per box price. {batchForm.boxes?`${batchForm.boxes} boxes × TZS ${parseFloat(batchForm.sell_price).toLocaleString()} = TZS ${(parseInt(batchForm.boxes)*parseFloat(batchForm.sell_price)).toLocaleString()} total revenue`:''}</p>}
                </div>
              ))}
              {batchForm.buy_price&&batchForm.boxes&&batchForm.sell_price&&(()=>{
                const c=calcBatch({buy_price:parseFloat(batchForm.buy_price),boxes:parseInt(batchForm.boxes),sell_price:parseFloat(batchForm.sell_price)})
                return (
                  <div style={{background:'rgba(33,150,243,0.08)',border:'1px solid #2196F330',borderRadius:10,padding:12,marginBottom:12}}>
                    <p style={{fontSize:10,color:'#2196F3',fontWeight:700,letterSpacing:0.8,marginBottom:8}}>PROJECTED RETURNS</p>
                    {[
                      {l:'Capital',v:fmt(c.capital),c:'#ff4d6d'},
                      {l:'Revenue',v:fmt(c.revenue),c:'#2196F3'},
                      {l:'Gross Profit',v:fmt(c.grossProfit),c:'#e6edf3'},
                      {l:'Mgmt Fee (5%)',v:fmt(c.mgmtFee),c:'#7d8590'},
                      {l:'Net Profit',v:fmt(c.netProfit),c:'#e6edf3'},
                      {l:'Investor 70%',v:fmt(c.invProfit),c:'#25d366'},
                      {l:'Company 30%',v:fmt(c.coProfit),c:'#a78bfa'},
                      {l:'Investor ROI',v:`${(c.roi*100).toFixed(1)}%`,c:'#ffb547'},
                    ].map(st=>(
                      <div key={st.l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #30363d'}}>
                        <span style={{fontSize:12,color:'#7d8590'}}>{st.l}</span>
                        <span style={{fontSize:12,fontWeight:700,color:st.c}}>{st.v}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <button onClick={saveBatch} disabled={saving} style={{...C.btn('#2196F3','#fff'),width:'100%',opacity:saving?0.6:1}}>{saving?'Saving...':'Create Batch'}</button>
            </div>
          </div>
        )}
      {/* SIMULATOR TAB */}
      {tab==='simulate' && (
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <div style={{background:'linear-gradient(135deg,#1a2340,#0d1117)',border:'1px solid #2196F330',borderRadius:16,padding:28,marginBottom:20,textAlign:'center'}}>
            <p style={{fontSize:32,marginBottom:8}}>💰</p>
            <h2 style={{fontSize:22,fontWeight:900,marginBottom:6}}>Investment Simulator</h2>
            <p style={{fontSize:13,color:'#7d8590'}}>See your projected returns before committing capital</p>
            <p style={{fontSize:11,color:'#484f58',marginTop:4}}>G2K Auto Parts — {sim.product_name||'Inventory'} Fund</p>
          </div>

          {/* Fund Product Selector */}
          <div style={{...C.card,marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,fontWeight:600}}>SELECT PRODUCT</p>
              <button onClick={()=>setFundProdModal(true)} style={{padding:'5px 12px',borderRadius:6,background:'rgba(33,150,243,0.1)',color:'#2196F3',border:'1px solid #2196F330',fontSize:11,fontWeight:600,cursor:'pointer'}}>⚙️ Manage Products</button>
            </div>
            {fundProducts.length===0 ? (
              <div style={{textAlign:'center',padding:'20px',color:'#484f58'}}>
                <p style={{marginBottom:8}}>No fund products configured yet.</p>
                <button onClick={()=>setFundProdModal(true)} style={{padding:'8px 16px',borderRadius:8,background:'#2196F3',color:'#fff',border:'none',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Fund Product</button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                {fundProducts.map(p=>(
                  <div key={p.id} onClick={()=>setSim(prev=>({...prev,product_name:p.name,buy_price:String(p.buy_price||''),sell_low:String(p.sell_low||''),sell_mid:String(p.sell_mid||''),sell_high:String(p.sell_high||'')}))}
                    style={{background:sim.product_name===p.name?'rgba(33,150,243,0.15)':'#0d1117',border:`1.5px solid ${sim.product_name===p.name?'#2196F3':'#30363d'}`,borderRadius:10,padding:12,cursor:'pointer',transition:'border-color 0.15s'}}>
                    <p style={{fontSize:13,fontWeight:700,marginBottom:4}}>{p.name}</p>
                    {p.description&&<p style={{fontSize:10,color:'#7d8590',marginBottom:6}}>{p.description}</p>}
                    <p style={{fontSize:11,color:'#2196F3',marginBottom:2}}>📦 {p.boxes_per_carton||4} boxes/carton</p>
                    <p style={{fontSize:11,color:'#ffb547',marginBottom:2}}>Min: {p.min_cartons||10} cartons ({(p.min_cartons||10)*(p.boxes_per_carton||4)} boxes)</p>
                    <p style={{fontSize:11,color:'#25d366'}}>Sell: TZS {(p.sell_mid||0).toLocaleString()}/box</p>
                    {sim.product_name===p.name&&<p style={{fontSize:10,color:'#2196F3',marginTop:4,fontWeight:700}}>✓ Selected</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{...C.card,marginBottom:16}}>
            <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:14,fontWeight:600}}>YOUR INVESTMENT</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label style={C.label}>CAPITAL TO INVEST (TZS)</label>
                <input value={sim.capital} onChange={e=>setSim(p=>({...p,capital:e.target.value}))} type="number" style={{...C.input,fontSize:16,fontWeight:700,color:'#2196F3'}}/>
                {sim.capital&&sim.buy_price&&(()=>{
                  const fp = fundProducts.find(p=>p.name===sim.product_name)
                  const bpc = fp?.boxes_per_carton||4
                  const minC = fp?.min_cartons||10
                  const boxes = Math.floor(parseFloat(sim.capital)/parseFloat(sim.buy_price))
                  const cartons = Math.floor(boxes/bpc)
                  const minCap = minC * bpc * parseFloat(sim.buy_price)
                  return (
                    <div style={{marginTop:6}}>
                      <p style={{fontSize:11,color:'#7d8590'}}>{boxes} boxes = {cartons} cartons ({bpc} boxes/carton)</p>
                      {parseFloat(sim.capital) < minCap && <p style={{fontSize:11,color:'#ff4d6d',fontWeight:700,marginTop:2}}>
                        ⚠️ Minimum is {minC} cartons ({minC*bpc} boxes) = TZS {minCap.toLocaleString()}
                      </p>}
                      {parseFloat(sim.capital) >= minCap && <p style={{fontSize:11,color:'#25d366',marginTop:2}}>✅ Meets minimum investment</p>}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label style={C.label}>NUMBER OF CYCLES</label>
                <select value={sim.cycles} onChange={e=>setSim(p=>({...p,cycles:e.target.value}))} style={C.input}>
                  {[1,2,3,4,6,8,12].map(n=><option key={n} value={n}>{n} cycle{n>1?'s':''} (~{n*3} months)</option>)}
                </select>
              </div>
            </div>
            <p style={{fontSize:11,color:'#ffb547',letterSpacing:0.8,marginBottom:10,fontWeight:600}}>PRODUCT PRICING</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
              {[{l:'Buy Price/Box',k:'buy_price'},{l:'Min Sell',k:'sell_low'},{l:'Expected Sell',k:'sell_mid'},{l:'Max Sell',k:'sell_high'}].map(f=>(
                <div key={f.k}>
                  <label style={C.label}>{f.l} (TZS)</label>
                  <input value={sim[f.k]} onChange={e=>setSim(p=>({...p,[f.k]:e.target.value}))} type="number" style={C.input}/>
                </div>
              ))}
            </div>
          </div>

          <div style={{...C.card,marginBottom:16}}>
            <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12,fontWeight:600}}>AGREED PROFIT SPLIT</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              {[{l:'Mgmt Fee %',k:'mgmt_fee'},{l:'Your Share %',k:'inv_share'},{l:'Company %',k:'co_share'}].map(f=>(
                <div key={f.k}>
                  <label style={C.label}>{f.l}</label>
                  <input value={sim[f.k]} onChange={e=>setSim(p=>({...p,[f.k]:e.target.value}))} type="number" min="0" max="100" style={{...C.input,textAlign:'center',fontWeight:700,color:'#ffb547'}}/>
                </div>
              ))}
            </div>
            {(parseFloat(sim.inv_share)||0)+(parseFloat(sim.co_share)||0)!==100&&(
              <p style={{fontSize:11,color:'#ff4d6d',marginTop:8,fontWeight:700}}>⚠️ Your Share + Company must = 100%</p>
            )}
          </div>

          {(()=>{
            const capital=parseFloat(sim.capital)||0
            const buyP=parseFloat(sim.buy_price)||55000
            const cycles=parseInt(sim.cycles)||1
            const mgmtPct=(parseFloat(sim.mgmt_fee)||5)/100
            const invPct=(parseFloat(sim.inv_share)||70)/100
            const coPct=(parseFloat(sim.co_share)||30)/100
            const boxes=Math.floor(capital/buyP)
            const invTotal=(parseFloat(sim.inv_share)||0)+(parseFloat(sim.co_share)||0)
            if(!capital||!boxes||invTotal!==100) return <p style={{textAlign:'center',color:'#484f58',padding:20}}>Fill in your investment details above to see projections</p>
            const minRequired = minBoxes * buyP

            const bpc=parseInt(sim.boxes_per_carton)||4
            const minC=parseInt(sim.min_cartons)||10
            const minBoxes=minC*bpc
            const calcCycle=(sell,cap)=>{
              const b=Math.floor(cap/buyP)
              const rev=sell*b
              const gross=rev-cap
              const mgmt=Math.round(gross*mgmtPct)
              const net=gross-mgmt
              const invP=Math.round(net*invPct)
              const coP=Math.round(net*coPct)
              return{b,rev,gross,mgmt,net,invP,coP,total:cap+invP,roi:cap>0?invP/cap:0}
            }

            const compoundSim=(sell)=>{
              let cap=capital; let totalP=0; const rows=[]
              for(let i=1;i<=cycles;i++){
                const r=calcCycle(sell,cap)
                totalP+=r.invP
                rows.push({cycle:i,boxes:r.b,capital:cap,profit:r.invP,received:r.total})
                cap=r.total
              }
              return{rows,totalP,finalAmt:cap}
            }

            const scenarios=[
              {label:'Conservative',sell:parseFloat(sim.sell_low)||70000,c:'#7d8590',icon:'📉'},
              {label:'Expected',sell:parseFloat(sim.sell_mid)||75000,c:'#2196F3',icon:'📊'},
              {label:'Best Case',sell:parseFloat(sim.sell_high)||90000,c:'#25d366',icon:'📈'},
            ]

            return(<>
              <div style={{...C.card,marginBottom:16}}>
                <p style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:16,fontWeight:600}}>PER CYCLE RETURNS (90 days)</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                  {scenarios.map(({label,sell,c,icon})=>{
                    const r=calcCycle(sell,capital)
                    return(
                    <div key={label} style={{background:'#0d1117',borderRadius:12,padding:14,border:`1px solid ${c}30`,textAlign:'center'}}>
                      <p style={{fontSize:20,marginBottom:4}}>{icon}</p>
                      <p style={{fontSize:12,fontWeight:700,color:c,marginBottom:6}}>{label}</p>
                      <p style={{fontSize:10,color:'#7d8590',marginBottom:8}}>Sell @ TZS {(sell/1000).toFixed(0)}k/box</p>
                      {[
                        {l:'Cartons',v:`${Math.floor(r.b/bpc)} cartons`},
                        {l:'Boxes',v:`${r.b} boxes (${bpc}/carton)`},
                        {l:'Revenue',v:`TZS ${fmtK(r.rev)}`},
                        {l:'Mgmt Fee',v:`TZS ${fmtK(r.mgmt)}`,dim:true},
                        {l:'Your Profit',v:`TZS ${fmtK(r.invP)}`,bold:true,col:c},
                        {l:'You Receive',v:`TZS ${fmtK(r.total)}`,bold:true,col:c},
                        {l:'ROI',v:`${(r.roi*100).toFixed(1)}%`,bold:true,col:c},
                      ].map(s=>(
                        <div key={s.l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #1e2840'}}>
                          <span style={{fontSize:11,color:s.dim?'#484f58':'#7d8590'}}>{s.l}</span>
                          <span style={{fontSize:11,fontWeight:s.bold?800:600,color:s.col||'#e6edf3'}}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                  )})}
                </div>
              </div>

              {cycles>1&&(()=>{
                const exp=compoundSim(parseFloat(sim.sell_mid)||75000)
                const ann=((exp.finalAmt-capital)/capital*100)/(cycles*3)*12
                return(
                <div style={{...C.card,marginBottom:16,borderColor:'#25d36630'}}>
                  <p style={{fontSize:11,color:'#25d366',letterSpacing:0.8,marginBottom:4,fontWeight:600}}>📈 {cycles}-CYCLE COMPOUNDING (reinvesting profit)</p>
                  <p style={{fontSize:11,color:'#7d8590',marginBottom:14}}>Profit rolls into next batch each cycle</p>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:14}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid #30363d'}}>
                        {['Cycle','Duration','Boxes','Capital','Your Profit','You Receive'].map(h=>(
                          <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:9,color:'#7d8590',letterSpacing:0.8}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exp.rows.map((r,i)=>(
                        <tr key={i} style={{borderBottom:i<exp.rows.length-1?'1px solid #1e2840':'none'}}>
                          <td style={{padding:'8px 10px',color:'#7d8590'}}>#{r.cycle}</td>
                          <td style={{padding:'8px 10px',color:'#7d8590',fontSize:11}}>Day {(r.cycle-1)*90+1}–{r.cycle*90}</td>
                          <td style={{padding:'8px 10px'}}>{r.boxes}</td>
                          <td style={{padding:'8px 10px',color:'#ff4d6d',fontWeight:700}}>{fmtK(r.capital)}</td>
                          <td style={{padding:'8px 10px',color:'#25d366',fontWeight:700}}>{fmtK(r.profit)}</td>
                          <td style={{padding:'8px 10px',color:'#2196F3',fontWeight:700}}>{fmtK(r.received)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{background:'#0d1117',borderRadius:10,padding:14,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,textAlign:'center',marginBottom:10}}>
                    {[
                      {l:'Initial Capital',v:fmtK(capital),c:'#ff4d6d'},
                      {l:`Total Profit`,v:fmtK(exp.totalP),c:'#25d366'},
                      {l:'Final Amount',v:fmtK(exp.finalAmt),c:'#2196F3'},
                    ].map(s=>(
                      <div key={s.l}>
                        <p style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</p>
                        <p style={{fontSize:10,color:'#7d8590',marginTop:4}}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{textAlign:'center',fontSize:13,color:'#25d366',fontWeight:700}}>
                    Total ROI: {((exp.totalP/capital)*100).toFixed(1)}% over {cycles*3} months · {ann.toFixed(1)}%/year
                  </p>
                  <p style={{textAlign:'center',fontSize:11,color:'#484f58',marginTop:4}}>vs Bank savings: ~8%/year</p>
                </div>
              )})()}

              <div style={{background:'rgba(33,150,243,0.08)',border:'1px solid #2196F330',borderRadius:12,padding:16,textAlign:'center'}}>
                <p style={{fontSize:13,fontWeight:700,marginBottom:4}}>Ready to invest?</p>
                <p style={{fontSize:12,color:'#7d8590',marginBottom:8}}>Contact Anthony Nyagilo — G2K Auto Parts, Dar es Salaam</p>
                <p style={{fontSize:11,color:'#484f58'}}>Capital always returned in full first. Monthly reports via TheDashboard.</p>
              </div>
            </>)
          })()}
        </div>
      )}

      </Layout>
    </>
  )
}
