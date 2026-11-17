import { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { T, isPlatformAdmin } from '../../lib/store'
import { TDMark } from '../../components/store/Shell'
import Icon from '../../components/store/Icon'
import { card, Msg } from '../../components/admin/ui'
import Analytics from '../../components/admin/Analytics'
import Subscriptions from '../../components/admin/Subscriptions'
import Payments, { RecordPayment } from '../../components/admin/Payments'
import Packages from '../../components/admin/Packages'
import Features from '../../components/admin/Features'
import Notices from '../../components/admin/Notices'
import Settings from '../../components/admin/Settings'
import Contacts from '../../components/admin/Contacts'
import { t, loadLang, saveLang } from '../../components/admin/i18n'

// Serengeti Admin: one place for every TheDashboard shop.
// Sections are routed on the URL hash (#takwimu, #usajili …) so each can be bookmarked.
const SECTIONS = [
  ['takwimu', 'Takwimu', 'chart'],
  ['wateja', 'Wateja', 'users'],
  ['usajili', 'Usajili', 'calendar'],
  ['malipo', 'Malipo', 'wallet'],
  ['vifurushi', 'Vifurushi', 'layers'],
  ['vipengele', 'Vipengele', 'grid'],
  ['arifa', 'Arifa', 'bell'],
  ['mipangilio', 'Mipangilio', 'gear'],
]
const SUBTITLE = {
  takwimu: 'Muhtasari wa maduka, mapato na shughuli',
  wateja: 'Mawasiliano ya wateja waliojisajili',
  usajili: 'Hali ya usajili wa kila duka, kuongeza muda na kusimamisha',
  malipo: 'Malipo yaliyopokelewa (ankara zinabaki kwenye billing admin)',
  vifurushi: 'POS pekee · Store pekee · Zote mbili',
  vipengele: 'Tabs zinazoonekana kwa maduka yote au duka moja',
  arifa: 'Ujumbe kwa maduka kwenye web na app',
  mipangilio: 'Mipango na bei, majaribio, watumiaji wa admin',
}

export default function SerengetiAdmin() {
  const [allowed, setAllowed] = useState(null)
  const [section, setSection] = useState('takwimu')
  const [shops, setShops] = useState([])
  const [plans, setPlans] = useState([])
  const [err, setErr] = useState('')
  const [pay, setPay] = useState(null)   // shop to record a payment for
  const [ok, setOk] = useState('')
  const [lang, setLang] = useState('sw')
  useEffect(() => { setLang(loadLang()) }, [])
  const switchLang = (l) => { saveLang(l); setLang(l) }

  const loadShops = useCallback(async () => {
    const { data, error } = await supabase.rpc('platform_list_shops')
    if (error) setErr(error.message); else { setErr(''); setShops(data || []) }
  }, [])
  const loadPlans = useCallback(async () => {
    const { data } = await supabase.rpc('platform_list_plans')
    setPlans(data || [])
  }, [])
  useEffect(() => { isPlatformAdmin().then(v => { setAllowed(v); if (v) { loadShops(); loadPlans() } }) }, [])
  useEffect(() => {
    const read = () => { const h = window.location.hash.replace('#', ''); setSection(SECTIONS.some(s => s[0] === h) ? h : 'takwimu') }
    read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read)
  }, [])
  const go = (k) => { window.location.hash = k }

  if (allowed === null) return <Frame lang={lang} setLang={switchLang}><p style={{ color: T.muted, padding: 24 }}>{t('Inapakia…')}</p></Frame>
  if (!allowed) return (
    <Frame lang={lang} setLang={switchLang}><div style={{ ...card, margin: 24 }}><p style={{ fontWeight: 700, fontSize: 18 }}>{t('Huna ruhusa')}</p>
      <p style={{ color: T.muted, marginTop: 6 }}>{t('Ukurasa huu ni wa Serengeti Labs pekee.')}</p></div></Frame>
  )
  const title = t(SECTIONS.find(s => s[0] === section)[1])
  return (
    <Frame section={section} go={go} lang={lang} setLang={switchLang}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{title}</h1>
        <p style={{ color: T.muted, fontSize: 14 }}>{t(SUBTITLE[section])}</p>
      </div>
      <Msg err={err} ok={ok} />
      {section === 'takwimu' && <Analytics shops={shops} go={go} />}
      {section === 'wateja' && <Contacts shops={shops} />}
      {section === 'usajili' && <Subscriptions shops={shops} plans={plans} reload={loadShops} onPay={setPay} />}
      {section === 'malipo' && <Payments shops={shops} plans={plans} reload={loadShops} />}
      {section === 'vifurushi' && <Packages shops={shops} reload={loadShops} />}
      {section === 'vipengele' && <Features shops={shops} />}
      {section === 'arifa' && <Notices shops={shops} />}
      {section === 'mipangilio' && <Settings plans={plans} reloadPlans={loadPlans} />}
      {pay && <RecordPayment shop={pay} shops={shops} plans={plans} onClose={() => setPay(null)}
        onDone={(m) => { setPay(null); setOk(m); setTimeout(() => setOk(''), 5000); loadShops() }} />}
    </Frame>
  )
}

