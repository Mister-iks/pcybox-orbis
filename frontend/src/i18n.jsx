import { createContext, useContext, useState } from 'react'

const en = {
  // Navigation
  nav_graph: 'Graph',
  nav_map: 'Map',

  // Status badge
  status_connected: 'Live',
  status_connecting: 'Connecting…',
  status_disconnected: 'Disconnected',
  status_error: 'Error',
  lan_devices: n => `${n} device${n > 1 ? 's' : ''} LAN`,

  // Legend
  legend_alert: 'Alert',
  legend_unknown: 'Unknown',

  // Sidebar header + stats
  tagline: 'Map the invisible.',
  stat_lan: 'LAN Devices',
  stat_ext: 'Ext. hosts',
  stat_traffic: 'Traffic',

  // Sidebar sections
  section_lan: n => `LAN Devices (${n})`,
  section_ext: (n, total) => total ? `External hosts (${n}/${total})` : `External hosts (${n})`,
  section_packets: 'Recent traffic',

  // Node detail field labels
  field_ip: 'IP',
  field_mac: 'MAC',
  field_hostname: 'Hostname',
  field_vendor: 'Vendor',
  field_type: 'Type',
  field_country: 'Country',
  field_city: 'City',
  field_org: 'Org',
  field_category: 'Category',
  field_traffic: 'Traffic',
  field_packets: 'Packets',
  processes: 'Processes',
  online: 'online',
  offline: 'offline',

  // Search
  search_placeholder: 'Search host, IP, country…',
  cat_all: 'All',
  cat_unknown: 'Unknown',

  // Alert panel
  alerts_title: 'Alerts',
  alerts_total: 'total',
  alerts_empty: 'No alerts yet',
  alert_NEW_HOST: 'New host',
  alert_SUSPICIOUS_PROCESS: 'Suspicious process',
  alert_SUSPICIOUS_PORT: 'Suspicious port',
  alert_BEACON: 'Beacon C2',
  alert_VOLUME_SPIKE: 'Traffic spike',
  alert_NEW_LAN_DEVICE: 'New device',
  alert_DEVICE_OFFLINE: 'Device offline',
  time_just_now: 'just now',
  time_seconds: n => `${n}s ago`,
  time_minutes: n => `${n}min ago`,
  time_hours: n => `${n}h ago`,

  // Privacy score
  privacy_title: 'Privacy Score',
  privacy_critical_label: 'Critical',
  privacy_excellent_label: 'Excellent',
  privacy_risk_factors: n => `${n} risk factor${n !== 1 ? 's' : ''}`,
  privacy_more_factors: n => `+${n} more factor${n > 1 ? 's' : ''}`,
  privacy_label_excellent: 'Excellent',
  privacy_label_good: 'Good',
  privacy_label_average: 'Average',
  privacy_label_weak: 'Weak',
  privacy_label_critical: 'Critical',

  // Timeline
  timeline_packets: n => `${n.toLocaleString()} packets`,
  timeline_alerts: n => `${n} alert${n > 1 ? 's' : ''}`,

  // Map
  map_you: 'You',
  map_located: n => `${n} located host${n !== 1 ? 's' : ''}`,
  map_no_geo: 'no geo',

  // Scoring factor labels (key + args)
  score_trackers: n => `${n} tracker${n > 1 ? 's' : ''} contacted`,
  score_tracker_traffic: pct => `${pct}% traffic to trackers`,
  score_ad_networks: n => `${n} ad network${n > 1 ? 's' : ''}`,
  score_beacons: n => `${n} beacon behavior${n > 1 ? 's' : ''}`,
  score_susp_proc: n => `${n} suspicious process${n > 1 ? 'es' : ''}`,
  score_susp_ports: n => `${n} dangerous port${n > 1 ? 's' : ''}`,
  score_critical_alerts: n => `${n} critical alert${n > 1 ? 's' : ''}`,
  score_warnings: n => `${n} warnings`,
  score_https_ratio: pct => `${pct}% HTTPS traffic`,
  score_no_trackers: 'No trackers detected',
}

