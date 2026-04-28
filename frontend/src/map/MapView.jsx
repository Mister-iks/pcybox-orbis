import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'

// Bundled locally — no CDN dependency
const WORLD_URL = '/countries-110m.json'

const STYLE = `
  @keyframes arcFlow {
    from { stroke-dashoffset: 1; }
    to   { stroke-dashoffset: 0; }
  }
  .arc-flow { animation: arcFlow linear infinite; }
`

function hashId(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
}

function jitter(id) {
  const h = hashId(id)
  const angle = (h / 0x8000) * Math.PI * 2
  const r = 0.3 + (h & 0xff) / 255 * 1.2
  return [Math.cos(angle) * r, Math.sin(angle) * r]
}

function animDur(id) {
  return (1.8 + (hashId(id) / 0xffff) * 2).toFixed(2) + 's'
}

// ── Label collision detection in map-coordinate space ────────────────────────
// Nodes with more traffic take priority.
function applyLabelCollision(g, k) {
  const SHOW_AT = 2.5
  if (k < SHOW_AT) {
    g.selectAll('g.dest .dot-label').attr('display', 'none')
    return
  }

  const items = []
  g.selectAll('g.dest').each(function (d) {
    const t = d3.select(this).attr('transform') || ''
    const m = t.match(/translate\(([^,]+),([^)]+)\)/)
    if (!m) return
    items.push({ el: this, d, mx: +m[1], my: +m[2] })
  })

  // Highest-traffic nodes get label priority
  items.sort((a, b) => (b.d?.bytes || 0) - (a.d?.bytes || 0))

  const placed = []  // accepted bounding boxes (map coords)

  for (const { el, d, mx, my } of items) {
    const labelSel = d3.select(el).select('.dot-label')
    const text = labelSel.text()
    if (!text) { labelSel.attr('display', 'none'); continue }

    const fs  = Math.max(9 / k, 5)
    const lw  = text.length * fs * 0.58
    const lh  = fs + 2
    const r   = Math.min(3 + Math.log1p((d?.packets || 0) * 0.4), 9) / k
    const ly  = my + r + 10 / k  // label center-y (below dot)
    const pad = 4 / k

    const box = { x: mx - lw / 2 - pad, y: ly - lh / 2 - pad, w: lw + pad * 2, h: lh + pad * 2 }

    const hit = placed.some(b =>
      box.x < b.x + b.w && box.x + box.w > b.x &&
      box.y < b.y + b.h && box.y + box.h > b.y
    )

    if (hit) {
      labelSel.attr('display', 'none')
    } else {
      labelSel.attr('display', null)
      placed.push(box)
    }
  }
}

