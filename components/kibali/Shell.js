import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS, T } from '../../lib/kibali'
import Icon from './Icon'

// Kibali layout in the Serengeti Labs look (light, warm, phone-first).
// - Owners: sidebar on desktop, bottom tabs + "Zaidi" sheet on phones
// - Shop clerks / storekeepers: header + big bottom tabs
export default function Shell({ k, title, tabs = [], children }) {
  const router = useRouter()
  const owner = k.role === 'shop_admin' || k.role === 'super_admin'

  if (k.loading) return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${T.line}`, borderTopColor: T.green, borderRadius: '50%', animation: 'kbspin 0.8s linear infinite' }} />
      </div>
    </Frame>
  )

  const inactive = !k.modules.kibali && (
    <div style={{ maxWidth: 520, margin: '48px auto', background: T.raised, border: `1px solid ${T.line}`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
      <p style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Kibali bado haijawashwa</p>
      <p style={{ color: T.muted }}>Kibali (oda za kutoa stoo) ni huduma ya ziada. Wasiliana na Serengeti Labs: +255 754 711 063.</p>
    </div>
  )

  const path = router.asPath
  const isOn = (href) => {
    const [p, q] = href.split('?')
    const [cp, cq] = path.split('?')
    return p === cp && (q || '') === (cq || '').split('&').filter(x => x.startsWith('tab=')).join('&')
  }

  if (owner) return <OwnerFrame k={k} title={title} tabs={tabs} isOn={isOn}>{inactive || children}</OwnerFrame>

  return (
    <Frame title={title}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: '14px 16px 12px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: T.display, fontSize: 24, lineHeight: '30px', fontWeight: 700 }}>{title}</p>
            <p style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Kibali · {k.shop?.name}</p>
          </div>
          <UserChip k={k} />
        </div>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 104px' }}>{inactive || children}</main>
      {tabs.length > 0 && !inactive && <BottomTabs tabs={tabs} isOn={isOn} />}
    </Frame>
  )
}

// ---------------------------------------------------------------------
function OwnerFrame({ k, title, tabs, isOn, children }) {
  const [more, setMore] = useState(false)
  const pos = k.modules.pos
  const main = [
    { href: '/kibali/owner', label: 'Nyumbani', icon: 'home' },
    { href: '/kibali/owner?tab=alerts', label: 'Tahadhari', icon: 'bell' },
    { href: '/kibali/owner?tab=orders', label: 'Oda', icon: 'list' },
    { href: '/kibali/owner?tab=stock', label: 'Stoo', icon: 'box' },
  ]
  const work = [
    { href: '/kibali/shop', label: 'Oda mpya (duka)', icon: 'plus' },
    { href: '/kibali/store', label: 'Skrini ya stoo', icon: 'scan' },
  ]
  const admin = [
    { href: '/stock', label: 'Bidhaa', icon: 'tag' },
    { href: '/team', label: 'Wafanyakazi', icon: 'users' },
    { href: '/settings', label: 'Mipangilio', icon: 'gear' },
    ...(pos ? [{ href: '/dashboard', label: 'TheDashboard POS', icon: 'back' }] : []),
  ]
  const onShopOrStore = /^\/kibali\/(shop|store)/.test(useRouter().pathname)

  return (
    <Frame title={title}>
      <div className="kb-owner">
        <aside className="kb-side">
          <div style={{ padding: '20px 18px 16px', borderBottom: `1px solid ${T.line}` }}>
            <Brand />
            <p style={{ fontSize: 13, color: T.muted, marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.shop?.name}</p>
          </div>
          <nav style={{ padding: 10, display: 'grid', gap: 2 }}>
            {main.map(n => <SideLink key={n.href} n={n} on={isOn(n.href)} />)}
            <p style={sideHead}>KAZI</p>
            {work.map(n => <SideLink key={n.href} n={n} on={isOn(n.href.split('?')[0]) || (n.href === '/kibali/shop' && onShopOrStore && isOn('/kibali/shop?tab=orders'))} />)}
            <p style={sideHead}>USIMAMIZI</p>
            {admin.map(n => <SideLink key={n.href} n={n} on={false} />)}
          </nav>
          <div style={{ marginTop: 'auto', padding: 14, borderTop: `1px solid ${T.line}` }}><UserChip k={k} wide /></div>
        </aside>

        <div className="kb-main">
          <header className="kb-top">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: T.display, fontSize: 24, lineHeight: '30px', fontWeight: 700 }}>{title}</p>
              <p className="kb-top-shop" style={{ fontSize: 13, color: T.muted }}>Kibali · {k.shop?.name}</p>
            </div>
            <div className="kb-top-user"><UserChip k={k} /></div>
          </header>
          <main style={{ padding: '4px 20px 110px', maxWidth: 1180 }}>
            {onShopOrStore && tabs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                  <Link key={t.href} href={t.href} style={{ ...chip, ...(isOn(t.href) ? chipOn : {}) }}>
                    <Icon name={t.icon} size={16} />{t.label}
                  </Link>
                ))}
              </div>
            )}
            {children}
          </main>
        </div>

        <div className="kb-mobile-tabs">
          <BottomTabs tabs={[...main.map(n => n.label === 'Tahadhari' ? { ...n, badge: tabs.find(t => t.badge)?.badge } : n), { href: '#more', label: 'Zaidi', icon: 'more', onClick: () => setMore(true) }]} isOn={isOn} />
        </div>
        {more && (
          <div onClick={e => e.target === e.currentTarget && setMore(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(27,33,29,0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ background: T.surface, width: '100%', borderRadius: '16px 16px 0 0', padding: '18px 16px 28px', display: 'grid', gap: 4 }}>
              <p style={{ ...sideHead, margin: '0 0 6px' }}>KAZI</p>
              {work.map(n => <SideLink key={n.href} n={n} on={false} onClick={() => setMore(false)} />)}
              <p style={{ ...sideHead, margin: '12px 0 6px' }}>USIMAMIZI</p>
              {admin.map(n => <SideLink key={n.href} n={n} on={false} onClick={() => setMore(false)} />)}
              <button onClick={signOut} style={{ ...sideLink, color: T.danger, border: 'none', background: 'none', width: '100%', textAlign: 'left' }}><Icon name="logout" size={20} />Toka</button>
            </div>
          </div>
        )}
      </div>
    </Frame>
  )
}

// ---------------------------------------------------------------------
function Frame({ title, children }) {
  return (
    <>
      <Head>
        <title>{title ? title + ' — Kibali' : 'Kibali'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={T.surface} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Geist:wght@500;800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        body { background: ${T.surface} !important; color: ${T.ink} !important; font-family: ${T.sans}; font-size: 16px; }
        .kb, .kb * { box-sizing: border-box; }
        .kb { min-height: 100vh; background: ${T.surface}; color: ${T.ink}; font-family: ${T.sans}; }
        .kb a { color: ${T.green}; }
        .kb input, .kb select, .kb textarea {
          background: ${T.raised} !important; color: ${T.ink} !important; border: 1px solid ${T.lineStrong} !important;
          border-radius: 8px; padding: 11px 12px; font-size: 16px; font-family: ${T.sans}; width: 100%; outline: none;
        }
        .kb input:focus, .kb select:focus, .kb textarea:focus { border-color: ${T.green} !important; box-shadow: 0 0 0 3px rgba(31,77,58,0.15); }
        .kb input::placeholder, .kb textarea::placeholder { color: #8c8273; }
        .kb input:disabled { opacity: 0.6; }
        .kb label { display: block; font-size: 13px; font-weight: 600; color: ${T.muted}; margin: 0 0 6px; letter-spacing: 0; text-transform: none; }
        .kb button { font-family: ${T.sans}; cursor: pointer; }
        .kb button:disabled { opacity: 0.55; cursor: not-allowed; }
        .kb button:focus-visible, .kb a:focus-visible { outline: 2px solid ${T.green}; outline-offset: 2px; }
        .kb table { border-collapse: collapse; }
        .kb-card-btn:hover { border-color: ${T.lineStrong} !important; }
        .kb-row:hover td { background: ${T.tint}; }
        @keyframes kbspin { to { transform: rotate(360deg) } }
        .kb-owner { display: flex; min-height: 100vh; }
        .kb-side { width: 248px; flex-shrink: 0; background: ${T.raised}; border-right: 1px solid ${T.line}; position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
        .kb-main { flex: 1; min-width: 0; }
        .kb-top { position: sticky; top: 0; z-index: 10; background: ${T.surface}; padding: 18px 20px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .kb-top-user { display: none; }
        .kb-mobile-tabs { display: none; }
        @media (max-width: 860px) {
          .kb-side { display: none; }
          .kb-top-user { display: block; }
          .kb-mobile-tabs { display: block; }
          .kb-top { padding: 14px 16px 12px; border-bottom: 1px solid ${T.line}; }
          .kb-main main { padding: 16px 16px 110px !important; }
        }
        @media print { .kb-side, .kb-top, .kb-mobile-tabs, nav { display: none !important; } }
      `}</style>
      <div className="kb">{children}</div>
    </>
  )
}

