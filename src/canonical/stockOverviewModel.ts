import { SELL_OUT_COMMERCIAL_LINES, classifySellOutCommercialLine, type SellOutCommercialLine } from './commercialLines';
import { parseRangeAssortmentPresence, type AssortmentPresence } from './assortment';
import type { CanonicalList } from './types';

type RecordValue = Record<string, unknown>;

export type StockOverviewAlertTone = 'critical' | 'attention' | 'info';
export type StockOverviewAlert = {
  code: string;
  tone: StockOverviewAlertTone;
  title: string;
  detail: string;
  count: number;
  examples: string[];
};

export type StockTreemapTile = {
  key: string;
  label: string;
  saleValue: number;
  availableSaleValue: number;
  projectedSaleValue: number;
  physicalUnits: number;
  availableUnits: number;
  items: number;
  aggregate: boolean;
  classified: boolean;
};

export type StockLineTreemap = {
  line: SellOutCommercialLine;
  totalValue: number;
  availableTotalValue: number;
  projectedTotalValue: number;
  items: number;
  subbrands: number;
  itemsWithoutSubbrand: number;
  tiles: StockTreemapTile[];
};

export type StockTreemapMode = 'PHYSICAL' | 'AVAILABLE' | 'PROJECTED';

export function stockTreemapTileValue(tile: StockTreemapTile, mode: StockTreemapMode) {
  return mode === 'AVAILABLE' ? tile.availableSaleValue : mode === 'PROJECTED' ? tile.projectedSaleValue : tile.saleValue;
}

export function stockTreemapLineValue(line: StockLineTreemap, mode: StockTreemapMode) {
  return mode === 'AVAILABLE' ? line.availableTotalValue : mode === 'PROJECTED' ? line.projectedTotalValue : line.totalValue;
}

export type StockInboundForecast = {
  date: string | null;
  totalValue: number;
  invoices: Array<{ invoice: string; value: number; items: string[] }>;
};

export type StockForecastBucket = {
  key: 'OVERDUE' | '0-7' | '8-15' | '16+' | 'NONE';
  label: string;
  invoices: Array<{ invoice: string; value: number; items: string[] }>;
  totalValue: number;
};

export type StockInboundNote = {
  invoice: string;
  orderDate: string | null;
  billingDate: string | null;
  totalValue: number;
  outstandingValue: number;
  orderQty: number;
  billQty: number;
  outstandingQty: number;
  received: boolean;
  items: Array<{ label: string; quantity: number; units: number | null }>;
};

/** Uma chegada é o recebimento efetivo registrado no 218 ou no 12.322.
 * O 12.322 é histórico no grão de NF; por isso não se fabricam itens para ele. */
export type StockReceiptItem = {
  label: string;
  winthorCode: string | null;
  ean: string | null;
  quantity: number;
  unitPrice: number | null;
  totalValue: number | null;
};

export type StockReceiptNote = {
  invoice: string;
  receiptDate: string | null;
  invoiceIssueDate: string | null;
  totalValue: number | null;
  sources: Array<'218' | '12.322'>;
  items: StockReceiptItem[];
};

export type StockProductItem = {
  id: string;
  description: string;
  winthor: string;
  distributor: string;
  ean: string;
  physical: number;
  reserved: number;
  available: number;
  availableSource: 'M1_EXPLICIT' | 'DERIVED';
  inboundQty: number;
  inboundUnits: number;
  projected: number;
  invoices: string[];
  arrival: string | null;
  lastReceipt: string | null;
  sold: number;
  salesValue: number;
  averageDailySales: number;
  averageMonthlySales: number;
  lastSale: string | null;
  coverage: number | null;
  analysisDays: number;
  priceWithoutSt: number | null;
  stValue: number | null;
  priceWithSt: number | null;
  industryTablePrice: number | null;
  cost: number | null;
  isLaunch: boolean;
  unregistered: boolean;
  line: string;
  brand: string;
  subbrand: string;
  category: string;
  contents: string;
  unitsPerCase: number | null;
  assortment: AssortmentPresence[];
  assortmentMaterialized: boolean;
};

export type StockOverviewModel = {
  analysis: {
    startDate: string | null;
    endDate: string | null;
    days: number;
    lowCoverageThresholdDays: number;
    mappedHistoricalRows: number;
    unmappedHistoricalRows: number;
    mappedCurrentRows: number;
    unmappedCurrentRows: number;
    deduplicatedHistoricalRows: number;
    ambiguousIdentifierKeys: number;
  };
  totals: {
    items: number;
    itemsWithStock: number;
    physicalUnits: number;
    reservedUnits: number;
    availableUnits: number;
    inboundQty: number;
    inboundValue: number;
    grossInboundQty: number;
    grossInboundValue: number;
    receivedInboundQty: number;
    receivedInboundValue: number;
    matchedReceiptInvoices218: number;
    matchedReceiptInvoices12322: number;
    receiptInvoices218Read: number;
    receiptInvoices12322Read: number;
    additionalReceiptInvoices218: number;
    receiptOverlapInvoices: number;
    unmatchedBilledInvoices: number;
    deductedBy12322Value: number;
    deductedBy218Value: number;
    mappedInboundQty: number;
    totalInboundQty: number;
    mappedInboundRows: number;
    totalInboundRows: number;
    projectedUnits: number;
    purchaseValue: number;
    saleValue: number;
    availablePurchaseValue: number;
    availableSaleValue: number;
    projectedPurchaseValue: number;
    projectedSaleValue: number;
    coverageDays: number | null;
    mappedDemandItems: number;
    pricedItemsWithStock: number;
    launchItems: number;
  };
  progress: {
    coverageVsReference: number | null;
    inboundMapping: number | null;
    pricedCoverage: number | null;
    purchaseVsSale: number | null;
    stockSkuShare: number | null;
    projectedInboundShare: number | null;
  };
  alerts: StockOverviewAlert[];
  dataQuality: {
    noSalePriceItems: number;
    unclassifiedItems: number;
    inboundUnmappedRows: number;
    historicalUnmappedRows: number;
    currentUnmappedRows: number;
    ambiguousProductIdentifiers: number;
  };
  treemap: StockLineTreemap[];
  inboundForecasts: StockInboundForecast[];
  inboundNotes: StockInboundNote[];
  receivedNotes: StockReceiptNote[];
  products: StockProductItem[];
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : value === null || value === undefined ? null : String(value).trim() || null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
const isIsoDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const dateValue = (value: string) => Date.parse(`${value}T12:00:00Z`);
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const LOW_COVERAGE_DAYS = 30;
const MAX_ANALYSIS_DAYS = 90;

function optionalAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}