// Shop owners who are also admins go back to their shop; the admin-only account just logs out
function PageNav() {
  const [hasShop, setHasShop] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setHasShop(false)
      const { data: prof } = await supabase.from('app_users').select('shop_id').eq('id', user.id).maybeSingle()
      if (prof?.shop_id) return setHasShop(true)
      const { data: own } = await supabase.from('shop_owners').select('shop_id').eq('user_id', user.id).limit(1)
      setHasShop(!!own?.length)
    })
  }, [])
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      {hasShop && <Link href="/dashboard" style={{ fontSize: 14, color: T.green, fontWeight: 600 }}>{t('← Duka langu')}</Link>}
      <button onClick={logout} style={{ border: '1px solid ' + T.line, background: '#fff', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: T.ink, cursor: 'pointer' }}>{t('Toka')}</button>
    </div>
  )
}

function LangSwitch({ lang, setLang }) {
  return (
    <div role="group" aria-label={t('Lugha')} style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3 }}>
      {[['sw', 'SW'], ['en', 'EN']].map(([v, l]) => (
        <button key={v} onClick={() => setLang(v)} aria-pressed={lang === v} lang={v}
          style={{ border: 0, borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: lang === v ? T.green : 'transparent', color: lang === v ? '#fff' : T.ink }}>{l}</button>
      ))}
    </div>
  )
}

function Frame({ children, section, go, lang, setLang }) {
  return (
    <div lang={lang} style={{ minHeight: '100vh', background: T.surface, color: T.ink, fontFamily: 'Outfit, system-ui, sans-serif' }}>
      <Head><title>Serengeti Admin — TheDashboard</title></Head>
      <header style={{ background: '#fff', borderBottom: '1px solid ' + T.line, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <TDMark size={34} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 17 }}>Serengeti Admin</p>
          <p style={{ fontSize: 12, color: T.muted }}>{t('TheDashboard · maduka yote')}</p>
        </div>
        {setLang && <LangSwitch lang={lang} setLang={setLang} />}
        <PageNav />
      </header>
      <div className="sa-wrap">
        {go && (
          <nav aria-label={t('Sehemu za admin')} className="sa-nav">
            {SECTIONS.map(([k, l, icon]) => (
              <a key={k} href={'#' + k} aria-current={section === k ? 'page' : undefined} className={'sa-link' + (section === k ? ' on' : '')}>
                <span className="sa-ic"><Icon name={icon} size={18} /></span>{t(l)}
              </a>
            ))}
          </nav>
        )}
        <main className="sa-main">{children}</main>
      </div>
      <style jsx global>{`
        .sa-wrap { display: flex; max-width: 1280px; margin: 0 auto; }
        .sa-nav { width: 220px; flex: none; padding: 18px 12px; position: sticky; top: 59px; align-self: flex-start; }
        .sa-link { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; color: ${T.ink}; text-decoration: none; font-size: 15px; font-weight: 500; margin-bottom: 2px; }
        .sa-link:hover { background: ${T.tint}; }
        .sa-link.on { background: ${T.tint}; font-weight: 700; }
        .sa-ic { width: 30px; height: 30px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
        .sa-link.on .sa-ic { background: #F2A007; }
        .sa-main { flex: 1; min-width: 0; padding: 22px 20px 60px; }
        @media (max-width: 860px) {
          .sa-wrap { flex-direction: column; }
          .sa-nav { width: auto; position: static; display: flex; overflow-x: auto; gap: 4px; padding: 10px 12px; border-bottom: 1px solid ${T.line}; background: #fff; }
          .sa-link { white-space: nowrap; margin: 0; padding: 7px 10px; font-size: 14px; }
          .sa-ic { width: 24px; height: 24px; }
        }
      `}</style>
    </div>
  )
}