// Serengeti Labs logo: "s/" mark + serengeti/labs wordmark (Geist), as on serengetilabs site
export function SLMark({ size = 34 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: '#2D2F8F', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 800, fontSize: Math.round(size * 0.55), letterSpacing: '-0.05em', lineHeight: 1 }}>
      s<b style={{ color: '#F2A007', fontWeight: 500 }}>/</b>
    </span>
  )
}

export function SLWordmark({ size = 13 }) {
  return (
    <span style={{ fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, whiteSpace: 'nowrap', color: '#15183A', fontSize: size }}>
      serengeti<b style={{ color: '#E4572E', fontWeight: 500 }}>/</b><em style={{ fontStyle: 'normal', color: '#2D2F8F', fontWeight: 500 }}>labs</em>
    </span>
  )
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} aria-label="Kibali by Serengeti Labs">
      <SLMark size={36} />
      <div>
        <p style={{ fontFamily: T.display, fontSize: 21, fontWeight: 700, lineHeight: '22px' }}>Kibali</p>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>by <SLWordmark size={12} /></p>
      </div>
    </div>
  )
}

function SideLink({ n, on, onClick }) {
  return (
    <Link href={n.href} onClick={onClick} style={{ ...sideLink, ...(on ? { background: T.tint, color: T.ink, fontWeight: 700 } : {}) }}>
      <span style={{ width: 34, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? T.gold : 'transparent', color: T.ink }}>
        <Icon name={n.icon} size={19} />
      </span>
      {n.label}
    </Link>
  )
}

