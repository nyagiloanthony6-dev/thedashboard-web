import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { loadModules, cachedModules, isStoreOnly } from '../lib/store'
import Icon from './store/Icon'
import { TDMark, SLWordmark, StoreFrame } from './store/Shell'

// Serengeti Labs brand: white sidebar, indigo active state, saffron highlight.
// module: 'pos' items are hidden for Store-only shops; 'kibali' (Store) items
// show only when the shop has the Store module.
const NAV = [
  { href:'/dashboard',  icon:'grid',      label:'Dashboard', module:'pos' },
  { href:'/sales',      icon:'cart',      label:'Sales / POS', module:'pos' },
  { href:'/store/owner', icon:'store',    label:'Store', module:'kibali' },
  { href:'/stock',      icon:'tag',       label:'Stock' },
  // Central Warehouse hidden (Nov 2026): TheDashboard Store covers it. Page and data kept at /warehouse.
  { href:'/customers',  icon:'users',     label:'Customers', module:'pos' },
  { href:'/expenses',   icon:'wallet',    label:'Expenses', module:'pos' },
  { href:'/credit',     icon:'handshake', label:'Credit', module:'pos' },
  { href:'/loans',      icon:'card',      label:'Loans', module:'pos' },
  { href:'/orders',     icon:'clipboard', label:'Field Orders', module:'pos' },
  { href:'/reports',    icon:'chart',     label:'Reports', module:'pos' },
  { href:'/reports/monthly', icon:'calendar', label:'Monthly Sales', module:'pos' },
  { href:'/team',       icon:'users',     label:'Team' },
  { href:'/whatsapp',   icon:'message',   label:'WhatsApp', module:'pos' },
  { href:'/vendors',    icon:'building',  label:'Vendors', module:'pos' },
  { href:'/investors',  icon:'coins',     label:'Investor Fund', module:'pos' },
  { href:'/batches',    icon:'layers',    label:'Stock Batches', module:'pos' },
  { href:'/settings',   icon:'gear',      label:'Settings' },
]

// Store-only shops see these pages under their Store (Swahili) names
const STORE_TITLES = { '/stock': 'Bidhaa', '/team': 'Wafanyakazi', '/settings': 'Mipangilio' }

const C = { bg:'#F6F7FB', surface:'#FFFFFF', sunk:'#ECEEF7', ink:'#15183A', muted:'#5B607E', line:'#DCDFEC', indigo:'#2D2F8F', saffron:'#F2A007', coral:'#B93A16' }

export default function Layout({ children, title, shop, profile }) {
  const router = useRouter()
  const [col, setCol] = useState(false)
  const [modules, setModules] = useState(cachedModules)
  useEffect(() => { if (shop?.id) loadModules(shop.id).then(setModules) }, [shop?.id])
  const nav = NAV.filter(n => !n.module || (modules && modules[n.module]))

  const active = (href) => router.pathname === href || (href !== '/reports' && router.pathname.startsWith(href + '/')) || (href === '/store/owner' && router.pathname.startsWith('/store'))

  if (isStoreOnly(modules)) return (
    <StoreFrame k={{ loading: false, shop, profile, role: profile?.role || 'shop_admin', modules }} title={STORE_TITLES[router.pathname] || title}>
      {children}
    </StoreFrame>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:C.bg }}>
      <aside style={{ width:col?64:236, background:C.surface, borderRight:`1px solid ${C.line}`, display:'flex', flexDirection:'column', flexShrink:0, position:'sticky', top:0, height:'100vh', overflowY:'auto', overflowX:'hidden', transition:'width 0.2s' }}>
        <div style={{ padding:col?'16px 13px':'18px 16px', borderBottom:`1px solid ${C.line}`, display:'flex', alignItems:'center', gap:10 }}>
          <TDMark size={36} />
          {!col && (
            <div style={{ minWidth:0 }}>
              <p style={{ fontFamily:'var(--display)', fontWeight: 700, fontSize:15, letterSpacing:'-0.01em', whiteSpace:'nowrap' }}>TheDashboard</p>
              <p style={{ fontSize:11, color:C.muted, marginTop:2 }}>by <SLWordmark size={11} /></p>
            </div>
          )}
        </div>
        {!col && shop && (
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.line}` }}>
            <p style={{ fontSize:10, color:C.muted, letterSpacing:0.8, fontWeight:600, marginBottom:2 }}>SHOP</p>
            <p style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shop.name}</p>
          </div>
        )}
        <nav style={{ flex:1, padding:'8px', overflowY:'auto' }}>
          {nav.map(n => {
            const on = active(n.href)
            return (
              <Link key={n.href} href={n.href} title={col ? n.label : undefined}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:8, marginBottom:1, background:on?C.sunk:'transparent', color:on?C.ink:C.muted, textDecoration:'none', fontSize:14, fontWeight:on?600:500, whiteSpace:'nowrap' }}>
                <span style={{ width:32, height:26, borderRadius:999, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:on?C.saffron:'transparent', color:on?C.ink:C.muted }}>
                  <Icon name={n.icon} size={18} />
                </span>
                {!col && n.label}
              </Link>
            )
          })}
        </nav>
        <div style={{ padding:'8px', borderTop:`1px solid ${C.line}` }}>
          <button onClick={() => setCol(p=>!p)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px', borderRadius:8, background:'transparent', border:'none', color:C.muted, fontSize:14 }}>
            <span style={{ width:32, display:'inline-flex', justifyContent:'center' }}><Icon name={col?'expand':'collapse'} size={18} /></span>{!col&&'Collapse'}
          </button>
          <button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/auth/login' }} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px', borderRadius:8, background:'transparent', border:'none', color:C.coral, fontSize:14 }}>
            <span style={{ width:32, display:'inline-flex', justifyContent:'center' }}><Icon name="logout" size={18} /></span>{!col&&'Logout'}
          </button>
        </div>
      </aside>

      <main style={{ flex:1, overflow:'auto', minWidth:0 }}>
        <div style={{ padding:'14px 24px', borderBottom:`1px solid ${C.line}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(246,247,251,0.92)', backdropFilter:'blur(8px)', position:'sticky', top:0, zIndex:10 }}>
          <h1 style={{ fontFamily:'var(--display)', fontSize:18, fontWeight: 700, letterSpacing:'-0.01em' }}>{title}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {profile && <span style={{ fontSize:14, color:C.muted }}>{profile.full_name}</span>}
            <div style={{ width:34, height:34, background:C.indigo, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#FFFFFF' }}>
              {profile?.full_name?.charAt(0)?.toUpperCase()||'A'}
            </div>
          </div>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </main>
    </div>
  )
}
