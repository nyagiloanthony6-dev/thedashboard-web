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
      setShopMode(shop?.sale_mode)
      if (alive) setState({ loading: false, profile: prof, shop, role: prof.role || 'shop_admin', modules, saleMode: shopMode() })
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
// wholesale_stock. Each Store line/delivery/adjustment has a kind.
// ---------------------------------------------------------------------
export const KIND = {
  retail:    { sw: 'Rejareja', en: 'Retail',    short: 'R', c: '#2D2F8F' },
  wholesale: { sw: 'Jumla',    en: 'Wholesale', short: 'J', c: '#0F7375' },
}
// Shop sale mode (shops.sale_mode, set in Settings): 'retail' | 'wholesale' | 'both'.
// Single-mode shops only ever see and move that one stock.
let SHOP_MODE = 'both'
export const setShopMode = (m) => { SHOP_MODE = ['retail', 'wholesale'].includes(m) ? m : 'both' }
export const shopMode = () => SHOP_MODE
export const kindsShown = () => SHOP_MODE === 'both' ? ['retail', 'wholesale'] : [SHOP_MODE]

export const defaultKind = (p) => SHOP_MODE !== 'both' ? SHOP_MODE : (p?.product_type === 'wholesale' ? 'wholesale' : 'retail')
export const qtyOf = (p, kind = defaultKind(p)) => kind === 'wholesale' ? (p?.wholesale_stock || 0) : (p?.retail_stock || p?.stock || 0)
// Item sells both ways, or has stock in both places -> let people choose (both-mode shops only)
export const hasBoth = (p) => SHOP_MODE === 'both' && (p?.product_type === 'both' || ((p?.retail_stock || p?.stock || 0) > 0 && (p?.wholesale_stock || 0) > 0))
// Unit words: retail counts the item's unit (pc, bag…), wholesale counts boxes
export const unitOf = (p, kind) => kind === 'wholesale' ? 'boksi' : (p?.unit && p.unit !== 'unit' ? p.unit : 'pc')
// Stock text for an item, with units so retail and wholesale are never mistaken for one number
export const stockText = (p) => {
  const r = p?.retail_stock || p?.stock || 0, w = p?.wholesale_stock || 0
  if (SHOP_MODE === 'retail') return `${r} ${unitOf(p, 'retail')}`
  if (SHOP_MODE === 'wholesale') return `${w} ${unitOf(p, 'wholesale')}`
  if (p?.product_type === 'wholesale') return `Jumla ${w} ${unitOf(p, 'wholesale')}`
  if (hasBoth(p)) return `Rejareja ${r} ${unitOf(p, 'retail')} · Jumla ${w} ${unitOf(p, 'wholesale')}`
  return `Rejareja ${r} ${unitOf(p, 'retail')}`
}
// Does this shop use part numbers at all? (decides whether to show the column)
export const usesPartNumbers = (products) => products.some(p => p.part_number)
export const matchProduct = (p, q) => {
  q = q.trim().toLowerCase(); if (!q) return true
  return [p.name, p.part_number, p.category].some(v => (v || '').toLowerCase().includes(q))
}
export const resKey = (productId, kind) => String(productId) + ':' + kind

// Same query as the Stock page (select('*')), so Store always sees exactly the
// shop's products. Errors are thrown so screens can show them instead of an
// empty list.
// Part numbers are an optional per-shop custom field (Part No, SKU, OEM, Code…).
// Multi-tenant: shops without such a field get {} and nothing part-number related shows.
const PART_CACHE = {}
export async function partNumbers(shopId) {
  if (!shopId) return {}
  if (PART_CACHE[shopId]) return PART_CACHE[shopId]
  const parts = {}
  const { data: fields } = await supabase.from('product_custom_fields').select('id,field_name').eq('shop_id', shopId)
  const CODE_NAMES = ['part', 'sku', 'oem', 'item code', 'product code', 'item no', 'code']
  const nameOf = (f) => (f.field_name || '').toLowerCase()
  const partField = CODE_NAMES.map(n => (fields || []).find(f => nameOf(f).includes(n))).find(Boolean)
  if (partField) {
    const { data: vals } = await supabase.from('product_field_values').select('product_id,value').eq('field_id', partField.id)
    ;(vals || []).forEach(v => { if (v.value) parts[String(v.product_id)] = String(v.value).trim() })
  }
  PART_CACHE[shopId] = parts
  return parts
}
export function usePartNumbers(shopId) {
  const [parts, setParts] = useState(PART_CACHE[shopId] || {})
  useEffect(() => { let on = true; partNumbers(shopId).then(p => on && setParts(p)).catch(() => {}); return () => { on = false } }, [shopId])
  return parts
}
// Line label on slips: "Arm Bush Jumla" (kind only in shops selling both ways)
export const lineName = (i) => i.product_name + (shopMode() === 'both' ? ' ' + KIND[i.kind || 'retail'].sw : '')

