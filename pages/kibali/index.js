import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useKibali } from '../../lib/kibali'

// /kibali sends each role to its own Kibali screen
export default function KibaliHome() {
  const k = useKibali()
  const router = useRouter()
  useEffect(() => {
    if (k.loading) return
    const to = { storekeeper: '/kibali/store', shop_clerk: '/kibali/shop', cashier: '/kibali/shop' }[k.role] || '/kibali/owner'
    router.replace(to)
  }, [k.loading, k.role])
  return null
}
