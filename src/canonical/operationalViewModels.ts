import type { CanonicalList } from './types';
import { APPROVED_CANONICAL_BUILD } from './runtime';
import { canonicalCustomerKey, canonicalSellOutCompetence, classifySellOutStatus, isQualifyingPositiveSale, sellOutAmount, validSellOutDate } from './sellOutRules';

type RecordValue = Record<string, unknown>;
export type ViewAuditCode = 'UNRESOLVED_RCA_IN_VIEW' | 'MISSING_TARGET' | 'VIEW_RECONCILIATION_FAILED' | 'UNKNOWN_SALE_STATUS' | 'INVALID_SALE_DATE' | 'MIXED_COMPETENCE' | 'TARGET_COMPETENCE_MISMATCH' | 'M2_COMPETENCE_MISMATCH';
export type ViewAudit = { code: ViewAuditCode; message: string; action: string; count: number };

export type SellOutRow = {
  key: string;
  rcaCanonicalId: string | null;
  rawRcaCode: string | null;
  rcaName: string | null;
  rcaCurrentCode: string | null;
  rcaLegacyCode: string | null;
  supervisorCode: string | null;
  supervisorName: string | null;
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
export type RcaDiagnostic = { kind: 'NOVOS RCAS' | 'BÚSSOLA'; code: string; rca: string | null; supervisor: string | null; reason: string; salesTarget: number; positivityTarget: number; saleLines: number; realized: number; action: string; samples: string[] };
export type SupervisorSummary = { key: string; code: string | null; name: string | null; rcaCount: number; salesTarget: number; invoiced: number; toInvoice: number; realized: number; gap: number; achievement: number | null; positivityTarget: number; positiveCustomers: number; positivityAchievement: number | null };
export type StoreRow = { cnpj: string | null; customerCode: string | null; customer: string; tradeName: string | null; city: string | null; network: string; rca: string | null; invoiced: number; toInvoice: number; realized: number; topTarget: number | null; achievement: number | null };

type RcaDisplayMetadata = Pick<SellOutRow, 'rcaName' | 'rcaCurrentCode' | 'rcaLegacyCode' | 'supervisorCode' | 'supervisorName'>;

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
    invoicedPositiveCustomers: number;
    salesAchievement: number | null;
    positivityAchievement: number | null;
    daysWithSales: number;
  };
  vendorRows: SellOutRow[];
  dailyRows: Array<{ date: string; invoiced: number; toInvoice: number; realized: number; invoicedPositivation: number; totalPositivation: number }>;
  networkRows: NetworkRow[];
  salesByLine: SellOutLineRow[];
  stock: StockSummary | null;
  rcaDiagnostics: RcaDiagnostic[];
  supervisorRows: SupervisorSummary[];
  audits: ViewAudit[];
  reconciliation: { vendorsEqualTotal: boolean; dailyEqualTotal: boolean; networksEqualMappedUniverse: boolean; mappedNetworkValue: number };
};

const amount = sellOutAmount;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const listRecords = (list: CanonicalList) => list.records as RecordValue[];

const orderBucket = (sale: RecordValue) => classifySellOutStatus(sale.order_status);

function firstCustomerByCnpj(m2: CanonicalList) {
  const map = new Map<string, RecordValue>();
  for (const customer of listRecords(m2)) {
    const cnpj = text(customer.cnpj);
    if (cnpj && !map.has(cnpj)) map.set(cnpj, customer);
  }
  return map;
}

