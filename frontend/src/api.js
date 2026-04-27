// Under Electron (file:// protocol) there is no dev-server proxy,
// so all backend calls must use the full absolute URL.
const isElectron = window.location.protocol === 'file:'

export const API_BASE = isElectron ? 'http://127.0.0.1:8000' : ''
export const WS_URL   = isElectron
  ? 'ws://127.0.0.1:8000/ws'
  : `ws://${window.location.host}/ws`
