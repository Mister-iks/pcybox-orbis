import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

function fmtBps(bps) {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

export default function BandwidthChart({ data }) {
  const svgRef = useRef(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const W = el.clientWidth || 260
    const H = 36
    const svg = d3.select(el).attr('height', H)
    svg.selectAll('*').remove()

    const now = Date.now()
    const xDomain = [now - 60000, now]
    const x = d3.scaleLinear().domain(xDomain).range([0, W])
    const maxBps = d3.max(data, d => d.bps) || 1
    const y = d3.scaleLinear().domain([0, maxBps * 1.2]).range([H, 2])

    // Gradient fill
    const defs = svg.append('defs')
    const grad = defs.append('linearGradient')
      .attr('id', 'bw-grad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1)
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.35)
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0)

    if (data.length > 1) {
      const area = d3.area().x(d => x(d.ts)).y0(H).y1(d => y(d.bps)).curve(d3.curveCatmullRom)
      const line = d3.line().x(d => x(d.ts)).y(d => y(d.bps)).curve(d3.curveCatmullRom)

      svg.append('path').datum(data).attr('d', area).attr('fill', 'url(#bw-grad)')
      svg.append('path').datum(data).attr('d', line)
        .attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 1.5)
    }

    // Current value label
    const current = data.length ? data[data.length - 1].bps : 0
    svg.append('text')
      .attr('x', W - 2).attr('y', 11)
      .attr('text-anchor', 'end')
      .attr('fill', current > 0 ? '#3b82f6' : '#334155')
      .attr('font-size', 9).attr('font-weight', 700)
      .text(fmtBps(current))
  }, [data])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: 36, display: 'block' }}
    />
  )
}
