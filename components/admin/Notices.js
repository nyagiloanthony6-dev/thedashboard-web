import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../lib/store'
import { card, btnP, btnG, inp, lbl, Msg, dmy } from './ui'

const TARGETS = [['all', 'Maduka yote'], ['pos', 'Wenye POS'], ['store', 'Wenye Store'], ['both', 'POS + Store pekee'], ['shop', 'Duka moja']]
const targetLabel = (n) => n.target === 'shop' ? 'Duka: ' + (n.shop || '—') : (TARGETS.find(t => t[0] === n.target) || [0, n.target])[1]

export default function Notices({ shops }) {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState({})
  const blank = { title: '', body: '', level: 'info', target: 'all', shop: '', ends: '' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const load = () => supabase.rpc('platform_list_notices').then(({ data, error }) => { if (error) setMsg({ err: error.message }); else setRows(data || []) })
  useEffect(() => { load() }, [])
  const send = async () => {
    setMsg({})
    if (!f.title.trim()) return setMsg({ err: 'Andika kichwa cha ujumbe' })
    if (f.target === 'shop' && !f.shop) return setMsg({ err: 'Chagua duka' })
    setBusy(true)
    const { error } = await supabase.rpc('platform_save_notice', {
      p_title: f.title, p_body: f.body, p_level: f.level, p_target: f.target, p_shop: f.target === 'shop' ? f.shop : null,
      p_ends_at: f.ends ? new Date(f.ends + 'T23:59:00').toISOString() : null,
    })
    setBusy(false)
    if (error) return setMsg({ err: error.message })
    setF(blank); setMsg({ ok: 'Ujumbe umetumwa. Watumiaji wataona wakifungua TheDashboard (web au app).' }); load()
  }
  const end = async (n) => {
    const { error } = await supabase.rpc('platform_end_notice', { p_id: n.id })
    if (error) setMsg({ err: error.message }); else load()
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, alignItems: 'start' }}>
      <div style={card}>
        <p style={{ fontWeight: 700, fontSize: 16 }}>Tuma ujumbe kwa maduka</p>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Unaonekana juu ya ukurasa wa web na app hadi mtumiaji aufunge.</p>
        <label style={lbl}>Kwa nani</label>
        <select value={f.target} onChange={e => setF({ ...f, target: e.target.value })} style={inp}>
          {TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {f.target === 'shop' && <>
          <label style={lbl}>Duka</label>
          <select value={f.shop} onChange={e => setF({ ...f, shop: e.target.value })} style={inp}>
            <option value="">— chagua duka —</option>
            {shops.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </>}
        <label style={lbl}>Kichwa *</label>
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={inp} placeholder="mf. Toleo jipya la TheDashboard" maxLength={80} />
        <label style={lbl}>Ujumbe</label>
        <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={4} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Maelezo mafupi" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div><label style={lbl}>Aina</label>
            <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })} style={inp}>
              <option value="info">Taarifa (bluu)</option><option value="warning">Tahadhari (njano)</option>
            </select></div>
          <div><label style={lbl}>Ionekane hadi (hiari)</label><input type="date" value={f.ends} onChange={e => setF({ ...f, ends: e.target.value })} style={inp} /></div>
        </div>
        {f.title && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Mfano wa jinsi itakavyoonekana:</p>
            <div style={{ borderRadius: 12, padding: '10px 14px', background: f.level === 'warning' ? '#FDF0D2' : '#E4E5F6', color: f.level === 'warning' ? '#7A4800' : '#2D2F8F', fontSize: 14 }}>
              <b>{f.title}</b>{f.body && <span> — {f.body}</span>}
            </div>
          </div>
        )}
        <Msg err={msg.err} ok={msg.ok} />
        <button disabled={busy} onClick={send} style={{ ...btnP, marginTop: 14, opacity: busy ? 0.6 : 1 }}>{busy ? 'Inatuma…' : 'Tuma ujumbe'}</button>
      </div>
      <div style={card}>
        <p style={{ fontWeight: 700, fontSize: 16 }}>Ujumbe uliotumwa</p>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Pia kuna kumbukumbu za moja kwa moja: duka linaona onyo usajili ukibaki siku 7, siku 1, na ukiisha.</p>
        {rows === null && <p style={{ color: T.muted, marginTop: 10 }}>Inapakia…</p>}
        {rows && rows.length === 0 && <p style={{ color: T.muted, marginTop: 10 }}>Bado hakuna ujumbe.</p>}
        {(rows || []).map(n => (
          <div key={n.id} style={{ borderTop: '1px solid ' + T.line, padding: '12px 0', opacity: n.active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ fontWeight: 700 }}>{n.level === 'warning' ? '⚠ ' : ''}{n.title}</p>
              {n.active ? <button onClick={() => end(n)} style={{ ...btnG, padding: '5px 12px', fontSize: 12 }}>Sitisha</button> : <span style={{ fontSize: 12, color: T.muted }}>Umesitishwa</span>}
            </div>
            {n.body && <p style={{ fontSize: 14, marginTop: 2 }}>{n.body}</p>}
            <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{targetLabel(n)} · {dmy(n.created_at)}{n.ends_at ? ' · hadi ' + dmy(n.ends_at) : ''} · umefungwa na {n.dismissed}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
