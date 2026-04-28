import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

const STYLE = `
  @keyframes arcFlow {
    from { stroke-dashoffset: 1; }
    to   { stroke-dashoffset: 0; }
  }
  .arc-flow { animation: arcFlow linear infinite; }
`

// Deterministic hash for a node id (0..65535)
function hashId(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
}

// Deterministic per-node offset so same-city nodes don't fully overlap
function jitter(id) {
  const h = hashId(id)
  const angle = (h / 0x8000) * Math.PI * 2
  const r = 0.3 + (h & 0xff) / 255 * 1.2
  return [Math.cos(angle) * r, Math.sin(angle) * r]
}

// Deterministic animation duration so it doesn't reset on every data update
function animDur(id) {
  return (1.8 + (hashId(id) / 0xffff) * 2).toFixed(2) + 's'
}

export default function MapView({ nodes, onNodeClick }) {
  const svgRef  = useRef(null)
  const gRef    = useRef(null)   // D3 selection
  const projRef = useRef(null)
  const kRef    = useRef(1)      // current zoom scale
  const userPosRef = useRef(null)

  const [worldTopo, setWorldTopo] = useState(null)
  const [userPos,   setUserPos]   = useState(null)
  const [tooltip,   setTooltip]   = useState(null)

  useEffect(() => {
    fetch(WORLD_URL).then(r => r.json()).then(setWorldTopo)
    navigator.geolocation?.getCurrentPosition(
      p => setUserPos([p.coords.longitude, p.coords.latitude]),
      () => setUserPos([2.35, 48.85])
    )
    if (!navigator.geolocation) setUserPos([2.35, 48.85])
  }, [])

  useEffect(() => {
    if (!worldTopo || !userPos || !svgRef.current) return
    userPosRef.current = userPos
    drawBase(worldTopo, userPos)
  }, [worldTopo, userPos])

  useEffect(() => {
    if (!gRef.current || !projRef.current) return
    drawConnections(projRef.current)
  }, [nodes])

  // ── Keep element sizes constant regardless of zoom level ──────────────────
  function rescaleAll(k) {
    const g = gRef.current
    if (!g) return

    g.select('.graticule').attr('stroke-width', 0.3 / k)
    g.select('.borders').attr('stroke-width', 0.3 / k)
    g.selectAll('.countries path').attr('stroke-width', 0.5 / k)

    // Arcs
    g.selectAll('path.arc-flow').each(function (d) {
      const base = 0.8 + Math.log1p((d?.bytes || 0) / 512)
      d3.select(this).attr('stroke-width', Math.min(base, 3.5) / k)
    })

    // Destination dots + labels
    g.selectAll('g.dest').each(function (d) {
      const r = Math.min(3 + Math.log1p((d?.packets || 0) * 0.4), 9)
      const vr = r / k
      d3.select(this).select('.dot').attr('r', vr).attr('stroke-width', 1 / k)
      d3.select(this).select('.dot-label')
        .attr('display', k < 2 ? 'none' : null)
        .attr('font-size', Math.max(9 / k, 6))
        .attr('y', vr + 11 / k)
    })

    // User dot
    g.select('.user-dot').attr('r', 7 / k).attr('stroke-width', 1.5 / k)
    g.select('.user-label').attr('font-size', 11 / k).attr('x', function () {
      return +d3.select(this).attr('data-ux') + 10 / k
    })
  }

  function drawBase(topo, pos) {
    const el  = svgRef.current
    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.append('defs').append('style').text(STYLE)

    const W = el.clientWidth
    const H = el.clientHeight

    const projection = d3.geoNaturalEarth1()
      .scale(W / 6.3)
      .translate([W / 2, H / 2])
    projRef.current = projection

    const geoPath = d3.geoPath().projection(projection)

    const zoom = d3.zoom()
      .scaleExtent([0.7, 20])
      .on('zoom', e => {
        g.attr('transform', e.transform)
        kRef.current = e.transform.k
        rescaleAll(e.transform.k)
      })
    svg.call(zoom)

    const g = svg.append('g')
    gRef.current = g

    // Ocean
    g.append('rect')
      .attr('width', W * 4).attr('height', H * 4)
      .attr('x', -W).attr('y', -H)
      .attr('fill', '#0a1628')

    // Graticule
    g.append('path')
      .attr('class', 'graticule')
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

    // Borders
    g.append('path')
      .attr('class', 'borders')
      .datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b))
      .attr('d', geoPath)
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', 0.3)

    // Layers
    g.append('g').attr('class', 'arcs')
    g.append('g').attr('class', 'dots')

    // User location
    const up = projection(pos)
    if (up) {
      const [ux, uy] = up
      const userG = g.append('g').attr('class', 'user-loc')

      for (let i = 0; i < 2; i++) {
        const base = 10 + i * 8
        userG.append('circle')
          .attr('cx', ux).attr('cy', uy).attr('r', base)
          .attr('fill', 'none').attr('stroke', '#3b82f6')
          .attr('stroke-opacity', 0.3 - i * 0.1)
          .append('animate').attr('attributeName', 'r')
          .attr('values', `${base};${base + 18};${base}`)
          .attr('dur', `${2.5 + i * 0.8}s`).attr('repeatCount', 'indefinite')
      }

      userG.append('circle')
        .attr('class', 'user-dot')
        .attr('cx', ux).attr('cy', uy).attr('r', 7)
        .attr('fill', '#3b82f6').attr('fill-opacity', 0.9)
        .attr('stroke', '#93c5fd').attr('stroke-width', 1.5)

      userG.append('text')
        .attr('class', 'user-label')
        .attr('data-ux', ux)
        .attr('x', ux + 10).attr('y', uy + 4)
        .attr('fill', '#93c5fd').attr('font-size', 11).attr('font-weight', '700')
        .text('You')
    }

    drawConnections(projection)
  }

  function drawConnections(projection) {
    const g = gRef.current
    if (!g) return
    const geoPath = d3.geoPath().projection(projection)
    const pos = userPosRef.current || [2.35, 48.85]
    const k   = kRef.current

    const geoNodes = Object.values(nodes)
      .filter(n => n.id !== 'local' && n.lat != null && n.lon != null)

    // ── Arcs ────────────────────────────────────────────────────────────────
    const arcs = g.select('.arcs').selectAll('path.arc-flow')
      .data(geoNodes, d => d.id)

    // Store enter selection — only set animation-duration once so it doesn't flicker on update
    const arcsEnter = arcs.enter().append('path')
      .attr('class', 'arc-flow')
      .attr('fill', 'none')
      .attr('pointer-events', 'none')
      .style('animation-duration', d => animDur(d.id))

    // Merge enter + update, then apply all mutable attributes
    arcsEnter.merge(arcs)
      .attr('d', d => {
        const [jx, jy] = jitter(d.id)
        return geoPath({
          type: 'LineString',
          coordinates: [pos, [d.lon + jx, d.lat + jy]],
        })
      })
      .attr('stroke', d => d.color || '#94a3b8')
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', d => Math.min(0.8 + Math.log1p((d.bytes || 0) / 512), 3.5) / k)
      .each(function () {
        const len = this.getTotalLength() || 500
        d3.select(this)
          .attr('stroke-dasharray', `${len * 0.1} ${len * 0.9}`)
          .attr('pathLength', 1)
      })

    arcs.exit().remove()

    // ── Destination dots ───────────────────────────────────────────────────
    const dotGroups = g.select('.dots').selectAll('g.dest')
      .data(geoNodes, d => d.id)

    const enter = dotGroups.enter().append('g').attr('class', 'dest')
    enter.append('circle').attr('class', 'pulse').attr('fill', 'none').attr('stroke-opacity', 0)
    enter.append('circle').attr('class', 'dot').attr('stroke', '#0a1628').attr('cursor', 'pointer')
    enter.append('text').attr('class', 'dot-label').attr('fill', '#cbd5e1').attr('text-anchor', 'middle')

    const all = enter.merge(dotGroups)

    all.each(function (d) {
      const [jx, jy] = jitter(d.id)
      const pt = projection([d.lon + jx, d.lat + jy])
      if (!pt) return
      const [x, y] = pt
      const r  = Math.min(3 + Math.log1p(d.packets || 0) * 0.4, 9)
      const vr = r / k

      d3.select(this).attr('transform', `translate(${x},${y})`)

      // Pulse
      const pulse = d3.select(this).select('.pulse')
      pulse.attr('r', (r + 3) / k).attr('stroke', d.color || '#94a3b8')
      pulse.selectAll('animate').remove()
      pulse.append('animate').attr('attributeName', 'stroke-opacity')
        .attr('values', '0.5;0;0.5').attr('dur', '3s').attr('repeatCount', 'indefinite')

      d3.select(this).select('.dot')
        .attr('r', vr)
        .attr('fill', d.color || '#94a3b8')
        .attr('stroke-width', 1 / k)

      d3.select(this).select('.dot-label')
        .attr('display', k < 2 ? 'none' : null)
        .attr('font-size', Math.max(9 / k, 6))
        .attr('y', vr + 11 / k)
        .text(() => {
          const lbl = d.label || d.ip || ''
          return lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl
        })
    })

    all.attr('cursor', 'pointer')
      .on('mouseover', (e, d) => setTooltip({ x: e.clientX, y: e.clientY, node: d }))
      .on('mouseout',  () => setTooltip(null))
      .on('click',     (_, d) => onNodeClick?.(d))

    dotGroups.exit().remove()
  }

  const geoCount   = Object.values(nodes).filter(n => n.id !== 'local' && n.lat).length
  const noGeoCount = Object.values(nodes).filter(n => n.id !== 'local' && !n.lat).length

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute', top: 16, left: 16,
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 8, padding: '8px 14px', fontSize: 10, color: '#64748b',
      }}>
        <span style={{ color: '#22c55e', fontWeight: 700 }}>{geoCount}</span> hôtes localisés
        {noGeoCount > 0 && <span> · <span style={{ color: '#f59e0b' }}>{noGeoCount}</span> sans géo</span>}
      </div>

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
