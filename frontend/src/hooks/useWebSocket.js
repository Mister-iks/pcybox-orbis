import { useEffect, useRef, useState } from 'react'

export function useWebSocket(url) {
  const ws = useRef(null)
  const [nodes, setNodes] = useState({})
  const [edges, setEdges] = useState({})
  const [lanDevices, setLanDevices] = useState({})
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
          const deviceMap = {}
          msg.nodes.forEach(n => {
            if (n.category === 'lan_device') deviceMap[n.id] = n
            else nodeMap[n.id] = n
          })
          msg.edges.forEach(e => { edgeMap[e.id] = e })
          setNodes(nodeMap)
          setEdges(edgeMap)
          setLanDevices(deviceMap)
        }

        if (msg.type === 'update') {
          setNodes(prev => ({ ...prev, [msg.node.id]: msg.node }))
          setEdges(prev => ({ ...prev, [msg.edge.id]: msg.edge }))
          setPackets(prev => [msg.packet, ...prev].slice(0, 100))
        }

        if (msg.type === 'device_update') {
          setLanDevices(prev => ({ ...prev, [msg.device.id]: msg.device }))
          setEdges(prev => ({ ...prev, [msg.edge.id]: msg.edge }))
        }
      }
    }

    connect()
    return () => ws.current?.close()
  }, [url])

  return { nodes, edges, lanDevices, packets, status }
}
