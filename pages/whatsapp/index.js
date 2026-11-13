import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt } from '../../lib/supabase'

const TEMPLATES = [
  { key:'new_arrivals', label:'New Arrivals', emoji:'🆕', color:'#2D2F8F', body:'Hi {{name}}! 👋\n\nGood news from {{shop}}! New items just arrived:\n\n{{products}}\n\nCome visit us today! 🛍️' },
  { key:'promotion', label:'Promotion', emoji:'🎉', color:'#9A5B00', body:'Hi {{name}}! 🎉\n\n{{shop}} has a special offer just for you!\n\nGet {{discount}}% OFF on selected items today only! ⏰' },
  { key:'reactivation', label:'We Miss You', emoji:'💚', color:'#2D2F8F', body:'Hi {{name}}! 💚\n\nWe miss you at {{shop}}!\n\nIt\'s been {{days}} days since your last visit. Come back - we have a surprise for you! 🎁' },
  { key:'thank_you', label:'Thank You', emoji:'🙏', color:'#0F7375', body:'Hi {{name}}! 🙏\n\nThank you for being a loyal customer at {{shop}}!\n\nYou\'ve visited us {{visits}} times and we truly appreciate you! ❤️' },
  { key:'custom', label:'Custom Message', emoji:'✏️', color:'#888888', body:'Hi {{name}}! 👋\n\nMessage from {{shop}}:\n\n' },
]

const SEGMENTS = [
  { key:'all', label:'All Customers', emoji:'👥', color:'#2D2F8F', desc:'Everyone with a phone number' },
  { key:'active', label:'Active', emoji:'🟢', color:'#0B7A6C', desc:'Bought in the last 30 days' },
  { key:'dormant', label:'Dormant', emoji:'🔴', color:'#B93A16', desc:'No purchase in 30+ days' },
  { key:'new', label:'New Customers', emoji:'🔵', color:'#2D2F8F', desc:'Only 1 purchase so far' },
  { key:'repeated', label:'Loyal Customers', emoji:'🟡', color:'#9A5B00', desc:'3 or more purchases' },
]

