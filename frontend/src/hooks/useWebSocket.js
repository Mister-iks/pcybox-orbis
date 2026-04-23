import { useEffect, useRef, useState } from 'react'

export function useWebSocket(url) {
  const ws = useRef(null)
  const [nodes, setNodes] = useState({})
  const [edges, setEdges] = useState({})
  const [lanDevices, setLanDevices] = useState({})
  const [packets, setPackets] = useState([])
  const [alerts, setAlerts] = useState([])
  const [unread, setUnread] = useState(0)
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
          const nodeMap = {}, edgeMap = {}, deviceMap = {}
          msg.nodes.forEach(n => {
            if (n.category === 'lan_device') deviceMap[n.id] = n
            else nodeMap[n.id] = n
          })
          msg.edges.forEach(e => { edgeMap[e.id] = e })
          setNodes(nodeMap)
          setEdges(edgeMap)
          setLanDevices(deviceMap)
          if (msg.alerts?.length) {
            setAlerts(msg.alerts.reverse())
          }
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

        if (msg.type === 'alert') {
          setAlerts(prev => [msg.alert, ...prev].slice(0, 200))
          setUnread(prev => prev + 1)
        }
      }
    }

    connect()
    return () => ws.current?.close()
  }, [url])

  const clearUnread = () => setUnread(0)

  return { nodes, edges, lanDevices, packets, alerts, unread, clearUnread, status }
}
