import { useState } from 'react'
import Link from 'next/link'
import { TDMark, SLWordmark } from '../../components/store/Shell'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

export default function Register() {
  const router = useRouter()
  const [step,setStep]=useState(1)
  const [status,setStatus]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [form,setForm]=useState({shopName:'',fullName:'',phone:'',email:'',password:'',password2:''})
  const set = k => e => setForm(p=>({...p,[k]:e.target.value}))

  const register = async (e) => {
    e.preventDefault()
    if(form.password!==form.password2){setError('Passwords do not match.');return}
    if(form.password.length<6){setError('Password must be at least 6 characters.');return}
    setLoading(true);setStep(2);setError('')
    setStatus('Creating your account...')
    const {data:auth,error:authErr}=await supabase.auth.signUp({email:form.email.trim(),password:form.password})
    if(authErr){setError(authErr.message);setLoading(false);setStep(1);return}
    const userId=auth.user?.id
    if(!userId){setError('Account creation failed. Try again.');setLoading(false);setStep(1);return}
    setStatus('Setting up your shop...')
    const trialEnd=new Date();trialEnd.setDate(trialEnd.getDate()+14)
    const {data:shop,error:shopErr}=await supabase.from('shops').insert({name:form.shopName.trim(),subscription:'trial',sub_plan:'trial',trial_started_at:new Date().toISOString(),sub_expires_at:trialEnd.toISOString()}).select().single()
    if(shopErr){setError(shopErr.message);setLoading(false);setStep(1);return}
    setStatus('Creating your profile...')
    const raw=form.phone.trim().replace(/\D/g,'')
    const phone=raw.startsWith('0')?'255'+raw.slice(1):raw.startsWith('255')?raw:'255'+raw
    await supabase.from('app_users').upsert({id:userId,email:form.email.trim(),full_name:form.fullName.trim(),phone,role:'shop_admin',shop_id:shop.id},{onConflict:'id'})
    await supabase.from('shop_owners').insert({user_id:userId,shop_id:shop.id})
    setStatus('✅ Done! Redirecting...')
    setTimeout(()=>router.push('/dashboard'),1500)
  }

  return (
    <>
      <Head><title>Start Free Trial — TheDashboard</title></Head>
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#F6F7FB',padding:24}}>
        <div style={{width:'100%',maxWidth:440}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}><TDMark size={52} /></div>
            <h1 style={{fontSize:24,fontWeight:800,letterSpacing:-0.5}}>Create your shop</h1>
            <p style={{color:'#5B607E',fontSize:13,marginTop:6}}>14 days free · No credit card needed</p>
          </div>
          {step===2?(
            <div style={{background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:12,padding:40,textAlign:'center'}}>
              <div style={{width:36,height:36,border:'3px solid #DCDFEC',borderTopColor:'#2D2F8F',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 20px'}}/>
              <p style={{color:'#2D2F8F',fontWeight:700,fontSize:14}}>{status}</p>
            </div>
          ):(
            <form onSubmit={register} style={{background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:12,padding:24}}>
              {[
                {k:'shopName',l:'Shop Name *',ph:'e.g. G2K Auto Parts',type:'text'},
                {k:'fullName',l:'Your Full Name *',ph:'e.g. Anthony Nyagilo',type:'text'},
                {k:'phone',l:'Phone Number *',ph:'e.g. 0741300354',type:'tel'},
                {k:'email',l:'Email Address *',ph:'e.g. you@gmail.com',type:'email'},
                {k:'password',l:'Password *',ph:'At least 6 characters',type:'password'},
                {k:'password2',l:'Confirm Password *',ph:'Repeat your password',type:'password'},
              ].map(f=>(
                <div key={f.k} style={{marginBottom:14}}>
                  <label>{f.l}</label>
                  <input type={f.type} value={form[f.k]} onChange={set(f.k)} placeholder={f.ph} required/>
                </div>
              ))}
              {error&&<div style={{background:'rgba(185,58,22,0.1)',border:'1px solid rgba(185,58,22,0.3)',borderRadius:8,padding:'10px 14px',marginBottom:14,color:'#B93A16',fontSize:13}}>{error}</div>}
              <button type="submit" disabled={loading} style={{width:'100%',padding:'13px',borderRadius:8,background:'#2D2F8F',color:'#FFFFFF',fontWeight:700,fontSize:15,border:'none',marginTop:4}}>
                Create Account & Start Free Trial 🚀
              </button>
            </form>
          )}
          <p style={{textAlign:'center',marginTop:18,color:'#5B607E',fontSize:13}}>
            Already have an account? <Link href="/auth/login" style={{color:'#2D2F8F',fontWeight:600}}>Sign in</Link>
          </p>
        </div>
      </div>
    </>
  )
}
