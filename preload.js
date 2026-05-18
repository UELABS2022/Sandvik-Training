const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sandvikTraining', {
  secureStoreSet: (key, value) => ipcRenderer.invoke('secure-store:set', key, value),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onAuthCallback: (handler) => {
    ipcRenderer.on('auth-callback', (_event, url) => handler(url));
  },
});
