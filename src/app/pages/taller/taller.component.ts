import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HistorialRepository } from '../../data/historial.repository';

@Component({
  selector: 'app-taller',
  imports: [ReactiveFormsModule],
  templateUrl: './taller.component.html',
})
export class TallerComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);

  readonly mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  readonly guardando = signal(false);

  readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    direccion: new FormControl('', { nonNullable: true }),
    telefono: new FormControl('', { nonNullable: true }),
    cuit: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true }),
    notaPie: new FormControl('', { nonNullable: true }),
  });

  async ngOnInit(): Promise<void> {
    this.form.patchValue(await this.repo.obtenerDatosTaller());
  }

  async guardar(): Promise<void> {
    this.mensaje.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.guardarDatosTaller({
        nombre: v.nombre.trim(),
        direccion: v.direccion.trim(),
        telefono: v.telefono.trim(),
        cuit: v.cuit.trim(),
        email: v.email.trim(),
        notaPie: v.notaPie.trim(),
      });
      this.form.markAsPristine();
      this.mensaje.set({ tipo: 'ok', texto: 'Datos guardados. Ya salen en los próximos comprobantes.' });
    } catch (e) {
      this.mensaje.set({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      this.guardando.set(false);
    }
  }
}
