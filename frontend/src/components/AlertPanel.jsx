import {
  Bell, Info, AlertTriangle, AlertCircle,
  Globe, Cpu, WifiOff, Wifi,
  Activity, Unlock, TrendingUp, Shield,
} from 'lucide-react'

const SEVERITY_STYLES = {
  info:     { color: '#38bdf8', Icon: Info,          bg: '#0c2340' },
  warning:  { color: '#f59e0b', Icon: AlertTriangle, bg: '#2d1a00' },
  critical: { color: '#ef4444', Icon: AlertCircle,   bg: '#2d0000' },
}

const TYPE_META = {
  NEW_HOST:           { label: 'Nouvel hôte',         Icon: Globe          },
  SUSPICIOUS_PROCESS: { label: 'Processus suspect',   Icon: AlertTriangle  },
  SUSPICIOUS_PORT:    { label: 'Port suspect',        Icon: Unlock         },
  BEACON:             { label: 'Beacon C2',           Icon: Activity       },
  VOLUME_SPIKE:       { label: 'Pic de trafic',       Icon: TrendingUp     },
  NEW_LAN_DEVICE:     { label: 'Nouveau device',      Icon: Wifi           },
  DEVICE_OFFLINE:     { label: 'Device hors ligne',   Icon: WifiOff        },
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso + 'Z')) / 1000)
  if (diff < 5)   return "à l'instant"
  if (diff < 60)  return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  return `il y a ${Math.floor(diff / 3600)}h`
}

export function AlertBell({ unread, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', background: '#1e293b',
      border: '1px solid #334155', borderRadius: 20,
      padding: '5px 14px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
      color: unread > 0 ? '#f59e0b' : '#64748b',
    }}>
      <Bell size={14} />
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <AlertCircle size={16} />
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {alerts.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            Aucune alerte pour l'instant
          </div>
        )}
        {alerts.map(alert => <AlertRow key={alert.id} alert={alert} />)}
      </div>
    </div>
  )
}

function AlertRow({ alert }) {
  const sev  = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
  const meta = TYPE_META[alert.type] || { label: alert.type, Icon: Info }
  const TypeIcon = meta.Icon
  const SevIcon  = sev.Icon

  return (
    <div style={{
      padding: '10px 18px', borderBottom: '1px solid #1e293b',
      borderLeft: `3px solid ${sev.color}`, background: sev.bg,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <SevIcon size={14} color={sev.color} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <TypeIcon size={11} color={sev.color} />
              <span style={{ fontSize: 10, color: sev.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {meta.label}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.4 }}>{alert.message}</div>
            {alert.details && Object.keys(alert.details).length > 0 && (
              <div style={{ marginTop: 3, fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
                {Object.entries(alert.details).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}
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
      borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px',
    }}>
      {count}
    </span>
  )
}

export function AlertToasts({ alerts }) {
  const visible = alerts.filter(a => a.severity !== 'info').slice(0, 3)
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none', zIndex: 300,
    }}>
      {visible.map((alert, i) => <Toast key={alert.id} alert={alert} index={i} />)}
    </div>
  )
}

function Toast({ alert, index }) {
  const sev  = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
  const meta = TYPE_META[alert.type] || { label: alert.type, Icon: Info }
  const TypeIcon = meta.Icon

  return (
    <div style={{
      background: '#1e293b', border: `1px solid ${sev.color}`,
      borderRadius: 8, padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: `0 4px 20px ${sev.color}33`,
      opacity: 1 - index * 0.25,
      transform: `scale(${1 - index * 0.03})`,
      maxWidth: 340,
    }}>
      <TypeIcon size={16} color={sev.color} />
      <div>
        <div style={{ fontSize: 10, color: sev.color, fontWeight: 700 }}>{meta.label}</div>
        <div style={{ fontSize: 11, color: '#e2e8f0' }}>{alert.message}</div>
      </div>
    </div>
  )
}
