import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import {
  DatosTaller,
  ModoImportacion,
  Moto,
  MotoConResumen,
  RegistroService,
  RespaldoHistorial,
  TALLER_POR_DEFECTO,
} from '../models/historial.models';
import { normalizarPatente } from '../utils/texto';
import { HistorialRepository } from './historial.repository';

/** Base IndexedDB local. En Electron queda en la carpeta de datos del usuario; en Android, dentro de la app. */
class HistorialDB extends Dexie {
  motos!: Table<Moto, number>;
  services!: Table<RegistroService, number>;
  /** Configuración suelta (clave → valor), por ahora solo los datos del taller. */
  ajustes!: Table<{ clave: string; valor: unknown }, string>;

  constructor() {
    super('services-motos');
    this.version(1).stores({
      motos: '++id, &patente, clienteNombre, marca, modelo',
      services: '++id, motoId, fecha',
    });
    this.version(2).stores({
      ajustes: 'clave',
    });
  }
}

const CLAVE_TALLER = 'taller';

function ordenarServices(a: RegistroService, b: RegistroService): number {
  return b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn);
}

function sinId<T extends { id?: number }>(obj: T): T {
  const copia = { ...obj };
  delete copia.id;
  return copia;
}

@Injectable({ providedIn: 'root' })
export class LocalHistorialRepository implements HistorialRepository {
  private readonly db = new HistorialDB();

  async listarMotosConResumen(): Promise<MotoConResumen[]> {
    const [motos, services] = await Promise.all([this.db.motos.toArray(), this.db.services.toArray()]);

    const porMoto = new Map<number, RegistroService[]>();
    for (const s of services) {
      const lista = porMoto.get(s.motoId) ?? [];
      lista.push(s);
      porMoto.set(s.motoId, lista);
    }

    const resultado: MotoConResumen[] = motos.map((m) => {
      const lista = (porMoto.get(m.id!) ?? []).sort(ordenarServices);
      return { ...m, cantidadServices: lista.length, ultimoService: lista[0] ?? null };
    });

    // Primero las motos con actividad más reciente.
    return resultado.sort((a, b) => {
      const fa = a.ultimoService?.fecha ?? a.actualizadoEn.slice(0, 10);
      const fb = b.ultimoService?.fecha ?? b.actualizadoEn.slice(0, 10);
      return fb.localeCompare(fa);
    });
  }

  obtenerMoto(id: number): Promise<Moto | undefined> {
    return this.db.motos.get(id);
  }

  obtenerMotoPorPatente(patente: string): Promise<Moto | undefined> {
    return this.db.motos.where('patente').equals(normalizarPatente(patente)).first();
  }

  async guardarMoto(moto: Moto): Promise<number> {
    const patente = normalizarPatente(moto.patente);
    if (!patente) throw new Error('La patente es obligatoria.');

    const existente = await this.obtenerMotoPorPatente(patente);
    if (existente && existente.id !== moto.id) {
      throw new Error(`Ya hay una moto cargada con la patente ${patente}.`);
    }

    const ahora = new Date().toISOString();
    if (moto.id) {
      await this.db.motos.put({ ...moto, patente, actualizadoEn: ahora });
      return moto.id;
    }
    return this.db.motos.add(sinId({ ...moto, patente, creadoEn: ahora, actualizadoEn: ahora }));
  }

