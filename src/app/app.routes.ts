import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Historial | Services Motos',
    loadComponent: () =>
      import('./pages/motos-lista/motos-lista.component').then((m) => m.MotosListaComponent),
  },
  {
    path: 'motos/nueva',
    title: 'Nueva moto | Services Motos',
    loadComponent: () =>
      import('./pages/moto-form/moto-form.component').then((m) => m.MotoFormComponent),
  },
  {
    path: 'motos/:id/editar',
    title: 'Editar moto | Services Motos',
    loadComponent: () =>
      import('./pages/moto-form/moto-form.component').then((m) => m.MotoFormComponent),
  },
  {
    path: 'motos/:id/services/nuevo',
    title: 'Nuevo service | Services Motos',
    loadComponent: () =>
      import('./pages/service-form/service-form.component').then((m) => m.ServiceFormComponent),
  },
  {
    path: 'motos/:id/services/:serviceId/comprobante',
    title: 'Comprobante | Services Motos',
    loadComponent: () =>
      import('./pages/comprobante/comprobante.component').then((m) => m.ComprobanteComponent),
  },
  {
    path: 'motos/:id/services/:serviceId',
    title: 'Editar service | Services Motos',
    loadComponent: () =>
      import('./pages/service-form/service-form.component').then((m) => m.ServiceFormComponent),
  },
  {
    path: 'motos/:id',
    title: 'Moto | Services Motos',
    loadComponent: () =>
      import('./pages/moto-detalle/moto-detalle.component').then((m) => m.MotoDetalleComponent),
  },
  {
    path: 'respaldo',
    title: 'Respaldo | Services Motos',
    loadComponent: () =>
      import('./pages/respaldo/respaldo.component').then((m) => m.RespaldoComponent),
  },
  {
    path: 'taller',
    title: 'Datos del taller | Services Motos',
    loadComponent: () => import('./pages/taller/taller.component').then((m) => m.TallerComponent),
  },
  { path: '**', redirectTo: '' },
];
