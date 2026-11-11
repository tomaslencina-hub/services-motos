/** "ab 123 cd" / "AB-123-CD" -> "AB123CD" */
export function normalizarPatente(valor: string): string {
  return (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Minúsculas y sin acentos, para buscar sin importar cómo se escribió. */
export function normalizarTexto(valor: string): string {
  return (valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Fecha local de hoy en formato YYYY-MM-DD (para inputs type="date"). */
export function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
