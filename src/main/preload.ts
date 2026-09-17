import { contextBridge, ipcRenderer } from 'electron';
import type { PetAPI, AppSnapshot } from '../shared/api';
const api: PetAPI = {
  snapshot: () => ipcRenderer.invoke('pet:snapshot'),
  subscribe: (callback) => {
    const listener = (_: unknown, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on('pet:update', listener);
    return () => { ipcRenderer.removeListener('pet:update', listener); };
  },
  preferences: patch => ipcRenderer.invoke('pet:preferences', patch),
  openPanel: () => ipcRenderer.send('pet:panel'), dismiss: () => ipcRenderer.send('pet:dismiss'),
  interactive: value => ipcRenderer.send('pet:interactive', value),
  drag: phase => ipcRenderer.send('pet:drag', phase),
  copy: text => ipcRenderer.invoke('pet:copy', text),
  focusApp: provider => ipcRenderer.invoke('pet:focusApp', provider),
  focusProcess: processName => ipcRenderer.invoke('pet:focusProcess', processName),
  integration: action => ipcRenderer.invoke('pet:integration', action),
  refreshUserPets: () => ipcRenderer.invoke('pet:refreshUserPets'),
  openUserPetsDir: () => ipcRenderer.invoke('pet:openUserPetsDir')
};
contextBridge.exposeInMainWorld('pet', api);
