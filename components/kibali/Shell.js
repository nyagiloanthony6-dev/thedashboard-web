import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '../Layout'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS } from '../../lib/kibali'

// Owners get the normal sidebar Layout. Shop clerks and storekeepers get a
// simple phone-friendly shell with big bottom tabs and no sidebar.
export default function Shell({ k, title, tabs = [], children }) {
  const router = useRouter()
  const owner = k.role === 'shop_admin' || k.role === 'super_admin'

  if (k.loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1117' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#2196F3', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!k.modules.kibali) return (
    <Frame owner={owner} k={k} title={title}>
      <div style={{ maxWidth: 520, margin: '40px auto', background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Kibali is not active for this shop</p>
        <p style={{ color: '#7d8590', fontSize: 13 }}>Kibali (shop-to-store release orders) is an add-on. Contact Serengeti Labs on +255 754 711 063 to switch it on.</p>
      </div>
    </Frame>
  )

  return (
    <Frame owner={owner} k={k} title={title}>
      {tabs.length > 0 && owner && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {tabs.map(t => <TabLink key={t.href} t={t} active={router.asPath === t.href} pill />)}
        </div>
      )}
      <div style={{ paddingBottom: owner ? 0 : 90 }}>{children}</div>
      {tabs.length > 0 && !owner && (
        <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', zIndex: 20 }}>
          {tabs.map(t => <TabLink key={t.href} t={t} active={router.asPath === t.href} />)}
        </nav>
      )}
    </Frame>
  )
}

function TabLink({ t, active, pill }) {
  if (pill) return (
    <Link href={t.href} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid', borderColor: active ? '#2196F3' : '#30363d', background: active ? 'rgba(33,150,243,0.15)' : 'transparent', color: active ? '#2196F3' : '#7d8590' }}>
      {t.label}{t.badge ? <span style={{ marginLeft: 6, background: '#ff4d6d', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>{t.badge}</span> : null}
    </Link>
  )
  return (
    <Link href={t.href} style={{ flex: 1, textAlign: 'center', padding: '12px 4px 16px', fontSize: 13, fontWeight: 700, color: active ? '#2196F3' : '#7d8590', borderTop: active ? '2px solid #2196F3' : '2px solid transparent' }}>
      <div style={{ fontSize: 20, marginBottom: 2 }}>{t.icon}</div>{t.label}
    </Link>
  )
}

function Frame({ owner, k, title, children }) {
  if (owner) return (
    <>
      <Head><title>{title} — TheDashboard</title></Head>
      <Layout title={title} shop={k.shop} profile={k.profile}>{children}</Layout>
    </>
  )
  return (
    <>
      <Head>
        <title>{title} — Kibali</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#0d1117' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(22,27,34,0.95)', borderBottom: '1px solid #30363d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800 }}>{title}</p>
            <p style={{ fontSize: 11, color: '#7d8590' }}>Kibali · {k.shop?.name} · {k.profile?.full_name} ({ROLE_LABELS[k.role] || k.role})</p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }}
            style={{ background: 'transparent', border: '1px solid #30363d', color: '#ff4d6d', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>Toka</button>
        </header>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>{children}</main>
      </div>
    </>
  )
}
