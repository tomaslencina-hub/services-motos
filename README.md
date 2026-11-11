# Services Motos

App para que un taller registre el historial de services de cada moto.
Se busca por **patente**, **nombre del cliente** o **marca/modelo**.

- **PC (Windows .exe)**: Angular + Electron
- **Android (.apk)**: Angular + Capacitor
- **Datos**: se guardan localmente en cada equipo (IndexedDB con Dexie). No necesita internet ni cuentas.

## Requisitos

- Node.js 22 LTS
- Para la APK: Android Studio (última versión) con JDK 21

## Primeros pasos

```bash
npm install
npm start            # abre en el navegador: http://localhost:4200
```

## App de escritorio (Windows)

```bash
npm run electron     # compila y abre la app en una ventana
npm run dist:win     # genera el instalador en /release (Services Motos Setup x.x.x.exe)
```

Para desarrollar con recarga en vivo: `npm start` en una terminal y `npm run electron:dev` en otra.

Los datos quedan en `%APPDATA%\services-motos` y se conservan al actualizar la app.

## APK para Android

```bash
npm run android:init   # solo la primera vez: crea la carpeta /android
npm run android:sync   # cada vez que cambies código
npm run android:open   # abre Android Studio
```

En Android Studio: **Build → Generate App Bundles or APKs → Generate APKs**.
Por consola: `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.

Para publicar en Play Store o instalar en varios celulares, generá un APK/AAB firmado
(**Build → Generate Signed App Bundle / APK**).

## Respaldo

Como todo es local, desde la pantalla **Respaldo** se puede:

- **Descargar respaldo (.json)**: copia completa para restaurar o pasar datos entre PC y celular.
- **Exportar a Excel (.csv)**: una fila por service.
- **Importar**: combinar (agrega lo nuevo, empareja motos por patente) o reemplazar todo.

La pantalla principal avisa si pasaron más de 7 días sin respaldo.

## Estructura

```
src/app/
  models/historial.models.ts          Moto, RegistroService, respaldo
  data/historial.repository.ts        Contrato de acceso a datos (clase abstracta)
  data/local-historial.repository.ts  Implementación local con Dexie (IndexedDB)
  data/respaldo.service.ts            Exportar/importar JSON y CSV
  pages/motos-lista                   Buscador + listado
  pages/moto-detalle                  Ficha de la moto + historial
  pages/moto-form                     Alta/edición de moto
  pages/service-form                  Alta/edición de service
  pages/respaldo                      Respaldo e importación
electron/main.cjs                     Ventana de escritorio
capacitor.config.json                 Configuración Android
```

## Migrar a la nube más adelante

Los componentes solo usan `HistorialRepository`. Para pasar a Supabase (u otro backend):

1. Crear `SupabaseHistorialRepository implements HistorialRepository`.
2. En `app.config.ts` cambiar `useClass: LocalHistorialRepository` por la nueva clase.
3. Exportar el respaldo `.json` desde cada equipo e importarlo en la nube con un script.

## Nota sobre dependencias

Angular, Dexie y Electron están en `devDependencies` a propósito: Angular compila todo en `dist/`,
y así el instalador de Electron no incluye `node_modules` innecesarios.
