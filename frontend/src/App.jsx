import { useState } from 'react'
import ForceGraph from './graph/ForceGraph'
import Sidebar from './components/Sidebar'
import { useWebSocket } from './hooks/useWebSocket'

const WS_URL = `ws://${window.location.host}/ws`

export default function App() {
  const { nodes, edges, packets, status } = useWebSocket(WS_URL)
  const [selected, setSelected] = useState(null)

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        nodes={nodes}
        packets={packets}
        selected={selected}
        onClose={() => setSelected(null)}
      />

      <div style={{ flex: 1, position: 'relative' }}>
        <ForceGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={setSelected}
        />

        <StatusBadge status={status} />

        <Legend />
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = { connected: '#22c55e', connecting: '#f59e0b', disconnected: '#ef4444', error: '#ef4444' }
  const labels = { connected: 'Live', connecting: 'Connexion…', disconnected: 'Déconnecté', error: 'Erreur' }
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 20, padding: '4px 12px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors[status] || '#94a3b8' }} />
      <span style={{ fontSize: 11, color: '#e2e8f0' }}>{labels[status] || status}</span>
    </div>
  )
}

function Legend() {
  const items = [
    { color: '#22c55e', label: 'HTTPS / Safe' },
    { color: '#f59e0b', label: 'Tracking' },
    { color: '#6366f1', label: 'CDN' },
    { color: '#38bdf8', label: 'DNS' },
    { color: '#fb923c', label: 'Admin (SSH…)' },
    { color: '#94a3b8', label: 'Inconnu' },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 8, padding: '10px 14px',
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}
