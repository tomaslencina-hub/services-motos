// Proceso principal de Electron: abre la app Angular compilada en una ventana de escritorio.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const MODO_DEV = process.argv.includes('--dev');
const DIST = path.join(__dirname, '..', 'dist', 'services-motos', 'browser');

// Protocolo propio "app://" en lugar de file:// para que los módulos JS
// y la base de datos local (IndexedDB) funcionen con un origen estable.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Una sola instancia abierta a la vez (evita dos ventanas escribiendo la misma base).
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let ventana = null;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Services Motos',
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Los links externos se abren en el navegador, no dentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MODO_DEV) {
    ventana.loadURL('http://localhost:4200');
    ventana.webContents.openDevTools();
  } else {
    ventana.loadURL('app://bundle/index.html');
  }
}

app.on('second-instance', () => {
  if (ventana) {
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  }
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    let archivo = path.normalize(path.join(DIST, decodeURIComponent(pathname)));

    if (!archivo.startsWith(DIST)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      archivo = path.join(DIST, 'index.html');
    }
    return net.fetch(pathToFileURL(archivo).toString());
  });

  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
