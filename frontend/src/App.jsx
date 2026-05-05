import { useState, useMemo, useRef, useEffect } from 'react'
import { Hexagon, Globe, Wifi, Smartphone, Monitor, Cpu, ShieldCheck, Radio, Zap, HelpCircle, AlertTriangle, Square, Play, Filter } from 'lucide-react'
import ForceGraph from './graph/ForceGraph'
import MapView from './map/MapView'
import Sidebar from './components/Sidebar'
import { AlertBell, AlertPanel, AlertToasts } from './components/AlertPanel'
import Timeline from './components/Timeline'
import { useWebSocket } from './hooks/useWebSocket'
import { computePrivacyScore } from './scoring/privacy'
import { WS_URL } from './api'
import { useT } from './i18n'

export default function App() {
  const { nodes, edges, lanDevices, packets, alerts, unread, clearUnread, status, bandwidth, capturing, toggleCapture, portFilter, updatePortFilter } = useWebSocket(WS_URL)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('graph')
  const [showAlerts, setShowAlerts] = useState(false)
  const [filter, setFilter] = useState({ text: '', category: 'all' })
  const [excludedProcesses, setExcludedProcesses] = useState([])

  const alertedNodes = useMemo(() =>
    new Set(alerts.map(a => a.node_id).filter(Boolean)),
    [alerts]
  )

  const filteredNodes = useMemo(() => {
    if (excludedProcesses.length === 0) return nodes
    const out = {}
    for (const [id, node] of Object.entries(nodes)) {
      if (id === 'local') { out[id] = node; continue }
      const procs = node.processes ? Object.keys(node.processes) : []
      if (procs.length > 0 && procs.every(p => excludedProcesses.includes(p))) continue
      out[id] = node
    }
    return out
  }, [nodes, excludedProcesses])

  const filteredEdges = useMemo(() => {
    if (excludedProcesses.length === 0) return edges
    const visibleIds = new Set([...Object.keys(filteredNodes), ...Object.keys(lanDevices)])
    const out = {}
    for (const [id, edge] of Object.entries(edges)) {
      if (visibleIds.has(edge.source) && visibleIds.has(edge.target)) out[id] = edge
    }
    return out
  }, [edges, filteredNodes, lanDevices, excludedProcesses])

  const filteredPackets = useMemo(() =>
    excludedProcesses.length === 0
      ? packets
      : packets.filter(p => !p.process || !excludedProcesses.includes(p.process)),
    [packets, excludedProcesses]
  )

  const privacyScore = useMemo(() =>
    computePrivacyScore(nodes, alerts),
    [nodes, alerts]
  )

  function handleBell() {
    setShowAlerts(v => !v)
    clearUnread()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        nodes={filteredNodes}
        lanDevices={lanDevices}
        packets={filteredPackets}
        selected={selected}
        onClose={() => setSelected(null)}
        privacyScore={privacyScore}
        bandwidth={bandwidth}
        filter={filter}
        onFilterChange={setFilter}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {view === 'graph' && (
            <ForceGraph
              nodes={filteredNodes}
              edges={filteredEdges}
              lanDevices={lanDevices}
              alertedNodes={alertedNodes}
              onNodeClick={setSelected}
              filter={filter}
            />
          )}
          {view === 'map' && (
            <MapView nodes={filteredNodes} onNodeClick={setSelected} />
          )}

          <div style={{
            position: 'absolute', top: 16, right: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <LangToggle />
            <ViewToggle view={view} onChange={setView} />
            <ProcessFilter excluded={excludedProcesses} onChange={setExcludedProcesses} nodes={nodes} />
            <PortFilter ports={portFilter} onUpdate={updatePortFilter} />
            <CaptureToggle capturing={capturing} onToggle={toggleCapture} />
            <AlertBell unread={unread} onClick={handleBell} />
            <StatusBadge status={status} lanCount={Object.keys(lanDevices).length} />
          </div>

          {showAlerts && (
            <AlertPanel alerts={alerts} onClose={() => setShowAlerts(false)} />
          )}

          <AlertToasts alerts={alerts.filter(a => a.severity !== 'info').slice(0, 3)} />

          {view === 'graph' && <Legend />}
        </div>

        <Timeline />
      </div>
    </div>
  )
}

function ProcessFilter({ excluded, onChange, nodes }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const allProcesses = useMemo(() => {
    const set = new Set()
    Object.values(nodes).forEach(n => {
      if (n.processes) Object.keys(n.processes).forEach(p => set.add(p))
    })
    return Array.from(set).sort()
  }, [nodes])

  function toggle(proc) {
    onChange(excluded.includes(proc)
      ? excluded.filter(p => p !== proc)
      : [...excluded, proc]
    )
  }

  const active = excluded.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: active ? '#3b1f2b' : '#1e293b',
        border: `1px solid ${active ? '#f87171' : '#334155'}`,
        borderRadius: 20, padding: '5px 14px',
        cursor: 'pointer', color: active ? '#fca5a5' : '#64748b',
        fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
      }}>
        {t('process_filter')}
        {active && (
          <span style={{
            background: '#ef4444', color: '#fff',
            borderRadius: 10, padding: '0 6px', fontSize: 10,
          }}>{excluded.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 100,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 10, padding: 12, minWidth: 220, maxHeight: 300,
          overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            {t('process_filter_hint')}
          </div>

          {allProcesses.length === 0 && (
            <div style={{ fontSize: 11, color: '#475569' }}>{t('process_none')}</div>
          )}

          {allProcesses.map(proc => {
            const isExcluded = excluded.includes(proc)
            return (
              <div key={proc} onClick={() => toggle(proc)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 6px', borderRadius: 6, cursor: 'pointer',
                background: isExcluded ? '#2d1b1b' : 'transparent',
                marginBottom: 2,
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                  border: `1px solid ${isExcluded ? '#ef4444' : '#475569'}`,
                  background: isExcluded ? '#ef4444' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isExcluded && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✕</span>}
                </div>
                <span style={{ fontSize: 11, color: isExcluded ? '#fca5a5' : '#e2e8f0' }}>
                  {proc}
                </span>
              </div>
            )
          })}

          {active && (
            <button onClick={() => onChange([])} style={{
              marginTop: 8, width: '100%', background: 'none',
              border: '1px solid #334155', borderRadius: 6,
              padding: '4px 0', color: '#64748b', fontSize: 10,
              cursor: 'pointer',
            }}>
              {t('process_clear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PortFilter({ ports, onUpdate }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function addPort(e) {
    e.preventDefault()
    const p = parseInt(input, 10)
    if (!p || p < 1 || p > 65535) { setError(true); return }
    if (ports.includes(p)) { setInput(''); return }
    setError(false)
    setInput('')
    onUpdate([...ports, p])
  }

  function removePort(p) {
    onUpdate(ports.filter(x => x !== p))
  }

  const active = ports.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: active ? '#1e3a5f' : '#1e293b',
        border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
        borderRadius: 20, padding: '5px 14px',
        cursor: 'pointer', color: active ? '#93c5fd' : '#64748b',
        fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
      }}>
        <Filter size={11} />
        {t('port_filter')}
        {active && (
          <span style={{
            background: '#3b82f6', color: '#fff',
            borderRadius: 10, padding: '0 6px', fontSize: 10,
          }}>{ports.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 100,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 10, padding: 12, minWidth: 220,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            {active ? `${ports.length} port${ports.length > 1 ? 's' : ''} actif${ports.length > 1 ? 's' : ''}` : t('port_all')}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: ports.length ? 10 : 0 }}>
            {ports.map(p => (
              <span key={p} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: '#0f172a', border: '1px solid #3b82f6',
                borderRadius: 12, padding: '2px 8px',
                fontSize: 11, color: '#93c5fd',
              }}>
                {p}
                <button onClick={() => removePort(p)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', padding: 0, lineHeight: 1, fontSize: 13,
                }}>×</button>
              </span>
            ))}
          </div>

          <form onSubmit={addPort} style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              placeholder={t('port_placeholder')}
              style={{
                flex: 1, background: '#0f172a',
                border: `1px solid ${error ? '#ef4444' : '#334155'}`,
                borderRadius: 6, padding: '5px 8px',
                color: '#e2e8f0', fontSize: 11, outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: '#3b82f6', border: 'none', borderRadius: 6,
              padding: '5px 10px', color: '#fff', fontSize: 11,
              cursor: 'pointer', fontWeight: 600,
            }}>+</button>
          </form>
          {error && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>{t('port_invalid')}</div>}

          {active && (
            <button onClick={() => onUpdate([])} style={{
              marginTop: 10, width: '100%', background: 'none',
              border: '1px solid #334155', borderRadius: 6,
              padding: '4px 0', color: '#64748b', fontSize: 10,
              cursor: 'pointer',
            }}>
              {t('port_all')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CaptureToggle({ capturing, onToggle }) {
  const { t } = useT()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await onToggle()
    setLoading(false)
  }

  const label = loading
    ? (capturing ? t('capture_stopping') : t('capture_starting'))
    : (capturing ? t('capture_stop') : t('capture_start'))

  const Icon = capturing ? Square : Play

  return (
    <button onClick={handleClick} disabled={loading} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: capturing ? '#1e293b' : '#166534',
      border: `1px solid ${capturing ? '#334155' : '#16a34a'}`,
      borderRadius: 20, padding: '5px 14px',
      cursor: loading ? 'wait' : 'pointer',
      color: capturing ? '#f87171' : '#4ade80',
      fontSize: 11, fontWeight: 600,
      transition: 'all 0.15s',
      opacity: loading ? 0.7 : 1,
    }}>
      <Icon size={11} />
      {label}
    </button>
  )
}

function LangToggle() {
  const { lang, setLang } = useT()
  return (
    <div style={{
      display: 'flex', background: '#1e293b',
      border: '1px solid #334155', borderRadius: 20, overflow: 'hidden',
    }}>
      {['en', 'fr'].map(l => (
        <button key={l} onClick={() => setLang(l)} style={{
          background: lang === l ? '#3b82f6' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: lang === l ? '#fff' : '#64748b',
          padding: '5px 12px', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase',
          transition: 'background 0.15s',
        }}>
          {l}
        </button>
      ))}
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  const { t } = useT()
  const items = [
    { id: 'graph', Icon: Hexagon, label: t('nav_graph') },
    { id: 'map',   Icon: Globe,   label: t('nav_map')   },
  ]
  return (
    <div style={{
      display: 'flex', background: '#1e293b',
      border: '1px solid #334155', borderRadius: 20, overflow: 'hidden',
    }}>
      {items.map(({ id, Icon, label }) => (
        <button key={id} onClick={() => onChange(id)} style={{
          background: view === id ? '#3b82f6' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: view === id ? '#fff' : '#64748b',
          padding: '5px 14px', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'background 0.15s',
        }}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status, lanCount }) {
  const { t } = useT()
  const colors = { connected: '#22c55e', connecting: '#f59e0b', disconnected: '#ef4444', error: '#ef4444' }
  const labels = {
    connected:    t('status_connected'),
    connecting:   t('status_connecting'),
    disconnected: t('status_disconnected'),
    error:        t('status_error'),
  }
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
          {t('lan_devices', lanCount)}
        </span>
      )}
    </div>
  )
}

function Legend() {
  const { t } = useT()
  const items = [
    { Icon: Wifi,          color: '#f97316', label: 'Router'          },
    { Icon: Smartphone,    color: '#a855f7', label: 'Phone'           },
    { Icon: Monitor,       color: '#06b6d4', label: 'PC'              },
    { Icon: Cpu,           color: '#84cc16', label: 'IoT'             },
    { Icon: ShieldCheck,   color: '#22c55e', label: 'HTTPS'           },
    { Icon: Radio,         color: '#f59e0b', label: 'Tracking'        },
    { Icon: Zap,           color: '#6366f1', label: 'CDN'             },
    { Icon: Globe,         color: '#38bdf8', label: 'DNS'             },
    { Icon: AlertTriangle, color: '#ef4444', label: t('legend_alert') },
    { Icon: HelpCircle,    color: '#94a3b8', label: t('legend_unknown') },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 8, padding: '10px 14px',
    }}>
      {items.map(({ Icon, color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon size={12} color={color} />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}
