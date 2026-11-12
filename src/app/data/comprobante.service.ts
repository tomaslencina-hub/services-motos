import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  DatosTaller,
  ItemService,
  Moto,
  RegistroService,
  formatearNumeroComprobante,
  subtotalItem,
} from '../models/historial.models';

export interface DatosComprobante {
  numero: number;
  service: RegistroService;
  moto: Moto;
  taller: DatosTaller;
  items: ItemService[];
}

/** Cómo quedó el PDF después de "Enviar por WhatsApp", para decirle al usuario qué hacer. */
export type ResultadoEnvio = 'pegado' | 'portapapeles' | 'carpeta' | 'descargado' | 'compartido';

/** Lo que expone electron/preload.cjs para guardar el PDF. En la web y en Android no existe. */
interface PuenteComprobantes {
  guardarComprobante(
    nombre: string,
    datos: Uint8Array,
    accion: 'abrir' | 'whatsapp',
  ): Promise<'portapapeles' | 'carpeta' | 'abierto'>;
  abrirWhatsapp(telefono: string, mensaje: string): Promise<'pegado' | 'no-pegado' | 'sin-app'>;
}

const AZUL: [number, number, number] = [30, 79, 184];
const GRIS: [number, number, number] = [110, 118, 130];
const TEXTO: [number, number, number] = [25, 30, 38];

const formatoPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

/** "$ 32.500" con espacios comunes (las fuentes del PDF no traen los espacios especiales). */
export function pesos(valor: number): string {
  return formatoPesos.format(valor).replace(/[  ]/g, ' ');
}

function fechaCorta(iso: string): string {
  return iso.split('-').reverse().join('/');
}

@Injectable({ providedIn: 'root' })
export class ComprobanteService {
  private logo: Promise<string | null> | null = null;

  nombreArchivo(d: DatosComprobante): string {
    return `Comprobante-${formatearNumeroComprobante(d.numero)}-${d.moto.patente}.pdf`;
  }

  mensajeWhatsapp(d: DatosComprobante): string {
    const total = d.items.reduce((acc, i) => acc + subtotalItem(i), 0);
    const nombre = d.moto.clienteNombre.split(' ')[0];
    return (
      `Hola ${nombre}! Te enviamos el comprobante N° ${formatearNumeroComprobante(d.numero)} ` +
      `del service de tu ${d.moto.marca} ${d.moto.modelo} (${d.moto.patente}). ` +
      `Total: ${pesos(total)}.\n${d.taller.nombre}`
    );
  }

  /** "11 2345-6789" -> "5491123456789" (vacío si no hay teléfono). */
  numeroWhatsapp(telefono: string): string {
    const numero = telefono.replace(/\D/g, '');
    return numero ? (numero.startsWith('54') ? numero : '549' + numero) : '';
  }

  linkWhatsapp(telefono: string, mensaje: string): string {
    return `https://wa.me/${this.numeroWhatsapp(telefono)}?text=${encodeURIComponent(mensaje)}`;
  }

  /**
   * PC: guarda el PDF, lo copia al portapapeles y abre el chat del cliente. Con WhatsApp Desktop
   * lo pega solo; si no, queda copiado para pegarlo con Ctrl+V. El envío final lo hace el usuario.
   * Celular: abre "Compartir" con el PDF adjunto.
   */
  async enviarPorWhatsapp(d: DatosComprobante): Promise<ResultadoEnvio> {
    const pdf = await this.generarPdf(d);
    const mensaje = this.mensajeWhatsapp(d);
    const link = this.linkWhatsapp(d.moto.clienteTelefono, mensaje);

    if (Capacitor.isNativePlatform()) {
      await this.compartirEnCelular(d, pdf, mensaje);
      return 'compartido';
    }
    const puente = this.puente();
    if (!puente) {
      this.descargar(d, pdf);
      window.open(link, '_blank');
      return 'descargado';
    }
    const guardado = await puente.guardarComprobante(this.nombreArchivo(d), pdf, 'whatsapp');
    if (guardado !== 'portapapeles') {
      window.open(link, '_blank');
      return 'carpeta';
    }
    const abierto = await puente.abrirWhatsapp(this.numeroWhatsapp(d.moto.clienteTelefono), mensaje);
    if (abierto === 'sin-app') window.open(link, '_blank');
    return abierto === 'pegado' ? 'pegado' : 'portapapeles';
  }

