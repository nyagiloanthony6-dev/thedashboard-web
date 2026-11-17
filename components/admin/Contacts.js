import { useState } from 'react'
import { T } from '../../lib/store'
import { card, th, td, btnG, Kpi, StatusPill, dmy, mono, SearchBox } from './ui'
import { t } from './i18n'

// Shop owners' contacts, from what they gave at registration
const pkgLabel = (x) => x.pos && x.store ? 'POS + Store' : x.store ? 'Store' : 'POS'
const contactPhone = (x) => x.owner_phone || x.phone || ''
const intl = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '255' + d.slice(1) : d }
const pretty = (p) => { const d = intl(p); return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p }

function csv(rows) {
  const head = ['Mteja / Customer', 'Email', 'Simu / Phone', 'Duka / Shop', 'Mahali / Location', 'Kifurushi / Package', 'Hali / Status', 'Alijisajili / Signed up']
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const lines = [head, ...rows.map(x => [x.owner_name || '', x.owner_email || '', contactPhone(x) ? '+' + intl(contactPhone(x)) : '', x.name, x.address || '', pkgLabel(x), x.status, dmy(x.created_at)])]
  const blob = new Blob(['﻿' + lines.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `thedashboard-wateja-${new Date().toISOString().slice(0, 10)}.csv`
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const IconPhone = () => <svg {...svg}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
const IconChat = () => <svg {...svg}><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20.5l1.6-5.3A8.4 8.4 0 1 1 21 11.5z" /></svg>
const IconMail = () => <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>

export default function Contacts({ shops }) {
  const [q, setQ] = useState('')
  const [range, setRange] = useState('all')
  const since = range === '7' ? Date.now() - 7 * 86400000 : range === '30' ? Date.now() - 30 * 86400000 : 0
  const ql = q.toLowerCase()
  const list = shops
    .filter(x => !since || (x.created_at && new Date(x.created_at).getTime() >= since))
    .filter(x => !q || [x.owner_name, x.owner_email, x.name, x.address, contactPhone(x), intl(contactPhone(x))].some(v => (v || '').toLowerCase().includes(ql)))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Kpi l={t('Wateja')} v={list.length} />
        <Kpi l={t('Simu')} v={list.filter(x => contactPhone(x)).length} c="#0B7A6C" />
        <Kpi l="Email" v={list.filter(x => x.owner_email).length} c={T.green} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <div style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3 }}>
            {[['7', 'Wiki hii'], ['30', 'Siku 30'], ['all', 'Zote']].map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)} aria-pressed={range === v}
                style={{ border: 0, borderRadius: 999, padding: '7px 14px', fontSize: 13, whiteSpace: 'nowrap', fontWeight: range === v ? 700 : 500, cursor: 'pointer', background: range === v ? T.green : 'transparent', color: range === v ? '#fff' : T.ink }}>{t(l)}</button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder={t('Tafuta jina, duka, simu au email…')} />
        </div>
        <button onClick={() => csv(list)} disabled={!list.length} style={{ ...btnG, whiteSpace: 'nowrap', alignSelf: 'flex-start', opacity: list.length ? 1 : 0.5 }}>⬇ {t('Pakua CSV')}</button>
      </div>
      <div style={{ ...card, padding: 0 }} role="table" aria-label={t('Wateja')}>
        <div className="ct-row ct-head" role="row">
          <span role="columnheader">{t('Mteja')}</span><span role="columnheader">{t('Duka')}</span>
          <span role="columnheader">{t('Kifurushi')}</span><span role="columnheader">{t('Alijisajili')}</span><span />
        </div>
        {list.map(x => {
          const ph = contactPhone(x)
          const wa = `https://wa.me/${intl(ph)}?text=${encodeURIComponent(t('Habari {n}, karibu TheDashboard.', { n: (x.owner_name || '').split(' ')[0] }))}`
          return (
            <div key={x.id} className="ct-row" role="row">
              <div role="cell" style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{x.owner_name || '—'}</b>
                {ph && <div style={{ ...mono, fontSize: 13, marginTop: 2 }}>{pretty(ph)}</div>}
                {x.owner_email && <div className="ct-clip" style={{ fontSize: 12, color: T.muted }} title={x.owner_email}>{x.owner_email}</div>}
              </div>
              <div role="cell" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{x.name}</div>
                {x.address && <div style={{ fontSize: 12, color: T.muted }}>{x.address}</div>}
              </div>
              <div role="cell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <span style={{ fontSize: 13 }}>{pkgLabel(x)}{x.sub_plan && !['trial', 'POS', 'Store', 'POS + Store'].includes(x.sub_plan) ? ' · ' + x.sub_plan : ''}</span>
                <StatusPill s={x.status} />
              </div>
              <div role="cell" className="ct-date" style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>{dmy(x.created_at)}</div>
              <div role="cell" className="ct-actions">
                {ph && <a href={'tel:+' + intl(ph)} className="ct-btn" title={t('Piga') + ' ' + pretty(ph)} aria-label={t('Piga') + ' ' + (x.owner_name || '')}><IconPhone /></a>}
                {ph && <a href={wa} target="_blank" rel="noreferrer" className="ct-btn ct-wa" title="WhatsApp" aria-label={'WhatsApp ' + (x.owner_name || '')}><IconChat /></a>}
                {x.owner_email && <a href={'mailto:' + x.owner_email} className="ct-btn" title={x.owner_email} aria-label={'Email ' + (x.owner_name || '')}><IconMail /></a>}
              </div>
            </div>
          )
        })}
        {list.length === 0 && <p style={{ padding: 18, color: T.muted }}>{t('Hakuna mteja.')}</p>}
      </div>
      <style jsx>{`
        .ct-row { display: grid; grid-template-columns: minmax(180px, 1.5fr) minmax(160px, 1.4fr) minmax(110px, 0.9fr) 92px 126px; gap: 14px; align-items: start; padding: 14px 18px; border-top: 1px solid ${T.line}; }
        .ct-head { border-top: 0; padding-top: 12px; padding-bottom: 10px; font-size: 12px; font-weight: 600; color: ${T.muted}; }
        .ct-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ct-actions { display: flex; gap: 6px; justify-content: flex-end; }
        .ct-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid ${T.line}; display: inline-flex; align-items: center; justify-content: center; color: ${T.green}; background: #fff; }
        .ct-btn:hover { background: ${T.tint}; }
        .ct-wa { color: #0B7A6C; }
        @media (max-width: 900px) {
          .ct-head { display: none; }
          .ct-row { grid-template-columns: 1fr auto; gap: 8px 12px; }
          .ct-date { grid-column: 1; }
          .ct-actions { grid-column: 2; grid-row: 1; }
        }
      `}</style>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{t('Wateja wapya wanaojisajili mtandaoni wanaingia hapa wenyewe, pamoja na simu, email na mahali.')}</p>
    </div>
  )
}
