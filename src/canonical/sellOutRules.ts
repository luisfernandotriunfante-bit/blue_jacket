import { isValidCompetenceId } from './competence';

type RecordValue = Record<string, unknown>;

export type SellOutStatus = 'INVOICED' | 'TO_INVOICE' | 'UNKNOWN';
export const sellOutText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
export const sellOutAmount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const normalized = (value: unknown) => sellOutText(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase() ?? '';
export const validSellOutDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const competenceFromDate = (value: unknown) => validSellOutDate(value) ? value.slice(0, 7) : null;

export function classifySellOutStatus(value: unknown): SellOutStatus {
  const status = normalized(value);
  if (status === 'FATURADO') return 'INVOICED';
  if (status === 'A FATURAR') return 'TO_INVOICE';
  return 'UNKNOWN';
}

export function canonicalCustomerKey(sale: RecordValue) {
  const canonical = sellOutText(sale.customer_canonical_id);
  if (canonical) return canonical;
  const cnpj = String(sale.cnpj ?? '').replace(/\D/g, '');
  return cnpj.length === 14 ? `CUSTOMER:${cnpj}` : null;
}

export function isReturnSale(sale: RecordValue) {
  return normalized(sale.sale_type).includes('DEVOLU') || sellOutAmount(sale.value) < 0;
}

export function isQualifyingPositiveSale(sale: RecordValue, requiredStatus?: Exclude<SellOutStatus, 'UNKNOWN'>) {
  const status = classifySellOutStatus(sale.order_status);
  return Boolean(canonicalCustomerKey(sale)) && sellOutAmount(sale.value) > 0 && !isReturnSale(sale) && status !== 'UNKNOWN' && (!requiredStatus || status === requiredStatus);
}

export function canonicalSellOutCompetence(records: RecordValue[], fallback: string | null = null) {
  const months = new Set(records.filter(row => row.fact_type === 'SALE').map(row => competenceFromDate(row.event_date)).filter((value): value is string => Boolean(value)));
  if (months.size === 1) return [...months][0];
  if (months.size > 1) return 'MIXED';
  return isValidCompetenceId(fallback) ? fallback : 'UNRESOLVED';
}
