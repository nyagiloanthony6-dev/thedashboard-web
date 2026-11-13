import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from './supabase'

// ---------------------------------------------------------------------
// Roles & permissions (mirror of public.kibali_can in the database —
// the database is what actually enforces them; this only hides UI)
// ---------------------------------------------------------------------
const PERMS = {
  'order.create':  ['super_admin', 'shop_admin', 'shop_clerk', 'cashier'],
  'order.cancel':  ['super_admin', 'shop_admin', 'shop_clerk', 'cashier'],
  'order.release': ['super_admin', 'shop_admin', 'storekeeper'],
  'stock.receive': ['super_admin', 'shop_admin', 'storekeeper'],
  'stock.adjust':  ['super_admin', 'shop_admin'],
  'kibali.audit':  ['super_admin', 'shop_admin'],
}

export const ROLE_LABELS = {
  shop_admin: 'Owner', super_admin: 'Owner', cashier: 'Cashier',
  sales_rep: 'Sales Rep', shop_clerk: 'Shop clerk', storekeeper: 'Storekeeper',
}

// Which modules a shop has. Falls back to POS-only when the
// shop_modules table is missing (migration not yet run).
export async function loadModules(shopId) {
  if (!shopId) return { pos: true, kibali: false }
  const { data, error } = await supabase.from('shop_modules').select('module,active,expires_at').eq('shop_id', shopId)
  if (error || !data) return { pos: true, kibali: false }
  const now = Date.now()
  const on = (m) => data.some(r => r.module === m && r.active && (!r.expires_at || new Date(r.expires_at).getTime() > now))
  const hasPosRow = data.some(r => r.module === 'pos')
  return { pos: hasPosRow ? on('pos') : true, kibali: on('kibali') }
}

// Some owners are linked to their shop only through shop_owners
// (app_users.shop_id empty) — same fallback the dashboard page uses.
export async function ownedShop(userId) {
  const { data } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', userId).limit(1)
  return data?.[0]?.shops || null
}

export function useKibali() {
  const router = useRouter()
  const [state, setState] = useState({ loading: true, profile: null, shop: null, role: null, modules: { pos: true, kibali: false } })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
      if (!prof) { router.push('/auth/login'); return }
      const shop = prof.shops || await ownedShop(user.id)
      const modules = await loadModules(shop?.id)
      if (alive) setState({ loading: false, profile: prof, shop, role: prof.role || 'shop_admin', modules })
    })()
    return () => { alive = false }
  }, [])

  const can = useCallback((perm) => state.modules.kibali && (PERMS[perm] || []).includes(state.role), [state.role, state.modules.kibali])
  return { ...state, can }
}

// Supabase RPC that throws a readable error
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message?.replace(/^.*?:\s(?=[A-Z])/, '') || 'Something went wrong')
  return data
}

// ---------------------------------------------------------------------
// Products: retail and wholesale stock are separate (same fields as the
// Stock page). Retail = retail_stock (falls back to stock); wholesale =
// wholesale_stock. Each Kibali line/delivery/adjustment has a kind.
// ---------------------------------------------------------------------
export const KIND = {
  retail:    { sw: 'Rejareja', en: 'Retail',    short: 'R', c: '#58a6ff' },
  wholesale: { sw: 'Jumla',    en: 'Wholesale', short: 'J', c: '#d2a8ff' },
}
export const defaultKind = (p) => p?.product_type === 'wholesale' ? 'wholesale' : 'retail'
export const qtyOf = (p, kind = defaultKind(p)) => kind === 'wholesale' ? (p?.wholesale_stock || 0) : (p?.retail_stock || p?.stock || 0)
// Item sells both ways, or has stock in both places -> let people choose
export const hasBoth = (p) => p?.product_type === 'both' || ((p?.retail_stock || p?.stock || 0) > 0 && (p?.wholesale_stock || 0) > 0)
export const resKey = (productId, kind) => String(productId) + ':' + kind

export async function loadProducts(shopId) {
  const { data } = await supabase.from('products')
    .select('id,name,unit,category,stock,retail_stock,wholesale_stock,product_type,low_stock_alert')
    .eq('shop_id', shopId).eq('is_active', true).order('name')
  return (data || []).map(p => ({ ...p, retail: p.retail_stock || p.stock || 0, wholesale: p.wholesale_stock || 0 }))
}

