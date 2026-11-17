import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Messages from Serengeti Admin, plus automatic subscription reminders (td_my_notices).
// Each user can close a message; closed ones stay hidden for that user.
export default function NoticeBanner({ shopId }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!shopId) return
    let alive = true
    supabase.rpc('td_my_notices', { p_shop: shopId }).then(({ data, error }) => { if (alive && !error) setItems(data || []) })
    return () => { alive = false }
  }, [shopId])
  const close = (id) => {
    setItems(xs => xs.filter(x => x.id !== id))
    supabase.rpc('td_dismiss_notice', { p_id: String(id) }).then(() => {})
  }
  if (!items.length) return null
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
      {items.map(n => {
        const warn = n.level === 'warning'
        return (
          <div key={n.id} role={warn ? 'alert' : 'status'}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderRadius: 12, padding: '11px 14px',
              background: warn ? '#FDF0D2' : '#E4E5F6', color: warn ? '#7A4800' : '#2D2F8F', border: '1px solid ' + (warn ? 'rgba(242,160,7,0.4)' : 'rgba(45,47,143,0.2)') }}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: '20px' }}>{warn ? '⚠' : 'ℹ'}</span>
            <div style={{ flex: 1, fontSize: 14, lineHeight: '20px' }}>
              <b>{n.title}</b>{n.body && <span> — {n.body}</span>}
            </div>
            <button onClick={() => close(n.id)} aria-label="Funga ujumbe"
              style={{ border: 0, background: 'transparent', color: 'inherit', fontSize: 18, lineHeight: '20px', cursor: 'pointer', padding: 0 }}>×</button>
          </div>
        )
      })}
    </div>
  )
}
