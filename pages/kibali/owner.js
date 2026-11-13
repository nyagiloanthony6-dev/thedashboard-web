import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useKibali, rpc, STATUS, ALERT_LABELS, fmtTime, isToday, itemSummary, ui, loadProducts, loadReserved, KIND, defaultKind, hasBoth, resKey, categoriesOf, T } from '../../lib/kibali'
import Shell from '../../components/kibali/Shell'
import Icon from '../../components/kibali/Icon'
import OrderModal from '../../components/kibali/OrderModal'

export default function KibaliOwner() {
  const k = useKibali()
  const router = useRouter()
  const tab = ['alerts', 'orders', 'stock'].includes(router.query.tab) ? router.query.tab : 'home'

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
      loadReserved(),
      supabase.from('stock_movements').select('qty').eq('type', 'OUT').gte('created_at', since.toISOString()),
    ])
    setOrders(o.data || []); setAlerts(a.data || []); setProducts(p)
    setReserved(r)
    setTodayOut(-(m.data || []).reduce((s, x) => s + x.qty, 0))
  }, [k.shop?.id])

  useEffect(() => {
    if (!k.can('kibali.audit')) return
    load(); const t = setInterval(load, 20000); return () => clearInterval(t)
  }, [load, k.role, k.modules.kibali])

  const openAlerts = alerts.filter(a => !a.resolved_at && a.type !== 'cancel')
  const TABS = [{ href: '/kibali/owner?tab=alerts', label: 'Tahadhari', badge: openAlerts.length || null }]
  const TITLE = { home: 'Habari, bosi', alerts: 'Tahadhari', orders: 'Oda zote', stock: 'Stoo' }[tab]

  return (
    <Shell k={k} title={TITLE} tabs={TABS}>
      {k.modules.kibali && !k.can('kibali.audit') && <div style={ui.banner('#8a5a00')}>Ukurasa huu ni wa mmiliki tu.</div>}
      {k.can('kibali.audit') && (
        <>
          {tab === 'home' && <Home k={k} orders={orders} openAlerts={openAlerts} products={products} reserved={reserved} todayOut={todayOut} onOpen={setOpenId} />}
          {tab === 'alerts' && <Alerts alerts={alerts} onOpen={setOpenId} onChanged={load} />}
          {tab === 'orders' && <Orders orders={orders} onOpen={setOpenId} />}
          {tab === 'stock' && <Stock products={products} reserved={reserved} onChanged={load} />}
        </>
      )}
      {openId && <OrderModal k={k} orderId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </Shell>
  )
}

