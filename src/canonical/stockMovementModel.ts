import type { CanonicalList } from './types';

type Row = Record<string, unknown>;
export type StockSaleDocument = {
  key: string;
  kind: 'FATURADO' | 'A_FATURAR';
  isReturn: boolean;
  invoice: string | null;
  order: string | null;
  customer: string | null;
  cnpj: string | null;
  movementDate: string | null;
  invoiceDate: string | null;
  status: string | null;
  block: string | null;
  seller: string | null;
  value: number;
  items: Array<{ code: string | null; ean: string | null; label: string; cases: number; units: number; value: number }>;
};

const text = (value: unknown) => String(value ?? '').trim() || null;
const amount = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalized = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const codeKey = (value: unknown) => digits(value).replace(/^0+(?=\d)/, '');
const saleKind = (row: Row): StockSaleDocument['kind'] => normalized(row.order_status).includes('A FATURAR') ? 'A_FATURAR' : 'FATURADO';

export function buildStockSaleDocuments(m3: CanonicalList): StockSaleDocument[] {
  const grouped = new Map<string, StockSaleDocument>();
  for (const row of (m3.records as Row[]).filter(row => row.fact_type === 'SALE' && row.source === '8022')) {
    const kind = saleKind(row);
    const invoice = text(row.invoice_number);
    const rawOrder = text(row.order_winthor) ?? '';
    const order = /^\d{4,}$/.test(rawOrder) ? rawOrder : null;
    const key = `${kind}:${kind === 'FATURADO' ? invoice ?? order ?? row.fact_id : order ?? invoice ?? row.fact_id}`;
    const document = grouped.get(key) ?? {
      key,
      kind,
      isReturn: normalized(row.sale_type).includes('DEVOLU') || amount(row.value) < 0,
      invoice,
      order,
      customer: text(row.customer_name),
      cnpj: text(row.cnpj),
      movementDate: text(row.event_date)?.slice(0, 10) ?? null,
      invoiceDate: text(row.invoice_issue_date)?.slice(0, 10) ?? null,
      status: text(row.order_status),
      block: text(row.block_status),
      seller: text(row.seller_name),
      value: 0,
      items: [],
    } satisfies StockSaleDocument;
    document.isReturn ||= normalized(row.sale_type).includes('DEVOLU') || amount(row.value) < 0;
    document.value += amount(row.value);
    document.items.push({
      code: text(row.winthor_product_code),
      ean: text(row.ean_product),
      label: text(row.product_description) ?? text(row.winthor_product_code) ?? 'Item sem descrição',
      cases: amount(row.cases),
      units: amount(row.units),
      value: amount(row.value),
    });
    grouped.set(key, document);
  }
  return [...grouped.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export function stockSaleMatches(document: StockSaleDocument, query: string) {
  const needle = normalized(query).trim();
  if (!needle) return true;
  const all = [document.invoice, document.order, document.customer, document.cnpj, ...document.items.flatMap(item => [item.code, item.ean, item.label])].join(' ');
  return /^\d+$/.test(needle)
    ? all.split(/\D+/).some(value => codeKey(value) === codeKey(needle) || digits(value) === needle)
    : normalized(all).includes(needle);
}

export function stockSaleSummary(documents: StockSaleDocument[]) {
  return { documents: documents.length, value: documents.reduce((sum, document) => sum + Math.abs(document.value), 0) };
}
