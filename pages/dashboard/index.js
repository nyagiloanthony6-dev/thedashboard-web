import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Layout from '../../components/Layout'
import { supabase, fmt, fmtK } from '../../lib/supabase'
import { usePartNumbers } from '../../lib/store'

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Dashboard() {
  const router = useRouter()
  const [profile,setProfile]=useState(null)
  const [shop,setShop]=useState(null)
  const [sales,setSales]=useState([])
  const [expenses,setExpenses]=useState([])
  const [products,setProducts]=useState([])
  const [loading,setLoading]=useState(true)

  const parts=usePartNumbers(shop?.id)
  useEffect(()=>{loadData()},[])

  const loadData = async () => {
    const {data:{user}}=await supabase.auth.getUser()
    if(!user){router.push('/auth/login');return}
    const {data:prof}=await supabase.from('app_users').select('*,shops(*)').eq('id',user.id).single()
    if(!prof){router.push('/auth/login');return}
    setProfile(prof)
    let shopData=prof.shops
    if(!shopData){
      const {data:owned}=await supabase.from('shop_owners').select('shops(*)').eq('user_id',user.id).limit(1)
      shopData=owned?.[0]?.shops
    }
    if(!shopData){router.push('/auth/login');return}
    setShop(shopData)
    const shopId=shopData.id
    const [sr,er,pr]=await Promise.all([
      supabase.from('sales').select('*,customers(name)').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(500),
      supabase.from('expenses').select('*').eq('shop_id',shopId).limit(200),
      supabase.from('products').select('*').eq('shop_id',shopId).eq('is_active',true),
    ])
    setSales(sr.data||[]);setExpenses(er.data||[]);setProducts(pr.data||[])
    setLoading(false)
  }

  if(loading) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F6F7FB'}}>
      <div style={{width:36,height:36,border:'3px solid #DCDFEC',borderTopColor:'#2D2F8F',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    </div>
  )

  const now=new Date()
  const mStart=new Date(now.getFullYear(),now.getMonth(),1)
  const mSales=sales.filter(s=>new Date(s.sale_date||s.created_at)>=mStart)
  const mExp=expenses.filter(e=>new Date(e.expense_date||e.created_at)>=mStart)
  const totRev=sales.reduce((a,s)=>a+(s.total||0),0)
  const totProfit=sales.reduce((a,s)=>a+(s.total_profit||0),0)
  const mRev=mSales.reduce((a,s)=>a+(s.total||0),0)
  const mGross=mSales.reduce((a,s)=>a+(s.total_profit||0),0)
  const mExpAmt=mExp.reduce((a,e)=>a+(e.amount||0),0)
  const netProfit=mGross-mExpAmt
  // Check the stock the item is actually sold from: wholesale items count boxes, others count pieces
  const mode=['retail','wholesale'].includes(shop?.sale_mode)?shop.sale_mode:'both'
  const lowKind=p=>mode!=='both'?mode:(p.product_type==='wholesale'?'wholesale':'retail')
  const lowQty=p=>lowKind(p)==='wholesale'?(p.wholesale_stock||0):(p.retail_stock||p.stock||0)
  const lowStock=products.filter(p=>lowQty(p)<(p.low_stock_alert||10)).sort((a,b)=>lowQty(a)-lowQty(b))

  const chartData=MONTHS.map((m,mi)=>{
    const ms=sales.filter(s=>{const d=new Date(s.sale_date||s.created_at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===mi})
    return{month:m,revenue:ms.reduce((a,s)=>a+(s.total||0),0),profit:ms.reduce((a,s)=>a+(s.total_profit||0),0)}
  })

  const card={background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:12,padding:16}
  const kpis=[
    {l:'Total Revenue',v:fmtK(totRev),c:'#2D2F8F',sub:sales.length+' sales'},
    {l:'Total Profit',v:fmtK(totProfit),c:'#2D2F8F',sub:totRev>0?Math.round(totProfit/totRev*100)+'% margin':'—'},
    {l:'This Month',v:fmtK(mRev),c:'#9A5B00',sub:mSales.length+' sales'},
    {l:'Net Profit (Mo.)',v:fmtK(netProfit),c:netProfit>=0?'#0B7A6C':'#B93A16',sub:'After expenses'},
    {l:'Products',v:products.length,c:'#0F7375',sub:lowStock.length+' low stock'},
  ]

  return(
    <>
      <Head><title>Dashboard — TheDashboard</title></Head>
      <Layout title="Dashboard" shop={shop} profile={profile}>
        {shop?.subscription==='trial'&&(
          <div style={{background:'rgba(242,160,7,0.08)',border:'1px solid rgba(242,160,7,0.2)',borderRadius:10,padding:'12px 20px',marginBottom:24,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:'#9A5B00',fontSize:13,fontWeight:600}}>⚠️ Free trial — {Math.max(0,Math.ceil((new Date(shop.sub_expires_at)-now)/86400000))} days remaining</span>
            <a href="https://wa.me/255741300354" target="_blank" rel="noreferrer" style={{background:'#0B7A6C',color:'#FFFFFF',fontWeight:700,fontSize:12,padding:'6px 14px',borderRadius:6,textDecoration:'none'}}>Upgrade via WhatsApp</a>
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:12,marginBottom:24}}>
          {kpis.map(k=>(
            <div key={k.l} style={card}>
              <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:8}}>{k.l.toUpperCase()}</p>
              <p style={{fontSize:20,fontWeight:900,color:k.c,letterSpacing:-0.5}}>{k.v}</p>
              <p style={{fontSize:11,color:'#8A8FAE',marginTop:4}}>{k.sub}</p>
            </div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:24}}>
          <div style={card}>
            <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:16}}>REVENUE & PROFIT — {now.getFullYear()}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDFEC" vertical={false}/>
                <XAxis dataKey="month" tick={{fill:'#5B607E',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#5B607E',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v).replace('TZS ','')}/>
                <Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid #DCDFEC',borderRadius:8}} formatter={v=>[fmtK(v)]}/>
                <Bar dataKey="revenue" fill="#2D2F8F" radius={[4,4,0,0]} name="Revenue"/>
                <Bar dataKey="profit" fill="#2D2F8F" radius={[4,4,0,0]} name="Profit"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={card}>
            <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:14}}>THIS MONTH</p>
            {[{l:'Revenue',v:mRev,c:'#2D2F8F'},{l:'Gross Profit',v:mGross,c:'#2D2F8F'},{l:'Expenses',v:-mExpAmt,c:'#B93A16'}].map(r=>(
              <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #DCDFEC'}}>
                <span style={{fontSize:13,color:'#5B607E'}}>{r.l}</span>
                <span style={{fontSize:13,fontWeight:700,color:r.c}}>{r.v<0?'-':''}{fmtK(Math.abs(r.v))}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0'}}>
              <span style={{fontSize:14,fontWeight:700}}>Net Profit</span>
              <span style={{fontSize:16,fontWeight:900,color:netProfit>=0?'#0B7A6C':'#B93A16'}}>{netProfit<0?'-':''}{fmtK(Math.abs(netProfit))}</span>
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {lowStock.length>0&&(
            <div style={{...card,borderColor:'rgba(185,58,22,0.3)'}}>
              <p style={{fontSize:10,color:'#B93A16',letterSpacing:0.8,marginBottom:12}}>⚠️ LOW STOCK ({lowStock.length})</p>
              {lowStock.slice(0,5).map(p=>(
                <div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #DCDFEC'}}>
                  <span style={{fontSize:13}}>{p.image_emoji} {p.name}{parts[String(p.id)]&&<span style={{display:'block',fontSize:11,color:'#5B607E',fontFamily:'JetBrains Mono, monospace',marginLeft:22}}>P/N {parts[String(p.id)]}</span>}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'#B93A16',whiteSpace:'nowrap'}}>{lowQty(p)} {lowKind(p)==='wholesale'?'boxes':'pcs'} left</span>
                </div>
              ))}
            </div>
          )}
          <div style={card}>
            <p style={{fontSize:10,color:'#5B607E',letterSpacing:0.8,marginBottom:12}}>RECENT SALES</p>
            {sales.slice(0,6).map((s,i)=>(
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<5?'1px solid #DCDFEC':'none'}}>
                <div>
                  <p style={{fontSize:13,fontWeight:600}}>{s.customers?.name||'Walk-in'}</p>
                  <p style={{fontSize:10,color:'#8A8FAE',marginTop:1}}>{(s.sale_date||s.created_at?.split('T')[0])} · {s.payment_method?.toUpperCase()}</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{fontSize:13,fontWeight:700,color:'#2D2F8F'}}>{fmtK(s.total)}</p>
                  <p style={{fontSize:10,color:'#2D2F8F'}}>+{fmtK(s.total_profit)}</p>
                </div>
              </div>
            ))}
            {!sales.length&&<p style={{color:'#8A8FAE',fontSize:13}}>No sales yet</p>}
          </div>
        </div>
      </Layout>
    </>
  )
}
