import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HistorialRepository } from '../../data/historial.repository';
import { RespaldoService } from '../../data/respaldo.service';
import { MotoConResumen } from '../../models/historial.models';
import { normalizarPatente, normalizarTexto } from '../../utils/texto';

type CampoBusqueda = 'todo' | 'patente' | 'cliente' | 'modelo';

@Component({
  selector: 'app-motos-lista',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './motos-lista.component.html',
})
export class MotosListaComponent implements OnInit {
  private readonly repo = inject(HistorialRepository);
  private readonly respaldo = inject(RespaldoService);
  private readonly router = inject(Router);

  readonly campos: { valor: CampoBusqueda; etiqueta: string }[] = [
    { valor: 'todo', etiqueta: 'Todo' },
    { valor: 'patente', etiqueta: 'Patente' },
    { valor: 'cliente', etiqueta: 'Cliente' },
    { valor: 'modelo', etiqueta: 'Marca / modelo' },
  ];

  readonly motos = signal<MotoConResumen[]>([]);
  readonly cargando = signal(true);
  readonly busqueda = signal('');
  readonly campo = signal<CampoBusqueda>('todo');
  readonly diasSinRespaldo = signal<number | null>(null);

  readonly filtradas = computed(() => {
    const texto = normalizarTexto(this.busqueda());
    const patente = normalizarPatente(this.busqueda());
    if (!texto) return this.motos();

    const campo = this.campo();
    return this.motos().filter((m) => {
      const porPatente = !!patente && m.patente.includes(patente);
      const porCliente = normalizarTexto(m.clienteNombre).includes(texto);
      const porModelo = normalizarTexto(`${m.marca} ${m.modelo}`).includes(texto);
      switch (campo) {
        case 'patente':
          return porPatente;
        case 'cliente':
          return porCliente;
        case 'modelo':
          return porModelo;
        default:
          return porPatente || porCliente || porModelo;
      }
    });
  });

  /** Si buscó algo con pinta de patente y no existe, ofrece cargarla. */
  readonly patenteSugerida = computed(() => {
    const p = normalizarPatente(this.busqueda());
    const parecePatente = p.length >= 6 && /\d/.test(p) && /[A-Z]/.test(p);
    return parecePatente && !this.motos().some((m) => m.patente === p) ? p : null;
  });

  readonly mostrarAvisoRespaldo = computed(() => {
    const dias = this.diasSinRespaldo();
    return this.motos().length > 0 && (dias === null || dias >= 7);
  });

  async ngOnInit(): Promise<void> {
    this.diasSinRespaldo.set(this.respaldo.diasDesdeUltimoRespaldo());
    try {
      this.motos.set(await this.repo.listarMotosConResumen());
    } finally {
      this.cargando.set(false);
    }
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  abrirPrimera(): void {
    const primera = this.filtradas()[0];
    if (primera) this.router.navigate(['/motos', primera.id]);
  }
}
