const _electron        = require('electron')
const { app, BrowserWindow, dialog } = _electron.default || _electron
const { spawn, execSync, execFileSync } = require('child_process')
const path = require('path')
const http = require('http')
const fs   = require('fs')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// ── Paths ──────────────────────────────────────────────────────────────────────
const isDev        = !app.isPackaged
const resourcesDir = isDev
  ? path.join(__dirname, '..')
  : process.resourcesPath

const backendName = isWin ? 'pcybox-orbis-backend.exe' : 'pcybox-orbis-backend'
const backendExe = isDev
  ? path.join(resourcesDir, 'dist', 'backend', backendName)
  : path.join(resourcesDir, backendName)

const npcapInstaller = isDev
  ? path.join(resourcesDir, 'resources', 'npcap-installer.exe')
  : path.join(resourcesDir, 'npcap-installer.exe')

const frontendDist = isDev
  ? path.join(resourcesDir, 'frontend', 'dist')
  : path.join(resourcesDir, 'frontend_dist')

const BACKEND_URL = 'http://127.0.0.1:8000'
const BACKEND_PORT = 8000

const iconPath = isDev
  ? path.join(__dirname, 'icon.png')
  : path.join(resourcesDir, 'icon.png')

let mainWindow   = null
let splashWindow = null
let backendProc  = null
let backendLogStream = null
let isQuitting   = false

function getBackendLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'backend.log')
}

function openBackendLog() {
  const logPath = getBackendLogPath()
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  backendLogStream = fs.createWriteStream(logPath, { flags: 'a' })
  backendLogStream.write(`\n--- ${new Date().toISOString()} ---\n`)
}

function closeBackendLog() {
  if (backendLogStream) {
    try { backendLogStream.end() } catch {}
    backendLogStream = null
  }
}

// ── Port management ────────────────────────────────────────────────────────────
function killPort(port) {
  try {
    if (isWin) {
      const out = execSync('netstat -ano', { encoding: 'utf8', stdio: 'pipe' })
      const pids = new Set()
      for (const line of out.split('\n')) {
        if (!line.includes(`:${port} `) && !line.includes(`:${port}\t`)) continue
        const m = line.trim().match(/(\d+)\s*$/)
        if (m && m[1] !== '0') pids.add(m[1])
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' }) } catch {}
      }
      if (pids.size > 0) {
        try { execSync('ping -n 2 127.0.0.1', { stdio: 'pipe' }) } catch {}
      }
      return
    }

    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: 'pipe' })
    for (const pid of out.trim().split('\n').filter(Boolean)) {
      try { execSync(`kill -9 ${pid}`, { stdio: 'pipe' }) } catch {}
    }
    if (out.trim()) {
      try { execSync('sleep 1', { stdio: 'pipe' }) } catch {}
    }
  } catch {}
}

// ── Npcap (Windows only) ───────────────────────────────────────────────────────
function isNpcapInstalled() {
  if (!isWin) return true

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
  if (!isWin || !fs.existsSync(npcapInstaller)) return false
  try {
    execSync(`"${npcapInstaller}"`, { stdio: 'inherit' })
    return true
  } catch { return false }
}

function ensureMacRootLaunch() {
  // Packaged macOS app: relaunch as root via the native admin password dialog.
  if (!isMac || isDev || !process.getuid || process.getuid() === 0) return true

  const bin = process.execPath
  const onDmg = bin.startsWith('/Volumes/')

  if (onDmg) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'PCYBOX Orbis',
      message:
        'Installe l’app dans Applications pour un fonctionnement optimal.\n\n'
        + 'Une fenêtre macOS va demander ton mot de passe administrateur '
        + '(requis pour la capture réseau).',
      buttons: ['Continuer', 'Quitter'],
      defaultId: 0,
    })
    if (choice === 1) {
      app.quit()
      return false
    }
  } else {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'PCYBOX Orbis',
      message:
        'PCYBOX Orbis va demander ton mot de passe administrateur macOS '
        + 'pour capturer le trafic réseau.',
      buttons: ['OK'],
    })
  }

  // Launch detached so osascript returns immediately (avoid blocking on app lifetime).
  const script =
    'do shell script "nohup " & quoted form of '
    + JSON.stringify(bin)
    + ' & " >/dev/null 2>&1 &" with administrator privileges'

  try {
    execFileSync('osascript', ['-e', script])
  } catch (err) {
    const detail = String(err.stderr || err.message || '')
    const cancelled = /cancel/i.test(detail)
    dialog.showErrorBox(
      'PCYBOX Orbis',
      cancelled
        ? 'Mot de passe administrateur annulé.\nLa capture réseau nécessite les droits root.'
        : 'Impossible d’obtenir les droits administrateur.\n\n'
          + (onDmg
            ? 'Copie l’app dans /Applications, puis relance depuis le Launchpad.'
            : 'Relance l’application et accepte la demande de mot de passe macOS.'),
    )
    app.quit()
    return false
  }

  app.quit()
  return false
}

