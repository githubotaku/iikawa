const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (s) => ipcRenderer.send('save-state', s),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
  onCursor: (fn) => ipcRenderer.on('cursor', (_e, pt) => fn(pt)),
  onResync: (fn) => ipcRenderer.on('resync', () => fn()),
});
