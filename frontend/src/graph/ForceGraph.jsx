import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { nodeIconURI } from './icons'

export default function ForceGraph({ nodes, edges, lanDevices, alertedNodes = new Set(), onNodeClick, filter }) {
  const svgRef   = useRef(null)
  const nodeRef  = useRef(null)
  const linkRef  = useRef(null)
  const posCache = useRef({})   // { nodeId: {x, y, fx, fy} } — persists across renders

  // ── Full simulation — reruns when data changes ───────────────────────────
  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width  = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const zoom = d3.zoom().scaleExtent([0.15, 6]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    const g = svg.append('g')

    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('fill', '#475569').attr('d', 'M0,-5L10,0L0,5')

    const allNodes = [...Object.values(nodes), ...Object.values(lanDevices)]
    const allEdges = Object.values(edges)

    // Restore cached positions — locked nodes won't move at all
    let hasNew = false
    allNodes.forEach(n => {
      const c = posCache.current[n.id]
      if (c) { n.x = c.x; n.y = c.y; n.fx = c.fx; n.fy = c.fy }
      else    { hasNew = true }
    })

    const sim = d3.forceSimulation(allNodes)
      .alpha(hasNew ? 0.6 : 0.05)   // barely heat up if nothing new
      .alphaDecay(0.04)              // settle ~2× faster than default
      .velocityDecay(0.55)           // more friction → less overshooting
      .force('link', d3.forceLink(allEdges).id(d => d.id).distance(d => d.dashed ? 80 : 130).strength(0.4))
      .force('charge', d3.forceManyBody().strength(d => d.category === 'lan_device' ? -300 : -400))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.03))
      .force('collision', d3.forceCollide(d => d.id === 'local' ? 30 : 20))
      .force('lan_x', d3.forceX(width / 2).strength(d => d.category === 'lan_device' ? 0.15 : 0))
      .force('lan_y', d3.forceY(height / 2).strength(d => d.category === 'lan_device' ? 0.15 : 0))

    const link = g.append('g').selectAll('line')
      .data(allEdges)
      .join('line')
      .attr('stroke', d => d.color || '#475569')
      .attr('stroke-opacity', d => d.dashed ? 0.35 : 0.55)
      .attr('stroke-width', d => d.dashed ? 1 : Math.min(1 + Math.log1p((d.bytes || 0) / 1024), 6))
      .attr('stroke-dasharray', d => d.dashed ? '5,4' : null)
      .attr('marker-end', d => d.dashed ? null : 'url(#arrow)')

    linkRef.current = link

    const linkLabel = g.append('g').selectAll('text')
      .data(allEdges.filter(e => !e.dashed))
      .join('text')
      .attr('fill', '#475569')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .text(d => d.label)

    const node = g.append('g').selectAll('g')
      .data(allNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onNodeClick?.(d))
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.15).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e, d) => {
          if (!e.active) sim.alphaTarget(0)
          // Lock the node where it was dropped
          posCache.current[d.id] = { x: d.x, y: d.y, fx: d.x, fy: d.y }
        })
      )

    nodeRef.current = node

    const radius = d => d.id === 'local' ? 22 : d.category === 'lan_device' ? 18 : 13

    // Alert glow
    node.filter(d => alertedNodes.has(d.id) || d.alerted)
      .append('circle')
      .attr('r', d => radius(d) + 9)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.7)
      .each(function () {
        d3.select(this).append('animate')
          .attr('attributeName', 'stroke-opacity')
          .attr('values', '0.7;0.1;0.7')
          .attr('dur', '1.5s').attr('repeatCount', 'indefinite')
      })

    // Outer glow for local / LAN
    node.filter(d => d.id === 'local' || d.category === 'lan_device')
      .append('circle')
      .attr('r', d => radius(d) + 6)
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.15)

    node.append('circle')
      .attr('r', radius)
      .attr('fill', d => d.color || '#475569')
      .attr('fill-opacity', d => d.online === false ? 0.35 : 0.85)
      .attr('stroke', d => d.online === false ? '#475569' : '#1e293b')
      .attr('stroke-width', d => d.category === 'lan_device' ? 2.5 : 1.5)
      .attr('stroke-dasharray', d => d.online === false ? '4,3' : null)

    const iconSize = d => d.id === 'local' ? 20 : d.category === 'lan_device' ? 16 : 12
    node.append('image')
      .attr('href', d => nodeIconURI(d))
      .attr('width',  d => iconSize(d))
      .attr('height', d => iconSize(d))
      .attr('x', d => -iconSize(d) / 2)
      .attr('y', d => -iconSize(d) / 2)
      .attr('pointer-events', 'none')
      .attr('opacity', d => d.online === false ? 0.4 : 0.9)

    node.append('text')
      .attr('y', d => radius(d) + 11)
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.category === 'lan_device' ? '#e2e8f0' : '#94a3b8')
      .attr('font-size', d => d.category === 'lan_device' ? 10 : 9)
      .attr('font-weight', d => d.category === 'lan_device' ? '600' : '400')
      .text(d => {
        const label = d.label || d.ip || ''
        return label.length > 20 ? label.slice(0, 18) + '…' : label
      })

    node.append('title').text(d =>
      [d.label || d.ip, d.vendor, d.mac, d.country, d.org, `${d.packets || 0} paquets`]
        .filter(Boolean).join('\n')
    )

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Once cooled: lock every node in place and save to cache
    sim.on('end', () => {
      allNodes.forEach(n => {
        n.fx = n.x; n.fy = n.y
        posCache.current[n.id] = { x: n.x, y: n.y, fx: n.x, fy: n.y }
      })
    })

    return () => sim.stop()
  }, [nodes, edges, lanDevices, alertedNodes])

  // ── Filter: dim non-matching nodes + links without restarting sim ────────
  useEffect(() => {
    if (!nodeRef.current || !linkRef.current) return

    function matches(d) {
      if (!filter || (filter.category === 'all' && !filter.text)) return true
      if (d.id === 'local') return true
      const { text, category } = filter
      if (category !== 'all' && d.category !== category) return false
      if (text) {
        const t = text.toLowerCase()
        return (d.label   || '').toLowerCase().includes(t)
            || (d.ip      || '').toLowerCase().includes(t)
            || (d.country || '').toLowerCase().includes(t)
            || (d.org     || '').toLowerCase().includes(t)
            || (d.hostname|| '').toLowerCase().includes(t)
      }
      return true
    }

    nodeRef.current.attr('opacity', d => matches(d) ? 1 : 0.1)

    linkRef.current.attr('stroke-opacity', d => {
      const src = typeof d.source === 'object' ? d.source : { id: d.source, category: '' }
      const tgt = typeof d.target === 'object' ? d.target : { id: d.target, category: '' }
      return (matches(src) || matches(tgt)) ? (d.dashed ? 0.35 : 0.55) : 0.04
    })
  }, [filter])

  return <svg ref={svgRef} style={{ width: '100%', height: '100%', background: '#0f172a' }} />
}
