import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS, T } from '../../lib/store'
import Icon from './Icon'

// Store layout in the Serengeti Labs look (light, warm, phone-first).
// - Owners: sidebar on desktop, bottom tabs + "Zaidi" sheet on phones
// - Shop clerks / storekeepers: header + big bottom tabs
export default function Shell({ k, title, tabs = [], children }) {
  const router = useRouter()
  useMenuLang()
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
      <p style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>TheDashboard Store bado haijawashwa</p>
      <p style={{ color: T.muted }}>TheDashboard Store (oda za kutoa store na stock yako) ni huduma ya ziada. Wasiliana na Serengeti Labs: +255 754 711 063.</p>
    </div>
  )

  const isOn = makeIsOn(router.asPath)

  if (owner) return <OwnerFrame k={k} title={title} tabs={tabs} isOn={isOn}>{inactive || children}</OwnerFrame>

  return (
    <Frame title={title}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: '14px 16px 12px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: T.display, fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.01em' }}>{tr(title)}</p>
            <p style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Store · {k.shop?.name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><LangSwitch /><UserChip k={k} /></div>
        </div>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 104px' }}>{inactive || children}</main>
      {tabs.length > 0 && !inactive && <BottomTabs tabs={tabs} isOn={isOn} />}
    </Frame>
  )
}

const makeIsOn = (path) => (href) => {
  const [p, q] = href.split('?')
  const [cp, cq] = path.split('?')
  return p === cp && (q || '') === (cq || '').split('&').filter(x => x.startsWith('tab=')).join('&')
}

// Store-only shops: the shared pages (Bidhaa, Wafanyakazi, Mipangilio) render inside
// the same Store frame so owners never see the POS layout.
export function StoreFrame({ k, title, children }) {
  const router = useRouter()
  return <OwnerFrame k={k} title={title} tabs={[]} isOn={makeIsOn(router.asPath)}>{children}</OwnerFrame>
}

// ---------------------------------------------------------------------
// Menu language (SW | EN): sidebar, tabs and page titles only. Saved per device.
const MENU_EN = {
  'Nyumbani': 'Home', 'Tahadhari': 'Alerts', 'Oda': 'Orders', 'Stock': 'Stock',
  'Pokea mzigo': 'Receive stock', 'Oda mpya (duka)': 'New order (shop)', 'Toa mzigo (skani)': 'Release (scan)',
  'Bidhaa': 'Products', 'Wafanyakazi': 'Team', 'Mipangilio': 'Settings',
  'KAZI': 'WORK', 'USIMAMIZI': 'MANAGE', 'Zaidi': 'More', 'Toka': 'Log out',
  'Oda mpya': 'New order', 'Oda za leo': "Today's orders", 'Oda zote': 'All orders',
  'Skani': 'Scan', 'Skani risiti': 'Scan slip', 'Zinasubiri': 'Waiting', 'Pokea': 'Receive',
  'Habari, bosi': 'Welcome, boss', 'Mtumiaji': 'User', 'Sales Rep': 'Sales rep',
}
const MENU_SW = { Owner: 'Mmiliki', Cashier: 'Keshia', 'Sales Rep': 'Muuzaji', 'Shop clerk': 'Karani wa duka', Storekeeper: 'Mtunza store' }
let LANG = 'sw'
const tr = (w) => !w ? w : LANG === 'en' ? (MENU_EN[w] || w) : (MENU_SW[w] || w)
function useMenuLang() {
  const [lang, setLang] = useState(LANG)
  useEffect(() => {
    try { LANG = localStorage.getItem('td-store-lang') === 'en' ? 'en' : 'sw' } catch {}
    setLang(LANG)
    const on = () => setLang(LANG)
    window.addEventListener('td-store-lang', on)
    return () => window.removeEventListener('td-store-lang', on)
  }, [])
  return lang
}
function setMenuLang(l) {
  LANG = l
  try { localStorage.setItem('td-store-lang', l) } catch {}
  window.dispatchEvent(new Event('td-store-lang'))
}
function LangSwitch() {
  const lang = useMenuLang()
  return (
    <div role="group" aria-label="Lugha / Language" style={{ display: 'inline-flex', width: 'fit-content', background: T.tint, borderRadius: 999, padding: 3, gap: 2 }}>
      {[['sw', 'SW'], ['en', 'EN']].map(([v, l]) => (
        <button key={v} onClick={() => setMenuLang(v)} aria-pressed={lang === v}
          style={{ border: 0, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            background: lang === v ? T.green : 'transparent', color: lang === v ? '#fff' : T.muted }}>{l}</button>
      ))}
    </div>
  )
}

