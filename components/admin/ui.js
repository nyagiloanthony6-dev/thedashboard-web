import { T } from '../../lib/store'
import { t } from './i18n'

// Shared look for Serengeti Admin sections
export const card = { background: '#fff', border: '1px solid ' + T.line, borderRadius: 14, padding: '14px 16px' }
export const banner = { border: '1px solid', borderRadius: 10, padding: '10px 14px', marginBottom: 12, background: '#fff', fontWeight: 600 }
export const btn = { border: 0, borderRadius: 999, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
export const btnP = { ...btn, background: T.green, color: '#fff' }
export const btnG = { ...btn, background: '#fff', color: T.ink, border: '1px solid ' + T.line }
export const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid ' + T.line, fontSize: 14, background: '#fff', color: T.ink }
export const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, margin: '12px 0 5px' }
export const mono = { fontFamily: 'JetBrains Mono, monospace' }
export const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12, color: T.muted, textAlign: 'left', whiteSpace: 'nowrap' }
export const td = { padding: '11px 14px', borderTop: '1px solid ' + T.line, fontSize: 14, verticalAlign: 'top' }

export const tzs = (n) => 'TZS ' + Math.round(Number(n) || 0).toLocaleString('en-US')
export const dmy = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—'
export const daysLeft = (d) => d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null

export const STATUS = {
  active:    { label: 'Inatumika',  c: '#0B7A6C', bg: '#D8F0F0' },
  trial:     { label: 'Majaribio',  c: '#9A5B00', bg: '#FDF0D2' },
  expired:   { label: 'Imeisha',    c: '#B93A16', bg: '#FBE1D8' },
  suspended: { label: 'Imesimamishwa', c: '#5B607E', bg: '#ECEEF7' },
}
export function StatusPill({ s }) {
  const x = STATUS[s] || STATUS.active
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: x.bg, color: x.c, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{t(x.label)}</span>
}
export function DaysLeft({ date, status }) {
  const d = daysLeft(date)
  if (d === null) return <span style={{ color: T.muted }}>—</span>
  const c = status === 'suspended' ? T.muted : d < 0 ? '#B93A16' : d <= 7 ? '#B93A16' : d <= 30 ? '#9A5B00' : '#0B7A6C'
  return <span style={{ ...mono, fontWeight: 700, color: c }}>{d < 0 ? t('siku {n} zilizopita', { n: -d }) : t('siku {n}', { n: d })}</span>
}

export function Kpi({ l, v, c, sub }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <p style={{ fontSize: 12, color: T.muted }}>{l}</p>
      <p style={{ fontSize: String(v).length > 9 ? 20 : 26, fontWeight: 700, color: c || T.ink, ...mono, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{v}</p>
      {sub && <p style={{ fontSize: 12, color: T.muted }}>{sub}</p>}
    </div>
  )
}

export function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 46, height: 26, borderRadius: 999, border: 0, cursor: 'pointer', position: 'relative', background: on ? '#0B7A6C' : '#C9CCDD', transition: 'background .15s', flex: 'none' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
}

export function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(21,24,58,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: width, width: '100%', padding: 22, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <p style={{ fontWeight: 700, fontSize: 18 }}>{title}</p>
          <button onClick={onClose} aria-label={t('Funga')} style={{ border: 0, background: 'transparent', fontSize: 22, color: T.muted, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Msg({ err, ok }) {
  return <>
    {err && <div role="alert" style={{ ...banner, borderColor: '#B93A16', color: '#B93A16' }}>{err}</div>}
    {ok && <div role="status" style={{ ...banner, borderColor: '#0B7A6C', color: '#0B7A6C' }}>✓ {ok}</div>}
  </>
}

export function SearchBox({ value, onChange, placeholder: ph }) {
  const placeholder = ph || t('Tafuta duka…')
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      style={{ ...inp, maxWidth: 360, minWidth: 200, flex: '1 1 220px', padding: '10px 14px' }} />
  )
}
