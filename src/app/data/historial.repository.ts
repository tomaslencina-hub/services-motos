import {
  DatosTaller,
  ModoImportacion,
  Moto,
  MotoConResumen,
  RegistroService,
  RespaldoHistorial,
} from '../models/historial.models';

/**
 * Contrato de acceso a datos. Los componentes solo conocen esta clase,
 * así que para pasar de almacenamiento local a la nube (Supabase, Firebase, API propia)
 * alcanza con escribir otra implementación y cambiar el provider en app.config.ts.
 */
export abstract class HistorialRepository {
  abstract listarMotosConResumen(): Promise<MotoConResumen[]>;
  abstract obtenerMoto(id: number): Promise<Moto | undefined>;
  abstract obtenerMotoPorPatente(patente: string): Promise<Moto | undefined>;
  /** Crea o actualiza. Devuelve el id. Lanza error si la patente ya existe en otra moto. */
  abstract guardarMoto(moto: Moto): Promise<number>;
  /** Elimina la moto y todos sus services. */
  abstract eliminarMoto(id: number): Promise<void>;

  /** Services de una moto, del más reciente al más viejo. */
  abstract listarServices(motoId: number): Promise<RegistroService[]>;
  abstract obtenerService(id: number): Promise<RegistroService | undefined>;
  abstract guardarService(service: RegistroService): Promise<number>;
  abstract eliminarService(id: number): Promise<void>;
  /** Número de comprobante del service; si todavía no tiene, le asigna el siguiente libre. */
  abstract numeroComprobante(serviceId: number): Promise<number>;

  abstract obtenerDatosTaller(): Promise<DatosTaller>;
  abstract guardarDatosTaller(datos: DatosTaller): Promise<void>;

  abstract exportar(): Promise<RespaldoHistorial>;
  abstract importar(
    respaldo: RespaldoHistorial,
    modo: ModoImportacion,
  ): Promise<{ motos: number; services: number }>;
}