function BottomTabs({ tabs, isOn }) {
  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: T.raised, borderTop: `1px solid ${T.line}`, zIndex: 20, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ display: 'flex', maxWidth: 640, margin: '0 auto' }}>
      {tabs.map(t => {
        const on = !t.onClick && isOn(t.href)
        const body = (
          <>
            <span style={{ position: 'relative', width: 56, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? T.gold : 'transparent', color: T.ink }}>
              <Icon name={t.icon} size={22} />
              {t.badge ? <span style={{ position: 'absolute', top: -4, right: 6, minWidth: 18, height: 18, borderRadius: 999, background: T.danger, color: T.raised, fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center', padding: '0 4px' }}>{t.badge}</span> : null}
            </span>
            {t.label}
          </>
        )
        const st = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0 14px', fontSize: 12, fontWeight: 600, color: on ? T.ink : T.muted, textDecoration: 'none', background: 'none', border: 'none' }
        return t.onClick
          ? <button key={t.href} onClick={t.onClick} style={st}>{body}</button>
          : <Link key={t.href} href={t.href} style={st}>{body}</Link>
      })}
      </div>
    </nav>
  )
}

function UserChip({ k, wide }) {
  const name = k.profile?.full_name || 'Mtumiaji'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: wide ? 'space-between' : 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: T.green, color: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{name.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, display: wide ? 'block' : 'none' }} className="kb-user-text">
          <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
          <p style={{ fontSize: 12, color: T.muted }}>{ROLE_LABELS[k.role] || k.role}</p>
        </div>
      </div>
      <button onClick={signOut} aria-label="Toka" title="Toka" style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${T.line}`, background: T.raised, color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="logout" size={18} />
      </button>
    </div>
  )
}

async function signOut() { await supabase.auth.signOut(); window.location.href = '/auth/login' }

const sideHead = { fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.6, margin: '14px 10px 4px' }
const sideLink = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, color: T.ink, textDecoration: 'none', fontSize: 15, fontWeight: 500 }
const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 999, border: `1px solid ${T.line}`, background: T.raised, color: T.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none' }
const chipOn = { background: T.green, borderColor: T.green, color: T.surface }