function firstText(record: RecordValue | undefined, fields: string[]) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return null;
}

function comparableCode(value: unknown) {
  const raw = text(value)?.replace(/\.0$/, '').replace(/\s+/g, '') ?? '';
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw.replace(/^0+(?=\d)/, '');
  return normalized(raw).replace(/[^A-Z0-9]/g, '');
}

function invoiceKey(value: unknown) {
  const raw = text(value)?.replace(/\.0$/, '').replace(/\s+/g, '') ?? '';
  if (!raw) return null;
  // NF é o primeiro bloco numérico do campo. 218 pode trazer "*000123-1":
  // asteriscos, série, identificadores e qualquer sufixo após o traço não
  // fazem parte da identidade da nota para a baixa integral da Carteira.
  const firstNumericToken = raw.match(/\d+/)?.[0];
  if (firstNumericToken) return firstNumericToken.replace(/^0+(?=\d)/, '');
  const comparable = normalized(raw).replace(/[^A-Z0-9]/g, '');
  return comparable || null;
}

function itemLine(item: RecordValue) {
  const explicit = firstText(item, ['commercial_line', 'line']);
  if (explicit && (SELL_OUT_COMMERCIAL_LINES as readonly string[]).includes(explicit)) return explicit as SellOutCommercialLine;
  return classifySellOutCommercialLine(
    firstText(item, ['description_internal', 'description_286', 'description_105', 'industry_description', 'description']),
    firstText(item, ['category_master', 'category']),
    firstText(item, ['subcategory', 'sub_category', 'subcategory_master', 'segment']),
  );
}

function addUniqueIndex(map: Map<string, RecordValue>, ambiguous: Set<string>, key: string | null, item: RecordValue) {
  if (!key || ambiguous.has(key)) return;
  const existing = map.get(key);
  if (existing && existing !== item) {
    map.delete(key);
    ambiguous.add(key);
    return;
  }
  map.set(key, item);
}

function buildItemIndexes(m1: CanonicalList) {
  const byWinthor = new Map<string, RecordValue>();
  const byWinthorComparable = new Map<string, RecordValue>();
  const byEan = new Map<string, RecordValue>();
  const bySku = new Map<string, RecordValue>();
  const bySkuComparable = new Map<string, RecordValue>();
  const ambiguousWinthor = new Set<string>();
  const ambiguousWinthorExact = new Set<string>();
  const ambiguousEan = new Set<string>();
  const ambiguousSku = new Set<string>();
  const ambiguousSkuComparable = new Set<string>();

  for (const item of m1.records as RecordValue[]) {
    const winthor = firstText(item, ['winthor_code']);
    const ean = firstText(item, ['internal_ean', 'industry_ean']);
    const skus = [firstText(item, ['manufacturer_code']), firstText(item, ['industry_sku']), firstText(item, ['manufacturer_code_286'])].filter(Boolean) as string[];
    addUniqueIndex(byWinthor, ambiguousWinthorExact, winthor, item);
    addUniqueIndex(byEan, ambiguousEan, ean, item);
    addUniqueIndex(byWinthorComparable, ambiguousWinthor, comparableCode(winthor), item);
    for (const sku of skus) {
      addUniqueIndex(bySku, ambiguousSku, sku, item);
      addUniqueIndex(bySkuComparable, ambiguousSkuComparable, comparableCode(sku), item);
    }
  }
  const ambiguousExamples = [...new Set([...ambiguousWinthorExact, ...ambiguousWinthor, ...ambiguousEan, ...ambiguousSku, ...ambiguousSkuComparable])].slice(0, 5);
  const ambiguousIdentifierKeys = ambiguousWinthorExact.size + ambiguousWinthor.size + ambiguousEan.size + ambiguousSku.size + ambiguousSkuComparable.size;
  return { byWinthor, byWinthorComparable, byEan, bySku, bySkuComparable, ambiguousSku, ambiguousSkuComparable, ambiguousIdentifierKeys, ambiguousExamples };
}

function itemByWinthor(code: unknown, indexes: ReturnType<typeof buildItemIndexes>) {
  const raw = firstText({ code }, ['code']);
  return (raw ? indexes.byWinthor.get(raw) : undefined)
    ?? (raw ? indexes.byWinthorComparable.get(comparableCode(raw) ?? '') : undefined);
}

function augmentSkuAliasesFromSales(sales: RecordValue[], indexes: ReturnType<typeof buildItemIndexes>) {
  for (const sale of sales) {
    const item = itemByWinthor(sale.winthor_product_code, indexes);
    const sku = firstText(sale, ['industry_sku']);
    if (!item || !sku) continue;
    addUniqueIndex(indexes.bySku, indexes.ambiguousSku, sku, item);
    addUniqueIndex(indexes.bySkuComparable, indexes.ambiguousSkuComparable, comparableCode(sku), item);
  }
}

function currentItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const winthor = firstText(fact, ['winthor_product_code']);
  const sku = firstText(fact, ['industry_sku', 'industry_material']);
  const ean = firstText(fact, ['ean_product', 'internal_ean', 'industry_ean']);
  return (winthor ? indexes.byWinthor.get(winthor) : undefined)
    ?? (winthor ? indexes.byWinthorComparable.get(comparableCode(winthor) ?? '') : undefined)
    ?? (sku ? indexes.bySku.get(sku) : undefined)
    ?? (sku ? indexes.bySkuComparable.get(comparableCode(sku) ?? '') : undefined)
    ?? (ean ? indexes.byEan.get(ean) : undefined);
}

/** O 218 traz o campo físico "Código + Produto". O primeiro número é o
 * código Winthor; preservamos o texto original quando não existe vínculo. */
function receiptItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const direct = currentItemForFact(fact, indexes);
  if (direct) return direct;
  const raw = firstText(fact, ['winthor_product_code']);
  const code = raw?.match(/\d+/)?.[0] ?? null;
  return code ? itemByWinthor(code, indexes) : undefined;
}

function receiptItemLabel(fact: RecordValue, item: RecordValue | undefined) {
  if (item) return itemLabel(item);
  return firstText(fact, ['winthor_product_code']) ?? 'Item sem vínculo interno';
}

function historicalItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const ean = firstText(fact, ['historical_gtin', 'ean_commercial', 'ean_tax']);
  const legacyCode = firstText(fact, ['legacy_product_code']);
  return (ean ? indexes.byEan.get(ean) : undefined)
    ?? (legacyCode ? indexes.byWinthor.get(legacyCode) : undefined)
    ?? (legacyCode ? indexes.byWinthorComparable.get(comparableCode(legacyCode) ?? '') : undefined);
}

