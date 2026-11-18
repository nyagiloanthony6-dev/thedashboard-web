import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Staff who can stand guarantor for a loan sale (everyone on the shop's team)
export function useGuarantors(shopId) {
  const [list, setList] = useState([])
  useEffect(() => {
    if (!shopId) return
    supabase.from('app_users').select('id,full_name,role').eq('shop_id', shopId).order('full_name')
      .then(({ data }) => setList((data || []).filter(u => u.full_name)))
  }, [shopId])
  return list
}

// Required when the sale leaves a balance (loan or part payment)
export default function GuarantorPicker({ staff, value, onChange }) {
  const ok = !!value
  return (
    <div style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${ok ? '#0B7A6C' : '#B93A16'}`, background: ok ? 'rgba(11,122,108,0.05)' : 'rgba(185,58,22,0.05)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: ok ? '#0B7A6C' : '#B93A16', marginBottom: 6 }}>🤝 STAFF GUARANTOR (required for loan)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {staff.map(g => (
          <button key={g.id} type="button" onClick={() => onChange(g.id)} aria-pressed={value === g.id}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `1px solid ${value === g.id ? '#2D2F8F' : '#DCDFEC'}`, background: value === g.id ? '#2D2F8F' : '#fff', color: value === g.id ? '#fff' : '#15183A', fontWeight: value === g.id ? 700 : 500 }}>
            {g.full_name}
          </button>
        ))}
        {staff.length === 0 && <span style={{ fontSize: 12, color: '#5B607E' }}>No staff found for this shop.</span>}
      </div>
      <p style={{ fontSize: 11, color: '#5B607E', marginTop: 6 }}>This person is responsible for following up the loan.</p>
    </div>
  )
}
