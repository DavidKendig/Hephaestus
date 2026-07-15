const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

const DEV = process.env.HEPH_DEV === '1'
const BACKEND_PORT = process.env.HEPH_PORT || '8155'
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`
const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend')

let backendProc = null

function backendAlive() {
  return new Promise((resolve) => {
    const req = http.get(BACKEND_URL, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function pythonCommand() {
  // Prefer the project venv created by install.sh (required on macOS/Linux
  // where system pip installs are blocked); fall back to system Python.
  const venvPython = process.platform === 'win32'
    ? path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(BACKEND_DIR, '.venv', 'bin', 'python')
  if (fs.existsSync(venvPython)) return venvPython
  return process.platform === 'win32' ? 'python' : 'python3'
}

async function ensureBackend() {
  if (await backendAlive()) return // already running (e.g. started manually)

  const python = pythonCommand()
  backendProc = spawn(python, ['main.py'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      HEPH_PORT: BACKEND_PORT,
      HEPH_PARENT_PID: String(process.pid),
    },
    stdio: 'inherit',
  })
  backendProc.on('exit', (code) => {
    backendProc = null
    if (code !== 0 && code !== null) {
      console.error(`Backend exited with code ${code}`)
    }
  })

  for (let i = 0; i < 40; i++) {
    if (await backendAlive()) return
    await new Promise((r) => setTimeout(r, 250))
  }
  console.error('Backend did not become healthy in time')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#212121',
    autoHideMenuBar: true,
    icon: path.join(
      __dirname,
      process.platform === 'win32' ? 'icon.ico' : 'icon.png',
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // External links open in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  await ensureBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  if (backendProc) backendProc.kill()
})
