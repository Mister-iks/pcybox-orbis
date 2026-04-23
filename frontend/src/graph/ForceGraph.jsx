import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const CATEGORY_ICONS = {
  local:      '💻',
  safe:       '🔒',
  tracking:   '📡',
  cdn:        '⚡',
  dns:        '🌐',
  admin:      '🔧',
  unknown:    '❓',
  lan_device: null, // uses device.icon
}

export default function ForceGraph({ nodes, edges, lanDevices, onNodeClick }) {
  const svgRef = useRef(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const zoom = d3.zoom().scaleExtent([0.15, 6]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    const g = svg.append('g')

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('fill', '#475569').attr('d', 'M0,-5L10,0L0,5')

    const allNodes = [
      ...Object.values(nodes),
      ...Object.values(lanDevices),
    ]
    const allEdges = Object.values(edges)

    // Force simulation
    const sim = d3.forceSimulation(allNodes)
      .force('link', d3.forceLink(allEdges).id(d => d.id).distance(d => d.dashed ? 80 : 130).strength(0.4))
      .force('charge', d3.forceManyBody().strength(d => d.category === 'lan_device' ? -300 : -400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(d => d.id === 'local' ? 30 : 20))
      // LAN devices cluster near center
      .force('lan_x', d3.forceX(width / 2).strength(d => d.category === 'lan_device' ? 0.15 : 0))
      .force('lan_y', d3.forceY(height / 2).strength(d => d.category === 'lan_device' ? 0.15 : 0))

    // Links
    const link = g.append('g').selectAll('line')
      .data(allEdges)
      .join('line')
      .attr('stroke', d => d.color || '#475569')
      .attr('stroke-opacity', d => d.dashed ? 0.35 : 0.55)
      .attr('stroke-width', d => d.dashed ? 1 : Math.min(1 + Math.log1p((d.bytes || 0) / 1024), 6))
      .attr('stroke-dasharray', d => d.dashed ? '5,4' : null)
      .attr('marker-end', d => d.dashed ? null : 'url(#arrow)')

    // Link labels (only for non-LAN edges)
    const linkLabel = g.append('g').selectAll('text')
      .data(allEdges.filter(e => !e.dashed))
      .join('text')
      .attr('fill', '#475569')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .text(d => d.label)

    // Nodes
    const node = g.append('g').selectAll('g')
      .data(allNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onNodeClick?.(d))
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    const radius = d => d.id === 'local' ? 22 : d.category === 'lan_device' ? 18 : 13

    // Outer glow for LAN devices and local
    node.filter(d => d.id === 'local' || d.category === 'lan_device')
      .append('circle')
      .attr('r', d => radius(d) + 6)
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.15)

    // Offline LAN devices: dashed border
    node.append('circle')
      .attr('r', radius)
      .attr('fill', d => d.color || '#475569')
      .attr('fill-opacity', d => d.online === false ? 0.35 : 0.85)
      .attr('stroke', d => d.online === false ? '#475569' : '#1e293b')
      .attr('stroke-width', d => d.category === 'lan_device' ? 2.5 : 1.5)
      .attr('stroke-dasharray', d => d.online === false ? '4,3' : null)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => d.id === 'local' ? 18 : d.category === 'lan_device' ? 14 : 12)
      .text(d => d.icon || CATEGORY_ICONS[d.category] || '❓')

    node.append('text')
      .attr('y', d => radius(d) + 11)
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.category === 'lan_device' ? '#e2e8f0' : '#94a3b8')
      .attr('font-size', d => d.category === 'lan_device' ? 10 : 9)
      .attr('font-weight', d => d.category === 'lan_device' ? '600' : '400')
      .text(d => {
        const label = d.label || d.ip
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

    return () => sim.stop()
  }, [nodes, edges, lanDevices])

  return <svg ref={svgRef} style={{ width: '100%', height: '100%', background: '#0f172a' }} />
}
