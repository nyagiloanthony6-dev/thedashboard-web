import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

export default function Customers() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editCust, setEditCust] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const [sortBy, setSortBy] = useState('recent')

  useEffect(() => { loadData() }, [])
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const [cr, sr] = await Promise.all([
      supabase.from('customers').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }),
      supabase.from('sales').select('id,customer_id,total,total_profit,sale_date,payment_method,created_at,sale_items(product_name,qty,unit_price,line_total)').eq('shop_id', shopId).order('created_at', { ascending: false }),
    ])
    setCustomers(cr.data || [])
    setSales(sr.data || [])
    setLoading(false)
  }

  const save = async () => {
    if (!form.name.trim()) { alert('Enter customer name'); return }
    setSaving(true)
    const payload = { shop_id: shop.id, name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, notes: form.notes.trim() || null }
    if (editCust) {
      const { data, error } = await supabase.from('customers').update(payload).eq('id', editCust.id).select().single()
      if (error) { alert(error.message); setSaving(false); return }
      setCustomers(p => p.map(c => c.id === editCust.id ? { ...c, ...data } : c))
      if (detail?.id === editCust.id) setDetail(d => ({ ...d, ...data }))
    } else {
      const { data, error } = await supabase.from('customers').insert({ ...payload, total_spent: 0, visit_count: 0 }).select().single()
      if (error) { alert(error.message); setSaving(false); return }
      setCustomers(p => [data, ...p])
    }
    setSaving(false); setShowModal(false); setEditCust(null)
    showToast(editCust ? 'Customer updated' : 'Customer added')
  }

  const del = async (id) => {
    if (!confirm('Delete this customer?')) return
    await supabase.from('customers').delete().eq('id', id)
    setCustomers(p => p.filter(c => c.id !== id))
    if (detail?.id === id) setDetail(null)
    showToast('Customer deleted')
  }

  const openEdit = (c) => {
    setEditCust(c)
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '' })
    setShowModal(true)
  }

  const getCustSales = (custId) => sales.filter(s => s.customer_id === custId)

  let sorted = [...customers].filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
  })
  if (sortBy === 'spent') sorted.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
  else if (sortBy === 'visits') sorted.sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
  else sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const totalRev = customers.reduce((a, c) => a + (c.total_spent || 0), 0)
  const topCustomer = [...customers].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))[0]

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    input: { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    label: { fontSize: 10, color: '#5B607E', letterSpacing: 0.8, display: 'block', marginBottom: 5 },
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F6F7FB' }}><div style={{ width: 36, height: 36, border: '3px solid #DCDFEC', borderTopColor: '#2D2F8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Customers — TheDashboard</title></Head>
      <Layout title="Customers" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder,textarea::placeholder{color:#8A8FAE} textarea{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit;resize:vertical}`}</style>
        {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: '#2D2F8F', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999 }}>{toast}</div>}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { l: 'Total Customers', v: customers.length, c: '#2D2F8F' },
            { l: 'Total Revenue', v: fmtK(totalRev), c: '#0B7A6C' },
            { l: 'Avg Spent', v: fmtK(customers.length > 0 ? totalRev / customers.length : 0), c: '#9A5B00' },
            { l: 'Top Customer', v: topCustomer?.name?.split(' ')[0] || '—', c: '#0F7375' },
          ].map(k => (
            <div key={k.l} style={C.card}>
              <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
              <p style={{ fontSize: k.l === 'Top Customer' ? 16 : 20, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ ...C.input, flex: 1, minWidth: 200 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ k: 'recent', l: 'Recent' }, { k: 'spent', l: 'Top Spenders' }, { k: 'visits', l: 'Most Visits' }].map(s => (
              <button key={s.k} onClick={() => setSortBy(s.k)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid', borderColor: sortBy === s.k ? '#2D2F8F' : '#DCDFEC', background: sortBy === s.k ? 'rgba(45,47,143,0.15)' : 'transparent', color: sortBy === s.k ? '#2D2F8F' : '#5B607E', fontSize: 12, fontWeight: sortBy === s.k ? 700 : 400, cursor: 'pointer' }}>{s.l}</button>
            ))}
          </div>
          <button onClick={() => { setEditCust(null); setForm({ name: '', phone: '', email: '', address: '', notes: '' }); setShowModal(true) }} style={{ padding: '9px 18px', borderRadius: 8, background: '#2D2F8F', color: '#FFFFFF', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Customer</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Customer table */}
          <div style={{ background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #DCDFEC' }}>
                  {['Customer', 'Phone', 'Total Spent', 'Visits', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: '#5B607E', letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid #DCDFEC' : 'none', cursor: 'pointer', background: detail?.id === c.id ? 'rgba(45,47,143,0.05)' : 'transparent' }}
                    onClick={() => setDetail(detail?.id === c.id ? null : c)}
                    onMouseEnter={e => detail?.id !== c.id && (e.currentTarget.style.background = 'rgba(21,24,58,0.02)')}
                    onMouseLeave={e => detail?.id !== c.id && (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: '#2196F320', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#2D2F8F', flexShrink: 0 }}>{c.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</p>
                          {c.email && <p style={{ fontSize: 10, color: '#8A8FAE', marginTop: 1 }}>{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#5B607E' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#0B7A6C' }}>{fmtK(c.total_spent || 0)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: '#5B607E' }}>{c.visit_count || 0}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(c)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #DCDFEC', background: 'transparent', color: '#2D2F8F', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => del(c.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(185,58,22,0.3)', background: 'transparent', color: '#B93A16', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#8A8FAE' }}>No customers found</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {detail && (
            <div style={C.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#2196F320', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#2D2F8F', border: '1px solid #2196F330' }}>{detail.name.charAt(0)}</div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800 }}>{detail.name}</h2>
                    {detail.phone && <p style={{ fontSize: 12, color: '#5B607E', marginTop: 1 }}>{detail.phone}</p>}
                  </div>
                </div>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[{ l: 'Total Spent', v: fmtK(detail.total_spent || 0), c: '#0B7A6C' }, { l: 'Visits', v: detail.visit_count || 0, c: '#2D2F8F' }].map(k => (
                  <div key={k.l} style={{ background: '#F6F7FB', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: k.c }}>{k.v}</p>
                    <p style={{ fontSize: 10, color: '#5B607E', marginTop: 3 }}>{k.l}</p>
                  </div>
                ))}
              </div>

              {detail.address && <p style={{ fontSize: 12, color: '#5B607E', marginBottom: 8 }}>📍 {detail.address}</p>}
              {detail.notes && <p style={{ fontSize: 12, color: '#5B607E', marginBottom: 12, padding: '8px', background: '#F6F7FB', borderRadius: 6 }}>📝 {detail.notes}</p>}

              {/* Purchase history */}
              <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 8 }}>PURCHASE HISTORY</p>
              {getCustSales(detail.id).slice(0, 8).map((s, i) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #DCDFEC' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{s.sale_date || s.created_at?.split('T')[0]}</p>
                    <p style={{ fontSize: 10, color: '#8A8FAE', marginTop: 1 }}>{(s.sale_items || []).length} items · {s.payment_method?.toUpperCase()}</p>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#2D2F8F' }}>{fmt(s.total)}</p>
                </div>
              ))}
              {getCustSales(detail.id).length === 0 && <p style={{ color: '#8A8FAE', fontSize: 13 }}>No purchase history</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => openEdit(detail)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #2196F330', background: 'rgba(45,47,143,0.1)', color: '#2D2F8F', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Edit</button>
                {detail.phone && (
                  <button onClick={() => { var ph=detail.phone.replace(/[^0-9]/g,""); window.open("https://wa.me/"+ph,"_blank"); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(11,122,108,0.3)", background: "rgba(11,122,108,0.1)", color: "#0B7A6C", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>WhatsApp</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 500, border: '1px solid #DCDFEC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>{editCust ? 'Edit Customer' : 'Add Customer'}</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#5B607E', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              {[
                { k: 'name', l: 'Full Name *', ph: 'e.g. Amina Hassan' },
                { k: 'phone', l: 'Phone Number', ph: 'e.g. 0754 123 456' },
                { k: 'email', l: 'Email', ph: 'e.g. amina@gmail.com' },
                { k: 'address', l: 'Address / Area', ph: 'e.g. Kariakoo, Dar es Salaam' },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: 12 }}>
                  <label style={C.label}>{f.l.toUpperCase()}</label>
                  <input value={form[f.k]} onChange={set(f.k)} placeholder={f.ph} style={C.input} />
                </div>
              ))}
              <div style={{ marginBottom: 16 }}>
                <label style={C.label}>NOTES</label>
                <textarea value={form.notes} onChange={set('notes')} placeholder="Any notes about this customer..." rows={2} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #DCDFEC', background: 'transparent', color: '#15183A', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 8, background: '#2D2F8F', color: '#FFFFFF', fontWeight: 700, border: 'none', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Customer'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