export async function loadProducts(shopId) {
  if (!shopId) throw new Error('Duka halijapatikana kwa akaunti hii')
  const { data, error } = await supabase.from('products')
    .select('*').eq('shop_id', shopId).eq('is_active', true).order('name')
  if (error) throw new Error('Bidhaa hazikupakia: ' + error.message)

  const parts = await partNumbers(shopId)

  return (data || []).map(p => ({
    ...p,
    part_number: p.part_number || parts[String(p.id)] || '',
    retail: p.retail_stock || p.stock || 0, wholesale: p.wholesale_stock || 0,
  }))
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
// Serengeti Labs brand tokens (same palette as the company website).
// Names kept from the first version: `green` is the brand indigo and
// `gold` is the saffron highlight.
export const T = {
  surface: '#F6F7FB', raised: '#FFFFFF', tint: '#ECEEF7',
  ink: '#15183A', muted: '#5B607E', line: '#DCDFEC', lineStrong: '#8A8FAE',
  gold: '#F2A007', green: '#2D2F8F', coral: '#E4572E', teal: '#0F8B8D',
  success: '#0B7A6C', warning: '#9A5B00', danger: '#B93A16', info: '#2D2F8F',
  successBg: '#D8F0F0', warningBg: '#FDF0D2', dangerBg: '#FBE1D8', infoBg: '#E4E5F6',
  display: '"Unbounded", "Arial Black", system-ui, sans-serif',
  sans: '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
}

export const STATUS = {
  PENDING:   { label: 'Inasubiri',    en: 'Waiting',   c: T.warning, bg: T.warningBg, icon: '◷' },
  PARTIAL:   { label: 'Nusu',         en: 'Partial',   c: T.info,    bg: T.infoBg,    icon: '◐' },
  RELEASED:  { label: 'Imetoka',      en: 'Released',  c: T.success, bg: T.successBg, icon: '✓' },
  CANCELLED: { label: 'Imesitishwa',  en: 'Cancelled', c: T.muted,   bg: T.tint,      icon: '✕' },
}

export const ALERT_LABELS = {
  tamper: 'Karatasi imebadilishwa', badcode: 'Namba ya siri si sahihi', unknown: 'Oda haipo kwenye mfumo',
  reuse: 'Risiti imetumika tena', cancel: 'Oda imesitishwa', adjust: 'Stock imerekebishwa',
  negative: 'Stock chini ya sifuri', locked: 'Oda imefungwa',
}

export const fmtTime = (t) => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
export const isToday = (t) => new Date(t).toDateString() === new Date().toDateString()
export const itemSummary = (items = []) => items.map(i => `${i.qty} ${i.unit} ${i.product_name}`).join(' · ')

// Shared inline styles (Serengeti Labs look)
export const ui = {
  card: { background: T.raised, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 },
  btn: { padding: '10px 16px', borderRadius: 8, border: `1.5px solid ${T.lineStrong}`, background: T.raised, color: T.ink, fontWeight: 600, fontSize: 15 },
  primary: { padding: '12px 22px', borderRadius: 999, border: 'none', background: T.green, color: '#FFFFFF', fontWeight: 600, fontSize: 16 },
  dark: { padding: '12px 18px', borderRadius: 999, border: 'none', background: T.ink, color: T.surface, fontWeight: 600, fontSize: 15 },
  danger: { padding: '10px 16px', borderRadius: 8, border: `1.5px solid ${T.danger}`, background: T.raised, color: T.danger, fontWeight: 600, fontSize: 15 },
  muted: { color: T.muted, fontSize: 13 },
  h: { fontFamily: T.display, fontWeight: 600, fontSize: 18, lineHeight: '24px', letterSpacing: '-0.02em' },
  mono: { fontFamily: T.mono },
  pill: (s) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: STATUS[s]?.c, background: STATUS[s]?.bg, whiteSpace: 'nowrap' }),
  banner: (c) => ({ padding: '12px 14px', borderRadius: 8, fontSize: 15, lineHeight: '22px', color: c, background: ({ [T.danger]: T.dangerBg, [T.warning]: T.warningBg, [T.success]: T.successBg, [T.info]: T.infoBg })[c] || T.tint }),
}

// ---------------------------------------------------------------------
// Stock writes from POS pages. Shops with the Store module record every
// change in the movement history; POS-only shops keep the old direct write.
// ---------------------------------------------------------------------
// items: [{ product_id, qty, kind: 'retail' | 'wholesale' }]
export async function storeSell(items, reference) {
  const clean = items.filter(i => Number(i.qty) > 0).map(i => ({ product_id: String(i.product_id), qty: Math.round(Number(i.qty)), kind: i.kind || 'retail' }))
  if (!clean.length) return []
  return rpc('kibali_sell', { p_items: clean, p_reference: reference })
}

export async function storeReceive(productId, qty, kind, reference) {
  if (!(Number(qty) > 0)) return null
  return rpc('kibali_receive_stock', { p_product_id: String(productId), p_qty: Math.round(Number(qty)), p_reference: reference, p_kind: kind })
}

// "Chukua store": create a release order for a POS sale and return what the
// release slip needs. items: [{ product_id, name, unit, qty, kind }]
export async function storeReleaseForSale({ items, customer, phone, saleRef, cashierName }) {
  const res = await rpc('kibali_create_order', {
    p_customer: customer || '', p_phone: phone || '', p_collector: '', p_sale_ref: saleRef || '',
    p_items: items.map(i => ({ product_id: String(i.product_id), qty: Math.round(Number(i.qty)), kind: i.kind || 'retail' })),
  })
  return {
    code: res.code,
    order: { id: res.order_id, order_no: res.order_no, status: 'PENDING', created_at: new Date().toISOString(), created_by_name: cashierName || '', customer_name: customer || null, customer_phone: phone || null, sale_ref: saleRef || null },
    items: items.map((i, n) => ({ id: 'l' + n, product_id: String(i.product_id), product_name: i.name, unit: i.unit || 'unit', qty: Math.round(Number(i.qty)), kind: i.kind || 'retail' })),
  }
}
