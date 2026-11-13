import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK } from '../../lib/supabase'

export default function MonthlyReport() {
  const [profile, setProfile] = useState(null)
  const [shop, setShop] = useState(null)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()) // 0-indexed
  const [viewMode, setViewMode] = useState('daily') // daily | monthly

  useEffect(() => { loadData() }, [])
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('app_users').select('*,shops(*)').eq('id', user.id).single()
    let shopData = prof?.shops
    if (!shopData) {
      const { data: owned } = await supabase.from('shop_owners').select('shops(*)').eq('user_id', user.id).limit(1)
      shopData = owned?.[0]?.shops
    }
    setProfile(prof); setShop(shopData)
    const { data } = await supabase.from('sales').select('id,total,total_profit,payment_method,sale_date,created_at,cash_paid,loan_balance').eq('shop_id', shopData.id).order('sale_date', { ascending: true })
    setSales(data || [])
    setLoading(false)
  }

  const getDate = s => s.sale_date || s.created_at?.split('T')[0]

  // Daily breakdown for selected month
  const dailyData = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const daySales = sales.filter(s => getDate(s) === dateStr)
      days.push({
        day: d, date: dateStr,
        count: daySales.length,
        total: daySales.reduce((a,s) => a+(Number(s.total)||0), 0),
        profit: daySales.reduce((a,s) => a+(Number(s.total_profit)||0), 0),
        cash: daySales.filter(s => s.payment_method==='cash'||s.payment_method==='split').reduce((a,s) => a+(s.payment_method==='split'?(Number(s.cash_paid)||0):(Number(s.total)||0)), 0),
        mpesa: daySales.filter(s => ['mpesa','tigo','airtel'].includes(s.payment_method)).reduce((a,s) => a+(Number(s.total)||0), 0),
        loan: daySales.filter(s => s.payment_method==='loan').reduce((a,s) => a+(Number(s.total)||0), 0) + daySales.filter(s => s.payment_method==='split').reduce((a,s) => a+(Number(s.loan_balance)||0), 0),
        hasSales: daySales.length > 0,
      })
    }
    return days
  }

  // Monthly breakdown for selected year
  const monthlyData = () => {
    return MONTHS.map((m, mi) => {
      const monthSales = sales.filter(s => {
        const d = getDate(s)
        return d && parseInt(d.split('-')[0]) === year && parseInt(d.split('-')[1])-1 === mi
      })
      return {
        month: m, monthIndex: mi,
        count: monthSales.length,
        total: monthSales.reduce((a,s) => a+(Number(s.total)||0), 0),
        profit: monthSales.reduce((a,s) => a+(Number(s.total_profit)||0), 0),
        hasSales: monthSales.length > 0,
      }
    })
  }

  const daily = dailyData()
  const monthly = monthlyData()
  const monthTotal = daily.reduce((a,d) => a+d.total, 0)
  const monthProfit = daily.reduce((a,d) => a+d.profit, 0)
  const monthCount = daily.reduce((a,d) => a+d.count, 0)
  const yearTotal = monthly.reduce((a,m) => a+m.total, 0)
  const maxDayTotal = Math.max(...daily.map(d => d.total), 1)
  const maxMonthTotal = Math.max(...monthly.map(m => m.total), 1)

  const C = {
    card: { background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, padding:16 },
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F6F7FB' }}><div style={{ width:36, height:36, border:'3px solid #DCDFEC', borderTopColor:'#2D2F8F', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  return (
    <>
      <Head><title>Monthly Sales — TheDashboard</title></Head>
      <Layout title="Monthly Sales Summary" shop={shop} profile={profile}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} select{background:#F6F7FB;border:1.5px solid #DCDFEC;border-radius:8px;color:#15183A;padding:8px 12px;font-size:13px;outline:none;font-family:inherit}`}</style>

        {/* Controls */}
        <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {viewMode === 'daily' && (
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTH_NAMES.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
          <div style={{ display:'flex', gap:6 }}>
            {[['daily','📅 Daily'],['monthly','📊 Monthly']].map(([k,l]) => (
              <button key={k} onClick={() => setViewMode(k)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid', borderColor:viewMode===k?'#2D2F8F':'#DCDFEC', background:viewMode===k?'rgba(45,47,143,0.15)':'transparent', color:viewMode===k?'#2D2F8F':'#5B607E', fontWeight:viewMode===k?700:400, fontSize:13, cursor:'pointer' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* DAILY VIEW */}
        {viewMode === 'daily' && (
          <>
            {/* Summary cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
              {[
                { l:`${MONTH_NAMES[month]} Revenue`, v:fmtK(monthTotal), c:'#2D2F8F' },
                { l:'Profit', v:fmtK(monthProfit), c:'#0B7A6C' },
                { l:'Transactions', v:monthCount, c:'#0F7375' },
                { l:'Active Days', v:daily.filter(d=>d.hasSales).length, c:'#9A5B00' },
              ].map(k => (
                <div key={k.l} style={C.card}>
                  <p style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8 }}>{k.l.toUpperCase()}</p>
                  <p style={{ fontSize:20, fontWeight:900, color:k.c, marginTop:6 }}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div style={{ ...C.card, marginBottom:16 }}>
              <p style={{ fontSize:11, color:'#5B607E', letterSpacing:0.8, marginBottom:14 }}>DAILY SALES — {MONTH_NAMES[month].toUpperCase()} {year}</p>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:120, paddingBottom:20, position:'relative', borderBottom:'1px solid #DCDFEC' }}>
                {daily.map(d => (
                  <div key={d.day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                    <div title={`Day ${d.day}: ${fmt(d.total)}`} style={{ width:'100%', background:d.hasSales?'#2D2F8F':'#DCDFEC', height:Math.max(2, (d.total/maxDayTotal)*100) + 'px', borderRadius:'3px 3px 0 0', transition:'height 0.3s', cursor:'pointer' }}
                      onMouseEnter={e => e.target.style.background = d.hasSales ? '#2D2F8F' : '#DCDFEC'}
                      onMouseLeave={e => e.target.style.background = d.hasSales ? '#2D2F8F' : '#DCDFEC'}/>
                    <span style={{ fontSize:8, color:'#8A8FAE' }}>{d.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily table */}
            <div style={{ background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #DCDFEC' }}>
                    {['Date','Sales','Revenue','Profit','Cash','M-Pesa/Mobile','Loan'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, color:'#5B607E', letterSpacing:0.8, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.filter(d => d.hasSales).map((d, i) => (
                    <tr key={d.day} style={{ borderBottom:'1px solid #DCDFEC' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,24,58,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600 }}>
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:'#5B607E' }}>{d.count}</td>
                      <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color:'#2D2F8F' }}>{fmtK(d.total)}</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:'#0B7A6C' }}>{fmtK(d.profit)}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#5B607E' }}>{d.cash > 0 ? fmtK(d.cash) : '—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#5B607E' }}>{d.mpesa > 0 ? fmtK(d.mpesa) : '—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color: d.loan > 0 ? '#9A5B00' : '#5B607E' }}>{d.loan > 0 ? fmtK(d.loan) : '—'}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ background:'rgba(45,47,143,0.08)', borderTop:'2px solid #DCDFEC' }}>
                    <td style={{ padding:'12px 14px', fontWeight:800, fontSize:13 }}>TOTAL</td>
                    <td style={{ padding:'12px 14px', fontWeight:700, fontSize:13 }}>{monthCount}</td>
                    <td style={{ padding:'12px 14px', fontWeight:900, fontSize:14, color:'#2D2F8F' }}>{fmtK(monthTotal)}</td>
                    <td style={{ padding:'12px 14px', fontWeight:800, fontSize:13, color:'#0B7A6C' }}>{fmtK(monthProfit)}</td>
                    <td style={{ padding:'12px 14px', fontWeight:700, fontSize:13 }}>{fmtK(daily.reduce((a,d)=>a+d.cash,0))}</td>
                    <td style={{ padding:'12px 14px', fontWeight:700, fontSize:13 }}>{fmtK(daily.reduce((a,d)=>a+d.mpesa,0))}</td>
                    <td style={{ padding:'12px 14px', fontWeight:700, fontSize:13, color:'#9A5B00' }}>{fmtK(daily.reduce((a,d)=>a+d.loan,0))}</td>
                  </tr>
                  {!daily.some(d=>d.hasSales) && (
                    <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#8A8FAE' }}>No sales in {MONTH_NAMES[month]} {year}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* MONTHLY VIEW */}
        {viewMode === 'monthly' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
              {[
                { l:`${year} Revenue`, v:fmtK(yearTotal), c:'#2D2F8F' },
                { l:'Profit', v:fmtK(monthly.reduce((a,m)=>a+m.profit,0)), c:'#0B7A6C' },
                { l:'Transactions', v:monthly.reduce((a,m)=>a+m.count,0), c:'#0F7375' },
                { l:'Active Months', v:monthly.filter(m=>m.hasSales).length, c:'#9A5B00' },
              ].map(k => (
                <div key={k.l} style={C.card}>
                  <p style={{ fontSize:10, color:'#5B607E', letterSpacing:0.8 }}>{k.l.toUpperCase()}</p>
                  <p style={{ fontSize:20, fontWeight:900, color:k.c, marginTop:6 }}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Monthly bar chart */}
            <div style={{ ...C.card, marginBottom:16 }}>
              <p style={{ fontSize:11, color:'#5B607E', letterSpacing:0.8, marginBottom:14 }}>MONTHLY SALES — {year}</p>
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:140, paddingBottom:24, borderBottom:'1px solid #DCDFEC' }}>
                {monthly.map((m,i) => (
                  <div key={m.month} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div title={`${m.month}: ${fmt(m.total)}`} style={{ width:'100%', background:m.hasSales?'#2D2F8F':'#DCDFEC', height:Math.max(2,(m.total/maxMonthTotal)*120)+'px', borderRadius:'4px 4px 0 0', cursor:'pointer', transition:'height 0.3s' }}
                      onMouseEnter={e=>e.target.style.background=m.hasSales?'#2D2F8F':'#DCDFEC'}
                      onMouseLeave={e=>e.target.style.background=m.hasSales?'#2D2F8F':'#DCDFEC'}
                      onClick={()=>{setMonth(i);setViewMode('daily')}}/>
                    <span style={{ fontSize:9, color:'#5B607E' }}>{m.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly table */}
            <div style={{ background:'#FFFFFF', border:'1px solid #DCDFEC', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #DCDFEC' }}>
                    {['Month','Sales','Revenue','Profit','Avg/Day',''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, color:'#5B607E', letterSpacing:0.8, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m, i) => (
                    <tr key={m.month} style={{ borderBottom:'1px solid #DCDFEC', opacity:m.hasSales?1:0.4 }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(21,24,58,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'11px 14px', fontSize:13, fontWeight:700 }}>{MONTH_NAMES[i]} {year}</td>
                      <td style={{ padding:'11px 14px', fontSize:13, color:'#5B607E' }}>{m.count}</td>
                      <td style={{ padding:'11px 14px', fontSize:13, fontWeight:700, color:'#2D2F8F' }}>{fmtK(m.total)}</td>
                      <td style={{ padding:'11px 14px', fontSize:13, color:'#0B7A6C' }}>{fmtK(m.profit)}</td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'#5B607E' }}>{m.count>0?fmtK(m.total/new Date(year,i+1,0).getDate()):'—'}</td>
                      <td style={{ padding:'11px 14px' }}>
                        {m.hasSales && <button onClick={()=>{setMonth(i);setViewMode('daily')}} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #2196F330', background:'rgba(45,47,143,0.1)', color:'#2D2F8F', fontSize:11, fontWeight:600, cursor:'pointer' }}>Daily →</button>}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background:'rgba(45,47,143,0.08)', borderTop:'2px solid #DCDFEC' }}>
                    <td style={{ padding:'12px 14px', fontWeight:800 }}>TOTAL {year}</td>
                    <td style={{ padding:'12px 14px', fontWeight:700 }}>{monthly.reduce((a,m)=>a+m.count,0)}</td>
                    <td style={{ padding:'12px 14px', fontWeight:900, color:'#2D2F8F', fontSize:14 }}>{fmtK(yearTotal)}</td>
                    <td style={{ padding:'12px 14px', fontWeight:800, color:'#0B7A6C' }}>{fmtK(monthly.reduce((a,m)=>a+m.profit,0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Layout>
    </>
  )
}