function ensureCaptureDependencies() {
  if (!isWin) return true

  if (isNpcapInstalled()) return true

  if (!fs.existsSync(npcapInstaller)) return true

  const choice = dialog.showMessageBoxSync({
    type: 'question', title: 'PCYBOX Orbis - Npcap requis',
    message: 'PCYBOX Orbis nécessite Npcap pour capturer le trafic réseau.\nInstaller maintenant ?',
    buttons: ['Installer', 'Quitter'], defaultId: 0,
  })
  if (choice === 1) return false
  if (!installNpcap()) {
    dialog.showErrorBox(
      'PCYBOX Orbis',
      'Installation Npcap échouée. Installe-le manuellement depuis https://npcap.com',
    )
    return false
  }
  return true
}

// ── Windows ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380, height: 310, frame: false,
    resizable: false, alwaysOnTop: true, center: true,
    transparent: true, icon: iconPath,
    webPreferences: { nodeIntegration: false },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 600,
    show: false, title: 'PCYBOX Orbis', backgroundColor: '#000000',
    icon: iconPath,
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
function waitForBackend(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0
    function poll() {
      http.get(BACKEND_URL + '/graph', res => {
        if (res.statusCode === 200) resolve()
        else retry()
      }).on('error', retry)
    }
    function retry() {
      if (++n >= maxAttempts) reject(new Error('Backend timeout'))
      else setTimeout(poll, 1000)
    }
    poll()
  })
}

function killBackend() {
  if (backendProc) {
    try {
      if (isWin) {
        execSync(`taskkill /PID ${backendProc.pid} /T /F`, { stdio: 'pipe' })
      } else {
        backendProc.kill('SIGTERM')
      }
    } catch {}
    backendProc = null
  }
  killPort(BACKEND_PORT)
}

function fetchCaptureStatus() {
  return new Promise((resolve) => {
    http.get(BACKEND_URL + '/capture/status', (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(null) }
      })
    }).on('error', () => resolve(null))
  })
}

function launchBackend() {
  if (!fs.existsSync(backendExe)) {
    dialog.showErrorBox('PCYBOX Orbis', `Backend introuvable :\n${backendExe}`)
    app.quit(); return
  }

  if (!isWin) {
    try { fs.chmodSync(backendExe, 0o755) } catch {}
  }

  killPort(BACKEND_PORT)
  openBackendLog()

  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE

  backendProc = spawn(backendExe, [], {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  if (backendLogStream) {
    backendProc.stdout.pipe(backendLogStream, { end: false })
    backendProc.stderr.pipe(backendLogStream, { end: false })
  }
  backendProc.on('error', err => {
    if (isQuitting) return
    dialog.showErrorBox('PCYBOX Orbis', `Impossible de démarrer le backend :\n${err.message}`)
    app.quit()
  })
  backendProc.on('exit', (code) => {
    if (isQuitting) return
    if (mainWindow) {
      dialog.showErrorBox('PCYBOX Orbis', `Backend arrêté (code ${code}).`)
      app.quit()
    }
  })
}

async function startApp() {
  if (!ensureMacRootLaunch()) return

  if (!ensureCaptureDependencies()) {
    app.quit()
    return
  }

  createSplash()
  launchBackend()

  try {
    await waitForBackend()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const captureStatus = await fetchCaptureStatus()
    if (captureStatus?.error) {
      const logPath = getBackendLogPath()
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'PCYBOX Orbis — capture désactivée',
        message: `${captureStatus.error}\n\nLogs backend :\n${logPath}`,
        buttons: ['Continuer'],
      })
    }
  } catch (e) {
    const hint = isMac
      ? `\n\nLogs backend :\n${getBackendLogPath()}`
      : ''
    dialog.showErrorBox('PCYBOX Orbis', `Backend non disponible :\n${e.message}${hint}`)
    app.quit()
    return
  }

  createMain()
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(startApp)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startApp()
  }
})

app.on('window-all-closed', () => {
  if (!isMac) {
    isQuitting = true
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  killBackend()
  closeBackendLog()
})
