import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

const PUBLIC = ['/', '/auth/login', '/auth/register', '/invest']

const ROLE_ROUTES = {
  shop_admin:  '/dashboard',
  super_admin: '/dashboard',
  cashier:     '/cashier',
  sales_rep:   '/rep',
}

// Pages each role is allowed to access
const ROLE_ALLOWED = {
  shop_admin:  ['/dashboard', '/sales', '/stock', '/warehouse', '/customers', '/orders', '/expenses', '/credit', '/loans', '/whatsapp', '/reports', '/reports/monthly', '/team', '/settings', '/vendors', '/batches', '/investors'],
  super_admin: ['/dashboard', '/sales', '/stock', '/warehouse', '/customers', '/orders', '/expenses', '/credit', '/loans', '/whatsapp', '/reports', '/reports/monthly', '/team', '/settings', '/vendors', '/batches', '/investors'],
  cashier:     ['/cashier'],
  sales_rep:   ['/rep'],
}

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const pub = PUBLIC.includes(router.pathname)

      if (!session && !pub) {
        router.push('/auth/login')
        return
      }

      if (session) {
        const { data: prof } = await supabase.from('app_users')
          .select('role').eq('id', session.user.id).single()
        const role = prof?.role || 'shop_admin'
        const homeRoute = ROLE_ROUTES[role] || '/dashboard'
        const allowed = ROLE_ALLOWED[role] || ['/dashboard']

        // Redirect from login page to home
        if (router.pathname === '/auth/login') {
          router.push(homeRoute)
          return
        }

        // Block access to pages this role can't see
        if (!pub) {
          const basePath = '/' + router.pathname.split('/')[1]
          const canAccess = allowed.some(p => router.pathname.startsWith(p))
          if (!canAccess) {
            router.push(homeRoute)
            return
          }
        }
      }

      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'SIGNED_OUT') router.push('/auth/login')
    })
    return () => subscription.unsubscribe()
  }, [router.pathname])

  if (!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0d1117'}}>
      <div style={{width:36,height:36,border:'3px solid #30363d',borderTopColor:'#2196F3',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  return <Component {...pageProps} />
}