function rcaMetadataByCanonical(m2: CanonicalList) {
  const map = new Map<string, RcaDisplayMetadata>();
  for (const customer of listRecords(m2)) {
    const canonicalId = text(customer.rca_canonical_id);
    if (!canonicalId) continue;
    const current = map.get(canonicalId) ?? { rcaName: null, rcaCurrentCode: null, rcaLegacyCode: null, supervisorCode: null, supervisorName: null };
    map.set(canonicalId, {
      rcaName: current.rcaName ?? text(customer.rca_name),
      rcaCurrentCode: current.rcaCurrentCode ?? text(customer.rca_current_code) ?? canonicalId.replace(/^RCA:/, ''),
      rcaLegacyCode: current.rcaLegacyCode ?? text(customer.rca_legacy_code),
      supervisorCode: current.supervisorCode ?? text(customer.coordinator_code),
      supervisorName: current.supervisorName ?? text(customer.coordinator_name),
    });
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

function vendorIdentity(canonicalId: string | null, rawCode: string | null, metadata: Map<string, RcaDisplayMetadata>) {
  const meta = canonicalId ? metadata.get(canonicalId) : undefined;
  const currentCode = meta?.rcaCurrentCode ?? (canonicalId ? canonicalId.replace(/^RCA:/, '') : null);
  const name = meta?.rcaName ?? null;
  return {
    rcaName: name,
    rcaCurrentCode: currentCode,
    rcaLegacyCode: meta?.rcaLegacyCode ?? null,
    supervisorCode: meta?.supervisorCode ?? null,
    supervisorName: meta?.supervisorName ?? null,
    label: name ?? (currentCode ? `RCA ${currentCode}` : `RCA pendente${rawCode ? ` (${rawCode})` : ''}`),
  };
}

export function buildSellOutViewModel({ m1, m2, m3, generatedAt = new Date().toISOString() }: { m1?: CanonicalList; m2: CanonicalList; m3: CanonicalList; generatedAt?: string }): SellOutViewModel {
  const customers = firstCustomerByCnpj(m2);
  const rcaMetadata = rcaMetadataByCanonical(m2);
  const items = itemMaps(m1);
  const allSales = listRecords(m3).filter(fact => fact.fact_type === 'SALE');
  const competence = canonicalSellOutCompetence(allSales, m3.competence);
  const sales = competence === 'MIXED' ? [] : allSales.filter(fact => !fact.competence || fact.competence === competence || fact.competence === m3.competence);
  const targets = listRecords(m3).filter(fact => fact.fact_type === 'TARGET' && (!fact.competence || fact.competence === competence));
  const vendorMap = new Map<string, SellOutRow>();
  const dailyMap = new Map<string, { date: string; invoiced: number; toInvoice: number; realized: number; invoicedPositivation: Set<string>; totalPositivation: Set<string> }>();
  const networkMap = new Map<string, NetworkRow>();
  const unresolvedRcaCodes = new Set<string>();

  const ensureVendor = (canonicalId: string | null, rawCode: string | null) => {
    const key = canonicalId ? `canonical:${canonicalId}` : `raw:${rawCode ?? 'SEM_RCA'}`;
    const identity = vendorIdentity(canonicalId, rawCode, rcaMetadata);
    return addTo(vendorMap, key, (): SellOutRow => ({
      key, rcaCanonicalId: canonicalId, rawRcaCode: rawCode, ...identity,
      salesTarget: 0, positivityTarget: 0, invoiced: 0, toInvoice: 0, realized: 0, positiveCustomers: 0,
      achievement: null, positivityAchievement: null, resolutionStatus: canonicalId ? 'RESOLVED' : 'UNRESOLVED',
    }));
  };

  for (const target of targets) {
    const canonicalId = text(target.rca_canonical_id);
    const rawCode = text(target.transaction_rca_code);
    const row = ensureVendor(canonicalId, rawCode);
    row.salesTarget += amount(target.sales_target);
    row.positivityTarget += amount(target.positivity_target);
  }

  for (const sale of sales) {
    const bucket = orderBucket(sale);
    if (bucket === 'UNKNOWN') continue;
    const canonicalId = text(sale.rca_canonical_id);
    const rawCode = text(sale.transaction_rca_code);
    const row = ensureVendor(canonicalId, rawCode);
    if (!canonicalId) unresolvedRcaCodes.add(rawCode ?? 'SEM_RCA');
    const value = amount(sale.value);
    row.realized += value;
    if (bucket === 'TO_INVOICE') row.toInvoice += value; else row.invoiced += value;

    const date = text(sale.event_date);
    if (validSellOutDate(date)) {
      const daily = addTo(dailyMap, date, () => ({ date, invoiced: 0, toInvoice: 0, realized: 0, invoicedPositivation: new Set<string>(), totalPositivation: new Set<string>() }));
      daily.realized += value;
      if (bucket === 'TO_INVOICE') daily.toInvoice += value; else daily.invoiced += value;
      const customerKey = canonicalCustomerKey(sale);
      if (customerKey && isQualifyingPositiveSale(sale)) daily.totalPositivation.add(customerKey);
      if (customerKey && isQualifyingPositiveSale(sale, 'INVOICED')) daily.invoicedPositivation.add(customerKey);
    }

    const cnpj = text(sale.cnpj);
    const customer = cnpj ? customers.get(cnpj) : undefined;
    const network = text(customer?.canonical_network) ?? text(customer?.premise_network) ?? text(customer?.top_network);
    if (!network) continue;
    const net = addTo<NetworkRow>(networkMap, network, () => ({ network, customers: 0, invoiced: 0, toInvoice: 0, realized: 0, share: 0, resolutionStatus: 'SOURCE_PRESERVED', networkTarget: null, topTarget: null, gap: null, achievement: null }));
    net.realized += value;
    if (bucket === 'TO_INVOICE') net.toInvoice += value; else net.invoiced += value;
  }

  const positiveByVendor = new Map<string, Set<string>>();
  const positiveByNetwork = new Map<string, Set<string>>();
  for (const sale of sales) {
    if (!isQualifyingPositiveSale(sale)) continue;
    const canonicalId = text(sale.rca_canonical_id);
    const rawCode = text(sale.transaction_rca_code);
    const key = canonicalId ? `canonical:${canonicalId}` : `raw:${rawCode ?? 'SEM_RCA'}`;
    const customerKey = canonicalCustomerKey(sale);
    if (customerKey) addTo(positiveByVendor, key, () => new Set<string>()).add(customerKey);
    const customer = text(sale.cnpj) ? customers.get(text(sale.cnpj)!) : undefined;
    const network = text(customer?.canonical_network) ?? text(customer?.premise_network) ?? text(customer?.top_network);
    if (network && customerKey) addTo(positiveByNetwork, network, () => new Set<string>()).add(customerKey);
  }

  const totals = { invoiced: 0, toInvoice: 0, realized: 0, salesTarget: 0, positivityTarget: 0, positiveCustomers: new Set<string>(), invoicedPositiveCustomers: new Set<string>(), salesAchievement: null as number | null, positivityAchievement: null as number | null, daysWithSales: dailyMap.size };
  for (const row of vendorMap.values()) {
    row.positiveCustomers = positiveByVendor.get(row.key)?.size ?? 0;
    row.invoiced = round(row.invoiced); row.toInvoice = round(row.toInvoice); row.realized = round(row.realized);
    row.salesTarget = round(row.salesTarget); row.positivityTarget = round(row.positivityTarget);
    row.achievement = row.salesTarget > 0 ? row.realized / row.salesTarget : null;
    row.positivityAchievement = row.positivityTarget > 0 ? row.positiveCustomers / row.positivityTarget : null;
    totals.invoiced += row.invoiced; totals.toInvoice += row.toInvoice; totals.realized += row.realized; totals.salesTarget += row.salesTarget; totals.positivityTarget += row.positivityTarget;
  }
  for (const sale of sales) { const customerKey = canonicalCustomerKey(sale); if (customerKey && isQualifyingPositiveSale(sale)) totals.positiveCustomers.add(customerKey); if (customerKey && isQualifyingPositiveSale(sale, 'INVOICED')) totals.invoicedPositiveCustomers.add(customerKey); }
  const finalTotals = { ...totals, invoiced: round(totals.invoiced), toInvoice: round(totals.toInvoice), realized: round(totals.realized), salesTarget: round(totals.salesTarget), positivityTarget: round(totals.positivityTarget), positiveCustomers: totals.positiveCustomers.size, invoicedPositiveCustomers: totals.invoicedPositiveCustomers.size, salesAchievement: totals.salesTarget > 0 ? totals.realized / totals.salesTarget : null, positivityAchievement: totals.positivityTarget > 0 ? totals.positiveCustomers.size / totals.positivityTarget : null };
  const vendorRows = [...vendorMap.values()].sort((a, b) => (a.supervisorName ?? 'ZZZ').localeCompare(b.supervisorName ?? 'ZZZ') || (a.supervisorCode ?? '').localeCompare(b.supervisorCode ?? '') || b.realized - a.realized || a.label.localeCompare(b.label));
  const dailyRows = [...dailyMap.values()].map(row => ({ date: row.date, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), invoicedPositivation: row.invoicedPositivation.size, totalPositivation: row.totalPositivation.size })).sort((a, b) => a.date.localeCompare(b.date));
  const networkTopTargets = new Map<string, number>();
  for (const customer of listRecords(m2)) { const network = text(customer.canonical_network) ?? text(customer.premise_network) ?? text(customer.top_network); if (network) networkTopTargets.set(network, (networkTopTargets.get(network) ?? 0) + amount(customer.top_target)); }
  const networkRows = [...networkMap.values()].map(row => { const topTarget = round(networkTopTargets.get(row.network) ?? 0) || null; return { ...row, topTarget, customers: positiveByNetwork.get(row.network)?.size ?? 0, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), share: finalTotals.realized > 0 ? row.realized / finalTotals.realized : 0 }; }).sort((a, b) => b.realized - a.realized || a.network.localeCompare(b.network));
  const lines = new Map<string, SellOutLineRow>();
  for (const sale of sales) { const bucket = orderBucket(sale); if (bucket === 'UNKNOWN') continue; const item = items.byId.get(text(sale.item_canonical_id) ?? '') ?? items.byWinthor.get(text(sale.winthor_product_code) ?? ''); const resolvedLine = text(item?.category_master) ?? text(item?.category) ?? text(item?.segment); const line = resolvedLine ?? 'PENDENTE / NÃO CLASSIFICADO'; const row = addTo(lines, line, () => ({ line, invoiced: 0, toInvoice: 0, realized: 0, share: 0, resolutionStatus: resolvedLine ? 'CLASSIFIED' : 'UNCLASSIFIED' })); const value = amount(sale.value); row.realized += value; if (bucket === 'TO_INVOICE') row.toInvoice += value; else row.invoiced += value; }
  const salesByLine: SellOutLineRow[] = [...lines.values()].map(row => ({ ...row, invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), share: finalTotals.realized > 0 ? row.realized / finalTotals.realized : 0 })).sort((a, b) => b.realized - a.realized || a.line.localeCompare(b.line));
  const mappedNetworkValue = round(networkRows.reduce((sum, row) => sum + row.realized, 0));
  const audits: ViewAudit[] = [];
  const unknownStatuses = allSales.filter(sale => orderBucket(sale) === 'UNKNOWN');
  const invalidDates = sales.filter(sale => orderBucket(sale) !== 'UNKNOWN' && !validSellOutDate(sale.event_date));
  if (competence === 'MIXED') audits.push({ code: 'MIXED_COMPETENCE', count: allSales.length, message: 'O 8022 contém movimentos de mais de uma competência.', action: 'Importar um relatório mensal coerente; o Sell Out foi bloqueado para evitar soma entre meses.' });
  if (unknownStatuses.length) audits.push({ code: 'UNKNOWN_SALE_STATUS', count: unknownStatuses.length, message: `${unknownStatuses.length} linha(s) possuem status vazio ou desconhecido, no valor de ${round(unknownStatuses.reduce((sum, sale) => sum + amount(sale.value), 0))}.`, action: 'Corrigir o status na fonte 8022; essas linhas não foram classificadas como faturadas.' });
  if (invalidDates.length) audits.push({ code: 'INVALID_SALE_DATE', count: invalidDates.length, message: `${invalidDates.length} linha(s) de ${new Set(invalidDates.map(canonicalCustomerKey).filter(Boolean)).size} cliente(s) não possuem data válida, no valor de ${round(invalidDates.reduce((sum, sale) => sum + amount(sale.value), 0))}.`, action: 'Corrigir a data no 8022; o valor permanece no total financeiro e fica auditado fora do calendário.' });
  const mismatchedTargets = listRecords(m3).filter(fact => fact.fact_type === 'TARGET' && fact.competence && fact.competence !== competence);
  if (mismatchedTargets.length) audits.push({ code: 'TARGET_COMPETENCE_MISMATCH', count: mismatchedTargets.length, message: 'A competência das metas da Bússola diverge do 8022 ativo.', action: 'Atualizar Bússola/8022 para a mesma competência antes de usar o Gerencial.' });
  if (/^\d{4}-\d{2}$/.test(m2.competence) && m2.competence !== competence) audits.push({ code: 'M2_COMPETENCE_MISMATCH', count: 1, message: `M2 ${m2.competence} e Sell Out ${competence} não representam a mesma competência.`, action: 'Reprocessar clientes, RCA e Roteiro Top junto do 8022 correto.' });
  if (unresolvedRcaCodes.size) audits.push({ code: 'UNRESOLVED_RCA_IN_VIEW', count: unresolvedRcaCodes.size, message: `${unresolvedRcaCodes.size} códigos de RCA presentes em SALE não possuem rca_canonical_id no bundle ativo.`, action: 'Corrigir o relacionamento RCA no próximo build canônico; a visão não aplica fallback.' });
  if (!targets.length) audits.push({ code: 'MISSING_TARGET', count: 1, message: 'Não há TARGET no M3 ativo.', action: 'Homologar um novo build com metas materializadas.' });
  const vendorTotal = round(vendorRows.reduce((sum, row) => sum + row.realized, 0));
  const dailyTotal = round(dailyRows.reduce((sum, row) => sum + row.realized, 0));
  const invalidDateValue = round(invalidDates.reduce((sum, sale) => sum + amount(sale.value), 0));
  const reconciliation = { vendorsEqualTotal: vendorTotal === finalTotals.realized, dailyEqualTotal: round(dailyTotal + invalidDateValue) === finalTotals.realized, networksEqualMappedUniverse: mappedNetworkValue <= finalTotals.realized, mappedNetworkValue };
  if (!reconciliation.vendorsEqualTotal || !reconciliation.dailyEqualTotal) audits.push({ code: 'VIEW_RECONCILIATION_FAILED', count: 1, message: 'Uma agregação de Sell Out divergiu do total do mesmo universo.', action: 'Revisar o view-model antes de utilizar a visão.' });
  const rcaDiagnostics: RcaDiagnostic[] = [];
  for (const row of vendorRows.filter(row => row.resolutionStatus === 'UNRESOLVED' && (row.realized !== 0 || row.salesTarget > 0 || row.positivityTarget > 0))) rcaDiagnostics.push({ kind: 'NOVOS RCAS', code: row.rawRcaCode ?? 'SEM_RCA', rca: row.rcaName, supervisor: row.supervisorName, reason: row.realized !== 0 ? 'Venda no 8022 sem RCA atual resolvido' : 'Meta ativa na Bússola sem RCA canônico', salesTarget: row.salesTarget, positivityTarget: row.positivityTarget, saleLines: sales.filter(sale => !text(sale.rca_canonical_id) && (text(sale.transaction_rca_code) ?? 'SEM_RCA') === (row.rawRcaCode ?? 'SEM_RCA')).length, realized: row.realized, action: 'Atualizar NOVOS RCAS', samples: [] });
  const targetIds = new Set(targets.filter(target => amount(target.sales_target) > 0 || amount(target.positivity_target) > 0).map(target => text(target.rca_canonical_id)).filter(Boolean));
  for (const [id, meta] of rcaMetadata) if (!targetIds.has(id)) rcaDiagnostics.push({ kind: 'BÚSSOLA', code: meta.rcaCurrentCode ?? id.replace(/^RCA:/, ''), rca: meta.rcaName, supervisor: meta.supervisorName, reason: 'RCA ativo em NOVOS RCAS sem meta positiva na Bússola', salesTarget: 0, positivityTarget: 0, saleLines: 0, realized: vendorRows.find(row => row.rcaCanonicalId === id)?.realized ?? 0, action: 'Atualizar Bússola', samples: [] });
  const supervisorMap = new Map<string, SupervisorSummary>();
  for (const row of vendorRows) { const key = row.supervisorCode ?? row.supervisorName ?? 'SEM_SUPERVISOR'; const summary = supervisorMap.get(key) ?? { key, code: row.supervisorCode, name: row.supervisorName, rcaCount: 0, salesTarget: 0, invoiced: 0, toInvoice: 0, realized: 0, gap: 0, achievement: null, positivityTarget: 0, positiveCustomers: 0, positivityAchievement: null }; summary.rcaCount += 1; summary.salesTarget += row.salesTarget; summary.invoiced += row.invoiced; summary.toInvoice += row.toInvoice; summary.realized += row.realized; summary.positivityTarget += row.positivityTarget; summary.positiveCustomers += row.positiveCustomers; supervisorMap.set(key, summary); }
  const supervisorRows = [...supervisorMap.values()].map(row => ({ ...row, salesTarget: round(row.salesTarget), invoiced: round(row.invoiced), toInvoice: round(row.toInvoice), realized: round(row.realized), gap: round(row.salesTarget - row.realized), achievement: row.salesTarget > 0 ? row.realized / row.salesTarget : null, positivityAchievement: row.positivityTarget > 0 ? row.positiveCustomers / row.positivityTarget : null })).sort((a, b) => (a.name ?? 'ZZZ').localeCompare(b.name ?? 'ZZZ'));
  return { motorBuildId: APPROVED_CANONICAL_BUILD.motorBuildId, stagingManifestHash: APPROVED_CANONICAL_BUILD.stagingManifestHash, generatedAt, competence, sourceFacts: { sales: sales.length, targets: targets.length }, totals: finalTotals, vendorRows, dailyRows, networkRows, salesByLine, stock: stockSummary(m1), rcaDiagnostics, supervisorRows, audits, reconciliation };
}

export type TopNetworksViewModel = Pick<SellOutViewModel, 'motorBuildId' | 'stagingManifestHash' | 'generatedAt' | 'competence' | 'audits'> & { rows: NetworkRow[]; storeRows: StoreRow[]; teamRows: SellOutRow[]; totals: { networks: number; customers: number; realized: number; invoiced: number; toInvoice: number; networkTarget: number | null }; reconciliation: { rowsEqualTotal: boolean; mappedUniverseValue: number } };
