const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');

let mainWindow;
let pythonProcess;

const isDev = !app.isPackaged;
const BACKEND_PORT = 8599;

function findPython() {
  const venvPath = path.join(__dirname, '..', 'backend', 'env', 'Scripts', 'python.exe');
  const candidates = process.platform === 'win32'
    ? [venvPath, 'python', 'python3']
    : [path.join(__dirname, '..', 'backend', 'env', 'bin', 'python'), 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" -c "import uvicorn"`, { stdio: 'pipe', timeout: 5000 });
      return cmd;
    } catch (e) {
      // try next
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function killStaleBackend() {
  // Kill any stale process on our port before starting
  if (process.platform === 'win32') {
    try {
      const result = execSync(
        `netstat -ano | findstr :${BACKEND_PORT}`,
        { stdio: 'pipe', timeout: 3000 }
      ).toString();
      const lines = result.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && parseInt(pid) > 0) {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', timeout: 3000 });
          console.log(`[Backend] Killed stale process PID ${pid} on port ${BACKEND_PORT}`);
        } catch (e) { /* ignore */ }
      }
      if (pids.size > 0) {
        // Wait for the OS to fully release the port
        console.log('[Backend] Waiting for port to be released...');
        const waitUntil = Date.now() + 3000;
        while (Date.now() < waitUntil) {
          // busy wait
        }
      }
    } catch (e) {
      // No process on the port, that's fine
    }
  }
}

function startPythonBackend() {
  killStaleBackend();

  const backendDir = path.join(__dirname, '..', 'backend');
  const pythonCmd = findPython();
  console.log(`[Backend] Using Python: ${pythonCmd}`);

  pythonProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
  ], {
    cwd: backendDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.on('error', (err) => {
    console.error('[Backend] Failed to start:', err.message);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`[Backend] Exited with code ${code}`);
  });
}

function waitForBackend(maxRetries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    let resolved = false;
    const check = () => {
      if (resolved) return;
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolved = true;
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (resolved) return;
      retries++;
      if (retries >= maxRetries) {
        reject(new Error('Backend failed to start after maximum retries'));
      } else {
        console.log(`[Backend] Waiting for backend... (${retries}/${maxRetries})`);
        setTimeout(check, interval);
      }
    };
    // Give backend a moment to start before first check
    setTimeout(check, 2000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Memora',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  startPythonBackend();

  try {
    await waitForBackend();
    console.log('[Memora] Backend is ready, launching window');
  } catch (err) {
    console.error('[Memora]', err.message);
    console.log('[Memora] Proceeding anyway...');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-backend-url', () => {
  return `http://127.0.0.1:${BACKEND_PORT}`;
});
