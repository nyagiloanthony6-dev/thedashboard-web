import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { swWords, usePartNumbers, lineName } from '../../lib/store'
import { supabase } from '../../lib/supabase'

// Thermal-receipt style release order (80mm). Printed with window.print();
// the @media print rules below print ONLY the receipt.
// Shop details (address, phone) for the slip header, cached per shop
const SHOP_INFO = {}
function useShopInfo(shopId) {
  const [info, setInfo] = useState(SHOP_INFO[shopId] || null)
  useEffect(() => {
    if (!shopId || SHOP_INFO[shopId]) return
    supabase.from('shops').select('*').eq('id', shopId).single().then(({ data }) => {
      if (data) { SHOP_INFO[shopId] = data; setInfo(data) }
    })
  }, [shopId])
  return info
}

export default function Receipt({ order, items, code, shopName, shopId }) {
  const shopInfo = useShopInfo(shopId || order.shop_id)
  const parts = usePartNumbers(shopId || order.shop_id)
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL('KIBALI:' + order.order_no, { margin: 0, width: 220, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [order.order_no])

  const total = items.reduce((a, i) => a + i.qty, 0)
  // Only add quantities up when every line counts the same unit (never pcs + boksi)
  const oneUnit = items.length > 0 && items.every(i => String(i.unit).toLowerCase() === String(items[0].unit).toLowerCase() && (i.kind || 'retail') === (items[0].kind || 'retail'))
  const cancelled = order.status === 'CANCELLED'
  const t = new Date(order.created_at)

  return (
    <div className="kb-print" style={S.paper}>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0 }
          body * { visibility: hidden !important }
          .kb-print, .kb-print * { visibility: visible !important }
          .kb-print { position: absolute !important; left: 0; top: 0; width: 76mm !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, fontFamily: 'system-ui, sans-serif' }}>{(shopName || 'SHOP').toUpperCase()}</div>
      {shopInfo?.address && <div style={{ textAlign: 'center', fontSize: 11 }}>{shopInfo.address}</div>}
      {(shopInfo?.phone || shopInfo?.email) && <div style={{ textAlign: 'center', fontSize: 11 }}>{[shopInfo.phone && 'Simu: ' + shopInfo.phone, shopInfo.email].filter(Boolean).join('  |  ')}</div>}
      <div style={S.title}>KIBALI CHA KUTOA STORE</div>
      {cancelled && <div style={S.void}>IMESITISHWA — USITOE</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10 }}>NAMBA YA ODA</div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 1 }}>{order.order_no}</div>
          {code && <div style={{ fontSize: 11, marginTop: 4 }}>Namba ya siri: <span style={S.code}>{code}</span></div>}
        </div>
        {qr && <img src={qr} alt={'QR ' + order.order_no} style={{ width: 76, height: 76 }} />}
      </div>
      <div style={S.dash} />
      <div>{t.toLocaleDateString('en-GB')} {t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {order.created_by_name}</div>
      <div>Mteja: {order.customer_name || 'Mteja wa papo hapo'}{order.customer_phone ? ' · ' + order.customer_phone : ''}</div>
      {order.collector_name && <div>Atachukua: {order.collector_name}</div>}
      {order.sale_ref && <div>Ref: {order.sale_ref}</div>}
      <div style={S.dash} />
      {items.map((it, i) => (
        <div key={it.id || i} style={S.line}>
          <span>{i + 1}.</span>
          <span style={{ fontWeight: 700 }}>{lineName(it)}</span>
          <span style={S.qty}>{it.qty} {String(it.unit).toUpperCase()}</span>
          {parts[String(it.product_id)] && <span style={{ gridColumn: '2 / 4', fontSize: 11 }}>P/N: <b>{parts[String(it.product_id)]}</b></span>}
          <span style={{ gridColumn: '2 / 4', fontSize: 10.5, fontWeight: 700 }}>** {swWords(it.qty)} ({it.qty}) {String(it.unit).toUpperCase()} TU **</span>
        </div>
      ))}
      <div style={{ borderTop: '2px solid #000', margin: '8px 0 6px' }} />
      <div>Aina za bidhaa: {items.length}</div>
      {oneUnit && <div style={{ fontWeight: 700 }}>Idadi yote: {total} {String(items[0].unit).toUpperCase()} ({swWords(total)})</div>}
      <div style={{ textAlign: 'center', fontSize: 10, lineHeight: '14px', marginTop: 8 }}>
        STORE: TOA KILE TU KINACHOONEKANA KWENYE MFUMO. MABADILIKO YOYOTE KWENYE KARATASI HII HAYAKUBALIKI.
      </div>
    </div>
  )
}

const S = {
  paper: { width: 300, background: '#fff', color: '#000', padding: '14px 12px', fontFamily: 'ui-monospace, Menlo, "Courier New", monospace', fontSize: 12, lineHeight: '17px', border: '1px solid #d0d7de' },
  title: { textAlign: 'center', fontWeight: 700, border: '1.5px solid #000', margin: '8px 0', padding: 3 },
  void: { textAlign: 'center', fontWeight: 800, fontSize: 14, border: '2px solid #000', margin: '0 0 8px', padding: 2 },
  code: { fontSize: 15, letterSpacing: 3, border: '1.5px dashed #000', padding: '0 5px', fontWeight: 700 },
  dash: { borderTop: '1px dashed #000', margin: '8px 0' },
  line: { display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 4, alignItems: 'start', margin: '6px 0' },
  qty: { border: '1.5px solid #000', padding: '0 5px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' },
}
