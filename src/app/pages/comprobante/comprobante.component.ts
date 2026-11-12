import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ComprobanteService, DatosComprobante, ResultadoEnvio } from '../../data/comprobante.service';
import { HistorialRepository } from '../../data/historial.repository';
import {
  ItemService,
  formatearNumeroComprobante,
  itemsDeService,
  subtotalItem,
} from '../../models/historial.models';

@Component({
  selector: 'app-comprobante',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './comprobante.component.html',
})
export class ComprobanteComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly comprobantes = inject(ComprobanteService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly esCelular = Capacitor.isNativePlatform();
  readonly datos = signal<DatosComprobante | null>(null);
  readonly trabajando = signal<'whatsapp' | 'pdf' | null>(null);
  readonly error = signal<string | null>(null);
  /** Qué hacer después de tocar "Enviar por WhatsApp" (en la PC no se puede adjuntar solo). */
  readonly resultadoEnvio = signal<ResultadoEnvio | null>(null);
  readonly subtotalItem = subtotalItem;

  readonly numero = computed(() => formatearNumeroComprobante(this.datos()?.numero ?? 0));
  readonly trabajos = computed(() => this.datos()?.items.filter((i) => i.tipo === 'trabajo') ?? []);
  readonly repuestos = computed(() => this.datos()?.items.filter((i) => i.tipo === 'repuesto') ?? []);
  readonly totalTrabajos = computed(() => this.suma(this.trabajos()));
  readonly totalRepuestos = computed(() => this.suma(this.repuestos()));
  readonly total = computed(() => this.totalTrabajos() + this.totalRepuestos());
  readonly sinPrecios = computed(() => this.datos()?.items.some((i) => i.precioUnitario === null) ?? false);
  readonly tallerIncompleto = computed(() => {
    const t = this.datos()?.taller;
    return !!t && !t.direccion.trim() && !t.telefono.trim();
  });

  async ngOnInit(): Promise<void> {
    const motoId = Number(this.route.snapshot.paramMap.get('id'));
    const serviceId = Number(this.route.snapshot.paramMap.get('serviceId'));
    const [moto, service, taller] = await Promise.all([
      this.repo.obtenerMoto(motoId),
      this.repo.obtenerService(serviceId),
      this.repo.obtenerDatosTaller(),
    ]);
    if (!moto || !service || service.motoId !== motoId) {
      this.router.navigate(['/']);
      return;
    }
    const numero = await this.repo.numeroComprobante(serviceId);
    this.datos.set({ numero, moto, service, taller, items: itemsDeService(service) });
  }

  enviarPorWhatsapp(): Promise<void> {
    return this.ejecutar('whatsapp', async (d) => {
      this.resultadoEnvio.set(await this.comprobantes.enviarPorWhatsapp(d));
    });
  }

  abrirPdf(): Promise<void> {
    return this.ejecutar('pdf', (d) => this.comprobantes.abrirPdf(d));
  }

  private async ejecutar(accion: 'whatsapp' | 'pdf', fn: (d: DatosComprobante) => Promise<void>): Promise<void> {
    const d = this.datos();
    if (!d) return;
    this.error.set(null);
    this.resultadoEnvio.set(null);
    this.trabajando.set(accion);
    try {
      await fn(d);
    } catch (e) {
      this.error.set(e instanceof Error ? `No se pudo generar el PDF: ${e.message}` : 'No se pudo generar el PDF.');
    } finally {
      this.trabajando.set(null);
    }
  }

  private suma(items: ItemService[]): number {
    return items.reduce((acc, i) => acc + subtotalItem(i), 0);
  }
}
