// Minimal preload  contextIsolation keeps renderer sandboxed
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('pcyboxOrbis', {
  version: process.env.npm_package_version || '1.0.0',
})
