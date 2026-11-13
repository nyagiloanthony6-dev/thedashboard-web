import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { loadModules } from '../lib/kibali'

// module: 'pos' items are hidden for Kibali-only shops; 'kibali' items show
// only when the shop has the Kibali add-on.
const NAV = [
  { href:'/dashboard',  icon:'📊', label:'Dashboard', module:'pos' },
  { href:'/sales',      icon:'💰', label:'Sales / POS', module:'pos' },
  { href:'/kibali/owner', icon:'🧾', label:'Kibali (Stoo)', module:'kibali' },
  { href:'/stock',      icon:'📦', label:'Stock' },
  { href:'/warehouse',  icon:'🏭', label:'Warehouse', module:'pos' },
  { href:'/customers',  icon:'👥', label:'Customers' },
  { href:'/expenses',   icon:'💸', label:'Expenses', module:'pos' },
  { href:'/credit',     icon:'🤝', label:'Credit', module:'pos' },
  { href:'/loans',      icon:'💳', label:'Loans', module:'pos' },
  { href:'/orders',     icon:'📋', label:'Field Orders', module:'pos' },
  { href:'/reports',    icon:'📈', label:'Reports', module:'pos' },
  { href:'/reports/monthly', icon:'📅', label:'Monthly Sales', module:'pos' },
  { href:'/team',       icon:'👤', label:'Team' },
  { href:'/whatsapp',   icon:'💬', label:'WhatsApp', module:'pos' },
  { href:'/vendors',    icon:'🏢', label:'Vendors', module:'pos' },
  { href:'/investors', icon:'💰', label:'Investor Fund', module:'pos' },
  { href:'/batches', icon:'📦', label:'Stock Batches', module:'pos' },
  { href:'/settings',   icon:'⚙️',  label:'Settings' },
]

export default function Layout({ children, title, shop, profile }) {
  const router = useRouter()
  const [col, setCol] = useState(false)
  const [modules, setModules] = useState({ pos: true, kibali: false })
  useEffect(() => { if (shop?.id) loadModules(shop.id).then(setModules) }, [shop?.id])
  const nav = NAV.filter(n => !n.module || modules[n.module])

  const active = (href) => router.pathname === href || router.pathname.startsWith(href + '/') || (href === '/kibali/owner' && router.pathname.startsWith('/kibali'))

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0d1117' }}>
      {/* Sidebar */}
      <aside style={{ width:col?52:210, background:'#161b22', borderRight:'1px solid #30363d', display:'flex', flexDirection:'column', flexShrink:0, position:'sticky', top:0, height:'100vh', overflowY:'auto', overflowX:'hidden', transition:'width 0.2s' }}>
        {/* Logo */}
        <div style={{ padding:'16px 12px', borderBottom:'1px solid #30363d', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, background:'#2196F3', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:13, color:'#000', flexShrink:0 }}>D</div>
          {!col && <span style={{ fontWeight:800, fontSize:13, letterSpacing:-0.3, whiteSpace:'nowrap' }}>TheDashboard</span>}
        </div>
        {/* Shop name */}
        {!col && shop && (
          <div style={{ padding:'8px 12px', borderBottom:'1px solid #30363d' }}>
            <p style={{ fontSize:9, color:'#7d8590', letterSpacing:0.8, marginBottom:1 }}>SHOP</p>
            <p style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shop.name}</p>
          </div>
        )}
        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 6px', overflowY:'auto' }}>
          {nav.map(n => {
            const isActive = active(n.href)
            return (
              <Link key={n.href} href={n.href} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 8px', borderRadius:8, marginBottom:1, background:isActive?'#2196F315':'transparent', color:isActive?'#2196F3':'#7d8590', textDecoration:'none', fontSize:12, fontWeight:isActive?700:400, borderLeft:isActive?'2px solid #2196F3':'2px solid transparent', whiteSpace:'nowrap', transition:'all 0.1s' }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{n.icon}</span>
                {!col && n.label}
              </Link>
            )
          })}
        </nav>
        {/* Bottom */}
        <div style={{ padding:'8px 6px', borderTop:'1px solid #30363d' }}>
          <button onClick={() => setCol(p=>!p)} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px', borderRadius:8, background:'transparent', border:'none', color:'#484f58', cursor:'pointer', fontSize:12 }}>
            <span>{col?'→':'←'}</span>{!col&&'Collapse'}
          </button>
          <button onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/auth/login' }} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px', borderRadius:8, background:'transparent', border:'none', color:'#ff4d6d', cursor:'pointer', fontSize:12 }}>
            <span>🚪</span>{!col&&'Logout'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, overflow:'auto', minWidth:0 }}>
        {/* Topbar */}
        <div style={{ padding:'12px 24px', borderBottom:'1px solid #30363d', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(22,27,34,0.9)', backdropFilter:'blur(8px)', position:'sticky', top:0, zIndex:10 }}>
          <h1 style={{ fontSize:16, fontWeight:800, letterSpacing:-0.3 }}>{title}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {profile && <span style={{ fontSize:12, color:'#7d8590' }}>{profile.full_name}</span>}
            <div style={{ width:30, height:30, background:'#2196F320', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, border:'1px solid #2196F330', fontWeight:700, color:'#2196F3' }}>
              {profile?.full_name?.charAt(0)?.toUpperCase()||'A'}
            </div>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding:24 }}>{children}</div>
      </main>
    </div>
  )
}
