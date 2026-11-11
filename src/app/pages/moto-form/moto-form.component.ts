import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HistorialRepository } from '../../data/historial.repository';
import { Moto } from '../../models/historial.models';
import { normalizarPatente } from '../../utils/texto';

const ANIO_MAX = new Date().getFullYear() + 1;

@Component({
  selector: 'app-moto-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './moto-form.component.html',
})
export class MotoFormComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly anioMax = ANIO_MAX;
  readonly motoId = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);
  private motoOriginal: Moto | null = null;

  readonly form = new FormGroup({
    patente: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(5)] }),
    marca: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    modelo: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    anio: new FormControl<number | null>(null, [Validators.min(1950), Validators.max(ANIO_MAX)]),
    color: new FormControl('', { nonNullable: true }),
    clienteNombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    clienteTelefono: new FormControl('', { nonNullable: true }),
    notas: new FormControl('', { nonNullable: true }),
  });

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      const moto = await this.repo.obtenerMoto(id);
      if (!moto) {
        this.router.navigate(['/']);
        return;
      }
      this.motoId.set(id);
      this.motoOriginal = moto;
      this.form.patchValue(moto);
    } else {
      const patente = this.route.snapshot.queryParamMap.get('patente');
      if (patente) this.form.controls.patente.setValue(normalizarPatente(patente));
    }
  }

  normalizarCampoPatente(): void {
    const c = this.form.controls.patente;
    c.setValue(normalizarPatente(c.value));
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

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const moto: Moto = {
        ...(this.motoOriginal ?? { creadoEn: '', actualizadoEn: '' }),
        ...v,
        marca: v.marca.trim(),
        modelo: v.modelo.trim(),
        clienteNombre: v.clienteNombre.trim(),
        id: this.motoId() ?? undefined,
      };
      const id = await this.repo.guardarMoto(moto);
      this.router.navigate(['/motos', id], { replaceUrl: true });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      this.guardando.set(false);
    }
  }
}
