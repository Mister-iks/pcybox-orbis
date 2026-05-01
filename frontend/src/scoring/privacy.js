const AD_ORGS = [
  'google', 'doubleclick', 'facebook', 'meta', 'amazon ads',
  'amazon advertising', 'twitter', 'tiktok', 'snap', 'pinterest',
  'taboola', 'outbrain', 'criteo', 'appnexus', 'pubmatic',
  'openx', 'rubicon', 'sharethrough', 'index exchange',
]

function isAdOrg(org) {
  if (!org) return false
  const lower = org.toLowerCase()
  return AD_ORGS.some(a => lower.includes(a))
}

export function computePrivacyScore(nodes, alerts) {
  const extNodes = Object.values(nodes).filter(n => n.id !== 'local')
  const totalBytes   = extNodes.reduce((a, n) => a + (n.bytes   || 0), 0)
  const totalPackets = extNodes.reduce((a, n) => a + (n.packets || 0), 0)

  const trackerNodes = extNodes.filter(n => n.category === 'tracking')
  const trackerBytes = trackerNodes.reduce((a, n) => a + (n.bytes || 0), 0)
  const adOrgNodes   = extNodes.filter(n => isAdOrg(n.org))

  const byType = type => alerts.filter(a => a.type === type).length
  const bySev  = sev  => alerts.filter(a => a.severity === sev).length

  const beaconCount   = byType('BEACON')
  const suspProcCount = byType('SUSPICIOUS_PROCESS')
  const suspPortCount = byType('SUSPICIOUS_PORT')
  const criticalCount = bySev('critical')
  const warningCount  = bySev('warning')

  let score = 100
  const factors = []

  if (trackerNodes.length > 0) {
    const p = Math.min(trackerNodes.length * 4, 28)
    score -= p
    factors.push({ icon: 'radio', key: 'score_trackers', args: [trackerNodes.length], penalty: p, bad: true })
  }

  if (totalBytes > 0 && trackerBytes > 0) {
    const pct = (trackerBytes / totalBytes) * 100
    if (pct > 3) {
      const p = Math.min(Math.floor(pct / 3), 15)
      score -= p
      factors.push({ icon: 'bar-chart', key: 'score_tracker_traffic', args: [pct.toFixed(0)], penalty: p, bad: true })
    }
  }

  if (adOrgNodes.length > trackerNodes.length) {
    const extra = adOrgNodes.length - trackerNodes.length
    const p = Math.min(extra * 3, 12)
    score -= p
    factors.push({ icon: 'target', key: 'score_ad_networks', args: [adOrgNodes.length], penalty: p, bad: true })
  }

  if (beaconCount > 0) {
    const p = Math.min(beaconCount * 12, 24)
    score -= p
    factors.push({ icon: 'activity', key: 'score_beacons', args: [beaconCount], penalty: p, bad: true })
  }

  if (suspProcCount > 0) {
    const p = Math.min(suspProcCount * 8, 20)
    score -= p
    factors.push({ icon: 'alert-triangle', key: 'score_susp_proc', args: [suspProcCount], penalty: p, bad: true })
  }

  if (suspPortCount > 0) {
    const p = Math.min(suspPortCount * 7, 18)
    score -= p
    factors.push({ icon: 'unlock', key: 'score_susp_ports', args: [suspPortCount], penalty: p, bad: true })
  }

  if (criticalCount > 0) {
    const p = Math.min(criticalCount * 10, 20)
    score -= p
    factors.push({ icon: 'shield-alert', key: 'score_critical_alerts', args: [criticalCount], penalty: p, bad: true })
  }

  if (warningCount > 5) {
    const p = Math.min((warningCount - 5) * 2, 10)
    score -= p
    factors.push({ icon: 'bell', key: 'score_warnings', args: [warningCount], penalty: p, bad: true })
  }

  const httpsNodes = extNodes.filter(n => n.category === 'safe')
  if (totalPackets > 0 && httpsNodes.length > 0) {
    const ratio = httpsNodes.reduce((a, n) => a + (n.packets || 0), 0) / totalPackets
    if (ratio > 0.7) {
      factors.push({ icon: 'lock', key: 'score_https_ratio', args: [Math.round(ratio * 100)], penalty: 0, bad: false })
    }
  }

  if (extNodes.length > 0 && trackerNodes.length === 0) {
    factors.push({ icon: 'check-circle', key: 'score_no_trackers', args: [], penalty: 0, bad: false })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const grade    = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'
  const color    = score >= 80 ? '#22c55e' : score >= 60 ? '#84cc16' : score >= 40 ? '#f59e0b' : score >= 20 ? '#f97316' : '#ef4444'
  const labelKey = score >= 80 ? 'privacy_label_excellent' : score >= 60 ? 'privacy_label_good' : score >= 40 ? 'privacy_label_average' : score >= 20 ? 'privacy_label_weak' : 'privacy_label_critical'

  return { score, grade, color, labelKey, factors }
}
