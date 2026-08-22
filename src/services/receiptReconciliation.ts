import type { CanonicalInventoryProduct, CanonicalState, ManualConfiguration } from '../domain/canonical';
import { invoiceMatches, parseInvoiceIdentity, type InvoiceIdentity } from '../domain/invoiceIdentity';
import { packagingFactorsAgree, type UnitsPerCaseSource } from '../domain/packaging';
import type { OperationalPortfolioRow, OperationalReceiptItem, OperationalReceivedInvoice, OperationalSourceState } from './operationalSources';
import { cleanCode, cleanDigits } from './canonical/utils';

const CONFIRMATION_KEY = 'blue-jacket:receipt-confirmations:v1';
const AUGUST_2026_START = '2026-08-01';

interface StoredReceiptConfirmations {
  fileName: string;
  confirmedKeys: string[];
}

export interface ReceiptReconciliationAudit {
  legacyInvoiceCount: number;
  legacyMatchedInvoiceCount: number;
  legacyRequestedCost: number;
  legacyAppliedCost: number;
  legacyAppliedUnits: number;
  legacyAppliedCases: number;
  confirmedItems: number;
  confirmedUnits: number;
  confirmedCases: number;
  confirmedItemCost: number;
  unresolvedItems: number;
}

export function receiptItemKey(item: OperationalReceiptItem, index: number): string {
  return [item.invoiceNormalized || item.invoice, item.sku, item.units, item.unitPrice, index].join('|');
}

