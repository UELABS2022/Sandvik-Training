const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');

const PROTOCOL = 'mining-training';
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Sandvik Training',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
}

function handleProtocolUrl(url) {
  if (mainWindow) {
    mainWindow.webContents.send('auth-callback', url);
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(PROTOCOL);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLink) handleProtocolUrl(deepLink);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('secure-store:set', (_event, key, value) => {
  const encoded = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(String(value)).toString('base64')
    : Buffer.from(String(value), 'utf8').toString('base64');
  return { key, encoded, encrypted: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));
