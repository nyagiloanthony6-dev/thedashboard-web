import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useKibali } from '../../lib/kibali'
import { supabase } from '../../lib/supabase'

// /kibali sends each role to its own Kibali screen
export default function KibaliHome() {
  const k = useKibali()
  const router = useRouter()
  useEffect(() => {
    if (k.loading) return
    const to = { storekeeper: '/kibali/store', shop_clerk: '/kibali/shop', cashier: '/kibali/shop', shop_admin: '/kibali/owner', super_admin: '/kibali/owner' }[k.role]
    if (to) router.replace(to)
  }, [k.loading, k.role])
  if (k.loading || ['storekeeper', 'shop_clerk', 'cashier', 'shop_admin', 'super_admin'].includes(k.role)) return null
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Akaunti hii haina skrini ya Kibali</p>
        <p style={{ color: '#7d8590', fontSize: 13, marginBottom: 16 }}>Muombe mmiliki akubadilishie nafasi kuwa Shop clerk au Storekeeper kwenye Team.</p>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#ff4d6d', fontWeight: 700 }}>Toka</button>
      </div>
    </div>
  )
}
