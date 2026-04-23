import { useEffect, useRef } from 'react'

const SEVERITY = {
  info:     { color: '#38bdf8', icon: 'ℹ️', bg: '#0c2340' },
  warning:  { color: '#f59e0b', icon: '⚠️', bg: '#2d1a00' },
  critical: { color: '#ef4444', icon: '🚨', bg: '#2d0000' },
}

const TYPE_LABELS = {
  NEW_HOST:           'Nouvel hôte',
  SUSPICIOUS_PROCESS: 'Processus suspect',
  SUSPICIOUS_PORT:    'Port suspect',
  BEACON:             'Beacon C2',
  VOLUME_SPIKE:       'Pic de trafic',
  NEW_LAN_DEVICE:     'Nouveau device',
  DEVICE_OFFLINE:     'Device hors ligne',
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso + 'Z')) / 1000)
  if (diff < 5)  return 'à l\'instant'
  if (diff < 60) return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  return `il y a ${Math.floor(diff / 3600)}h`
}

export function AlertBell({ unread, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', background: '#1e293b',
        border: '1px solid #334155', borderRadius: 20,
        padding: '5px 14px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        color: unread > 0 ? '#f59e0b' : '#64748b',
        fontSize: 13, transition: 'color 0.15s',
      }}
    >
      🔔
      {unread > 0 && (
        <span style={{
          background: '#ef4444', color: '#fff',
          borderRadius: 10, fontSize: 9, fontWeight: 700,
          padding: '1px 5px', minWidth: 16, textAlign: 'center',
        }}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

export function AlertPanel({ alerts, onClose }) {
  const warningCount  = alerts.filter(a => a.severity === 'warning').length
  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const infoCount     = alerts.filter(a => a.severity === 'info').length

  return (
    <div style={{
      position: 'absolute', top: 56, right: 16, zIndex: 200,
      width: 380, maxHeight: 'calc(100vh - 80px)',
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #334155',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Alertes</span>
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{alerts.length} total</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {criticalCount > 0 && <Badge count={criticalCount} color="#ef4444" />}
          {warningCount  > 0 && <Badge count={warningCount}  color="#f59e0b" />}
          {infoCount     > 0 && <Badge count={infoCount}     color="#38bdf8" />}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      </div>

      {/* Alert list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {alerts.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            Aucune alerte pour l'instant
          </div>
        )}
        {alerts.map(alert => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  )
}

function AlertRow({ alert }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.info
  return (
    <div style={{
      padding: '10px 18px',
      borderBottom: '1px solid #1e293b',
      borderLeft: `3px solid ${sev.color}`,
      background: sev.bg,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{sev.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: sev.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              {TYPE_LABELS[alert.type] || alert.type}
            </div>
            <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.4 }}>
              {alert.message}
            </div>
            {alert.details && Object.keys(alert.details).length > 0 && (
              <div style={{ marginTop: 4, fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
                {Object.entries(alert.details)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </div>
            )}
          </div>
        </div>
        <span style={{ fontSize: 9, color: '#475569', flexShrink: 0, marginTop: 2 }}>
          {timeAgo(alert.timestamp)}
        </span>
      </div>
    </div>
  )
}

function Badge({ count, color }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 10, fontSize: 10, fontWeight: 700,
      padding: '1px 7px',
    }}>
      {count}
    </span>
  )
}

// ── Toast notifications ───────────────────────────────────────────────────────

export function AlertToasts({ alerts }) {
  const recent = alerts.slice(0, 4)
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none', zIndex: 300,
    }}>
      {recent.map((alert, i) => (
        <Toast key={alert.id} alert={alert} index={i} />
      ))}
    </div>
  )
}

function Toast({ alert, index }) {
  const sev = SEVERITY[alert.severity] || SEVERITY.info
  if (alert.severity === 'info') return null // only show warning+

  return (
    <div style={{
      background: '#1e293b', border: `1px solid ${sev.color}`,
      borderRadius: 8, padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: `0 4px 20px ${sev.color}33`,
      opacity: 1 - index * 0.25,
      transform: `scale(${1 - index * 0.03})`,
      transition: 'all 0.2s',
      maxWidth: 340,
    }}>
      <span style={{ fontSize: 14 }}>{sev.icon}</span>
      <div>
        <div style={{ fontSize: 10, color: sev.color, fontWeight: 700 }}>
          {TYPE_LABELS[alert.type] || alert.type}
        </div>
        <div style={{ fontSize: 11, color: '#e2e8f0' }}>{alert.message}</div>
      </div>
    </div>
  )
}
