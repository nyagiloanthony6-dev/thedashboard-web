import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')

    const em = email.trim().toLowerCase()
    const pw = pass.trim()

    // Try 1: exact password as typed (admin full password)
    const { data: d1, error: e1 } = await supabase.auth.signInWithPassword({ email: em, password: pw })
    if (!e1 && d1?.user) { redirectByRole(d1.user.id); return }

    // If it looks like a PIN (4 digits) try cashier formats
    if (/^\d{4}$/.test(pw)) {
      // Try 2: PIN+PIN (new cashier format)
      const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({ email: em, password: pw + pw })
      if (!e2 && d2?.user) { redirectByRole(d2.user.id); return }

      // Try 3: PIN+shopSlug (old cashier format)
      const { data: prof } = await supabase.from('app_users').select('shop_id').eq('email', em).single()
      if (prof?.shop_id) {
        const slug = prof.shop_id.slice(0, 8)
        const { data: d3, error: e3 } = await supabase.auth.signInWithPassword({ email: em, password: pw + slug })
        if (!e3 && d3?.user) { redirectByRole(d3.user.id); return }
      }
    }

    setError('Wrong email or password. If you are a cashier, enter your 4-digit PIN as password.')
    setLoading(false)
  }

  const redirectByRole = async (userId) => {
    const { data: prof } = await supabase.from('app_users').select('role').eq('id', userId).single()
    const role = prof?.role || 'shop_admin'
    const routes = { shop_admin:'/dashboard', super_admin:'/dashboard', cashier:'/cashier', sales_rep:'/rep' }
    router.push(routes[role] || '/dashboard')
  }

  return (
    <>
      <Head><title>Login — TheDashboard</title></Head>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0d1117', padding:24 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ width:48, height:48, background:'#2196F3', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:20, color:'#000', margin:'0 auto 16px' }}>D</div>
            <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:-0.5 }}>Welcome back</h1>
            <p style={{ color:'#7d8590', fontSize:13, marginTop:6 }}>Sign in to TheDashboard</p>
          </div>

          <form onSubmit={login} style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:12, padding:24 }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:10, color:'#7d8590', letterSpacing:0.8, display:'block', marginBottom:6 }}>EMAIL ADDRESS</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="e.g. erasto@g2kautoparts.co.tz" required autoFocus/>
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:10, color:'#7d8590', letterSpacing:0.8, display:'block', marginBottom:6 }}>PASSWORD / PIN</label>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password or 4-digit PIN" required/>
              <p style={{ fontSize:11, color:'#484f58', marginTop:6 }}>Shop owners use their password · Cashiers and reps use their 4-digit PIN</p>
            </div>
            {error && <div style={{ background:'rgba(255,77,109,0.1)', border:'1px solid rgba(255,77,109,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#ff4d6d', fontSize:13 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px', borderRadius:8, background:'#2196F3', color:'#000', fontWeight:700, fontSize:15, border:'none', cursor:'pointer' }}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:18, color:'#7d8590', fontSize:13 }}>
            No account? <Link href="/auth/register" style={{ color:'#2196F3', fontWeight:600 }}>Start free trial</Link>
          </p>
          <p style={{ textAlign:'center', marginTop:8 }}>
            <Link href="/" style={{ color:'#484f58', fontSize:12 }}>Back to home</Link>
          </p>
        </div>
      </div>
    </>
  )
}
