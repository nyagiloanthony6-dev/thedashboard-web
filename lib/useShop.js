import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from './supabase'

export default function useShop() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [shopId, setShopId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
      if (!prof) { router.push('/auth/login'); return }
      setProfile(prof)
      const s = prof.shops
      setShop(s)
      setShopId(s?.id)
      setLoading(false)
    })
  }, [])

  return { profile, shop, shopId, loading }
}
