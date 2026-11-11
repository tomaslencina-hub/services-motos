import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ModoImportacion, RespaldoHistorial, totalService } from '../models/historial.models';
import { hoyISO } from '../utils/texto';
import { HistorialRepository } from './historial.repository';

const CLAVE_ULTIMO_RESPALDO = 'services-motos.ultimoRespaldo';

@Injectable({ providedIn: 'root' })
export class RespaldoService {
  private readonly repo = inject(HistorialRepository);

  /** Descarga un .json con todo el historial (sirve para restaurar o pasar a otro equipo). */
  async exportarJson(): Promise<void> {
    const respaldo = await this.repo.exportar();
    await this.guardarArchivo(
      `respaldo-services-motos-${hoyISO()}.json`,
      JSON.stringify(respaldo, null, 2),
      'application/json',
    );
    this.marcarRespaldo();
  }

  /** Descarga un .csv que abre directo en Excel (una fila por service). */
  async exportarCsv(): Promise<void> {
    const { motos, services } = await this.repo.exportar();
    const motosPorId = new Map(motos.map((m) => [m.id!, m]));

    const encabezado = [
      'Patente', 'Marca', 'Modelo', 'Año', 'Cliente', 'Teléfono',
      'Fecha', 'Km', 'Trabajos', 'Repuestos', 'Mano de obra', 'Costo repuestos', 'Total',
      'Mecánico', 'Próximo service (km)', 'Próximo service (fecha)', 'Observaciones',
    ];

    const filas = services
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((s) => {
        const m = motosPorId.get(s.motoId);
        return [
          m?.patente, m?.marca, m?.modelo, m?.anio, m?.clienteNombre, m?.clienteTelefono,
          s.fecha, s.kilometraje, s.trabajos, s.repuestos, s.manoDeObra, s.costoRepuestos, totalService(s),
          s.mecanico, s.proximoServiceKm, s.proximoServiceFecha, s.observaciones,
        ];
      });

    // Excel en español usa ";" como separador; el BOM hace que respete los acentos.
    const csv =
      '﻿' +
      [encabezado, ...filas]
        .map((fila) => fila.map((v) => this.celdaCsv(v)).join(';'))
        .join('\r\n');

    await this.guardarArchivo(`historial-services-${hoyISO()}.csv`, csv, 'text/csv');
  }

  async importarArchivo(archivo: File, modo: ModoImportacion): Promise<{ motos: number; services: number }> {
    let respaldo: RespaldoHistorial;
    try {
      respaldo = JSON.parse(await archivo.text());
    } catch {
      throw new Error('No se pudo leer el archivo. ¿Es un .json exportado desde esta app?');
    }
    return this.repo.importar(respaldo, modo);
  }

  ultimoRespaldo(): Date | null {
    try {
      const valor = localStorage.getItem(CLAVE_ULTIMO_RESPALDO);
      return valor ? new Date(valor) : null;
    } catch {
      return null;
    }
  }

  diasDesdeUltimoRespaldo(): number | null {
    const ultimo = this.ultimoRespaldo();
    if (!ultimo) return null;
    return Math.floor((Date.now() - ultimo.getTime()) / 86_400_000);
  }

  private marcarRespaldo(): void {
    try {
      localStorage.setItem(CLAVE_ULTIMO_RESPALDO, new Date().toISOString());
    } catch {
      /* sin almacenamiento disponible: no pasa nada */
    }
  }

  private celdaCsv(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor).replace(/"/g, '""');
    return `"${texto}"`;
  }

  private async guardarArchivo(nombre: string, contenido: string, mime: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // Android: se escribe el archivo y se abre el menú "Compartir" (Drive, WhatsApp, mail, etc.).
      const { uri } = await Filesystem.writeFile({
        path: nombre,
        data: contenido,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: nombre, files: [uri] });
      return;
    }

    // Escritorio (Electron) / navegador: descarga normal con diálogo "Guardar como".
    const blob = new Blob([contenido], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
