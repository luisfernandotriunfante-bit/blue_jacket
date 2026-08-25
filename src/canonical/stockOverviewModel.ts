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

export type StockLineOverview = {
  line: SellOutCommercialLine;
  items: number;
  physicalUnits: number;
  availableUnits: number;
  saleValue: number;
  itemShare: number;
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
    projectedUnits: number;
    purchaseValue: number;
    saleValue: number;
    coverageDays: number | null;
    mappedDemandItems: number;
    pricedItemsWithStock: number;
    mappedInboundQty: number;
    totalInboundQty: number;
    launchItems: number;
  };
  progress: {
    coverageVsReference: number | null;
    reservedShare: number | null;
    availableShare: number | null;
    inboundMapping: number | null;
    projectedInboundShare: number | null;
    pricedCoverage: number | null;
    purchaseVsSale: number | null;
    stockSkuShare: number | null;
  };
  alerts: StockOverviewAlert[];
  lines: StockLineOverview[];
  unclassifiedItems: number;
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

function firstText(record: RecordValue | undefined, fields: string[]) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return null;
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

function buildItemIndexes(m1: CanonicalList) {
  const byWinthor = new Map<string, RecordValue>();
  const byEan = new Map<string, RecordValue>();
  const bySku = new Map<string, RecordValue>();
  for (const item of m1.records as RecordValue[]) {
    const winthor = firstText(item, ['winthor_code']);
    const ean = firstText(item, ['internal_ean', 'industry_ean']);
    const sku = firstText(item, ['manufacturer_code', 'industry_sku', 'manufacturer_code_286']);
    if (winthor) byWinthor.set(winthor, item);
    if (ean) byEan.set(ean, item);
    if (sku) bySku.set(sku, item);
  }
  return { byWinthor, byEan, bySku };
}

function currentItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const winthor = firstText(fact, ['winthor_product_code']);
  const sku = firstText(fact, ['industry_sku', 'industry_material']);
  return (winthor ? indexes.byWinthor.get(winthor) : undefined) ?? (sku ? indexes.bySku.get(sku) : undefined);
}

function historicalItemForFact(fact: RecordValue, indexes: ReturnType<typeof buildItemIndexes>) {
  const ean = firstText(fact, ['historical_gtin', 'ean_commercial', 'ean_tax']);
  const legacyCode = firstText(fact, ['legacy_product_code']);
  return (ean ? indexes.byEan.get(ean) : undefined) ?? (legacyCode ? indexes.byWinthor.get(legacyCode) : undefined);
}

function itemKey(item: RecordValue) {
  return firstText(item, ['item_canonical_id', 'winthor_code', 'internal_ean', 'manufacturer_code']) ?? `ITEM:${Math.random()}`;
}

