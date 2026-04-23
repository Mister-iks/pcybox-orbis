import { useEffect, useRef, useState } from 'react'

export function useWebSocket(url) {
  const ws = useRef(null)
  const [nodes, setNodes] = useState({})
  const [edges, setEdges] = useState({})
  const [packets, setPackets] = useState([])
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    function connect() {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => setStatus('connected')
      ws.current.onclose = () => {
        setStatus('disconnected')
        setTimeout(connect, 2000)
      }
      ws.current.onerror = () => setStatus('error')

      ws.current.onmessage = (evt) => {
        const msg = JSON.parse(evt.data)

        if (msg.type === 'init') {
          const nodeMap = {}
          const edgeMap = {}
          msg.nodes.forEach(n => { nodeMap[n.id] = n })
          msg.edges.forEach(e => { edgeMap[e.id] = e })
          setNodes(nodeMap)
          setEdges(edgeMap)
        }

        if (msg.type === 'update') {
          setNodes(prev => ({ ...prev, [msg.node.id]: msg.node }))
          setEdges(prev => ({ ...prev, [msg.edge.id]: msg.edge }))
          setPackets(prev => [msg.packet, ...prev].slice(0, 100))
        }
      }
    }

    connect()
    return () => ws.current?.close()
  }, [url])

  return { nodes, edges, packets, status }
}
