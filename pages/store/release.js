import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { useKibali, rpc, swWords, STATUS, fmtTime, ui, loadProducts, KIND, defaultKind, hasBoth, byCategory, T } from '../../lib/store'
import Shell from '../../components/store/Shell'
import Icon from '../../components/store/Icon'

const TABS = [
  { href: '/store/release', label: 'Skani', icon: 'scan' },
  { href: '/store/release?tab=waiting', label: 'Zinasubiri', icon: 'clock' },
  { href: '/store/release?tab=receive', label: 'Pokea', icon: 'down' },
]

export default function StoreRelease() {
  const k = useKibali()
  const router = useRouter()
  const tab = ['waiting', 'receive'].includes(router.query.tab) ? router.query.tab : 'scan'

  return (
    <Shell k={k} title={{ scan: 'Skani risiti', waiting: 'Zinasubiri', receive: 'Pokea mzigo' }[tab]} tabs={TABS}>
      {k.modules.kibali && !k.can('order.release') && <div style={ui.banner('#9A5B00')}>Akaunti yako haina ruhusa ya kutoa mzigo stoo.</div>}
      {k.can('order.release') && tab === 'scan' && <ScanRelease k={k} initialNo={router.query.no || ''} />}
      {k.can('order.release') && tab === 'waiting' && <Waiting onPick={no => router.push('/store/release?no=' + encodeURIComponent(no))} />}
      {k.can('stock.receive') && tab === 'receive' && <Receive k={k} />}
    </Shell>
  )
}

