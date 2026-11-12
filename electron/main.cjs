// Proceso principal de Electron: abre la app Angular compilada en una ventana de escritorio.
const { app, BrowserWindow, protocol, net, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { autoUpdater } = require('electron-updater');

const MODO_DEV = process.argv.includes('--dev');
const DIST = path.join(__dirname, '..', 'dist', 'services-motos', 'browser');
// Las versiones de prueba (1.0.1-dev.7) buscan actualizaciones cada 10 minutos; las del taller, cada 4 horas.
const ES_VERSION_DE_PRUEBA = app.getVersion().includes('-dev.');
const CADA_CUANTO_BUSCAR = ES_VERSION_DE_PRUEBA ? 10 * 60 * 1000 : 4 * 60 * 60 * 1000;

// Protocolo propio "app://" en lugar de file:// para que los módulos JS
// y la base de datos local (IndexedDB) funcionen con un origen estable.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// "npm run dev" usa su propia carpeta: así puede estar abierta junto con la app instalada.
if (MODO_DEV) {
  app.setPath('userData', path.join(app.getPath('appData'), 'services-motos-dev'));
}

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

// Copia el PDF al portapapeles de Windows, como "Copiar" en el Explorador:
// en el chat de WhatsApp alcanza con Ctrl+V para adjuntarlo.
function copiarAlPortapapeles(archivo) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -LiteralPath $env:ARCHIVO_COMPROBANTE'],
      { windowsHide: true, env: { ...process.env, ARCHIVO_COMPROBANTE: archivo } },
      (error) => resolve(!error),
    );
  });
}

// Abre el chat en WhatsApp Desktop y, cuando su ventana queda al frente, aprieta Ctrl+V
// para adjuntar el PDF que ya está en el portapapeles. Enter lo aprieta siempre el usuario.
const SCRIPT_PEGAR = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace Pachi -Name Ventana -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr ventana, out uint proceso);
'@
function WhatsappAlFrente {
  $proceso = 0
  [void][Pachi.Ventana]::GetWindowThreadProcessId([Pachi.Ventana]::GetForegroundWindow(), [ref]$proceso)
  (Get-Process -Id $proceso -ErrorAction SilentlyContinue).ProcessName -like 'WhatsApp*'
}
$limite = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $limite) {
  if (WhatsappAlFrente) {
    # Tiempo para que cargue el chat; si mientras tanto se cambió de ventana, no se pega nada.
    Start-Sleep -Milliseconds 1800
    if (WhatsappAlFrente) { [System.Windows.Forms.SendKeys]::SendWait('^v'); 'pegado' } else { 'no-pegado' }
    exit
  }
  Start-Sleep -Milliseconds 300
}
'no-pegado'
`;

function pegarEnWhatsapp() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT_PEGAR, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 25000 },
      (error, salida) => resolve(!error && String(salida).trim() === 'pegado'),
    );
  });
}

ipcMain.handle('comprobante:abrirWhatsapp', async (_evento, telefono, mensaje) => {
  const numero = String(telefono).replace(/\D/g, '');
  // Sin número o sin WhatsApp Desktop no se pega nada solo: queda el Ctrl+V manual.
  if (!numero || !app.getApplicationNameForProtocol('whatsapp://')) return 'sin-app';
  await shell.openExternal(`whatsapp://send?phone=${numero}&text=${encodeURIComponent(String(mensaje))}`);
  return (await pegarEnWhatsapp()) ? 'pegado' : 'no-pegado';
});

// Comprobantes en PDF: se guardan en Documentos/Pachi Motosport/Comprobantes.
// Solo se usa el nombre del archivo, así nunca se escribe fuera de esa carpeta.
ipcMain.handle('comprobante:guardar', async (_evento, nombre, datos, accion) => {
  const carpeta = path.join(app.getPath('documents'), 'Pachi Motosport', 'Comprobantes');
  await fs.promises.mkdir(carpeta, { recursive: true });
  const archivo = path.join(carpeta, path.basename(String(nombre)));
  await fs.promises.writeFile(archivo, Buffer.from(datos));

  if (accion === 'whatsapp') {
    if (await copiarAlPortapapeles(archivo)) return 'portapapeles';
    // Si no se pudo copiar, queda el método de antes: abrir la carpeta para arrastrarlo.
    shell.showItemInFolder(archivo);
    return 'carpeta';
  }
  await shell.openPath(archivo);
  return 'abierto';
});

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
  setInterval(buscar, CADA_CUANTO_BUSCAR);
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