function itemLabel(item: RecordValue) {
  const code = firstText(item, ['winthor_code', 'manufacturer_code', 'internal_ean']) ?? 'sem código';
  const description = firstText(item, ['description_internal', 'description_286', 'description_105']) ?? 'sem descrição';
  return `${code} · ${description}`;
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
  const indexes = buildItemIndexes(m1);
  const items = m1.records as RecordValue[];
  const sales = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'SALE');
  const inbound = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'INBOUND_ORDER');
  const historical = (m4.records as RecordValue[]).filter(fact => fact.row_type === 'TRANSACTION_379');

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

  const inboundByItem = new Map<string, number>();
  let totalInboundQty = 0;
  let mappedInboundQty = 0;
  for (const fact of inbound) {
    const qty = Math.max(0, amount(fact.order_qty)) + Math.max(0, amount(fact.bill_qty));
    totalInboundQty += qty;
    const item = currentItemForFact(fact, indexes);
    if (!item) continue;
    const key = itemKey(item);
    inboundByItem.set(key, (inboundByItem.get(key) ?? 0) + qty);
    mappedInboundQty += qty;
  }

  let physicalUnits = 0;
  let reservedUnits = 0;
  let availableUnits = 0;
  let inboundQty = 0;
  let projectedUnits = 0;
  let purchaseValue = 0;
  let saleValue = 0;
  let itemsWithStock = 0;
  let pricedItemsWithStock = 0;
  let mappedDemandItems = 0;
  let launchItems = 0;
  let coverageAvailableUnits = 0;
  let totalDailyDemand = 0;
  let unclassifiedItems = 0;

  const ruptures: RecordValue[] = [];
  const lowCoverage: RecordValue[] = [];
  const launchCritical: RecordValue[] = [];
  const noTurnover: RecordValue[] = [];
  const noPrice: RecordValue[] = [];
  const oversold: RecordValue[] = [];
  const unclassified: RecordValue[] = [];

  const lineBuckets = new Map<SellOutCommercialLine, { items: number; physicalUnits: number; availableUnits: number; saleValue: number }>(
    SELL_OUT_COMMERCIAL_LINES.map(line => [line, { items: 0, physicalUnits: 0, availableUnits: 0, saleValue: 0 }] as const),
  );

  for (const item of items) {
    const key = itemKey(item);
    const physical = Math.max(0, amount(item.physical_stock_units));
    const reserved = Math.max(0, reservedByItem.get(key) ?? 0);
    const available = physical - reserved;
    const inboundItem = Math.max(0, inboundByItem.get(key) ?? 0);
    const projected = available + inboundItem;
    const cost = Math.max(0, amount(item.cost_unit_105));
    const price = Math.max(0, amount(item.pVenda1_region11));
    const netDemand = Math.max(0, demandByItem.get(key) ?? 0);
    const dailyDemand = netDemand > 0 ? netDemand / ANALYSIS_DAYS : 0;
    const coverage = dailyDemand > 0 ? Math.max(0, available) / dailyDemand : null;
    const isLaunch = item.is_launch === true || normalized(item.launch_status) === 'LANÇAMENTO' || normalized(item.launch_status) === 'LANCAMENTO';

    physicalUnits += physical;
    reservedUnits += reserved;
    availableUnits += available;
    inboundQty += inboundItem;
    projectedUnits += projected;
    purchaseValue += physical * cost;
    saleValue += physical * price;
    if (physical > 0) itemsWithStock += 1;
    if (physical > 0 && price > 0) pricedItemsWithStock += 1;
    if (dailyDemand > 0) {
      mappedDemandItems += 1;
      coverageAvailableUnits += Math.max(0, available);
      totalDailyDemand += dailyDemand;
    }
    if (isLaunch) launchItems += 1;

    const line = itemLine(item);
    if (line) {
      const bucket = lineBuckets.get(line)!;
      bucket.items += 1;
      bucket.physicalUnits += physical;
      bucket.availableUnits += available;
      bucket.saleValue += physical * price;
    } else {
      unclassifiedItems += 1;
      unclassified.push(item);
    }

    if (reserved > physical && reserved > 0) oversold.push(item);
    if (dailyDemand > 0 && available <= 0) ruptures.push(item);
    if (dailyDemand > 0 && coverage !== null && coverage > 0 && coverage < LOW_COVERAGE_DAYS) lowCoverage.push(item);
    if (isLaunch && (available <= 0 || (coverage !== null && coverage < LOW_COVERAGE_DAYS))) launchCritical.push(item);
    if (available > 0 && dailyDemand <= 0) noTurnover.push(item);
    if (physical > 0 && price <= 0) noPrice.push(item);
  }

  const coverageDays = totalDailyDemand > 0 ? coverageAvailableUnits / totalDailyDemand : null;
  const alerts: StockOverviewAlert[] = [];
  if (launchCritical.length) alerts.push(alert('LAUNCH_STOCK_RISK', 'critical', 'Lançamentos com risco de estoque', `Lançamentos sem saldo disponível ou abaixo de ${LOW_COVERAGE_DAYS} dias de cobertura na janela histórica.`, launchCritical));
  if (ruptures.length) alerts.push(alert('STOCKOUT_WITH_DEMAND', 'critical', 'Rupturas com giro comprovado', 'Itens sem estoque disponível que tiveram saída líquida no período de análise.', ruptures));
  if (oversold.length) alerts.push(alert('RESERVED_ABOVE_PHYSICAL', 'critical', 'Reserva acima do físico', 'Itens em que pedidos a faturar superam o estoque físico atual.', oversold));
  if (lowCoverage.length) alerts.push(alert('LOW_COVERAGE', 'attention', `Cobertura abaixo de ${LOW_COVERAGE_DAYS} dias`, 'Somente itens com giro mapeado entram neste alerta; itens sem histórico não recebem falso risco imediato.', lowCoverage));
  if (noPrice.length) alerts.push(alert('NO_SALE_PRICE', 'attention', 'Estoque sem PVENDA1', 'Itens com saldo físico e sem preço PVENDA1 da região 11.', noPrice));
  if (unclassified.length) alerts.push(alert('UNCLASSIFIED_LINE', 'attention', 'Itens sem linha comercial', 'Itens ainda não classificados nas cinco linhas oficiais do Sell Out.', unclassified));
  if (totalInboundQty > mappedInboundQty + 0.0001) alerts.push({ code: 'INBOUND_UNMAPPED', tone: 'attention', title: 'Carteira sem vínculo de item', detail: 'Parte da Carteira Colgate não encontrou item do M1 pelo material da indústria; a projeção usa apenas a parcela mapeada.', count: inbound.filter(fact => !currentItemForFact(fact, indexes)).length, examples: inbound.filter(fact => !currentItemForFact(fact, indexes)).slice(0, 5).map(fact => firstText(fact, ['industry_material']) ?? 'material sem código') });
  if (noTurnover.length) alerts.push(alert('NO_TURNOVER', 'info', 'Estoque sem giro na janela', `Itens com saldo disponível e nenhuma saída líquida mapeada nos últimos ${ANALYSIS_DAYS} dias.`, noTurnover));
  if (unmappedHistoricalRows) alerts.push({ code: 'HISTORICAL_UNMAPPED', tone: 'info', title: 'Histórico sem vínculo de item', detail: 'Há movimentos 379 do período que não puderam ser ligados com segurança ao item atual por EAN/código; eles ficam fora da cobertura, sem chute.', count: unmappedHistoricalRows, examples: [] });

  const lines: StockLineOverview[] = SELL_OUT_COMMERCIAL_LINES.map(line => {
    const bucket = lineBuckets.get(line)!;
    return {
      line,
      items: bucket.items,
      physicalUnits: round(bucket.physicalUnits),
      availableUnits: round(bucket.availableUnits),
      saleValue: round(bucket.saleValue),
      itemShare: items.length > 0 ? bucket.items / items.length : 0,
    };
  });

  const safePhysical = Math.max(0, physicalUnits);
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
      projectedUnits: round(projectedUnits),
      purchaseValue: round(purchaseValue),
      saleValue: round(saleValue),
      coverageDays: coverageDays === null ? null : round(coverageDays),
      mappedDemandItems,
      pricedItemsWithStock,
      mappedInboundQty: round(mappedInboundQty),
      totalInboundQty: round(totalInboundQty),
      launchItems,
    },
    progress: {
      coverageVsReference: coverageDays === null ? null : coverageDays / LOW_COVERAGE_DAYS,
      reservedShare: safePhysical > 0 ? reservedUnits / safePhysical : null,
      availableShare: safePhysical > 0 ? Math.max(0, availableUnits) / safePhysical : null,
      inboundMapping: totalInboundQty > 0 ? mappedInboundQty / totalInboundQty : null,
      projectedInboundShare: safeProjected > 0 ? inboundQty / safeProjected : null,
      pricedCoverage,
      purchaseVsSale: saleValue > 0 ? purchaseValue / saleValue : null,
      stockSkuShare,
    },
    alerts,
    lines,
    unclassifiedItems,
  };
}
