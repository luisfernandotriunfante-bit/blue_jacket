import * as XLSX from 'xlsx';
import {
  EMPTY_CANONICAL_SUPPORT,
  type CanonicalState,
  type CanonicalSupportData,
  type ManualConfiguration,
  type SourceAudit,
  type SourceKind,
} from '../../domain/canonical';
import type { CustomerIntelligenceSupport } from '../../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../../domain/customerIntelligenceTypes';
import {
  EMPTY_UNIFIED_DATA_LAYER,
  type DataQualityIssue,
  type SourceSnapshotMetadata,
  type TargetFactRecord,
  type UnifiedDataLayer,
  type UnifiedSalesRecord,
} from '../../domain/unified';
import { classifyLine, normalizeText, sheetRows, toIsoDate } from '../canonical/utils';
import type { Row } from '../canonical/runtime';
import type { OperationalSourceState } from '../operationalSources';
import { processCustomerIntelligenceFiles } from '../customerIntelligenceRepository';
import { runItemMotor } from './itemMotor';
import { runCustomerMotor } from './customerMotor';
import { runSalesMotor } from './salesMotor';
import {
  aggregateHistoricalCustomerProduct,
  applyHistoricalIdentity,
  buildLegacyProductMap,
  parseHistorical379Transactions,
  parseHistoricalReceipts12322,
} from './historicalMotor';
import { projectCanonicalFromUnified } from './calculationService';
import { buildCanonicalReconciliation } from './reconciliationService';

export interface UnifiedCanonicalState extends CanonicalState {
  unifiedSchemaVersion: 1;
  unified: UnifiedDataLayer;
  customerIntelligenceSupport: CustomerIntelligenceSupport;
}

export function isUnifiedCanonicalState(value: CanonicalState | null | undefined): value is UnifiedCanonicalState {
  return Boolean(value && (value as UnifiedCanonicalState).unifiedSchemaVersion === 1 && (value as UnifiedCanonicalState).unified?.schemaVersion === 1);
}

const name = (file: File) => normalizeText(file.name);
const has = (file: File, token: string) => name(file).includes(normalizeText(token));
const is8022 = (file: File) => has(file, '8022');
const is286 = (file: File) => has(file, '286') || has(file, 'CADASTRO ITENS');
const is105 = (file: File) => has(file, '105') || has(file, 'POSICAO ESTOQUE');
const is8013 = (file: File) => has(file, '8013');
const is218 = (file: File) => /(^|\D)218(\D|$)/.test(name(file)) || has(file, 'ENTRADA NOTAS');
const isPctabpr = (file: File) => has(file, 'PCTABPR');
const isPriceList = (file: File) => !isPctabpr(file) && (has(file, 'LISTA DE PRECO') || has(file, 'LISTA PRECO') || (has(file, 'COLGATE') && (has(file, 'PRECO') || has(file, 'TABELA OFICIAL'))));
const isLaunchList = (file: File) => has(file, 'LANCAMENTO') && !has(file, 'SORTIMENTO');
const isPremises = (file: File) => has(file, 'PREMISSAS');
const isRca = (file: File) => has(file, 'NOVOS RCAS') || has(file, 'DE PARA') || has(file, 'DE-PARA');
const isCustomerPortfolio = (file: File) => has(file, 'CARTEIRA') && has(file, 'CLIENT');
const isRoute = (file: File) => has(file, 'ROTEIRO');
const isInboundPortfolio = (file: File) => has(file, 'CARTEIRA') && !has(file, 'CLIENT');
const isCompass = (file: File) => has(file, 'BUSSOLA');
const is379 = (file: File) => has(file, '379');
const is12322 = (file: File) => has(file, '12.322') || has(file, '12322');
const is310 = (file: File) => /(^|\D)310(\D|$)/.test(name(file));
const isAssortment = (file: File) => has(file, 'SORTIMENTO') && !has(file, '310');
const isCustomerIntelligenceFile = (file: File) => is310(file) || isAssortment(file) || isPremises(file);

