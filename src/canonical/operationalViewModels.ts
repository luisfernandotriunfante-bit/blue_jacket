import type { CanonicalList } from './types';
import { APPROVED_CANONICAL_BUILD } from './runtime';
import { proportionalNetworkTargets } from './reportSettings';

type RecordValue = Record<string, unknown>;
export type ViewAuditCode = 'UNRESOLVED_RCA_IN_VIEW' | 'UNRESOLVED_CUSTOMER_NETWORK' | 'MISSING_TARGET' | 'VIEW_RECONCILIATION_FAILED';
export type ViewAudit = { code: ViewAuditCode; message: string; action: string; count: number };

export type SellOutRow = {
  key: string;
  rcaCanonicalId: string | null;
  rawRcaCode: string | null;
  label: string;
  salesTarget: number;
  positivityTarget: number;
  invoiced: number;
  toInvoice: number;
  realized: number;
  positiveCustomers: number;
  achievement: number | null;
  positivityAchievement: number | null;
  resolutionStatus: 'RESOLVED' | 'UNRESOLVED';
};

export type NetworkRow = {
  network: string;
  customers: number;
  invoiced: number;
  toInvoice: number;
  realized: number;
  share: number;
  resolutionStatus: 'SOURCE_PRESERVED' | 'UNRESOLVED';
  networkTarget: number | null;
  topTarget: number | null;
  gap: number | null;
  achievement: number | null;
};

export type SellOutLineRow = { line: string; invoiced: number; toInvoice: number; realized: number; share: number; resolutionStatus: 'CLASSIFIED' | 'UNCLASSIFIED' };
export type StockSummary = { items: number; physicalUnits: number; atCost: number; atSale: number; pricedItems: number };
export type StoreRow = { cnpj: string | null; customerCode: string | null; customer: string; tradeName: string | null; city: string | null; network: string; rca: string | null; invoiced: number; toInvoice: number; realized: number; topTarget: number | null; achievement: number | null };

export type SellOutViewModel = {
  motorBuildId: string;
  stagingManifestHash: string;
  generatedAt: string;
  competence: string;
  sourceFacts: { sales: number; targets: number };
  totals: {
    invoiced: number;
    toInvoice: number;
    realized: number;
    salesTarget: number;
    positivityTarget: number;
    positiveCustomers: number;
    salesAchievement: number | null;
    positivityAchievement: number | null;
    daysWithSales: number;
  };
  vendorRows: SellOutRow[];
  dailyRows: Array<{ date: string; invoiced: number; toInvoice: number; realized: number }>;
  networkRows: NetworkRow[];
  salesByLine: SellOutLineRow[];
  stock: StockSummary | null;
  audits: ViewAudit[];
  reconciliation: { vendorsEqualTotal: boolean; dailyEqualTotal: boolean; networksEqualMappedUniverse: boolean; mappedNetworkValue: number };
};

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const listRecords = (list: CanonicalList) => list.records as RecordValue[];

function orderBucket(sale: RecordValue): 'INVOICED' | 'TO_INVOICE' {
  return normalized(sale.order_status) === 'A FATURAR' ? 'TO_INVOICE' : 'INVOICED';
}

function firstCustomerByCnpj(m2: CanonicalList) {
  const map = new Map<string, RecordValue>();
  for (const customer of listRecords(m2)) {
    const cnpj = text(customer.cnpj);
    if (cnpj && !map.has(cnpj)) map.set(cnpj, customer);
  }
  return map;
}