function Stat({ l, v, red, href }) {
  const body = (
    <div className={href ? 'kb-card-btn' : ''} style={{ ...ui.card, background: red ? T.dangerBg : T.raised, borderColor: red ? '#f0c3be' : T.line, height: '100%' }}>
      <p style={{ fontSize: 13, color: red ? T.danger : T.muted, fontWeight: red ? 600 : 400 }}>{red ? '! ' : ''}{l}</p>
      <p style={{ fontFamily: T.mono, fontSize: 30, lineHeight: '38px', fontWeight: 500, color: red ? T.danger : T.ink }}>{v}</p>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body
}

// ---------------------------------------------------------------------
// Nyumbani: today at a glance
function Home({ orders, openAlerts, products, reserved, todayOut, onOpen }) {
  const waiting = orders.filter(o => o.status === 'PENDING' || o.status === 'PARTIAL')
  const low = products.map(p => {
    const kind = defaultKind(p)
    const av = (kind === 'wholesale' ? p.wholesale : p.retail) - (reserved[resKey(p.id, kind)] || 0)
    return { ...p, av, kind }
  }).filter(p => p.av <= (p.low_stock_alert ?? 10)).sort((a, b) => a.av - b.av).slice(0, 6)
  const sevC = (t) => ['tamper', 'unknown', 'reuse', 'negative', 'locked'].includes(t) ? T.danger : T.warning

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <Stat l="Oda za leo" v={orders.filter(o => isToday(o.created_at)).length} href="/kibali/owner?tab=orders" />
        <Stat l="Vipimo vilivyotoka leo" v={todayOut} />
        <Stat l="Zinasubiri stoo" v={waiting.length} href="/kibali/store?tab=waiting" />
        <Stat l="Tahadhari" v={openAlerts.length} red={openAlerts.length > 0} href="/kibali/owner?tab=alerts" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22, alignItems: 'start' }}>
        <section>
          <SecHead t="Tahadhari mpya" href="/kibali/owner?tab=alerts" />
          {openAlerts.length === 0 ? <Empty t="Hakuna tahadhari. Kila kitu kiko sawa." icon="check" /> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {openAlerts.slice(0, 4).map(a => (
                <button key={a.id} className="kb-card-btn" onClick={() => a.order_id && onOpen(a.order_id)} style={{ ...ui.card, padding: '10px 12px', borderLeft: `4px solid ${sevC(a.type)}`, textAlign: 'left', color: T.ink, display: 'grid', gap: 2, width: '100%' }}>
                  <span style={{ fontWeight: 600, color: sevC(a.type) }}>{ALERT_LABELS[a.type] || a.type}</span>
                  <span style={{ fontSize: 14 }}>{a.message}</span>
                  <span style={ui.muted}>{fmtTime(a.created_at)} · {a.created_by_name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <SecHead t="Stoo inakaribia kuisha" href="/kibali/owner?tab=stock" />
          {low.length === 0 ? <Empty t="Hakuna bidhaa inayokaribia kuisha." icon="box" /> : (
            <div style={{ ...ui.card, padding: 0 }}>
              {low.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                    <p style={ui.muted}>{KIND[p.kind].sw}{p.category ? ' · ' + p.category : ''}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: p.av <= 0 ? T.danger : T.warning, whiteSpace: 'nowrap' }}>{p.av <= 0 ? 'Imeisha' : `${p.av} zipo`} · agiza kwa {p.low_stock_alert ?? 10}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SecHead t="Zinasubiri kuchukuliwa" href="/kibali/store?tab=waiting" />
        {waiting.length === 0 ? <Empty t="Hakuna oda inayosubiri stoo." icon="clock" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
            {waiting.slice(0, 6).map(o => (
              <button key={o.id} className="kb-card-btn" onClick={() => onOpen(o.id)} style={{ ...ui.card, textAlign: 'left', color: T.ink, display: 'grid', gap: 4, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: T.mono, fontSize: 16 }}>{o.order_no}</span><span style={ui.pill(o.status)}>{STATUS[o.status].icon} {STATUS[o.status].label}</span>
                </div>
                <span style={{ fontWeight: 600 }}>{o.customer_name || 'Mteja wa papo hapo'}</span>
                <span style={ui.muted}>{itemSummary(o.release_order_items)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SecHead({ t, href }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
      <h2 style={ui.h}>{t}</h2>
      {href && <Link href={href} style={{ fontSize: 14, fontWeight: 600 }}>Ona zote</Link>}
    </div>
  )
}

function Empty({ t, icon }) {
  return (
    <div style={{ ...ui.card, display: 'flex', alignItems: 'center', gap: 10, color: T.muted }}>
      <Icon name={icon} size={20} color={T.success} />{t}
    </div>
  )
}

// ---------------------------------------------------------------------
function Alerts({ alerts, onOpen, onChanged }) {
  const [all, setAll] = useState(false)
  const list = alerts.filter(a => all || !a.resolved_at)
  const color = (t) => ['tamper', 'unknown', 'reuse', 'negative', 'locked'].includes(t) ? '#b3261e' : t === 'cancel' ? '#5f5a50' : '#8a5a00'
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setAll(false)} style={{ ...ui.btn, borderColor: !all ? '#1f4d3a' : '#d9cfbd', color: !all ? '#1f4d3a' : '#5f5a50' }}>Hazijashughulikiwa</button>
        <button onClick={() => setAll(true)} style={{ ...ui.btn, borderColor: all ? '#1f4d3a' : '#d9cfbd', color: all ? '#1f4d3a' : '#5f5a50' }}>Zote</button>
      </div>
      {list.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: '#5f5a50' }}>Hakuna tahadhari. Kila kitu kiko sawa.</div>}
      {list.map(a => (
        <div key={a.id} style={{ ...ui.card, borderLeft: `4px solid ${color(a.type)}`, opacity: a.resolved_at ? 0.6 : 1, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 800, color: color(a.type) }}>{ALERT_LABELS[a.type] || a.type}{a.order_no ? <span style={{ ...ui.mono, color: T.ink, marginLeft: 8, whiteSpace: 'nowrap', fontWeight: 500 }}>{a.order_no}</span> : null}</span>
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
          <thead><tr style={{ color: '#5f5a50', textAlign: 'left' }}>{['Oda', 'Muda', 'Mteja', 'Bidhaa', 'Aliyetoa', 'Hali'].map(h => <th key={h} style={{ padding: '10px 12px', fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#5f5a50' }}>Hakuna oda.</td></tr>}
            {list.map(o => (
              <tr key={o.id} onClick={() => onOpen(o.id)} style={{ borderTop: '1px solid #d9cfbd', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', ...ui.mono, fontWeight: 800 }}>{o.order_no}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtTime(o.created_at)}</td>
                <td style={{ padding: '10px 12px' }}>{o.customer_name || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#5f5a50' }}>{itemSummary(o.release_order_items)}</td>
                <td style={{ padding: '10px 12px' }}>{o.created_by_name}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}><span style={ui.pill(o.status)}>{STATUS[o.status].label}</span>{o.flagged && <span style={{ color: '#b3261e', fontWeight: 800, marginLeft: 6 }}>FLAG</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Stock: retail (Rejareja) and wholesale (Jumla) side by side
function Stock({ products, reserved, onChanged }) {
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const [cat, setCat] = useState('')
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const cats = useMemo(() => categoriesOf(products), [products])
  const rows = useMemo(() => products.map(p => {
    const rr = reserved[resKey(p.id, 'retail')] || 0, rw = reserved[resKey(p.id, 'wholesale')] || 0
    const ar = p.retail - rr, aw = p.wholesale - rw
    const main = defaultKind(p), mainAv = main === 'wholesale' ? aw : ar
    return { ...p, rr, rw, ar, aw, isLow: mainAv <= (p.low_stock_alert ?? 10), isOut: ar <= 0 && aw <= 0 }
  }), [products, reserved])
  const list = rows.filter(r => (!q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.category || '').toLowerCase().includes(q.toLowerCase())) && (!low || r.isLow) && (!cat || r.category === cat))
  const catTotals = cat ? list.reduce((a, r) => ({ retail: a.retail + r.retail, wholesale: a.wholesale + r.wholesale }), { retail: 0, wholesale: 0 }) : null
  const current = sel ? rows.find(r => r.id === sel) : null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tafuta bidhaa au kundi…" style={{ flex: 1, minWidth: 200 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 'auto', minWidth: 170 }} aria-label="Kundi">
          <option value="">Makundi yote ({cats.length})</option>
          {cats.map(c => <option key={c} value={c}>{c} ({rows.filter(r => r.category === c).length})</option>)}
        </select>
        <button onClick={() => setLow(v => !v)} style={{ ...ui.btn, borderColor: low ? '#8a5a00' : '#d9cfbd', color: low ? '#8a5a00' : '#5f5a50' }}>Zinazokaribia kuisha ({rows.filter(r => r.isLow).length})</button>
        <button onClick={() => setAdding(true)} style={ui.primary}>+ Bidhaa mpya</button>
      </div>
      <p style={ui.muted}>Kila aina inaonyesha: <b>stoo</b> (zilizopo ndani) na <b>zipo</b> (stoo kasoro zilizohifadhiwa kwa oda ambazo hazijachukuliwa).</p>
      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 660 }}>
          <thead>
            <tr style={{ color: '#5f5a50' }}>
              <th style={{ padding: '10px 12px', fontSize: 11, textAlign: 'left' }} rowSpan={2}>Bidhaa</th>
              <th style={{ padding: '10px 12px', fontSize: 11, textAlign: 'left' }} rowSpan={2}>Kundi</th>
              <th style={{ padding: '10px 12px 2px', fontSize: 11, textAlign: 'center', color: KIND.retail.c }} colSpan={2}>REJAREJA</th>
              <th style={{ padding: '10px 12px 2px', fontSize: 11, textAlign: 'center', color: KIND.wholesale.c }} colSpan={2}>JUMLA</th>
              <th rowSpan={2} />
            </tr>
            <tr style={{ color: '#5f5a50' }}>{['Stoo', 'Zipo', 'Stoo', 'Zipo'].map((h, i) => <th key={i} style={{ padding: '2px 12px 8px', fontSize: 10, textAlign: 'right' }}>{h}</th>)}</tr>
          </thead>
          <tbody>{list.map(r => (
            <tr key={r.id} onClick={() => setSel(r.id)} style={{ borderTop: '1px solid #d9cfbd', cursor: 'pointer' }}>
              <td style={{ padding: '10px 12px' }}><b>{r.name}</b></td>
              <td style={{ padding: '10px 12px', color: '#5f5a50', fontSize: 12 }}>{r.category || '—'}</td>
              <td style={{ ...num, color: r.product_type === 'wholesale' && !r.retail ? '#8c8273' : '#1b211d' }}>{r.retail}</td>
              <td style={{ ...num, color: r.ar < 0 ? '#b3261e' : '#5f5a50' }}>{r.ar}</td>
              <td style={{ ...num, color: r.product_type === 'retail' && !r.wholesale ? '#8c8273' : '#1b211d' }}>{r.wholesale}</td>
              <td style={{ ...num, color: r.aw < 0 ? '#b3261e' : '#5f5a50' }}>{r.aw}</td>
              <td style={{ padding: '10px 12px' }}>{r.isOut ? <span style={{ color: '#b3261e', fontWeight: 800, fontSize: 11 }}>IMEISHA</span> : r.isLow ? <span style={{ color: '#8a5a00', fontWeight: 800, fontSize: 11 }}>INAKARIBIA</span> : null}</td>
            </tr>))}
          </tbody>
          {catTotals && list.length > 0 && (
            <tfoot><tr style={{ borderTop: '2px solid #d9cfbd' }}>
              <td style={{ padding: '10px 12px', fontWeight: 800 }} colSpan={2}>Kundi {cat}: bidhaa {list.length} · stoo yote</td>
              <td style={num}>{catTotals.retail}</td><td />
              <td style={num}>{catTotals.wholesale}</td><td /><td />
            </tr></tfoot>
          )}
        </table>
      </div>
      {current && <ItemPanel p={current} onClose={() => setSel(null)} onChanged={onChanged} />}
      {adding && <NewItem cats={cats} existing={products} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged() }} />}
    </div>
  )
}
const num = { padding: '10px 12px', textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 800 }

function ItemPanel({ p, onClose, onChanged }) {
  const [moves, setMoves] = useState(null)
  const [mode, setMode] = useState(null)   // 'in' | 'adj'
  const [f, setF] = useState({ qty: '', ref: '', adj: 'count', kind: defaultKind(p) })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  const load = async () => {
    const { data } = await supabase.from('stock_movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(300)
    setMoves(data || [])
  }
  useEffect(() => { load() }, [p.id])

  const open = (m) => { setErr(''); setMode(m); setF({ qty: '', ref: '', adj: 'count', kind: defaultKind(p) }) }
  const save = async () => {
    setErr(''); const q = Number(f.qty)
    if (f.qty === '' || !Number.isInteger(q) || q < 0 || (mode === 'in' && q < 1)) return setErr('Weka namba kamili')
    if (mode === 'adj' && !f.ref.trim()) return setErr('Sababu inahitajika')
    setBusy(true)
    try {
      if (mode === 'in') await rpc('kibali_receive_stock', { p_product_id: String(p.id), p_qty: q, p_reference: f.ref, p_kind: f.kind })
      else await rpc('kibali_adjust_stock', { p_product_id: String(p.id), p_mode: f.adj, p_qty: q, p_reason: f.ref, p_kind: f.kind })
      setMode(null); load(); onChanged()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const label = { IN: ['Imepokelewa', '#2f6b4c'], OUT: ['Imetoka', '#b3261e'], ADJ: ['Marekebisho', '#8a5a00'] }
  const shown = (moves || []).filter(m => !filter || (m.kind || 'retail') === filter)
  const curFor = (kd) => kd === 'wholesale' ? p.wholesale : p.retail

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(27,33,29,0.5)', zIndex: 50, overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ ...ui.card, maxWidth: 680, margin: '0 auto', position: 'relative', display: 'grid', gap: 12 }}>
        <button onClick={onClose} aria-label="Funga" style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 'none', color: '#5f5a50', fontSize: 26 }}>×</button>
        <div><p style={{ fontSize: 20, fontWeight: 800 }}>{p.name}</p><p style={ui.muted}>{p.category ? p.category + ' · ' : ''}{p.unit || 'unit'} · aina: {p.product_type || 'retail'} · agiza ikifika {p.low_stock_alert ?? 10}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
          {['retail', 'wholesale'].map(kd => (
            <div key={kd} style={{ border: '1px solid ' + KIND[kd].c + '55', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: KIND[kd].c, marginBottom: 6 }}>{KIND[kd].sw.toUpperCase()} ({KIND[kd].en})</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                <Mini l="Stoo" v={curFor(kd)} /><Mini l="Kwenye oda" v={kd === 'wholesale' ? p.rw : p.rr} /><Mini l="Zipo" v={kd === 'wholesale' ? p.aw : p.ar} />
              </div>
            </div>
          ))}
        </div>
        {!mode && <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => open('in')} style={ui.primary}>+ Pokea mzigo</button>
          <button onClick={() => open('adj')} style={ui.btn}>Hesabu / rekebisha</button>
        </div>}
        {mode && (
          <div style={{ border: '1px solid #d9cfbd', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['retail', 'wholesale'].map(kd => (
                <button key={kd} type="button" onClick={() => setF({ ...f, kind: kd })} style={{ flex: 1, padding: 9, borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid', borderColor: f.kind === kd ? KIND[kd].c : '#d9cfbd', background: f.kind === kd ? KIND[kd].c + '22' : 'transparent', color: f.kind === kd ? KIND[kd].c : '#5f5a50' }}>
                  {KIND[kd].sw} · {curFor(kd)}
                </button>
              ))}
            </div>
            {mode === 'adj' && <select value={f.adj} onChange={e => setF({ ...f, adj: e.target.value })}>
              <option value="count">Hesabu ya stoo — weka salio jipya</option>
              <option value="remove">Ondoa (zimeharibika / zimepotea)</option>
              <option value="add">Ongeza (zimepatikana / zimerudishwa)</option>
            </select>}
            <input type="number" min="0" step="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })}
              placeholder={mode === 'in' ? 'Idadi iliyopokelewa' : f.adj === 'count' ? 'Idadi uliyohesabu' : 'Idadi'} style={{ ...ui.mono, fontSize: 18, fontWeight: 800 }} autoFocus />
            <input value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} placeholder={mode === 'in' ? 'Msambazaji / delivery note' : 'Sababu (lazima)'} />
            {mode === 'adj' && <p style={ui.muted}>Kila marekebisho yanaonekana kwenye tahadhari na historia.</p>}
            {err && <div style={ui.banner('#b3261e')}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}><button disabled={busy} onClick={save} style={ui.primary}>Hifadhi ({KIND[f.kind].sw})</button><button onClick={() => setMode(null)} style={ui.btn}>Acha</button></div>
          </div>
        )}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <p style={{ fontWeight: 800 }}>Mzunguko</p>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">Zote</option><option value="retail">Rejareja</option><option value="wholesale">Jumla</option>
            </select>
          </div>
          {!moves ? <p style={ui.muted}>Inapakia…</p> : shown.length === 0 ? <p style={ui.muted}>Bado hakuna mzunguko uliorekodiwa na Kibali.</p> : shown.map(m => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8, padding: '8px 0', borderTop: '1px solid #d9cfbd', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, color: label[m.type][1] }}>{label[m.type][0]} <span style={{ fontSize: 11, color: KIND[m.kind || 'retail'].c }}>{KIND[m.kind || 'retail'].sw}</span>{m.reference ? <span style={{ color: '#1b211d', fontWeight: 400 }}> · {m.reference}</span> : null}</p>
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

function Mini({ l, v }) {
  return <div><p style={{ fontSize: 10, color: '#5f5a50', fontWeight: 700 }}>{l.toUpperCase()}</p><p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 20, fontWeight: 800 }}>{v}</p></div>
}

// ---------------------------------------------------------------------
// New item from inside Kibali. Created with 0 stock; the opening quantity
// is then received through Kibali so it is in the movement history.
function NewItem({ cats, existing, onClose, onSaved }) {
  const [shopCats, setShopCats] = useState([])
  const [shopId, setShopId] = useState(null)
  const [f, setF] = useState({ name: '', category: '', unit: 'pc', type: 'retail', sell: '', whs: '', buy: '', low: '10', openR: '', openW: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('app_users').select('shop_id').eq('id', me.user.id).single()
      let id = prof?.shop_id
      if (!id) { const { data: o } = await supabase.from('shop_owners').select('shop_id').eq('user_id', me.user.id).limit(1); id = o?.[0]?.shop_id }
      setShopId(id)
      if (id) {
        const { data } = await supabase.from('product_categories').select('name').eq('shop_id', id).order('name')
        setShopCats((data || []).map(c => c.name))
      }
    })()
  }, [])
  const allCats = [...new Set([...shopCats, ...cats])].sort()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const showR = f.type !== 'wholesale', showW = f.type !== 'retail'

  const save = async () => {
    setErr('')
    const name = f.name.trim()
    if (!name) return setErr('Andika jina la bidhaa')
    if (existing.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) return setErr('Bidhaa yenye jina hili tayari ipo')
    const oR = showR ? Number(f.openR || 0) : 0, oW = showW ? Number(f.openW || 0) : 0
    if (![oR, oW].every(n => Number.isInteger(n) && n >= 0)) return setErr('Idadi ya mwanzo iwe namba kamili')
    if (!shopId) return setErr('Duka halijapatikana — jaribu tena')
    setBusy(true)
    try {
      const { data: prod, error } = await supabase.from('products').insert({
        shop_id: shopId, name, category: f.category.trim() || null, unit: f.unit.trim() || 'unit', product_type: f.type,
        sell_price: parseFloat(f.sell) || 0, wholesale_price: parseFloat(f.whs) || 0, buy_price: parseFloat(f.buy) || 0,
        low_stock_alert: parseInt(f.low) || 10, stock: 0, retail_stock: 0, wholesale_stock: 0, box_qty: 1,
        is_active: true, image_emoji: '📦',
      }).select('id').single()
      if (error) throw new Error(error.message)
      if (oR > 0) await rpc('kibali_receive_stock', { p_product_id: String(prod.id), p_qty: oR, p_reference: 'Stoo ya mwanzo', p_kind: 'retail' })
      if (oW > 0) await rpc('kibali_receive_stock', { p_product_id: String(prod.id), p_qty: oW, p_reference: 'Stoo ya mwanzo', p_kind: 'wholesale' })
      onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(27,33,29,0.5)', zIndex: 50, overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ ...ui.card, maxWidth: 560, margin: '0 auto', position: 'relative', display: 'grid', gap: 10 }}>
        <button onClick={onClose} aria-label="Funga" style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 'none', color: '#5f5a50', fontSize: 26 }}>×</button>
        <p style={{ fontSize: 18, fontWeight: 800 }}>Bidhaa mpya</p>
        <div><label>Jina la bidhaa *</label><input value={f.name} onChange={set('name')} placeholder="mf. Shock Absorber Buffer" autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Kundi</label>
            <input list="kb-newcats" value={f.category} onChange={set('category')} placeholder="Chagua au andika" />
            <datalist id="kb-newcats">{allCats.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label>Kipimo (unit)</label><input value={f.unit} onChange={set('unit')} placeholder="pc, box, bag…" /></div>
        </div>
        <div><label>Aina ya uuzaji</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['retail', 'Rejareja'], ['wholesale', 'Jumla'], ['both', 'Zote mbili']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, type: v })} style={{ flex: 1, padding: 9, borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid', borderColor: f.type === v ? '#1f4d3a' : '#d9cfbd', background: f.type === v ? 'rgba(31,77,58,0.10)' : 'transparent', color: f.type === v ? '#1f4d3a' : '#5f5a50' }}>{l}</button>
            ))}
          </div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <div><label>Bei ya kununua</label><input type="number" value={f.buy} onChange={set('buy')} placeholder="0" /></div>
          {showR && <div><label>Bei rejareja</label><input type="number" value={f.sell} onChange={set('sell')} placeholder="0" /></div>}
          {showW && <div><label>Bei jumla</label><input type="number" value={f.whs} onChange={set('whs')} placeholder="0" /></div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {showR && <div><label style={{ color: KIND.retail.c }}>Stoo ya mwanzo · Rejareja</label><input type="number" min="0" step="1" value={f.openR} onChange={set('openR')} placeholder="0" /></div>}
          {showW && <div><label style={{ color: KIND.wholesale.c }}>Stoo ya mwanzo · Jumla</label><input type="number" min="0" step="1" value={f.openW} onChange={set('openW')} placeholder="0" /></div>}
          <div><label>Agiza ikifika</label><input type="number" min="0" value={f.low} onChange={set('low')} /></div>
        </div>
        <p style={ui.muted}>Stoo ya mwanzo inarekodiwa kama "Imepokelewa" kwenye historia ya bidhaa.</p>
        {err && <div style={ui.banner('#b3261e')}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}><button disabled={busy} onClick={save} style={ui.primary}>{busy ? 'Inahifadhi…' : 'Hifadhi bidhaa'}</button><button onClick={onClose} style={ui.btn}>Acha</button></div>
      </div>
    </div>
  )
}