  async eliminarMoto(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.motos, this.db.services, async () => {
      await this.db.services.where('motoId').equals(id).delete();
      await this.db.motos.delete(id);
    });
  }

  async listarServices(motoId: number): Promise<RegistroService[]> {
    const lista = await this.db.services.where('motoId').equals(motoId).toArray();
    return lista.sort(ordenarServices);
  }

  obtenerService(id: number): Promise<RegistroService | undefined> {
    return this.db.services.get(id);
  }

  async guardarService(service: RegistroService): Promise<number> {
    const ahora = new Date().toISOString();
    if (service.id) {
      await this.db.services.put({ ...service, actualizadoEn: ahora });
      await this.db.motos.update(service.motoId, { actualizadoEn: ahora });
      return service.id;
    }
    const id = await this.db.services.add(sinId({ ...service, creadoEn: ahora, actualizadoEn: ahora }));
    await this.db.motos.update(service.motoId, { actualizadoEn: ahora });
    return id;
  }

  async eliminarService(id: number): Promise<void> {
    await this.db.services.delete(id);
  }

  async numeroComprobante(serviceId: number): Promise<number> {
    return this.db.transaction('rw', this.db.services, async () => {
      const service = await this.db.services.get(serviceId);
      if (!service) throw new Error('El service no existe.');
      if (service.numeroComprobante) return service.numeroComprobante;

      let ultimo = 0;
      await this.db.services.each((s) => (ultimo = Math.max(ultimo, s.numeroComprobante ?? 0)));
      const numero = ultimo + 1;
      await this.db.services.update(serviceId, { numeroComprobante: numero });
      return numero;
    });
  }

  async obtenerDatosTaller(): Promise<DatosTaller> {
    const fila = await this.db.ajustes.get(CLAVE_TALLER);
    return { ...TALLER_POR_DEFECTO, ...(fila?.valor as Partial<DatosTaller> | undefined) };
  }

  async guardarDatosTaller(datos: DatosTaller): Promise<void> {
    await this.db.ajustes.put({ clave: CLAVE_TALLER, valor: datos });
  }

  async exportar(): Promise<RespaldoHistorial> {
    const [motos, services] = await Promise.all([this.db.motos.toArray(), this.db.services.toArray()]);
    return {
      app: 'services-motos',
      version: 1,
      exportadoEn: new Date().toISOString(),
      motos,
      services,
      taller: await this.obtenerDatosTaller(),
    };
  }

  async importar(
    respaldo: RespaldoHistorial,
    modo: ModoImportacion,
  ): Promise<{ motos: number; services: number }> {
    if (respaldo?.app !== 'services-motos' || !Array.isArray(respaldo.motos) || !Array.isArray(respaldo.services)) {
      throw new Error('El archivo no es un respaldo válido de Services Motos.');
    }

    let motosImportadas = 0;
    let servicesImportados = 0;

    await this.db.transaction('rw', this.db.motos, this.db.services, this.db.ajustes, async () => {
      // Datos del taller: al reemplazar se toman los del archivo; al combinar, solo si acá no hay.
      if (respaldo.taller && (modo === 'reemplazar' || !(await this.db.ajustes.get(CLAVE_TALLER)))) {
        await this.db.ajustes.put({ clave: CLAVE_TALLER, valor: respaldo.taller });
      }

      if (modo === 'reemplazar') {
        await this.db.services.clear();
        await this.db.motos.clear();
        await this.db.motos.bulkPut(respaldo.motos);
        await this.db.services.bulkPut(respaldo.services);
        motosImportadas = respaldo.motos.length;
        servicesImportados = respaldo.services.length;
        return;
      }

      // Combinar: las motos se emparejan por patente; los services repetidos se saltean.
      const idsNuevos = new Map<number, number>();
      for (const m of respaldo.motos) {
        const patente = normalizarPatente(m.patente);
        const existente = await this.db.motos.where('patente').equals(patente).first();
        if (existente?.id) {
          idsNuevos.set(m.id!, existente.id);
        } else {
          const nuevoId = await this.db.motos.add(sinId({ ...m, patente }));
          idsNuevos.set(m.id!, nuevoId);
          motosImportadas++;
        }
      }

      for (const s of respaldo.services) {
        const motoId = idsNuevos.get(s.motoId);
        if (!motoId) continue;
        const repetido = await this.db.services
          .where('motoId')
          .equals(motoId)
          .filter((x) => x.fecha === s.fecha && x.trabajos.trim() === s.trabajos.trim())
          .first();
        if (!repetido) {
          // El número de comprobante se descarta: en este equipo puede estar usado por otro service.
          await this.db.services.add(sinId({ ...s, motoId, numeroComprobante: null }));
          servicesImportados++;
        }
      }
    });

    return { motos: motosImportadas, services: servicesImportados };
  }
}
