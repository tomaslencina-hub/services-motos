export interface Moto {
  id?: number;
  /** Patente normalizada: mayúsculas, sin espacios ni guiones (ej. A123BCD). */
  patente: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string;
  clienteNombre: string;
  clienteTelefono: string;
  notas: string;
  creadoEn: string;
  actualizadoEn: string;
}

export type TipoItem = 'trabajo' | 'repuesto';

/** Una línea del comprobante: un trabajo (mano de obra) o un repuesto, con su precio. */
export interface ItemService {
  tipo: TipoItem;
  descripcion: string;
  cantidad: number;
  /** null = sin precio cargado (por ejemplo, services viejos convertidos). */
  precioUnitario: number | null;
}

export interface RegistroService {
  id?: number;
  motoId: number;
  /** Fecha del service en formato YYYY-MM-DD. */
  fecha: string;
  kilometraje: number | null;
  /**
   * Detalle con precios. Los services cargados antes de que existiera no lo tienen:
   * usar itemsDeService() para leerlo siempre.
   */
  items?: ItemService[];
  /** Número de comprobante, se asigna la primera vez que se genera. */
  numeroComprobante?: number | null;
  // Los campos de texto y totales se calculan desde los ítems al guardar,
  // así el historial, el CSV y los respaldos viejos siguen funcionando igual.
  trabajos: string;
  repuestos: string;
  manoDeObra: number | null;
  costoRepuestos: number | null;
  mecanico: string;
  proximoServiceKm: number | null;
  proximoServiceFecha: string | null;
  observaciones: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MotoConResumen extends Moto {
  cantidadServices: number;
  ultimoService: RegistroService | null;
}

/** Encabezado y pie de los comprobantes. */
export interface DatosTaller {
  nombre: string;
  direccion: string;
  telefono: string;
  cuit: string;
  email: string;
  /** Texto al pie del comprobante (garantía, horarios, medios de pago…). */
  notaPie: string;
}

export const TALLER_POR_DEFECTO: DatosTaller = {
  nombre: 'Pachi Motosport',
  direccion: '',
  telefono: '',
  cuit: '',
  email: '',
  notaPie: '',
};

export interface RespaldoHistorial {
  app: 'services-motos';
  version: 1;
  exportadoEn: string;
  motos: Moto[];
  services: RegistroService[];
  /** No existe en respaldos hechos antes de agregar los comprobantes. */
  taller?: DatosTaller;
}

export type ModoImportacion = 'reemplazar' | 'combinar';

export function totalService(s: Pick<RegistroService, 'manoDeObra' | 'costoRepuestos'>): number {
  return (s.manoDeObra ?? 0) + (s.costoRepuestos ?? 0);
}

export function subtotalItem(item: ItemService): number {
  return (item.cantidad || 0) * (item.precioUnitario ?? 0);
}

/**
 * Ítems del service. Si es un service viejo (sin ítems), los arma desde el texto:
 * una línea por trabajo o repuesto, y si había un solo trabajo o repuesto le asigna el monto;
 * si había varios, el monto va en una línea aparte para no inventar precios.
 */
export function itemsDeService(s: RegistroService): ItemService[] {
  if (s.items?.length) return s.items;

  const desdeTexto = (texto: string, tipo: TipoItem, monto: number | null, etiquetaTotal: string): ItemService[] => {
    const lineas = (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const items: ItemService[] = lineas.map((descripcion) => ({ tipo, descripcion, cantidad: 1, precioUnitario: null }));
    if (monto) {
      if (items.length === 1) items[0].precioUnitario = monto;
      else items.push({ tipo, descripcion: etiquetaTotal, cantidad: 1, precioUnitario: monto });
    }
    return items;
  };

  return [
    ...desdeTexto(s.trabajos, 'trabajo', s.manoDeObra, 'Mano de obra'),
    ...desdeTexto(s.repuestos, 'repuesto', s.costoRepuestos, 'Repuestos'),
  ];
}

/** Campos de texto y totales derivados de los ítems (lo que se guarda junto con ellos). */
export function resumenDeItems(
  items: ItemService[],
): Pick<RegistroService, 'trabajos' | 'repuestos' | 'manoDeObra' | 'costoRepuestos'> {
  const texto = (tipo: TipoItem) =>
    items
      .filter((i) => i.tipo === tipo)
      .map((i) => (i.cantidad > 1 ? `${i.cantidad} x ${i.descripcion}` : i.descripcion))
      .join('\n');
  const suma = (tipo: TipoItem) =>
    items.filter((i) => i.tipo === tipo).reduce((acc, i) => acc + subtotalItem(i), 0);

  return {
    trabajos: texto('trabajo'),
    repuestos: texto('repuesto'),
    manoDeObra: suma('trabajo') || null,
    costoRepuestos: suma('repuesto') || null,
  };
}

/** "7" -> "0007" */
export function formatearNumeroComprobante(numero: number): string {
  return String(numero).padStart(4, '0');
}
