// Puente entre la app y el proceso principal: ventana y actualizaciones automáticas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ventanaApp', {
  minimizar: () => ipcRenderer.send('ventana:minimizar'),
  cerrar: () => ipcRenderer.send('ventana:cerrar'),
  alActualizacionLista: (callback) => ipcRenderer.on('actualizacion:lista', (_evento, version) => callback(version)),
  instalarActualizacion: () => ipcRenderer.send('actualizacion:instalar'),
});
