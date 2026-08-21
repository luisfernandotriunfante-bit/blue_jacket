export interface InvoiceIdentity {
  raw: string;
  number: string;
  series: string;
  normalized: string;
}

function normalizeDigits(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '');
  return digits || (value.replace(/\D/g, '') ? '0' : '');
}

/**
 * Preserva a série apenas quando ela está explicitamente separada na fonte.
 * Ex.: 002915720-1 => number=2915720, series=1.
 * Uma NF 29157208 não é truncada nem tratada como "2915720 série 8".
 */
export function parseInvoiceIdentity(value: unknown): InvoiceIdentity {
  const raw = String(value ?? '').trim();
  if (!raw) return { raw: '', number: '', series: '', normalized: '' };

  const explicitSeries = raw.match(/^\s*0*([0-9]+)\s*[-\/]\s*0*([0-9]+)\s*$/);
  if (explicitSeries) {
    const number = normalizeDigits(explicitSeries[1]);
    const series = normalizeDigits(explicitSeries[2]);
    return { raw, number, series, normalized: number && series ? `${number}-${series}` : number };
  }

  const number = normalizeDigits(raw);
  return { raw, number, series: '', normalized: number };
}

/**
 * Recebimentos 218/12.322 podem trazer somente o número, enquanto a Carteira
 * pode trazer número-série. O vínculo é permitido pelo mesmo número quando a
 * série foi explicitamente identificada; nunca por prefixo ou corte de dígito.
 */
export function invoiceMatches(portfolio: InvoiceIdentity, receipt: InvoiceIdentity): boolean {
  if (!portfolio.number || !receipt.number) return false;
  if (portfolio.normalized === receipt.normalized) return true;
  return portfolio.number === receipt.number && (!portfolio.series || !receipt.series || portfolio.series === receipt.series);
}