export default function WhatsApp() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('home') // home | compose | sending | done
  const [seg, setSeg] = useState('all')
  const [tpl, setTpl] = useState(TEMPLATES[0])
  const [msg, setMsg] = useState(TEMPLATES[0].body)
  const [campName, setCampName] = useState('')
  const [discount, setDiscount] = useState('10')
  const [saving, setSaving] = useState(false)
  const [targets, setTargets] = useState([])
  const [idx, setIdx] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [currentCamp, setCurrentCamp] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    setProfile(prof); setShop(prof.shops)
    const shopId = prof.shops.id
    const [cr, pr, campr] = await Promise.all([
      supabase.from('customers').select('*,sales(id,created_at)').eq('shop_id', shopId),
      supabase.from('products').select('name,image_emoji,sell_price').eq('shop_id', shopId).eq('is_active', true).limit(5),
      supabase.from('campaigns').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(20),
    ])
    setCustomers(cr.data || [])
    setProducts(pr.data || [])
    setCampaigns(campr.data || [])
    setLoading(false)
  }

  const getSegment = (key) => {
    const cut = Date.now() - 30 * 86400000
    return customers.filter(c => {
      if (!c.phone) return false
      const all = c.sales || []
      const recent = all.filter(s => new Date(s.created_at) >= cut)
      if (key === 'all') return true
      if (key === 'active') return recent.length > 0
      if (key === 'dormant') return recent.length === 0 && all.length > 0
      if (key === 'new') return all.length === 1
      if (key === 'repeated') return all.length >= 3
      return true
    })
  }

  const personalize = (text, c) => {
    const sorted = [...(c.sales || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const days = sorted[0] ? Math.floor((Date.now() - new Date(sorted[0].created_at)) / 86400000) : 0
    const list = products.slice(0, 3).map(p => `• ${p.image_emoji || ''} ${p.name} - ${fmt(p.sell_price)}`).join('\n')
    return text
      .replace(/{{name}}/g, c.name || 'Valued Customer')
      .replace(/{{shop}}/g, shop?.name || 'Our Shop')
      .replace(/{{days}}/g, String(days))
      .replace(/{{visits}}/g, String(c.visit_count || 0))
      .replace(/{{amount}}/g, fmt(c.total_spent || 0))
      .replace(/{{products}}/g, list)
      .replace(/{{discount}}/g, discount || '10')
  }

  const openWA = (c, text) => {
    const raw = (c.phone || '').replace(/[^0-9]/g, '')
    const ph = raw.startsWith('0') ? '255' + raw.slice(1) : raw.startsWith('255') ? raw : '255' + raw
    const url = 'https://wa.me/' + ph + '?text=' + encodeURIComponent(text)
    window.open(url, '_blank')
  }

  const startCampaign = async () => {
    const list = getSegment(seg)
    if (!list.length) { alert('No customers with phone numbers in this segment'); return }
    if (!campName.trim()) { alert('Enter a campaign name'); return }
    setSaving(true)
    const { data: camp } = await supabase.from('campaigns').insert({
      shop_id: shop.id, name: campName, message: msg, channel: 'whatsapp',
      segment: seg, status: 'sending', total_recipients: list.length, campaign_type: tpl.key,
    }).select().single()
    if (camp) { setCampaigns(p => [camp, ...p]); setCurrentCamp(camp) }
    setSaving(false)
    setTargets(list); setIdx(0); setSentCount(0); setView('sending')
  }

  const markSent = async () => {
    openWA(targets[idx], personalize(msg, targets[idx]))
    const next = idx + 1
    setSentCount(p => p + 1)
    if (next >= targets.length) {
      if (currentCamp) {
        await supabase.from('campaigns').update({ status: 'sent', sent_count: targets.length, sent_at: new Date().toISOString() }).eq('id', currentCamp.id)
        setCampaigns(p => p.map(c => c.id === currentCamp.id ? { ...c, status: 'sent', sent_count: targets.length } : c))
      }
      setView('done')
    } else setIdx(next)
  }

  const segList = getSegment(seg)
  const previewCustomer = segList[0]
  const previewText = previewCustomer ? personalize(msg, previewCustomer) : msg

  const C = {
    card: { background: '#FFFFFF', border: '1px solid #DCDFEC', borderRadius: 12, padding: 16 },
    input: { background: '#F6F7FB', border: '1.5px solid #DCDFEC', borderRadius: 8, color: '#15183A', padding: '9px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
    label: { fontSize: 10, color: '#5B607E', letterSpacing: 0.8, display: 'block', marginBottom: 6 },
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F6F7FB' }}><div style={{ width:36, height:36, border:'3px solid #DCDFEC', borderTopColor:'#0B7A6C', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>WhatsApp Campaigns — TheDashboard</title></Head>
      <Layout title="WhatsApp Campaigns" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} textarea{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:9px 12px;font-size:13px;width:100%;outline:none;font-family:inherit;resize:vertical} input::placeholder,textarea::placeholder{color:#8A8FAE}`}</style>

        {/* SENDING VIEW */}
        {view === 'sending' && targets[idx] && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={C.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>Sending Campaign</h2>
                <span style={{ fontSize: 13, color: '#5B607E' }}>{idx + 1} / {targets.length}</span>
              </div>
              <div style={{ height: 6, background: '#DCDFEC', borderRadius: 3, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: Math.round((idx / targets.length) * 100) + '%', background: '#0B7A6C', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <div style={{ background: '#F6F7FB', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, background: '#25d36620', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#0B7A6C' }}>{targets[idx].name.charAt(0)}</div>
                  <div>
                    <p style={{ fontWeight: 700 }}>{targets[idx].name}</p>
                    <p style={{ fontSize: 12, color: '#5B607E' }}>{targets[idx].phone}</p>
                  </div>
                </div>
                <div style={{ background: '#25d36615', border: '1px solid #25d36630', borderRadius: 10, padding: 14 }}>
                  <pre style={{ fontSize: 13, lineHeight: 1.6, color: '#15183A', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                    {personalize(msg, targets[idx])}
                  </pre>
                </div>
              </div>
              <button onClick={markSent} style={{ width: '100%', padding: '14px', borderRadius: 10, background: '#0B7A6C', color: '#FFFFFF', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>
                💬 Open WhatsApp & Mark Sent →
              </button>
              <button onClick={() => { setView('home'); setTargets([]); setIdx(0) }} style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'transparent', border: '1px solid #DCDFEC', color: '#5B607E', fontSize: 12, cursor: 'pointer', marginTop: 8 }}>Cancel Campaign</button>
            </div>
          </div>
        )}

        {/* DONE VIEW */}
        {view === 'done' && (
          <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
            <div style={C.card}>
              <p style={{ fontSize: 48, marginBottom: 16 }}>🎉</p>
              <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Campaign Complete!</h2>
              <p style={{ color: '#5B607E', fontSize: 14, marginBottom: 24 }}>WhatsApp messages sent to {sentCount} customers</p>
              <button onClick={() => { setView('home'); setCampName(''); setIdx(0); setSentCount(0) }} style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#0B7A6C', color: '#FFFFFF', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>Back to Campaigns</button>
            </div>
          </div>
        )}

        {/* HOME VIEW */}
        {view === 'home' && (
          <div>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
              {[
                { l: 'Total Customers', v: customers.length, c: '#2D2F8F' },
                { l: 'With Phone', v: customers.filter(c => c.phone).length, c: '#0B7A6C' },
                { l: 'Campaigns Sent', v: campaigns.filter(c => c.status === 'sent').length, c: '#0F7375' },
                { l: 'Total Reached', v: campaigns.reduce((a, c) => a + (c.sent_count || 0), 0), c: '#9A5B00' },
              ].map(k => (
                <div key={k.l} style={C.card}>
                  <p style={{ fontSize: 10, color: '#5B607E', letterSpacing: 0.8 }}>{k.l.toUpperCase()}</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: k.c, marginTop: 6 }}>{k.v}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
              {/* Compose */}
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#5B607E', letterSpacing: 0.8, marginBottom: 14 }}>NEW CAMPAIGN</h2>

                {/* Campaign name */}
                <div style={{ ...C.card, marginBottom: 12 }}>
                  <label style={C.label}>CAMPAIGN NAME</label>
                  <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. August Promotions" style={C.input} />
                </div>

                {/* Template */}
                <div style={{ ...C.card, marginBottom: 12 }}>
                  <label style={C.label}>MESSAGE TEMPLATE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, marginBottom: 14 }}>
                    {TEMPLATES.map(t => (
                      <button key={t.key} onClick={() => { setTpl(t); setMsg(t.body) }} style={{ padding: '10px', borderRadius: 10, border: `1px solid ${tpl.key === t.key ? t.color : '#DCDFEC'}`, background: tpl.key === t.key ? t.color + '18' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <p style={{ fontSize: 18, marginBottom: 4 }}>{t.emoji}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: tpl.key === t.key ? t.color : '#15183A' }}>{t.label}</p>
                      </button>
                    ))}
                  </div>
                  <label style={C.label}>MESSAGE (edit freely)</label>
                  <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={8} />
                  {tpl.key === 'promotion' && (
                    <div style={{ marginTop: 8 }}>
                      <label style={C.label}>DISCOUNT %</label>
                      <input value={discount} onChange={e => setDiscount(e.target.value)} type="number" placeholder="10" style={{ ...C.input, width: 100 }} />
                    </div>
                  )}
                  <p style={{ fontSize: 10, color: '#8A8FAE', marginTop: 8 }}>Variables: {'{{name}}'} {'{{shop}}'} {'{{days}}'} {'{{visits}}'} {'{{products}}'} {'{{discount}}'}</p>
                </div>

                {/* Segment */}
                <div style={{ ...C.card, marginBottom: 14 }}>
                  <label style={C.label}>TARGET AUDIENCE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {SEGMENTS.map(s => (
                      <button key={s.key} onClick={() => setSeg(s.key)} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${seg === s.key ? s.color : '#DCDFEC'}`, background: seg === s.key ? s.color + '15' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: seg === s.key ? s.color : '#15183A' }}>{s.emoji} {s.label}</p>
                        <p style={{ fontSize: 11, color: '#5B607E', marginTop: 2 }}>{s.desc}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: s.color, marginTop: 4 }}>{getSegment(s.key).length} customers</p>
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={startCampaign} disabled={saving || !campName || !segList.length} style={{ width: '100%', padding: '14px', borderRadius: 10, background: !campName || !segList.length ? '#DCDFEC' : '#0B7A6C', color: !campName || !segList.length ? '#8A8FAE' : '#FFFFFF', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}>
                  {saving ? 'Setting up...' : `💬 Send to ${segList.length} Customers via WhatsApp`}
                </button>
              </div>

              {/* Right: Preview + History */}
              <div>
                {/* Preview */}
                <div style={{ ...C.card, marginBottom: 12 }}>
                  <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 10 }}>MESSAGE PREVIEW</p>
                  {previewCustomer ? (
                    <div style={{ background: '#F6F7FB', borderRadius: 10, padding: 14 }}>
                      <p style={{ fontSize: 10, color: '#5B607E', marginBottom: 8 }}>For: {previewCustomer.name}</p>
                      <div style={{ background: '#25d36615', border: '1px solid #25d36630', borderRadius: 10, padding: 12 }}>
                        <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#15183A', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{previewText}</pre>
                      </div>
                    </div>
                  ) : <p style={{ color: '#8A8FAE', fontSize: 13 }}>No customers in this segment with phone numbers</p>}
                </div>

                {/* Campaign history */}
                <div style={C.card}>
                  <p style={{ fontSize: 11, color: '#5B607E', letterSpacing: 0.8, marginBottom: 12 }}>CAMPAIGN HISTORY</p>
                  {campaigns.slice(0, 8).map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #DCDFEC' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</p>
                        <p style={{ fontSize: 10, color: '#5B607E', marginTop: 1 }}>{c.segment} · {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: c.status === 'sent' ? 'rgba(11,122,108,0.15)' : 'rgba(242,160,7,0.15)', color: c.status === 'sent' ? '#0B7A6C' : '#9A5B00', border: `1px solid ${c.status === 'sent' ? 'rgba(11,122,108,0.3)' : 'rgba(242,160,7,0.3)'}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{c.status?.toUpperCase()}</span>
                        {c.sent_count > 0 && <p style={{ fontSize: 10, color: '#5B607E', marginTop: 3 }}>{c.sent_count} sent</p>}
                      </div>
                    </div>
                  ))}
                  {!campaigns.length && <p style={{ color: '#8A8FAE', fontSize: 13 }}>No campaigns yet</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  )
}
