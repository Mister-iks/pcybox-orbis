import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

// CSS animation injected once
const STYLE = `
  @keyframes arcFlow {
    from { stroke-dashoffset: 1; }
    to   { stroke-dashoffset: 0; }
  }
  .arc-flow {
    animation: arcFlow linear infinite;
  }
`

export default function MapView({ nodes, onNodeClick }) {
  const svgRef = useRef(null)
  const gRef = useRef(null)
  const projRef = useRef(null)
  const [worldTopo, setWorldTopo] = useState(null)
  const [userPos, setUserPos] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  // Load world map + user location once
  useEffect(() => {
    fetch(WORLD_URL).then(r => r.json()).then(setWorldTopo)
    navigator.geolocation?.getCurrentPosition(
      p => setUserPos([p.coords.longitude, p.coords.latitude]),
      () => setUserPos([2.35, 48.85]) // Paris fallback
    )
    if (!navigator.geolocation) setUserPos([2.35, 48.85])
  }, [])

  // Draw base map (world + user dot) once world + pos are ready
  useEffect(() => {
    if (!worldTopo || !userPos || !svgRef.current) return
    drawBase(worldTopo, userPos)
  }, [worldTopo, userPos])

  // Update arcs & dots whenever nodes change
  useEffect(() => {
    if (!gRef.current || !projRef.current) return
    drawConnections(projRef.current)
  }, [nodes])

  function drawBase(topo, pos) {
    const el = svgRef.current
    const svg = d3.select(el)
    svg.selectAll('*').remove()

    // Inject CSS
    svg.append('defs').append('style').text(STYLE)

    const W = el.clientWidth
    const H = el.clientHeight

    const projection = d3.geoNaturalEarth1()
      .scale(W / 6.3)
      .translate([W / 2, H / 2])
    projRef.current = projection

    const geoPath = d3.geoPath().projection(projection)

    const zoom = d3.zoom()
      .scaleExtent([0.7, 14])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    const g = svg.append('g')
    gRef.current = g

    // Ocean background
    g.append('rect')
      .attr('width', W * 4).attr('height', H * 4)
      .attr('x', -W).attr('y', -H)
      .attr('fill', '#0a1628')

    // Graticule
    g.append('path')
      .datum(d3.geoGraticule()())
      .attr('d', geoPath)
      .attr('fill', 'none')
      .attr('stroke', '#1e3a5f')
      .attr('stroke-width', 0.3)

    // Countries
    const countries = topojson.feature(topo, topo.objects.countries)
    g.append('g').attr('class', 'countries')
      .selectAll('path')
      .data(countries.features)
      .join('path')
      .attr('d', geoPath)
      .attr('fill', '#1e293b')
      .attr('stroke', '#2d4a6e')
      .attr('stroke-width', 0.5)

    // Country borders
    g.append('path')
      .datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b))
      .attr('d', geoPath)
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', 0.3)

    // Layers for connections (drawn below user dot)
    g.append('g').attr('class', 'arcs')
    g.append('g').attr('class', 'dots')

    // User location
    const up = projection(pos)
    if (up) {
      const [ux, uy] = up
      const userG = g.append('g').attr('class', 'user-loc')

      // Outer pulse rings
      for (let i = 0; i < 2; i++) {
        userG.append('circle')
          .attr('cx', ux).attr('cy', uy)
          .attr('r', 10 + i * 8)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-opacity', 0.3 - i * 0.1)
          .append('animate').attr('attributeName', 'r')
          .attr('values', `${10 + i * 8};${28 + i * 10};${10 + i * 8}`)
          .attr('dur', `${2.5 + i * 0.8}s`).attr('repeatCount', 'indefinite')
      }

      userG.append('circle')
        .attr('cx', ux).attr('cy', uy).attr('r', 7)
        .attr('fill', '#3b82f6').attr('fill-opacity', 0.9)
        .attr('stroke', '#93c5fd').attr('stroke-width', 1.5)

      userG.append('text')
        .attr('x', ux + 11).attr('y', uy + 4)
        .attr('fill', '#93c5fd').attr('font-size', 11).attr('font-weight', '700')
        .text('You')
    }

    drawConnections(projection)
  }

  function drawConnections(projection) {
    if (!gRef.current) return
    const g = gRef.current
    const geoPath = d3.geoPath().projection(projection)
    const pos = userPos || [2.35, 48.85]

    const geoNodes = Object.values(nodes)
      .filter(n => n.id !== 'local' && n.lat != null && n.lon != null)

    // ── Arcs ──────────────────────────────────────────────────────────────
    const arcs = g.select('.arcs').selectAll('path')
      .data(geoNodes, d => d.id)

    arcs.enter().append('path')
      .merge(arcs)
      .attr('d', d => geoPath({
        type: 'LineString',
        coordinates: [pos, [d.lon, d.lat]],
      }))
      .attr('fill', 'none')
      .attr('stroke', d => d.color || '#94a3b8')
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', d => Math.min(0.8 + Math.log1p((d.bytes || 0) / 512), 3.5))
      .attr('class', 'arc-flow')
      .style('animation-duration', d => `${1.5 + Math.random() * 2.5}s`)
      .each(function () {
        const len = this.getTotalLength() || 500
        d3.select(this)
          .attr('stroke-dasharray', `${len * 0.12} ${len * 0.88}`)
          .attr('pathLength', 1)
      })
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onNodeClick?.(d))

    arcs.exit().remove()

    // ── Destination dots ──────────────────────────────────────────────────
    const dotGroups = g.select('.dots').selectAll('g.dest')
      .data(geoNodes, d => d.id)

    const enter = dotGroups.enter().append('g').attr('class', 'dest')

    // Pulse ring (only on enter)
    enter.append('circle')
      .attr('class', 'pulse')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0)

    // Main dot
    enter.append('circle')
      .attr('class', 'dot')
      .attr('stroke', '#0a1628').attr('stroke-width', 1)
      .attr('cursor', 'pointer')

    // Tooltip label
    enter.append('text')
      .attr('class', 'dot-label')
      .attr('font-size', 9).attr('fill', '#cbd5e1')
      .attr('text-anchor', 'middle')

    const all = enter.merge(dotGroups)

    all.each(function (d) {
      const pt = projection([d.lon, d.lat])
      if (!pt) return
      const [x, y] = pt
      const r = Math.min(3 + Math.log1p(d.packets || 0) * 0.4, 9)

      d3.select(this).attr('transform', `translate(${x},${y})`)

      d3.select(this).select('.pulse')
        .attr('r', r + 3)
        .attr('stroke', d.color || '#94a3b8')
        .selectAll('animate').remove()

      const pulse = d3.select(this).select('.pulse')
      pulse.append('animate').attr('attributeName', 'r')
        .attr('values', `${r + 3};${r + 14};${r + 3}`)
        .attr('dur', '3s').attr('repeatCount', 'indefinite')
      pulse.append('animate').attr('attributeName', 'stroke-opacity')
        .attr('values', '0.5;0;0.5').attr('dur', '3s').attr('repeatCount', 'indefinite')

      d3.select(this).select('.dot')
        .attr('r', r)
        .attr('fill', d.color || '#94a3b8')

      d3.select(this).select('.dot-label')
        .attr('y', r + 12)
        .text(() => {
          const lbl = d.label || d.ip
          return lbl.length > 20 ? lbl.slice(0, 18) + '…' : lbl
        })
    })

    all
      .on('mouseover', (e, d) => setTooltip({ x: e.clientX, y: e.clientY, node: d }))
      .on('mouseout', () => setTooltip(null))
      .on('click', (_, d) => onNodeClick?.(d))

    dotGroups.exit().remove()
  }

  const noGeoCount = Object.values(nodes).filter(n => n.id !== 'local' && !n.lat).length
  const geoCount   = Object.values(nodes).filter(n => n.id !== 'local' && n.lat).length

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      {/* Info overlay */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 8, padding: '8px 14px', fontSize: 10, color: '#64748b',
      }}>
        <span style={{ color: '#22c55e', fontWeight: 700 }}>{geoCount}</span> hôtes localisés
        {noGeoCount > 0 && <span> · <span style={{ color: '#f59e0b' }}>{noGeoCount}</span> sans géo</span>}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, zIndex: 100,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 8, padding: '8px 12px', pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#f1f5f9', marginBottom: 3 }}>
            {tooltip.node.label || tooltip.node.ip}
          </div>
          {tooltip.node.country && (
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              {[tooltip.node.city, tooltip.node.country].filter(Boolean).join(', ')}
            </div>
          )}
          {tooltip.node.org && (
            <div style={{ fontSize: 10, color: '#64748b' }}>{tooltip.node.org}</div>
          )}
          <div style={{ marginTop: 5, fontSize: 10, display: 'flex', gap: 10 }}>
            <span style={{ color: tooltip.node.color }}>{tooltip.node.category}</span>
            <span style={{ color: '#475569' }}>{tooltip.node.packets} pkt</span>
          </div>
        </div>
      )}
    </div>
  )
}
