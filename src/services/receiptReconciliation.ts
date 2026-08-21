import type { CanonicalInventoryProduct, CanonicalState, ManualConfiguration } from '../domain/canonical';
import type { OperationalReceiptItem, OperationalSourceState } from './operationalSources';
import { cleanCode, cleanDigits } from './canonical/utils';

const CONFIRMATION_KEY = 'blue-jacket:receipt-confirmations:v1';

interface StoredReceiptConfirmations {
  fileName: string;
  confirmedKeys: string[];
}

export interface ReceiptReconciliationAudit {
  legacyInvoiceCount: number;
  legacyRequestedCost: number;
  legacyAppliedCost: number;
  confirmedItems: number;
  confirmedUnits: number;
  confirmedCases: number;
  confirmedItemCost: number;
  unresolvedItems: number;
}

export function receiptItemKey(item: OperationalReceiptItem, index: number): string {
  return [item.invoice, item.sku, item.units, item.unitPrice, index].join('|');
}

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
  try { storage.setItem(CONFIRMATION_KEY, JSON.stringify(payload)); } catch { /* confirmação não deve derrubar a carga */ }
}

function cloneInventory(canonical: CanonicalState): CanonicalInventoryProduct[] {
  return canonical.inventory.map(item => ({ ...item }));
}

function distributeFinancialDeduction(inventory: CanonicalInventoryProduct[], requestedCost: number): number {
  const available = inventory.reduce((sum, item) => sum + Math.max(item.pendingCost, 0), 0);
  const applied = Math.min(Math.max(requestedCost, 0), available);
  if (applied <= 0 || available <= 0) return 0;

  let remaining = applied;
  const candidates = inventory.filter(item => item.pendingCost > 0);
  candidates.forEach((item, index) => {
    const beforeCost = Math.max(item.pendingCost, 0);
    const beforeSale = Math.max(item.pendingSale, 0);
    const costCut = index === candidates.length - 1 ? Math.min(remaining, beforeCost) : Math.min(applied * (beforeCost / available), beforeCost);
    const saleRatio = beforeCost > 0 ? beforeSale / beforeCost : 0;
    item.pendingCost = Math.max(beforeCost - costCut, 0);
    item.pendingSale = Math.max(beforeSale - costCut * saleRatio, 0);
    remaining = Math.max(remaining - costCut, 0);
  });
  return applied - remaining;
}

function resolveReceiptProduct(
  item: OperationalReceiptItem,
  inventoryByCode: Map<string, CanonicalInventoryProduct>,
  inventoryByFactory: Map<string, CanonicalInventoryProduct>,
  canonical: CanonicalState,
) {
  const sku = cleanCode(item.sku);
  const direct = inventoryByCode.get(sku) || inventoryByFactory.get(sku);
  if (direct) return direct;
  const supportItem = (canonical.support.itemCodes || []).find(entry => cleanCode(entry.internalCode) === sku || cleanCode(entry.factoryCode) === sku);
  if (!supportItem) return undefined;
  const ean = cleanDigits(supportItem.ean);
  return canonical.inventory.find(entry => cleanDigits(entry.ean) === ean);
}

function unitsPerCaseFor(product: CanonicalInventoryProduct, canonical: CanonicalState): number {
  if (product.pendingCases > 0 && product.pendingQty > 0) return product.pendingQty / product.pendingCases;
  const ean = cleanDigits(product.ean);
  const factory = cleanCode(product.factoryCode);
  const master = (canonical.support.products || []).find(item => (ean && cleanDigits(item.ean) === ean) || (factory && cleanCode(item.sku) === factory));
  return Math.max(Number(master?.unitsPerCase) || 0, 0);
}

