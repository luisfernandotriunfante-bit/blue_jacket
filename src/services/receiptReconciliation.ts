import type { CanonicalInventoryProduct, CanonicalState, ManualConfiguration } from '../domain/canonical';
import type { OperationalPortfolioRow, OperationalReceiptItem, OperationalSourceState } from './operationalSources';
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

function normalizedInvoice(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * A Carteira Colgate costuma expor a NF como 002915720-1. O parser operacional
 * legado removeu pontuação e armazenou esse exemplo como 29157201. Para preservar
 * cargas já salvas, tentamos primeiro o número integral e, somente se ele não
 * existir no 12.322, retiramos o dígito de série final.
 */
function matchInvoiceKey(value: unknown, knownInvoices: Map<string, unknown>): string {
  const direct = normalizedInvoice(value);
  if (!direct) return '';
  if (knownInvoices.has(direct)) return direct;
  if (direct.length >= 8) {
    const withoutSeries = direct.slice(0, -1).replace(/^0+/, '');
    if (knownInvoices.has(withoutSeries)) return withoutSeries;
  }
  return '';
}

function isBeforeAugust2026(entryDate: string): boolean {
  return Boolean(entryDate && entryDate < AUGUST_2026_START);
}

function isAugust2026OrLater(entryDate: string): boolean {
  return Boolean(entryDate && entryDate >= AUGUST_2026_START);
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

function unitsPerCaseFor(product: CanonicalInventoryProduct, canonical: CanonicalState): number {
  if (product.pendingCases > 0 && product.pendingQty > 0) return product.pendingQty / product.pendingCases;
  const ean = cleanDigits(product.ean);
  const factory = cleanCode(product.factoryCode);
  const master = (canonical.support.products || []).find(item => (ean && cleanDigits(item.ean) === ean) || (factory && cleanCode(item.sku) === factory));
  return Math.max(Number(master?.unitsPerCase) || 0, 0);
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

export function applyReceiptReconciliation(
  canonical: CanonicalState,
  state: OperationalSourceState,
  config: ManualConfiguration,
  confirmedKeys: Set<string>,
): { canonical: CanonicalState; audit: ReceiptReconciliationAudit } {
  // A Carteira já foi calculada pelo motor canônico/operacional. Esta etapa não a
  // reconstrói novamente: apenas abate recebimentos comprovados pelas fontes.
  const inventory = canonical.inventory.map(item => ({ ...item }));
  const byCode = new Map(inventory.map(item => [cleanCode(item.code), item]));
  const byFactory = new Map(inventory.filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), item]));
  const byEan = new Map(inventory.filter(item => cleanDigits(item.ean)).map(item => [cleanDigits(item.ean), item]));

  // Regra confirmada de transição de fonte:
  // 12.322 = legado até 31/07/2026. A partir de 01/08/2026 a autoridade é o 218.
  const legacyInvoices = new Map(
    state.legacyInvoices
      .filter(invoice => isBeforeAugust2026(invoice.entryDate))
      .map(invoice => [normalizedInvoice(invoice.invoice), invoice]),
  );

  let legacyRequestedCost = 0;
  let legacyAppliedCost = 0;
  const legacyMatchedInvoices = new Set<string>();

  // O 12.322 não é subtraído em bloco. Ele funciona como confirmação de que uma
  // NF antiga entrou; o valor abatido é somente o NET VALUE das linhas dessa NF
  // que ainda estão presentes na Carteira atual.
  for (const row of state.portfolioRows || []) {
    const legacyKey = matchInvoiceKey(row.invoice, legacyInvoices);
    if (!legacyKey) continue;
    legacyMatchedInvoices.add(legacyKey);
    const requested = Math.max(Number(row.costValue) || 0, 0);
    legacyRequestedCost += requested;
    const product = resolvePortfolioProduct(row, byCode, byFactory, byEan, canonical);
    if (!product) continue;
    legacyAppliedCost += deductPortfolioRowFinancial(product, requested, config);
  }

  let confirmedItems = 0;
  let confirmedUnits = 0;
  let confirmedCases = 0;
  let confirmedItemCost = 0;
  let unresolvedItems = 0;

  state.receiptItems.forEach((item, index) => {
    // 218 passa a ser a fonte oficial somente a partir de 01/08/2026.
    if (!isAugust2026OrLater(item.entryDate)) return;
    const key = receiptItemKey(item, index);
    if (!confirmedKeys.has(key)) return;
    confirmedItems += 1;
    const product = resolveReceiptProduct(item, byCode, byFactory, byEan, canonical);
    if (!product) { unresolvedItems += 1; return; }

    const units = Math.min(Math.max(item.units, 0), Math.max(product.pendingQty, 0));
    const unitsPerCase = unitsPerCaseFor(product, canonical);
    const cases = unitsPerCase > 0 ? Math.min(Math.max(product.pendingCases, 0), units / unitsPerCase) : 0;
    product.pendingQty = Math.max(product.pendingQty - units, 0);
    product.pendingCases = Math.max(product.pendingCases - cases, 0);
    confirmedUnits += units;
    confirmedCases += cases;

    // Proteção contra duplicidade: se, excepcionalmente, a mesma NF estiver entre
    // as NFs antigas efetivamente conciliadas pelo 12.322, o financeiro não cai duas vezes.
    const legacyKey = matchInvoiceKey(item.invoice, legacyInvoices);
    if (legacyKey && legacyMatchedInvoices.has(legacyKey)) return;
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

  const warnings = canonical.warnings.filter(warning => !warning.startsWith('Abatimento da Carteira:') && !warning.startsWith('12.322 → Carteira:') && !warning.startsWith('218 confirmado → Carteira:') && !warning.startsWith('Fontes de entrada:'));
  if (state.legacyInvoices.length) {
    warnings.push(`12.322 → Carteira: fonte histórica válida até 31/07/2026. ${legacyMatchedInvoices.size}/${legacyInvoices.size} NF(s) antigas foram encontradas na Carteira atual; ${legacyAppliedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} do NET VALUE dessas linhas foram abatidos. NFs do 12.322 que não estão na Carteira não reduzem o saldo.`);
  }
  if (state.receiptItems.length) {
    const eligible218 = state.receiptItems.filter(item => isAugust2026OrLater(item.entryDate)).length;
    warnings.push(`218 confirmado → Carteira: fonte oficial a partir de 01/08/2026. ${confirmedItems}/${eligible218} item(ns) confirmado(s); ${confirmedUnits.toLocaleString('pt-BR')} un. e ${confirmedCases.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx abatidas; ${confirmedItemCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} abatidos financeiramente${unresolvedItems ? `; ${unresolvedItems} item(ns) confirmado(s) sem vínculo de produto` : ''}.`);
  }
  warnings.push('Fontes de entrada: 12.322 até 31/07/2026; Entrada 218 a partir de 01/08/2026. A Carteira mantém Order Qty + Bill Qty como regra de quantidade.');

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
      legacyInvoiceCount: legacyInvoices.size,
      legacyMatchedInvoiceCount: legacyMatchedInvoices.size,
      legacyRequestedCost,
      legacyAppliedCost,
      confirmedItems,
      confirmedUnits,
      confirmedCases,
      confirmedItemCost,
      unresolvedItems,
    },
  };
}
