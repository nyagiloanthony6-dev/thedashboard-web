import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { supabase, fmt } from '../../lib/supabase'
import { loadModules, ownedShop } from '../../lib/kibali'

export default function Stock() {
  const [profile,setProfile]=useState(null)
  const [shop,setShop]=useState(null)
  const [products,setProducts]=useState([])
  const [customFields,setCustomFields]=useState([])
  const [categories,setCategories]=useState([])
  const [kibaliOn,setKibaliOn]=useState(false)
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [showModal,setShowModal]=useState(false)
  const [bulkModal,setBulkModal]=useState(false)
  const [bulkText,setBulkText]=useState('')
  const [bulkParsed,setBulkParsed]=useState([])
  const [bulkSaving,setBulkSaving]=useState(false)
  const [bulkStatus,setBulkStatus]=useState('')
  const [batchModal,setBatchModal]=useState(false)
  const [missingSellModal,setMissingSellModal]=useState(false)
  const [missingSellPrices,setMissingSellPrices]=useState({})
  const [savingMissing,setSavingMissing]=useState({})
  const [batchProd,setBatchProd]=useState(null)
  const [batches,setBatches]=useState([])
  const [loadingBatch,setLoadingBatch]=useState(false)
  const [bulkDate,setBulkDate]=useState('')
  const [bulkExRate,setBulkExRate]=useState('')
  const [bulkClearing,setBulkClearing]=useState('')
  const [bulkTransport,setBulkTransport]=useState('')
  const [bulkOther,setBulkOther]=useState('')
  const [editProd,setEditProd]=useState(null)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({name:'',category:'',image_emoji:'📦',buy_price:'',sell_price:'',wholesale_price:'',retail_stock:'0',wholesale_stock:'0',box_qty:'1',unit:'unit',product_type:'retail',low_stock_alert:'10',min_sell_price:''})
  const [customFieldValues,setCustomFieldValues]=useState({})
  const [customCat,setCustomCat]=useState('')
  const [tab,setTab]=useState('products')
  const [reportSearch,setReportSearch]=useState('')
  const [reportCat,setReportCat]=useState('')
  const [reportSort,setReportSort]=useState({col:'name',dir:'asc'})
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.value}))

  const exportCSV=()=>{
    const partField=customFields.find(f=>f.field_name.toLowerCase().includes('part'))
    const rows=reportFiltered.map(p=>{
      const partNo=partField?p._cfv?.[partField.id]||'':''
      const stock=getStock(p)
      return [p.name,partNo,p.category||'',p.product_type||'',stock,p.buy_price||0,p.sell_price||0,p.wholesale_price||0].join(',')
    })
    const header='Product Name,Part Number,Category,Type,Stock,Buy Price,Sell Price,Wholesale Price'
    const csv=[header,...rows].join('\n')
    const blob=new Blob([csv],{type:'text/csv'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download='stock-report.csv';a.click();URL.revokeObjectURL(url)
  }

  const exportExcel=()=>{
    const partField=customFields.find(f=>f.field_name.toLowerCase().includes('part'))
    const header=['Product Name','Part Number','Category','Type','Stock','Buy Price','Sell Price','Wholesale Price']
    const rows=reportFiltered.map(p=>{
      const partNo=partField?p._cfv?.[partField.id]||'':''
      const stock=getStock(p)
      return [p.name,partNo,p.category||'',p.product_type||'',stock,p.buy_price||0,p.sell_price||0,p.wholesale_price||0]
    })
    // Build simple XML-based Excel (xls)
    let xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Stock Report"><Table>`
    xml+=`<Row>${header.map(h=>`<Cell><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>`
    rows.forEach(r=>{xml+=`<Row>${r.map((v,i)=>`<Cell><Data ss:Type="${i>=4?'Number':'String'}">${v}</Data></Cell>`).join('')}</Row>`})
    xml+=`</Table></Worksheet></Workbook>`
    const blob=new Blob([xml],{type:'application/vnd.ms-excel'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download='stock-report.xls';a.click();URL.revokeObjectURL(url)
  }

  useEffect(()=>{loadData()},[])

  const loadData=async()=>{
    const {data:{user}}=await supabase.auth.getUser()
    const {data:prof}=await supabase.from('app_users').select('*,shops(*)').eq('id',user.id).single()
    const shopData=prof.shops||await ownedShop(user.id)
    setProfile(prof);setShop(shopData)
    const shopId=shopData.id
    loadModules(shopId).then(m=>setKibaliOn(m.kibali))
    const [pr,cf,cat]=await Promise.all([
      supabase.from('products').select('*').eq('shop_id',shopId).eq('is_active',true).order('name'),
      supabase.from('product_custom_fields').select('*').eq('shop_id',shopId),
      supabase.from('product_categories').select('*').eq('shop_id',shopId).order('name'),
    ])
    const prods=pr.data||[]
    if(prods.length){
      const {data:cfv}=await supabase.from('product_field_values').select('*').in('product_id',prods.map(p=>p.id))
      const map={};(cfv||[]).forEach(v=>{if(!map[v.product_id])map[v.product_id]={};map[v.product_id][v.field_id]=v.value})
      prods.forEach(p=>{p._cfv=map[p.id]||{}})
    }
    setProducts(prods);setCustomFields(cf.data||[]);setCategories(cat.data||[]);setLoading(false)
  }

  const openAdd=()=>{setEditProd(null);setForm({name:'',category:'',image_emoji:'📦',buy_price:'',sell_price:'',wholesale_price:'',retail_stock:'0',wholesale_stock:'0',box_qty:'1',unit:'unit',product_type:'retail',low_stock_alert:'10',min_sell_price:''});setCustomCat('');setCustomFieldValues({});setShowModal(true)}
  const openEdit=p=>{setEditProd(p);setForm({name:p.name,category:p.category||'',image_emoji:p.image_emoji||'📦',buy_price:String(p.buy_price||''),sell_price:String(p.sell_price||''),wholesale_price:String(p.wholesale_price||''),retail_stock:String(p.retail_stock||p.stock||''),wholesale_stock:String(p.wholesale_stock||''),box_qty:String(p.box_qty||1),unit:p.unit||'unit',product_type:p.product_type||'retail',low_stock_alert:String(p.low_stock_alert||10),min_sell_price:String(p.min_sell_price||'')});setCustomCat('');const cfv={};customFields.forEach(f=>{cfv[f.id]=p._cfv?.[f.id]||''});setCustomFieldValues(cfv);setShowModal(true)}

  const saveMissingSell=async(prod)=>{
    const val=parseFloat(missingSellPrices[prod.id])
    if(!val||val<=0){alert('Enter a valid sell price');return}
    setSavingMissing(p=>({...p,[prod.id]:true}))
    await supabase.from('products').update({sell_price:val}).eq('id',prod.id)
    setProducts(prev=>prev.map(p=>p.id===prod.id?{...p,sell_price:val}:p))
    setSavingMissing(p=>({...p,[prod.id]:false}))
    setMissingSellPrices(p=>({...p,[prod.id]:''}))
  }

  const openBatches = async (prod) => {
    setBatchProd(prod); setBatchModal(true); setLoadingBatch(true)
    const partField = customFields.find(f=>f.field_name.toLowerCase().includes('part'))
    const partNo = partField ? prod._cfv?.[partField.id] : null

    let batches = []

    // Primary: search by part number (most reliable link)
    if (partNo) {
      const {data} = await supabase.from('stock_batches')
        .select('*').eq('shop_id', shop.id)
        .ilike('part_number', partNo)
        .order('received_date', {ascending:false})
      batches = data||[]
    }

    // Secondary: search by product name if no part number or no results
    if (!batches.length) {
      const {data} = await supabase.from('stock_batches')
        .select('*').eq('shop_id', shop.id)
        .ilike('product_name', '%' + prod.name + '%')
        .order('received_date', {ascending:false})
      batches = data||[]
    }

    // Tertiary: if product name is generic (Bushing, Bush etc) and has part number,
    // also show all batches whose product_name contains keywords from the part number
    // This handles case where batch was saved with different product name
    if (!batches.length && partNo) {
      const {data} = await supabase.from('stock_batches')
        .select('*').eq('shop_id', shop.id)
        .ilike('part_number', '%' + partNo.split('-')[0] + '%')
        .order('received_date', {ascending:false})
        .limit(50)
      batches = data||[]
    }

    setBatches(batches)
    setLoadingBatch(false)
  }

  const parseBulk = () => {
    const lines = bulkText.trim().split('\n').filter(l=>l.trim())
    const parsed = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const lower = trimmed.toLowerCase()
      if (lower.startsWith('item name')||lower.startsWith('product')||lower.startsWith('name')||lower.startsWith('part no')||lower.startsWith('description')) continue
      let name='', partNo='', qty=0, buyPrice=''
      if (trimmed.includes('\t')) {
        const cols = trimmed.split('\t').map(c=>c.trim())
        if (cols.length>=3) {
          const col0IsPartNo = /^[A-Z0-9]+-[A-Z0-9]+$/i.test(cols[0])
          if (col0IsPartNo) { partNo=cols[0]; qty=parseInt(cols[1])||0; buyPrice=(cols[2]||'').replace(/[¥$€£,]/g,'').trim() }
          else { name=cols[0]; partNo=cols[1]||''; qty=parseInt(cols[2])||0; buyPrice=(cols[3]||'').replace(/[¥$€£,]/g,'').trim() }
        } else if (cols.length===2) { partNo=cols[0]; qty=parseInt(cols[1])||0 }
      } else {
        const m = trimmed.match(/^(.+?)\s+(\d+)\s*$/)
        if (m) { partNo=m[1].trim(); qty=parseInt(m[2]) } else { partNo=trimmed; qty=0 }
      }
      if (!partNo&&!name) continue
      const partField = customFields.find(f=>f.field_name.toLowerCase().includes('part'))
      const matchedProd = partField ? products.find(p=>p._cfv?.[partField.id]?.toLowerCase()===partNo.toLowerCase()) : null
      parsed.push({ name: name||matchedProd?.name||'', part_number:partNo, qty_boxes:String(qty), buy_price: buyPrice||String(matchedProd?.buy_price||''), matched:!!matchedProd, matchedProd })
    }
    setBulkParsed(parsed)
  }

  const saveBulk = async () => {
    const valid = bulkParsed.filter(i=>(i.name||i.part_number)&&parseInt(i.qty_boxes)>0)
    if (!valid.length) { alert('No valid items'); return }
    setBulkSaving(true); setBulkStatus('Loading products...')

    const receivedDate = bulkDate || new Date().toISOString().split('T')[0]
    const batchDate    = receivedDate.replace(/-/g,'')
    const partField    = customFields.find(f=>f.field_name.toLowerCase().includes('part'))
    const exRate       = parseFloat(bulkExRate)||1
    const clearingFee  = parseFloat(bulkClearing)||0
    const transportFee = parseFloat(bulkTransport)||0
    const otherFee     = parseFloat(bulkOther)||0
    const totalExtra   = clearingFee + transportFee + otherFee
    const totalPurchaseTZS = valid.reduce((a,i)=>a+(parseFloat(i.buy_price)||0)*exRate*(parseInt(i.qty_boxes)||0), 0)

    // ── STEP 1: Fetch ALL existing products in ONE query ──────────
    setBulkStatus('Fetching products (1/3)...')
    const partNums = valid.map(i=>i.part_number).filter(Boolean)
    const names    = valid.map(i=>i.name).filter(Boolean)

    // Fetch all field values for matching part numbers at once
    let cfvMap = {} // partNumber → productId
    if (partField && partNums.length) {
      const {data:cfvAll} = await supabase.from('product_field_values')
        .select('product_id,value').eq('field_id',partField.id)
        .in('value', partNums)
      ;(cfvAll||[]).forEach(r=>{ cfvMap[r.value.toLowerCase()] = r.product_id })
    }

    // Fetch all matching products by ID or name at once
    const productIds = Object.values(cfvMap)
    const {data:allProds} = await supabase.from('products')
      .select('*').eq('shop_id',shop.id)
      .or(productIds.length
        ? `id.in.(${productIds.join(',')}),name.in.(${names.map(n=>`"${n}"`).join(',')})`
        : `name.in.(${names.map(n=>`"${n}"`).join(',')})`)
    const prodById   = {}
    const prodByName = {}
    ;(allProds||[]).forEach(p=>{ prodById[p.id]=p; prodByName[p.name.toLowerCase()]=p })

    // ── STEP 2: Compute updates & inserts ─────────────────────────
    setBulkStatus('Processing items (2/3)...')
    const stockUpdates  = [] // {id, fields}
    const stockInserts  = [] // new products to insert
    const pfvInserts    = [] // new part number field values
    const batchInserts  = [] // batch records

    for (const item of valid) {
      const qtyBoxes     = parseInt(item.qty_boxes)||0
      const unitCostRMB  = parseFloat(item.buy_price)||0
      const unitCostTZS  = Math.round(unitCostRMB * exRate)
      const totalCostTZS = unitCostTZS * qtyBoxes
      const share        = totalPurchaseTZS > 0 ? totalCostTZS/totalPurchaseTZS : 1/valid.length
      const itemExtra    = Math.round(totalExtra * share)
      const itemLanded   = totalCostTZS + itemExtra
      const pcsPerBox    = 1
      const totalPcs     = qtyBoxes * pcsPerBox
      const landedPerPc  = totalPcs > 0 ? Math.round(itemLanded/totalPcs) : 0
      const batchRef     = (item.name||item.part_number||'ITEM').replace(/[^A-Z0-9]/gi,'').substring(0,4).toUpperCase()
                           + '-' + batchDate + '-' + (Math.floor(Math.random()*900)+100)

      // Same buy price → update existing row. Different price → new row.
      const matchId   = item.part_number ? cfvMap[item.part_number.toLowerCase()] : null
      const samePriceMatch = matchId
        ? Object.values(prodById).find(p => p.id === matchId && Math.round(p.buy_price) === unitCostTZS)
        : (item.name ? Object.values(prodByName).find(p =>
            p.name.toLowerCase() === item.name.toLowerCase() && Math.round(p.buy_price) === unitCostTZS
          ) : null)

      if (samePriceMatch) {
        // Same price — just add to stock count
        const isWholesale = samePriceMatch.product_type==='wholesale' || samePriceMatch.wholesale_stock > 0
        const curStock = isWholesale ? (samePriceMatch.wholesale_stock||0) : (samePriceMatch.retail_stock||samePriceMatch.stock||0)
        stockUpdates.push({
          id: samePriceMatch.id, _qty: qtyBoxes, _kind: isWholesale ? 'wholesale' : 'retail', _ref: 'Bulk import ' + batchRef,
          fields: isWholesale
            ? {wholesale_stock: curStock + qtyBoxes}
            : {retail_stock: curStock + qtyBoxes, stock: curStock + qtyBoxes}
        })
        batchInserts.push({batch_ref:batchRef, shop_id:shop.id,
          product_name:samePriceMatch.name, part_number:item.part_number||null,
          qty_boxes:qtyBoxes, pieces_per_box:pcsPerBox, qty_pieces:totalPcs, qty_remaining:totalPcs,
          unit_cost:unitCostRMB, currency:exRate>1?'RMB':'TZS', exchange_rate:exRate,
          unit_cost_tzs:unitCostTZS, total_cost_tzs:itemLanded, landed_cost_per_piece:landedPerPc,
          received_date:receivedDate, status:'active'})
      } else if (item.name) {
        // Different price — new product row
        stockInserts.push({_item:item, _qtyBoxes:qtyBoxes, _unitCostTZS:unitCostTZS,
          _itemLanded:itemLanded, _landedPerPc:landedPerPc, _batchRef:batchRef,
          _pcsPerBox:pcsPerBox, _totalPcs:totalPcs, _unitCostRMB:unitCostRMB,
          shop_id:shop.id, name:item.name, buy_price:unitCostTZS, sell_price:0,
          wholesale_price:0, stock:0, retail_stock:0, wholesale_stock:qtyBoxes,
          box_qty:1, unit:'unit', product_type:'wholesale', is_active:true, image_emoji:'📦'})
      }
    }

    // ── STEP 3: Save to database ──────────────────────────────────
    setBulkStatus('Saving to database...')

    // Kibali shops: every quantity goes through Kibali so it is recorded
    // as a delivery (who, when, reference) in the stock movement history.
    const kibaliErrors = []
    const kibaliReceive = async (id, qty, kind, ref) => {
      if (!qty) return
      const { error } = await supabase.rpc('kibali_receive_stock', { p_product_id: String(id), p_qty: qty, p_reference: ref, p_kind: kind })
      if (error) kibaliErrors.push(ref + ': ' + error.message)
    }

    // Run stock updates in parallel
    if (kibaliOn) {
      for (const u of stockUpdates) await kibaliReceive(u.id, u._qty, u._kind, u._ref)
    } else {
      await Promise.all(stockUpdates.map(u =>
        supabase.from('products').update(u.fields).eq('id', u.id)
      ))
    }

    // Insert new products one by one (need their IDs for batch records)
    for (const ins of stockInserts) {
      const {_item,_qtyBoxes,_unitCostTZS,_itemLanded,_landedPerPc,_batchRef,_pcsPerBox,_totalPcs,_unitCostRMB,...prodData} = ins
      if (kibaliOn) prodData.wholesale_stock = 0
      const {data:newProd} = await supabase.from('products').insert(prodData).select('id').single()
      if (kibaliOn && newProd?.id) await kibaliReceive(newProd.id, _qtyBoxes, 'wholesale', 'Bulk import ' + _batchRef)
      if (newProd?.id && _item.part_number && partField) {
        pfvInserts.push({product_id:newProd.id, field_id:partField.id, value:_item.part_number})
      }
      if (newProd?.id) {
        batchInserts.push({batch_ref:_batchRef, shop_id:shop.id,
          product_name:_item.name, part_number:_item.part_number||null,
          qty_boxes:_qtyBoxes, pieces_per_box:_pcsPerBox, qty_pieces:_totalPcs, qty_remaining:_totalPcs,
          unit_cost:_unitCostRMB, currency:exRate>1?'RMB':'TZS', exchange_rate:exRate,
          unit_cost_tzs:_unitCostTZS, total_cost_tzs:_itemLanded, landed_cost_per_piece:_landedPerPc,
          received_date:receivedDate, status:'active'})
      }
    }

    // Bulk insert part number field values and batch records
    await Promise.all([
      pfvInserts.length ? supabase.from('product_field_values').upsert(pfvInserts) : Promise.resolve(),
      batchInserts.length ? supabase.from('stock_batches').insert(batchInserts) : Promise.resolve(),
    ])

    setBulkSaving(false); setBulkStatus('')
    setBulkModal(false); setBulkText(''); setBulkParsed([]); setBulkDate('')
    setBulkExRate(''); setBulkClearing(''); setBulkTransport(''); setBulkOther('')
    loadData()
    alert('✅ ' + (stockUpdates.length + stockInserts.length) + ' products saved!' + (kibaliErrors.length ? '\n\n⚠️ Kibali could not record ' + kibaliErrors.length + ' deliveries:\n' + kibaliErrors.slice(0, 5).join('\n') : ''))
  }

  const save=async()=>{
    if(!form.name.trim()){alert('Enter product name');return}
    setSaving(true)
    const d={name:form.name.trim(),category:form.category,image_emoji:form.image_emoji,buy_price:parseFloat(form.buy_price)||0,sell_price:parseFloat(form.sell_price)||0,wholesale_price:parseFloat(form.wholesale_price)||0,stock:parseInt(form.retail_stock)||0,retail_stock:parseInt(form.retail_stock)||0,wholesale_stock:parseInt(form.wholesale_stock)||0,box_qty:parseInt(form.box_qty)||1,unit:form.unit,product_type:form.product_type,low_stock_alert:parseInt(form.low_stock_alert)||10,is_active:true,shop_id:shop.id,min_sell_price:form.min_sell_price?parseFloat(form.min_sell_price):null}
    // Kibali shops: quantities only change through Kibali (Pokea / Hesabu)
    if(kibaliOn){
      if(editProd){delete d.stock;delete d.retail_stock;delete d.wholesale_stock}
      else{d.stock=0;d.retail_stock=0;d.wholesale_stock=0}
    }
    let prodId=editProd?.id
    if(editProd){const {data}=await supabase.from('products').update(d).eq('id',editProd.id).select().single();setProducts(p=>p.map(x=>x.id===editProd.id?{...x,...data,_cfv:{...x._cfv,...customFieldValues}}:x))}
    else{const {data}=await supabase.from('products').insert(d).select().single();if(data){prodId=data.id;setProducts(p=>[...p,{...data,_cfv:{}}])}}
    // Save custom field values
    if(prodId&&customFields.length){
      const upserts=customFields.filter(f=>customFieldValues[f.id]!==undefined&&customFieldValues[f.id]!=='').map(f=>({product_id:prodId,field_id:f.id,value:String(customFieldValues[f.id])}))
      if(upserts.length)await supabase.from('product_field_values').upsert(upserts,{onConflict:'product_id,field_id'})
      // Delete cleared values
      const cleared=customFields.filter(f=>customFieldValues[f.id]===''&&editProd?._cfv?.[f.id])
      for(const f of cleared)await supabase.from('product_field_values').delete().eq('product_id',prodId).eq('field_id',f.id)
    }
    setSaving(false);setShowModal(false);loadData()
  }
  const del=async(id)=>{if(!confirm('Delete product?'))return;await supabase.from('products').update({is_active:false}).eq('id',id);setProducts(p=>p.filter(x=>x.id!==id))}

  const filtered=products.filter(p=>{
    const q=search.toLowerCase()
    return!q||p.name.toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q)||Object.values(p._cfv||{}).some(v=>String(v).toLowerCase().includes(q))
  })
  const getStock=p=>p.product_type==='wholesale'?(p.wholesale_stock||0):(p.retail_stock||p.stock||0)
  const card={background:'#161b22',border:'1px solid #30363d',borderRadius:12,padding:16}
  const partField=customFields.find(f=>f.field_name.toLowerCase().includes('part'))
  const toggleSort=col=>setReportSort(s=>({col,dir:s.col===col&&s.dir==='asc'?'desc':'asc'}))
  const reportFiltered=products.filter(p=>{
    const q=reportSearch.toLowerCase()
    const partNo=partField?p._cfv?.[partField.id]||'':''
    const matchQ=!q||p.name.toLowerCase().includes(q)||partNo.toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q)
    const matchCat=!reportCat||p.category===reportCat
    return matchQ&&matchCat
  }).sort((a,b)=>{
    const{col,dir}=reportSort
    let av,bv
    if(col==='stock'){av=getStock(a);bv=getStock(b)}
    else if(col==='buy'){av=a.buy_price||0;bv=b.buy_price||0}
    else if(col==='sell'){av=a.product_type==='wholesale'?(a.wholesale_price||0):(a.sell_price||0);bv=b.product_type==='wholesale'?(b.wholesale_price||0):(b.sell_price||0)}
    else if(col==='part'){av=partField?a._cfv?.[partField.id]||'':'';bv=partField?b._cfv?.[partField.id]||'':''}
    else if(col==='category'){av=a.category||'';bv=b.category||''}
    else{av=a.name||'';bv=b.name||''}
    const cmp=typeof av==='number'?av-bv:(av+'').localeCompare(bv+'')
    return dir==='asc'?cmp:-cmp
  })

  return(
    <>
      <Head><title>Stock — TheDashboard</title></Head>
      <Layout title="Stock Management" shop={shop} profile={profile}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
          {[{l:'Products',v:products.length,c:'#2196F3'},{l:'Low Stock',v:products.filter(p=>getStock(p)<(p.low_stock_alert||10)).length,c:'#ff4d6d'},{l:'Categories',v:new Set(products.map(p=>p.category).filter(Boolean)).size,c:'#a78bfa'}].map(k=>(
            <div key={k.l} style={card}><p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8}}>{k.l.toUpperCase()}</p><p style={{fontSize:22,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p></div>
          ))}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
          {[
            {l:'Total Items',v:products.reduce((a,p)=>a+getStock(p),0).toLocaleString()+' units',c:'#ffb547'},
            {l:'Stock Value (Cost)',v:'TZS '+(products.reduce((a,p)=>a+(getStock(p)*(p.buy_price||0)),0)).toLocaleString(),c:'#34d399'},
            {l:'Stock Value (Selling)',v:'TZS '+(products.reduce((a,p)=>{const sp=p.product_type==='wholesale'?(p.wholesale_price||p.sell_price||0):(p.sell_price||p.wholesale_price||0);return a+(getStock(p)*sp)},0)).toLocaleString(),c:'#f97316'},
          ].map(k=>(
            <div key={k.l} style={card}><p style={{fontSize:10,color:'#7d8590',letterSpacing:0.8}}>{k.l.toUpperCase()}</p><p style={{fontSize:18,fontWeight:900,color:k.c,marginTop:6}}>{k.v}</p>{k.sub&&<p style={{fontSize:10,color:'#ff4d6d',marginTop:4}}>⚠️ {k.sub}</p>}</div>
          ))}
        </div>
        {/* Tabs */}
        <div style={{display:'flex',gap:8,marginBottom:20,borderBottom:'1px solid #30363d',paddingBottom:0}}>
          {[['products','📦 Products'],['report','📊 Stock Report']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:'9px 20px',borderRadius:'8px 8px 0 0',border:'1px solid',borderBottom:'none',borderColor:tab===k?'#30363d':'transparent',background:tab===k?'#161b22':'transparent',color:tab===k?'#e6edf3':'#7d8590',fontWeight:tab===k?700:400,fontSize:13,cursor:'pointer',marginBottom:-1}}>{l}</button>
          ))}
        </div>

        {tab==='products'&&<>
        <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products..." style={{flex:1}}/>
          <button onClick={()=>setBulkModal(true)} style={{padding:'10px 16px',borderRadius:8,background:'rgba(33,150,243,0.12)',color:'#4da6ff',border:'1px solid #2196F340',fontWeight:700,fontSize:13,cursor:'pointer',marginRight:8}}>📋 Bulk Add</button><button onClick={openAdd} style={{padding:'10px 20px',borderRadius:8,background:'#2196F3',color:'#000',fontWeight:700,fontSize:13,border:'none',whiteSpace:'nowrap'}}>+ Add Product</button>
        </div>
        <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #30363d'}}>
                {['Product','Category','Buy Price','Sell Price','Stock','Actions'].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:10,color:'#7d8590',letterSpacing:0.8,fontWeight:600}}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i)=>{
                const stock=getStock(p),low=stock<(p.low_stock_alert||10)
                return(
                  <tr key={p.id} style={{borderBottom:i<filtered.length-1?'1px solid #30363d':'none'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:20}}>{p.image_emoji||'📦'}</span>
                        <div>
                          <p style={{fontSize:13,fontWeight:600}}>{p.name}</p>
                          {customFields.filter(f=>p._cfv?.[f.id]).map(f=>(
                            <p key={f.id} style={{fontSize:10,color:'#a78bfa',marginTop:1}}>{f.field_name}: {p._cfv[f.id]}</p>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:'12px 16px',fontSize:12,color:'#7d8590'}}>{p.category||'—'}</td>
                    <td style={{padding:'12px 16px',fontSize:12,fontWeight:600,color:'#ffb547'}}>{fmt(p.buy_price)}</td>
                    <td style={{padding:'12px 16px',fontSize:12}}>
                      {p.sell_price>0&&<div style={{color:'#4da6ff'}}>{fmt(p.sell_price)}</div>}
                      {p.wholesale_price>0&&<div style={{color:'#2196F3'}}>{fmt(p.wholesale_price)} whs</div>}
                    </td>
                    <td style={{padding:'12px 16px',fontSize:14,fontWeight:700,color:low?'#ff4d6d':'#e6edf3'}}>{stock}</td>
                    <td style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>openEdit(p)} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #30363d',background:'transparent',color:'#2196F3',fontSize:11,fontWeight:600}}>Edit</button>
                        <button onClick={()=>openBatches(p)} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #a78bfa40',background:'transparent',color:'#a78bfa',fontSize:11,fontWeight:600}}>📦 Batches</button>
                        <button onClick={()=>del(p.id)} style={{padding:'6px 12px',borderRadius:6,border:'1px solid rgba(255,77,109,0.3)',background:'transparent',color:'#ff4d6d',fontSize:11,fontWeight:600}}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length&&<tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'#484f58'}}>No products found</td></tr>}
            </tbody>
          </table>
        </div>
        </>}

        {tab==='report'&&(
          <div>
            {/* Report controls */}
            <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
              <input value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="Search by name or part number..." style={{flex:1,minWidth:200,background:'#0d1117',border:'1.5px solid #30363d',borderRadius:8,color:'#e6edf3',padding:'9px 12px',fontSize:13,outline:'none'}}/>
              <select value={reportCat} onChange={e=>setReportCat(e.target.value)} style={{background:'#0d1117',border:'1.5px solid #30363d',borderRadius:8,color:reportCat?'#e6edf3':'#484f58',padding:'9px 12px',fontSize:13,outline:'none'}}>
                <option value="">All Categories</option>
                {[...new Set(products.map(p=>p.category).filter(Boolean))].sort().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={exportCSV} style={{padding:'9px 16px',borderRadius:8,background:'rgba(37,211,102,0.12)',color:'#25d366',border:'1px solid #25d36640',fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>⬇ CSV</button>
              <button onClick={exportExcel} style={{padding:'9px 16px',borderRadius:8,background:'rgba(33,150,243,0.12)',color:'#4da6ff',border:'1px solid #2196F340',fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>⬇ Excel</button>
            </div>
            <p style={{fontSize:11,color:'#7d8590',marginBottom:12}}>{reportFiltered.length} products · {reportFiltered.reduce((a,p)=>a+getStock(p),0).toLocaleString()} total units</p>

            {/* Report table */}
            <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:12,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'1px solid #30363d',background:'#0d1117'}}>
                    {[
                      {label:'#',col:null},
                      {label:'Product',col:'name'},
                      {label:'Part Number',col:'part'},
                      {label:'Category',col:'category'},
                      {label:'Type',col:null},
                      {label:'Stock',col:'stock'},
                      {label:'Buy Price',col:'buy'},
                      {label:'Sell Price',col:'sell'},
                    ].map(({label,col})=>(
                      <th key={label} onClick={col?()=>toggleSort(col):undefined}
                        style={{padding:'11px 14px',textAlign:'left',fontSize:10,color:col&&reportSort.col===col?'#e6edf3':'#7d8590',letterSpacing:0.8,fontWeight:600,cursor:col?'pointer':'default',userSelect:'none',whiteSpace:'nowrap'}}>
                        {label}
                        {col&&<span style={{marginLeft:4,opacity:reportSort.col===col?1:0.3,fontSize:10}}>
                          {reportSort.col===col?(reportSort.dir==='asc'?'▲':'▼'):'⇅'}
                        </span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportFiltered.map((p,i)=>{
                    const stock=getStock(p)
                    const low=stock<(p.low_stock_alert||10)
                    const partNo=partField?p._cfv?.[partField.id]||'—':'—'
                    const sellPrice=p.product_type==='wholesale'?(p.wholesale_price||0):(p.sell_price||0)
                    return(
                      <tr key={p.id} style={{borderBottom:i<reportFiltered.length-1?'1px solid #30363d':'none'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'10px 14px',fontSize:11,color:'#484f58'}}>{i+1}</td>
                        <td style={{padding:'10px 14px'}}>
                          <p style={{fontSize:13,fontWeight:600}}>{p.image_emoji||'📦'} {p.name}</p>
                        </td>
                        <td style={{padding:'10px 14px',fontSize:12,fontFamily:'monospace',color:'#a78bfa'}}>{partNo}</td>
                        <td style={{padding:'10px 14px',fontSize:12,color:'#7d8590'}}>{p.category||'—'}</td>
                        <td style={{padding:'10px 14px',fontSize:11,color:'#484f58',textTransform:'capitalize'}}>{p.product_type||'—'}</td>
                        <td style={{padding:'10px 14px',fontSize:14,fontWeight:800,color:low?'#ff4d6d':stock===0?'#484f58':'#25d366'}}>{stock.toLocaleString()}</td>
                        <td style={{padding:'10px 14px',fontSize:12,color:'#ffb547',fontWeight:600}}>{p.buy_price?fmt(p.buy_price):'—'}</td>
                        <td style={{padding:'10px 14px',fontSize:12,color:'#4da6ff',fontWeight:600}}>{sellPrice?fmt(sellPrice):'—'}</td>
                      </tr>
                    )
                  })}
                  {!reportFiltered.length&&<tr><td colSpan={8} style={{padding:40,textAlign:'center',color:'#484f58'}}>No products found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showModal&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:1000}} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
            <div style={{background:'#161b22',borderRadius:'20px 20px 0 0',padding:28,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',border:'1px solid #30363d'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontSize:16,fontWeight:800}}>{editProd?'Edit Product':'Add Product'}</h2>
                <button onClick={()=>setShowModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{gridColumn:'1/-1'}}><label>Product Name *</label><input value={form.name} onChange={set('name')} placeholder="e.g. Brake Pad"/></div>
                <div><label>Category</label>
                  {categories.length>0
                    ? <select
                        value={categories.find(c=>c.name===form.category)?form.category:'__other__'}
                        onChange={e=>{
                          if(e.target.value==='__other__'){setCustomCat('');setForm(p=>({...p,category:''}))}
                          else{setForm(p=>({...p,category:e.target.value}));setCustomCat('')}
                        }}
                        style={{background:'#0d1117',border:'1.5px solid #30363d',borderRadius:8,color:'#e6edf3',padding:'9px 12px',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'}}>
                        <option value="">— Select category —</option>
                        {categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                        <option value="__other__">✏️ Other (type new)</option>
                      </select>
                    : null
                  }
                  {(categories.length===0||!categories.find(c=>c.name===form.category))&&
                    <input value={categories.length>0?customCat:form.category}
                      onChange={e=>{
                        if(categories.length>0){setCustomCat(e.target.value);setForm(p=>({...p,category:e.target.value}))}
                        else set('category')(e)
                      }}
                      placeholder="Type category name"
                      style={{marginTop:categories.length>0?6:0}}/>
                  }
                </div>
                <div><label>Emoji</label><input value={form.image_emoji} onChange={set('image_emoji')} placeholder="📦"/></div>
                <div><label>Buy Price / Box</label><input value={form.buy_price} onChange={set('buy_price')} type="number" placeholder="0"/></div>
                <div><label>Retail Sell Price</label><input value={form.sell_price} onChange={set('sell_price')} type="number" placeholder="0"/></div>
                <div><label style={{color:'#f59e0b'}}>Min Sell Price (Floor)</label><input value={form.min_sell_price} onChange={set('min_sell_price')} type="number" placeholder="Optional — cashier can't go below this"/></div>
                <div><label>Wholesale Price</label><input value={form.wholesale_price} onChange={set('wholesale_price')} type="number" placeholder="0"/></div>
                <div><label>Retail Stock (pcs)</label><input value={kibaliOn&&!editProd?'0':form.retail_stock} onChange={set('retail_stock')} type="number" placeholder="0" disabled={kibaliOn} style={kibaliOn?{opacity:0.5,cursor:'not-allowed'}:undefined}/></div>
                <div><label>Warehouse Stock (boxes)</label><input value={kibaliOn&&!editProd?'0':form.wholesale_stock} onChange={set('wholesale_stock')} type="number" placeholder="0" disabled={kibaliOn} style={kibaliOn?{opacity:0.5,cursor:'not-allowed'}:undefined}/></div>
                {kibaliOn&&<div style={{gridColumn:'1/-1',padding:'8px 12px',borderRadius:8,background:'rgba(240,180,41,0.08)',border:'1px solid rgba(240,180,41,0.3)',color:'#f0b429',fontSize:12}}>Kibali iko ON: idadi ya stoo inabadilishwa kupitia Kibali tu — <b>Pokea mzigo</b> kwa mzigo unaoingia, <b>Hesabu / rekebisha</b> kwa marekebisho. Hivyo kila mabadiliko yanarekodiwa.</div>}
                <div><label>Pieces per Box</label><input value={form.box_qty} onChange={set('box_qty')} type="number" placeholder="1"/></div>
                <div><label>Unit</label><input value={form.unit} onChange={set('unit')} placeholder="unit"/></div>
                <div style={{gridColumn:'1/-1'}}>
                  <label>Product Type</label>
                  <div style={{display:'flex',gap:8}}>
                    {['retail','wholesale','both'].map(t=>(
                      <button key={t} onClick={()=>setForm(p=>({...p,product_type:t}))} style={{flex:1,padding:'9px',borderRadius:8,border:'1px solid',borderColor:form.product_type===t?'#2196F3':'#30363d',background:form.product_type===t?'rgba(33,150,243,0.15)':'transparent',color:form.product_type===t?'#2196F3':'#7d8590',fontSize:12,fontWeight:700,textTransform:'capitalize'}}>{t}</button>
                    ))}
                  </div>
                </div>
                {customFields.length>0&&<div style={{gridColumn:'1/-1',borderTop:'1px solid #30363d',paddingTop:14,marginTop:4}}>
                  <p style={{fontSize:10,color:'#a78bfa',letterSpacing:0.8,fontWeight:700,marginBottom:10}}>🏷️ CUSTOM FIELDS</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {customFields.map(f=>(
                      <div key={f.id} style={{gridColumn:f.field_type==='textarea'?'1/-1':'auto'}}>
                        <label style={{color:'#a78bfa'}}>{f.field_name}{f.is_required&&<span style={{color:'#ff4d6d'}}> *</span>}</label>
                        {f.field_type==='textarea'
                          ?<textarea value={customFieldValues[f.id]||''} onChange={e=>setCustomFieldValues(p=>({...p,[f.id]:e.target.value}))} rows={2} placeholder={f.placeholder||f.field_name} style={{width:'100%',background:'#0d1117',border:'1.5px solid #a78bfa40',borderRadius:8,color:'#e6edf3',padding:'9px 12px',fontSize:13,fontFamily:'inherit',resize:'none',outline:'none'}}/>
                          :<input value={customFieldValues[f.id]||''} onChange={e=>setCustomFieldValues(p=>({...p,[f.id]:e.target.value}))} type={f.field_type==='number'?'number':'text'} placeholder={f.placeholder||f.field_name} style={{background:'#0d1117',border:'1.5px solid #a78bfa40',borderRadius:8,color:'#e6edf3',padding:'9px 12px',fontSize:13,outline:'none',width:'100%'}}/>
                        }
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button onClick={()=>setShowModal(false)} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid #30363d',background:'transparent',color:'#e6edf3',fontWeight:600}}>Cancel</button>
                <button onClick={save} disabled={saving} style={{flex:2,padding:'11px',borderRadius:8,background:'#2196F3',color:'#000',fontWeight:700,border:'none'}}>{saving?'Saving...':'Save Product'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
      {/* Bulk Stock Modal */}
      {bulkModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
          <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:600,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h2 style={{fontSize:16,fontWeight:800,color:'#4da6ff'}}>📋 Bulk Add Stock</h2>
              <button onClick={()=>{setBulkModal(false);setBulkText('');setBulkParsed([])}} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {bulkParsed.length===0 ? (
              <>
                <p style={{fontSize:12,color:'#7d8590',marginBottom:10}}>Paste from supplier list (tab-separated). Supports: Name + Part No + Qty + Rate, or Part No + Qty only.</p>
                <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={8}
                  placeholder={'ITEM NAME\tITEM NO.\tMOQ PCS\trate\nRubber Bush\t48818-30160\t100\t¥21.00\nBushing\t48655-0D060\t50\t¥9.00'}
                  style={{width:'100%',background:'#0d1117',border:'1px solid #30363d',borderRadius:8,color:'#e6edf3',padding:'10px 12px',fontSize:12,fontFamily:'monospace',resize:'vertical',outline:'none',marginBottom:12}}/>
                <button onClick={parseBulk} style={{width:'100%',padding:'10px',borderRadius:8,background:'#4da6ff',color:'#000',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>Parse List →</button>
              </>
            ) : (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <p style={{fontSize:12,color:'#7d8590'}}>{bulkParsed.length} items parsed</p>
                  <button onClick={()=>setBulkParsed([])} style={{background:'none',border:'none',color:'#ffb547',fontSize:12,cursor:'pointer'}}>← Edit</button>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:'#7d8590',letterSpacing:0.8,display:'block',marginBottom:4}}>STOCK RECEIVED DATE</label>
                  <input type="date" value={bulkDate} onChange={e=>setBulkDate(e.target.value)}
                    style={{background:'#0d1117',border:'1px solid #30363d',borderRadius:8,color:'#e6edf3',padding:'8px 12px',fontSize:13,outline:'none',width:'100%'}}/>
                  <p style={{fontSize:10,color:'#484f58',marginTop:3}}>Leave blank to use today's date</p>
                </div>
                <div style={{background:'rgba(37,211,102,0.05)',border:'1px solid #25d36630',borderRadius:10,padding:14,marginBottom:14}}>
                  <p style={{fontSize:11,color:'#25d366',fontWeight:700,letterSpacing:0.8,marginBottom:10}}>💱 LANDED COST</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                    <div>
                      <label style={{fontSize:10,color:'#7d8590',display:'block',marginBottom:4}}>RMB → TZS RATE</label>
                      <input value={bulkExRate} onChange={e=>setBulkExRate(e.target.value)} type="number" placeholder="e.g. 390"
                        style={{width:'100%',background:'#0d1117',border:'1px solid #30363d',borderRadius:6,color:'#4da6ff',padding:'7px 10px',fontSize:13,outline:'none',fontWeight:700}}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:'#7d8590',display:'block',marginBottom:4}}>CLEARING FEE (TZS)</label>
                      <input value={bulkClearing} onChange={e=>setBulkClearing(e.target.value)} type="number" placeholder="e.g. 150,000"
                        style={{width:'100%',background:'#0d1117',border:'1px solid #30363d',borderRadius:6,color:'#e6edf3',padding:'7px 10px',fontSize:12,outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:'#7d8590',display:'block',marginBottom:4}}>TRANSPORT (TZS)</label>
                      <input value={bulkTransport} onChange={e=>setBulkTransport(e.target.value)} type="number" placeholder="e.g. 50,000"
                        style={{width:'100%',background:'#0d1117',border:'1px solid #30363d',borderRadius:6,color:'#e6edf3',padding:'7px 10px',fontSize:12,outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:'#7d8590',display:'block',marginBottom:4}}>OTHER CHARGES (TZS)</label>
                      <input value={bulkOther} onChange={e=>setBulkOther(e.target.value)} type="number" placeholder="e.g. 30,000"
                        style={{width:'100%',background:'#0d1117',border:'1px solid #30363d',borderRadius:6,color:'#e6edf3',padding:'7px 10px',fontSize:12,outline:'none'}}/>
                    </div>
                  </div>
                  {bulkExRate&&<p style={{fontSize:11,color:'#25d366',marginTop:4}}>1 RMB = TZS {bulkExRate} | Extra costs: TZS {((parseFloat(bulkClearing)||0)+(parseFloat(bulkTransport)||0)+(parseFloat(bulkOther)||0)).toLocaleString()}</p>}
                </div>
                {bulkParsed.map((item,i)=>(
                  <div key={i} style={{background:'#0d1117',borderRadius:10,padding:12,marginBottom:8,border:`1px solid ${item.matched?'#25d36630':'#2196F330'}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <p style={{fontSize:13,fontWeight:700}}>{item.matched?'✅ ':'🆕 '}{item.name||item.part_number}</p>
                        {item.part_number&&<p style={{fontSize:10,color:'#a78bfa',fontFamily:'monospace',marginTop:2}}>#{item.part_number}</p>}
                        <p style={{fontSize:10,color:item.matched?'#25d366':'#2196F3',marginTop:2}}>{item.matched?'Existing — will add to stock':'New product — will be created'}</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <input value={item.qty_boxes} onChange={e=>setBulkParsed(p=>p.map((x,j)=>j===i?{...x,qty_boxes:e.target.value}:x))} type="number" style={{width:70,background:'#161b22',border:'1px solid #30363d',borderRadius:6,color:'#ffb547',padding:'4px 8px',fontSize:13,fontWeight:700,textAlign:'right'}}/>
                        <p style={{fontSize:9,color:'#7d8590',marginTop:2}}>boxes</p>
                      </div>
                    </div>
                    {!item.matched&&!item.name&&(
                      <input value={item.name} onChange={e=>setBulkParsed(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder="Enter product name" style={{width:'100%',marginTop:8,background:'#161b22',border:'1px solid #ffb547',borderRadius:6,color:'#e6edf3',padding:'6px 10px',fontSize:12,outline:'none'}}/>
                    )}
                    <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
                      <input value={item.buy_price} onChange={e=>setBulkParsed(p=>p.map((x,j)=>j===i?{...x,buy_price:e.target.value}:x))} placeholder="Price (¥ RMB)" type="number" style={{flex:1,background:'#161b22',border:'1px solid #30363d',borderRadius:6,color:'#e6edf3',padding:'6px 10px',fontSize:12,outline:'none'}}/>
                      {item.buy_price&&bulkExRate&&<p style={{fontSize:11,color:'#25d366',whiteSpace:'nowrap',fontWeight:700}}>≈ TZS {Math.round(parseFloat(item.buy_price)*(parseFloat(bulkExRate)||1)).toLocaleString()}/pc</p>}
                    </div>
                  </div>
                ))}
                <button onClick={saveBulk} disabled={!!bulkSaving} style={{width:'100%',padding:'12px',borderRadius:8,background:bulkSaving?'#1e3a5f':'#25d366',color:bulkSaving?'#4da6ff':'#000',fontWeight:800,fontSize:14,border:'none',cursor:bulkSaving?'not-allowed':'pointer',marginTop:4}}>
                  {bulkSaving ? (bulkStatus||'Saving...') : `✅ Save ${bulkParsed.filter(i=>parseInt(i.qty_boxes)>0).length} Items`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* BATCH HISTORY MODAL */}
      {batchModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
          <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:16,padding:24,width:'100%',maxWidth:640,maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <h2 style={{fontSize:16,fontWeight:800}}>📦 Batch History</h2>
                <p style={{fontSize:12,color:'#7d8590',marginTop:2}}>{batchProd?.name}</p>
              </div>
              <button onClick={()=>setBatchModal(false)} style={{background:'none',border:'none',color:'#7d8590',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>

            {loadingBatch ? (
              <div style={{textAlign:'center',padding:40}}><div style={{width:32,height:32,border:'3px solid #30363d',borderTopColor:'#a78bfa',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/></div>
            ) : batches.length === 0 ? (
              <div style={{textAlign:'center',padding:40,color:'#484f58'}}>
                <p style={{fontSize:32,marginBottom:8}}>📦</p>
                <p>No batch records found for this product</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                  {[
                    {l:'Total Batches',v:batches.length,c:'#2196F3'},
                    {l:'Total Received',v:batches.reduce((a,b)=>a+(b.qty_pieces||0),0)+' pcs',c:'#ffb547'},
                    {l:'Still in Stock',v:batches.reduce((a,b)=>a+(b.qty_remaining||0),0)+' pcs',c:'#25d366'},
                  ].map(k=>(
                    <div key={k.l} style={{background:'#0d1117',borderRadius:8,padding:10,textAlign:'center'}}>
                      <p style={{fontSize:18,fontWeight:900,color:k.c}}>{k.v}</p>
                      <p style={{fontSize:10,color:'#7d8590',marginTop:3}}>{k.l.toUpperCase()}</p>
                    </div>
                  ))}
                </div>

                {/* Batch list */}
                {batches.map((b,i)=>{
                  const pct = b.qty_pieces>0?Math.round(b.qty_remaining/b.qty_pieces*100):0
                  return (
                  <div key={b.id} style={{background:'#0d1117',borderRadius:10,padding:14,marginBottom:8,border:'1px solid #30363d'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                      <div>
                        {b.batch_ref&&<p style={{fontSize:11,color:'#a78bfa',fontFamily:'monospace',fontWeight:700,marginBottom:2}}>{b.batch_ref}</p>}
                        <p style={{fontSize:12,color:'#7d8590'}}>Received: {b.received_date}</p>
                        {b.vendor_name&&<p style={{fontSize:11,color:'#484f58',marginTop:1}}>Vendor: {b.vendor_name}</p>}
                      </div>
                      <span style={{background:b.status==='active'?'#25d36618':'#48485818',color:b.status==='active'?'#25d366':'#484f58',border:`1px solid ${b.status==='active'?'#25d36630':'#30363d'}`,borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700}}>
                        {b.status?.toUpperCase()}
                      </span>
                    </div>
                    {/* Progress */}
                    <div style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:11,color:'#7d8590'}}>{b.qty_remaining} remaining of {b.qty_pieces} received</span>
                        <span style={{fontSize:11,fontWeight:700,color:pct>50?'#25d366':pct>20?'#ffb547':'#ff4d6d'}}>{pct}%</span>
                      </div>
                      <div style={{height:6,background:'#30363d',borderRadius:3}}>
                        <div style={{height:'100%',width:pct+'%',background:pct>50?'#25d366':pct>20?'#ffb547':'#ff4d6d',borderRadius:3,transition:'width 0.3s'}}/>
                      </div>
                    </div>
                    {/* Cost info */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                      {[
                        {l:'Boxes',v:b.qty_boxes},
                        {l:'Cost/Pc',v:'TZS '+(b.landed_cost_per_piece||0).toLocaleString(),c:'#ffb547'},
                        {l:'Total Cost',v:'TZS '+(b.total_cost_tzs||0).toLocaleString(),c:'#ff4d6d'},
                        {l:'Currency',v:`${b.currency||'TZS'} @ ${b.exchange_rate||1}`},
                      ].map(s=>(
                        <div key={s.l} style={{textAlign:'center'}}>
                          <p style={{fontSize:9,color:'#7d8590',letterSpacing:0.5,marginBottom:2}}>{s.l.toUpperCase()}</p>
                          <p style={{fontSize:11,fontWeight:700,color:s.c||'#e6edf3'}}>{s.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )})}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
