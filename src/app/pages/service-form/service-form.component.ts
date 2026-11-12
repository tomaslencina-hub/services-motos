import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HistorialRepository } from '../../data/historial.repository';
import {
  ItemService,
  Moto,
  RegistroService,
  TipoItem,
  itemsDeService,
  resumenDeItems,
  subtotalItem,
} from '../../models/historial.models';
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

type FormItem = FormGroup<{
  tipo: FormControl<TipoItem>;
  descripcion: FormControl<string>;
  cantidad: FormControl<number>;
  precioUnitario: FormControl<number | null>;
}>;

function crearFormItem(item: Partial<ItemService> & { tipo: TipoItem }): FormItem {
  return new FormGroup({
    tipo: new FormControl(item.tipo, { nonNullable: true }),
    descripcion: new FormControl(item.descripcion ?? '', { nonNullable: true }),
    cantidad: new FormControl(item.cantidad ?? 1, { nonNullable: true, validators: [Validators.min(0)] }),
    precioUnitario: new FormControl<number | null>(item.precioUnitario ?? null, [Validators.min(0)]),
  });
}

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
  /** El aviso de "falta el detalle" se muestra recién después de intentar guardar. */
  readonly sinDetalle = signal(false);
  private serviceOriginal: RegistroService | null = null;

  readonly form = new FormGroup({
    fecha: new FormControl(hoyISO(), { nonNullable: true, validators: [Validators.required] }),
    kilometraje: new FormControl<number | null>(null, [Validators.min(0)]),
    items: new FormArray<FormItem>([crearFormItem({ tipo: 'trabajo' })]),
    mecanico: new FormControl('', { nonNullable: true }),
    proximoServiceKm: new FormControl<number | null>(null, [Validators.min(0)]),
    proximoServiceFecha: new FormControl<string | null>(null),
    observaciones: new FormControl('', { nonNullable: true }),
  });

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly totalTrabajos = computed(() => this.sumar('trabajo'));
  readonly totalRepuestos = computed(() => this.sumar('repuesto'));
  readonly total = computed(() => this.totalTrabajos() + this.totalRepuestos());

  get items(): FormArray<FormItem> {
    return this.form.controls.items;
  }

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
      // Los services viejos no tienen ítems: se arman desde el texto que tenían.
      this.items.clear();
      for (const item of itemsDeService(s)) this.items.push(crearFormItem(item));
      if (!this.items.length) this.agregarItem('trabajo');
    } else {
      // Por defecto, el último mecánico que atendió esta moto.
      const ultimoMecanico = services.find((s) => s.mecanico)?.mecanico;
      if (ultimoMecanico) this.form.controls.mecanico.setValue(ultimoMecanico);
    }
  }

  /** Posiciones de los ítems de un tipo, para mostrar trabajos y repuestos en listas separadas. */
  indices(tipo: TipoItem): number[] {
    return this.items.controls.flatMap((c, i) => (c.controls.tipo.value === tipo ? [i] : []));
  }

  subtotal(indice: number): number {
    return subtotalItem(this.items.at(indice).getRawValue());
  }

  agregarItem(tipo: TipoItem, descripcion = ''): void {
    this.items.push(crearFormItem({ tipo, descripcion }));
  }

  /** Botón de trabajo frecuente: completa la primera fila vacía o agrega una nueva. */
  agregarTrabajo(trabajo: string): void {
    const vacia = this.items.controls.find(
      (c) => c.controls.tipo.value === 'trabajo' && !c.controls.descripcion.value.trim(),
    );
    if (vacia) vacia.controls.descripcion.setValue(trabajo);
    else this.agregarItem('trabajo', trabajo);
    this.sinDetalle.set(false);
  }

  quitarItem(indice: number): void {
    this.items.removeAt(indice);
  }

  invalido(campo: string): boolean {
    const c = this.form.get(campo);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  async guardar(): Promise<void> {
    this.error.set(null);
    const items: ItemService[] = this.items
      .getRawValue()
      .map((i) => ({ ...i, descripcion: i.descripcion.trim() }))
      .filter((i) => i.descripcion);

    this.sinDetalle.set(items.length === 0);
    if (this.form.invalid || items.length === 0) {
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
        items,
        ...resumenDeItems(items),
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

  private sumar(tipo: TipoItem): number {
    return ((this.valores().items ?? []) as ItemService[])
      .filter((i) => i.tipo === tipo)
      .reduce((acc, i) => acc + subtotalItem(i), 0);
  }
}
