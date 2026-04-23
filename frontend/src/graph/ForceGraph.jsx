import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const CATEGORY_ICONS = {
  local: '💻',
  safe: '🔒',
  tracking: '📡',
  cdn: '⚡',
  dns: '🌐',
  admin: '🔧',
  unknown: '❓',
}

export default function ForceGraph({ nodes, edges, onNodeClick }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const gRef = useRef(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (e) => {
      g.attr('transform', e.transform)
    })
    svg.call(zoom)

    const g = svg.append('g')
    gRef.current = g

    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#475569')
      .attr('d', 'M0,-5L10,0L0,5')

    const nodesArr = Object.values(nodes)
    const edgesArr = Object.values(edges)

    const sim = d3.forceSimulation(nodesArr)
      .force('link', d3.forceLink(edgesArr).id(d => d.id).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(40))

    simRef.current = sim

    const link = g.append('g').selectAll('line')
      .data(edgesArr)
      .join('line')
      .attr('stroke', d => d.color || '#475569')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.min(1 + Math.log1p(d.bytes / 1024), 6))
      .attr('marker-end', 'url(#arrow)')

    const linkLabel = g.append('g').selectAll('text')
      .data(edgesArr)
      .join('text')
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .text(d => d.label)

    const node = g.append('g').selectAll('g')
      .data(nodesArr)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onNodeClick?.(d))
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    node.append('circle')
      .attr('r', d => d.id === 'local' ? 22 : 14)
      .attr('fill', d => d.color || '#475569')
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 2)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => d.id === 'local' ? 18 : 13)
      .text(d => CATEGORY_ICONS[d.category] || '❓')

    node.append('text')
      .attr('y', d => d.id === 'local' ? 32 : 24)
      .attr('text-anchor', 'middle')
      .attr('fill', '#cbd5e1')
      .attr('font-size', 9)
      .text(d => {
        const label = d.label || d.ip
        return label.length > 22 ? label.slice(0, 20) + '…' : label
      })

    node.append('title').text(d =>
      `${d.label || d.ip}\n${d.country || ''} ${d.city || ''}\n${d.org || ''}\n${d.packets || 0} paquets`
    )

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, [nodes, edges])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', background: '#0f172a' }}
    />
  )
}
