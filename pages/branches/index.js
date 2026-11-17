import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt } from '../../lib/supabase'
import { loadBranches, switchShop } from '../../lib/store'

// Business Pack: all of the owner's shops in one view, switch between them, add branches.
const C = { surface:'#FFFFFF', sunk:'#ECEEF7', ink:'#15183A', muted:'#5B607E', line:'#DCDFEC', indigo:'#2D2F8F', saffron:'#F2A007', teal:'#0B7A6C', coral:'#B93A16' }
const card = { background:C.surface, border:`1px solid ${C.line}`, borderRadius:14, padding:18 }
const mono = { fontFamily:'JetBrains Mono, monospace' }
const btn = { border:0, borderRadius:10, padding:'9px 16px', fontSize:14, fontWeight:600, cursor:'pointer', background:C.indigo, color:'#fff' }
const btnG = { ...btn, background:C.surface, color:C.ink, border:`1px solid ${C.line}` }
const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:`1px solid ${C.line}`, fontSize:14, boxSizing:'border-box' }
const ago = (d) => {
  if (!d) return 'No sales yet'
  const m = Math.round((Date.now() - new Date(d)) / 60000)
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(d).toLocaleDateString('en-GB')
}

export default function Branches() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [g, setG] = useState(undefined)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    let s = prof?.shops
    if (!s) { const { data: o } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1); s = o?.[0]?.shops }
    setProfile(prof); setShop(s)
    setG(await loadBranches())
  }
  useEffect(() => { load() }, [])

  const open = async (id) => {
    setBusy(id); setErr('')
    try { await switchShop(id); window.location.href = '/dashboard' } catch (e) { setBusy(''); setErr(e.message) }
  }

  const shops = g?.shops || []
  const sum = (k) => shops.reduce((a, x) => a + Number(x[k] || 0), 0)
  const full = g && g.count >= g.max_shops
  const best = [...shops].sort((a, b) => b.d30 - a.d30)[0]

  return (
    <Layout title="Branches" shop={shop} profile={profile}>
      <Head><title>Branches · TheDashboard</title></Head>
      {g === undefined ? <p style={{ color:C.muted }}>Loading…</p> : !g ? <p style={{ color:C.coral }}>Could not load your shops.</p> : (
        <div style={{ display:'grid', gap:16 }}>
          {g.max_shops <= 1 && (
            <div style={{ ...card, background:'#FDF0D2', borderColor:'rgba(242,160,7,.4)' }}>
              <b>Branches come with Business Pack.</b> Run up to 5 shops from one account and see them all here. Talk to Serengeti Labs: +255 754 711 063.
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:12 }}>
            <Kpi l="Today · all shops" v={fmt(sum('today'))} sub={`${sum('today_n')} sales`} c={C.indigo} />
            <Kpi l="Last 7 days" v={fmt(sum('d7'))} />
            <Kpi l="Last 30 days" v={fmt(sum('d30'))} sub={best && best.d30 > 0 ? `Top: ${best.name}` : ''} />
            <Kpi l="Shops" v={`${g.count} / ${g.max_shops}`} sub={g.plan || ''} c={C.teal} />
          </div>

          <div style={{ ...card, padding:0, overflowX:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:`1px solid ${C.line}`, gap:10, flexWrap:'wrap' }}>
              <p style={{ fontWeight:700, fontSize:16 }}>Your shops</p>
              {g.is_owner && g.max_shops > 1 && (
                <button onClick={() => setAdding(true)} disabled={full} style={{ ...btn, opacity: full ? 0.5 : 1, cursor: full ? 'not-allowed' : 'pointer' }}
                  title={full ? `Your plan allows up to ${g.max_shops} shops` : ''}>+ Add branch</button>
              )}
            </div>
            {err && <p role="alert" style={{ color:C.coral, padding:'10px 18px' }}>{err}</p>}
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
              <thead><tr style={{ textAlign:'left', color:C.muted, fontSize:12 }}>
                {['Shop', 'Today', 'Last 7 days', 'Last 30 days', 'Last sale', 'Staff', ''].map((h, i) => (
                  <th key={i} style={{ padding:'10px 18px', fontWeight:600, textAlign: i > 0 && i < 4 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {shops.map(x => {
                  const share = sum('d30') ? Math.round((x.d30 / sum('d30')) * 100) : 0
                  return (
                    <tr key={x.id} style={{ borderTop:`1px solid ${C.line}`, background: x.is_current ? '#F6F7FB' : 'transparent' }}>
                      <td style={{ padding:'12px 18px' }}>
                        <b>{x.name}</b>
                        {x.is_main && <Tag c={C.indigo}>Main</Tag>}
                        {x.is_current && <Tag c={C.teal}>Open now</Tag>}
                        <div style={{ fontSize:12, color:C.muted }}>{[x.address, x.phone].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ padding:'12px 18px', textAlign:'right', ...mono, fontWeight:700, whiteSpace:'nowrap' }}>{fmt(x.today)}<div style={{ fontSize:11, color:C.muted, fontWeight:500 }}>{x.today_n} sales</div></td>
                      <td style={{ padding:'12px 18px', textAlign:'right', ...mono, whiteSpace:'nowrap' }}>{fmt(x.d7)}</td>
                      <td style={{ padding:'12px 18px', textAlign:'right', ...mono, whiteSpace:'nowrap' }}>
                        {fmt(x.d30)}
                        <div style={{ height:4, background:C.sunk, borderRadius:4, marginTop:6 }}><div style={{ width:`${share}%`, height:4, background:C.saffron, borderRadius:4 }} /></div>
                      </td>
                      <td style={{ padding:'12px 18px', color:C.muted, whiteSpace:'nowrap' }}>{ago(x.last_sale_at)}</td>
                      <td style={{ padding:'12px 18px', ...mono }}>{x.staff}</td>
                      <td style={{ padding:'12px 18px', textAlign:'right', whiteSpace:'nowrap' }}>
                        {x.is_current ? <span style={{ fontSize:13, color:C.muted }}>You are here</span>
                          : <button onClick={() => open(x.id)} disabled={!!busy} style={{ ...btnG, padding:'7px 14px', fontSize:13 }}>{busy === x.id ? 'Opening…' : 'Open'}</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize:12, color:C.muted }}>
            Each branch has its own products, stock, sales and staff. Opening a branch switches the whole app (web and phone) to that shop.
            One Business Pack payment covers all branches.
          </p>
        </div>
      )}
      {adding && <AddBranch max={g.max_shops} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
    </Layout>
  )
}

function Kpi({ l, v, sub, c }) {
  return (
    <div style={card}>
      <p style={{ fontSize:12, color:C.muted }}>{l}</p>
      <p style={{ fontSize: String(v).length > 13 ? 19 : 24, fontWeight:700, color:c || C.ink, ...mono, whiteSpace:'nowrap', marginTop:4 }}>{v}</p>
      {sub && <p style={{ fontSize:12, color:C.muted, marginTop:2 }}>{sub}</p>}
    </div>
  )
}

function Tag({ children, c }) {
  return <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:c, borderRadius:999, padding:'2px 8px', marginLeft:6, verticalAlign:'middle', whiteSpace:'nowrap', display:'inline-block' }}>{children}</span>
}

function AddBranch({ max, onClose, onDone }) {
  const [f, setF] = useState({ name:'', phone:'', address:'' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.name.trim()) return setErr('Enter the branch name')
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('td_create_branch', { p_name: f.name, p_phone: f.phone || null, p_address: f.address || null })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div role="dialog" aria-modal="true" aria-label="Add branch" onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(21,24,58,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:60 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width:'100%', maxWidth:440, padding:22 }}>
        <p style={{ fontWeight:700, fontSize:18 }}>Add branch</p>
        <p style={{ fontSize:13, color:C.muted, marginTop:4 }}>A new shop under your account (up to {max}). It starts with no products or stock; add them after opening it.</p>
        {[['name', 'Branch name *', 'e.g. G2K Mwenge'], ['address', 'Location', 'e.g. Mwenge, Dar es Salaam'], ['phone', 'Phone', 'e.g. 0712 345 678']].map(([k, l, ph]) => (
          <div key={k} style={{ marginTop:12 }}>
            <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:'block', marginBottom:4 }}>{l}</label>
            <input value={f[k]} onChange={set(k)} placeholder={ph} style={inp} autoFocus={k === 'name'} />
          </div>
        ))}
        {err && <p role="alert" style={{ color:C.coral, fontSize:13, marginTop:10 }}>{err}</p>}
        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <button onClick={save} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Adding…' : 'Add branch'}</button>
          <button onClick={onClose} style={btnG}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
