import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { API_BASE } from '../api'

const EXPANDED_H = 110
const COLLAPSED_H = 32

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtMinute(iso) {
  const d = new Date(iso + ':00Z')
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function Timeline() {
  const svgRef = useRef(null)
  const [data, setData] = useState([])
  const [expanded, setExpanded] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const [range, setRange] = useState(60)

  const fetchTimeline = useCallback(() => {
    fetch(`${API_BASE}/timeline?minutes=${range}`)
      .then(r => r.json())
      .then(d => setData(d.timeline || []))
      .catch(() => {})
  }, [range])

  useEffect(() => {
    fetchTimeline()
    const id = setInterval(fetchTimeline, 15000)
    return () => clearInterval(id)
  }, [fetchTimeline])

  useEffect(() => {
    if (!expanded || !svgRef.current || data.length === 0) return
    drawChart()
  }, [data, expanded])

  function drawChart() {
    const el = svgRef.current
    const W = el.clientWidth
    const H = EXPANDED_H - 32  // leave room for header
    const margin = { top: 8, right: 16, bottom: 24, left: 40 }
    const innerW = W - margin.left - margin.right
    const innerH = H - margin.top - margin.bottom

    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand()
      .domain(data.map(d => d.minute))
      .range([0, innerW])
      .padding(0.15)

    const maxPkts = d3.max(data, d => d.packets) || 1
    const y = d3.scaleLinear().domain([0, maxPkts]).range([innerH, 0]).nice()

    // Grid lines
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(3).tickSize(-innerW).tickFormat(''))
      .selectAll('line').attr('stroke', '#1e3a5f').attr('stroke-dasharray', '3,3')
    g.select('.grid .domain').remove()

    // Bars
    g.selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.minute))
      .attr('y', d => y(d.packets))
      .attr('width', x.bandwidth())
      .attr('height', d => innerH - y(d.packets))
      .attr('fill', d => d.alerts > 0 ? '#f59e0b' : '#3b82f6')
      .attr('fill-opacity', d => d.alerts > 0 ? 0.85 : 0.65)
      .attr('rx', 2)
      .on('mouseover', (e, d) => setTooltip({ x: e.clientX, y: e.clientY, d }))
      .on('mousemove', (e) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null))
      .on('mouseout', () => setTooltip(null))

    // Alert dots on top of alert bars
    g.selectAll('circle.alert')
      .data(data.filter(d => d.alerts > 0))
      .join('circle')
      .attr('class', 'alert')
      .attr('cx', d => x(d.minute) + x.bandwidth() / 2)
      .attr('cy', d => y(d.packets) - 5)
      .attr('r', 3)
      .attr('fill', '#ef4444')
      .attr('pointer-events', 'none')

    // X axis — show only every N labels to avoid crowding
    const step = Math.max(1, Math.floor(data.length / 8))
    const xAxis = d3.axisBottom(x)
      .tickValues(data.filter((_, i) => i % step === 0).map(d => d.minute))
      .tickFormat(fmtMinute)

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#475569').attr('font-size', 9)
    g.selectAll('.domain, .tick line').attr('stroke', '#334155')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => d > 999 ? `${(d / 1000).toFixed(0)}k` : d))
      .selectAll('text').attr('fill', '#475569').attr('font-size', 9)
    g.select('.domain').attr('stroke', '#334155')
  }

  const totalPkts  = data.reduce((a, d) => a + d.packets, 0)
  const totalBytes = data.reduce((a, d) => a + d.bytes, 0)
  const totalAlerts = data.reduce((a, d) => a + d.alerts, 0)

  return (
    <div style={{
      height: expanded ? EXPANDED_H : COLLAPSED_H,
      background: '#0f172a',
      borderTop: '1px solid #1e3a5f',
      transition: 'height 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Header bar */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          height: COLLAPSED_H, display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 20, cursor: 'pointer',
          borderBottom: expanded ? '1px solid #1e3a5f' : 'none',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
          {expanded ? '▼' : '▲'} Timeline
        </span>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Chip label={`${totalPkts.toLocaleString()} paquets`} color="#3b82f6" />
          <Chip label={fmt(totalBytes)} color="#6366f1" />
          {totalAlerts > 0 && <Chip label={`${totalAlerts} alertes`} color="#f59e0b" />}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[15, 30, 60].map(m => (
            <button
              key={m}
              onClick={e => { e.stopPropagation(); setRange(m) }}
              style={{
                background: range === m ? '#1e3a5f' : 'transparent',
                border: '1px solid #1e3a5f', borderRadius: 4,
                color: range === m ? '#93c5fd' : '#475569',
                fontSize: 9, padding: '2px 7px', cursor: 'pointer',
              }}
            >
              {m}min
            </button>
          ))}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, color: '#22c55e', marginLeft: 8,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
            Live
          </div>
        </div>
      </div>

      {/* Chart */}
      {expanded && (
        <svg
          ref={svgRef}
          style={{ width: '100%', height: EXPANDED_H - COLLAPSED_H, display: 'block' }}
        />
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 60,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 6, padding: '6px 10px', fontSize: 10,
          color: '#e2e8f0', pointerEvents: 'none', zIndex: 500,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{fmtMinute(tooltip.d.minute)}</div>
          <div>{tooltip.d.packets.toLocaleString()} paquets</div>
          <div style={{ color: '#64748b' }}>{fmt(tooltip.d.bytes)}</div>
          {tooltip.d.alerts > 0 && (
            <div style={{ color: '#f59e0b', marginTop: 2 }}>⚠ {tooltip.d.alerts} alerte{tooltip.d.alerts > 1 ? 's' : ''}</div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 10, color, background: color + '1a',
      border: `1px solid ${color}44`, borderRadius: 10, padding: '1px 8px',
    }}>
      {label}
    </span>
  )
}