// ---------------------------------------------------------------------
function ScanRelease({ k, initialNo }) {
  const [no, setNo] = useState(initialNo)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)        // {c, t, s}
  const [order, setOrder] = useState(null)    // {order, items, releases}
  const [give, setGive] = useState({})
  const [collector, setCollector] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [mis, setMis] = useState(null)        // {paper, who}
  const [scanning, setScanning] = useState(false)
  const codeRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => { setNo(initialNo); if (initialNo) setTimeout(() => codeRef.current?.focus(), 50) }, [initialNo])

  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia

  // Camera QR scanning (Chrome on Android supports BarcodeDetector)
  useEffect(() => {
    if (!scanning) return
    let stream, timer, stop = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream; await videoRef.current.play()
        const det = new window.BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stop) return
          try {
            const codes = await det.detect(videoRef.current)
            const v = codes.map(c => c.rawValue).find(x => /^KIBALI:/.test(x))
            if (v) { setNo(v.replace('KIBALI:', '')); setScanning(false); setTimeout(() => codeRef.current?.focus(), 50); return }
          } catch (e) {}
          timer = setTimeout(tick, 350)
        }
        tick()
      } catch (e) { setMsg({ c: '#9A5B00', t: 'Kamera haikufunguka', s: 'Andika namba ya oda badala yake.' }); setScanning(false) }
    })()
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
  }, [scanning])

  const show = (o) => {
    setOrder(o)
    setGive(Object.fromEntries(o.items.map(i => [i.id, String(i.qty - i.released)])))
    setCollector(o.order.collector_name || '')
  }

  const refresh = async (id) => {
    const [o, it, rel] = await Promise.all([
      supabase.from('release_orders').select('*').eq('id', id).single(),
      supabase.from('release_order_items').select('*').eq('order_id', id).order('line_no'),
      supabase.from('release_order_releases').select('*').eq('order_id', id).order('created_at'),
    ])
    show({ order: o.data, items: it.data || [], releases: rel.data || [] })
  }

  const open = async () => {
    setMsg(null); setOrder(null); setMis(null)
    if (!no.trim()) return setMsg({ c: '#9A5B00', t: 'Andika namba ya oda' })
    if (!/^\d{4}$/.test(code.trim())) return setMsg({ c: '#9A5B00', t: 'Namba ya siri ni tarakimu 4' })
    setBusy(true)
    try {
      const r = await rpc('kibali_lookup_order', { p_order_no: no, p_code: code })
      if (r.error === 'not_found') setMsg({ c: '#B93A16', t: `Oda ${no.toUpperCase()} haipo kwenye mfumo.`, s: 'Usitoe chochote. Karatasi hii inaweza kuwa ya kughushi — piga simu duka. Mmiliki amearifiwa.' })
      else if (r.error === 'bad_code') setMsg({ c: '#B93A16', t: 'Namba ya siri si sahihi.', s: 'Usitoe. Muulize mchukuaji risiti halisi au piga simu duka. Mmiliki amearifiwa.' })
      else if (r.error === 'locked') setMsg({ c: '#B93A16', t: 'Oda imefungwa kwa saa 1.', s: 'Namba ya siri imekosewa mara 5. Mmiliki amearifiwa.' })
      else show(r)
    } catch (e) { setMsg({ c: '#B93A16', t: e.message }) }
    setBusy(false)
  }

  const release = async () => {
    setMsg(null)
    const lines = order.items.map(i => ({ item_id: i.id, qty: Number(give[i.id] || 0) })).filter(l => l.qty)
    if (lines.some(l => !Number.isInteger(l.qty) || l.qty < 0)) return setMsg({ c: '#B93A16', t: 'Idadi ziwe namba kamili' })
    if (!collector.trim()) return setMsg({ c: '#B93A16', t: 'Andika jina la anayechukua' })
    setBusy(true)
    try {
      const r = await rpc('kibali_release', { p_order_no: order.order.order_no, p_code: code, p_lines: lines, p_collector: collector, p_collector_phone: phone })
      setMsg({ c: '#0B7A6C', t: r.status === 'RELEASED' ? 'Mzigo wote umetolewa. ✓' : 'Sehemu imetolewa — kilichobaki kinabaki kwenye oda.', s: r.released.map(x => `${x.qty} ${x.unit} ${x.product_name} (${KIND[x.kind || 'retail'].sw})`).join(', ') })
      await refresh(order.order.id)
    } catch (e) { setMsg({ c: '#B93A16', t: e.message }) }
    setBusy(false)
  }

  const report = async () => {
    if (!mis.paper.trim()) return
    setBusy(true)
    try {
      await rpc('kibali_report_mismatch', { p_order_id: order.order.id, p_paper_says: mis.paper, p_brought_by: mis.who })
      setMis(null); setMsg({ c: '#B93A16', t: 'Imeripotiwa kwa mmiliki.', s: 'Usitoe chochote hadi duka lithibitishe na mmiliki aondoe flag.' })
      await refresh(order.order.id)
    } catch (e) { setMsg({ c: '#B93A16', t: e.message }) }
    setBusy(false)
  }

  const o = order?.order
  const remaining = order ? order.items.reduce((a, i) => a + i.qty - i.released, 0) : 0
  const giving = order ? order.items.reduce((a, i) => a + (Number(give[i.id]) || 0), 0) : 0

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...ui.card, display: 'grid', gap: 12 }}>
        {canScan && !scanning && (
          <button onClick={() => setScanning(true)} style={{ height: 140, borderRadius: 16, border: 'none', background: '#15183A', color: '#ECEEFA', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 16, fontWeight: 600 }}>
            <span style={{ width: 64, height: 64, borderRadius: 14, border: '3px solid #F2A007', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="scan" size={30} color="#F2A007" /></span>
            Gusa kuskani QR ya risiti
          </button>
        )}
        {scanning && (
          <div style={{ display: 'grid', gap: 8 }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 320, objectFit: 'cover' }} />
            <button onClick={() => setScanning(false)} style={ui.btn}>Funga kamera</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          <div><label>Namba ya oda</label>
            <input value={no} onChange={e => setNo(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && codeRef.current?.focus()} placeholder="1311-K7QD" autoComplete="off" style={{ ...ui.mono, fontSize: 20, fontWeight: 700, letterSpacing: 1 }} /></div>
          <div><label>Namba ya siri</label>
            <input ref={codeRef} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={e => e.key === 'Enter' && open()} inputMode="numeric" placeholder="••••" autoComplete="off" style={{ ...ui.mono, fontSize: 20, fontWeight: 700, letterSpacing: 6 }} /></div>
        </div>
        {!canScan && !scanning && <p style={{ ...ui.muted, marginTop: -4 }}>Andika namba ya oda na namba ya siri kutoka kwenye risiti ya mchukuaji. Kwenye simu ya Android (Chrome) utaweza kuskani QR kwa kamera.</p>}
        <button disabled={busy} onClick={open} style={{ ...ui.primary, height: 54 }}>{busy && !order ? 'Inafungua…' : 'Fungua oda'}</button>
      </div>

      {msg && <div style={ui.banner(msg.c)}><b>{msg.t}</b>{msg.s && <div style={{ marginTop: 2 }}>{msg.s}</div>}</div>}

      {o && (
        <div style={{ ...ui.card, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <p style={{ ...ui.mono, fontSize: 24, fontWeight: 800 }}>{o.order_no}</p>
              <p style={ui.muted}>{o.customer_name || 'Mteja wa papo hapo'} · imetolewa na {o.created_by_name} {fmtTime(o.created_at)}</p>
            </div>
            <span style={ui.pill(o.status)}>{STATUS[o.status].label}</span>
          </div>

          {o.status === 'CANCELLED' && <div style={ui.banner('#B93A16')}><b>Oda hii imesitishwa na duka.</b> Usitoe chochote. {o.cancel_reason}</div>}
          {o.status === 'RELEASED' && <div style={ui.banner('#B93A16')}><b>Mzigo wote ulishatolewa.</b> Kama mtu anajaribu kuchukua tena kwa risiti hii, inatumika mara ya pili. Mmiliki amearifiwa.</div>}
          {o.flagged && <div style={ui.banner('#B93A16')}><b>Oda ina flag — karatasi haifanani.</b> Usitoe hadi mmiliki aondoe flag.</div>}

          {(o.status === 'PENDING' || o.status === 'PARTIAL') && !o.flagged && (
            <>
              <div style={ui.banner('#9A5B00')}><b>Toa kile tu kinachoonekana hapa.</b> Karatasi ikionyesha tofauti, usitoe — bonyeza "Karatasi haifanani".</div>
              {order.items.map(i => {
                const rem = i.qty - i.released
                return (
                  <div key={i.id} style={{ border: '1px solid #DCDFEC', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 800 }}>{i.product_name} <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, color: KIND[i.kind || 'retail'].c, background: KIND[i.kind || 'retail'].c + '22' }}>{KIND[i.kind || 'retail'].sw}</span></p>
                        <p style={{ fontSize: 11, fontWeight: 800, color: '#2D2F8F' }}>{swWords(i.qty)} ({i.qty}) {i.unit.toUpperCase()}</p>
                        {i.released > 0 && <p style={ui.muted}>Zilishatolewa {i.released} · zimebaki {rem}</p>}
                      </div>
                      <p style={{ ...ui.mono, fontSize: 30, fontWeight: 800 }}>{rem}</p>
                    </div>
                    {rem > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '1px solid #DCDFEC', paddingTop: 8 }}>
                        <span style={{ fontSize: 13 }}>Unatoa sasa</span>
                        <input type="number" min="0" max={rem} step="1" inputMode="numeric" value={give[i.id] ?? ''} onChange={e => setGive({ ...give, [i.id]: e.target.value })}
                          aria-label={'Unatoa ' + i.product_name} style={{ width: 110, ...ui.mono, fontSize: 18, fontWeight: 800, textAlign: 'right', borderColor: Number(give[i.id]) > rem ? '#B93A16' : undefined }} />
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label>Aliyechukua (jina)</label><input value={collector} onChange={e => setCollector(e.target.value)} /></div>
                <div><label>Simu</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="si lazima" /></div>
              </div>
              <button disabled={busy || !giving} onClick={release} style={{ ...ui.primary, height: 56, fontSize: 17 }}>{busy ? 'Inatoa…' : `Toa mzigo · vipimo ${giving}${giving < remaining ? ` (${remaining - giving} vitabaki)` : ''}`}</button>
              {!mis && <button onClick={() => setMis({ paper: '', who: '' })} style={{ ...ui.danger, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="stop" size={18} />Karatasi haifanani</button>}
              {mis && (
                <div style={{ border: '1px solid rgba(185,58,22,0.45)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                  <p style={{ fontWeight: 800, color: '#B93A16' }}>Usitoe chochote. Andika karatasi inasema nini:</p>
                  <textarea rows={2} value={mis.paper} onChange={e => setMis({ ...mis, paper: e.target.value })} placeholder="mf. Karatasi inasema simenti 11, mfumo unasema 1" autoFocus />
                  <input value={mis.who} onChange={e => setMis({ ...mis, who: e.target.value })} placeholder="Aliyeleta karatasi (jina / maelezo)" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={busy || !mis.paper.trim()} onClick={report} style={{ ...ui.danger, background: T.danger, color: T.raised, flex: 1, height: 48 }}>Tuma tahadhari kwa mmiliki</button>
                    <button onClick={() => setMis(null)} style={ui.btn}>Acha</button>
                  </div>
                </div>
              )}
            </>
          )}

          {order.releases.length > 0 && (
            <div>
              <p style={{ fontWeight: 800, margin: '4px 0 6px' }}>Historia ya kutoa</p>
              {order.releases.map(r => (
                <p key={r.id} style={{ fontSize: 13, marginBottom: 4 }}>✓ {r.lines.map(l => `${l.qty} ${l.product_name}`).join(', ')} <span style={ui.muted}>— {fmtTime(r.created_at)} · {r.released_by_name} → {r.collector_name}</span></p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
function Waiting({ onPick }) {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('release_orders').select('*,release_order_items(*)').in('status', ['PENDING', 'PARTIAL']).order('created_at')
    setRows(data || [])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])
  if (!rows) return <p style={ui.muted}>Inapakia…</p>

  const totals = {}
  rows.forEach(o => o.release_order_items.forEach(i => { const n = i.product_name + ' (' + KIND[i.kind || 'retail'].sw + ')'; totals[n] = (totals[n] || 0) + i.qty - i.released }))
  const mins = (t) => Math.max(0, Math.round((Date.now() - new Date(t)) / 60000))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.length > 0 && (
        <div style={{ ...ui.card, background: T.tint, border: 'none' }}>
          <p style={{ ...ui.muted, fontWeight: 800, marginBottom: 8 }}>VYA KUANDAA · ODA {rows.length}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {Object.entries(totals).filter(([, v]) => v > 0).map(([n, v]) => <div key={n}><p style={{ ...ui.mono, fontSize: 20, fontWeight: 800 }}>{v}</p><p style={ui.muted}>{n}</p></div>)}
          </div>
        </div>
      )}
      {rows.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: '#5B607E' }}>Hakuna oda inayosubiri.</div>}
      {rows.map(o => (
        <button key={o.id} className="kb-card-btn" onClick={() => onPick(o.order_no)} style={{ ...ui.card, textAlign: 'left', color: T.ink, display: 'grid', gap: 6, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ ...ui.mono, fontSize: 16, fontWeight: 800 }}>{o.order_no}</span>
            <span style={ui.pill(o.status)}>{o.status === 'PARTIAL' ? 'Nusu' : `◷ dakika ${mins(o.created_at)}`}</span>
          </div>
          <span style={{ fontWeight: 700 }}>{o.customer_name || 'Mteja wa papo hapo'}</span>
          {o.release_order_items.filter(i => i.qty > i.released).map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{i.product_name} <span style={{ fontSize: 11, color: KIND[i.kind || 'retail'].c }}>{KIND[i.kind || 'retail'].sw}</span></span><span style={{ ...ui.mono, fontWeight: 800 }}>{i.qty - i.released}</span></div>
          ))}
          {o.collector_name && <span style={ui.muted}>Atachukua: {o.collector_name}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
function Receive({ k }) {
  const [products, setProducts] = useState([])
  const [moves, setMoves] = useState([])
  const [pid, setPid] = useState('')
  const [kind, setKind] = useState('retail')
  const [qty, setQty] = useState('')
  const [ref, setRef] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const [p, m] = await Promise.all([
      loadProducts(k.shop.id),
      supabase.from('stock_movements').select('*').eq('type', 'IN').gte('created_at', since.toISOString()).order('created_at', { ascending: false }),
    ])
    setProducts(p); setMoves(m.data || [])
  }, [k.shop?.id])
  useEffect(() => { load() }, [load])

  const p = products.find(x => String(x.id) === pid)
  const cur = p ? (kind === 'wholesale' ? p.wholesale : p.retail) : 0
  const q = Number(qty)

  const save = async () => {
    setMsg(null)
    if (!p) return setMsg({ c: '#B93A16', t: 'Chagua bidhaa' })
    if (!Number.isInteger(q) || q < 1) return setMsg({ c: '#B93A16', t: 'Idadi iwe namba kamili, 1 au zaidi' })
    setBusy(true)
    try {
      const bal = await rpc('kibali_receive_stock', { p_product_id: String(p.id), p_qty: q, p_reference: ref, p_kind: kind })
      setMsg({ c: '#0B7A6C', t: `${p.name} (${KIND[kind].sw}): +${q} → ${bal} stoo` }); setQty(''); setRef(''); load()
    } catch (e) { setMsg({ c: '#B93A16', t: e.message }) }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...ui.card, display: 'grid', gap: 12 }}>
        <div><label>Bidhaa</label>
          <select value={pid} onChange={e => { setPid(e.target.value); const np = products.find(x => String(x.id) === e.target.value); setKind(defaultKind(np)) }}>
            <option value="">— chagua —</option>
            {byCategory(products).map(([c, ps]) => (
              <optgroup key={c} label={c}>
                {ps.map(x => <option key={x.id} value={String(x.id)}>{x.name} — Rejareja {x.retail} · Jumla {x.wholesale}</option>)}
              </optgroup>
            ))}
          </select></div>
        {p && (
          <div><label>Aina ya stoo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['retail', 'wholesale'].map(kd => (
                <button key={kd} type="button" onClick={() => setKind(kd)} style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid', borderColor: kind === kd ? KIND[kd].c : '#DCDFEC', background: kind === kd ? KIND[kd].c + '22' : 'transparent', color: kind === kd ? KIND[kd].c : '#5B607E' }}>
                  {KIND[kd].sw} · {kd === 'wholesale' ? p.wholesale : p.retail} stoo
                </button>
              ))}
            </div>
            {!hasBoth(p) && kind !== defaultKind(p) && <p style={{ ...ui.muted, marginTop: 4, color: '#9A5B00' }}>Bidhaa hii kwa kawaida ni {KIND[defaultKind(p)].sw}. Hakikisha ni sahihi.</p>}
          </div>
        )}
        <div><label>Idadi iliyopokelewa{p ? ` (${p.unit})` : ''}</label>
          <input type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} style={{ ...ui.mono, fontSize: 24, fontWeight: 800 }} />
          {q > 0 && <p style={{ fontSize: 11, fontWeight: 800, color: '#2D2F8F', marginTop: 4 }}>{swWords(q)} ({q}) {(p?.unit || '').toUpperCase()}</p>}</div>
        <div><label>Msambazaji / namba ya delivery note</label><input value={ref} onChange={e => setRef(e.target.value)} placeholder="mf. Twiga Cement · DN 4471" /></div>
        {p && q > 0 && <div style={ui.banner('#0B7A6C')}>Baada ya kupokea ({KIND[kind].sw}): <b style={ui.mono}>{cur} → {cur + q}</b></div>}
        {msg && <div style={ui.banner(msg.c)}>{msg.t}</div>}
        <button disabled={busy} onClick={save} style={{ ...ui.primary, height: 54 }}>{busy ? 'Inahifadhi…' : 'Ongeza kwenye stoo'}</button>
      </div>
      <div style={ui.card}>
        <p style={{ fontWeight: 800, marginBottom: 8 }}>Zilizopokelewa leo</p>
        {moves.length === 0 && <p style={ui.muted}>Bado hakuna.</p>}
        {moves.map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #DCDFEC' }}>
            <div><p style={{ fontWeight: 700 }}>{m.product_name} <span style={{ fontSize: 11, color: KIND[m.kind || 'retail'].c }}>{KIND[m.kind || 'retail'].sw}</span></p><p style={ui.muted}>{fmtTime(m.created_at)} · {m.created_by_name}{m.reference ? ' · ' + m.reference : ''}</p></div>
            <span style={{ ...ui.mono, color: '#0B7A6C', fontWeight: 800 }}>+{m.qty}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