  /** PC: guarda y abre el PDF (para verlo o imprimirlo). Celular: "Compartir". */
  async abrirPdf(d: DatosComprobante): Promise<void> {
    const pdf = await this.generarPdf(d);
    if (Capacitor.isNativePlatform()) {
      await this.compartirEnCelular(d, pdf, this.mensajeWhatsapp(d));
      return;
    }
    const puente = this.puente();
    if (puente) await puente.guardarComprobante(this.nombreArchivo(d), pdf, 'abrir');
    else this.descargar(d, pdf);
  }

  async generarPdf(d: DatosComprobante): Promise<Uint8Array> {
    // Se cargan recién acá para no agrandar el arranque de la app.
    const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      this.cargarLogo(),
    ]);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const margen = 16;
    const derecha = ancho - margen;
    const { service: s, moto: m, taller: t } = d;

    // Encabezado: logo y datos del taller a la izquierda, número y fecha a la derecha.
    let y = 14;
    if (logo) {
      doc.addImage(logo, 'JPEG', margen, y, 52, 27.5);
      y += 31;
    }
    doc.setTextColor(...TEXTO).setFont('helvetica', 'bold').setFontSize(12).text(t.nombre, margen, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS);
    const datosTaller = [
      t.direccion,
      t.telefono && `Tel: ${t.telefono}`,
      t.cuit && `CUIT: ${t.cuit}`,
      t.email,
    ].filter(Boolean) as string[];
    datosTaller.forEach((linea, i) => doc.text(linea, margen, y + 5 + i * 4.3));
    const finEncabezado = y + 5 + datosTaller.length * 4.3;

    doc.setTextColor(...AZUL).setFont('helvetica', 'bold').setFontSize(15);
    doc.text('COMPROBANTE DE SERVICE', derecha, 22, { align: 'right' });
    doc.setTextColor(...TEXTO).setFontSize(11);
    doc.text(`N° ${formatearNumeroComprobante(d.numero)}`, derecha, 29, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(10);
    doc.text(`Fecha: ${fechaCorta(s.fecha)}`, derecha, 35, { align: 'right' });
    doc.setFontSize(8).setTextColor(...GRIS);
    doc.text('Documento no válido como factura', derecha, 41, { align: 'right' });

    y = Math.max(finEncabezado, 46) + 3;
    doc.setDrawColor(...AZUL).setLineWidth(0.6).line(margen, y, derecha, y);
    y += 7;

    // Cliente y moto en dos columnas.
    const mitad = margen + (derecha - margen) / 2 + 4;
    const bloque = (titulo: string, lineas: string[], x: number) => {
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GRIS).text(titulo, x, y);
      doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...TEXTO);
      lineas.forEach((l, i) => doc.text(l, x, y + 5.5 + i * 5));
      return lineas.length;
    };
    const motoTexto = `${m.marca} ${m.modelo}${m.anio ? ` (${m.anio})` : ''}`;
    const filas = Math.max(
      bloque('CLIENTE', [m.clienteNombre, m.clienteTelefono && `Tel: ${m.clienteTelefono}`].filter(Boolean) as string[], margen),
      bloque(
        'MOTO',
        [
          `${motoTexto} · Patente ${m.patente}`,
          s.kilometraje ? `Kilometraje: ${s.kilometraje.toLocaleString('es-AR')} km` : '',
        ].filter(Boolean),
        mitad,
      ),
    );
    y += 5.5 + filas * 5 + 4;

    // Detalle: trabajos y repuestos, cada grupo con su título.
    const filaItem = (i: ItemService) => [
      i.descripcion,
      String(i.cantidad),
      i.precioUnitario === null ? '—' : pesos(i.precioUnitario),
      i.precioUnitario === null ? '—' : pesos(subtotalItem(i)),
    ];
    const grupo = (titulo: string, items: ItemService[]) =>
      items.length
        ? [
            [{ content: titulo, colSpan: 4, styles: { fontStyle: 'bold' as const, fillColor: [238, 242, 250] as [number, number, number], textColor: AZUL } }],
            ...items.map(filaItem),
          ]
        : [];
    const trabajos = d.items.filter((i) => i.tipo === 'trabajo');
    const repuestos = d.items.filter((i) => i.tipo === 'repuesto');

    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
      body: [...grupo('Trabajos (mano de obra)', trabajos), ...grupo('Repuestos', repuestos)],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: TEXTO, cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 } },
      headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'center', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 32 },
        3: { halign: 'right', cellWidth: 32 },
      },
      didParseCell: (celda) => {
        if (celda.section === 'head' && celda.column.index > 0) {
          celda.cell.styles.halign = celda.column.index === 1 ? 'center' : 'right';
        }
      },
      didDrawCell: (celda) => {
        if (celda.section === 'body' && celda.column.index === 0) {
          doc.setDrawColor(225, 229, 236).setLineWidth(0.2);
          doc.line(margen, celda.cell.y + celda.cell.height, derecha, celda.cell.y + celda.cell.height);
        }
      },
    });

    // Totales.
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    const suma = (lista: ItemService[]) => lista.reduce((acc, i) => acc + subtotalItem(i), 0);
    const total = suma(d.items);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIS);
    if (trabajos.length && repuestos.length) {
      doc.text('Mano de obra', derecha - 45, y).text(pesos(suma(trabajos)), derecha, y, { align: 'right' });
      doc.text('Repuestos', derecha - 45, y + 5.5).text(pesos(suma(repuestos)), derecha, y + 5.5, { align: 'right' });
      y += 11;
    }
    doc.setFillColor(...AZUL).roundedRect(derecha - 70, y - 4.5, 70, 11, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255, 255, 255);
    doc.text('TOTAL', derecha - 66, y + 2.6).text(pesos(total), derecha - 4, y + 2.6, { align: 'right' });
    y += 17;

    // Observaciones, próximo service y mecánico.
    const parrafo = (titulo: string, texto: string) => {
      const lineas = doc.setFontSize(9.5).splitTextToSize(texto, derecha - margen) as string[];
      if (y + 6 + lineas.length * 4.6 > 275) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GRIS).text(titulo, margen, y);
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...TEXTO).text(lineas, margen, y + 5);
      y += 7 + lineas.length * 4.6;
    };
    if (s.observaciones.trim()) parrafo('OBSERVACIONES', s.observaciones.trim());
    const proximo = [
      s.proximoServiceKm && `a los ${s.proximoServiceKm.toLocaleString('es-AR')} km`,
      s.proximoServiceFecha && `el ${fechaCorta(s.proximoServiceFecha)}`,
    ].filter(Boolean);
    if (proximo.length) parrafo('PRÓXIMO SERVICE', `Recomendamos el próximo service ${proximo.join(' o ')}.`);
    if (s.mecanico.trim()) parrafo('ATENDIDO POR', s.mecanico.trim());

    // Pie en todas las páginas.
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(225, 229, 236).setLineWidth(0.3).line(margen, 281, derecha, 281);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
      if (t.notaPie.trim()) doc.text(doc.splitTextToSize(t.notaPie.trim(), derecha - margen - 30), margen, 286);
      doc.text('Documento no válido como factura', margen, 292);
      if (paginas > 1) doc.text(`Página ${p} de ${paginas}`, derecha, 292, { align: 'right' });
    }

    return new Uint8Array(doc.output('arraybuffer'));
  }

  /** El logo va como JPEG chico sobre fondo blanco para que el PDF pese poco al mandarlo. */
  private cargarLogo(): Promise<string | null> {
    this.logo ??= (async () => {
      try {
        const blob = await (await fetch('logo.png')).blob();
        const imagen = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = 520;
        canvas.height = Math.round((520 * imagen.height) / imagen.width);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch {
        return null;
      }
    })();
    return this.logo;
  }

  private puente(): PuenteComprobantes | undefined {
    const ventanaApp = (window as Window & { ventanaApp?: Partial<PuenteComprobantes> }).ventanaApp;
    return ventanaApp?.guardarComprobante ? (ventanaApp as PuenteComprobantes) : undefined;
  }

  private async compartirEnCelular(d: DatosComprobante, pdf: Uint8Array, mensaje: string): Promise<void> {
    let binario = '';
    for (const byte of pdf) binario += String.fromCharCode(byte);
    const { uri } = await Filesystem.writeFile({
      path: this.nombreArchivo(d),
      data: btoa(binario),
      directory: Directory.Cache,
    });
    await Share.share({ title: this.nombreArchivo(d), text: mensaje, files: [uri] });
  }

  /** Navegador (npm start): descarga común. */
  private descargar(d: DatosComprobante, pdf: Uint8Array): void {
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = this.nombreArchivo(d);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
