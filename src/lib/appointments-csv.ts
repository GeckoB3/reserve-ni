/** Escape a single CSV field (RFC-style, double quotes). */
export function escapeCsvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function formatMoneyPence(pence: number | null | undefined, sym: string): string {
  if (pence == null || Number.isNaN(pence)) return '';
  return `${sym}${(pence / 100).toFixed(2)}`;
}

export function downloadCsvString(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildCsvFromRows(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
}
