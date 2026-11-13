import Receipt from './Receipt'

// Shown after a POS sale marked "Chukua stoo": the release slip the customer
// takes to the store (order number, QR, release code).
export default function ReleaseSlipModal({ slip, shopName, onClose }) {
  if (!slip) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,0.55)', zIndex: 200, overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 380, margin: '0 auto', padding: 20, display: 'grid', gap: 14, justifyItems: 'center', fontFamily: 'var(--body)', color: '#15183A' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18 }}>Kibali cha kutoa store</p>
          <p style={{ fontSize: 14, color: '#5B607E', marginTop: 4 }}>Mpe mteja karatasi hii. Store itatoa mzigo baada ya kuskani na namba ya siri <b style={{ fontFamily: 'var(--mono)', color: '#15183A', letterSpacing: 2 }}>{slip.code}</b>.</p>
        </div>
        <Receipt order={slip.order} items={slip.items} code={slip.code} shopName={shopName} />
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={() => window.print()} style={{ flex: 1, padding: 12, borderRadius: 999, border: 'none', background: '#2D2F8F', color: '#FFFFFF', fontWeight: 600, fontSize: 15 }}>Chapisha kibali</button>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 999, border: '1.5px solid #15183A', background: '#FFFFFF', color: '#15183A', fontWeight: 600, fontSize: 15 }}>Endelea</button>
        </div>
      </div>
    </div>
  )
}
