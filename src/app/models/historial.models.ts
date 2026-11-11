export interface Moto {
  id?: number;
  /** Patente normalizada: mayúsculas, sin espacios ni guiones (ej. A123BCD). */
  patente: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string;
  clienteNombre: string;
  clienteTelefono: string;
  notas: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface RegistroService {
  id?: number;
  motoId: number;
  /** Fecha del service en formato YYYY-MM-DD. */
  fecha: string;
  kilometraje: number | null;
  trabajos: string;
  repuestos: string;
  manoDeObra: number | null;
  costoRepuestos: number | null;
  mecanico: string;
  proximoServiceKm: number | null;
  proximoServiceFecha: string | null;
  observaciones: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MotoConResumen extends Moto {
  cantidadServices: number;
  ultimoService: RegistroService | null;
}

export interface RespaldoHistorial {
  app: 'services-motos';
  version: 1;
  exportadoEn: string;
  motos: Moto[];
  services: RegistroService[];
}

export type ModoImportacion = 'reemplazar' | 'combinar';

export function totalService(s: Pick<RegistroService, 'manoDeObra' | 'costoRepuestos'>): number {
  return (s.manoDeObra ?? 0) + (s.costoRepuestos ?? 0);
}
