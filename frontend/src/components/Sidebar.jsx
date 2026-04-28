import { Wifi, Smartphone, Monitor, Tv, Cpu, HelpCircle } from 'lucide-react'
import PrivacyScore from './PrivacyScore'
import BandwidthChart from './BandwidthChart'
import SearchBar from './SearchBar'

const DEVICE_ICONS = {
  router:  Wifi,
  phone:   Smartphone,
  pc:      Monitor,
  tv:      Tv,
  iot:     Cpu,
  unknown: HelpCircle,
}

const CATEGORY_COLORS = {
  safe: '#22c55e', tracking: '#f59e0b', cdn: '#6366f1',
  dns: '#38bdf8', admin: '#fb923c', unknown: '#94a3b8', local: '#3b82f6',
}

function fmt(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function matchesFilter(node, filter) {
  if (!filter || (filter.category === 'all' && !filter.text)) return true
  if (filter.category !== 'all' && node.category !== filter.category) return false
  if (filter.text) {
    const t = filter.text.toLowerCase()
    return (node.label   || '').toLowerCase().includes(t)
        || (node.ip      || '').toLowerCase().includes(t)
        || (node.country || '').toLowerCase().includes(t)
        || (node.org     || '').toLowerCase().includes(t)
  }
  return true
}

export default function Sidebar({ nodes, lanDevices, packets, selected, onClose, privacyScore, bandwidth, filter, onFilterChange }) {
  const extNodes = Object.values(nodes).filter(n => n.id !== 'local')
  const devList  = Object.values(lanDevices)
  const totalBytes = extNodes.reduce((a, n) => a + (n.bytes || 0), 0)

  const filteredNodes = extNodes.filter(n => matchesFilter(n, filter))

  return (
    <div style={{
      width: 300, height: '100vh', background: '#1e293b',
      borderRight: '1px solid #334155', display: 'flex',
      flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 8px', borderBottom: '1px solid #334155' }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#f7b016', letterSpacing: 3, fontWeight: 600 }}>PCYBOX</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', letterSpacing: 1 }}>ORBIS</span>
          </div>
          <span style={{ fontSize: 10, color: '#475569', letterSpacing: 1 }}>Map the invisible.</span>
        </div>
        <BandwidthChart data={bandwidth || []} />
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Stat label="Devices LAN" value={devList.length} color="#f97316" />
          <Stat label="Hôtes ext." value={extNodes.length} />
          <Stat label="Trafic" value={fmt(totalBytes)} />
        </div>
      </div>

      {/* Privacy Score */}
      {privacyScore && (
        <PrivacyScore
          score={privacyScore.score}
          grade={privacyScore.grade}
          color={privacyScore.color}
          label={privacyScore.label}
          factors={privacyScore.factors}
        />
      )}

      {/* Selected node detail */}
      {selected && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #334155', background: '#0f172a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
              {selected.label || selected.ip}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <NodeDetail node={selected} />
        </div>
      )}

      {/* Search / Filter */}
      <SearchBar filter={filter} onChange={onFilterChange} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* LAN devices */}
        {devList.length > 0 && (
          <>
            <SectionTitle label={`Devices LAN (${devList.length})`} />
            {devList.map(d => <DeviceRow key={d.id} device={d} />)}
          </>
        )}

        {/* External hosts */}
        <SectionTitle label={`Hôtes externes (${filteredNodes.length}${filteredNodes.length < extNodes.length ? `/${extNodes.length}` : ''})`} />
        {filteredNodes
          .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
          .map(n => <NodeRow key={n.id} node={n} />)}
      </div>

      {/* Live packet feed */}
      <div style={{ borderTop: '1px solid #334155', maxHeight: 160, overflowY: 'auto' }}>
        <SectionTitle label="Flux récents" />
        {packets.slice(0, 25).map((p, i) => <PacketRow key={i} packet={p} />)}
      </div>
    </div>
  )
}

function SectionTitle({ label }) {
  return (
    <div style={{ padding: '5px 20px', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, background: '#1e293b', position: 'sticky', top: 0 }}>
      {label}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || '#f1f5f9' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
    </div>
  )
}

function DeviceRow({ device }) {
  const Icon = DEVICE_ICONS[device.device_type] || HelpCircle
  return (
    <div style={{
      padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: '1px solid #1e293b',
      opacity: device.online === false ? 0.45 : 1,
    }}>
      <Icon size={16} color={device.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.hostname || device.vendor || device.ip}
        </div>
        <div style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
          {device.ip} · {device.mac}
        </div>
      </div>
      <div style={{ fontSize: 9, color: device.online === false ? '#ef4444' : '#22c55e', flexShrink: 0 }}>
        {device.online === false ? 'offline' : 'online'}
      </div>
    </div>
  )
}

function NodeRow({ node }) {
  return (
    <div style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1e293b' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLORS[node.category] || '#94a3b8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label || node.ip}
        </div>
        <div style={{ fontSize: 9, color: '#64748b' }}>{node.country || '—'} · {node.packets || 0} pkt</div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{fmt(node.bytes || 0)}</div>
    </div>
  )
}

function NodeDetail({ node }) {
  const fields = [
    ['IP',        node.ip],
    ['MAC',       node.mac],
    ['Hostname',  node.hostname],
    ['Vendor',    node.vendor],
    ['Type',      node.device_type],
    ['Pays',      node.country],
    ['Ville',     node.city],
    ['Org',       node.org],
    ['Catégorie', node.category],
    ['Trafic',    fmt(node.bytes || 0)],
    ['Paquets',   node.packets],
  ]

  const processes = node.processes
    ? Object.entries(node.processes).sort(([, a], [, b]) => b.bytes - a.bytes).slice(0, 5)
    : []

  return (
    <div>
      {fields.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>{k}</span>
          <span style={{ fontSize: 10, color: '#e2e8f0', maxWidth: 170, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
        </div>
      ))}

      {processes.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 }}>
            Processus
          </div>
          {processes.map(([name, stats]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                {name}
              </span>
              <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>{fmt(stats.bytes)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function PacketRow({ packet }) {
  const out   = packet.direction === 'out'
  const color = out ? '#22c55e' : '#3b82f6'
  return (
    <div style={{ padding: '3px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color, fontSize: 10, flexShrink: 0 }}>{out ? '→' : '←'}</span>
      {packet.process && (
        <span style={{ fontSize: 9, color: '#f59e0b', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {packet.process}
        </span>
      )}
      <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {packet.dst} · {packet.protocol}
      </span>
      <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>{packet.size}B</span>
    </div>
  )
}