function OwnerFrame({ k, title, tabs, isOn, children }) {
  const [more, setMore] = useState(false)
  useMenuLang()
  const pos = k.modules.pos
  const main = [
    { href: '/store/owner', label: 'Nyumbani', icon: 'home' },
    { href: '/store/owner?tab=alerts', label: 'Tahadhari', icon: 'bell' },
    { href: '/store/owner?tab=orders', label: 'Oda', icon: 'list' },
    { href: '/store/owner?tab=stock', label: 'Stock', icon: 'box' },
  ]
  const work = [
    { href: '/store/release?tab=receive', label: 'Pokea mzigo', icon: 'down' },
    { href: '/store/shop', label: 'Oda mpya (duka)', icon: 'plus' },
    { href: '/store/release', label: 'Toa mzigo (skani)', icon: 'scan' },
  ]
  const admin = [
    { href: '/stock', label: 'Bidhaa', icon: 'tag' },
    { href: '/team', label: 'Wafanyakazi', icon: 'users' },
    { href: '/settings', label: 'Mipangilio', icon: 'gear' },
    ...(pos ? [{ href: '/dashboard', label: 'TheDashboard POS', icon: 'back' }] : []),
  ]
  const onShopOrStore = /^\/store\/(shop|store)/.test(useRouter().pathname)

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
            <p style={sideHead}>{tr('KAZI')}</p>
            {work.map(n => <SideLink key={n.href} n={n} on={isOn(n.href) || (n.href === '/store/shop' && isOn('/store/shop?tab=orders')) || (n.href === '/store/release' && isOn('/store/release?tab=waiting'))} />)}
            <p style={sideHead}>{tr('USIMAMIZI')}</p>
            {admin.map(n => <SideLink key={n.href} n={n} on={isOn(n.href)} />)}
          </nav>
          <div style={{ marginTop: 'auto', padding: 14, borderTop: `1px solid ${T.line}`, display: 'grid', gap: 12 }}><LangSwitch /><UserChip k={k} wide /></div>
        </aside>

        <div className="kb-main">
          <header className="kb-top">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: T.display, fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.01em' }}>{tr(title)}</p>
              <p className="kb-top-shop" style={{ fontSize: 13, color: T.muted }}>Store · {k.shop?.name}</p>
            </div>
            <div className="kb-top-user"><UserChip k={k} /></div>
          </header>
          <main style={{ padding: '4px 20px 110px', maxWidth: 1180 }}>
            {onShopOrStore && tabs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                  <Link key={t.href} href={t.href} style={{ ...chip, ...(isOn(t.href) ? chipOn : {}) }}>
                    <Icon name={t.icon} size={16} />{tr(t.label)}
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
          <div onClick={e => e.target === e.currentTarget && setMore(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ background: T.surface, width: '100%', borderRadius: '16px 16px 0 0', padding: '18px 16px 28px', display: 'grid', gap: 4 }}>
              <div style={{ marginBottom: 6 }}><LangSwitch /></div>
              <p style={{ ...sideHead, margin: '0 0 6px' }}>{tr('KAZI')}</p>
              {work.map(n => <SideLink key={n.href} n={n} on={false} onClick={() => setMore(false)} />)}
              <p style={{ ...sideHead, margin: '12px 0 6px' }}>{tr('USIMAMIZI')}</p>
              {admin.map(n => <SideLink key={n.href} n={n} on={isOn(n.href)} onClick={() => setMore(false)} />)}
              <button onClick={signOut} style={{ ...sideLink, color: T.danger, border: 'none', background: 'none', width: '100%', textAlign: 'left' }}><Icon name="logout" size={20} />{tr('Toka')}</button>
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
        <title>{title ? tr(title) + ' — TheDashboard Store' : 'TheDashboard Store'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={T.surface} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@500;800&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
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
        .kb input:focus, .kb select:focus, .kb textarea:focus { border-color: ${T.green} !important; box-shadow: 0 0 0 3px rgba(45,47,143,0.18); }
        .kb input::placeholder, .kb textarea::placeholder { color: #8A8FAE; }
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
// TheDashboard logo: rising bars with a saffron trend line on the indigo tile (same as the app)
export function TDMark({ size = 34 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: '#2D2F8F', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} viewBox="0 0 100 100">
        <rect x="14" y="58" width="17" height="22" rx="3" fill="#fff" opacity=".55" />
        <rect x="38" y="44" width="17" height="36" rx="3" fill="#fff" opacity=".8" />
        <rect x="62" y="28" width="17" height="52" rx="3" fill="#fff" />
        <path d="M22.5 52 L46.5 38 L70.5 22 L80 16" stroke="#F2A007" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="80" cy="16" r="8" fill="#F2A007" /><circle cx="80" cy="16" r="3.5" fill="#2D2F8F" />
        <rect x="10" y="84" width="74" height="3.5" rx="1.75" fill="#fff" opacity=".7" />
      </svg>
    </span>
  )
}

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} aria-label="TheDashboard Store by Serengeti Labs">
      <TDMark size={38} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, lineHeight: '16px', letterSpacing: '-0.01em' }}>TheDashboard</p>
        <p style={{ fontFamily: T.display, fontSize: 19, fontWeight: 700, lineHeight: '22px', color: T.green, letterSpacing: '-0.01em' }}>Store</p>
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
      {tr(n.label)}
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
            {tr(t.label)}
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
  const name = k.profile?.full_name || tr('Mtumiaji')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: wide ? 'space-between' : 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: T.green, color: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{name.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, display: wide ? 'block' : 'none' }} className="kb-user-text">
          <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
          <p style={{ fontSize: 12, color: T.muted }}>{tr(ROLE_LABELS[k.role]) || k.role}</p>
        </div>
      </div>
      <button onClick={signOut} aria-label={tr('Toka')} title={tr('Toka')} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${T.line}`, background: T.raised, color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