function sourceType(file: File): string {
  if (is8022(file)) return '8022';
  if (is286(file)) return '286';
  if (is105(file)) return '105';
  if (is8013(file)) return '8013';
  if (is218(file)) return '218';
  if (isPctabpr(file)) return 'PCTABPR';
  if (isPriceList(file)) return 'LISTA_PRECO_COLGATE';
  if (isLaunchList(file)) return 'LANCAMENTOS';
  if (isPremises(file)) return 'PREMISSAS';
  if (isRca(file)) return 'NOVOS_RCAS';
  if (isCustomerPortfolio(file)) return 'CARTEIRA_CLIENTES';
  if (isRoute(file)) return 'ROTEIRO_TOP';
  if (isInboundPortfolio(file)) return 'CARTEIRA_COLGATE';
  if (isCompass(file)) return 'BUSSOLA';
  if (is379(file)) return '379';
  if (is12322(file)) return '12.322';
  if (is310(file)) return '310';
  if (isAssortment(file)) return 'SORTIMENTO_OFICIAL';
  return 'OUTRA';
}

class FileCache {
  private buffers = new Map<File, ArrayBuffer>();
  private workbooks = new Map<File, XLSX.WorkBook>();
  private texts = new Map<File, string>();

  async buffer(file: File) {
    let value = this.buffers.get(file);
    if (!value) {
      value = await file.arrayBuffer();
      this.buffers.set(file, value);
    }
    return value;
  }

  async workbook(file: File) {
    let value = this.workbooks.get(file);
    if (!value) {
      value = XLSX.read(await this.buffer(file), { type: 'array', cellDates: true });
      this.workbooks.set(file, value);
    }
    return value;
  }

  async text(file: File) {
    let value = this.texts.get(file);
    if (value === undefined) {
      value = await file.text();
      this.texts.set(file, value);
    }
    return value;
  }

  async rows(file: File): Promise<Row[]> {
    const workbook = await this.workbook(file);
    return sheetRows(workbook, workbook.SheetNames[0]);
  }
}

export function looksLikeIndustryPriceListRows(rows: Row[]) {
  return rows.slice(0, 40).some(row => {
    const header = row.map(value => normalizeText(value).replace(/[^A-Z0-9]/g, ''));
    return header.includes('SKU') && header.includes('EAN') && header.some(value => value.includes('UN') && value.includes('CX'));
  });
}