export function applyReceiptReconciliation(
  canonical: CanonicalState,
  state: OperationalSourceState,
  config: ManualConfiguration,
  confirmedKeys: Set<string>,
): { canonical: CanonicalState; audit: ReceiptReconciliationAudit } {
  const inventory = cloneInventory(canonical);
  const byCode = new Map(inventory.map(item => [cleanCode(item.code), item]));
  const byFactory = new Map(inventory.filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), item]));
  const legacyInvoices = new Map(state.legacyInvoices.map(invoice => [cleanCode(invoice.invoice), invoice]));

  let confirmedItems = 0;
  let confirmedUnits = 0;
  let confirmedCases = 0;
  let confirmedItemCost = 0;
  let unresolvedItems = 0;

  state.receiptItems.forEach((item, index) => {
    const key = receiptItemKey(item, index);
    if (!confirmedKeys.has(key)) return;
    confirmedItems += 1;
    const product = resolveReceiptProduct(item, byCode, byFactory, canonical);
    if (!product) { unresolvedItems += 1; return; }

    const units = Math.min(Math.max(item.units, 0), Math.max(product.pendingQty, 0));
    const unitsPerCase = unitsPerCaseFor(product, canonical);
    const cases = unitsPerCase > 0 ? Math.min(Math.max(product.pendingCases, 0), units / unitsPerCase) : 0;
    product.pendingQty = Math.max(product.pendingQty - units, 0);
    product.pendingCases = Math.max(product.pendingCases - cases, 0);
    confirmedUnits += units;
    confirmedCases += cases;

    if (legacyInvoices.has(cleanCode(item.invoice))) return;
    const requestedCost = Math.max(item.units * item.unitPrice, 0);
    const costCut = Math.min(requestedCost, Math.max(product.pendingCost, 0));
    const saleRatio = product.pendingCost > 0 ? product.pendingSale / product.pendingCost : (1 + Math.max(Number(config.portfolioSaleMarkup) || 0, 0));
    product.pendingCost = Math.max(product.pendingCost - costCut, 0);
    product.pendingSale = Math.max(product.pendingSale - costCut * saleRatio, 0);
    confirmedItemCost += costCut;
  });

  const legacyRequestedCost = Array.from(legacyInvoices.values()).reduce((sum, invoice) => sum + Math.max(Number(invoice.totalValue) || 0, 0), 0);
  const legacyAppliedCost = distributeFinancialDeduction(inventory, legacyRequestedCost);

  const pendingCost = inventory.reduce((sum, item) => sum + Math.max(item.pendingCost, 0), 0);
  const pendingSale = inventory.reduce((sum, item) => sum + Math.max(item.pendingSale, 0), 0);
  const stockCost = inventory.reduce((sum, item) => sum + item.quantity * item.costUnit, 0);
  const stockSale = inventory.reduce((sum, item) => sum + item.quantity * item.saleUnit, 0);
  const historyAverage = canonical.history.average3ClosedMonths || 0;
  const coverageProjectedDays = historyAverage > 0 ? Math.round((stockSale + pendingSale) / historyAverage * 30) : 0;
  const coverageCostProjectedDays = historyAverage > 0 ? Math.round((stockCost + pendingCost) / historyAverage * 30) : 0;

  const warnings = canonical.warnings.filter(warning => !warning.startsWith('12.322 → Carteira:') && !warning.startsWith('218 confirmado → Carteira:'));
  if (state.legacyInvoices.length) {
    const cap = legacyAppliedCost + 0.005 < legacyRequestedCost ? `; limitado ao saldo disponível da Carteira (${legacyAppliedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : '';
    warnings.push(`12.322 → Carteira: ${state.legacyInvoices.length} NF(s) recebida(s), ${legacyRequestedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} identificados para abatimento financeiro${cap}.`);
  }
  if (state.receiptItems.length) {
    warnings.push(`218 confirmado → Carteira: ${confirmedItems}/${state.receiptItems.length} item(ns) confirmado(s); ${confirmedUnits.toLocaleString('pt-BR')} un. e ${confirmedCases.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx abatidas; ${confirmedItemCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} abatidos adicionalmente em NFs que não estavam no 12.322${unresolvedItems ? `; ${unresolvedItems} item(ns) confirmado(s) sem vínculo de produto` : ''}.`);
  }

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

  return { canonical: next, audit: { legacyInvoiceCount: state.legacyInvoices.length, legacyRequestedCost, legacyAppliedCost, confirmedItems, confirmedUnits, confirmedCases, confirmedItemCost, unresolvedItems } };
}
