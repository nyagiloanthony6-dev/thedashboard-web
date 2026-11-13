import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { useKibali, rpc, STATUS, ALERT_LABELS, fmtTime, isToday, itemSummary, ui, loadProducts } from '../../lib/kibali'
import Shell from '../../components/kibali/Shell'
import OrderModal from '../../components/kibali/OrderModal'

export default function KibaliOwner() {
  const k = useKibali()
  const router = useRouter()
  const tab = ['orders', 'stock'].includes(router.query.tab) ? router.query.tab : 'alerts'

  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const [products, setProducts] = useState([])
  const [reserved, setReserved] = useState({})
  const [todayOut, setTodayOut] = useState(0)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    if (!k.shop?.id) return
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const [o, a, p, r, m] = await Promise.all([
      supabase.from('release_orders').select('*,release_order_items(*)').order('created_at', { ascending: false }).limit(300),
      supabase.from('kibali_alerts').select('*').order('created_at', { ascending: false }).limit(200),
      loadProducts(k.shop.id),
      supabase.from('kibali_reserved').select('product_id,reserved'),
      supabase.from('stock_movements').select('qty').eq('type', 'OUT').gte('created_at', since.toISOString()),
    ])
    setOrders(o.data || []); setAlerts(a.data || []); setProducts(p)
    setReserved(Object.fromEntries((r.data || []).map(x => [String(x.product_id), x.reserved])))
    setTodayOut(-(m.data || []).reduce((s, x) => s + x.qty, 0))
  }, [k.shop?.id])

  useEffect(() => {
    if (!k.can('kibali.audit')) return
    load(); const t = setInterval(load, 20000); return () => clearInterval(t)
  }, [load, k.role, k.modules.kibali])

  const openAlerts = alerts.filter(a => !a.resolved_at && a.type !== 'cancel')
  const TABS = [
    { href: '/kibali/owner', label: 'Tahadhari', badge: openAlerts.length || null },
    { href: '/kibali/owner?tab=orders', label: 'Oda' },
    { href: '/kibali/owner?tab=stock', label: 'Stoo' },
    { href: '/kibali/shop', label: '+ Oda mpya' },
    { href: '/kibali/store', label: 'Skrini ya stoo' },
  ]

  return (
    <Shell k={k} title="Kibali — Mmiliki" tabs={TABS}>
      {k.modules.kibali && !k.can('kibali.audit') && <div style={ui.banner('#f0b429')}>Ukurasa huu ni wa mmiliki tu.</div>}
      {k.can('kibali.audit') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 18 }}>
            <Stat l="Oda za leo" v={orders.filter(o => isToday(o.created_at)).length} />
            <Stat l="Vipimo vilivyotoka leo" v={todayOut} />
            <Stat l="Zinasubiri stoo" v={orders.filter(o => o.status === 'PENDING' || o.status === 'PARTIAL').length} />
            <Stat l="Tahadhari wazi" v={openAlerts.length} red={openAlerts.length > 0} />
          </div>
          {tab === 'alerts' && <Alerts alerts={alerts} onOpen={setOpenId} onChanged={load} />}
          {tab === 'orders' && <Orders orders={orders} onOpen={setOpenId} />}
          {tab === 'stock' && <Stock products={products} reserved={reserved} onChanged={load} />}
        </>
      )}
      {openId && <OrderModal k={k} orderId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </Shell>
  )
}

function Stat({ l, v, red }) {
  return (
    <div style={{ ...ui.card, borderColor: red ? 'rgba(255,77,109,0.5)' : '#30363d' }}>
      <p style={{ fontSize: 11, color: red ? '#ff4d6d' : '#7d8590', fontWeight: 700, letterSpacing: 0.5 }}>{l.toUpperCase()}</p>
      <p style={{ ...ui.mono, fontSize: 26, fontWeight: 800, color: red ? '#ff4d6d' : '#e6edf3', marginTop: 4 }}>{v}</p>
    </div>
  )
}