function addTo<T extends object>(map: Map<string, T>, key: string, create: () => T): T {
  const existing = map.get(key);
  if (existing) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

function itemMaps(m1?: CanonicalList) {
  const byId = new Map<string, RecordValue>(); const byWinthor = new Map<string, RecordValue>();
  for (const item of m1 ? listRecords(m1) : []) { const id = text(item.item_canonical_id); const winthor = text(item.winthor_code); if (id) byId.set(id, item); if (winthor) byWinthor.set(winthor, item); }
  return { byId, byWinthor };
}

function stockSummary(m1?: CanonicalList): StockSummary | null {
  if (!m1) return null; let physicalUnits = 0; let atCost = 0; let atSale = 0; let pricedItems = 0;
  for (const item of listRecords(m1)) { const units = amount(item.physical_stock_units); const cost = amount(item.cost_unit_105); const price = amount(item.pVenda1_region11); physicalUnits += units; atCost += units * cost; atSale += units * price; if (price > 0) pricedItems += 1; }
  return { items: m1.records.length, physicalUnits: round(physicalUnits), atCost: round(atCost), atSale: round(atSale), pricedItems };
}

export function buildSellOutViewModel({ m1, m2, m3, generatedAt = new Date().toISOString() }: { m1?: CanonicalList; m2: CanonicalList; m3: CanonicalList; generatedAt?: string }): SellOutViewModel {
  const customers = firstCustomerByCnpj(m2);
  const items = itemMaps(m1);
  const sales = listRecords(m3).filter(fact => fact.fact_type === 'SALE');
  const targets = listRecords(m3).filter(fact => fact.fact_type === 'TARGET');
  const vendorMap = new Map<string, SellOutRow>();
  const dailyMap = new Map<string, { date: string; invoiced: number; toInvoice: number; realized: number }>();
  const networkMap = new Map<string, NetworkRow>();
  const unresolvedRcaCodes = new Set<string>();
  let unresolvedNetworkLines = 0;

  for (const target of targets) {
    const canonicalId = text(target.rca_canonical_id);
    const rawCode = text(target.transaction_rca_code);
    const key = canonicalId ? `canonical:${canonicalId}` : `raw:${rawCode ?? 'SEM_RCA'}`;
    const row = addTo(vendorMap, key, (): SellOutRow => ({
      key, rcaCanonicalId: canonicalId, rawRcaCode: rawCode,
      label: canonicalId ?? `RCA pendente${rawCode ? ` (${rawCode})` : ''}`,
      salesTarget: 0, positivityTarget: 0, invoiced: 0, toInvoice: 0, realized: 0, positiveCustomers: 0,
      achievement: null, positivityAchievement: null, resolutionStatus: canonicalId ? 'RESOLVED' : 'UNRESOLVED',
    }));
    row.salesTarget += amount(target.sales_target);
    row.positivityTarget += amount(target.positivity_target);
  }

  for (const sale of sales) {
    const canonicalId = text(sale.rca_canonical_id);
    const rawCode = text(sale.transaction_rca_code);
    const key = canonicalId ? `canonical:${canonicalId}` : `raw:${rawCode ?? 'SEM_RCA'}`;
    const row = addTo(vendorMap, key, (): SellOutRow => ({
      key, rcaCanonicalId: canonicalId, rawRcaCode: rawCode,
      label: canonicalId ?? `RCA pendente${rawCode ? ` (${rawCode})` : ''}`,
      salesTarget: 0, positivityTarget: 0, invoiced: 0, toInvoice: 0, realized: 0, positiveCustomers: 0,
      achievement: null, positivityAchievement: null, resolutionStatus: canonicalId ? 'RESOLVED' : 'UNRESOLVED',
    }));
    if (!canonicalId) unresolvedRcaCodes.add(rawCode ?? 'SEM_RCA');
    const value = amount(sale.value);
    row.realized += value;
    if (orderBucket(sale) === 'TO_INVOICE') row.toInvoice += value; else row.invoiced += value;

    const date = text(sale.event_date) ?? 'Sem data';
    const daily = addTo(dailyMap, date, () => ({ date, invoiced: 0, toInvoice: 0, realized: 0 }));
    daily.realized += value;
    if (orderBucket(sale) === 'TO_INVOICE') daily.toInvoice += value; else daily.invoiced += value;

    const cnpj = text(sale.cnpj);
    const customer = cnpj ? customers.get(cnpj) : undefined;
    const network = text(customer?.canonical_network) ?? text(customer?.premise_network) ?? text(customer?.top_network);
    if (!network) { unresolvedNetworkLines += 1; continue; }
    const net = addTo<NetworkRow>(networkMap, network, () => ({ network, customers: 0, invoiced: 0, toInvoice: 0, realized: 0, share: 0, resolutionStatus: 'SOURCE_PRESERVED', networkTarget: null, topTarget: null, gap: null, achievement: null }));
    net.realized += value;
    if (orderBucket(sale) === 'TO_INVOICE') net.toInvoice += value; else net.invoiced += value;
  }

  const positiveByVendor = new Map<string, Set<string>>();
  const positiveByNetwork = new Map<string, Set<string>>();
  for (const sale of sales) {
    const canonicalId = text(sale.rca_canonical_id);
    const rawCode = text(sale.transaction_rca_code);
    const key = canonicalId ? `canonical:${canonicalId}` : `raw:${rawCode ?? 'SEM_RCA'}`;
    const customerKey = text(sale.customer_canonical_id) ?? text(sale.cnpj);
    if (customerKey) addTo(positiveByVendor, key, () => new Set<string>()).add(customerKey);
    const customer = text(sale.cnpj) ? customers.get(text(sale.cnpj)!) : undefined;
    const network = text(customer?.canonical_network) ?? text(customer?.premise_network) ?? text(customer?.top_network);
    if (network && customerKey) addTo(positiveByNetwork, network, () => new Set<string>()).add(customerKey);
  }

  const totals = { invoiced: 0, toInvoice: 0, realized: 0, salesTarget: 0, positivityTarget: 0, positiveCustomers: new Set<string>(), salesAchievement: null as number | null, positivityAchievement: null as number | null, daysWithSales: dailyMap.size };
  for (const row of vendorMap.values()) {
    row.positiveCustomers = positiveByVendor.get(row.key)?.size ?? 0;
    row.invoiced = round(row.invoiced); row.toInvoice = round(row.toInvoice); row.realized = round(row.realized);
    row.salesTarget = round(row.salesTarget); row.positivityTarget = round(row.positivityTarget);
    row.achievement = row.salesTarget > 0 ? row.realized / row.salesTarget : null;
    row.positivityAchievement = row.positivityTarget > 0 ? row.positiveCustomers / row.positivityTarget : null;
    totals.invoiced += row.invoiced; totals.toInvoice += row.toInvoice; totals.realized += row.realized; totals.salesTarget += row.salesTarget; totals.positivityTarget += row.positivityTarget;
  }
  for (const sale of sales) { const customerKey = text(sale.customer_canonical_id) ?? text(sale.cnpj); if (customerKey) totals.positiveCustomers.add(customerKey); }
  const finalTotals = { ...totals, invoiced: round(totals.invoiced), toInvoice: round(totals.toInvoice), realized: round(totals.realized), salesTarget: round(totals.salesTarget), positivityTarget: round(totals.positivityTarget), positiveCustomers: totals.positiveCustomers.size, salesAchievement: totals.salesTarget > 0 ? totals.realized / totals.salesTarget : null, positivityAchievement: totals.positivityTarget > 0 ? totals.positiveCustomers.size / totals.positivityTarget : null };
  const vendorRows = [...vendorMap.values()].sort((a, b) => b.realized - a.realized || a.label.localeCompare(b.label));
  const dailyRows = [...dailyMap.values()].map(row => ({ ...row, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized) })).sort((a, b) => a.date.localeCompare(b.date));
  const networkTopTargets = new Map<string, number>();
  for (const customer of listRecords(m2)) { const network = text(customer.canonical_network) ?? text(customer.premise_network) ?? text(customer.top_network); if (network) networkTopTargets.set(network, (networkTopTargets.get(network) ?? 0) + amount(customer.top_target)); }
  const networkRows = [...networkMap.values()].map(row => { const topTarget = round(networkTopTargets.get(row.network) ?? 0) || null; return { ...row, topTarget, customers: positiveByNetwork.get(row.network)?.size ?? 0, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), share: finalTotals.realized > 0 ? row.realized / finalTotals.realized : 0 }; }).sort((a, b) => b.realized - a.realized || a.network.localeCompare(b.network));
  const lines = new Map<string, SellOutLineRow>();
  for (const sale of sales) { const item = items.byId.get(text(sale.item_canonical_id) ?? '') ?? items.byWinthor.get(text(sale.winthor_product_code) ?? ''); const resolvedLine = text(item?.category_master) ?? text(item?.category) ?? text(item?.segment); const line = resolvedLine ?? 'PENDENTE / NÃO CLASSIFICADO'; const row = addTo(lines, line, () => ({ line, invoiced: 0, toInvoice: 0, realized: 0, share: 0, resolutionStatus: resolvedLine ? 'CLASSIFIED' : 'UNCLASSIFIED' })); const value = amount(sale.value); row.realized += value; if (orderBucket(sale) === 'TO_INVOICE') row.toInvoice += value; else row.invoiced += value; }
  const salesByLine: SellOutLineRow[] = [...lines.values()].map(row => ({ ...row, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), share: finalTotals.realized > 0 ? row.realized / finalTotals.realized : 0 })).sort((a, b) => b.realized - a.realized || a.line.localeCompare(b.line));
  const mappedNetworkValue = round(networkRows.reduce((sum, row) => sum + row.realized, 0));
  const audits: ViewAudit[] = [];
  if (unresolvedRcaCodes.size) audits.push({ code: 'UNRESOLVED_RCA_IN_VIEW', count: unresolvedRcaCodes.size, message: `${unresolvedRcaCodes.size} códigos de RCA presentes em SALE não possuem rca_canonical_id no bundle ativo.`, action: 'Corrigir o relacionamento RCA no próximo build canônico; a visão não aplica fallback.' });
  if (unresolvedNetworkLines) audits.push({ code: 'UNRESOLVED_CUSTOMER_NETWORK', count: unresolvedNetworkLines, message: `${unresolvedNetworkLines} linhas SALE não possuem rede resolvida em M2.`, action: 'Completar a relação de rede no M2 em novo build; essas linhas não são alocadas em rede.' });
  if (!targets.length) audits.push({ code: 'MISSING_TARGET', count: 1, message: 'Não há TARGET no M3 ativo.', action: 'Homologar um novo build com metas materializadas.' });
  const vendorTotal = round(vendorRows.reduce((sum, row) => sum + row.realized, 0));
  const dailyTotal = round(dailyRows.reduce((sum, row) => sum + row.realized, 0));
  const reconciliation = { vendorsEqualTotal: vendorTotal === finalTotals.realized, dailyEqualTotal: dailyTotal === finalTotals.realized, networksEqualMappedUniverse: mappedNetworkValue <= finalTotals.realized, mappedNetworkValue };
  if (!reconciliation.vendorsEqualTotal || !reconciliation.dailyEqualTotal) audits.push({ code: 'VIEW_RECONCILIATION_FAILED', count: 1, message: 'Uma agregação de Sell Out divergiu do total do mesmo universo.', action: 'Revisar o view-model antes de utilizar a visão.' });
  return { motorBuildId: APPROVED_CANONICAL_BUILD.motorBuildId, stagingManifestHash: APPROVED_CANONICAL_BUILD.stagingManifestHash, generatedAt, competence: m3.competence, sourceFacts: { sales: sales.length, targets: targets.length }, totals: finalTotals, vendorRows, dailyRows, networkRows, salesByLine, stock: stockSummary(m1), audits, reconciliation };
}