function simpleHash(buffer: ArrayBuffer) {
  let hash = 2166136261;
  for (const byte of new Uint8Array(buffer)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function metadata(file: File, cache: FileCache, referenceDate: string): Promise<SourceSnapshotMetadata> {
  let recordCount = 0;
  let schemaSignature = '';
  try {
    if (/\.txt$/i.test(file.name)) {
      const lines = (await cache.text(file)).split(/\r\n|\n|\r/g);
      recordCount = lines.length;
      schemaSignature = normalizeText(lines.find(line => line.trim()) || '').slice(0, 160);
    } else {
      const workbook = await cache.workbook(file);
      const rows = sheetRows(workbook, workbook.SheetNames[0]);
      recordCount = rows.length;
      schemaSignature = rows.slice(0, 15).map(row => row.map(normalizeText).filter(Boolean).join('|')).find(Boolean)?.slice(0, 240) || '';
    }
  } catch {
    // Metadata nunca substitui a validação do parser proprietário.
  }
  return {
    sourceType: sourceType(file),
    sourceName: file.name,
    competence: referenceDate.slice(0, 7),
    referenceDate,
    version: String(file.lastModified || ''),
    schemaSignature,
    loadedAt: new Date().toISOString(),
    recordCount,
    fileHash: simpleHash(await cache.buffer(file)),
  };
}

function mergeCustomers<T extends { cnpj: string }>(previous: T[], next: T[]): T[] {
  if (!next.length) return previous;
  const map = new Map(previous.map(row => [row.cnpj, row]));
  next.forEach(row => map.set(row.cnpj, map.has(row.cnpj) ? { ...map.get(row.cnpj)!, ...row } : row));
  return Array.from(map.values());
}

function latestSource<T extends { source: string }>(previous: T[], next: T[], source: string) {
  return next.length ? [...previous.filter(row => row.source !== source), ...next] : previous;
}

function updateHistoryByYear(previous: UnifiedDataLayer['historicalSalesFacts'], next: UnifiedDataLayer['historicalSalesFacts'], year: number) {
  return next.length ? [...previous.filter(row => row.sourceYear !== year), ...next] : previous;
}

function remapTargets(previous: TargetFactRecord[], rcas: UnifiedDataLayer['rcas']): TargetFactRecord[] {
  const byLegacy = new Map(rcas.filter(row => row.legacyRcaCode).map(row => [row.legacyRcaCode, row]));
  return previous.map(row => {
    const rca = byLegacy.get(row.legacyRcaCode);
    return { ...row, rcaCanonicalId: rca?.rcaCanonicalId || '', assignmentStatus: rca ? 'RESOLVED' : 'UNRESOLVED_RCA' };
  });
}

function reconcileInbound(previous: UnifiedDataLayer['inboundOrders'], receipts: UnifiedDataLayer['receiptItems'], headers: UnifiedDataLayer['receiptHeaders']) {
  const headerById = new Map(headers.map(header => [header.receiptId, header]));
  const received = new Map<string, number>();
  receipts.forEach(item => {
    const header = headerById.get(item.receiptId);
    if (!header?.invoiceNormalized || !item.itemCanonicalId) return;
    const key = `${header.invoiceNormalized}|${item.itemCanonicalId}`;
    received.set(key, (received.get(key) || 0) + item.receivedUnits);
  });
  return previous.map(row => {
    if (!row.invoiceNormalized || !row.itemCanonicalId) return row;
    const units = received.get(`${row.invoiceNormalized}|${row.itemCanonicalId}`) || 0;
    const remaining = row.pipelineUnits === null ? null : Math.max(row.pipelineUnits - units, 0);
    let status = row.inboundStatus;
    if (units > 0 && row.pipelineUnits !== null) status = units >= row.pipelineUnits ? 'RECEIVED_BY_MILENIO' : 'PARTIALLY_RECEIVED';
    else if (row.billQtyCases > 0) status = 'BILLED_BY_COLGATE_IN_TRANSIT';
    else if (row.orderQtyCases > 0) status = 'ORDERED_FROM_COLGATE';
    return { ...row, receivedUnits: units, remainingInTransitUnits: remaining, inboundStatus: status };
  });
}

function unifiedSales(layer: UnifiedDataLayer): UnifiedSalesRecord[] {
  const historical: UnifiedSalesRecord[] = layer.historicalSalesFacts
    .filter(row => row.movementClass === 'SALE' || row.movementClass === 'RETURN')
    .map(row => ({
      unifiedSalesId: `H:${row.historicalSalesFactId}`,
      movementDate: row.movementDate,
      itemCanonicalId: row.itemCanonicalId,
      customerCanonicalId: row.customerCanonicalId,
      rcaCanonicalId: row.rcaCanonicalId,
      units: row.signedQuantity,
      value: row.signedValue,
      movementClass: row.movementClass === 'SALE' ? 'SALE' : 'RETURN',
      invoiceNumber: row.invoiceNumber,
      sourceSystem: 'LEGACY',
      sourceFile: `379 ${row.sourceYear}`,
    }));
  const current: UnifiedSalesRecord[] = layer.salesFacts.map(row => ({
    unifiedSalesId: `C:${row.salesFactId}`,
    movementDate: row.movementDate,
    itemCanonicalId: row.itemCanonicalId,
    customerCanonicalId: row.customerCanonicalId,
    rcaCanonicalId: row.rcaCanonicalId,
    units: row.units,
    value: row.value,
    movementClass: row.salesStatus === 'A FATURAR' ? 'TO_INVOICE' : 'SALE',
    invoiceNumber: row.invoiceNumber,
    sourceSystem: 'WINTHOR',
    sourceFile: '8022',
  }));
  return [...historical, ...current].sort((left, right) => left.movementDate.localeCompare(right.movementDate));
}

function reconcile310(layer: UnifiedDataLayer, support: CustomerIntelligenceSupport): DataQualityIssue[] {
  if (!support.purchases.length || !layer.historicalCustomerProduct.length) return [];
  const aggregate = new Map(layer.historicalCustomerProduct.map(row => [`${row.cnpj}:${row.legacyProductCode}`, row]));
  const issues: DataQualityIssue[] = [];
  for (const purchase of support.purchases) {
    const legacy = purchase.legacyProductCode || purchase.winthorCode;
    const row = aggregate.get(`${purchase.cnpj}:${legacy}`);
    if (!row) {
      issues.push({ id: `310_MISSING:${purchase.cnpj}:${legacy}`, domain: 'HISTORY', severity: 'ERROR', code: 'HISTORICAL_310_RECONCILIATION_FAILURE', message: 'Combinação CNPJ × produto do 310 não foi reproduzida pelo 379.', source: '310 × 379', entityKey: `${purchase.cnpj}:${legacy}` });
      continue;
    }
    const valueDiff = Math.abs(row.netSalesValue - purchase.netValue);
    const returnValueDiff = Math.abs(row.returnValue - purchase.returnValue);
    const saleUnitsDiff = Math.abs(Math.abs(row.netSignedUnits) - purchase.volumes);
    const returnUnitsDiff = Math.abs(row.returnUnits - purchase.returnVolume);
    const invoiceDiff = Math.abs(row.purchaseInvoiceCount - purchase.quantity);
    if (valueDiff > .02 || returnValueDiff > .02 || saleUnitsDiff > .001 || returnUnitsDiff > .001 || invoiceDiff > .001) {
      issues.push({
        id: `310_DIFF:${purchase.cnpj}:${legacy}`,
        domain: 'HISTORY',
        severity: 'ERROR',
        code: 'HISTORICAL_310_RECONCILIATION_FAILURE',
        message: '310 diverge da reconstrução 379 em valor, devolução, volumes ou quantidade de compras.',
        source: '310 × 379',
        entityKey: `${purchase.cnpj}:${legacy}`,
        details: {
          value310: purchase.netValue,
          value379: row.netSalesValue,
          returnValue310: purchase.returnValue,
          returnValue379: row.returnValue,
          volumes310: purchase.volumes,
          volumes379: Math.abs(row.netSignedUnits),
          returnVolume310: purchase.returnVolume,
          returnVolume379: row.returnUnits,
          purchases310: purchase.quantity,
          purchaseInvoices379: row.purchaseInvoiceCount,
        },
      });
    }
  }
  return issues;
}

function referenceDateFrom8022(rows: Row[], fallback: string) {
  const headerIndex = rows.findIndex(row => row.map(normalizeText).includes('DATA MOVIMENTO'));
  if (headerIndex < 0) return fallback;
  const header = rows[headerIndex].map(normalizeText);
  const dateColumn = header.indexOf('DATA MOVIMENTO');
  const dates = rows.slice(headerIndex + 1).map(row => toIsoDate(row[dateColumn])).filter(Boolean).sort();
  return dates.at(-1) || fallback;
}

function period(referenceDate: string) {
  const year = Number(referenceDate.slice(0, 4));
  const month = Number(referenceDate.slice(5, 7));
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

function businessDays(start: string, end: string, holidays: string[]) {
  const holidaySet = new Set(holidays || []);
  const cursor = new Date(`${start}T12:00:00Z`);
  const limit = new Date(`${end}T12:00:00Z`);
  let count = 0;
  while (cursor <= limit) {
    const day = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function blankCanonical(referenceDate: string, config: ManualConfiguration, previous: CanonicalState | null): CanonicalState {
  const bounds = period(referenceDate);
  const elapsedEnd = referenceDate < bounds.end ? referenceDate : bounds.end;
  const totalDays = businessDays(bounds.start, bounds.end, config.holidays);
  const elapsedDays = businessDays(bounds.start, elapsedEnd, config.holidays);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    referenceDate,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    sources: [],
    support: { ...EMPTY_CANONICAL_SUPPORT },
    transactions: [],
    inventory: [],
    daily: [],
    history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: null, average3MonthKeys: [] },
    industryTarget: 0,
    industryPositivityTarget: 0,
    sellOut: {
      invoiced: 0,
      toInvoice: 0,
      total: 0,
      sellOutTarget: config.sellOutTarget > 0 ? config.sellOutTarget : previous?.sellOut.sellOutTarget || 0,
      attainment: 0,
      invoicedPositivation: 0,
      futurePositivation: 0,
      totalPositivation: 0,
      industryPositivityTarget: 0,
      positivityAttainment: 0,
      ticketAverage: 0,
      businessDaysTotal: totalDays,
      businessDaysElapsed: elapsedDays,
      businessDaysRemaining: Math.max(totalDays - elapsedDays, 0),
      invoicedDailyAverage: 0,
      totalDailyAverage: 0,
      neededDailyAverage: 0,
      invoicedTrend: 0,
      totalTrend: 0,
    },
    stock: {
      costValue: 0,
      saleValue: 0,
      pendingPurchaseCost: 0,
      pendingPurchaseSale: 0,
      projectedCostValue: 0,
      projectedSaleValue: 0,
      physicalUnits: 0,
      physicalCases: 0,
      grossKg: 0,
      coverageCurrentDays: 0,
      coverageProjectedDays: 0,
      coverageCostCurrentDays: 0,
      coverageCostProjectedDays: 0,
      coverageTargetDays: config.coverageTargetDays,
    },
    vendors: [],
    coordinators: [],
    clients: [],
    networks: [],
    lines: [],
    warnings: [],
  };
}

function sourceKind(metadata: SourceSnapshotMetadata): SourceKind | null {
  switch (metadata.sourceType) {
    case '8022': return 'sales8022';
    case '105': return 'stock105';
    case '8013': return 'stock8013';
    case '286': return 'items286';
    case 'CARTEIRA_COLGATE': return 'purchasePortfolio';
    case 'NOVOS_RCAS': return 'rcaMap';
    case 'LISTA_PRECO_COLGATE': return 'priceList';
    case 'LANCAMENTOS': return 'launchList';
    case 'PREMISSAS': return 'premises';
    case 'BUSSOLA': return 'compassTargets';
    case 'ROTEIRO_TOP': return 'activeRoute';
    case '379': return /2025|\b25\b/.test(metadata.sourceName) ? 'history379_2025' : 'history379_2026';
    default: return null;
  }
}

function sourceAudits(layer: UnifiedDataLayer): SourceAudit[] {
  return layer.sources.flatMap(meta => {
    const kind = sourceKind(meta);
    return kind ? [{ kind, fileName: meta.sourceName, loaded: true, rows: meta.recordCount, updatedAt: meta.loadedAt, fileModifiedAt: meta.version, note: `Base unificada · ${meta.sourceType}` }] : [];
  });
}

function supportFromUnified(layer: UnifiedDataLayer): CanonicalSupportData {
  const rcaById = new Map(layer.rcas.map(row => [row.rcaCanonicalId, row]));
  const customerByCnpj = new Map(layer.customers.map(row => [row.cnpj, row]));
  const topCnpjs = new Set(layer.topRetailerSnapshots.map(row => row.cnpj));
  const latestClassification = new Map<string, UnifiedDataLayer['customerClassifications'][number]>();
  [...layer.customerClassifications].sort((a, b) => a.competence.localeCompare(b.competence)).forEach(row => latestClassification.set(row.cnpj, row));
  return {
    ...EMPTY_CANONICAL_SUPPORT,
    rcas: layer.rcas.map(row => ({ newCode: row.currentRcaCode, oldCode: row.legacyRcaCode, name: row.rcaName, coordinatorCode: row.coordinatorCode, coordinatorName: row.coordinatorName })),
    vendorTargets: layer.targets.map(row => {
      const rca = rcaById.get(row.rcaCanonicalId);
      return { oldCode: row.legacyRcaCode, name: rca?.rcaName || '', supervisorName: rca?.coordinatorName || '', salesTarget: row.salesTarget, positivityTarget: row.positivityTarget };
    }),
    clients: Array.from(latestClassification.values()).map(row => {
      const customer = customerByCnpj.get(row.cnpj);
      return { cnpj: row.cnpj, cnpjRaw: customer?.cnpjRaw || row.cnpj, cnpjNormalizationStatus: customer?.cnpjNormalizationStatus || undefined, name: customer?.customerName || '', city: customer?.city || row.premiseCity, network: row.premiseNetwork, profile: row.profile, isTop: topCnpjs.has(row.cnpj) };
    }),
    activeRoute: layer.topRetailerSnapshots.map(row => ({ cnpj: row.cnpj, cnpjRaw: customerByCnpj.get(row.cnpj)?.cnpjRaw || row.cnpj, name: row.storeName, fantasyName: row.topTradeName, city: row.topCity, networkRaw: row.topRetailerNetwork, managerCnpj: row.managerCnpj, groupingCode: row.groupCode, tier: '', storeType: row.storeType, target: row.target })),
    products: layer.items.map(item => ({ sku: item.industrySku || item.manufacturerCode, ean: item.industryEan || item.internalEan, description: item.industryDescription || item.internalDescription, category: '', subcategory: '', brand: '', isLaunch: item.isLaunch, boxPrice: 0, unitPrice: item.salePricePvenDa1 || 0, unitsPerCase: item.industryUnitsPerCase || item.internalUnitsPerCase || 0, line: classifyLine(item.internalDescription || item.industryDescription, item.manufacturerCode || item.industrySku) })),
    itemCodes: layer.items.filter(item => item.winthorCode).map(item => ({ internalCode: item.winthorCode, description: item.internalDescription || item.industryDescription, ean: item.internalEan || item.industryEan, factoryCode: item.manufacturerCode || item.industrySku })),
  };
}

export async function processUnifiedFiles(input: {
  allFiles: File[];
  engineFiles: File[];
  operational: OperationalSourceState;
  config: ManualConfiguration;
  previous: CanonicalState | null;
  continuityWarning?: string;
}): Promise<{ canonical: UnifiedCanonicalState; sellOut: null }> {
  void input.engineFiles; // Mantido apenas para compatibilidade da chamada; não alimenta nenhum motor antigo.
  const previousUnified = isUnifiedCanonicalState(input.previous) ? input.previous.unified : EMPTY_UNIFIED_DATA_LAYER;
  const previousCi = isUnifiedCanonicalState(input.previous) ? input.previous.customerIntelligenceSupport : EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  const cache = new FileCache();
  const find = (predicate: (file: File) => boolean) => input.allFiles.find(predicate);
  const rows = async (predicate: (file: File) => boolean) => {
    const file = find(predicate);
    return file ? cache.rows(file) : Promise.resolve([] as Row[]);
  };
  const workbook = async (predicate: (file: File) => boolean) => {
    const file = find(predicate);
    return file ? cache.workbook(file) : Promise.resolve(null);
  };

  let priceListFile = find(isPriceList);
  if (!priceListFile) {
    for (const file of input.allFiles) {
      if (/\.txt$/i.test(file.name) || isPctabpr(file) || isLaunchList(file)) continue;
      try {
        const candidate = await cache.rows(file);
        if (looksLikeIndustryPriceListRows(candidate)) { priceListFile = file; break; }
      } catch {
        // A validação proprietária continua responsável por arquivos reconhecidos por outra fonte.
      }
    }
  }

  const recognized = input.allFiles.some(file => sourceType(file) !== 'OUTRA') || Boolean(priceListFile);
  if (!recognized && !input.previous) throw new Error('Nenhuma fonte reconhecida foi encontrada para iniciar a base canônica unificada.');

  const salesRows = await rows(is8022);
  const fallbackDate = input.previous?.referenceDate || new Date().toISOString().slice(0, 10);
  const referenceDate = salesRows.length ? referenceDateFrom8022(salesRows, fallbackDate) : fallbackDate;
  const generatedAt = new Date().toISOString();

  const itemResult = runItemMotor({
    normalized286Rows: await rows(is286),
    stock105Rows: await rows(is105),
    stock8013Rows: await rows(is8013),
    priceListRows: priceListFile ? await cache.rows(priceListFile) : [],
    launchRows: await rows(isLaunchList),
    pctabprWorkbook: await workbook(isPctabpr),
    previousItems: previousUnified.items,
  });
  const items = itemResult.items;

  const customerResult = runCustomerMotor({
    premisesRows: await rows(isPremises),
    rcaRows: await rows(isRca),
    customerPortfolioRows: await rows(isCustomerPortfolio),
    routeWorkbook: await workbook(isRoute),
    routeCompetence: referenceDate.slice(0, 7),
    salesRows,
    snapshotDate: referenceDate,
  });
  const rcas = find(isRca) ? customerResult.rcas : previousUnified.rcas.length ? previousUnified.rcas : customerResult.rcas;
  const customers = mergeCustomers(previousUnified.customers, customerResult.customers);
  const classifications = find(isPremises) ? latestSource(previousUnified.customerClassifications, customerResult.classifications, 'PREMISSAS') : previousUnified.customerClassifications;
  const relations = find(isCustomerPortfolio) ? latestSource(previousUnified.customerRcaRelations, customerResult.relations, 'CARTEIRA_CLIENTES') : previousUnified.customerRcaRelations;
  const topRetailers = find(isRoute) ? latestSource(previousUnified.topRetailerSnapshots, customerResult.topRetailers, 'ROTEIRO_ATIVO') : previousUnified.topRetailerSnapshots;

  const salesResult = runSalesMotor({
    salesRows,
    portfolioRows: await rows(isInboundPortfolio),
    items,
    rcas,
    compassWorkbook: await workbook(isCompass),
    operational: input.operational,
    referenceDate,
  });
  const salesFacts = find(is8022) ? salesResult.salesFacts : previousUnified.salesFacts;
  const targets = find(isCompass) ? salesResult.targets : find(isRca) ? remapTargets(previousUnified.targets, rcas) : previousUnified.targets;
  const has218 = Boolean(find(is218));
  const receiptHeaders = has218 ? salesResult.receiptHeaders : previousUnified.receiptHeaders;
  const receiptItems = has218 ? salesResult.receiptItems : previousUnified.receiptItems;
  let inboundOrders = find(isInboundPortfolio) ? salesResult.inboundOrders : previousUnified.inboundOrders;
  if (has218 && !find(isInboundPortfolio)) inboundOrders = reconcileInbound(inboundOrders, receiptItems, receiptHeaders);

  let historicalFacts = previousUnified.historicalSalesFacts;
  const historyIssues: DataQualityIssue[] = [];
  for (const file of input.allFiles.filter(is379)) {
    const text = await cache.text(file);
    const match = text.match(/Vendas[^\n]*?(20\d{2})/i) || file.name.match(/(20)?(25|26)/);
    const year = match ? Number(match[1] && match[1].length === 4 ? match[1] : `20${match[2]}`) : 0;
    if (!year) continue;
    const parsed = parseHistorical379Transactions(text, year);
    historicalFacts = updateHistoryByYear(historicalFacts, parsed.facts, year);
    historyIssues.push(...parsed.qualityIssues);
  }
  const itemByGtin = new Map<string, string>();
  items.forEach(item => [item.internalEan, item.industryEan, item.industryDun14].filter(Boolean).forEach(gtin => itemByGtin.set(gtin, item.itemCanonicalId)));
  const legacyProductMap = buildLegacyProductMap(historicalFacts, itemByGtin);
  const rcaByLegacy = new Map(rcas.filter(row => row.legacyRcaCode).map(row => [row.legacyRcaCode, row.rcaCanonicalId]));
  historicalFacts = applyHistoricalIdentity(historicalFacts, legacyProductMap, rcaByLegacy);
  const historicalCustomerProduct = aggregateHistoricalCustomerProduct(historicalFacts, 'YTD');
  let historicalReceipts = previousUnified.historicalReceipts;
  const file12322 = find(is12322);
  if (file12322) historicalReceipts = parseHistoricalReceipts12322(await cache.text(file12322));

  const ciFiles = input.allFiles.filter(isCustomerIntelligenceFile);
  const customerIntelligenceSupport = ciFiles.length ? await processCustomerIntelligenceFiles(ciFiles, previousCi) : previousCi;
  const sourceMetadata = await Promise.all(input.allFiles.map(async file => {
    const meta = await metadata(file, cache, referenceDate);
    return file === priceListFile ? { ...meta, sourceType: 'LISTA_PRECO_COLGATE' } : meta;
  }));
  const types = new Set(sourceMetadata.map(row => row.sourceType));
  const sources = [...previousUnified.sources.filter(row => !types.has(row.sourceType)), ...sourceMetadata];

  const layer: UnifiedDataLayer = {
    schemaVersion: 1,
    generatedAt,
    sources,
    qualityIssues: [],
    items,
    customers,
    customerClassifications: classifications,
    rcas,
    customerRcaRelations: relations,
    topRetailerSnapshots: topRetailers,
    salesFacts,
    inboundOrders,
    receiptHeaders,
    receiptItems,
    targets,
    historicalSalesFacts: historicalFacts,
    legacyProductMap,
    historicalCustomerProduct,
    historicalReceipts,
    unifiedSales: [],
  };
  layer.unifiedSales = unifiedSales(layer);
  layer.qualityIssues = [...itemResult.qualityIssues, ...customerResult.qualityIssues, ...salesResult.qualityIssues, ...historyIssues, ...reconcile310(layer, customerIntelligenceSupport)];

  const shell = blankCanonical(referenceDate, input.config, input.previous);
  shell.sources = sourceAudits(layer);
  shell.support = supportFromUnified(layer);
  let projected = projectCanonicalFromUnified(shell, layer, input.config);
  projected = { ...projected, reconciliation: buildCanonicalReconciliation(projected, layer, customerIntelligenceSupport) };
  if (input.continuityWarning) projected = { ...projected, warnings: [...projected.warnings.filter(warning => !warning.startsWith('Carteira comparável:')), input.continuityWarning] };
  const canonical = { ...projected, unifiedSchemaVersion: 1 as const, unified: layer, customerIntelligenceSupport } as UnifiedCanonicalState;
  return { canonical, sellOut: null };
}
