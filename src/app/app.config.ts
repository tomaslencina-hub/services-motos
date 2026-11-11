import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { HistorialRepository } from './data/historial.repository';
import { LocalHistorialRepository } from './data/local-historial.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    { provide: LOCALE_ID, useValue: 'es-AR' },
    // Para migrar a la nube: crear SupabaseHistorialRepository y cambiar solo esta línea.
    { provide: HistorialRepository, useClass: LocalHistorialRepository },
  ],
};
