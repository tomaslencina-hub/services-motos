import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import {
  ModoImportacion,
  Moto,
  MotoConResumen,
  RegistroService,
  RespaldoHistorial,
} from '../models/historial.models';
import { normalizarPatente } from '../utils/texto';
import { HistorialRepository } from './historial.repository';

/** Base IndexedDB local. En Electron queda en la carpeta de datos del usuario; en Android, dentro de la app. */
class HistorialDB extends Dexie {
  motos!: Table<Moto, number>;
  services!: Table<RegistroService, number>;

  constructor() {
    super('services-motos');
    this.version(1).stores({
      motos: '++id, &patente, clienteNombre, marca, modelo',
      services: '++id, motoId, fecha',
    });
  }
}

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

  async exportar(): Promise<RespaldoHistorial> {
    const [motos, services] = await Promise.all([this.db.motos.toArray(), this.db.services.toArray()]);
    return {
      app: 'services-motos',
      version: 1,
      exportadoEn: new Date().toISOString(),
      motos,
      services,
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

    await this.db.transaction('rw', this.db.motos, this.db.services, async () => {
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
          await this.db.services.add(sinId({ ...s, motoId }));
          servicesImportados++;
        }
      }
    });

    return { motos: motosImportadas, services: servicesImportados };
  }
}
