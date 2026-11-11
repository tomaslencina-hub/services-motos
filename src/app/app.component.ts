import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a routerLink="/" class="marca">
        <img src="icono.svg" alt="" width="28" height="28" />
        <span>Services Motos</span>
      </a>
      <nav>
        <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">Historial</a>
        <a routerLink="/motos/nueva" routerLinkActive="activo">+ Nueva moto</a>
        <a routerLink="/respaldo" routerLinkActive="activo">Respaldo</a>
      </nav>
    </header>
    <main class="contenido">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
