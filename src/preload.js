const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumen', {
  getState:()=>ipcRenderer.invoke('state:get'), saveState:s=>ipcRenderer.invoke('state:save',s), listPorts:()=>ipcRenderer.invoke('ports:list'), connect:p=>ipcRenderer.invoke('dmx:connect',p), play:s=>ipcRenderer.invoke('dmx:scene',s), blackout:()=>ipcRenderer.invoke('dmx:blackout'), exportConfig:()=>ipcRenderer.invoke('config:export'), importConfig:()=>ipcRenderer.invoke('config:import'), checkUpdate:()=>ipcRenderer.invoke('update:check'), installUpdate:()=>ipcRenderer.invoke('update:install'), releases:()=>ipcRenderer.invoke('external:releases'), onUpdate:cb=>ipcRenderer.on('update-available',(_,v)=>cb(v)), onStatus:cb=>ipcRenderer.on('dmx-status',(_,s)=>cb(s))
});
