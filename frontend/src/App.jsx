import { useState, useMemo } from 'react'
import ForceGraph from './graph/ForceGraph'
import MapView from './map/MapView'
import Sidebar from './components/Sidebar'
import { AlertBell, AlertPanel, AlertToasts } from './components/AlertPanel'
import { useWebSocket } from './hooks/useWebSocket'

const WS_URL = `ws://${window.location.host}/ws`

export default function App() {
  const { nodes, edges, lanDevices, packets, alerts, unread, clearUnread, status } = useWebSocket(WS_URL)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('graph')
  const [showAlerts, setShowAlerts] = useState(false)

  const alertedNodes = useMemo(() =>
    new Set(alerts.map(a => a.node_id).filter(Boolean)),
    [alerts]
  )

  function handleBell() {
    setShowAlerts(v => !v)
    clearUnread()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        nodes={nodes}
        lanDevices={lanDevices}
        packets={packets}
        selected={selected}
        onClose={() => setSelected(null)}
      />

      <div style={{ flex: 1, position: 'relative' }}>
        {view === 'graph' && (
          <ForceGraph
            nodes={nodes}
            edges={edges}
            lanDevices={lanDevices}
            alertedNodes={alertedNodes}
            onNodeClick={setSelected}
          />
        )}
        {view === 'map' && (
          <MapView nodes={nodes} onNodeClick={setSelected} />
        )}

        {/* Top-right controls */}
        <div style={{
          position: 'absolute', top: 16, right: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ViewToggle view={view} onChange={setView} />
          <AlertBell unread={unread} onClick={handleBell} />
          <StatusBadge status={status} lanCount={Object.keys(lanDevices).length} />
        </div>

        {/* Alert panel */}
        {showAlerts && (
          <AlertPanel alerts={alerts} onClose={() => setShowAlerts(false)} />
        )}

        {/* Toast notifications (warning/critical only) */}
        <AlertToasts alerts={alerts.filter(a => a.severity !== 'info').slice(0, 3)} />

        {view === 'graph' && <Legend />}
      </div>
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div style={{
      display: 'flex', background: '#1e293b',
      border: '1px solid #334155', borderRadius: 20, overflow: 'hidden',
    }}>
      {[
        { id: 'graph', icon: '⬡', label: 'Graphe' },
        { id: 'map',   icon: '🌍', label: 'Carte' },
      ].map(({ id, icon, label }) => (
        <button key={id} onClick={() => onChange(id)} style={{
          background: view === id ? '#3b82f6' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: view === id ? '#fff' : '#64748b',
          padding: '5px 14px', fontSize: 11, fontWeight: 600,
          transition: 'background 0.15s',
        }}>
          {icon} {label}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status, lanCount }) {
  const colors = { connected: '#22c55e', connecting: '#f59e0b', disconnected: '#ef4444', error: '#ef4444' }
  const labels = { connected: 'Live', connecting: 'Connexion…', disconnected: 'Déconnecté', error: 'Erreur' }
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 20, padding: '5px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors[status] || '#94a3b8' }} />
      <span style={{ fontSize: 11, color: '#e2e8f0' }}>{labels[status] || status}</span>
      {lanCount > 0 && (
        <span style={{ fontSize: 11, color: '#f97316', borderLeft: '1px solid #334155', paddingLeft: 8 }}>
          {lanCount} device{lanCount > 1 ? 's' : ''} LAN
        </span>
      )}
    </div>
  )
}

function Legend() {
  const items = [
    { icon: '🔀', label: 'Router' },
    { icon: '📱', label: 'Phone' },
    { icon: '🖥️', label: 'PC' },
    { icon: '🏠', label: 'IoT' },
    { color: '#22c55e', label: 'HTTPS' },
    { color: '#f59e0b', label: 'Tracking' },
    { color: '#6366f1', label: 'CDN' },
    { color: '#38bdf8', label: 'DNS' },
    { color: '#ef4444', label: '⚠ Alerte' },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 8, padding: '10px 14px',
    }}>
      {items.map(({ color, label, icon }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {icon
            ? <span style={{ fontSize: 12 }}>{icon}</span>
            : <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          }
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}
