import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars')
}

export const supabase = createClient(
  supabaseUrl || 'https://woxymyidsmoskeifnqpw.supabase.co',
  supabaseKey || 'missing'
)

export const fmt  = (n) => `TZS ${Number(n||0).toLocaleString()}`
export const fmtK = (n) => n>=1000000?`TZS ${(n/1000000).toFixed(1)}M`:n>=1000?`TZS ${(n/1000).toFixed(0)}K`:fmt(n)
export const today = () => new Date().toISOString().split('T')[0]
export const ago  = (d) => {
  const date=new Date(d), now=new Date()
  const diff=Math.floor((now-date)/86400000)
  if(diff===0) return 'Today'
  if(diff===1) return 'Yesterday'
  if(diff<30)  return diff+'d ago'
  return date.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]
}
