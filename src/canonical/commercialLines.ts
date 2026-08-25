import type { SellOutLineRow } from './operationalViewModels';
import type { CanonicalList } from './types';

export const SELL_OUT_COMMERCIAL_LINES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const;
export type SellOutCommercialLine = (typeof SELL_OUT_COMMERCIAL_LINES)[number];

type RecordValue = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Regra histórica oficial do Sell Out anterior à migração canônica.
 * Mantida aqui na camada de preparação para que a página apenas consuma
 * as cinco divisões prontas e não recalcule/classifique produtos no React.
 */
export function classifySellOutCommercialLine(description: unknown, category: unknown = '', subcategory: unknown = ''): SellOutCommercialLine | null {
  const sub = normalized(subcategory); const cat = normalized(category); const d = normalized(description);
  if (sub.includes('TOOTHPASTE')) return 'Creme Dental';
  if (sub.includes('MANUAL TB') || sub.includes('TOOTHBRUSH') || sub.includes('MOUTHWASH') || sub.includes('INTERDENTAL') || sub.includes('FLOSS')) return 'Esc + Enx + Fio';
  if (sub.includes('BAR SOAP') || sub.includes('LIQUID SOAP') || sub.includes('HAND SOAP') || sub.includes('BODY WASH')) return 'Sabonetes';
  if (sub.includes('SHAMPOO') || sub.includes('CONDITIONER') || sub.includes('HAIR')) return 'Hair';
  if (sub.includes('CLEAN') || sub.includes('LAUNDRY') || sub.includes('FABRIC')) return 'Limpeza';
  if (/^CD\b/.test(d) || d.includes('CREME DENTAL') || d.includes('DENTIFRICIO')) return 'Creme Dental';
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d) || d.includes('ESCOVA DENTAL') || d.includes('ENXAGUANTE') || d.includes('FIO DENTAL')) return 'Esc + Enx + Fio';
  if (/^SAB\b/.test(d) || d.includes('SABONETE')) return 'Sabonetes';
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d) || d.includes('SHAMPOO') || d.includes('CONDICIONADOR')) return 'Hair';
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d) || d.includes('LIMPADOR') || d.includes('DESINFETANTE')) return 'Limpeza';
  if (cat.includes('HOME CARE')) return 'Limpeza';
  return null;
}

function firstText(record: RecordValue | undefined, fields: string[]) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return null;
}

function itemIndexes(m1: CanonicalList) {
  const byId = new Map<string, RecordValue>();
  const byWinthor = new Map<string, RecordValue>();
  const bySku = new Map<string, RecordValue>();
  for (const item of m1.records as RecordValue[]) {
    const id = firstText(item, ['item_canonical_id']);
    const winthor = firstText(item, ['winthor_code']);
    const sku = firstText(item, ['industry_sku', 'manufacturer_code', 'manufacturer_code_286']);
    if (id) byId.set(id, item);
    if (winthor) byWinthor.set(winthor, item);
    if (sku) bySku.set(sku, item);
  }
  return { byId, byWinthor, bySku };
}

function itemForSale(sale: RecordValue, indexes: ReturnType<typeof itemIndexes>) {
  const id = firstText(sale, ['item_canonical_id']);
  const winthor = firstText(sale, ['winthor_product_code']);
  const sku = firstText(sale, ['industry_sku', 'manufacturer_code']);
  return (id ? indexes.byId.get(id) : undefined)
    ?? (winthor ? indexes.byWinthor.get(winthor) : undefined)
    ?? (sku ? indexes.bySku.get(sku) : undefined);
}

function resolvedLine(sale: RecordValue, item: RecordValue | undefined) {
  const explicit = firstText(item, ['commercial_line', 'line']);
  if (explicit && (SELL_OUT_COMMERCIAL_LINES as readonly string[]).includes(explicit)) return explicit as SellOutCommercialLine;
  const description = firstText(item, ['description_internal', 'description_286', 'description_105', 'industry_description', 'description', 'product_description'])
    ?? firstText(sale, ['product_description']);
  const category = firstText(item, ['category_master', 'category']);
  const subcategory = firstText(item, ['subcategory', 'sub_category', 'subcategory_master', 'sub_category_master', 'segment']);
  return classifySellOutCommercialLine(description, category, subcategory);
}

export function buildSellOutCommercialLineRows({ m1, m3, sellOutTotal }: { m1: CanonicalList; m3: CanonicalList; sellOutTotal: number }) {
  const indexes = itemIndexes(m1);
  const buckets = new Map<SellOutCommercialLine, { invoiced: number; toInvoice: number; realized: number }>(
    SELL_OUT_COMMERCIAL_LINES.map(line => [line, { invoiced: 0, toInvoice: 0, realized: 0 }]),
  );
  let unclassifiedValue = 0;

  for (const sale of m3.records as RecordValue[]) {
    if (sale.fact_type !== 'SALE') continue;
    const value = amount(sale.value);
    const line = resolvedLine(sale, itemForSale(sale, indexes));
    if (!line) { unclassifiedValue += value; continue; }
    const bucket = buckets.get(line)!;
    bucket.realized += value;
    if (normalized(sale.order_status) === 'A FATURAR') bucket.toInvoice += value;
    else bucket.invoiced += value;
  }

  const rows: SellOutLineRow[] = SELL_OUT_COMMERCIAL_LINES.map(line => {
    const bucket = buckets.get(line)!;
    const realized = round(bucket.realized);
    return {
      line,
      invoiced: round(bucket.invoiced),
      toInvoice: round(bucket.toInvoice),
      realized,
      share: sellOutTotal > 0 ? realized / sellOutTotal : 0,
      resolutionStatus: 'CLASSIFIED',
    };
  });

  return { rows, unclassifiedValue: round(unclassifiedValue) };
}
