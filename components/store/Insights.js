import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T, KIND, shopMode, usePartNumbers } from '../../lib/store'

// Owner insights: orders processed, packages released and by item, for a period.
// Built from release_orders and the store movement log (OUT = released from the store, SALE = sold at POS).
const PERIODS = [['today', 'Leo'], ['week', 'Wiki hii'], ['month', 'Mwezi huu']]
export function periodStart(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  if (p === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))   // Monday
  if (p === 'month') d.setDate(1)
  return d.toISOString()
}

export default function Insights({ shopId }) {
  const parts = usePartNumbers(shopId)
  const [period, setPeriod] = useState('today')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setData(null); setErr('')
    const start = periodStart(period)
    Promise.all([
      supabase.from('release_orders').select('id,status,created_at,updated_at').gte('created_at', start).limit(5000),
      supabase.from('release_orders').select('id', { count: 'exact', head: true }).eq('status', 'RELEASED').gte('updated_at', start),
      supabase.from('release_orders').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'PARTIAL']),
      supabase.from('store_movements').select('product_id,product_name,unit,kind,qty,type,order_id').in('type', ['OUT', 'SALE']).gte('created_at', start).limit(10000),
    ]).then(([o, done, open, mv]) => {
      if (!alive) return
      const e = o.error || mv.error
      if (e) { setErr(e.message); return }
      const moves = mv.data || []
      const out = moves.filter(m => m.type === 'OUT')
      const items = {}
      for (const m of moves) {
        const key = m.product_name + '|' + (m.kind || 'retail')
        const it = items[key] || (items[key] = { pid: m.product_id, name: m.product_name, kind: m.kind || 'retail', unit: m.unit, out: 0, sale: 0, orders: new Set() })
        if (m.type === 'OUT') { it.out += -m.qty; if (m.order_id) it.orders.add(m.order_id) } else it.sale += -m.qty
      }
      const byKind = { retail: 0, wholesale: 0 }
      out.forEach(m => { byKind[m.kind || 'retail'] += -m.qty })
      setData({
        created: (o.data || []).length,
        completed: done.count || 0,
        open: open.count || 0,
        served: new Set(out.map(m => m.order_id).filter(Boolean)).size,
        byKind,
        items: Object.values(items).sort((a, b) => (b.out + b.sale) - (a.out + a.sale)),
        anySale: moves.some(m => m.type === 'SALE'),
      })
    })
    return () => { alive = false }
  }, [period])

  const mode = shopMode()
  const qtyText = (n, kind) => `${n} ${kind === 'wholesale' ? 'boksi' : 'pc'}`
  const released = data ? (mode === 'both'
    ? [['retail', data.byKind.retail], ['wholesale', data.byKind.wholesale]].filter(([, n]) => n).map(([k, n]) => qtyText(n, k)).join(' · ') || '0'
    : qtyText(data.byKind[mode] || 0, mode)) : ''
  const max = data?.items.length ? Math.max(...data.items.map(i => i.out + i.sale)) : 1

  return (
    <section style={{ background: '#fff', border: '1px solid ' + T.line, borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 17 }}>Muhtasari wa store</p>
        <div role="tablist" style={{ display: 'flex', background: T.tint, borderRadius: 999, padding: 3 }}>
          {PERIODS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={period === v} onClick={() => setPeriod(v)}
              style={{ border: 0, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: period === v ? 700 : 500, cursor: 'pointer',
                background: period === v ? T.green : 'transparent', color: period === v ? '#fff' : T.ink }}>{l}</button>
          ))}
        </div>
      </div>
      {err && <p style={{ color: T.danger }}>{err}</p>}
      {!data && !err && <p style={{ color: T.muted }}>Inapakia…</p>}
      {data && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
          <Kpi l="Oda zilizotengenezwa" v={data.created} />
          <Kpi l="Oda zilizohudumiwa na store" v={data.served} c={T.info} />
          <Kpi l="Oda zilizokamilika" v={data.completed} c={T.success} />
          <Kpi l="Zinasubiri sasa" v={data.open} c={data.open ? T.warning : T.ink} />
          <Kpi l="Mzigo uliotoka store" v={released} c={T.green} small />
        </div>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Kwa bidhaa</p>
        {data.items.length === 0 ? <p style={{ color: T.muted, fontSize: 14 }}>Hakuna mzigo uliotoka kipindi hiki.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ color: T.muted, textAlign: 'left' }}>
                <th style={th}>Bidhaa</th><th style={{ ...th, textAlign: 'right' }}>Imetoka store</th>
                <th style={{ ...th, textAlign: 'right' }}>Oda</th>{data.anySale && <th style={{ ...th, textAlign: 'right' }}>Imeuzwa POS</th>}<th style={{ ...th, width: '28%' }} />
              </tr></thead>
              <tbody>
                {data.items.slice(0, 15).map(i => (
                  <tr key={i.name + i.kind} style={{ borderTop: '1px solid ' + T.line }}>
                    <td style={td}>{i.name}{mode === 'both' && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: KIND[i.kind].c }}>{KIND[i.kind].sw}</span>}{parts[String(i.pid)] && <span style={{ display: 'block', fontSize: 11, color: T.muted, fontFamily: 'JetBrains Mono, monospace' }}>P/N {parts[String(i.pid)]}</span>}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{qtyText(i.out, i.kind)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{i.orders.size}</td>
                    {data.anySale && <td style={{ ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{i.sale || '—'}</td>}
                    <td style={td}><div style={{ height: 8, borderRadius: 4, background: T.tint }}>
                      <div style={{ width: Math.max(4, ((i.out + i.sale) / max) * 100) + '%', height: 8, borderRadius: 4, background: KIND[i.kind].c }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </section>
  )
}

function Kpi({ l, v, c, small }) {
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ fontSize: small ? 18 : 26, fontWeight: 700, color: c || T.ink, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2 }}>{v}</p>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{l}</p>
    </div>
  )
}
const th = { padding: '6px 8px', fontWeight: 600, fontSize: 12 }
const td = { padding: '9px 8px' }