// Categories exactly as the Stock report lists them (distinct product.category)
export const categoriesOf = (products) => [...new Set(products.map(p => p.category).filter(Boolean))].sort()

// Products grouped by category for <optgroup> lists; uncategorised last
export const byCategory = (products) => {
  const g = {}
  products.forEach(p => { const c = p.category || 'Bila kundi'; (g[c] = g[c] || []).push(p) })
  return Object.keys(g).sort((a, b) => a === 'Bila kundi' ? 1 : b === 'Bila kundi' ? -1 : a.localeCompare(b)).map(c => [c, g[c]])
}

// { 'productId:kind': reserved }
export async function loadReserved() {
  const { data } = await supabase.from('kibali_reserved').select('product_id,kind,reserved')
  return Object.fromEntries((data || []).map(x => [resKey(x.product_id, x.kind || 'retail'), x.reserved]))
}

// ---------------------------------------------------------------------
// Numbers in Swahili words (receipts) — 0 to 999,999
// ---------------------------------------------------------------------
const SW_ONES = ['sifuri', 'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa']
const SW_TENS = ['', 'kumi', 'ishirini', 'thelathini', 'arobaini', 'hamsini', 'sitini', 'sabini', 'themanini', 'tisini']

function sw99(n) {
  if (n < 10) return SW_ONES[n]
  const t = Math.floor(n / 10), o = n % 10
  return SW_TENS[t] + (o ? ' na ' + SW_ONES[o] : '')
}
function sw999(n) {
  if (n < 100) return sw99(n)
  const h = Math.floor(n / 100), r = n % 100
  return 'mia ' + SW_ONES[h] + (r ? ' na ' + sw99(r) : '')
}
export function swWords(n) {
  n = Math.floor(Number(n) || 0)
  if (n < 1000) return sw999(n).toUpperCase()
  if (n < 1000000) {
    const th = Math.floor(n / 1000), r = n % 1000
    return ('elfu ' + sw999(th) + (r ? (r < 100 ? ' na ' : ' ') + sw999(r) : '')).toUpperCase()
  }
  return String(n)
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
export const STATUS = {
  PENDING:   { label: 'Inasubiri',    en: 'Waiting',   c: '#f0b429', bg: 'rgba(240,180,41,0.12)' },
  PARTIAL:   { label: 'Nusu',         en: 'Partial',   c: '#58a6ff', bg: 'rgba(88,166,255,0.12)' },
  RELEASED:  { label: 'Imetoka',      en: 'Released',  c: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  CANCELLED: { label: 'Imesitishwa',  en: 'Cancelled', c: '#7d8590', bg: 'rgba(125,133,144,0.12)' },
}

export const ALERT_LABELS = {
  tamper: 'Paper mismatch', badcode: 'Wrong release code', unknown: 'Unknown order number',
  reuse: 'Receipt reused', cancel: 'Order cancelled', adjust: 'Stock adjusted',
  negative: 'Stock below zero', locked: 'Order locked',
}

export const fmtTime = (t) => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
export const isToday = (t) => new Date(t).toDateString() === new Date().toDateString()
export const itemSummary = (items = []) => items.map(i => `${i.qty} ${i.unit} ${i.product_name}`).join(' · ')

// Shared inline styles (match TheDashboard web look)
export const ui = {
  card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 16 },
  btn: { padding: '10px 16px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#e6edf3', fontWeight: 700, fontSize: 13 },
  primary: { padding: '12px 18px', borderRadius: 8, border: 'none', background: '#2196F3', color: '#000', fontWeight: 800, fontSize: 14 },
  danger: { padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,77,109,0.5)', background: 'rgba(255,77,109,0.08)', color: '#ff4d6d', fontWeight: 700, fontSize: 13 },
  muted: { color: '#7d8590', fontSize: 12 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  pill: (s) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, color: STATUS[s]?.c, background: STATUS[s]?.bg, whiteSpace: 'nowrap' }),
  banner: (c) => ({ padding: '10px 14px', borderRadius: 8, fontSize: 13, color: c, background: c + '18', border: '1px solid ' + c + '44' }),
}
