// Puente entre la app y el proceso principal: ventana, actualizaciones y comprobantes.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ventanaApp', {
  minimizar: () => ipcRenderer.send('ventana:minimizar'),
  cerrar: () => ipcRenderer.send('ventana:cerrar'),
  alActualizacionLista: (callback) => ipcRenderer.on('actualizacion:lista', (_evento, version) => callback(version)),
  instalarActualizacion: () => ipcRenderer.send('actualizacion:instalar'),
  guardarComprobante: (nombre, datos, accion) => ipcRenderer.invoke('comprobante:guardar', nombre, datos, accion),
  abrirWhatsapp: (telefono, mensaje) => ipcRenderer.invoke('comprobante:abrirWhatsapp', telefono, mensaje),
});