// Mantidos apenas para migração de cargas antigas. A partir da regra atual o 218 é
// uma fonte oficial e não depende de confirmação manual para ser aplicado.
export function loadReceiptConfirmations(storage: Storage | null | undefined, fileName: string): Set<string> {
  if (!storage || !fileName) return new Set();
  try {
    const raw = storage.getItem(CONFIRMATION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Partial<StoredReceiptConfirmations>;
    if (parsed.fileName !== fileName || !Array.isArray(parsed.confirmedKeys)) return new Set();
    return new Set(parsed.confirmedKeys.filter(value => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

export function saveReceiptConfirmations(storage: Storage | null | undefined, fileName: string, confirmedKeys: Set<string>) {
  if (!storage) return;
  const payload: StoredReceiptConfirmations = { fileName, confirmedKeys: Array.from(confirmedKeys) };
  try { storage.setItem(CONFIRMATION_KEY, JSON.stringify(payload)); } catch { /* legado não deve derrubar a carga */ }
}

function isBeforeAugust2026(entryDate: string): boolean {
  return Boolean(entryDate && entryDate < AUGUST_2026_START);
}

function isAugust2026OrLater(entryDate: string): boolean {
  return Boolean(entryDate && entryDate >= AUGUST_2026_START);
}

function identityFromRecord(record: { invoice: string; invoiceRaw?: string; invoiceNumber?: string; invoiceSeries?: string; invoiceNormalized?: string }): InvoiceIdentity {
  if (record.invoiceNumber || record.invoiceSeries || record.invoiceNormalized) {
    const number = record.invoiceNumber || parseInvoiceIdentity(record.invoice).number;
    const series = record.invoiceSeries || '';
    return { raw: record.invoiceRaw || record.invoice, number, series, normalized: record.invoiceNormalized || (number && series ? `${number}-${series}` : number) };
  }
  return parseInvoiceIdentity(record.invoiceRaw || record.invoice);
}

function findMatchingInvoice(row: OperationalPortfolioRow, invoices: OperationalReceivedInvoice[]): OperationalReceivedInvoice | undefined {
  const rowIdentity = identityFromRecord(row);
  if (!rowIdentity.number) return undefined;
  return invoices.find(invoice => invoiceMatches(rowIdentity, identityFromRecord(invoice)));
}

function invoiceAuditKey(invoice: OperationalReceivedInvoice): string {
  const identity = identityFromRecord(invoice);
  return identity.normalized || identity.number;
}

function resolveProductBySku(
  skuValue: unknown,
  inventoryByCode: Map<string, CanonicalInventoryProduct>,
  inventoryByFactory: Map<string, CanonicalInventoryProduct>,
  inventoryByEan: Map<string, CanonicalInventoryProduct>,
  canonical: CanonicalState,
) {
  const sku = cleanCode(skuValue);
  const direct = inventoryByCode.get(sku) || inventoryByFactory.get(sku);
  if (direct) return direct;
  const supportItem = (canonical.support.itemCodes || []).find(entry => cleanCode(entry.internalCode) === sku || cleanCode(entry.factoryCode) === sku);
  if (!supportItem) return undefined;
  const ean = cleanDigits(supportItem.ean);
  return ean ? inventoryByEan.get(ean) : undefined;
}

function resolveReceiptProduct(
  item: OperationalReceiptItem,
  inventoryByCode: Map<string, CanonicalInventoryProduct>,
  inventoryByFactory: Map<string, CanonicalInventoryProduct>,
  inventoryByEan: Map<string, CanonicalInventoryProduct>,
  canonical: CanonicalState,
) {
  return resolveProductBySku(item.sku, inventoryByCode, inventoryByFactory, inventoryByEan, canonical);
}

function resolvePortfolioProduct(
  row: OperationalPortfolioRow,
  inventoryByCode: Map<string, CanonicalInventoryProduct>,
  inventoryByFactory: Map<string, CanonicalInventoryProduct>,
  inventoryByEan: Map<string, CanonicalInventoryProduct>,
  canonical: CanonicalState,
) {
  return resolveProductBySku(row.materialCode, inventoryByCode, inventoryByFactory, inventoryByEan, canonical);
}

type InventoryWithPackaging = CanonicalInventoryProduct & { unitsPerCase?: number; unitsPerCaseSource?: UnitsPerCaseSource; unitsPerCaseConflict?: boolean };

function unitsPerCaseFor(product: CanonicalInventoryProduct, canonical: CanonicalState): number {
  const extended = product as InventoryWithPackaging;
  if (extended.unitsPerCaseConflict || extended.unitsPerCaseSource === 'CONFLICT') return 0;
  const productFactor = extended.unitsPerCaseSource && extended.unitsPerCaseSource !== 'UNKNOWN' ? Math.max(Number(extended.unitsPerCase) || 0, 0) : 0;
  const ean = cleanDigits(product.ean);
  const factory = cleanCode(product.factoryCode);
  const master = (canonical.support.products || []).find(item => (ean && cleanDigits(item.ean) === ean) || (factory && cleanCode(item.sku) === factory));
  const masterUnits = Math.max(Number(master?.unitsPerCase) || 0, 0);
  if (productFactor > 0 && masterUnits > 0 && !packagingFactorsAgree(productFactor, masterUnits)) return 0;
  if (productFactor > 0) return productFactor;
  if (masterUnits > 0) return masterUnits;
  return 0;
}

function deductPortfolioRowFinancial(product: CanonicalInventoryProduct, requestedCost: number, config: ManualConfiguration): number {
  const beforeCost = Math.max(product.pendingCost, 0);
  const beforeSale = Math.max(product.pendingSale, 0);
  const costCut = Math.min(Math.max(requestedCost, 0), beforeCost);
  if (costCut <= 0) return 0;
  const saleRatio = beforeCost > 0 ? beforeSale / beforeCost : (1 + Math.max(Number(config.portfolioSaleMarkup) || 0, 0));
  product.pendingCost = Math.max(beforeCost - costCut, 0);
  product.pendingSale = Math.max(beforeSale - costCut * saleRatio, 0);
  return costCut;
}

function deductPortfolioVolume(product: CanonicalInventoryProduct, requestedCases: number, canonical: CanonicalState) {
  const cases = Math.min(Math.max(requestedCases, 0), Math.max(product.pendingCases, 0));
  const unitsPerCase = unitsPerCaseFor(product, canonical);
  const requestedUnits = unitsPerCase > 0 ? cases * unitsPerCase : 0;
  const units = Math.min(requestedUnits, Math.max(product.pendingQty, 0));
  product.pendingCases = Math.max(product.pendingCases - cases, 0);
  product.pendingQty = Math.max(product.pendingQty - units, 0);
  return { cases, units };
}

export function applyReceiptReconciliation(
  canonical: CanonicalState,
  state: OperationalSourceState,
  config: ManualConfiguration,
  _legacyConfirmedKeys: Set<string> = new Set(),
): { canonical: CanonicalState; audit: ReceiptReconciliationAudit } {
  // A entrada deve ser a Carteira bruta/comparável. applyOperationalOverrides não
  // reduz mais NFs recebidas; esta é a única autoridade de baixa do pipeline.
  const inventory = canonical.inventory.map(item => ({ ...item }));
  const byCode = new Map(inventory.map(item => [cleanCode(item.code), item]));
  const byFactory = new Map(inventory.filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), item]));
  const byEan = new Map(inventory.filter(item => cleanDigits(item.ean)).map(item => [cleanDigits(item.ean), item]));

  const legacyInvoices = state.legacyInvoices.filter(invoice => isBeforeAugust2026(invoice.entryDate));

  let legacyRequestedCost = 0;
  let legacyAppliedCost = 0;
  let legacyAppliedUnits = 0;
  let legacyAppliedCases = 0;
  const legacyMatchedInvoices = new Set<string>();

  for (const row of state.portfolioRows || []) {
    const matchedInvoice = findMatchingInvoice(row, legacyInvoices);
    if (!matchedInvoice) continue;
    legacyMatchedInvoices.add(invoiceAuditKey(matchedInvoice));
    const product = resolvePortfolioProduct(row, byCode, byFactory, byEan, canonical);
    if (!product) continue;

    const requestedCost = Math.max(Number(row.costValue) || 0, 0);
    legacyRequestedCost += requestedCost;
    legacyAppliedCost += deductPortfolioRowFinancial(product, requestedCost, config);

    const requestedCases = Math.max(Number(row.orderQty) || 0, 0) + Math.max(Number(row.billQty) || 0, 0);
    const volume = deductPortfolioVolume(product, requestedCases, canonical);
    legacyAppliedCases += volume.cases;
    legacyAppliedUnits += volume.units;
  }

  let confirmedItems = 0;
  let confirmedUnits = 0;
  let confirmedCases = 0;
  let confirmedItemCost = 0;
  let unresolvedItems = 0;

  state.receiptItems.forEach(item => {
    if (!isAugust2026OrLater(item.entryDate)) return;
    confirmedItems += 1;
    const product = resolveReceiptProduct(item, byCode, byFactory, byEan, canonical);
    if (!product) { unresolvedItems += 1; return; }

    const unitsPerCase = unitsPerCaseFor(product, canonical);
    const units = Math.min(Math.max(item.units, 0), Math.max(product.pendingQty, 0));
    const cases = unitsPerCase > 0 ? Math.min(Math.max(product.pendingCases, 0), units / unitsPerCase) : 0;
    product.pendingQty = Math.max(product.pendingQty - units, 0);
    product.pendingCases = Math.max(product.pendingCases - cases, 0);
    confirmedUnits += units;
    confirmedCases += cases;

    const requestedCost = Math.max(item.units * item.unitPrice, 0);
    confirmedItemCost += deductPortfolioRowFinancial(product, requestedCost, config);
  });

  const pendingCost = inventory.reduce((sum, item) => sum + Math.max(item.pendingCost, 0), 0);
  const pendingSale = inventory.reduce((sum, item) => sum + Math.max(item.pendingSale, 0), 0);
  const stockCost = inventory.reduce((sum, item) => sum + item.quantity * item.costUnit, 0);
  const stockSale = inventory.reduce((sum, item) => sum + item.quantity * item.saleUnit, 0);
  const historyAverage = canonical.history.average3ClosedMonths || 0;
  const coverageProjectedDays = historyAverage > 0 ? Math.round((stockSale + pendingSale) / historyAverage * 30) : 0;
  const coverageCostProjectedDays = historyAverage > 0 ? Math.round((stockCost + pendingCost) / historyAverage * 30) : 0;

  const warnings = canonical.warnings.filter(warning => !warning.startsWith('Abatimento da Carteira:') && !warning.startsWith('12.322 → Carteira:') && !warning.startsWith('218 confirmado → Carteira:') && !warning.startsWith('218 automático → Carteira:') && !warning.startsWith('Fontes de entrada:'));
  if (state.legacyInvoices.length) {
    warnings.push(`12.322 → Carteira: fonte histórica válida até 31/07/2026. ${legacyMatchedInvoices.size}/${legacyInvoices.length} NF(s) antigas foram encontradas por identidade explícita; ${legacyAppliedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, ${legacyAppliedCases.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx e ${legacyAppliedUnits.toLocaleString('pt-BR')} un. foram abatidos uma única vez.`);
  }
  if (state.receiptItems.length) {
    const eligible218 = state.receiptItems.filter(item => isAugust2026OrLater(item.entryDate)).length;
    warnings.push(`218 automático → Carteira: fonte oficial a partir de 01/08/2026. ${confirmedItems}/${eligible218} item(ns) processados uma única vez; ${confirmedUnits.toLocaleString('pt-BR')} un. e ${confirmedCases.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx abatidas; ${confirmedItemCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} abatidos financeiramente${unresolvedItems ? `; ${unresolvedItems} item(ns) sem vínculo de produto` : ''}.`);
  }
  warnings.push('Fontes de entrada: 12.322 até 31/07/2026; Entrada 218 automática a partir de 01/08/2026. A reconciliação de recebimentos é a única autoridade de baixa. A Carteira mantém Order Qty + Bill Qty como regra de quantidade.');

  const next: CanonicalState = {
    ...canonical,
    inventory,
    stock: {
      ...canonical.stock,
      pendingPurchaseCost: pendingCost,
      pendingPurchaseSale: pendingSale,
      projectedCostValue: stockCost + pendingCost,
      projectedSaleValue: stockSale + pendingSale,
      coverageProjectedDays,
      coverageCostProjectedDays,
    },
    warnings,
  };

  return {
    canonical: next,
    audit: {
      legacyInvoiceCount: legacyInvoices.length,
      legacyMatchedInvoiceCount: legacyMatchedInvoices.size,
      legacyRequestedCost,
      legacyAppliedCost,
      legacyAppliedUnits,
      legacyAppliedCases,
      confirmedItems,
      confirmedUnits,
      confirmedCases,
      confirmedItemCost,
      unresolvedItems,
    },
  };
}
