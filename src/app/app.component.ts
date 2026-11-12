import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Lo que expone electron/preload.cjs. En la web y en Android no existe. */
interface VentanaApp {
  minimizar(): void;
  cerrar(): void;
  alActualizacionLista(callback: (version: string) => void): void;
  instalarActualizacion(): void;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="app">
      <aside class="lateral">
        <a routerLink="/" class="lateral-logo">
          <img src="logo.png" alt="Pachi Motosport" />
        </a>
        <nav class="menu">
          <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
            <span>Historial</span>
          </a>
          <a routerLink="/motos/nueva" routerLinkActive="activo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
            <span>Nueva moto</span>
          </a>
          <a routerLink="/respaldo" routerLinkActive="activo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            <span>Respaldo</span>
          </a>
        </nav>
        <p class="lateral-pie">Services Motos</p>
      </aside>

      <div class="principal">
        <header class="barra-superior">
          <img class="logo-movil" src="logo.png" alt="Pachi Motosport" />
          <span class="hoy">{{ hoy | date: "EEEE d 'de' MMMM" }}</span>
          @if (ventanaApp) {
            <div class="controles-ventana">
              <button type="button" title="Minimizar" (click)="ventanaApp.minimizar()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
              </button>
              <button type="button" class="cerrar" title="Cerrar" (click)="ventanaApp.cerrar()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          }
        </header>
        <main class="contenido">
          <router-outlet />
        </main>
      </div>

      @if (actualizacion(); as version) {
        <div class="actualizacion" role="status">
          <div>
            <strong>Hay una versión nueva ({{ version }})</strong>
            <p class="sutil">Ya está descargada. Si no reiniciás ahora, se instala al cerrar la app.</p>
          </div>
          <button type="button" class="btn btn-primario" (click)="ventanaApp?.instalarActualizacion()">Reiniciar y actualizar</button>
        </div>
      }
    </div>
  `,
})
export class AppComponent {
  protected readonly ventanaApp = (window as Window & { ventanaApp?: VentanaApp }).ventanaApp;
  protected readonly hoy = new Date();
  protected readonly actualizacion = signal<string | null>(null);

  constructor() {
    this.ventanaApp?.alActualizacionLista((version) => this.actualizacion.set(version));
  }
}
