// Proceso principal de Electron: abre la app Angular compilada en una ventana de escritorio.
const { app, BrowserWindow, protocol, net, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');

const MODO_DEV = process.argv.includes('--dev');
const DIST = path.join(__dirname, '..', 'dist', 'services-motos', 'browser');
const CADA_4_HORAS = 4 * 60 * 60 * 1000;

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
    show: false,
    // Sin la barra de Windows: minimizar y cerrar están dentro de la app.
    frame: false,
    title: 'Services Motos',
    autoHideMenuBar: true,
    backgroundColor: '#0b0f15',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Siempre en pantalla completa: no hay botón de maximizar, así que no se deja achicar.
  ventana.once('ready-to-show', () => {
    ventana.maximize();
    ventana.show();
  });
  ventana.on('unmaximize', () => ventana.maximize());

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

ipcMain.on('ventana:minimizar', (evento) => BrowserWindow.fromWebContents(evento.sender)?.minimize());
ipcMain.on('ventana:cerrar', (evento) => BrowserWindow.fromWebContents(evento.sender)?.close());
ipcMain.on('actualizacion:instalar', () => autoUpdater.quitAndInstall());

// Actualizaciones desde GitHub Releases: se descargan solas en segundo plano.
// Si el usuario no toca "Reiniciar y actualizar", se instalan al cerrar la app.
function buscarActualizaciones() {
  autoUpdater.on('update-downloaded', ({ version }) => {
    ventana?.webContents.send('actualizacion:lista', version);
  });
  autoUpdater.on('error', (error) => console.error('Error al buscar actualizaciones:', error));

  const buscar = () => autoUpdater.checkForUpdates().catch(() => {});
  buscar();
  // La app suele quedar abierta todo el día en el taller.
  setInterval(buscar, CADA_4_HORAS);
}

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

  // Solo en el .exe instalado: con "npm run dev" no hay nada que actualizar.
  if (app.isPackaged) {
    buscarActualizaciones();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