export type TopNetworksViewModel = Pick<SellOutViewModel, 'motorBuildId' | 'stagingManifestHash' | 'generatedAt' | 'competence' | 'audits'> & { rows: NetworkRow[]; storeRows: StoreRow[]; teamRows: SellOutRow[]; totals: { networks: number; customers: number; realized: number; invoiced: number; toInvoice: number; networkTarget: number | null }; reconciliation: { rowsEqualTotal: boolean; mappedUniverseValue: number } };

export function buildTopNetworksViewModel(input: { m2: CanonicalList; m3: CanonicalList; generatedAt?: string; networkTarget?: number | null }): TopNetworksViewModel {
  const sellOut = buildSellOutViewModel(input);
  const targets = proportionalNetworkTargets(input.networkTarget ?? null, sellOut.networkRows);
  const rows = sellOut.networkRows.map(row => ({ ...row, networkTarget: targets.get(row.network) ?? null, gap: targets.has(row.network) ? round((targets.get(row.network) ?? 0) - row.realized) : null, achievement: targets.has(row.network) && (targets.get(row.network) ?? 0) > 0 ? row.realized / (targets.get(row.network) ?? 1) : null }));
  const customers = firstCustomerByCnpj(input.m2); const stores = new Map<string, StoreRow>();
  for (const sale of listRecords(input.m3).filter(fact => fact.fact_type === 'SALE')) { const cnpj = text(sale.cnpj); const customer = cnpj ? customers.get(cnpj) : undefined; const network = text(customer?.canonical_network) ?? text(customer?.premise_network) ?? text(customer?.top_network); if (!network) continue; const key = text(sale.customer_canonical_id) ?? cnpj ?? `${network}:${stores.size}`; const row = addTo(stores, key, () => ({ cnpj, customerCode: text(customer?.winthor_customer_code), customer: text(customer?.customer_name) ?? 'CLIENTE SEM NOME', tradeName: text(customer?.trade_name), city: text(customer?.city), network, rca: text(customer?.rca_canonical_id) ?? text(sale.rca_canonical_id) ?? text(sale.transaction_rca_code), invoiced: 0, toInvoice: 0, realized: 0, topTarget: amount(customer?.top_target) || null, achievement: null })); const value = amount(sale.value); row.realized += value; if (orderBucket(sale) === 'TO_INVOICE') row.toInvoice += value; else row.invoiced += value; }
  const storeRows = [...stores.values()].map(row => ({ ...row, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), achievement: row.topTarget ? row.realized / row.topTarget : null })).sort((a, b) => a.network.localeCompare(b.network) || b.realized - a.realized);
  const total = round(rows.reduce((sum, row) => sum + row.realized, 0));
  return {
    motorBuildId: sellOut.motorBuildId, stagingManifestHash: sellOut.stagingManifestHash, generatedAt: sellOut.generatedAt, competence: sellOut.competence,
    rows, storeRows, teamRows: sellOut.vendorRows, audits: sellOut.audits,
    totals: { networks: rows.length, customers: new Set(rows.flatMap(row => [row.network])).size ? rows.reduce((sum, row) => sum + row.customers, 0) : 0, realized: total, invoiced: round(rows.reduce((sum, row) => sum + row.invoiced, 0)), toInvoice: round(rows.reduce((sum, row) => sum + row.toInvoice, 0)), networkTarget: input.networkTarget ?? null },
    reconciliation: { rowsEqualTotal: total === sellOut.reconciliation.mappedNetworkValue, mappedUniverseValue: sellOut.reconciliation.mappedNetworkValue },
  };
}
