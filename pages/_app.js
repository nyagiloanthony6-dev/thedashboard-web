import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { loadModules, ownedShop } from '../lib/kibali'

const PUBLIC = ['/', '/auth/login', '/auth/register', '/invest']

const ROLE_ROUTES = {
  shop_admin:  '/dashboard',
  super_admin: '/dashboard',
  cashier:     '/cashier',
  sales_rep:   '/rep',
  shop_clerk:  '/kibali/shop',
  storekeeper: '/kibali/store',
}

// Pages each role is allowed to access. A path ending in '$' must match
// exactly; any other path also allows its sub-pages.
const ROLE_ALLOWED = {
  shop_admin:  ['/dashboard', '/sales', '/stock', '/warehouse', '/customers', '/orders', '/expenses', '/credit', '/loans', '/whatsapp', '/reports', '/reports/monthly', '/team', '/settings', '/vendors', '/batches', '/investors', '/kibali'],
  super_admin: ['/dashboard', '/sales', '/stock', '/warehouse', '/customers', '/orders', '/expenses', '/credit', '/loans', '/whatsapp', '/reports', '/reports/monthly', '/team', '/settings', '/vendors', '/batches', '/investors', '/kibali'],
  cashier:     ['/cashier', '/kibali$', '/kibali/shop'],
  sales_rep:   ['/rep'],
  shop_clerk:  ['/kibali$', '/kibali/shop'],
  storekeeper: ['/kibali$', '/kibali/store'],
}
// Owner pages for a shop that has Kibali but not POS
const KIBALI_ONLY_ADMIN = ['/kibali', '/stock', '/team', '/settings']
// Staff in a Kibali-only shop: a cashier works as a shop clerk; sales reps have no Kibali screen
const KIBALI_ONLY_STAFF = { cashier: ['/kibali$', '/kibali/shop'], sales_rep: ['/kibali$'] }

// Role + modules are cached per user so route changes don't re-query
let access = null
async function getAccess(userId) {
  if (access?.userId === userId) return access
  const { data: prof } = await supabase.from('app_users').select('role,shop_id').eq('id', userId).single()
  const shopId = prof?.shop_id || (await ownedShop(userId))?.id
  const modules = await loadModules(shopId)
  access = { userId, role: prof?.role || 'shop_admin', modules }
  return access
}
const matches = (path, p) => p.endsWith('$') ? path === p.slice(0, -1) : path.startsWith(p)

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
        const { role, modules } = await getAccess(session.user.id)
        const isAdmin = role === 'shop_admin' || role === 'super_admin'
        const kibaliShop = !modules.pos && modules.kibali
        const kibaliOnly = isAdmin && kibaliShop
        const staffOverride = kibaliShop && !isAdmin ? KIBALI_ONLY_STAFF[role] : null
        const homeRoute = kibaliOnly ? '/kibali/owner' : staffOverride ? (role === 'cashier' ? '/kibali/shop' : '/kibali') : (ROLE_ROUTES[role] || '/dashboard')
        const allowed = kibaliOnly ? KIBALI_ONLY_ADMIN : (staffOverride || ROLE_ALLOWED[role] || ['/dashboard'])

        // Redirect from login page to home
        if (router.pathname === '/auth/login') {
          router.push(homeRoute)
          return
        }

        // Block access to pages this role can't see
        if (!pub) {
          const basePath = '/' + router.pathname.split('/')[1]
          const canAccess = allowed.some(p => matches(router.pathname, p))
          if (!canAccess) {
            router.push(homeRoute)
            return
          }
        }
      }

      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'SIGNED_OUT') { access = null; router.push('/auth/login') }
      if (e === 'SIGNED_IN') access = null
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
