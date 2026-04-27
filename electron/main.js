const _electron        = require('electron')
const { app, BrowserWindow, dialog } = _electron.default || _electron
const { spawn, execSync }            = require('child_process')
const path = require('path')
const http = require('http')
const fs   = require('fs')

// ── Paths ──────────────────────────────────────────────────────────────────────
const isDev        = !app.isPackaged
const resourcesDir = isDev
  ? path.join(__dirname, '..')          // trafic_graph/
  : process.resourcesPath

const backendExe = isDev
  ? path.join(resourcesDir, 'dist', 'backend', 'netgraph-backend.exe')
  : path.join(resourcesDir, 'netgraph-backend.exe')

const npcapInstaller = isDev
  ? path.join(resourcesDir, 'resources', 'npcap-installer.exe')
  : path.join(resourcesDir, 'npcap-installer.exe')

const frontendDist = isDev
  ? path.join(resourcesDir, 'frontend', 'dist')
  : path.join(resourcesDir, 'frontend_dist')   // packed by electron-builder

const BACKEND_URL = 'http://127.0.0.1:8000'

let mainWindow   = null
let splashWindow = null
let backendProc  = null

// ── Npcap ──────────────────────────────────────────────────────────────────────
function isNpcapInstalled() {
  const keys = [
    'HKLM\\SOFTWARE\\Npcap',
    'HKLM\\SOFTWARE\\WOW6432Node\\Npcap',
  ]
  for (const key of keys) {
    try {
      const out = execSync(`reg query "${key}"`, { stdio: 'pipe', encoding: 'utf8' })
      if (out.includes('Npcap') || out.includes(key)) return true
    } catch {}
  }
  return false
}

function installNpcap() {
  if (!fs.existsSync(npcapInstaller)) return false
  try {
    execSync(`"${npcapInstaller}" /S /winpcap_mode=no`, { stdio: 'pipe' })
    return true
  } catch { return false }
}

// ── Windows ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420, height: 240, frame: false,
    resizable: false, alwaysOnTop: true, center: true,
    transparent: true, webPreferences: { nodeIntegration: false },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 600,
    show: false, title: 'NetGraph', backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })

  if (isDev && process.env.VITE_DEV === '1') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(frontendDist, 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    mainWindow.show()
    mainWindow.focus()
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Backend ────────────────────────────────────────────────────────────────────
function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let n = 0
    function poll() {
      http.get(BACKEND_URL + '/graph', res => {
        if (res.statusCode === 200) resolve()
        else retry()
      }).on('error', retry)
    }
    function retry() {
      if (++n >= maxAttempts) reject(new Error('Backend timeout after 30s'))
      else setTimeout(poll, 1000)
    }
    poll()
  })
}

function launchBackend() {
  if (!fs.existsSync(backendExe)) {
    dialog.showErrorBox('NetGraph', `Backend introuvable :\n${backendExe}`)
    app.quit(); return
  }
  // Ensure ELECTRON_RUN_AS_NODE is NOT passed to child processes
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE

  backendProc = spawn(backendExe, [], { detached: false, stdio: 'ignore', env })
  backendProc.on('error', err => {
    dialog.showErrorBox('NetGraph', `Impossible de démarrer le backend :\n${err.message}`)
    app.quit()
  })
  backendProc.on('exit', (code) => {
    if (mainWindow) { dialog.showErrorBox('NetGraph', `Backend arrêté (code ${code}).`); app.quit() }
  })
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Check/install Npcap
  if (!isNpcapInstalled()) {
    if (fs.existsSync(npcapInstaller)) {
      const choice = dialog.showMessageBoxSync({
        type: 'question', title: 'NetGraph — Npcap requis',
        message: 'NetGraph nécessite Npcap pour capturer le trafic réseau.\nInstaller maintenant ?',
        buttons: ['Installer', 'Quitter'], defaultId: 0,
      })
      if (choice === 1) { app.quit(); return }
      if (!installNpcap()) {
        dialog.showErrorBox('NetGraph', 'Installation Npcap échouée. Installe-le manuellement depuis https://npcap.com')
        app.quit(); return
      }
    }
    // In dev without npcap installer, skip the check and continue
  }

  createSplash()
  launchBackend()

  try {
    await waitForBackend()
  } catch (e) {
    dialog.showErrorBox('NetGraph', `Backend non disponible :\n${e.message}`)
    app.quit(); return
  }

  createMain()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (backendProc && !backendProc.killed) {
    try { backendProc.kill() } catch {}
  }
})
