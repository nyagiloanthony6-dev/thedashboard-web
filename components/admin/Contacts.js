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

const linkBtn = { ...btnG, padding: '6px 11px', fontSize: 12, textDecoration: 'none', display: 'inline-block' }

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
                style={{ border: 0, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: range === v ? 700 : 500, cursor: 'pointer', background: range === v ? T.green : 'transparent', color: range === v ? '#fff' : T.ink }}>{t(l)}</button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder={t('Tafuta jina, duka, simu au email…')} />
        </div>
        <button onClick={() => csv(list)} disabled={!list.length} style={{ ...btnG, opacity: list.length ? 1 : 0.5 }}>⬇ {t('Pakua CSV')}</button>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t('Mteja')}</th><th style={th}>{t('Simu')}</th><th style={th}>{t('Duka')}</th><th style={th}>{t('Kifurushi')}</th><th style={th}>{t('Hali')}</th><th style={th}>{t('Alijisajili')}</th><th style={th} /></tr></thead>
          <tbody>
            {list.map(x => {
              const ph = contactPhone(x)
              const wa = `https://wa.me/${intl(ph)}?text=${encodeURIComponent(t('Habari {n}, karibu TheDashboard.', { n: (x.owner_name || '').split(' ')[0] }))}`
              return (
                <tr key={x.id}>
                  <td style={td}><b>{x.owner_name || '—'}</b><div style={{ fontSize: 12, color: T.muted }}>{x.owner_email || ''}</div></td>
                  <td style={{ ...td, ...mono, fontSize: 13, whiteSpace: 'nowrap' }}>{ph ? pretty(ph) : '—'}</td>
                  <td style={td}>{x.name}<div style={{ fontSize: 12, color: T.muted }}>{x.address || ''}</div></td>
                  <td style={td}>{pkgLabel(x)}</td>
                  <td style={td}><StatusPill s={x.status} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{dmy(x.created_at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {ph && <a href={'tel:+' + intl(ph)} style={linkBtn}>{t('Piga')}</a>}{' '}
                    {ph && <a href={wa} target="_blank" rel="noreferrer" style={{ ...linkBtn, color: '#0B7A6C' }}>WhatsApp</a>}{' '}
                    {x.owner_email && <a href={'mailto:' + x.owner_email} style={linkBtn}>Email</a>}
                  </td>
                </tr>
              )
            })}
            {list.length === 0 && <tr><td style={{ ...td, color: T.muted }} colSpan={7}>{t('Hakuna mteja.')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{t('Wateja wapya wanaojisajili mtandaoni wanaingia hapa wenyewe, pamoja na simu, email na mahali.')}</p>
    </div>
  )
}
