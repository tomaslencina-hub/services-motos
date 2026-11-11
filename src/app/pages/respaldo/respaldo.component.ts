import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HistorialRepository } from '../../data/historial.repository';
import { RespaldoService } from '../../data/respaldo.service';
import { ModoImportacion } from '../../models/historial.models';

@Component({
  selector: 'app-respaldo',
  imports: [DatePipe],
  templateUrl: './respaldo.component.html',
})
export class RespaldoComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly respaldo = inject(RespaldoService);

  readonly cantMotos = signal(0);
  readonly cantServices = signal(0);
  readonly ultimo = signal<Date | null>(null);
  readonly modo = signal<ModoImportacion>('combinar');
  readonly mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  readonly trabajando = signal(false);

  async ngOnInit(): Promise<void> {
    await this.actualizarConteo();
  }

  async exportarJson(): Promise<void> {
    await this.ejecutar(async () => {
      await this.respaldo.exportarJson();
      this.ultimo.set(this.respaldo.ultimoRespaldo());
      return 'Respaldo generado. Guardalo en un pendrive, Drive o mandalo por mail.';
    });
  }

  async exportarCsv(): Promise<void> {
    await this.ejecutar(async () => {
      await this.respaldo.exportarCsv();
      return 'Planilla generada. Se abre con Excel o Google Sheets.';
    });
  }

  async importar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;

    if (
      this.modo() === 'reemplazar' &&
      !confirm('Se van a BORRAR todos los datos actuales y reemplazar por los del archivo. ¿Continuar?')
    ) {
      return;
    }

    await this.ejecutar(async () => {
      const r = await this.respaldo.importarArchivo(archivo, this.modo());
      await this.actualizarConteo();
      return `Importación lista: ${r.motos} motos y ${r.services} services agregados.`;
    });
  }

  private async actualizarConteo(): Promise<void> {
    const datos = await this.repo.exportar();
    this.cantMotos.set(datos.motos.length);
    this.cantServices.set(datos.services.length);
    this.ultimo.set(this.respaldo.ultimoRespaldo());
  }

  private async ejecutar(accion: () => Promise<string>): Promise<void> {
    this.mensaje.set(null);
    this.trabajando.set(true);
    try {
      this.mensaje.set({ tipo: 'ok', texto: await accion() });
    } catch (e) {
      this.mensaje.set({ tipo: 'error', texto: e instanceof Error ? e.message : 'Ocurrió un error.' });
    } finally {
      this.trabajando.set(false);
    }
  }
}
