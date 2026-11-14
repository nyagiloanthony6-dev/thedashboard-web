import { useState } from 'react'
import { supabase, fmt } from '../lib/supabase'

// Restock and Adjust for the web Stock page, same fields and records as the mobile app.
// Quantities: with TheDashboard Store on, changes go through the Store RPCs so the store
// movement log and alerts stay correct; otherwise the product row is updated directly.
// Both always write a stock_batches row (cost history / Batches view), like the app.

const overlay = { position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }
const box = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', padding: 22 }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#5B607E', margin: '12px 0 5px' }
const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #DCDFEC', fontSize: 14, background: '#fff', color: '#15183A' }
const btnP = { padding: '11px 20px', borderRadius: 999, border: 0, background: '#2D2F8F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
const btnG = { padding: '11px 20px', borderRadius: 999, border: '1px solid #DCDFEC', background: '#fff', color: '#15183A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const mono = { fontFamily: 'JetBrains Mono, monospace' }

const partOf = (p, customFields) => {
  const f = (customFields || []).find(x => (x.field_name || '').toLowerCase().includes('part'))
  return f ? (p._cfv?.[f.id] || '') : ''
}
const today = () => new Date().toISOString().slice(0, 10)
const stamp = () => today().replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 900) + 100)

function Header({ title, p, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
      <div>
        <p style={{ fontWeight: 700, fontSize: 19 }}>{title}</p>
        <p style={{ fontSize: 14, color: '#5B607E' }}>{p.image_emoji} {p.name}</p>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', fontSize: 22, color: '#5B607E', cursor: 'pointer' }}>×</button>
    </div>
  )
}

