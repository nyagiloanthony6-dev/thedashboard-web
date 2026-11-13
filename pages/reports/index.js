import { useEffect, useState } from 'react'
import Head from 'next/head'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK } from '../../lib/supabase'

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Reports() {
  const [profile,setProfile]=useState(null)
  const [shop,setShop]=useState(null)
  const [sales,setSales]=useState([])
  const [expenses,setExpenses]=useState([])
  const [products,setProducts]=useState([])
  const [loading,setLoading]=useState(true)
  const [period,setPeriod]=useState('month')
  const [exporting,setExporting]=useState(null)

  useEffect(()=>{loadData()},[])

  const loadData=async()=>{
    const {data:{user}}=await supabase.auth.getUser()
    const {data:prof}=await supabase.from('app_users').select('*,shops(*)').eq('id',user.id).single()
    setProfile(prof);setShop(prof.shops)
    const shopId=prof.shops.id
    const [sr,er,pr]=await Promise.all([
      supabase.from('sales').select('*,customers(name)').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(2000),
      supabase.from('expenses').select('*').eq('shop_id',shopId).order('created_at',{ascending:false}),
      supabase.from('products').select('*').eq('shop_id',shopId).eq('is_active',true),
    ])
    setSales(sr.data||[]);setExpenses(er.data||[]);setProducts(pr.data||[]);setLoading(false)
  }

  const now=new Date()
  const filter=s=>{
    const d=new Date(s.sale_date||s.created_at)
    if(period==='today') return d.toDateString()===now.toDateString()
    if(period==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()
    if(period==='year') return d.getFullYear()===now.getFullYear()
    return true
  }
  const filtSales=sales.filter(filter)
  const filtExp=expenses.filter(e=>{
    const d=new Date(e.expense_date||e.created_at)
    if(period==='today') return d.toDateString()===now.toDateString()
    if(period==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()
    if(period==='year') return d.getFullYear()===now.getFullYear()
    return true
  })
  const rev=filtSales.reduce((a,s)=>a+(s.total||0),0)
  const profit=filtSales.reduce((a,s)=>a+(s.total_profit||0),0)
  const expAmt=filtExp.reduce((a,e)=>a+(e.amount||0),0)
  const net=profit-expAmt

  const monthlyData=MONTHS.map((m,mi)=>{
    const ms=sales.filter(s=>{const d=new Date(s.sale_date||s.created_at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===mi})
    const es=expenses.filter(e=>{const d=new Date(e.expense_date||e.created_at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===mi})
    return{month:m,revenue:ms.reduce((a,s)=>a+(s.total||0),0),profit:ms.reduce((a,s)=>a+(s.total_profit||0),0),expenses:es.reduce((a,e)=>a+(e.amount||0),0)}
  })

  const exportCSV=(rows,filename)=>{
    const keys=Object.keys(rows[0]||{})
    const csv=[keys.join(','),...rows.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n')
    const blob=new Blob([csv],{type:'text/csv'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download=filename;a.click()
    URL.revokeObjectURL(url)
  }

  const exportSales=()=>{
    setExporting('sales')
    exportCSV(filtSales.map(s=>({Date:s.sale_date||s.created_at?.split('T')[0],Customer:s.customers?.name||'Walk-in',Payment:s.payment_method,Total:s.total,Profit:s.total_profit})),`sales_${period}.csv`)
    setExporting(null)
  }
  const exportStock=()=>{
    setExporting('stock')
    exportCSV(products.map(p=>({Name:p.name,Category:p.category,'Buy Price':p.buy_price,'Sell Price':p.sell_price,'Wholesale Price':p.wholesale_price,'Retail Stock':p.retail_stock||p.stock,'Warehouse Stock':p.wholesale_stock,Type:p.product_type})),`stock.csv`)
    setExporting(null)
  }
  const exportExpenses=()=>{
    setExporting('expenses')
    exportCSV(filtExp.map(e=>({Date:e.expense_date,Category:e.category,Description:e.description,Amount:e.amount,Type:e.expense_type})),`expenses_${period}.csv`)
    setExporting(null)
  }

  const card={background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:12,padding:16}

  return(
    <>
      <Head><title>Reports — TheDashboard</title></Head>
      <Layout title="Reports & Export" shop={shop} profile={profile}>
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[{k:'today',l:'Today'},{k:'month',l:'This Month'},{k:'year',l:'This Year'},{k:'all',l:'All Time'}].map(p=>(
            <button key={p.k} onClick={()=>setPeriod(p.k)} style={{padding:'8px 16px',borderRadius:8,border:'1px solid',borderColor:period===p.k?'#2D2F8F':'#DCDFEC',background:period===p.k?'rgba(45,47,143,0.15)':'transparent',color:period===p.k?'#2D2F8F':'#5B607E',fontSize:13,fontWeight:period===p.k?700:400}}>{p.l}</button>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
          {[{l:'Revenue',v:fmtK(rev),c:'#2D2F8F'},{l:'Gross Profit',v:fmtK(profit),c:'#2D2F8F'},{l:'Expenses',v:fmtK(expAmt),c:'#B93A16'},{l:'Net Profit',v:fmtK(net),c:net>=0?'#0B7A6C':'#B93A16'}].map(k=>(
            <div key={k.l} style={card}><p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8}}>{k.l.toUpperCase()}</p><p style={{fontSize:20,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p></div>
          ))}
        </div>
        <div style={{...card,marginBottom:24}}>
          <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:16}}>MONTHLY BREAKDOWN — {now.getFullYear()}</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCDFEC" vertical={false}/>
              <XAxis dataKey="month" tick={{fill:'#5B607E',fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'#5B607E',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v).replace('TZS ','')}/>
              <Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:8}} formatter={v=>[fmtK(v)]}/>
              <Bar dataKey="revenue" fill="#2D2F8F" radius={[4,4,0,0]} name="Revenue"/>
              <Bar dataKey="profit" fill="#2D2F8F" radius={[4,4,0,0]} name="Profit"/>
              <Bar dataKey="expenses" fill="#B93A16" radius={[4,4,0,0]} name="Expenses"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <h2 style={{fontSize:11,color:'#5B607E',letterSpacing:0.8,marginBottom:12}}>EXPORT DATA (CSV)</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12,marginBottom:24}}>
          {[
            {label:'Sales Report',desc:`${filtSales.length} sales`,icon:'💰',fn:exportSales,key:'sales'},
            {label:'Stock List',desc:`${products.length} products`,icon:'📦',fn:exportStock,key:'stock'},
            {label:'Expenses',desc:`${filtExp.length} records`,icon:'💸',fn:exportExpenses,key:'expenses'},
          ].map(e=>(
            <div key={e.key} style={card}>
              <span style={{fontSize:24}}>{e.icon}</span>
              <p style={{fontSize:14,fontWeight:700,marginTop:8,marginBottom:4}}>{e.label}</p>
              <p style={{fontSize:11,color:'#5B607E',marginBottom:12}}>{e.desc}</p>
              <button onClick={e.fn} disabled={exporting===e.key} style={{width:'100%',padding:'9px',borderRadius:8,background:'rgba(45,47,143,0.15)',border:'1px solid rgba(45,47,143,0.3)',color:'#2D2F8F',fontSize:12,fontWeight:700}}>
                {exporting===e.key?'Exporting...':'⬇️ Export CSV'}
              </button>
            </div>
          ))}
        </div>
        <div style={{background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #DCDFEC'}}>
            <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8}}>RECENT SALES — {period.toUpperCase()}</p>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #DCDFEC'}}>
                {['Date','Customer','Payment','Total','Profit'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,color:'#5B607E',letterSpacing:0.5,fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtSales.slice(0,50).map((s,i)=>(
                <tr key={s.id} style={{borderBottom:i<Math.min(filtSales.length,50)-1?'1px solid #DCDFEC':'none'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(21,24,58,0.02)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'10px 16px',fontSize:12,color:'#5B607E'}}>{s.sale_date||s.created_at?.split('T')[0]}</td>
                  <td style={{padding:'10px 16px',fontSize:13,fontWeight:600}}>{s.customers?.name||'Walk-in'}</td>
                  <td style={{padding:'10px 16px'}}><span style={{background:'rgba(45,47,143,0.1)',color:'#2D2F8F',border:'1px solid rgba(45,47,143,0.2)',borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700}}>{s.payment_method?.toUpperCase()}</span></td>
                  <td style={{padding:'10px 16px',fontSize:13,fontWeight:700,color:'#2D2F8F'}}>{fmtK(s.total)}</td>
                  <td style={{padding:'10px 16px',fontSize:13,fontWeight:600,color:'#2D2F8F'}}>+{fmtK(s.total_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Layout>
    </>
  )
}
