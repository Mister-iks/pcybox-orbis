import { Search, X } from 'lucide-react'

const CATEGORIES = [
  { id: 'all',      label: 'Tout',     color: '#64748b' },
  { id: 'safe',     label: 'HTTPS',    color: '#22c55e' },
  { id: 'tracking', label: 'Tracking', color: '#f59e0b' },
  { id: 'cdn',      label: 'CDN',      color: '#6366f1' },
  { id: 'dns',      label: 'DNS',      color: '#38bdf8' },
  { id: 'unknown',  label: 'Inconnu',  color: '#94a3b8' },
]

export default function SearchBar({ filter, onChange }) {
  const { text, category } = filter

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #334155' }}>
      <div style={{ position: 'relative', marginBottom: 7 }}>
        <Search size={11} style={{
          position: 'absolute', left: 8, top: '50%',
          transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none',
        }} />
        <input
          value={text}
          onChange={e => onChange({ ...filter, text: e.target.value })}
          placeholder="Rechercher hôte, IP, pays…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0f172a', border: '1px solid #334155',
            borderRadius: 6, padding: '5px 26px 5px 26px',
            color: '#e2e8f0', fontSize: 11, outline: 'none',
          }}
        />
        {text && (
          <button onClick={() => onChange({ ...filter, text: '' })} style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0,
          }}>
            <X size={11} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => onChange({ ...filter, category: c.id })} style={{
            background: category === c.id ? c.color + '22' : 'transparent',
            border: `1px solid ${category === c.id ? c.color : '#334155'}`,
            borderRadius: 10, padding: '2px 8px',
            fontSize: 9, fontWeight: 600,
            color: category === c.id ? c.color : '#64748b',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
