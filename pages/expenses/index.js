import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK, today } from '../../lib/supabase'

const CATS = ['Transport','Stock Purchase','Rent','Salaries','Electricity','Water','Packaging','Cleaning','Marketing','Miscellaneous']
const TYPES = ['operating','stock','capital','other']

export default function Expenses() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [showModal, setShowModal] = useState(false)
  const [editExp, setEditExp] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category:'Transport', description:'', amount:'', expense_date:today(), expense_type:'operating', added_by:'' })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const [toast, setToast] = useState('')

  useEffect(() => { loadData() }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const [er, tr] = await Promise.all([
      supabase.from('expenses').select('*').eq('shop_id', shopId).order('expense_date', { ascending: false }),
      supabase.from('app_users').select('id,full_name,role').eq('shop_id', shopId).in('role', ['cashier','shop_admin']),
    ])
    setExpenses(er.data || [])
    setTeam(tr.data || [])
    setLoading(false)
  }

  const save = async () => {
    if (!form.amount || !form.expense_date) { alert('Enter amount and date'); return }
    setSaving(true)
    const payload = {
      shop_id: shop.id, category: form.category, description: form.description.trim() || null,
      amount: parseFloat(form.amount), expense_date: form.expense_date,
      expense_type: form.expense_type,
      added_by: form.added_by || profile.id,
      added_by_role: team.find(t => t.id === (form.added_by || profile.id))?.role || 'shop_admin',
    }
    if (editExp) {
      const { data, error } = await supabase.from('expenses').update(payload).eq('id', editExp.id).select('*,app_users(full_name)').single()
      if (error) { alert(error.message); setSaving(false); return }
      setExpenses(p => p.map(e => e.id === editExp.id ? data : e))
    } else {
      const { data, error } = await supabase.from('expenses').insert(payload).select('*,app_users(full_name)').single()
      if (error) { alert(error.message); setSaving(false); return }
      setExpenses(p => [data, ...p])
    }
    setSaving(false); setShowModal(false); setEditExp(null)
    showToast(editExp ? 'Expense updated' : 'Expense recorded')
  }

  const del = async (id) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(p => p.filter(e => e.id !== id))
    showToast('Deleted')
  }

  const openEdit = (e) => {
    setEditExp(e)
    setForm({ category: e.category, description: e.description || '', amount: String(e.amount), expense_date: e.expense_date, expense_type: e.expense_type || 'operating', added_by: e.added_by || '' })
    setShowModal(true)
  }

  const now = new Date()
  const filterExp = e => {
    const d = new Date(e.expense_date || e.created_at)
    if (period === 'today') return d.toDateString() === now.toDateString()
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (period === 'year') return d.getFullYear() === now.getFullYear()
    return true
  }
  const filtExp = expenses.filter(filterExp)
  const total = filtExp.reduce((a, e) => a + (e.amount || 0), 0)

  // By category
  const byCat = {}
  filtExp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0) })
  const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1])

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    input: { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F6F7FB' }}><div style={{ width:36,height:36,border:'3px solid #DCDFEC',borderTopColor:'#B93A16',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Expenses — TheDashboard</title></Head>
      <Layout title="Expenses" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder,select::placeholder{color:#8A8FAE} select{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit}`}</style>

        {toast && <div style={{ position:'fixed', top:20, right:20, background:'#B93A16', color:'#fff', padding:'12px 20px', borderRadius:10, fontWeight:700, fontSize:13, zIndex:9999 }}>{toast}</div>}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ display:'flex', gap:8 }}>
            {[{k:'today',l:'Today'},{k:'month',l:'This Month'},{k:'year',l:'This Year'},{k:'all',l:'All Time'}].map(p => (
              <button key={p.k} onClick={() => setPeriod(p.k)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid', borderColor:period===p.k?'#B93A16':'#DCDFEC', background:period===p.k?'rgba(185,58,22,0.15)':'transparent', color:period===p.k?'#B93A16':'#5B607E', fontSize:13, fontWeight:period===p.k?700:400, cursor:'pointer' }}>{p.l}</button>
            ))}
          </div>
          <button onClick={() => { setEditExp(null); setForm({ category:'Transport', description:'', amount:'', expense_date:today(), expense_type:'operating', added_by:'' }); setShowModal(true) }} style={{ padding:'9px 20px', borderRadius:8, background:'#B93A16', color:'#fff', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>+ Add Expense</button>
        </div>

        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:24 }}>
          {[
            { l:'Total Expenses', v:fmtK(total), c:'#B93A16' },
            { l:'Num Expenses', v:filtExp.length, c:'#9A5B00' },
            { l:'Categories', v:catList.length, c:'#0F7375' },
            { l:'Avg Expense', v:fmtK(filtExp.length>0?total/filtExp.length:0), c:'#2D2F8F' },
          ].map(k => (
            <div key={k.l} style={C.card}>
              <p style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8 }}>{k.l.toUpperCase()}</p>
              <p style={{ fontSize:20, fontWeight:900, color:k.c, marginTop:6 }}>{k.v}</p>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:24 }}>
          {/* Expenses table */}
          <div style={{ background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #DCDFEC' }}>
                  {['Date','Category','Description','Added By','Amount',''].map(h => (
                    <th key={h} style={{ padding:'12px 14px', textAlign:'left', fontSize:10, color:'#5B607E', letterSpacing:0.8, fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtExp.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom:i<filtExp.length-1?'1px solid #DCDFEC':'none' }}
                    onMouseEnter={ev => ev.currentTarget.style.background='rgba(21,24,58,0.02)'}
                    onMouseLeave={ev => ev.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#5B607E' }}>{e.expense_date}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ background:'rgba(185,58,22,0.1)', color:'#B93A16', border:'1px solid rgba(185,58,22,0.2)', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{e.category}</span>
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#5B607E' }}>{e.description || '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#8A8FAE' }}>{team.find(t=>t.id===e.added_by)?.full_name || profile?.full_name || '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:14, fontWeight:700, color:'#B93A16' }}>{fmt(e.amount)}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => openEdit(e)} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #DCDFEC', background:'transparent', color:'#2D2F8F', fontSize:11, fontWeight:600, cursor:'pointer' }}>Edit</button>
                        <button onClick={() => del(e.id)} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(185,58,22,0.3)', background:'transparent', color:'#B93A16', fontSize:11, fontWeight:600, cursor:'pointer' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtExp.length && <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#8A8FAE' }}>No expenses recorded</td></tr>}
              </tbody>
            </table>
          </div>

          {/* By category */}
          <div style={C.card}>
            <p style={{ fontSize:11, color:'#5B607E', letterSpacing:0.8, marginBottom:14 }}>BY CATEGORY</p>
            {catList.map(([cat, amt]) => (
              <div key={cat} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#B93A16' }}>{fmtK(amt)}</span>
                </div>
                <div style={{ height:4, background:'#DCDFEC', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(total>0?Math.round(amt/total*100):0)+'%', background:'#B93A16', borderRadius:2 }}/>
                </div>
              </div>
            ))}
            {!catList.length && <p style={{ color:'#8A8FAE', fontSize:13 }}>No expenses</p>}
          </div>
        </div>

        {/* Modal */}
        {showModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(21,24,58,0.55)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }} onClick={e => e.target===e.currentTarget&&setShowModal(false)}>
            <div style={{ background:'#FFFFFF', borderRadius:'20px 20px 0 0', padding:28, width:'100%', maxWidth:500, border:'1px solid #DCDFEC' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h2 style={{ fontSize:16, fontWeight:800 }}>{editExp?'Edit Expense':'Add Expense'}</h2>
                <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'#5B607E', fontSize:20, cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>CATEGORY</label>
                  <select value={form.category} onChange={set('category')} style={C.input}>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>AMOUNT (TZS) *</label>
                  <input value={form.amount} onChange={set('amount')} type="number" placeholder="e.g. 50000" style={C.input}/>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>DATE *</label>
                  <input value={form.expense_date} onChange={set('expense_date')} type="date" style={C.input}/>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>TYPE</label>
                  <select value={form.expense_type} onChange={set('expense_type')} style={C.input}>
                    {TYPES.map(t => <option key={t} value={t} style={{ textTransform:'capitalize' }}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>ADDED BY</label>
                  <select value={form.added_by} onChange={set('added_by')} style={C.input}>
                    <option value="">Me ({profile?.full_name})</option>
                    {team.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.role})</option>)}
                  </select>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8, display:'block', marginBottom:5 }}>DESCRIPTION</label>
                  <input value={form.description} onChange={set('description')} placeholder="Optional details" style={C.input}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button onClick={() => setShowModal(false)} style={{ flex:1, padding:'11px', borderRadius:8, border:'1px solid #DCDFEC', background:'transparent', color:'#15183A', fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:8, background:'#B93A16', color:'#fff', fontWeight:700, border:'none', cursor:'pointer' }}>{saving?'Saving...':'Save Expense'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
