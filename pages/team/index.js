import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK } from '../../lib/supabase'
import { loadModules, ownedShop } from '../../lib/store'

export default function Team() {
  const [profile,setProfile]=useState(null)
  const [shop,setShop]=useState(null)
  const [team,setTeam]=useState([])
  const [fieldOrders,setFieldOrders]=useState([])
  const [repSettings,setRepSettings]=useState([])
  const [loading,setLoading]=useState(true)
  const [showModal,setShowModal]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [form,setForm]=useState({fullName:'',username:'',pin:'',role:'cashier',email:''})
  const [commModal,setCommModal]=useState(null)
  const [commForm,setCommForm]=useState({monthly_target:'',commission_type:'flat',commission_rate:'5',tiered_rate_1:'2',tiered_rate_2:'4',tiered_rate_3:'7'})
  const [togglingId,setTogglingId]=useState(null)
  const [kibaliOn,setKibaliOn]=useState(false)
  const [posOn,setPosOn]=useState(true)

  useEffect(()=>{loadData()},[])

  const loadData=async()=>{
    const {data:{user}}=await supabase.auth.getUser()
    const {data:prof}=await supabase.from('app_users').select('*,shops(*)').eq('id',user.id).single()
    const shopData=prof.shops||await ownedShop(user.id)
    setProfile(prof);setShop(shopData)
    const shopId=shopData.id
    loadModules(shopId).then(m=>{setKibaliOn(m.kibali);setPosOn(m.pos);if(m.kibali&&!m.pos)setForm(f=>({...f,role:'shop_clerk'}))})
    const now=new Date()
    const mStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString()
    const [tr,fo,rs]=await Promise.all([
      supabase.from('app_users').select('*').eq('shop_id',shopId).in('role',['cashier','sales_rep','shop_clerk','storekeeper']).order('full_name'),
      supabase.from('field_orders').select('*').eq('shop_id',shopId).eq('status','fulfilled').gte('created_at',mStart),
      supabase.from('sales_rep_settings').select('*').eq('shop_id',shopId),
    ])
    setTeam(tr.data||[]);setFieldOrders(fo.data||[]);setRepSettings(rs.data||[]);setLoading(false)
  }

  const addMember=async()=>{
    setError('')
    if(!form.fullName.trim()||!form.username.trim()||form.pin.length!==4){setError('All fields required. PIN must be 4 digits.');return}
    setSaving(true)
    const shopId=shop.id,shopSlug=shopId.slice(0,8)
    const nameSlug=form.username.trim().toLowerCase().replace(/[^a-z0-9]/g,'')
    const email=form.email.trim()?form.email.trim().toLowerCase():nameSlug+'.'+shopSlug+'@thedashboard.app'
    const password=form.pin+form.pin
    const {data:auth,error:authErr}=await supabase.auth.signUp({email,password})
    if(authErr){setError(authErr.message);setSaving(false);return}
    const uid=auth.user?.id
    if(!uid){setError('Failed to create account.');setSaving(false);return}
    await supabase.from('app_users').insert({id:uid,email,full_name:form.fullName.trim(),role:form.role,shop_id:shopId,phone:form.pin})
    setSaving(false);setShowModal(false)
    setForm({fullName:'',username:'',pin:'',role:kibaliOn&&!posOn?'shop_clerk':'cashier',email:''})
    alert(`Added!\nUsername: ${form.username}\nPIN: ${form.pin}`)
    loadData()
  }

  const remove=async(m)=>{
    if(!confirm(`Remove ${m.full_name}?`))return
    await supabase.from('app_users').delete().eq('id',m.id)
    setTeam(p=>p.filter(x=>x.id!==m.id))
  }

  const toggleBroughtBy=async(m)=>{
    const newVal=!m.show_in_brought_by
    setTogglingId(m.id)
    const {error}=await supabase.from('app_users').update({show_in_brought_by:newVal}).eq('id',m.id)
    if(error){alert(error.message);setTogglingId(null);return}
    setTeam(p=>p.map(x=>x.id===m.id?{...x,show_in_brought_by:newVal}:x))
    setTogglingId(null)
  }

  const saveCommission=async()=>{
    if(!commModal)return
    const payload={shop_id:shop.id,user_id:commModal.id,monthly_target:parseFloat(commForm.monthly_target)||0,commission_type:commForm.commission_type,commission_rate:parseFloat(commForm.commission_rate)||5,tiered_rate_1:parseFloat(commForm.tiered_rate_1)||2,tiered_rate_2:parseFloat(commForm.tiered_rate_2)||4,tiered_rate_3:parseFloat(commForm.tiered_rate_3)||7}
    const {error}=await supabase.from('sales_rep_settings').upsert(payload,{onConflict:'shop_id,user_id'})
    if(error){alert(error.message);return}
    setRepSettings(p=>{const ex=p.find(s=>s.user_id===commModal.id);return ex?p.map(s=>s.user_id===commModal.id?{...s,...payload}:s):[...p,payload]})
    setCommModal(null);alert('Commission settings saved!')
  }

  const cashiers=team.filter(m=>m.role==='cashier')
  const kibaliStaff=team.filter(m=>m.role==='shop_clerk'||m.role==='storekeeper')
  // Store-only shops: hide cashier / sales rep sections unless someone is still in them
  const showCashiers=posOn||!kibaliOn||cashiers.length>0
  const showReps=posOn||!kibaliOn||salesReps.length>0
  const salesReps=team.filter(m=>m.role==='sales_rep')
  const card={background:'#161b22',border:'1px solid #30363d',borderRadius:12,padding:16}

  // Toggle pill component inline
  const BroughtByToggle=({m})=>{
    const on=!!m.show_in_brought_by
    const busy=togglingId===m.id
    return(
      <button
        onClick={()=>toggleBroughtBy(m)}
        disabled={busy}
        title={on?'Remove from Brought By dropdown':'Show in Brought By dropdown'}
        style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,border:'1px solid',borderColor:on?'rgba(37,211,102,0.4)':'#30363d',background:on?'rgba(37,211,102,0.1)':'transparent',color:on?'#25d366':'#484f58',fontSize:10,fontWeight:700,cursor:busy?'wait':'pointer',transition:'all 0.15s',whiteSpace:'nowrap'}}
      >
        <span style={{width:10,height:10,borderRadius:'50%',background:on?'#25d366':'#484f58',display:'inline-block',flexShrink:0,transition:'background 0.15s'}}/>
        {busy?'...':(on?'In Brought By':'Brought By')}
      </button>
    )
  }

  return(
    <>
      <Head><title>Team — TheDashboard</title></Head>
      <Layout title="Team Management" shop={shop} profile={profile}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div style={{display:'flex',gap:12}}>
            {showCashiers&&<div style={card}><span style={{fontSize:20}}>👤</span><p style={{fontSize:20,fontWeight:900,color:'#2196F3',marginTop:4}}>{cashiers.length}</p><p style={{fontSize:10,color:'#7d8590'}}>CASHIERS</p></div>}
            {showReps&&<div style={card}><span style={{fontSize:20}}>🏃</span><p style={{fontSize:20,fontWeight:900,color:'#a78bfa',marginTop:4}}>{salesReps.length}</p><p style={{fontSize:10,color:'#7d8590'}}>SALES REPS</p></div>}
            {kibaliOn&&<div style={card}><span style={{fontSize:20}}>🧾</span><p style={{fontSize:20,fontWeight:900,color:'#f0b429',marginTop:4}}>{kibaliStaff.length}</p><p style={{fontSize:10,color:'#7d8590'}}>STORE STAFF</p></div>}
          </div>
          <button onClick={()=>setShowModal(true)} style={{padding:'10px 20px',borderRadius:8,background:'#2196F3',color:'#000',fontWeight:700,fontSize:13,border:'none'}}>+ Add Team Member</button>
        </div>

        {/* Brought By legend */}
        <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:'rgba(37,211,102,0.06)',border:'1px solid rgba(37,211,102,0.15)',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:14}}>👤</span>
          <p style={{fontSize:12,color:'#7d8590'}}><span style={{color:'#25d366',fontWeight:700}}>Brought By</span> — toggle to control which team members appear in the cashier's "Brought By" dropdown at POS.</p>
        </div>

        <h2 style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12,display:showCashiers?'block':'none'}}>CASHIERS</h2>
        <div style={{display:showCashiers?'grid':'none',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginBottom:28}}>
          {cashiers.map(m=>(
            <div key={m.id} style={card}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{width:42,height:42,background:'rgba(33,150,243,0.15)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#2196F3',border:'1px solid rgba(33,150,243,0.2)'}}>{m.full_name.charAt(0)}</div>
                <div style={{flex:1}}>
                  <p style={{fontWeight:700,fontSize:14}}>{m.full_name}</p>
                  <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>@{m.email?.split('@')[0]?.split('.').slice(0,-1).join('.')}</p>
                  <p style={{fontSize:10,color:m.phone?'#4da6ff':'#ff4d6d',marginTop:1}}>{m.phone?'🔐 PIN set':'⚠️ No PIN'}</p>
                </div>
                <BroughtByToggle m={m}/>
              </div>
              <button onClick={()=>remove(m)} style={{width:'100%',padding:'7px',borderRadius:6,border:'1px solid rgba(255,77,109,0.3)',background:'transparent',color:'#ff4d6d',fontSize:11,fontWeight:600}}>Remove</button>
            </div>
          ))}
          {!cashiers.length&&<p style={{color:'#484f58',fontSize:13}}>No cashiers yet.</p>}
        </div>

        {(kibaliOn||kibaliStaff.length>0)&&<>
        <h2 style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12}}>STORE — SHOP CLERKS & STOREKEEPERS</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginBottom:28}}>
          {kibaliStaff.map(m=>(
            <div key={m.id} style={card}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{width:42,height:42,background:'rgba(240,180,41,0.15)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#f0b429',border:'1px solid rgba(240,180,41,0.25)'}}>{m.full_name.charAt(0)}</div>
                <div style={{flex:1}}>
                  <p style={{fontWeight:700,fontSize:14}}>{m.full_name}</p>
                  <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>{m.role==='storekeeper'?'Storekeeper — releases goods, receives stock':'Shop clerk — creates release orders'}</p>
                  <p style={{fontSize:11,color:'#7d8590',marginTop:1}}>@{m.email?.split('@')[0]?.split('.').slice(0,-1).join('.')}</p>
                </div>
              </div>
              <button onClick={()=>remove(m)} style={{width:'100%',padding:'7px',borderRadius:6,border:'1px solid rgba(255,77,109,0.3)',background:'transparent',color:'#ff4d6d',fontSize:11,fontWeight:600}}>Remove</button>
            </div>
          ))}
          {!kibaliStaff.length&&<p style={{color:'#484f58',fontSize:13}}>No Store staff yet. Add a shop clerk or storekeeper with "+ Add Team Member".</p>}
        </div>
        </>}

        <h2 style={{fontSize:11,color:'#7d8590',letterSpacing:0.8,marginBottom:12,display:showReps?'block':'none'}}>SALES REPS — THIS MONTH</h2>
        <div style={{display:showReps?'grid':'none',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
          {salesReps.map(rep=>{
            const rSet=repSettings.find(s=>s.user_id===rep.id)
            const target=Number(rSet?.monthly_target)||0
            const mOrders=fieldOrders.filter(o=>o.created_by===rep.id)
            const mTotal=mOrders.reduce((a,o)=>a+(Number(o.total)||0),0)
            const approved=mOrders.filter(o=>o.commission_status==='approved').reduce((a,o)=>a+(Number(o.commission_amount)||0),0)
            const pending=mOrders.filter(o=>o.commission_status==='pending').length
            const pct=target>0?Math.min(100,Math.round(mTotal/target*100)):0
            return(
              <div key={rep.id} style={{...card,borderColor:pct>=100?'rgba(37,211,102,0.3)':'#30363d'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{width:42,height:42,background:'rgba(167,139,250,0.15)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#a78bfa',border:'1px solid rgba(167,139,250,0.2)'}}>{rep.full_name.charAt(0)}</div>
                    <div>
                      <p style={{fontWeight:700,fontSize:14}}>{rep.full_name}</p>
                      <p style={{fontSize:11,color:'#7d8590',marginTop:2}}>{mOrders.length} orders</p>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                    <span style={{background:'rgba(167,139,250,0.1)',color:'#a78bfa',border:'1px solid rgba(167,139,250,0.2)',borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700}}>SALES REP</span>
                    <BroughtByToggle m={rep}/>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  {[{v:fmtK(mTotal),l:'SALES',c:'#2196F3'},{v:fmt(approved),l:'COMMISSION',c:'#25d366'},{v:pending,l:'PENDING',c:'#ffb547'}].map(s=>(
                    <div key={s.l} style={{flex:1,background:'#0d1117',borderRadius:8,padding:'8px',textAlign:'center'}}>
                      <p style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</p>
                      <p style={{fontSize:8,color:'#7d8590',marginTop:2}}>{s.l}</p>
                    </div>
                  ))}
                </div>
                {target>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:10,color:'#7d8590'}}>Target: {fmtK(target)}</span>
                      <span style={{fontSize:10,color:'#2196F3',fontWeight:700}}>{pct}%</span>
                    </div>
                    <div style={{height:5,background:'#30363d',borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:pct+'%',background:pct>=100?'#25d366':'#2196F3',borderRadius:3}}/>
                    </div>
                  </div>
                )}
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setCommModal(rep);setCommForm({monthly_target:String(rSet?.monthly_target||''),commission_type:rSet?.commission_type||'flat',commission_rate:String(rSet?.commission_rate||5),tiered_rate_1:String(rSet?.tiered_rate_1||2),tiered_rate_2:String(rSet?.tiered_rate_2||4),tiered_rate_3:String(rSet?.tiered_rate_3||7)})}} style={{flex:2,padding:'7px',borderRadius:6,border:'1px solid rgba(33,150,243,0.3)',background:'rgba(33,150,243,0.1)',color:'#2196F3',fontSize:11,fontWeight:600}}>⚙️ Commission</button>
                  <button onClick={()=>remove(rep)} style={{flex:1,padding:'7px',borderRadius:6,border:'1px solid rgba(255,77,109,0.3)',background:'transparent',color:'#ff4d6d',fontSize:11,fontWeight:600}}>Remove</button>
                </div>
              </div>
            )
          })}
          {!salesReps.length&&<p style={{color:'#484f58',fontSize:13}}>No sales reps yet.</p>}
        </div>

        {showModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
            <div style={{background:'#161b22',borderRadius:'20px 20px 0 0',padding:28,width:'100%',maxWidth:460,border:'1px solid #30363d'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Add Team Member</h2>
                <button onClick={()=>setShowModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20}}>✕</button>
              </div>
              <div style={{marginBottom:14}}>
                <label>Role</label>
                <div style={{display:'flex',gap:8}}>
                  {[...(posOn||!kibaliOn?[{k:'cashier',l:'Cashier'},{k:'sales_rep',l:'Sales Rep'}]:[]),...(kibaliOn?[{k:'shop_clerk',l:'Shop clerk'},{k:'storekeeper',l:'Storekeeper'}]:[])].map(r=>(
                    <button key={r.k} onClick={()=>setForm(p=>({...p,role:r.k}))} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid',borderColor:form.role===r.k?'#2196F3':'#30363d',background:form.role===r.k?'rgba(33,150,243,0.15)':'transparent',color:form.role===r.k?'#2196F3':'#7d8590',fontSize:12,fontWeight:700}}>{r.l}</button>
                  ))}
                </div>
              </div>
              {[{k:'fullName',l:'Full Name *',ph:'e.g. John Mwangi'},{k:'username',l:'Username *',ph:'e.g. john'},{k:'email',l:'Login Email (optional)',ph:'e.g. tonny@g2kautoparts.co.tz'}].map(f=>(
                <div key={f.k} style={{marginBottom:14}}><label>{f.l}</label><input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}/></div>
              ))}
              <div style={{marginBottom:14}}>
                <label>4-Digit PIN *</label>
                <input value={form.pin} onChange={e=>setForm(p=>({...p,pin:e.target.value.replace(/\D/g,'').slice(0,4)}))} placeholder="● ● ● ●" maxLength={4} type="password" style={{letterSpacing:8,fontSize:20,textAlign:'center'}}/>
              </div>
              {error&&<div style={{background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:8,padding:'10px 14px',marginBottom:14,color:'#ff4d6d',fontSize:13}}>{error}</div>}
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #30363d',background:'transparent',color:'#e6edf3',fontWeight:600}}>Cancel</button>
                <button onClick={addMember} disabled={saving} style={{flex:2,padding:'11px',borderRadius:8,background:'#2196F3',color:'#000',fontWeight:700,border:'none'}}>{saving?'Adding...':'Add Member'}</button>
              </div>
            </div>
          </div>
        )}

        {commModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setCommModal(null)}>
            <div style={{background:'#161b22',borderRadius:'20px 20px 0 0',padding:28,width:'100%',maxWidth:460,border:'1px solid #30363d'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>Commission — {commModal.full_name}</h2>
                <button onClick={()=>setCommModal(null)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20}}>✕</button>
              </div>
              <div style={{marginBottom:14}}><label>Monthly Target (TZS)</label><input value={commForm.monthly_target} onChange={e=>setCommForm(p=>({...p,monthly_target:e.target.value}))} placeholder="e.g. 10000000" type="number"/></div>
              <div style={{marginBottom:14}}>
                <label>Commission Type</label>
                <div style={{display:'flex',gap:8}}>
                  {[{k:'flat',l:'Flat %'},{k:'tiered',l:'Tiered'}].map(t=>(
                    <button key={t.k} onClick={()=>setCommForm(p=>({...p,commission_type:t.k}))} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid',borderColor:commForm.commission_type===t.k?'#2196F3':'#30363d',background:commForm.commission_type===t.k?'rgba(33,150,243,0.15)':'transparent',color:commForm.commission_type===t.k?'#2196F3':'#7d8590',fontSize:12,fontWeight:700}}>{t.l}</button>
                  ))}
                </div>
              </div>
              {commForm.commission_type==='flat'?(
                <div style={{marginBottom:14}}><label>Rate (%)</label><input value={commForm.commission_rate} onChange={e=>setCommForm(p=>({...p,commission_rate:e.target.value}))} type="number" placeholder="5"/></div>
              ):(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
                  {[{k:'tiered_rate_1',l:'Below 50%'},{k:'tiered_rate_2',l:'50-100%'},{k:'tiered_rate_3',l:'Above 100%'}].map(f=>(
                    <div key={f.k}><label style={{fontSize:9}}>{f.l.toUpperCase()}</label><input value={commForm[f.k]} onChange={e=>setCommForm(p=>({...p,[f.k]:e.target.value}))} type="number"/></div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setCommModal(null)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #30363d',background:'transparent',color:'#e6edf3',fontWeight:600}}>Cancel</button>
                <button onClick={saveCommission} style={{flex:2,padding:'11px',borderRadius:8,background:'#2196F3',color:'#000',fontWeight:700,border:'none'}}>Save Settings</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
