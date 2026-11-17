import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, Kpi, Msg, tzs, mono, th, td, StatusPill, DaysLeft, dmy } from './ui'

const MONTHS_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des']
const mLabel = (ym) => { const [y, m] = ym.split('-'); return MONTHS_SW[Number(m) - 1] + ' ' + y.slice(2) }

// Simple bar chart: one series, months on the x axis
function Bars({ data, valueKey, color, format = (v) => v }) {
  const max = Math.max(1, ...data.map(d => Number(d[valueKey]) || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, paddingTop: 18 }}>
      {data.map(d => {
        const v = Number(d[valueKey]) || 0
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}
            title={`${mLabel(d.month)}: ${format(v)}`}>
            <span style={{ fontSize: 10, color: T.muted, ...mono, whiteSpace: 'nowrap' }}>{v ? format(v) : ''}</span>
            <div style={{ width: '100%', maxWidth: 28, height: Math.max(2, (v / max) * 100), background: v ? color : T.line, borderRadius: '4px 4px 0 0' }} />
            <span style={{ fontSize: 10, color: T.muted, whiteSpace: 'nowrap' }}>{mLabel(d.month).split(' ')[0]}</span>
          </div>
        )
      })}
    </div>
  )
}
const kfmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(v)

export default function Analytics({ shops, go }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('platform_stats').then(({ data, error }) => { if (error) setErr(error.message); else setS(data) })
  }, [])
  const bs = s?.by_status || {}, bp = s?.by_package || {}
  const ending = shops.filter(x => ['trial', 'active'].includes(x.status) && x.sub_expires_at && (new Date(x.sub_expires_at) - Date.now()) < 7 * 86400000)
    .sort((a, b) => new Date(a.sub_expires_at) - new Date(b.sub_expires_at)).slice(0, 8)
  const quiet = shops.filter(x => x.status !== 'suspended').sort((a, b) => (a.sales_30d || 0) - (b.sales_30d || 0)).slice(0, 6)
  const top = [...shops].sort((a, b) => (b.revenue_30d || 0) - (a.revenue_30d || 0)).slice(0, 6)
  return (
    <div>
      <Msg err={err} />
      {!s && !err && <p style={{ color: T.muted }}>Inapakia…</p>}
      {s && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi l="Maduka yote" v={s.shops} sub={`${s.active_30d || 0} yameuza siku 30 zilizopita`} />
          <Kpi l="Yanatumika" v={bs.active || 0} c="#0B7A6C" />
          <Kpi l="Majaribio" v={bs.trial || 0} c="#9A5B00" />
          <Kpi l="Yameisha / yamesimamishwa" v={(bs.expired || 0) + (bs.suspended || 0)} c="#B93A16" />
          <Kpi l="Mapato mwezi huu" v={tzs(s.income_month)} c={T.green} sub={`Yanayotarajiwa kwa mwezi: ${tzs(s.expected_monthly)}`} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={card}>
            <p style={{ fontWeight: 700 }}>Mapato ya usajili (miezi 12)</p>
            <Bars data={s.income || []} valueKey="amount" color={T.green} format={kfmt} />
          </div>
          <div style={card}>
            <p style={{ fontWeight: 700 }}>Wateja wapya waliojisajili</p>
            <Bars data={s.signups || []} valueKey="n" color="#0F7375" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontWeight: 700 }}>Usajili unaoisha ndani ya siku 7 ({s.ending_7d || 0})</p>
              <button onClick={() => go('usajili')} style={{ border: 0, background: 'none', color: T.green, fontWeight: 700, cursor: 'pointer' }}>Ona zote →</button>
            </div>
            {ending.length === 0 ? <p style={{ color: T.muted, fontSize: 14, marginTop: 8 }}>Hakuna kwa sasa.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <tbody>{ending.map(x => (
                  <tr key={x.id}><td style={td}><b>{x.name}</b><div style={{ fontSize: 12, color: T.muted }}>{x.phone || ''}</div></td>
                    <td style={td}><StatusPill s={x.status} /></td><td style={{ ...td, textAlign: 'right' }}><DaysLeft date={x.sub_expires_at} status={x.status} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div style={card}>
            <p style={{ fontWeight: 700 }}>Vifurushi</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {[['pos', 'POS pekee', '#2D2F8F'], ['store', 'Store pekee', '#0F7375'], ['both', 'Zote mbili', '#9A5B00']].map(([k, l, c]) => (
                <div key={k} style={{ flex: 1, minWidth: 90, background: T.surface, borderRadius: 12, padding: 12 }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: c, ...mono }}>{bp[k] || 0}</p>
                  <p style={{ fontSize: 12, color: T.muted }}>{l}</p>
                </div>
              ))}
            </div>
            <p style={{ fontWeight: 700, marginTop: 16 }}>Yanayouza zaidi (siku 30)</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
              <tbody>{top.map(x => (
                <tr key={x.id}><td style={td}>{x.name}</td><td style={{ ...td, textAlign: 'right', ...mono }}>{x.sales_30d} mauzo</td><td style={{ ...td, textAlign: 'right', ...mono, fontWeight: 700 }}>{tzs(x.revenue_30d)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div style={card}>
            <p style={{ fontWeight: 700 }}>Hatari ya kuondoka (mauzo machache siku 30)</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
              <tbody>{quiet.map(x => (
                <tr key={x.id}><td style={td}><b>{x.name}</b><div style={{ fontSize: 12, color: T.muted }}>Mauzo ya mwisho: {x.last_sale_at ? dmy(x.last_sale_at) : 'hakuna'}</div></td>
                  <td style={{ ...td, textAlign: 'right', ...mono }}>{x.sales_30d || 0}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  )
}
