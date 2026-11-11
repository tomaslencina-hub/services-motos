import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HistorialRepository } from '../../data/historial.repository';
import { Moto, RegistroService } from '../../models/historial.models';
import { hoyISO } from '../../utils/texto';

/** Botones rápidos para no tipear siempre lo mismo. Editá la lista según lo que hace el taller. */
const TRABAJOS_FRECUENTES = [
  'Cambio de aceite',
  'Cambio de filtro de aceite',
  'Limpieza / cambio de filtro de aire',
  'Cambio de bujía',
  'Kit de transmisión (cadena, corona y piñón)',
  'Tensado y lubricación de cadena',
  'Pastillas de freno delanteras',
  'Pastillas / zapatas de freno traseras',
  'Cambio de líquido de frenos',
  'Regulación / limpieza de carburador',
  'Regulación de válvulas',
  'Cambio de cubierta',
  'Cambio de cámara',
  'Cambio de batería',
  'Service general',
];

@Component({
  selector: 'app-service-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './service-form.component.html',
})
export class ServiceFormComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly trabajosFrecuentes = TRABAJOS_FRECUENTES;
  readonly moto = signal<Moto | null>(null);
  readonly serviceId = signal<number | null>(null);
  readonly ultimoKm = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);
  private serviceOriginal: RegistroService | null = null;

  readonly form = new FormGroup({
    fecha: new FormControl(hoyISO(), { nonNullable: true, validators: [Validators.required] }),
    kilometraje: new FormControl<number | null>(null, [Validators.min(0)]),
    trabajos: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    repuestos: new FormControl('', { nonNullable: true }),
    manoDeObra: new FormControl<number | null>(null, [Validators.min(0)]),
    costoRepuestos: new FormControl<number | null>(null, [Validators.min(0)]),
    mecanico: new FormControl('', { nonNullable: true }),
    proximoServiceKm: new FormControl<number | null>(null, [Validators.min(0)]),
    proximoServiceFecha: new FormControl<string | null>(null),
    observaciones: new FormControl('', { nonNullable: true }),
  });

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly total = computed(() => (this.valores().manoDeObra ?? 0) + (this.valores().costoRepuestos ?? 0));

  async ngOnInit(): Promise<void> {
    const motoId = Number(this.route.snapshot.paramMap.get('id'));
    const serviceId = Number(this.route.snapshot.paramMap.get('serviceId'));

    const moto = motoId ? await this.repo.obtenerMoto(motoId) : undefined;
    if (!moto) {
      this.router.navigate(['/']);
      return;
    }
    this.moto.set(moto);

    const services = await this.repo.listarServices(motoId);
    this.ultimoKm.set(services.find((s) => s.kilometraje && s.id !== serviceId)?.kilometraje ?? null);

    if (serviceId) {
      const s = await this.repo.obtenerService(serviceId);
      if (!s || s.motoId !== motoId) {
        this.router.navigate(['/motos', motoId]);
        return;
      }
      this.serviceId.set(serviceId);
      this.serviceOriginal = s;
      this.form.patchValue(s);
    } else {
      // Por defecto, el último mecánico que atendió esta moto.
      const ultimoMecanico = services.find((s) => s.mecanico)?.mecanico;
      if (ultimoMecanico) this.form.controls.mecanico.setValue(ultimoMecanico);
    }
  }

  agregarTrabajo(trabajo: string): void {
    const c = this.form.controls.trabajos;
    const actual = c.value.trim();
    c.setValue(actual ? `${actual}\n${trabajo}` : trabajo);
    c.markAsDirty();
  }

  invalido(campo: string): boolean {
    const c = this.form.get(campo);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  async guardar(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const moto = this.moto();
    if (!moto?.id) return;

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const service: RegistroService = {
        ...(this.serviceOriginal ?? { creadoEn: '', actualizadoEn: '' }),
        ...v,
        trabajos: v.trabajos.trim(),
        proximoServiceFecha: v.proximoServiceFecha || null,
        motoId: moto.id,
        id: this.serviceId() ?? undefined,
      };
      await this.repo.guardarService(service);
      this.router.navigate(['/motos', moto.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      this.guardando.set(false);
    }
  }
}
