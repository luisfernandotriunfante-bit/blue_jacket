export type PortfolioContinuityMode = 'BASELINE' | 'ROLL_FORWARD' | 'APPROVED_2026_08_17';

export interface PortfolioContinuityRowLike {
  orderDate: string;
  orderNumber: string;
  orderQty: number;
  billQty: number;
  costValue: number;
}

export interface PortfolioContinuitySnapshot {
  sourceFileName: string;
  snapshotDate: string;
  orderNumbers: string[];
  rawRows: number;
  validatedRows: number;
  excludedHistoricalRows: number;
  rawCost: number;
  validatedCost: number;
  excludedHistoricalCost: number;
  rawCases: number;
  validatedCases: number;
  excludedHistoricalCases: number;
  mode: PortfolioContinuityMode;
}

export interface PortfolioContinuityResult<T extends PortfolioContinuityRowLike> {
  rows: T[];
  snapshot: PortfolioContinuitySnapshot;
}

/**
 * Checkpoint aprovado em 21/08/2026 a partir da leitura comparativa
 * CARTEIRA 08.08.xlsx -> CARTEIRA 17.08.xlsx.
 *
 * Ele existe apenas como migração para instalações que já tinham a Carteira 17.08
 * salva antes da criação da regra de continuidade. Depois do primeiro roll-forward,
 * o próprio snapshot persistido passa a ser a autoridade.
 */
export const APPROVED_PORTFOLIO_2026_08_17: PortfolioContinuitySnapshot = {
  sourceFileName: 'CARTEIRA 17.08.xlsx',
  snapshotDate: '2026-08-17',
  orderNumbers: [
    '1160096370',
    '1160102681',
    '1160103178',
    '1160103179',
    '1160103180',
    '1160103181',
    '1160103182',
    '1160103183',
    '1160104097',
    '1160104266',
    '1160104267',
    '1160104268',
    '1160104269',
    '1160104270',
    '1160106125',
    '1160106422',
    '1160106597',
    '1160106601',
    '1160106609',
    '1160106670',
    '1160106674',
    '1160106733',
    '1160108199',
    '1160108200',
    '1160108201',
    '1160108203',
    '1160108206',
    '1160109581',
  ],
  rawRows: 860,
  validatedRows: 213,
  excludedHistoricalRows: 647,
  rawCost: 13_502_867.28,
  validatedCost: 3_254_221.54,
  excludedHistoricalCost: 10_248_645.74,
  rawCases: 115_842,
  validatedCases: 30_777,
  excludedHistoricalCases: 85_065,
  mode: 'APPROVED_2026_08_17',
};

function normalizeOrderNumber(value: unknown): string {
  return String(value ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');
}

function isoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return '';
}

export function portfolioSnapshotDate(fileName: string, rows: PortfolioContinuityRowLike[]): string {
  const years = rows.map(row => isoDate(row.orderDate).slice(0, 4)).filter(year => /^\d{4}$/.test(year));
  const inferredYear = years.sort().at(-1) || String(new Date().getFullYear());
  const base = String(fileName || '').replace(/\.[^.]+$/, '');
  const match = base.match(/(?:^|[^0-9])(\d{1,2})[._\-\s](\d{1,2})(?:[._\-\s](\d{2,4}))?(?:$|[^0-9])/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? (match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3])) : Number(inferredYear);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return rows.map(row => isoDate(row.orderDate)).filter(Boolean).sort().at(-1) || '';
}

function summarize<T extends PortfolioContinuityRowLike>(rows: T[]) {
  return rows.reduce((acc, row) => {
    acc.cost += Math.max(Number(row.costValue) || 0, 0);
    acc.cases += Math.max(Number(row.orderQty) || 0, 0) + Math.max(Number(row.billQty) || 0, 0);
    return acc;
  }, { cost: 0, cases: 0 });
}

export function approvedPortfolioAnchorFor(previous: PortfolioContinuitySnapshot | null | undefined, currentSnapshotDate: string): PortfolioContinuitySnapshot | null {
  if (previous?.snapshotDate && previous.orderNumbers?.length) return previous;
  if (currentSnapshotDate && currentSnapshotDate >= APPROVED_PORTFOLIO_2026_08_17.snapshotDate) return APPROVED_PORTFOLIO_2026_08_17;
  return null;
}

export function applyPortfolioContinuity<T extends PortfolioContinuityRowLike>(
  rows: T[],
  sourceFileName: string,
  previous?: PortfolioContinuitySnapshot | null,
): PortfolioContinuityResult<T> {
  const normalizedRows = rows
    .map(row => ({ ...row, orderNumber: normalizeOrderNumber(row.orderNumber), orderDate: isoDate(row.orderDate) }))
    .filter(row => Boolean(row.orderNumber)) as T[];
  const snapshotDate = portfolioSnapshotDate(sourceFileName, normalizedRows);
  const anchor = approvedPortfolioAnchorFor(previous, snapshotDate);
  const rawSummary = summarize(normalizedRows);

  let mode: PortfolioContinuityMode = 'BASELINE';
  let validatedRows = normalizedRows;

  if (anchor?.snapshotDate && anchor.orderNumbers.length) {
    mode = anchor.mode === 'APPROVED_2026_08_17' && !previous?.snapshotDate ? 'APPROVED_2026_08_17' : 'ROLL_FORWARD';
    const priorOrders = new Set(anchor.orderNumbers.map(normalizeOrderNumber));
    validatedRows = normalizedRows.filter(row => priorOrders.has(row.orderNumber) || Boolean(row.orderDate && row.orderDate > anchor.snapshotDate));
  }

  const validatedSummary = summarize(validatedRows);
  const orderNumbers = Array.from(new Set(validatedRows.map(row => normalizeOrderNumber(row.orderNumber)).filter(Boolean))).sort();
  const snapshot: PortfolioContinuitySnapshot = {
    sourceFileName,
    snapshotDate,
    orderNumbers,
    rawRows: normalizedRows.length,
    validatedRows: validatedRows.length,
    excludedHistoricalRows: Math.max(normalizedRows.length - validatedRows.length, 0),
    rawCost: rawSummary.cost,
    validatedCost: validatedSummary.cost,
    excludedHistoricalCost: Math.max(rawSummary.cost - validatedSummary.cost, 0),
    rawCases: rawSummary.cases,
    validatedCases: validatedSummary.cases,
    excludedHistoricalCases: Math.max(rawSummary.cases - validatedSummary.cases, 0),
    mode,
  };
  return { rows: validatedRows, snapshot };
}

export function portfolioContinuityWarning(snapshot?: PortfolioContinuitySnapshot | null): string {
  if (!snapshot?.snapshotDate) return '';
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const label = snapshot.mode === 'BASELINE' ? 'baseline inicial' : snapshot.mode === 'APPROVED_2026_08_17' ? 'checkpoint aprovado 17/08' : 'continuidade contra o snapshot anterior';
  return `Carteira comparável: ${label}. ${snapshot.validatedRows}/${snapshot.rawRows} linha(s) e ${number(snapshot.validatedCases)}/${number(snapshot.rawCases)} cx permaneceram na leitura operacional; ${money(snapshot.validatedCost)} de ${money(snapshot.rawCost)} foram mantidos. Histórico retroativo excluído: ${snapshot.excludedHistoricalRows} linha(s), ${number(snapshot.excludedHistoricalCases)} cx e ${money(snapshot.excludedHistoricalCost)}.`;
}