export function RestockModal({ product: p, shop, kibaliOn, customFields, onClose, onDone }) {
  const [d, setD] = useState({ boxes: '', buy: String(p.buy_price || ''), freight: '', clearing: '', transport: '', other: '', vendor: '', notes: '', min_sell: String(p.min_sell_price || '') })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = k => e => setD(x => ({ ...x, [k]: e.target.value }))
  const num = v => parseFloat(v || '0') || 0
  const retailOnly = shop?.sale_mode === 'retail'
  const pcsPerBox = p.box_qty || 1
  const boxes = parseInt(d.boxes || '0') || 0
  const totalPcs = boxes * pcsPerBox
  const landed = num(d.buy) * boxes + num(d.freight) + num(d.clearing) + num(d.transport) + num(d.other)
  const landedPerPc = totalPcs > 0 ? Math.round(landed / totalPcs) : 0

  const save = async () => {
    setErr('')
    if (boxes <= 0) return setErr('Enter number of boxes received.')
    if (num(d.buy) <= 0) return setErr('Enter buy price per box.')
    setBusy(true)
    try {
      const prefix = (p.name || 'ITEM').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X')
      const batchRef = prefix + '-' + stamp()
      const partNo = partOf(p, customFields)
      const { error: bErr } = await supabase.from('stock_batches').insert({
        shop_id: shop.id, product_id: p.id, product_name: p.name, part_number: partNo || null, category: p.category || null,
        image_emoji: p.image_emoji || '📦', batch_ref: batchRef, received_date: today(),
        qty_boxes: boxes, pieces_per_box: pcsPerBox, qty_pieces: totalPcs, qty_remaining: totalPcs,
        unit_cost: num(d.buy), currency: 'TZS', exchange_rate: 1, unit_cost_tzs: num(d.buy),
        total_cost_tzs: Math.round(landed), landed_cost_per_piece: landedPerPc,
        vendor_name: d.vendor || null, notes: d.notes || null, status: 'active',
      })
      if (bErr) throw new Error(bErr.message)
      // Retail-only shops count pieces at the counter; everyone else receives boxes into wholesale stock (as in the app)
      const kind = retailOnly ? 'retail' : 'wholesale'
      const qty = retailOnly ? totalPcs : boxes
      const changes = { buy_price: num(d.buy), ...(d.min_sell !== '' ? { min_sell_price: num(d.min_sell) } : {}) }
      if (kibaliOn) {
        const { error } = await supabase.rpc('kibali_receive_stock', { p_product_id: String(p.id), p_qty: qty, p_reference: 'Restock ' + batchRef, p_kind: kind })
        if (error) throw new Error(error.message)
      } else if (kind === 'wholesale') changes.wholesale_stock = (p.wholesale_stock || 0) + qty
      else { changes.retail_stock = (p.retail_stock || p.stock || 0) + qty; changes.stock = changes.retail_stock }
      const { error: uErr } = await supabase.from('products').update(changes).eq('id', p.id)
      if (uErr) throw new Error(uErr.message)
      onDone(`✅ Restocked ${p.name}: ${boxes} box${boxes > 1 ? 'es' : ''} (${totalPcs} pcs). Landed cost ${fmt(landedPerPc)}/pc. Batch ${batchRef}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <Header title="Restock" p={p} onClose={onClose} />
        <p style={{ fontSize: 13, color: '#5B607E' }}>Now: <b style={mono}>{p.wholesale_stock || 0}</b> boxes · <b style={mono}>{p.retail_stock || p.stock || 0}</b> pcs · {pcsPerBox} pcs per box</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div><label style={lbl}>Boxes received *</label><input autoFocus type="number" min="1" value={d.boxes} onChange={set('boxes')} style={{ ...inp, ...mono, fontSize: 18 }} /></div>
          <div><label style={lbl}>Buy price per box *</label><input type="number" min="0" value={d.buy} onChange={set('buy')} style={inp} /></div>
          <div><label style={lbl}>Freight</label><input type="number" min="0" value={d.freight} onChange={set('freight')} style={inp} placeholder="0" /></div>
          <div><label style={lbl}>Clearing</label><input type="number" min="0" value={d.clearing} onChange={set('clearing')} style={inp} placeholder="0" /></div>
          <div><label style={lbl}>Transport</label><input type="number" min="0" value={d.transport} onChange={set('transport')} style={inp} placeholder="0" /></div>
          <div><label style={lbl}>Other costs</label><input type="number" min="0" value={d.other} onChange={set('other')} style={inp} placeholder="0" /></div>
          <div><label style={lbl}>Vendor</label><input value={d.vendor} onChange={set('vendor')} style={inp} placeholder="Supplier name" /></div>
          <div><label style={lbl}>Min sell price</label><input type="number" min="0" value={d.min_sell} onChange={set('min_sell')} style={inp} placeholder="optional" /></div>
        </div>
        <label style={lbl}>Notes</label><input value={d.notes} onChange={set('notes')} style={inp} placeholder="e.g. Invoice 221" />
        {boxes > 0 && (
          <div style={{ background: '#ECEEF7', borderRadius: 12, padding: 12, marginTop: 14, fontSize: 13, display: 'grid', gap: 3 }}>
            <div>{boxes} boxes × {pcsPerBox} = <b style={mono}>{totalPcs} pcs</b>{retailOnly ? ' added to retail stock' : ' · stock becomes ' + ((p.wholesale_stock || 0) + boxes) + ' boxes'}</div>
            <div>Total landed cost: <b style={mono}>{fmt(Math.round(landed))}</b> · per piece <b style={mono}>{fmt(landedPerPc)}</b></div>
          </div>
        )}
        {err && <p style={{ color: '#B93A16', fontWeight: 600, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button disabled={busy} onClick={save} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save restock'}</button>
          <button onClick={onClose} style={btnG}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const REASONS = [['correction', 'Correction'], ['damaged', 'Damaged'], ['lost', 'Lost / stolen'], ['found', 'Found'], ['returned', 'Returned']]

export function AdjustModal({ product: p, shop, kibaliOn, customFields, onClose, onDone }) {
  const mode = ['retail', 'wholesale'].includes(shop?.sale_mode) ? shop.sale_mode : 'both'
  const defKind = mode !== 'both' ? mode : (p.product_type === 'wholesale' || p.product_type === 'both' ? 'wholesale' : 'retail')
  const [kind, setKind] = useState(defKind)
  const cur = k => k === 'wholesale' ? (p.wholesale_stock || 0) : (p.retail_stock || p.stock || 0)
  const [qty, setQty] = useState(String(cur(defKind)))
  const [reason, setReason] = useState('correction')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const oldQty = cur(kind), newQty = parseInt(qty), diff = isNaN(newQty) ? 0 : newQty - oldQty
  const unit = kind === 'wholesale' ? 'boxes' : 'pcs'

  const save = async () => {
    setErr('')
    if (isNaN(newQty) || newQty < 0) return setErr('Enter a valid stock quantity.')
    if (diff === 0) return setErr('The new count is the same as the current stock.')
    setBusy(true)
    try {
      const why = `${reason}${notes ? ' — ' + notes : ''}`
      if (kibaliOn) {
        const { error } = await supabase.rpc('kibali_adjust_stock', { p_product_id: String(p.id), p_mode: 'count', p_qty: newQty, p_reason: why, p_kind: kind })
        if (error) throw new Error(error.message)
      } else {
        const changes = kind === 'wholesale' ? { wholesale_stock: newQty } : { retail_stock: newQty, stock: newQty }
        const { error } = await supabase.from('products').update(changes).eq('id', p.id)
        if (error) throw new Error(error.message)
      }
      await supabase.from('stock_batches').insert({
        shop_id: shop.id, product_id: p.id, product_name: p.name, part_number: partOf(p, customFields) || null, category: p.category || null,
        image_emoji: p.image_emoji || '📦', batch_ref: 'ADJ-' + stamp(), received_date: today(),
        qty_boxes: 0, pieces_per_box: 1, qty_pieces: diff, qty_remaining: newQty,
        unit_cost: 0, currency: 'TZS', exchange_rate: 1, unit_cost_tzs: 0, total_cost_tzs: 0, landed_cost_per_piece: 0,
        status: diff >= 0 ? 'active' : 'adjustment', vendor_name: 'Stock Adjustment',
        notes: `${why} (${diff >= 0 ? '+' : ''}${diff} ${unit} from ${oldQty})`,
      })
      onDone(`✅ Adjusted ${p.name}: ${oldQty} → ${newQty} ${unit} (${diff >= 0 ? '+' : ''}${diff})`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...box, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <Header title="Adjust stock" p={p} onClose={onClose} />
        {mode === 'both' && (
          <div style={{ display: 'flex', background: '#ECEEF7', borderRadius: 999, padding: 3, marginTop: 10 }}>
            {[['retail', 'Retail (pcs)'], ['wholesale', 'Wholesale (boxes)']].map(([v, l]) => (
              <button key={v} onClick={() => { setKind(v); setQty(String(cur(v))) }}
                style={{ flex: 1, border: 0, borderRadius: 999, padding: '8px 0', fontWeight: kind === v ? 700 : 500, cursor: 'pointer', background: kind === v ? '#2D2F8F' : 'transparent', color: kind === v ? '#fff' : '#15183A' }}>{l}</button>
            ))}
          </div>
        )}
        <p style={{ fontSize: 13, color: '#5B607E', marginTop: 12 }}>Current stock: <b style={{ ...mono, color: '#15183A' }}>{oldQty} {unit}</b></p>
        <label style={lbl}>Actual count now ({unit})</label>
        <input autoFocus type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} style={{ ...inp, ...mono, fontSize: 20 }} />
        {!isNaN(newQty) && diff !== 0 && <p style={{ marginTop: 6, fontWeight: 600, color: diff > 0 ? '#0B7A6C' : '#B93A16' }}>{diff > 0 ? '+' : ''}{diff} {unit}</p>}
        <label style={lbl}>Reason</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {REASONS.map(([v, l]) => (
            <button key={v} onClick={() => setReason(v)} style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid ' + (reason === v ? '#2D2F8F' : '#DCDFEC'), background: reason === v ? '#2D2F8F' : '#fff', color: reason === v ? '#fff' : '#15183A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        <label style={lbl}>Notes</label><input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="optional" />
        {kibaliOn && <p style={{ fontSize: 12, color: '#5B607E', marginTop: 10 }}>TheDashboard Store is on: this is recorded in the store's stock history and the owner gets an alert.</p>}
        {err && <p style={{ color: '#B93A16', fontWeight: 600, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button disabled={busy} onClick={save} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save adjustment'}</button>
          <button onClick={onClose} style={btnG}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
