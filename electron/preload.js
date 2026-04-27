// Minimal preload — contextIsolation keeps renderer sandboxed
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('netgraph', {
  version: process.env.npm_package_version || '1.0.0',
})