// ---------------------------------------------------------------------
function Alerts({ alerts, onOpen, onChanged }) {
  const [all, setAll] = useState(false)
  const list = alerts.filter(a => all || !a.resolved_at)
  const color = (t) => ['tamper', 'unknown', 'reuse', 'negative', 'locked'].includes(t) ? '#ff4d6d' : t === 'cancel' ? '#7d8590' : '#f0b429'
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setAll(false)} style={{ ...ui.btn, borderColor: !all ? '#2196F3' : '#30363d', color: !all ? '#2196F3' : '#7d8590' }}>Hazijashughulikiwa</button>
        <button onClick={() => setAll(true)} style={{ ...ui.btn, borderColor: all ? '#2196F3' : '#30363d', color: all ? '#2196F3' : '#7d8590' }}>Zote</button>
      </div>
      {list.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: '#7d8590' }}>Hakuna tahadhari. 👍</div>}
      {list.map(a => (
        <div key={a.id} style={{ ...ui.card, borderLeft: `4px solid ${color(a.type)}`, opacity: a.resolved_at ? 0.6 : 1, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 800, color: color(a.type) }}>{ALERT_LABELS[a.type] || a.type}{a.order_no ? <span style={{ ...ui.mono, color: '#e6edf3', marginLeft: 8 }}>{a.order_no}</span> : null}</span>
            <span style={ui.muted}>{fmtTime(a.created_at)}</span>
          </div>
          <p style={{ fontSize: 13 }}>{a.message}</p>
          <p style={ui.muted}>{a.created_by_name}{a.resolved_at ? ` · imeshughulikiwa na ${a.resolved_by_name} ${fmtTime(a.resolved_at)}` : ''}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {a.order_id && <button onClick={() => onOpen(a.order_id)} style={ui.btn}>Fungua oda</button>}
            {!a.resolved_at && <button onClick={async () => { try { await rpc('kibali_resolve_alert', { p_alert_id: a.id }); onChanged() } catch (e) { alert(e.message) } }} style={ui.btn}>Imeshughulikiwa ✓</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
function Orders({ orders, onOpen }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('')
  const list = orders.filter(o =>
    (!f || (f === 'FLAG' ? o.flagged : o.status === f)) &&
    (!q || [o.order_no, o.customer_name, o.created_by_name, o.collector_name, itemSummary(o.release_order_items)].join(' ').toLowerCase().includes(q.toLowerCase())))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tafuta namba ya oda, mteja, bidhaa, mfanyakazi…" style={{ flex: 1, minWidth: 220 }} />
        <select value={f} onChange={e => setF(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Hali zote</option>
          {Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
          <option value="FLAG">Zenye flag</option>
        </select>
      </div>
      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead><tr style={{ color: '#7d8590', textAlign: 'left' }}>{['Oda', 'Muda', 'Mteja', 'Bidhaa', 'Aliyetoa', 'Hali'].map(h => <th key={h} style={{ padding: '10px 12px', fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#7d8590' }}>Hakuna oda.</td></tr>}
            {list.map(o => (
              <tr key={o.id} onClick={() => onOpen(o.id)} style={{ borderTop: '1px solid #30363d', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', ...ui.mono, fontWeight: 800 }}>{o.order_no}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtTime(o.created_at)}</td>
                <td style={{ padding: '10px 12px' }}>{o.customer_name || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#7d8590' }}>{itemSummary(o.release_order_items)}</td>
                <td style={{ padding: '10px 12px' }}>{o.created_by_name}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}><span style={ui.pill(o.status)}>{STATUS[o.status].label}</span>{o.flagged && <span style={{ color: '#ff4d6d', fontWeight: 800, marginLeft: 6 }}>FLAG</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
function Stock({ products, reserved, onChanged }) {
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const [sel, setSel] = useState(null)
  const rows = useMemo(() => products.map(p => {
    const res = reserved[String(p.id)] || 0, av = (p.stock || 0) - res
    return { ...p, res, av, isLow: av <= (p.low_stock_alert ?? 10) }
  }), [products, reserved])
  const list = rows.filter(r => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!low || r.isLow))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tafuta bidhaa…" style={{ flex: 1, minWidth: 200 }} />
        <button onClick={() => setLow(v => !v)} style={{ ...ui.btn, borderColor: low ? '#f0b429' : '#30363d', color: low ? '#f0b429' : '#7d8590' }}>Zinazokaribia kuisha ({rows.filter(r => r.isLow).length})</button>
      </div>
      <p style={ui.muted}>Stoo = zilizopo ndani · Oda = zimehifadhiwa kwa oda ambazo hazijachukuliwa · Zipo = zinazoweza kuuzwa sasa. Bidhaa mpya ongeza kwenye ukurasa wa Stock.</p>
      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
          <thead><tr style={{ color: '#7d8590' }}>{['Bidhaa', 'Stoo', 'Oda', 'Zipo', ''].map((h, i) => <th key={i} style={{ padding: '10px 12px', fontSize: 11, textAlign: i && i < 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>{list.map(r => (
            <tr key={r.id} onClick={() => setSel(r)} style={{ borderTop: '1px solid #30363d', cursor: 'pointer' }}>
              <td style={{ padding: '10px 12px' }}><b>{r.name}</b> <span style={ui.muted}>/{r.unit || 'unit'}</span></td>
              <td style={num}>{r.stock || 0}</td>
              <td style={{ ...num, color: '#7d8590' }}>{r.res}</td>
              <td style={{ ...num, color: r.av <= 0 ? '#ff4d6d' : r.isLow ? '#f0b429' : '#e6edf3' }}>{r.av}</td>
              <td style={{ padding: '10px 12px' }}>{r.av <= 0 ? <span style={{ color: '#ff4d6d', fontWeight: 800, fontSize: 11 }}>IMEISHA</span> : r.isLow ? <span style={{ color: '#f0b429', fontWeight: 800, fontSize: 11 }}>INAKARIBIA</span> : null}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      {sel && <ItemPanel p={sel} onClose={() => setSel(null)} onChanged={() => { onChanged(); }} />}
    </div>
  )
}
const num = { padding: '10px 12px', textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 800 }

function ItemPanel({ p, onClose, onChanged }) {
  const [moves, setMoves] = useState(null)
  const [mode, setMode] = useState(null)   // 'in' | 'adj'
  const [f, setF] = useState({ qty: '', ref: '', adj: 'count' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [stock, setStock] = useState(p.stock || 0)

  const load = async () => {
    const { data } = await supabase.from('stock_movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(200)
    setMoves(data || [])
  }
  useEffect(() => { load() }, [p.id])

  const save = async () => {
    setErr(''); const q = Number(f.qty)
    if (f.qty === '' || !Number.isInteger(q) || q < 0 || (mode === 'in' && q < 1)) return setErr('Weka namba kamili')
    if (mode === 'adj' && !f.ref.trim()) return setErr('Sababu inahitajika')
    setBusy(true)
    try {
      const bal = mode === 'in'
        ? await rpc('kibali_receive_stock', { p_product_id: String(p.id), p_qty: q, p_reference: f.ref })
        : await rpc('kibali_adjust_stock', { p_product_id: String(p.id), p_mode: f.adj, p_qty: q, p_reason: f.ref })
      setStock(bal); setMode(null); setF({ qty: '', ref: '', adj: 'count' }); load(); onChanged()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const label = { IN: ['Imepokelewa', '#3fb950'], OUT: ['Imetoka', '#ff4d6d'], ADJ: ['Marekebisho', '#f0b429'] }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ ...ui.card, maxWidth: 640, margin: '0 auto', position: 'relative', display: 'grid', gap: 12 }}>
        <button onClick={onClose} aria-label="Funga" style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 'none', color: '#7d8590', fontSize: 26 }}>×</button>
        <div><p style={{ fontSize: 20, fontWeight: 800 }}>{p.name}</p><p style={ui.muted}>{p.unit || 'unit'} · agiza ikifika {p.low_stock_alert ?? 10}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <Stat l="Stoo" v={stock} /><Stat l="Kwenye oda" v={p.res} /><Stat l="Zipo" v={stock - p.res} />
        </div>
        {!mode && <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('in')} style={ui.primary}>+ Pokea mzigo</button>
          <button onClick={() => setMode('adj')} style={ui.btn}>Hesabu / rekebisha</button>
        </div>}
        {mode && (
          <div style={{ border: '1px solid #30363d', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            {mode === 'adj' && <select value={f.adj} onChange={e => setF({ ...f, adj: e.target.value })}>
              <option value="count">Hesabu ya stoo — weka salio jipya</option>
              <option value="remove">Ondoa (zimeharibika / zimepotea)</option>
              <option value="add">Ongeza (zimepatikana / zimerudishwa)</option>
            </select>}
            <input type="number" min="0" step="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })}
              placeholder={mode === 'in' ? 'Idadi iliyopokelewa' : f.adj === 'count' ? 'Idadi uliyohesabu' : 'Idadi'} style={{ ...ui.mono, fontSize: 18, fontWeight: 800 }} autoFocus />
            <input value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} placeholder={mode === 'in' ? 'Msambazaji / delivery note' : 'Sababu (lazima)'} />
            {mode === 'adj' && <p style={ui.muted}>Kila marekebisho yanaonekana kwenye tahadhari na historia.</p>}
            {err && <div style={ui.banner('#ff4d6d')}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}><button disabled={busy} onClick={save} style={ui.primary}>Hifadhi</button><button onClick={() => setMode(null)} style={ui.btn}>Acha</button></div>
          </div>
        )}
        <div>
          <p style={{ fontWeight: 800, marginBottom: 6 }}>Mzunguko</p>
          {!moves ? <p style={ui.muted}>Inapakia…</p> : moves.length === 0 ? <p style={ui.muted}>Bado hakuna mzunguko uliorekodiwa na Kibali.</p> : moves.map(m => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8, padding: '8px 0', borderTop: '1px solid #30363d', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, color: label[m.type][1] }}>{label[m.type][0]}{m.reference ? <span style={{ color: '#e6edf3', fontWeight: 400 }}> · {m.reference}</span> : null}</p>
                <p style={ui.muted}>{fmtTime(m.created_at)} · {m.created_by_name}{m.note && m.type !== 'ADJ' ? ' · ' + m.note : ''}</p>
              </div>
              <span style={{ ...num, padding: 0, color: label[m.type][1] }}>{m.qty > 0 ? '+' : ''}{m.qty}</span>
              <span style={{ ...num, padding: 0 }}>{m.balance_after}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
