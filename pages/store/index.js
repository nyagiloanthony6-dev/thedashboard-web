import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useKibali } from '../../lib/store'
import { supabase } from '../../lib/supabase'

// /store sends each role to its own Store screen
export default function StoreHome() {
  const k = useKibali()
  const router = useRouter()
  useEffect(() => {
    if (k.loading) return
    const to = { storekeeper: '/store/release', shop_clerk: '/store/shop', cashier: '/store/shop', shop_admin: '/store/owner', super_admin: '/store/owner' }[k.role]
    if (to) router.replace(to)
  }, [k.loading, k.role])
  if (k.loading || ['storekeeper', 'shop_clerk', 'cashier', 'shop_admin', 'super_admin'].includes(k.role)) return null
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F7FB', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Akaunti hii haina skrini ya Store</p>
        <p style={{ color: '#5B607E', fontSize: 13, marginBottom: 16 }}>Muombe mmiliki akubadilishie nafasi kuwa Shop clerk au Storekeeper kwenye Team.</p>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #DCDFEC', background: 'transparent', color: '#B93A16', fontWeight: 700 }}>Toka</button>
      </div>
    </div>
  )
}
