import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, STATUS, fmtTime, ui } from '../../lib/kibali'
import Receipt from './Receipt'

// Order details: receipt (with release code for people allowed to see it),
// full release history, cancel (shop) and clear-flag (owner).
export default function OrderModal({ k, orderId, onClose, onChanged, autoPrint }) {
  const [d, setD] = useState(null)
  const [reason, setReason] = useState('')
  const [askCancel, setAskCancel] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [o, it, rel, sec] = await Promise.all([
      supabase.from('release_orders').select('*').eq('id', orderId).single(),
      supabase.from('release_order_items').select('*').eq('order_id', orderId).order('line_no'),
      supabase.from('release_order_releases').select('*').eq('order_id', orderId).order('created_at'),
      supabase.from('release_order_secrets').select('code').eq('order_id', orderId).maybeSingle(),
    ])
    setD({ order: o.data, items: it.data || [], releases: rel.data || [], code: sec.data?.code || null })
  }
  useEffect(() => { load() }, [orderId])
  useEffect(() => {
    if (autoPrint && d?.order) { const t = setTimeout(() => { try { window.print() } catch (e) {} }, 700); return () => clearTimeout(t) }
  }, [autoPrint, !!d?.order])

  const act = async (fn) => {
    setErr(''); setBusy(true)
    try { await fn(); await load(); onChanged && onChanged() } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const o = d?.order
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ ...ui.card, maxWidth: 760, margin: '0 auto', position: 'relative' }}>
        <button onClick={onClose} aria-label="Funga" style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 'none', color: '#7d8590', fontSize: 26 }}>×</button>
        {!o ? <p style={ui.muted}>Inapakia…</p> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4, paddingRight: 30 }}>
              <span style={{ ...ui.mono, fontSize: 22, fontWeight: 800 }}>{o.order_no}</span>
              <span style={ui.pill(o.status)}>{STATUS[o.status].label}</span>
              {o.flagged && <span style={{ ...ui.pill('CANCELLED'), color: '#ff4d6d', background: 'rgba(255,77,109,0.12)' }}>FLAGGED — karatasi haifanani</span>}
            </div>
            {d.code && <p style={{ ...ui.muted, marginBottom: 14 }}>Namba ya siri <b style={{ ...ui.mono, color: '#e6edf3', fontSize: 15, letterSpacing: 2 }}>{d.code}</b> — mpe mchukuaji pamoja na risiti</p>}

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {d.code ? <Receipt order={o} items={d.items} code={d.code} shopName={k.shop?.name} /> : null}
              <div style={{ flex: 1, minWidth: 240, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {d.code && <button onClick={() => window.print()} style={ui.primary}>🖨 Chapisha</button>}
                  {k.can('order.cancel') && o.status === 'PENDING' && !askCancel && <button onClick={() => setAskCancel(true)} style={ui.danger}>Sitisha oda</button>}
                  {k.can('kibali.audit') && o.flagged && <button disabled={busy} onClick={() => act(() => rpc('kibali_clear_flag', { p_order_id: o.id }))} style={ui.btn}>Ondoa flag (nimethibitisha na duka)</button>}
                </div>
                {askCancel && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Sababu ya kusitisha" autoFocus />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy || !reason.trim()} onClick={() => act(async () => { await rpc('kibali_cancel_order', { p_order_id: o.id, p_reason: reason }); setAskCancel(false) })} style={ui.danger}>Thibitisha kusitisha</button>
                      <button onClick={() => setAskCancel(false)} style={ui.btn}>Acha</button>
                    </div>
                  </div>
                )}
                {err && <div style={ui.banner('#ff4d6d')}>{err}</div>}

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: '#7d8590', textAlign: 'left' }}><th style={th}>Bidhaa</th><th style={thr}>Oda</th><th style={thr}>Imetoka</th><th style={thr}>Imebaki</th></tr></thead>
                  <tbody>{d.items.map(i => (
                    <tr key={i.id} style={{ borderTop: '1px solid #30363d' }}>
                      <td style={td}>{i.product_name}</td>
                      <td style={tdr}>{i.qty}</td>
                      <td style={{ ...tdr, color: '#3fb950' }}>{i.released}</td>
                      <td style={{ ...tdr, color: i.qty - i.released ? '#f0b429' : '#7d8590' }}>{i.qty - i.released}</td>
                    </tr>))}
                  </tbody>
                </table>

                <div>
                  <p style={{ fontWeight: 800, marginBottom: 8 }}>Historia</p>
                  <Event c="#2196F3" t={`Oda imetengenezwa${o.customer_name ? ' — ' + o.customer_name : ''}`} s={`${fmtTime(o.created_at)} · ${o.created_by_name}`} />
                  {d.releases.map(r => (
                    <Event key={r.id} c="#3fb950" t={'Imetoka: ' + r.lines.map(l => `${l.qty} ${l.product_name}`).join(', ')}
                      s={`${fmtTime(r.created_at)} · ${r.released_by_name} → ${r.collector_name}${r.collector_phone ? ' · ' + r.collector_phone : ''}`} />
                  ))}
                  {o.status === 'CANCELLED' && <Event c="#7d8590" t={'Imesitishwa: ' + (o.cancel_reason || '')} s={`${fmtTime(o.updated_at)} · ${o.cancelled_by_name || ''}`} />}
                  {(o.status === 'PENDING' || o.status === 'PARTIAL') && <Event c="#f0b429" t="Inasubiri kuchukuliwa stoo" s="Bidhaa zimehifadhiwa kwa oda hii" hollow />}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Event({ c, t, s, hollow }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 10, marginTop: 5, flexShrink: 0, background: hollow ? 'transparent' : c, border: `2px solid ${c}` }} />
      <div><p style={{ fontSize: 13, fontWeight: 700 }}>{t}</p><p style={ui.muted}>{s}</p></div>
    </div>
  )
}
const th = { padding: '6px 4px', fontWeight: 600, fontSize: 11 }
const thr = { ...th, textAlign: 'right' }
const td = { padding: '8px 4px' }
const tdr = { ...td, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700 }