function itemKey(item: RecordValue) {
  return firstText(item, ['item_canonical_id', 'winthor_code', 'internal_ean', 'manufacturer_code', 'source_row']) ?? 'ITEM:UNRESOLVED';
}

function itemLabel(item: RecordValue) {
  const code = firstText(item, ['winthor_code', 'manufacturer_code', 'internal_ean']) ?? 'sem código';
  const description = firstText(item, ['description_internal', 'description_286', 'description_105']) ?? 'sem descrição';
  return `${code} · ${description}`;
}

function itemSubbrand(item: RecordValue) {
  return firstText(item, ['subbrand', 'subbrand_8013']) ?? 'Sem sub-brand informada';
}

function unitsPerCaseIndex(items: RecordValue[], sales: RecordValue[], indexes: ReturnType<typeof buildItemIndexes>) {
  const factors = new Map<string, number>();
  const conflicted = new Set<string>();
  for (const item of items) {
    const factor = amount(item.units_per_case_industry);
    if (factor > 0) factors.set(itemKey(item), factor);
  }
  for (const sale of sales) {
    const item = currentItemForFact(sale, indexes);
    if (!item) continue;
    const units = Math.abs(amount(sale.units));
    const cases = Math.abs(amount(sale.cases));
    if (!(units > 0 && cases > 0)) continue;
    const factor = units / cases;
    if (!Number.isFinite(factor) || factor <= 0) continue;
    const key = itemKey(item);
    if (factors.has(key)) continue;
    const previous = factors.get(`OBSERVED:${key}`);
    if (previous !== undefined && Math.abs(previous - factor) > 0.001) conflicted.add(key);
    else factors.set(`OBSERVED:${key}`, factor);
  }
  for (const [key, value] of [...factors.entries()]) {
    if (!key.startsWith('OBSERVED:')) continue;
    const item = key.slice('OBSERVED:'.length);
    factors.delete(key);
    if (!conflicted.has(item) && !factors.has(item)) factors.set(item, value);
  }
  return factors;
}

function alert(code: string, tone: StockOverviewAlertTone, title: string, detail: string, items: RecordValue[]) {
  return {
    code,
    tone,
    title,
    detail,
    count: items.length,
    examples: items.slice(0, 5).map(itemLabel),
  } satisfies StockOverviewAlert;
}

function qualityAlert(code: string, tone: StockOverviewAlertTone, title: string, detail: string, count: number, examples: string[]) {
  return { code, tone, title, detail, count, examples: examples.slice(0, 5) } satisfies StockOverviewAlert;
}

export function buildStockForecastBuckets(entries: StockInboundForecast[], todayIso: string): StockForecastBucket[] {
  const today = isIsoDate(todayIso) ? dateValue(todayIso) : Date.now();
  const definitions: Array<{ key: StockForecastBucket['key']; label: string; match: (days: number | null) => boolean }> = [
    { key: 'OVERDUE', label: 'Atrasadas', match: days => days !== null && days < 0 },
    { key: '0-7', label: 'Até 7 dias', match: days => days !== null && days >= 0 && days <= 7 },
    { key: '8-15', label: '8 a 15 dias', match: days => days !== null && days >= 8 && days <= 15 },
    { key: '16+', label: '16+ dias', match: days => days !== null && days >= 16 },
    { key: 'NONE', label: 'Sem previsão', match: days => days === null },
  ];
  return definitions.map(definition => {
    const matching = entries.filter(entry => definition.match(entry.date && isIsoDate(entry.date) ? Math.ceil((dateValue(entry.date) - today) / 86400000) : null));
    const invoices = matching.flatMap(entry => entry.invoices);
    return { key: definition.key, label: definition.label, invoices, totalValue: round(invoices.reduce((sum, invoice) => sum + invoice.value, 0)) };
  });
}

