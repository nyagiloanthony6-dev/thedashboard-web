import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

export default function Settings() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('shop')
  const [toast, setToast] = useState('')

  // Shop info
  const [shopForm, setShopForm] = useState({ name: '', phone: '', email: '', address: '', currency: 'TZS', tax_rate: '' })
  const [shopSaving, setShopSaving] = useState(false)

  // Categories
  const [categories, setCategories] = useState([])
  const [newCat, setNewCat] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  // Custom fields
  const [customFields, setCustomFields] = useState([])
  const [newField, setNewField] = useState('')
  const [newFieldType, setNewFieldType] = useState('text')
  const [cfSaving, setCfSaving] = useState(false)

  // Password change
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')

  useEffect(() => { loadData() }, [])
  const showToast = (msg, c = '#25d366') => { setToast({ msg, c }); setTimeout(() => setToast(''), 3000) }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof)
    const shopData = prof.shops
    setShop(shopData)
    setShopForm({
      name: shopData.name || '',
      phone: shopData.phone || '',
      email: shopData.email || '',
      address: shopData.address || '',
      currency: shopData.currency || 'TZS',
      tax_rate: String(shopData.tax_rate || ''),
    })
    const shopId = shopData.id
    const [cf, catData] = await Promise.all([
      supabase.from('product_custom_fields').select('*').eq('shop_id', shopId).order('sort_order'),
      supabase.from('product_categories').select('*').eq('shop_id', shopId).order('name'),
    ])
    setCustomFields(cf.data || [])
    setCategories(catData.data || [])
    setLoading(false)
  }

  const saveShopInfo = async () => {
    setShopSaving(true)
    const { error } = await supabase.from('shops').update({
      name: shopForm.name.trim(),
      phone: shopForm.phone.trim() || null,
      email: shopForm.email.trim() || null,
      address: shopForm.address.trim() || null,
      currency: shopForm.currency,
      tax_rate: parseFloat(shopForm.tax_rate) || null,
    }).eq('id', shop.id)
    if (error) { showToast(error.message, '#ff4d6d') } else { showToast('Shop info saved!'); setShop(p => ({ ...p, name: shopForm.name })) }
    setShopSaving(false)
  }

  const addCategory = async () => {
    if (!newCat.trim()) return
    setCatSaving(true)
    const { data, error } = await supabase.from('product_categories').insert({ shop_id: shop.id, name: newCat.trim() }).select().single()
    if (error) { showToast(error.message, '#ff4d6d') } else { setCategories(p => [...p, data].sort((a, b) => a.name.localeCompare(b.name))); setNewCat(''); showToast('Category added!') }
    setCatSaving(false)
  }

  const delCategory = async (id) => {
    if (!confirm('Delete this category?')) return
    await supabase.from('product_categories').delete().eq('id', id)
    setCategories(p => p.filter(c => c.id !== id))
    showToast('Category deleted')
  }

  const addCustomField = async () => {
    if (!newField.trim()) return
    setCfSaving(true)
    const sort = customFields.length
    const { data, error } = await supabase.from('product_custom_fields').insert({ shop_id: shop.id, field_name: newField.trim(), field_type: newFieldType, sort_order: sort }).select().single()
    if (error) { showToast(error.message, '#ff4d6d') } else { setCustomFields(p => [...p, data]); setNewField(''); showToast('Custom field added!') }
    setCfSaving(false)
  }

  const delCustomField = async (id) => {
    if (!confirm('Delete this custom field? This will remove it from all products.')) return
    await supabase.from('product_custom_fields').delete().eq('id', id)
    setCustomFields(p => p.filter(f => f.id !== id))
    showToast('Field deleted')
  }

  const changePassword = async () => {
    setPwError('')
    if (!pwForm.newPw || pwForm.newPw.length < 6) { setPwError('Password must be at least 6 characters'); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    if (error) { setPwError(error.message) } else { showToast('Password changed!'); setPwForm({ current: '', newPw: '', confirm: '' }) }
    setPwSaving(false)
  }

  const C = {
    card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 20, marginBottom: 16 },
    input: { background: '#0d1117', border: '1.5px solid #30363d', borderRadius: 8, color: '#e6edf3', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    label: { fontSize: 10, color: '#7d8590', letterSpacing: 0.8, display: 'block', marginBottom: 5 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: '#7d8590', letterSpacing: 0.5, marginBottom: 14 },
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0d1117' }}><div style={{ width:36, height:36, border:'3px solid #30363d', borderTopColor:'#a78bfa', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Settings — TheDashboard</title></Head>
      <Layout title="Settings" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder,select::placeholder{color:#484f58} select{background:#0d1117;border:1.5px solid #30363d;border-radius:8px;color:#e6edf3;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit}`}</style>
        {toast && <div style={{ position:'fixed', top:20, right:20, background:toast.c, color:'#000', padding:'12px 20px', borderRadius:10, fontWeight:700, fontSize:13, zIndex:9999 }}>{toast.msg}</div>}

        {/* Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:24 }}>
          {[['shop','🏪 Shop Info'],['categories','📂 Categories'],['fields','🔧 Custom Fields'],['account','🔐 Account']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid', borderColor:tab===k?'#a78bfa':'#30363d', background:tab===k?'rgba(167,139,250,0.15)':'transparent', color:tab===k?'#a78bfa':'#7d8590', fontWeight:tab===k?700:400, fontSize:13, cursor:'pointer' }}>{l}</button>
          ))}
        </div>

        {/* SHOP INFO */}
        {tab==='shop' && (
          <div style={{ maxWidth: 600 }}>
            <div style={C.card}>
              <p style={C.sectionTitle}>SHOP INFORMATION</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={C.label}>SHOP NAME *</label>
                  <input value={shopForm.name} onChange={e => setShopForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. G2K Auto Parts" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>PHONE NUMBER</label>
                  <input value={shopForm.phone} onChange={e => setShopForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 0741 300 354" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>EMAIL</label>
                  <input value={shopForm.email} onChange={e => setShopForm(p => ({ ...p, email: e.target.value }))} placeholder="e.g. info@shop.co.tz" type="email" style={C.input} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={C.label}>ADDRESS</label>
                  <input value={shopForm.address} onChange={e => setShopForm(p => ({ ...p, address: e.target.value }))} placeholder="e.g. Kariakoo, Dar es Salaam" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>CURRENCY</label>
                  <select value={shopForm.currency} onChange={e => setShopForm(p => ({ ...p, currency: e.target.value }))}>
                    <option value="TZS">TZS — Tanzania Shilling</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="KES">KES — Kenya Shilling</option>
                    <option value="UGX">UGX — Uganda Shilling</option>
                  </select>
                </div>
                <div>
                  <label style={C.label}>TAX RATE (%)</label>
                  <input value={shopForm.tax_rate} onChange={e => setShopForm(p => ({ ...p, tax_rate: e.target.value }))} placeholder="e.g. 18" type="number" style={C.input} />
                </div>
              </div>
              <button onClick={saveShopInfo} disabled={shopSaving} style={{ marginTop:20, padding:'12px 28px', borderRadius:8, background:'#a78bfa', color:'#000', fontWeight:700, fontSize:14, border:'none', cursor:'pointer' }}>{shopSaving ? 'Saving...' : 'Save Shop Info'}</button>
            </div>

            {/* Subscription info */}
            <div style={{ ...C.card, borderColor: shop?.subscription==='trial'?'rgba(255,181,71,0.3)':'rgba(37,211,102,0.3)' }}>
              <p style={C.sectionTitle}>SUBSCRIPTION</p>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:16, fontWeight:800, color: shop?.subscription==='trial'?'#ffb547':'#25d366' }}>{shop?.subscription==='trial'?'Free Trial':'Active'}</p>
                  <p style={{ fontSize:12, color:'#7d8590', marginTop:4 }}>Plan: {shop?.sub_plan || 'Trial'}</p>
                  {shop?.sub_expires_at && <p style={{ fontSize:12, color:'#7d8590', marginTop:2 }}>Expires: {new Date(shop.sub_expires_at).toLocaleDateString()}</p>}
                </div>
                <a href="https://wa.me/255741300354?text=Nataka kuendelea na TheDashboard" target="_blank" rel="noreferrer" style={{ padding:'10px 20px', borderRadius:8, background:'#25d366', color:'#000', fontWeight:700, fontSize:13, textDecoration:'none' }}>Upgrade via WhatsApp</a>
              </div>
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {tab==='categories' && (
          <div style={{ maxWidth:600 }}>
            <div style={C.card}>
              <p style={C.sectionTitle}>PRODUCT CATEGORIES</p>
              <p style={{ fontSize:12, color:'#7d8590', marginBottom:16 }}>Categories are shared across all your products. Add, rename or delete as needed.</p>

              {/* Add new */}
              <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key==='Enter'&&addCategory()} placeholder="New category name..." style={{ ...C.input, flex:1 }} />
                <button onClick={addCategory} disabled={catSaving||!newCat.trim()} style={{ padding:'9px 18px', borderRadius:8, background:catSaving||!newCat.trim()?'#30363d':'#a78bfa', color:catSaving||!newCat.trim()?'#484f58':'#000', fontWeight:700, fontSize:13, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                  {catSaving ? '...' : '+ Add'}
                </button>
              </div>

              {/* Category list */}
              {categories.length === 0 && <p style={{ color:'#484f58', fontSize:13 }}>No categories yet. Add your first one above.</p>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
                {categories.map(c => (
                  <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0d1117', borderRadius:8, padding:'10px 14px', border:'1px solid #30363d' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>📂 {c.name}</span>
                    <button onClick={() => delCategory(c.id)} style={{ background:'none', border:'none', color:'#ff4d6d', fontSize:14, cursor:'pointer', padding:'2px 6px' }}>✕</button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11, color:'#484f58', marginTop:16 }}>{categories.length} categories total</p>
            </div>
          </div>
        )}

        {/* CUSTOM FIELDS */}
        {tab==='fields' && (
          <div style={{ maxWidth:600 }}>
            <div style={C.card}>
              <p style={C.sectionTitle}>PRODUCT CUSTOM FIELDS</p>
              <p style={{ fontSize:12, color:'#7d8590', marginBottom:16 }}>Custom fields appear on every product. Use them for part numbers, OEM codes, specifications etc.</p>

              {/* Add new */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, marginBottom:20, alignItems:'end' }}>
                <div>
                  <label style={C.label}>FIELD NAME</label>
                  <input value={newField} onChange={e => setNewField(e.target.value)} onKeyDown={e => e.key==='Enter'&&addCustomField()} placeholder="e.g. Part Number" style={C.input} />
                </div>
                <div>
                  <label style={C.label}>TYPE</label>
                  <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} style={{ ...C.input, width:120 }}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <button onClick={addCustomField} disabled={cfSaving||!newField.trim()} style={{ padding:'9px 16px', borderRadius:8, background:cfSaving||!newField.trim()?'#30363d':'#a78bfa', color:cfSaving||!newField.trim()?'#484f58':'#000', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>
                  {cfSaving ? '...' : '+ Add'}
                </button>
              </div>

              {/* Fields list */}
              {!customFields.length && <p style={{ color:'#484f58', fontSize:13 }}>No custom fields yet. Part Number is a common one for auto parts shops.</p>}
              {customFields.map((f, i) => (
                <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0d1117', borderRadius:8, padding:'12px 14px', marginBottom:8, border:'1px solid #30363d' }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:700 }}>🔧 {f.field_name}</p>
                    <p style={{ fontSize:11, color:'#7d8590', marginTop:2 }}>Type: {f.field_type} · Sort: {f.sort_order}</p>
                  </div>
                  <button onClick={() => delCustomField(f.id)} style={{ background:'none', border:'none', color:'#ff4d6d', fontSize:14, cursor:'pointer', padding:'4px 8px' }}>✕</button>
                </div>
              ))}
              <p style={{ fontSize:11, color:'#484f58', marginTop:8 }}>{customFields.length} custom fields · Values are set per product in Stock Management</p>
            </div>
          </div>
        )}

        {/* ACCOUNT */}
        {tab==='account' && (
          <div style={{ maxWidth:500 }}>
            {/* Profile info */}
            <div style={C.card}>
              <p style={C.sectionTitle}>MY ACCOUNT</p>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{ width:52, height:52, background:'#a78bfa20', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'#a78bfa', border:'1px solid #a78bfa30' }}>{profile?.full_name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <p style={{ fontSize:16, fontWeight:800 }}>{profile?.full_name}</p>
                  <p style={{ fontSize:12, color:'#7d8590', marginTop:2 }}>{profile?.email}</p>
                  <span style={{ background:'rgba(167,139,250,0.15)', color:'#a78bfa', border:'1px solid rgba(167,139,250,0.3)', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{profile?.role?.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Change password */}
            <div style={C.card}>
              <p style={C.sectionTitle}>CHANGE PASSWORD</p>
              {[{k:'newPw',l:'NEW PASSWORD',ph:'At least 6 characters',type:'password'},{k:'confirm',l:'CONFIRM PASSWORD',ph:'Repeat new password',type:'password'}].map(f => (
                <div key={f.k} style={{ marginBottom:12 }}>
                  <label style={C.label}>{f.l}</label>
                  <input value={pwForm[f.k]} onChange={e => setPwForm(p => ({ ...p, [f.k]: e.target.value }))} type={f.type} placeholder={f.ph} style={C.input} />
                </div>
              ))}
              {pwError && <div style={{ background:'rgba(255,77,109,0.1)', border:'1px solid rgba(255,77,109,0.3)', borderRadius:8, padding:'9px 12px', marginBottom:12, color:'#ff4d6d', fontSize:13 }}>{pwError}</div>}
              <button onClick={changePassword} disabled={pwSaving} style={{ padding:'11px 24px', borderRadius:8, background:'#a78bfa', color:'#000', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>{pwSaving ? 'Saving...' : 'Change Password'}</button>
            </div>

            {/* Danger zone */}
            <div style={{ ...C.card, borderColor:'rgba(255,77,109,0.3)' }}>
              <p style={{ ...C.sectionTitle, color:'#ff4d6d' }}>DANGER ZONE</p>
              <p style={{ fontSize:12, color:'#7d8590', marginBottom:14 }}>These actions are irreversible. Contact support if you need help.</p>
              <button onClick={() => { if(confirm('Sign out of your account?')) supabase.auth.signOut() }} style={{ padding:'9px 18px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,77,109,0.3)', color:'#ff4d6d', fontSize:13, fontWeight:600, cursor:'pointer' }}>Sign Out</button>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