export default function MapView({ nodes, onNodeClick }) {
  const svgRef    = useRef(null)
  const gRef      = useRef(null)
  const projRef   = useRef(null)
  const kRef      = useRef(1)
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

  function rescaleAll(k) {
    const g = gRef.current
    if (!g) return

    g.select('.graticule').attr('stroke-width', 0.3 / k)
    g.select('.borders').attr('stroke-width', 0.3 / k)
    g.selectAll('.countries path').attr('stroke-width', 0.5 / k)

    g.selectAll('path.arc-flow').each(function (d) {
      const base = 0.8 + Math.log1p((d?.bytes || 0) / 512)
      d3.select(this).attr('stroke-width', Math.min(base, 3.5) / k)
    })

    g.selectAll('g.dest').each(function (d) {
      const r  = Math.min(3 + Math.log1p((d?.packets || 0) * 0.4), 9)
      const vr = r / k
      d3.select(this).select('.dot').attr('r', vr).attr('stroke-width', 1 / k)
      d3.select(this).select('.dot-label')
        .attr('font-size', Math.max(9 / k, 5))
        .attr('y', vr + 10 / k)
    })

    g.select('.user-dot').attr('r', 7 / k).attr('stroke-width', 1.5 / k)
    g.select('.user-label').attr('font-size', 11 / k).attr('x', function () {
      return +d3.select(this).attr('data-ux') + 10 / k
    })

    // Recompute collision at new zoom level
    applyLabelCollision(g, k)
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

    g.append('rect')
      .attr('width', W * 4).attr('height', H * 4)
      .attr('x', -W).attr('y', -H)
      .attr('fill', '#0a1628')

    g.append('path')
      .attr('class', 'graticule')
      .datum(d3.geoGraticule()())
      .attr('d', geoPath)
      .attr('fill', 'none')
      .attr('stroke', '#1e3a5f')
      .attr('stroke-width', 0.3)

    const countries = topojson.feature(topo, topo.objects.countries)
    g.append('g').attr('class', 'countries')
      .selectAll('path')
      .data(countries.features)
      .join('path')
      .attr('d', geoPath)
      .attr('fill', '#1e293b')
      .attr('stroke', '#2d4a6e')
      .attr('stroke-width', 0.5)

    g.append('path')
      .attr('class', 'borders')
      .datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b))
      .attr('d', geoPath)
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', 0.3)

    g.append('g').attr('class', 'arcs')
    g.append('g').attr('class', 'dots')

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
    const g       = gRef.current
    if (!g) return
    const geoPath = d3.geoPath().projection(projection)
    const pos     = userPosRef.current || [2.35, 48.85]
    const k       = kRef.current

    const geoNodes = Object.values(nodes)
      .filter(n => n.id !== 'local' && n.lat != null && n.lon != null)

    // ── Arcs ──────────────────────────────────────────────────────────────────
    const arcs = g.select('.arcs').selectAll('path.arc-flow')
      .data(geoNodes, d => d.id)

    const arcsEnter = arcs.enter().append('path')
      .attr('class', 'arc-flow')
      .attr('fill', 'none')
      .attr('pointer-events', 'none')
      .style('animation-duration', d => animDur(d.id))

    arcsEnter.merge(arcs)
      .attr('d', d => {
        const [jx, jy] = jitter(d.id)
        return geoPath({ type: 'LineString', coordinates: [pos, [d.lon + jx, d.lat + jy]] })
      })
      .attr('stroke', d => d.color || '#94a3b8')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', d => Math.min(0.8 + Math.log1p((d.bytes || 0) / 512), 3.5) / k)
      .each(function () {
        const len = this.getTotalLength() || 500
        d3.select(this)
          .attr('stroke-dasharray', `${len * 0.1} ${len * 0.9}`)
          .attr('pathLength', 1)
      })

    arcs.exit().remove()

    // ── Destination dots ───────────────────────────────────────────────────────
    const dotGroups = g.select('.dots').selectAll('g.dest')
      .data(geoNodes, d => d.id)

    const enter = dotGroups.enter().append('g').attr('class', 'dest')
    enter.append('circle').attr('class', 'pulse').attr('fill', 'none').attr('stroke-opacity', 0)
    enter.append('circle').attr('class', 'dot').attr('stroke', '#0a1628')
    enter.append('text').attr('class', 'dot-label').attr('fill', '#cbd5e1').attr('text-anchor', 'middle').attr('pointer-events', 'none')

    const all = enter.merge(dotGroups)

    all.each(function (d) {
      const [jx, jy] = jitter(d.id)
      const pt = projection([d.lon + jx, d.lat + jy])
      if (!pt) return
      const [x, y] = pt
      const r  = Math.min(3 + Math.log1p(d.packets || 0) * 0.4, 9)
      const vr = r / k

      d3.select(this).attr('transform', `translate(${x},${y})`)

      const pulse = d3.select(this).select('.pulse')
      pulse.attr('r', (r + 3) / k).attr('stroke', d.color || '#94a3b8')
      pulse.selectAll('animate').remove()
      pulse.append('animate').attr('attributeName', 'stroke-opacity')
        .attr('values', '0.5;0;0.5').attr('dur', '3s').attr('repeatCount', 'indefinite')

      d3.select(this).select('.dot')
        .attr('r', vr)
        .attr('fill', d.color || '#94a3b8')
        .attr('stroke-width', 1 / k)
        .attr('cursor', 'pointer')

      d3.select(this).select('.dot-label')
        .attr('display', 'none')  // collision detection decides visibility below
        .attr('font-size', Math.max(9 / k, 5))
        .attr('y', vr + 10 / k)
        .text(() => {
          const lbl = d.label || d.ip || ''
          return lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl
        })
    })

    all
      .on('mouseover', (e, d) => setTooltip({ x: e.clientX, y: e.clientY, node: d }))
      .on('mouseout',  () => setTooltip(null))
      .on('click',     (_, d) => onNodeClick?.(d))

    dotGroups.exit().remove()

    // Apply collision-aware label visibility after all nodes are placed
    applyLabelCollision(g, k)
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
