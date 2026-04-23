const CATEGORY_COLORS = {
  safe: '#22c55e',
  tracking: '#f59e0b',
  cdn: '#6366f1',
  dns: '#38bdf8',
  admin: '#fb923c',
  unknown: '#94a3b8',
  local: '#3b82f6',
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function Sidebar({ nodes, packets, selected, onClose }) {
  const nodeList = Object.values(nodes).filter(n => n.id !== 'local')
  const total = nodeList.reduce((acc, n) => acc + (n.bytes || 0), 0)

  return (
    <div style={{
      width: 300,
      height: '100vh',
      background: '#1e293b',
      borderRight: '1px solid #334155',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>NetGraph</h1>
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Live Network Monitor</p>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <Stat label="Hosts actifs" value={nodeList.length} />
          <Stat label="Total trafic" value={fmt(total)} />
          <Stat label="Paquets" value={packets.length} />
        </div>
      </div>

      {selected && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #334155', background: '#0f172a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>Détail</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <NodeDetail node={selected} />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <div style={{ padding: '6px 20px', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
          Hôtes ({nodeList.length})
        </div>
        {nodeList
          .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
          .map(node => (
            <NodeRow key={node.id} node={node} />
          ))}
      </div>

      <div style={{ borderTop: '1px solid #334155', padding: '8px 0', maxHeight: 180, overflowY: 'auto' }}>
        <div style={{ padding: '6px 20px', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
          Flux récents
        </div>
        {packets.slice(0, 20).map((p, i) => (
          <PacketRow key={i} packet={p} />
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
    </div>
  )
}

function NodeRow({ node }) {
  return (
    <div style={{
      padding: '6px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      borderBottom: '1px solid #1e293b',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[node.category] || '#94a3b8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label || node.ip}
        </div>
        <div style={{ fontSize: 9, color: '#64748b' }}>
          {node.country || 'Local'} · {node.packets || 0} pkt
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
        {fmt(node.bytes || 0)}
      </div>
    </div>
  )
}

function NodeDetail({ node }) {
  const fields = [
    ['IP', node.ip],
    ['Hostname', node.hostname || node.label],
    ['Pays', node.country],
    ['Ville', node.city],
    ['Organisation', node.org],
    ['Catégorie', node.category],
    ['Trafic', fmt(node.bytes || 0)],
    ['Paquets', node.packets],
  ]
  return (
    <div style={{ marginTop: 8 }}>
      {fields.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>{k}</span>
          <span style={{ fontSize: 10, color: '#e2e8f0', maxWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function PacketRow({ packet }) {
  const dir = packet.direction === 'out' ? '→' : '←'
  const color = packet.direction === 'out' ? '#22c55e' : '#3b82f6'
  return (
    <div style={{ padding: '3px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color, fontSize: 10, flexShrink: 0 }}>{dir}</span>
      <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {packet.process || packet.dst} · {packet.protocol}
      </span>
      <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>{packet.size}B</span>
    </div>
  )
}
