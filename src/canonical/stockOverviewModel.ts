import { SELL_OUT_COMMERCIAL_LINES, classifySellOutCommercialLine, type SellOutCommercialLine } from './commercialLines';
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
  physicalUnits: number;
  availableUnits: number;
  aggregate: boolean;
};

export type StockLineTreemap = {
  line: SellOutCommercialLine;
  totalValue: number;
  items: number;
  tiles: StockTreemapTile[];
};

export type StockOverviewModel = {
  analysis: {
    startDate: string | null;
    endDate: string | null;
    days: number;
    lowCoverageThresholdDays: number;
    mappedHistoricalRows: number;
    unmappedHistoricalRows: number;
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
    mappedInboundQty: number;
    totalInboundQty: number;
    mappedInboundRows: number;
    totalInboundRows: number;
    projectedUnits: number;
    purchaseValue: number;
    saleValue: number;
    availablePurchaseValue: number;
    projectedPurchaseValue: number;
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
  };
  treemap: StockLineTreemap[];
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : value === null || value === undefined ? null : String(value).trim() || null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
const isIsoDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const dateValue = (value: string) => Date.parse(`${value}T12:00:00Z`);
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const LOW_COVERAGE_DAYS = 30;
const ANALYSIS_DAYS = 90;
const MAX_TILES_PER_LINE = 18;

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
  const numericTokens = raw.match(/\d+/g) ?? [];
  if (numericTokens.length) {
    let primary = numericTokens[0] ?? '';
    for (const token of numericTokens) if (token.length > primary.length) primary = token;
    return primary.replace(/^0+(?=\d)/, '');
  }
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
  const ambiguousSku = new Set<string>();

  for (const item of m1.records as RecordValue[]) {
    const winthor = firstText(item, ['winthor_code']);
    const ean = firstText(item, ['internal_ean', 'industry_ean']);
    const skus = [firstText(item, ['manufacturer_code']), firstText(item, ['industry_sku']), firstText(item, ['manufacturer_code_286'])].filter(Boolean) as string[];
    if (winthor) byWinthor.set(winthor, item);
    if (ean) byEan.set(ean, item);
    addUniqueIndex(byWinthorComparable, ambiguousWinthor, comparableCode(winthor), item);
    for (const sku of skus) {
      addUniqueIndex(bySku, ambiguousSku, sku, item);
      addUniqueIndex(bySkuComparable, ambiguousSku, comparableCode(sku), item);
    }
  }
  return { byWinthor, byWinthorComparable, byEan, bySku, bySkuComparable, ambiguousSku };
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
    addUniqueIndex(indexes.bySkuComparable, indexes.ambiguousSku, comparableCode(sku), item);
  }
}

function currentItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const winthor = firstText(fact, ['winthor_product_code']);
  const sku = firstText(fact, ['industry_sku', 'industry_material']);
  return (winthor ? indexes.byWinthor.get(winthor) : undefined)
    ?? (winthor ? indexes.byWinthorComparable.get(comparableCode(winthor) ?? '') : undefined)
    ?? (sku ? indexes.bySku.get(sku) : undefined)
    ?? (sku ? indexes.bySkuComparable.get(comparableCode(sku) ?? '') : undefined);
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