const fr = {
  // Navigation
  nav_graph: 'Graphe',
  nav_map: 'Carte',

  // Status badge
  status_connected: 'Live',
  status_connecting: 'Connexion…',
  status_disconnected: 'Déconnecté',
  status_error: 'Erreur',
  lan_devices: n => `${n} device${n > 1 ? 's' : ''} LAN`,

  // Legend
  legend_alert: 'Alerte',
  legend_unknown: 'Inconnu',

  // Sidebar header + stats
  tagline: 'Map the invisible.',
  stat_lan: 'Devices LAN',
  stat_ext: 'Hôtes ext.',
  stat_traffic: 'Trafic',

  // Sidebar sections
  section_lan: n => `Devices LAN (${n})`,
  section_ext: (n, total) => total ? `Hôtes externes (${n}/${total})` : `Hôtes externes (${n})`,
  section_packets: 'Flux récents',

  // Node detail field labels
  field_ip: 'IP',
  field_mac: 'MAC',
  field_hostname: 'Hostname',
  field_vendor: 'Vendor',
  field_type: 'Type',
  field_country: 'Pays',
  field_city: 'Ville',
  field_org: 'Org',
  field_category: 'Catégorie',
  field_traffic: 'Trafic',
  field_packets: 'Paquets',
  processes: 'Processus',
  online: 'online',
  offline: 'offline',

  // Search
  search_placeholder: 'Rechercher hôte, IP, pays…',
  cat_all: 'Tout',
  cat_unknown: 'Inconnu',

  // Alert panel
  alerts_title: 'Alertes',
  alerts_total: 'total',
  alerts_empty: "Aucune alerte pour l'instant",
  alert_NEW_HOST: 'Nouvel hôte',
  alert_SUSPICIOUS_PROCESS: 'Processus suspect',
  alert_SUSPICIOUS_PORT: 'Port suspect',
  alert_BEACON: 'Beacon C2',
  alert_VOLUME_SPIKE: 'Pic de trafic',
  alert_NEW_LAN_DEVICE: 'Nouveau device',
  alert_DEVICE_OFFLINE: 'Device hors ligne',
  time_just_now: "à l'instant",
  time_seconds: n => `il y a ${n}s`,
  time_minutes: n => `il y a ${n}min`,
  time_hours: n => `il y a ${n}h`,

  // Privacy score
  privacy_title: 'Privacy Score',
  privacy_critical_label: 'Critique',
  privacy_excellent_label: 'Excellent',
  privacy_risk_factors: n => `${n} facteur${n !== 1 ? 's' : ''} de risque`,
  privacy_more_factors: n => `+${n} autre${n > 1 ? 's' : ''} facteur${n > 1 ? 's' : ''}`,
  privacy_label_excellent: 'Excellente',
  privacy_label_good: 'Bonne',
  privacy_label_average: 'Moyenne',
  privacy_label_weak: 'Faible',
  privacy_label_critical: 'Critique',

  // Timeline
  timeline_packets: n => `${n.toLocaleString('fr-FR')} paquets`,
  timeline_alerts: n => `${n} alerte${n > 1 ? 's' : ''}`,

  // Map
  map_you: 'Vous',
  map_located: n => `${n} hôte${n !== 1 ? 's' : ''} localisé${n !== 1 ? 's' : ''}`,
  map_no_geo: 'sans géo',

  // Scoring factor labels
  score_trackers: n => `${n} tracker${n > 1 ? 's' : ''} contacté${n > 1 ? 's' : ''}`,
  score_tracker_traffic: pct => `${pct}% trafic vers trackers`,
  score_ad_networks: n => `${n} régie${n > 1 ? 's' : ''} publicitaire${n > 1 ? 's' : ''}`,
  score_beacons: n => `${n} comportement${n > 1 ? 's' : ''} beacon`,
  score_susp_proc: n => `${n} processus suspect${n > 1 ? 's' : ''}`,
  score_susp_ports: n => `${n} port${n > 1 ? 's' : ''} dangereux`,
  score_critical_alerts: n => `${n} alerte${n > 1 ? 's' : ''} critique${n > 1 ? 's' : ''}`,
  score_warnings: n => `${n} alertes`,
  score_https_ratio: pct => `${pct}% trafic HTTPS`,
  score_no_trackers: 'Aucun tracker détecté',
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en')
  const dict = lang === 'fr' ? fr : en

  function t(key, ...args) {
    const val = dict[key]
    if (val === undefined) return key
    if (typeof val === 'function') return val(...args)
    return val
  }

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useT = () => useContext(I18nContext)