export function buildStockOverviewModel({ m1, m3, m4, forecasts = {} }: { m1: CanonicalList; m3: CanonicalList; m4: CanonicalList; forecasts?: Record<string, string> }): StockOverviewModel {
  const items = m1.records as RecordValue[];
  const m3Records = m3.records as RecordValue[];
  const m4Records = m4.records as RecordValue[];
  const sales = m3Records.filter(fact => fact.fact_type === 'SALE');
  const inbound = m3Records.filter(fact => fact.fact_type === 'INBOUND_ORDER');
  const receipts218 = m3Records.filter(fact => fact.fact_type === 'RECEIPT');
  const historical = m4Records.filter(fact => fact.row_type === 'TRANSACTION_379');
  const receipts12322 = m4Records.filter(fact => fact.row_type === 'RECEIPT_12322');

  const indexes = buildItemIndexes(m1);
  augmentSkuAliasesFromSales(sales, indexes);
  const unitsPerCase = unitsPerCaseIndex(items, sales, indexes);

  const invoiceHeaderReceipts218 = receipts218.filter(fact => normalized(fact.receipt_scope) === 'INVOICE');
  const receiptRegistry218 = invoiceHeaderReceipts218.length ? invoiceHeaderReceipts218 : receipts218;
  const receiptInvoices218 = new Set(receiptRegistry218.map(fact => invoiceKey(fact.invoice_number)).filter(Boolean) as string[]);
  const receiptInvoices12322 = new Set(receipts12322.map(fact => invoiceKey(fact.invoice_number)).filter(Boolean) as string[]);

  const demandSales = sales.filter(fact => normalized(fact.order_status) !== 'A FATURAR');
  const validDates = [
    ...demandSales.map(fact => text(fact.event_date)).filter(isIsoDate) as string[],
    ...historical.map(fact => text(fact.movement_date)).filter(isIsoDate) as string[],
  ].sort();
  const endDate = validDates.at(-1) ?? null;
  const earliestDate = validDates[0] ?? null;
  const maxStartDate = endDate ? isoDate(dateValue(endDate) - (MAX_ANALYSIS_DAYS - 1) * 86400000) : null;
  const startDate = earliestDate && maxStartDate ? (earliestDate > maxStartDate ? earliestDate : maxStartDate) : null;
  const analysisDays = startDate && endDate ? Math.floor((dateValue(endDate) - dateValue(startDate)) / 86400000) + 1 : 0;

  const demandByItem = new Map<string, number>();
  const salesValueByItem = new Map<string, number>();
  const lastSaleByItem = new Map<string, string>();
  let mappedHistoricalRows = 0;
  let unmappedHistoricalRows = 0;
  let mappedCurrentRows = 0;
  let unmappedCurrentRows = 0;
  let deduplicatedHistoricalRows = 0;
  const historicalUnmappedFacts: RecordValue[] = [];
  const currentUnmappedFacts: RecordValue[] = [];
  const currentMovementKeys = new Set<string>();
  const addDemand = (item: RecordValue | undefined, quantity: number, value: number, date: string) => {
    if (!item || !Number.isFinite(quantity)) return false;
    const key = itemKey(item);
    demandByItem.set(key, (demandByItem.get(key) ?? 0) + quantity);
    salesValueByItem.set(key, (salesValueByItem.get(key) ?? 0) + value);
    if (quantity > 0 && (!lastSaleByItem.get(key) || date > lastSaleByItem.get(key)!)) lastSaleByItem.set(key, date);
    return true;
  };

  for (const fact of demandSales) {
    const date = text(fact.event_date);
    if (!startDate || !endDate || !isIsoDate(date) || date! < startDate || date! > endDate) continue;
    const mapped = currentItemForFact(fact, indexes);
    if (!mapped) { unmappedCurrentRows += 1; currentUnmappedFacts.push(fact); continue; }
    mappedCurrentRows += 1;
    const isReturn = normalized(fact.sale_type).includes('DEVOLU') || amount(fact.value) < 0;
    const signedUnits = isReturn ? -Math.abs(amount(fact.units)) : Math.abs(amount(fact.units));
    const signedValue = isReturn ? -Math.abs(amount(fact.value)) : amount(fact.value);
    const movementKey = `${itemKey(mapped)}|${date}|${invoiceKey(fact.invoice_number) ?? firstText(fact, ['fact_id']) ?? ''}|${round(signedUnits)}`;
    currentMovementKeys.add(movementKey);
    addDemand(mapped, signedUnits, signedValue, date!);
  }

  for (const fact of historical) {
    const date = text(fact.movement_date);
    if (!startDate || !endDate || !isIsoDate(date) || date! < startDate || date! > endDate) continue;
    const mapped = historicalItemForFact(fact, indexes);
    if (!mapped) { unmappedHistoricalRows += 1; historicalUnmappedFacts.push(fact); continue; }
    const signedUnits = amount(fact.signed_quantity);
    const movementKey = `${itemKey(mapped)}|${date}|${invoiceKey(fact.invoice_number) ?? firstText(fact, ['historical_fact_id']) ?? ''}|${round(signedUnits)}`;
    if (currentMovementKeys.has(movementKey)) { deduplicatedHistoricalRows += 1; continue; }
    mappedHistoricalRows += 1;
    addDemand(mapped, signedUnits, amount(fact.signed_value), date!);
  }

  const reservedByItem = new Map<string, number>();
  for (const fact of sales) {
    if (normalized(fact.order_status) !== 'A FATURAR') continue;
    const item = currentItemForFact(fact, indexes);
    if (!item) continue;
    const key = itemKey(item);
    reservedByItem.set(key, (reservedByItem.get(key) ?? 0) + Math.max(0, amount(fact.units)));
  }

  const lastReceiptByItem = new Map<string, string>();
  for (const fact of receipts218) {
    if (!(amount(fact.received_units) > 0)) continue;
    const item = receiptItemForFact(fact, indexes);
    const receiptDate = firstText(fact, ['receipt_date']);
    if (!item || !isIsoDate(receiptDate)) continue;
    const key = itemKey(item);
    if (!lastReceiptByItem.get(key) || receiptDate! > lastReceiptByItem.get(key)!) lastReceiptByItem.set(key, receiptDate!);
  }

  const inboundUnitsByItem = new Map<string, number>();
  const inboundCasesByItem = new Map<string, number>();
  const inboundInvoicesByItem = new Map<string, Set<string>>();
  const inboundArrivalByItem = new Map<string, string>();
  const pendingCatalogBySku = new Map<string, { cases: number; invoices: Set<string>; arrival: string | null }>();
  let grossInboundQty = 0;
  let totalInboundQty = 0;
  let mappedInboundQty = 0;
  let grossInboundValue = 0;
  let inboundValue = 0;
  let receivedInboundQty = 0;
  let receivedInboundValue = 0;
  let mappedInboundRows = 0;
  let totalInboundRows = 0;
  const inboundUnmappedFacts: RecordValue[] = [];
  const matched218 = new Set<string>();
  const matched12322 = new Set<string>();
  const additional218 = new Set<string>();
  const unmatchedBilled = new Set<string>();
  const overlapReceiptInvoices = new Set<string>();
  let deductedBy12322Value = 0;
  let deductedBy218Value = 0;
  const forecastByDate = new Map<string | null, Map<string, { value: number; items: Set<string> }>>();
  const notesByInvoice = new Map<string, { orderDate: string | null; billingDate: string | null; totalValue: number; outstandingValue: number; orderQty: number; billQty: number; outstandingQty: number; received: boolean; items: Map<string, { quantity: number; units: number | null }> }>();

  for (const [inboundIndex, fact] of inbound.entries()) {
    const orderQty = Math.max(0, amount(fact.order_qty));
    const billQty = Math.max(0, amount(fact.bill_qty));
    const grossQty = orderQty + billQty;
    const netValue = Math.max(0, amount(fact.inbound_net_value));
    const invoice = invoiceKey(fact.invoice_number);
    const item = currentItemForFact(fact, indexes);
    const itemId = item ? itemKey(item) : null;

    // Regra financeira da Carteira:
    // 1) procura a NF no 12.322; se encontrar, zera integralmente o valor da NF;
    // 2) somente se não estiver no 12.322, procura no 218 e zera integralmente o valor;
    // 3) se estiver nos dois, a baixa pertence ao 12.322 e não é contada novamente no 218.
    const matchedIn12322 = Boolean(invoice && receiptInvoices12322.has(invoice));
    const matchedIn218 = Boolean(invoice && receiptInvoices218.has(invoice));
    const invoiceAlreadyReceived = matchedIn12322 || matchedIn218;
    if (invoice) {
      const note = notesByInvoice.get(invoice) ?? { orderDate: text(fact.order_date), billingDate: firstText(fact, ['billing_date', 'invoice_issue_date']), totalValue: 0, outstandingValue: 0, orderQty: 0, billQty: 0, outstandingQty: 0, received: false, items: new Map() };
      note.orderDate ||= text(fact.order_date);
      note.billingDate ||= firstText(fact, ['billing_date', 'invoice_issue_date']);
      note.totalValue += netValue;
      note.orderQty += orderQty;
      note.billQty += billQty;
      note.received ||= invoiceAlreadyReceived;
      if (item) {
        const label = itemLabel(item);
        const factor = unitsPerCase.get(itemKey(item)) ?? 0;
        const current = note.items.get(label) ?? { quantity: 0, units: factor > 0 ? 0 : null };
        current.quantity += grossQty;
        if (factor > 0) current.units = (current.units ?? 0) + grossQty * factor;
        note.items.set(label, current);
      }
      notesByInvoice.set(invoice, note);
    }
    if (!invoiceAlreadyReceived && netValue > 0) {
      const forecastDate = invoice && isIsoDate(forecasts[invoice] ?? null) ? forecasts[invoice]! : null;
      const forecastDocument = invoice ?? `SEM NF ${firstText(fact, ['fact_id']) ?? inboundIndex + 1}`;
      {
        const byInvoice = forecastByDate.get(forecastDate) ?? new Map<string, { value: number; items: Set<string> }>();
        const entry = byInvoice.get(forecastDocument) ?? { value: 0, items: new Set<string>() };
        entry.value += netValue;
        if (item) entry.items.add(itemLabel(item));
        byInvoice.set(forecastDocument, entry);
        forecastByDate.set(forecastDate, byInvoice);
      }
    }

    if (billQty > 0 && invoice) {
      if (matchedIn12322 && matchedIn218) overlapReceiptInvoices.add(invoice);
      if (!invoiceAlreadyReceived) unmatchedBilled.add(invoice);
    }

    let receivedBillQty = 0;
    if (billQty > 0 && invoice && invoiceAlreadyReceived) {
      receivedBillQty = billQty;
      if (matchedIn12322) matched12322.add(invoice);
      else if (matchedIn218) {
        matched218.add(invoice);
        additional218.add(invoice);
      }
    }

    const outstandingBillQty = Math.max(0, billQty - receivedBillQty);
    const outstandingQty = orderQty + outstandingBillQty;
    const outstandingValue = invoiceAlreadyReceived ? 0 : netValue;
    if (invoice) {
      const note = notesByInvoice.get(invoice)!;
      note.outstandingValue += outstandingValue;
      note.outstandingQty += outstandingQty;
    }

    if (invoiceAlreadyReceived && netValue > 0) {
      if (matchedIn12322) deductedBy12322Value += netValue;
      else if (matchedIn218) deductedBy218Value += netValue;
    }

    grossInboundQty += grossQty;
    grossInboundValue += netValue;
    totalInboundQty += outstandingQty;
    inboundValue += outstandingValue;
    receivedInboundQty += receivedBillQty;
    receivedInboundValue += Math.max(0, netValue - outstandingValue);

    if (outstandingQty <= 0 && outstandingValue <= 0) continue;
    totalInboundRows += 1;
    if (!item || !itemId) {
      inboundUnmappedFacts.push(fact);
      const sku = firstText(fact, ['industry_material', 'industry_sku']);
      if (sku) {
        const pending = pendingCatalogBySku.get(sku) ?? { cases: 0, invoices: new Set<string>(), arrival: null };
        pending.cases += outstandingQty;
        if (invoice) pending.invoices.add(invoice);
        const forecast = invoice ? forecasts[invoice] ?? null : null;
        if (isIsoDate(forecast) && (!pending.arrival || forecast! < pending.arrival)) pending.arrival = forecast!;
        pendingCatalogBySku.set(sku, pending);
      }
      continue;
    }
    inboundCasesByItem.set(itemId, (inboundCasesByItem.get(itemId) ?? 0) + outstandingQty);
    if (invoice) {
      const invoices = inboundInvoicesByItem.get(itemId) ?? new Set<string>();
      invoices.add(invoice);
      inboundInvoicesByItem.set(itemId, invoices);
      const forecast = forecasts[invoice] ?? null;
      if (isIsoDate(forecast) && (!inboundArrivalByItem.get(itemId) || forecast! < inboundArrivalByItem.get(itemId)!)) inboundArrivalByItem.set(itemId, forecast!);
    }
    const factor = unitsPerCase.get(itemId) ?? 0;
    if (!(factor > 0)) { inboundUnmappedFacts.push(fact); continue; }
    const outstandingUnits = outstandingQty * factor;
    inboundUnitsByItem.set(itemId, (inboundUnitsByItem.get(itemId) ?? 0) + outstandingUnits);
    mappedInboundQty += outstandingQty;
    mappedInboundRows += 1;
  }

  // Chegadas efetivas são uma visão operacional separada da Carteira. A NF
  // aparece uma única vez mesmo quando 12.322 e 218 a registram: o 12.322
  // contribui com o valor histórico da NF e o 218, quando houver, traz seus
  // itens reais para consulta.
  type MutableReceiptNote = {
    receiptDate: string | null;
    invoiceIssueDate: string | null;
    totalValue: number | null;
    sources: Set<'218' | '12.322'>;
    items: Map<string, StockReceiptItem>;
  };
  const receivedNotesByInvoice = new Map<string, MutableReceiptNote>();
  const ensureReceiptNote = (invoice: string) => {
    const existing = receivedNotesByInvoice.get(invoice);
    if (existing) return existing;
    const created: MutableReceiptNote = { receiptDate: null, invoiceIssueDate: null, totalValue: null, sources: new Set(), items: new Map() };
    receivedNotesByInvoice.set(invoice, created);
    return created;
  };

  for (const fact of receipts12322) {
    const invoice = invoiceKey(fact.invoice_number);
    if (!invoice) continue;
    const note = ensureReceiptNote(invoice);
    note.sources.add('12.322');
    note.receiptDate ??= firstText(fact, ['accounting_date', 'movement_date']);
    note.invoiceIssueDate ??= firstText(fact, ['movement_date']);
    const value = amount(fact.invoice_value);
    if (value > 0) note.totalValue = value;
  }

  for (const fact of receipts218) {
    const invoice = invoiceKey(fact.invoice_number);
    if (!invoice) continue;
    const note = ensureReceiptNote(invoice);
    note.sources.add('218');
    note.receiptDate ??= firstText(fact, ['receipt_date']);
    note.invoiceIssueDate ??= firstText(fact, ['invoice_issue_date']);
    // Vl. Total é o valor oficial do cabeçalho da NF no 218. Não somamos
    // preço de item: ele pode estar vazio, representar custo unitário ou se
    // repetir por linha e não substitui o valor fiscal da nota.
    const invoiceValue = amount(fact.receipt_invoice_value);
    if (invoiceValue > 0 && note.totalValue === null) note.totalValue = invoiceValue;

    const rawItem = firstText(fact, ['winthor_product_code']);
    const quantity = Math.max(0, amount(fact.received_units));
    // Linhas de cabeçalho do 218 são usadas para a identidade da NF, mas não
    // são apresentadas como um produto recebido.
    if (!rawItem && quantity <= 0) continue;
    const item = receiptItemForFact(fact, indexes);
    const winthorCode = firstText(item, ['winthor_code']) ?? rawItem?.match(/\d+/)?.[0] ?? null;
    const ean = firstText(item, ['internal_ean', 'industry_ean']);
    const label = receiptItemLabel(fact, item);
    const unitPriceRaw = amount(fact.receipt_unit_price);
    const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : null;
    const totalValue = unitPrice === null ? null : round(quantity * unitPrice);
    const key = `${winthorCode ?? ''}|${ean ?? ''}|${label}`;
    const existing = note.items.get(key);
    if (existing) {
      existing.quantity = round(existing.quantity + quantity);
      existing.totalValue = existing.totalValue === null || totalValue === null ? null : round(existing.totalValue + totalValue);
    } else {
      note.items.set(key, { label, winthorCode, ean, quantity: round(quantity), unitPrice, totalValue });
    }
  }

  let physicalUnits = 0;
  let reservedUnits = 0;
  let availableUnits = 0;
  let inboundQty = 0;
  let projectedUnits = 0;
  let purchaseValue = 0;
  let saleValue = 0;
  let availablePurchaseValue = 0;
  let availableSaleValue = 0;
  let projectedSaleValue = 0;
  let itemsWithStock = 0;
  let pricedItemsWithStock = 0;
  let mappedDemandItems = 0;
  let launchItems = 0;
  const coverageValues: number[] = [];

  const ruptures: RecordValue[] = [];
  const lowCoverage: RecordValue[] = [];
  const launchCritical: RecordValue[] = [];
  const noTurnover: RecordValue[] = [];
  const noPrice: RecordValue[] = [];
  const oversold: RecordValue[] = [];
  const unclassified: RecordValue[] = [];
  const negativeAvailable: RecordValue[] = [];
  const lineSubbrandBuckets = new Map<SellOutCommercialLine, Map<string, StockTreemapTile>>(SELL_OUT_COMMERCIAL_LINES.map(line => [line, new Map()]));
  const products: StockProductItem[] = [];

  for (const item of items) {
    const key = itemKey(item);
    const physical = Math.max(0, optionalAmount(item.physical_stock_units) ?? 0);
    const explicitReserved = optionalAmount(item.stock_286_reserved);
    const reserved = Math.max(0, explicitReserved ?? reservedByItem.get(key) ?? 0);
    const explicitAvailable = optionalAmount(item.stock_286_available);
    const available = explicitAvailable ?? physical - reserved;
    const inboundItemUnits = Math.max(0, inboundUnitsByItem.get(key) ?? 0);
    const inboundItemCases = Math.max(0, inboundCasesByItem.get(key) ?? 0);
    const projected = available + inboundItemUnits;
    const cost = Math.max(0, amount(item.cost_unit_105));
    const price = Math.max(0, amount(item.pVenda1_region11));
    const itemSaleValue = physical * price;
    const itemAvailableSaleValue = Math.max(0, available) * price;
    const itemProjectedSaleValue = Math.max(0, projected) * price;
    const netDemand = Math.max(0, demandByItem.get(key) ?? 0);
    const dailyDemand = netDemand > 0 && analysisDays > 0 ? netDemand / analysisDays : 0;
    const coverage = dailyDemand > 0 ? Math.max(0, available) / dailyDemand : null;
    const isLaunch = item.is_launch === true || normalized(item.launch_status) === 'LANÇAMENTO' || normalized(item.launch_status) === 'LANCAMENTO';

    products.push({
      id: key,
      description: firstText(item, ['description_internal', 'description_industry']) ?? 'Produto sem descrição',
      winthor: firstText(item, ['winthor_code']) ?? '',
      distributor: firstText(item, ['manufacturer_code', 'industry_sku']) ?? '',
      ean: firstText(item, ['internal_ean', 'industry_ean']) ?? '',
      physical,
      reserved,
      available,
      availableSource: explicitAvailable === null ? 'DERIVED' : 'M1_EXPLICIT',
      inboundQty: round(inboundItemCases),
      inboundUnits: round(inboundItemUnits),
      projected: round(projected),
      invoices: [...(inboundInvoicesByItem.get(key) ?? [])].sort(),
      arrival: inboundArrivalByItem.get(key) ?? null,
      lastReceipt: lastReceiptByItem.get(key) ?? null,
      sold: round(netDemand),
      salesValue: round(salesValueByItem.get(key) ?? 0),
      averageDailySales: round(dailyDemand),
      averageMonthlySales: round(dailyDemand * 30),
      lastSale: lastSaleByItem.get(key) ?? null,
      coverage: coverage === null ? null : round(coverage),
      analysisDays,
      priceWithoutSt: optionalAmount(item.pVenda),
      stValue: optionalAmount(item.vlSt),
      priceWithSt: optionalAmount(item.pVenda1_region11),
      industryTablePrice: optionalAmount(item.industry_base_price),
      cost: optionalAmount(item.cost_unit_105),
      isLaunch,
      unregistered: item.mapping_status === 'LAUNCH_PENDING_CATALOG' || item.has_winthor === false,
      line: firstText(item, ['commercial_line', 'product_line']) ?? itemLine(item) ?? '',
      brand: firstText(item, ['brand']) ?? '',
      subbrand: firstText(item, ['subbrand']) ?? '',
      category: firstText(item, ['category', 'segment']) ?? '',
      contents: firstText(item, ['contents', 'amount']) ?? '',
      unitsPerCase: optionalAmount(item.units_per_case_industry) !== null && optionalAmount(item.units_per_case_industry)! > 0
        ? optionalAmount(item.units_per_case_industry)
        : null,
      assortment: parseRangeAssortmentPresence(item.recommendation_json),
      assortmentMaterialized: Boolean(text(item.recommendation_json)),
    });

    physicalUnits += physical;
    reservedUnits += reserved;
    availableUnits += available;
    inboundQty += inboundItemUnits;
    projectedUnits += projected;
    purchaseValue += physical * cost;
    saleValue += itemSaleValue;
    availablePurchaseValue += Math.max(0, available) * cost;
    availableSaleValue += Math.max(0, available) * price;
    // A Carteira só entra na projeção quando a linha foi vinculada ao item e
    // convertida para unidades. Ela é valorizada pelo mesmo PVENDA1 usado no
    // estoque disponível — nunca pelo valor financeiro bruto da nota.
    projectedSaleValue += (Math.max(0, available) + inboundItemUnits) * price;
    if (physical > 0) itemsWithStock += 1;
    if (physical > 0 && price > 0) pricedItemsWithStock += 1;
    if (dailyDemand > 0 && coverage !== null) {
      mappedDemandItems += 1;
      coverageValues.push(coverage);
    }
    if (isLaunch) launchItems += 1;

    const line = itemLine(item);
    if (line && (itemSaleValue > 0 || itemAvailableSaleValue > 0 || itemProjectedSaleValue > 0)) {
      const label = itemSubbrand(item);
      const subbrandKey = normalized(label) || label;
      const buckets = lineSubbrandBuckets.get(line)!;
      const previous = buckets.get(subbrandKey);
      if (previous) {
        previous.saleValue = round(previous.saleValue + itemSaleValue);
        previous.availableSaleValue = round(previous.availableSaleValue + itemAvailableSaleValue);
        previous.projectedSaleValue = round(previous.projectedSaleValue + itemProjectedSaleValue);
        previous.physicalUnits = round(previous.physicalUnits + physical);
        previous.availableUnits = round(previous.availableUnits + available);
        previous.items += 1;
      } else {
        buckets.set(subbrandKey, {
          key: `${line}:${subbrandKey}`,
          label,
          saleValue: round(itemSaleValue),
          availableSaleValue: round(itemAvailableSaleValue),
          projectedSaleValue: round(itemProjectedSaleValue),
          physicalUnits: round(physical),
          availableUnits: round(available),
          items: 1,
          aggregate: false,
          classified: label !== 'Sem sub-brand informada',
        });
      }
    } else if (!line) {
      unclassified.push(item);
    }

    if (reserved > physical && reserved > 0) oversold.push(item);
    if (dailyDemand > 0 && available <= 0) ruptures.push(item);
    if (dailyDemand > 0 && coverage !== null && coverage > 0 && coverage < LOW_COVERAGE_DAYS) lowCoverage.push(item);
    if (isLaunch && (available <= 0 || (coverage !== null && coverage < LOW_COVERAGE_DAYS))) launchCritical.push(item);
    if (available > 0 && dailyDemand <= 0) noTurnover.push(item);
    if (physical > 0 && price <= 0) noPrice.push(item);
    if (available < 0) negativeAvailable.push(item);
  }

  for (const [sku, pending] of pendingCatalogBySku) {
    products.push({
      id: `CARTEIRA:${comparableCode(sku) ?? sku}`,
      description: `Item da Carteira — ${sku}`,
      winthor: '',
      distributor: sku,
      ean: '',
      physical: 0,
      reserved: 0,
      available: 0,
      availableSource: 'DERIVED',
      inboundQty: round(pending.cases),
      inboundUnits: 0,
      projected: 0,
      invoices: [...pending.invoices].sort(),
      arrival: pending.arrival,
      lastReceipt: null,
      sold: 0,
      salesValue: 0,
      averageDailySales: 0,
      averageMonthlySales: 0,
      lastSale: null,
      coverage: null,
      analysisDays,
      priceWithoutSt: null,
      stValue: null,
      priceWithSt: null,
      industryTablePrice: null,
      cost: null,
      isLaunch: false,
      unregistered: true,
      line: '',
      brand: '',
      subbrand: '',
      category: '',
      contents: '',
      unitsPerCase: null,
      assortment: [],
      assortmentMaterialized: false,
    });
  }

  const coverageDays = coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null;
  const projectedPurchaseValue = Math.max(0, availablePurchaseValue) + inboundValue;
  const alerts: StockOverviewAlert[] = [];
  if (launchCritical.length) alerts.push(alert('LAUNCH_STOCK_RISK', 'critical', 'Lançamentos com risco de estoque', `Lançamentos sem saldo disponível ou abaixo de ${LOW_COVERAGE_DAYS} dias de cobertura na janela histórica.`, launchCritical));
  if (ruptures.length) alerts.push(alert('STOCKOUT_WITH_DEMAND', 'critical', 'Rupturas com giro comprovado', 'Itens sem estoque disponível que tiveram saída líquida no período de análise.', ruptures));
  if (oversold.length) alerts.push(alert('RESERVED_ABOVE_PHYSICAL', 'critical', 'Reserva acima do físico', 'Itens em que pedidos a faturar superam o estoque físico atual.', oversold));
  if (negativeAvailable.length) alerts.push(alert('NEGATIVE_AVAILABLE_STOCK', 'critical', 'Estoque disponível negativo', 'O valor negativo foi preservado para evidenciar divergência; não foi convertido silenciosamente em zero.', negativeAvailable));
  if (lowCoverage.length) alerts.push(alert('LOW_COVERAGE', 'attention', `Cobertura abaixo de ${LOW_COVERAGE_DAYS} dias`, 'Somente itens com giro mapeado entram neste alerta; itens sem histórico não recebem falso risco imediato.', lowCoverage));
  if (noTurnover.length) alerts.push(alert('NO_TURNOVER', 'info', 'Estoque sem giro na janela', `Itens com saldo disponível e nenhuma saída líquida mapeada nos ${analysisDays || 0} dias efetivamente analisados.`, noTurnover));
  if (noPrice.length) alerts.push(alert('MISSING_SALE_PRICE', 'attention', 'SKUs sem PVENDA1', 'Itens com estoque físico que não podem ser valorizados a venda porque a PCTABPR não forneceu PVENDA1.', noPrice));
  if (unclassified.length) alerts.push(alert('UNCLASSIFIED_ITEMS', 'info', 'SKUs sem linha comercial', 'Itens que não puderam entrar na composição por linha e sub-brand.', unclassified));
  if (inboundUnmappedFacts.length) alerts.push(qualityAlert('INBOUND_UNMAPPED', 'attention', 'Carteira sem vínculo completo', 'Linhas abertas sem produto reconhecido ou sem Un/CX não entram na projeção em unidades.', inboundUnmappedFacts.length, inboundUnmappedFacts.map(fact => `NF ${invoiceKey(fact.invoice_number) ?? 'não informada'} · SKU ${firstText(fact, ['industry_material', 'industry_sku']) ?? 'não informado'}`)));
  if (unmappedHistoricalRows) alerts.push(qualityAlert('HISTORICAL_UNMAPPED', 'attention', 'Histórico sem vínculo de produto', 'Movimentos do M4 não atribuídos a um SKU foram excluídos do giro, sem correspondência arbitrária.', unmappedHistoricalRows, historicalUnmappedFacts.map(fact => `${firstText(fact, ['legacy_product_code', 'historical_gtin']) ?? 'sem identificador'} · ${firstText(fact, ['movement_date']) ?? 'sem data'}`)));
  if (unmappedCurrentRows) alerts.push(qualityAlert('CURRENT_UNMAPPED', 'attention', '8022 sem vínculo de produto', 'Movimentos atuais não atribuídos a um SKU foram excluídos do giro, sem correspondência arbitrária.', unmappedCurrentRows, currentUnmappedFacts.map(fact => `${firstText(fact, ['winthor_product_code', 'industry_sku', 'ean_product']) ?? 'sem identificador'} · ${firstText(fact, ['event_date']) ?? 'sem data'}`)));
  if (indexes.ambiguousIdentifierKeys) alerts.push(qualityAlert('AMBIGUOUS_PRODUCT_IDENTIFIER', 'critical', 'Identificadores de produto ambíguos', 'Chaves associadas a mais de um item foram bloqueadas; nenhuma delas gera correspondência silenciosa.', indexes.ambiguousIdentifierKeys, indexes.ambiguousExamples));

  const treemap: StockLineTreemap[] = SELL_OUT_COMMERCIAL_LINES.map(line => {
    const sorted = [...(lineSubbrandBuckets.get(line)?.values() ?? [])].sort((a, b) => b.saleValue - a.saleValue);
    return {
      line,
      totalValue: round(sorted.reduce((sum, item) => sum + item.saleValue, 0)),
      availableTotalValue: round(sorted.reduce((sum, item) => sum + item.availableSaleValue, 0)),
      projectedTotalValue: round(sorted.reduce((sum, item) => sum + item.projectedSaleValue, 0)),
      items: sorted.reduce((sum, item) => sum + item.items, 0),
      subbrands: sorted.filter(item => item.classified).length,
      itemsWithoutSubbrand: sorted.filter(item => !item.classified).reduce((sum, item) => sum + item.items, 0),
      // Cada sub-brand oficial ocupa seu próprio bloco no treemap. Não há
      // corte arbitrário nem consolidação visual em “Outras”.
      tiles: sorted,
    };
  });

  const safeProjected = Math.max(0, projectedUnits);
  const stockSkuShare = items.length > 0 ? itemsWithStock / items.length : null;
  const pricedCoverage = itemsWithStock > 0 ? pricedItemsWithStock / itemsWithStock : null;
  const inboundForecasts: StockInboundForecast[] = [...forecastByDate.entries()]
    .sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a.localeCompare(b))
    .map(([date, invoices]) => ({
      date,
      totalValue: round([...invoices.values()].reduce((sum, row) => sum + row.value, 0)),
      invoices: [...invoices.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([invoice, row]) => ({ invoice, value: round(row.value), items: [...row.items].sort() })),
    }));
  const inboundNotes: StockInboundNote[] = [...notesByInvoice.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([invoice, note]) => ({ invoice, orderDate: note.orderDate, billingDate: note.billingDate, totalValue: round(note.totalValue), outstandingValue: round(note.outstandingValue), orderQty: round(note.orderQty), billQty: round(note.billQty), outstandingQty: round(note.outstandingQty), received: note.received, items: [...note.items.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, item]) => ({ label, quantity: round(item.quantity), units: item.units === null ? null : round(item.units) })) }));
  const receivedNotes: StockReceiptNote[] = [...receivedNotesByInvoice.entries()]
    .sort(([, a], [, b]) => (b.receiptDate ?? '').localeCompare(a.receiptDate ?? '') || 0)
    .map(([invoice, note]) => {
      const items = [...note.items.values()].sort((a, b) => a.label.localeCompare(b.label));
      const itemValue = items.reduce<number | null>((sum, item) => sum === null || item.totalValue === null ? null : round(sum + item.totalValue), 0);
      return {
        invoice,
        receiptDate: note.receiptDate,
        invoiceIssueDate: note.invoiceIssueDate,
        totalValue: note.totalValue ?? itemValue,
        sources: [...note.sources].sort(),
        items,
      };
    });

  return {
    analysis: {
      startDate,
      endDate,
      days: analysisDays,
      lowCoverageThresholdDays: LOW_COVERAGE_DAYS,
      mappedHistoricalRows,
      unmappedHistoricalRows,
      mappedCurrentRows,
      unmappedCurrentRows,
      deduplicatedHistoricalRows,
      ambiguousIdentifierKeys: indexes.ambiguousIdentifierKeys,
    },
    totals: {
      items: items.length,
      itemsWithStock,
      physicalUnits: round(physicalUnits),
      reservedUnits: round(reservedUnits),
      availableUnits: round(availableUnits),
      inboundQty: round(inboundQty),
      inboundValue: round(inboundValue),
      grossInboundQty: round(grossInboundQty),
      grossInboundValue: round(grossInboundValue),
      receivedInboundQty: round(receivedInboundQty),
      receivedInboundValue: round(receivedInboundValue),
      matchedReceiptInvoices218: matched218.size,
      matchedReceiptInvoices12322: matched12322.size,
      receiptInvoices218Read: receiptInvoices218.size,
      receiptInvoices12322Read: receiptInvoices12322.size,
      additionalReceiptInvoices218: additional218.size,
      receiptOverlapInvoices: overlapReceiptInvoices.size,
      unmatchedBilledInvoices: unmatchedBilled.size,
      deductedBy12322Value: round(deductedBy12322Value),
      deductedBy218Value: round(deductedBy218Value),
      mappedInboundQty: round(mappedInboundQty),
      totalInboundQty: round(totalInboundQty),
      mappedInboundRows,
      totalInboundRows,
      projectedUnits: round(projectedUnits),
      purchaseValue: round(purchaseValue),
      saleValue: round(saleValue),
      availablePurchaseValue: round(availablePurchaseValue),
      availableSaleValue: round(availableSaleValue),
      projectedPurchaseValue: round(projectedPurchaseValue),
      projectedSaleValue: round(projectedSaleValue),
      coverageDays: coverageDays === null ? null : round(coverageDays),
      mappedDemandItems,
      pricedItemsWithStock,
      launchItems,
    },
    progress: {
      coverageVsReference: coverageDays === null ? null : coverageDays / LOW_COVERAGE_DAYS,
      inboundMapping: totalInboundQty > 0 ? mappedInboundQty / totalInboundQty : null,
      pricedCoverage,
      purchaseVsSale: saleValue > 0 ? purchaseValue / saleValue : null,
      stockSkuShare,
      projectedInboundShare: safeProjected > 0 ? inboundQty / safeProjected : null,
    },
    alerts,
    dataQuality: {
      noSalePriceItems: noPrice.length,
      unclassifiedItems: unclassified.length,
      inboundUnmappedRows: Math.max(0, totalInboundRows - mappedInboundRows),
      historicalUnmappedRows: unmappedHistoricalRows,
      currentUnmappedRows: unmappedCurrentRows,
      ambiguousProductIdentifiers: indexes.ambiguousIdentifierKeys,
    },
    treemap,
    inboundForecasts,
    inboundNotes,
    receivedNotes,
    products: products.sort((a, b) => a.description.localeCompare(b.description)),
  };
}