export function buildStockOverviewModel({ m1, m3, m4 }: { m1: CanonicalList; m3: CanonicalList; m4: CanonicalList }): StockOverviewModel {
  const items = m1.records as RecordValue[];
  const m3Records = m3.records as RecordValue[];
  const m4Records = m4.records as RecordValue[];
  const sales = m3Records.filter(fact => fact.fact_type === 'SALE');
  const inbound = m3Records.filter(fact => fact.fact_type === 'INBOUND_ORDER');
  const receipts218 = m3Records.filter(fact => fact.fact_type === 'RECEIPT');
  const historical = m4Records.filter(fact => fact.row_type === 'TRANSACTION_379');
  const receipts12322 = m4Records.filter(fact => fact.row_type === 'RECEIPT_12322' && normalized(fact.receipt_class) === 'MERCHANDISE');

  const indexes = buildItemIndexes(m1);
  augmentSkuAliasesFromSales(sales, indexes);
  const unitsPerCase = unitsPerCaseIndex(items, sales, indexes);

  const receiptInvoices218 = new Set(receipts218.map(fact => invoiceKey(fact.invoice_number)).filter(Boolean) as string[]);
  const receiptInvoices12322 = new Set(receipts12322.map(fact => invoiceKey(fact.invoice_number)).filter(Boolean) as string[]);

  const validDates = [
    ...sales.map(fact => text(fact.event_date)).filter(isIsoDate) as string[],
    ...historical.map(fact => text(fact.movement_date)).filter(isIsoDate) as string[],
  ].sort();
  const endDate = validDates.at(-1) ?? null;
  const startDate = endDate ? isoDate(dateValue(endDate) - (ANALYSIS_DAYS - 1) * 86400000) : null;

  const demandByItem = new Map<string, number>();
  let mappedHistoricalRows = 0;
  let unmappedHistoricalRows = 0;
  const addDemand = (item: RecordValue | undefined, quantity: number) => {
    if (!item || !Number.isFinite(quantity)) return false;
    const key = itemKey(item);
    demandByItem.set(key, (demandByItem.get(key) ?? 0) + quantity);
    return true;
  };

  for (const fact of sales) {
    const date = text(fact.event_date);
    if (!startDate || !endDate || !isIsoDate(date) || date! < startDate || date! > endDate) continue;
    addDemand(currentItemForFact(fact, indexes), Math.max(0, amount(fact.units)));
  }

  for (const fact of historical) {
    const date = text(fact.movement_date);
    if (!startDate || !endDate || !isIsoDate(date) || date! < startDate || date! > endDate) continue;
    const mapped = historicalItemForFact(fact, indexes);
    if (!mapped) { unmappedHistoricalRows += 1; continue; }
    mappedHistoricalRows += 1;
    addDemand(mapped, amount(fact.signed_quantity));
  }

  const reservedByItem = new Map<string, number>();
  for (const fact of sales) {
    if (normalized(fact.order_status) !== 'A FATURAR') continue;
    const item = currentItemForFact(fact, indexes);
    if (!item) continue;
    const key = itemKey(item);
    reservedByItem.set(key, (reservedByItem.get(key) ?? 0) + Math.max(0, amount(fact.units)));
  }

  const inboundUnitsByItem = new Map<string, number>();
  let grossInboundQty = 0;
  let totalInboundQty = 0;
  let mappedInboundQty = 0;
  let grossInboundValue = 0;
  let inboundValue = 0;
  let receivedInboundQty = 0;
  let receivedInboundValue = 0;
  let mappedInboundRows = 0;
  let totalInboundRows = 0;
  const matched218 = new Set<string>();
  const matched12322 = new Set<string>();

  for (const fact of inbound) {
    const orderQty = Math.max(0, amount(fact.order_qty));
    const billQty = Math.max(0, amount(fact.bill_qty));
    const grossQty = orderQty + billQty;
    const netValue = Math.max(0, amount(fact.inbound_net_value));
    const invoice = invoiceKey(fact.invoice_number);
    const item = currentItemForFact(fact, indexes);
    const itemId = item ? itemKey(item) : null;

    let receivedBillQty = 0;
    if (billQty > 0 && invoice && receiptInvoices12322.has(invoice)) {
      receivedBillQty = billQty;
      matched12322.add(invoice);
    } else if (billQty > 0 && invoice && receiptInvoices218.has(invoice)) {
      receivedBillQty = billQty;
      matched218.add(invoice);
    }

    const outstandingBillQty = Math.max(0, billQty - receivedBillQty);
    const outstandingQty = orderQty + outstandingBillQty;
    const outstandingRatio = grossQty > 0 ? outstandingQty / grossQty : 1;
    const outstandingValue = netValue * Math.max(0, Math.min(1, outstandingRatio));

    grossInboundQty += grossQty;
    grossInboundValue += netValue;
    totalInboundQty += outstandingQty;
    inboundValue += outstandingValue;
    receivedInboundQty += receivedBillQty;
    receivedInboundValue += Math.max(0, netValue - outstandingValue);

    if (outstandingQty <= 0 && outstandingValue <= 0) continue;
    totalInboundRows += 1;
    if (!item || !itemId) continue;
    const factor = unitsPerCase.get(itemId) ?? 0;
    if (!(factor > 0)) continue;
    const outstandingUnits = outstandingQty * factor;
    inboundUnitsByItem.set(itemId, (inboundUnitsByItem.get(itemId) ?? 0) + outstandingUnits);
    mappedInboundQty += outstandingQty;
    mappedInboundRows += 1;
  }

  let physicalUnits = 0;
  let reservedUnits = 0;
  let availableUnits = 0;
  let inboundQty = 0;
  let projectedUnits = 0;
  let purchaseValue = 0;
  let saleValue = 0;
  let availablePurchaseValue = 0;
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
  const lineItemBuckets = new Map<SellOutCommercialLine, StockTreemapTile[]>(SELL_OUT_COMMERCIAL_LINES.map(line => [line, []]));

  for (const item of items) {
    const key = itemKey(item);
    const physical = Math.max(0, amount(item.physical_stock_units));
    const reserved = Math.max(0, reservedByItem.get(key) ?? 0);
    const available = physical - reserved;
    const inboundItemUnits = Math.max(0, inboundUnitsByItem.get(key) ?? 0);
    const projected = available + inboundItemUnits;
    const cost = Math.max(0, amount(item.cost_unit_105));
    const price = Math.max(0, amount(item.pVenda1_region11));
    const itemSaleValue = physical * price;
    const netDemand = Math.max(0, demandByItem.get(key) ?? 0);
    const dailyDemand = netDemand > 0 ? netDemand / ANALYSIS_DAYS : 0;
    const coverage = dailyDemand > 0 ? Math.max(0, available) / dailyDemand : null;
    const isLaunch = item.is_launch === true || normalized(item.launch_status) === 'LANÇAMENTO' || normalized(item.launch_status) === 'LANCAMENTO';

    physicalUnits += physical;
    reservedUnits += reserved;
    availableUnits += available;
    inboundQty += inboundItemUnits;
    projectedUnits += projected;
    purchaseValue += physical * cost;
    saleValue += itemSaleValue;
    availablePurchaseValue += Math.max(0, available) * cost;
    if (physical > 0) itemsWithStock += 1;
    if (physical > 0 && price > 0) pricedItemsWithStock += 1;
    if (dailyDemand > 0 && coverage !== null) {
      mappedDemandItems += 1;
      coverageValues.push(coverage);
    }
    if (isLaunch) launchItems += 1;

    const line = itemLine(item);
    if (line && itemSaleValue > 0) {
      lineItemBuckets.get(line)!.push({
        key,
        label: itemLabel(item),
        saleValue: round(itemSaleValue),
        physicalUnits: round(physical),
        availableUnits: round(available),
        aggregate: false,
      });
    } else if (!line) {
      unclassified.push(item);
    }

    if (reserved > physical && reserved > 0) oversold.push(item);
    if (dailyDemand > 0 && available <= 0) ruptures.push(item);
    if (dailyDemand > 0 && coverage !== null && coverage > 0 && coverage < LOW_COVERAGE_DAYS) lowCoverage.push(item);
    if (isLaunch && (available <= 0 || (coverage !== null && coverage < LOW_COVERAGE_DAYS))) launchCritical.push(item);
    if (available > 0 && dailyDemand <= 0) noTurnover.push(item);
    if (physical > 0 && price <= 0) noPrice.push(item);
  }

  const coverageDays = coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null;
  const projectedPurchaseValue = Math.max(0, availablePurchaseValue) + inboundValue;
  const alerts: StockOverviewAlert[] = [];
  if (launchCritical.length) alerts.push(alert('LAUNCH_STOCK_RISK', 'critical', 'Lançamentos com risco de estoque', `Lançamentos sem saldo disponível ou abaixo de ${LOW_COVERAGE_DAYS} dias de cobertura na janela histórica.`, launchCritical));
  if (ruptures.length) alerts.push(alert('STOCKOUT_WITH_DEMAND', 'critical', 'Rupturas com giro comprovado', 'Itens sem estoque disponível que tiveram saída líquida no período de análise.', ruptures));
  if (oversold.length) alerts.push(alert('RESERVED_ABOVE_PHYSICAL', 'critical', 'Reserva acima do físico', 'Itens em que pedidos a faturar superam o estoque físico atual.', oversold));
  if (lowCoverage.length) alerts.push(alert('LOW_COVERAGE', 'attention', `Cobertura abaixo de ${LOW_COVERAGE_DAYS} dias`, 'Somente itens com giro mapeado entram neste alerta; itens sem histórico não recebem falso risco imediato.', lowCoverage));
  if (noTurnover.length) alerts.push(alert('NO_TURNOVER', 'info', 'Estoque sem giro na janela', `Itens com saldo disponível e nenhuma saída líquida mapeada nos últimos ${ANALYSIS_DAYS} dias.`, noTurnover));

  const treemap: StockLineTreemap[] = SELL_OUT_COMMERCIAL_LINES.map(line => {
    const sorted = [...(lineItemBuckets.get(line) ?? [])].sort((a, b) => b.saleValue - a.saleValue);
    const visible = sorted.slice(0, MAX_TILES_PER_LINE);
    const hidden = sorted.slice(MAX_TILES_PER_LINE);
    if (hidden.length) {
      visible.push({
        key: `${line}:OUTROS`,
        label: `Outros ${hidden.length} itens`,
        saleValue: round(hidden.reduce((sum, item) => sum + item.saleValue, 0)),
        physicalUnits: round(hidden.reduce((sum, item) => sum + item.physicalUnits, 0)),
        availableUnits: round(hidden.reduce((sum, item) => sum + item.availableUnits, 0)),
        aggregate: true,
      });
    }
    return {
      line,
      totalValue: round(sorted.reduce((sum, item) => sum + item.saleValue, 0)),
      items: sorted.length,
      tiles: visible,
    };
  });

  const safeProjected = Math.max(0, projectedUnits);
  const stockSkuShare = items.length > 0 ? itemsWithStock / items.length : null;
  const pricedCoverage = itemsWithStock > 0 ? pricedItemsWithStock / itemsWithStock : null;

  return {
    analysis: {
      startDate,
      endDate,
      days: ANALYSIS_DAYS,
      lowCoverageThresholdDays: LOW_COVERAGE_DAYS,
      mappedHistoricalRows,
      unmappedHistoricalRows,
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
      mappedInboundQty: round(mappedInboundQty),
      totalInboundQty: round(totalInboundQty),
      mappedInboundRows,
      totalInboundRows,
      projectedUnits: round(projectedUnits),
      purchaseValue: round(purchaseValue),
      saleValue: round(saleValue),
      availablePurchaseValue: round(availablePurchaseValue),
      projectedPurchaseValue: round(projectedPurchaseValue),
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
    },
    treemap,
  };
}
