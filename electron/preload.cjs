'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, typed API to the setup window (setup.html).
// The main app window does NOT use a preload — it talks directly to the
// Express backend via HTTP, just like the browser version.
contextBridge.exposeInMainWorld('electronSetup', {
  getDefaultDataDir: ()      => ipcRenderer.invoke('get-default-data-dir'),
  browseDataDir:     ()      => ipcRenderer.invoke('browse-data-dir'),
  completeSetup:     (dir)   => ipcRenderer.invoke('complete-setup', dir),
});
