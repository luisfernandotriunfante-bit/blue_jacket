import type { CanonicalInventoryProduct, CanonicalStockSummary } from './canonical';

export type PortfolioAgeBucketKey = 'ATE_30' | '31_60' | '61_90' | 'MAIS_90' | 'SEM_DATA';

export interface PortfolioLineForAge {
  orderDate?: string;
  billingDate?: string;
  totalCases?: number;
  totalUnits?: number;
  costValue?: number;
  saleValue?: number;
}

export interface PortfolioAgeBucket {
  key: PortfolioAgeBucketKey;
  label: string;
  lines: number;
  cases: number;
  units: number;
  costValue: number;
  saleValue: number;
}

export interface PortfolioAgeSummary {
  asOfDate: string;
  totalLines: number;
  datedLines: number;
  buckets: PortfolioAgeBucket[];
}

export interface SellOutStockPolicy {
  operational: {
    costValue: number;
    saleValue: number;
    coverageSaleDays: number;
    coverageCostDays: number;
  };
  transitScenario: {
    portfolioCostValue: number;
    portfolioSaleValue: number;
    projectedCostValue: number;
    projectedSaleValue: number;
    projectedCoverageSaleDays: number;
    projectedCoverageCostDays: number;
  };
  portfolioAffectsOperationalBase: false;
}

const BUCKETS: Array<{ key: PortfolioAgeBucketKey; label: string }> = [
  { key: 'ATE_30', label: 'Até 30 dias' },
  { key: '31_60', label: '31–60 dias' },
  { key: '61_90', label: '61–90 dias' },
  { key: 'MAIS_90', label: 'Acima de 90 dias' },
  { key: 'SEM_DATA', label: 'Sem data identificada' },
];

const nonNegative = (value: unknown) => Math.max(Number(value) || 0, 0);

function dateFromIso(value: string): Date | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resolvePortfolioPositionDate(fileName: string | undefined, referenceDate: string): string {
  const referenceYear = Number(String(referenceDate || '').slice(0, 4)) || new Date().getUTCFullYear();
  const name = String(fileName || '');
  const match = name.match(/(?:^|\D)(\d{1,2})[.\-_](\d{1,2})(?:[.\-_](\d{2,4}))?(?:\D|$)/);
  if (!match) return referenceDate;
  let year = match[3] ? Number(match[3]) : referenceYear;
  if (year > 0 && year < 100) year += 2000;
  return isoDate(year, Number(match[2]), Number(match[1])) || referenceDate;
}

function ageBucket(days: number | null): PortfolioAgeBucketKey {
  if (days === null) return 'SEM_DATA';
  if (days <= 30) return 'ATE_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return 'MAIS_90';
}

export function summarizePortfolioAge(lines: PortfolioLineForAge[], asOfDate: string): PortfolioAgeSummary {
  const asOf = dateFromIso(asOfDate);
  const buckets = new Map<PortfolioAgeBucketKey, PortfolioAgeBucket>(BUCKETS.map(item => [item.key, { ...item, lines: 0, cases: 0, units: 0, costValue: 0, saleValue: 0 }]));
  let datedLines = 0;

  for (const line of lines || []) {
    const sourceDate = dateFromIso(line.orderDate || '') || dateFromIso(line.billingDate || '');
    const days = asOf && sourceDate ? Math.max(Math.floor((asOf.getTime() - sourceDate.getTime()) / 86400000), 0) : null;
    if (sourceDate) datedLines += 1;
    const bucket = buckets.get(ageBucket(days))!;
    bucket.lines += 1;
    bucket.cases += nonNegative(line.totalCases);
    bucket.units += nonNegative(line.totalUnits);
    bucket.costValue += nonNegative(line.costValue);
    bucket.saleValue += nonNegative(line.saleValue);
  }

  return { asOfDate, totalLines: lines?.length || 0, datedLines, buckets: BUCKETS.map(item => buckets.get(item.key)!) };
}

export function collectPortfolioLines(inventory: CanonicalInventoryProduct[]): PortfolioLineForAge[] {
  return (inventory || []).flatMap(item => {
    const extended = item as CanonicalInventoryProduct & { portfolioLines?: PortfolioLineForAge[] };
    return extended.portfolioLines || [];
  });
}

export function buildSellOutStockPolicy(stock: CanonicalStockSummary): SellOutStockPolicy {
  return {
    operational: {
      costValue: nonNegative(stock.costValue),
      saleValue: nonNegative(stock.saleValue),
      coverageSaleDays: nonNegative(stock.coverageCurrentDays),
      coverageCostDays: nonNegative(stock.coverageCostCurrentDays),
    },
    transitScenario: {
      portfolioCostValue: nonNegative(stock.pendingPurchaseCost),
      portfolioSaleValue: nonNegative(stock.pendingPurchaseSale),
      projectedCostValue: nonNegative(stock.projectedCostValue),
      projectedSaleValue: nonNegative(stock.projectedSaleValue),
      projectedCoverageSaleDays: nonNegative(stock.coverageProjectedDays),
      projectedCoverageCostDays: nonNegative(stock.coverageCostProjectedDays),
    },
    portfolioAffectsOperationalBase: false,
  };
}
