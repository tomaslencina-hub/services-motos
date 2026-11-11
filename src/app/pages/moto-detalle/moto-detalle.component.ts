import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HistorialRepository } from '../../data/historial.repository';
import { Moto, RegistroService, totalService } from '../../models/historial.models';

@Component({
  selector: 'app-moto-detalle',
  imports: [RouterLink, DatePipe, DecimalPipe, CurrencyPipe],
  templateUrl: './moto-detalle.component.html',
})
export class MotoDetalleComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly moto = signal<Moto | null>(null);
  readonly services = signal<RegistroService[]>([]);
  readonly totalService = totalService;

  readonly totalGastado = computed(() => this.services().reduce((acc, s) => acc + totalService(s), 0));
  readonly ultimoKm = computed(() => this.services().find((s) => s.kilometraje)?.kilometraje ?? null);
  readonly proximo = computed(() => {
    const ultimo = this.services()[0];
    return ultimo && (ultimo.proximoServiceKm || ultimo.proximoServiceFecha) ? ultimo : null;
  });

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const moto = id ? await this.repo.obtenerMoto(id) : undefined;
    if (!moto) {
      this.router.navigate(['/']);
      return;
    }
    this.moto.set(moto);
    this.services.set(await this.repo.listarServices(id));
  }

  async eliminarService(s: RegistroService): Promise<void> {
    if (!confirm(`¿Eliminar el service del ${s.fecha.split('-').reverse().join('/')}?`)) return;
    await this.repo.eliminarService(s.id!);
    this.services.update((lista) => lista.filter((x) => x.id !== s.id));
  }

  async eliminarMoto(): Promise<void> {
    const m = this.moto();
    if (!m) return;
    const cant = this.services().length;
    const msg =
      `¿Eliminar la moto ${m.patente}` +
      (cant ? ` y sus ${cant} services` : '') +
      '? Esta acción no se puede deshacer.';
    if (!confirm(msg)) return;
    await this.repo.eliminarMoto(m.id!);
    this.router.navigate(['/'], { replaceUrl: true });
  }

  linkWhatsapp(telefono: string): string {
    const numero = telefono.replace(/\D/g, '');
    return `https://wa.me/${numero.startsWith('54') ? numero : '549' + numero}`;
  }
}
