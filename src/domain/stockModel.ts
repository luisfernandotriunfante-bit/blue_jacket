export * from './stockModelCore';

import type { CanonicalInventoryProduct, CanonicalProductSupport } from './canonical';
import type { PackagingCandidate, UnitsPerCaseSource } from './packaging';
import { packagingFactorsAgree } from './packaging';
import { buildStockPresentation as buildCore } from './stockModelCore';
import type { StockMovement, StockPresentationInput as CoreStockPresentationInput, StockPresentation, StockReconciliationCheck } from './stockModelCore';
import { operationalReceiptMovements } from '../services/operationalSources';

export interface StockItemCodeSupport { internalCode: string; ean: string; factoryCode: string; }
export interface StockPortfolioLine {
  sourceRow: number;
  materialCode: string;
  orderQty: number;
  billQty: number;
  totalCases: number;
  unitsPerCase: number;
  unitsPerCaseSource?: UnitsPerCaseSource;
  totalUnits: number;
  costValue: number;
  saleValue: number;
  internalCode: string;
  ean: string;
  description: string;
  hasWinthor: boolean;
}
export type StockPortfolioMovement = StockMovement & { orderQtyCases?: number; billQtyCases?: number; unitsPerCase?: number; unitsPerCaseSource?: UnitsPerCaseSource; sourceRow?: number; saleValue?: number };
type InventoryWithPackaging = CanonicalInventoryProduct & { unitsPerCase?: number; unitsPerCaseSource?: UnitsPerCaseSource; unitsPerCaseCandidates?: PackagingCandidate[]; unitsPerCaseConflict?: boolean; unitsPerCaseNote?: string; portfolioLines?: StockPortfolioLine[] };
export type StockPresentationInputWithPackaging = CoreStockPresentationInput & { itemCodeSupport?: StockItemCodeSupport[] };

const clean = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');

function trustedInventoryFactor(item: InventoryWithPackaging): number {
  if (item.unitsPerCaseConflict || item.unitsPerCaseSource === 'CONFLICT' || item.unitsPerCaseSource === 'UNKNOWN') return 0;
  return Math.max(Number(item.unitsPerCase) || 0, 0);
}

function restoreLaunchCatalog(inventory: CanonicalInventoryProduct[], productSupport: CanonicalProductSupport[]): CanonicalInventoryProduct[] {
  const items = inventory.map(item => ({ ...item } as InventoryWithPackaging));
  const byFactory = new Map(items.filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), item]));
  const byEan = new Map(items.filter(item => clean(item.ean)).map(item => [clean(item.ean), item]));
  const existingCodes = new Set(items.map(item => item.code));

  productSupport.filter(master => master.isLaunch).forEach(master => {
    const factory = cleanCode(master.sku); const ean = clean(master.ean);
    const existing = (factory ? byFactory.get(factory) : undefined) || (ean ? byEan.get(ean) : undefined);
    if (existing) { existing.isLaunch = true; return; }
    if (!ean) return;
    let catalogCode = `EAN-${ean}`; let suffix = 2;
    while (existingCodes.has(catalogCode)) { catalogCode = `EAN-${ean}-${suffix}`; suffix += 1; }
    const factor = Math.max(Number(master.unitsPerCase) || 0, 0);
    const catalogItem = {
      code: catalogCode,
      description: master.description || `Lançamento ${ean}`,
      ean,
      quantity: 0,
      costUnit: master.unitPrice || 0,
      saleUnit: master.unitPrice || 0,
      pendingQty: 0,
      pendingCases: 0,
      pendingCost: 0,
      pendingSale: 0,
      isLaunch: true,
      hasWinthor: false,
      factoryCode: master.sku || '',
      physicalCases: 0,
      physicalUnits: 0,
      grossKg: 0,
      unitsPerCase: factor,
      unitsPerCaseSource: factor > 0 ? 'PRICE_LIST' : 'UNKNOWN',
      unitsPerCaseCandidates: factor > 0 ? [{ source: 'PRICE_LIST', value: factor }] : [],
      unitsPerCaseConflict: false,
      portfolioLines: [],
    } as InventoryWithPackaging;
    items.push(catalogItem); existingCodes.add(catalogCode); if (factory) byFactory.set(factory, catalogItem); byEan.set(ean, catalogItem);
  });
  return items;
}

function augmentProductSupport(input: StockPresentationInputWithPackaging): CanonicalProductSupport[] {
  const result = [...(input.productSupport || [])];
  input.inventory.forEach(rawItem => {
    const item = rawItem as InventoryWithPackaging; const inventoryFactor = trustedInventoryFactor(item);
    const factory = cleanCode(item.factoryCode); const ean = clean(item.ean);
    const index = result.findIndex(master => Boolean((factory && cleanCode(master.sku) === factory) || (ean && clean(master.ean) === ean)));
    if (index >= 0) {
      const sourceFactor = Math.max(Number(result[index].unitsPerCase) || 0, 0);
      if (item.unitsPerCaseConflict || (inventoryFactor > 0 && sourceFactor > 0 && !packagingFactorsAgree(inventoryFactor, sourceFactor))) {
        result[index] = { ...result[index], unitsPerCase: 0 };
      } else if (sourceFactor <= 0 && inventoryFactor > 0) result[index] = { ...result[index], unitsPerCase: inventoryFactor };
      return;
    }
    if (inventoryFactor <= 0 || (!factory && !ean)) return;
    result.push({ sku: factory, ean, description: item.description || '', category: '', subcategory: '', brand: '', isLaunch: Boolean(item.isLaunch), boxPrice: 0, unitPrice: 0, unitsPerCase: inventoryFactor, line: '' });
  });
  return result;
}

function normalizePortfolioWinthor(result: StockPresentation): StockPresentation {
  const products = result.products.map(product => product.pendingUnits > 0 || product.pendingCases > 0 ? product : { ...product, hasWinthor: true });
  const noWinthorCount = products.filter(product => !product.hasWinthor && (product.pendingUnits > 0 || product.pendingCases > 0)).length;
  return { ...result, products, summary: { ...result.summary, noWinthorCount } };
}

function enrichMovementPackaging(result: StockPresentation): StockPresentation {
  const factorByCode = new Map(result.products.map(product => [cleanCode(product.code), Number(product.unitsPerCase) || 0]));
  const movements = result.movements.map(movement => {
    const factor = factorByCode.get(cleanCode(movement.sku)) || 0;
    if (factor <= 0 || movement.cases < 0 || !Number.isInteger(movement.cases)) return movement;
    const looseUnits = movement.totalUnits - movement.cases * factor;
    if (looseUnits < -0.001 || looseUnits >= factor + 0.001) return movement;
    return { ...movement, looseUnits: Math.max(looseUnits, 0) };
  });
  return { ...result, movements };
}

function enrichPortfolioMovements(result: StockPresentation, inventory: CanonicalInventoryProduct[]): StockPresentation {
  const detailed: StockPortfolioMovement[] = [];
  const detailedCodes = new Set<string>();
  inventory.forEach(rawItem => {
    const item = rawItem as InventoryWithPackaging; const lines = item.portfolioLines || [];
    if (!lines.length) return;
    detailedCodes.add(cleanCode(item.code));
    lines.forEach((line, index) => detailed.push({
      id: `CARTEIRA:${item.code}:${line.sourceRow || index + 1}:${index}`,
      direction: 'ENTRADA', stage: 'PREVISTA', kind: 'ENTRADA_PREVISTA_CARTEIRA', status: 'Entrada prevista', movement: 'Carteira',
      date: '', document: '', order: '', invoice: '', sku: item.code, ean: item.ean || line.ean || '', product: item.description || line.description,
      partner: 'Colgate → Milênio', partnerDocument: '', cases: Number(line.totalCases) || 0, looseUnits: 0, totalUnits: Number(line.totalUnits) || 0,
      value: Number(line.costValue) || 0, origin: 'CARTEIRA', orderQtyCases: Number(line.orderQty) || 0, billQtyCases: Number(line.billQty) || 0,
      unitsPerCase: Number(line.unitsPerCase) || 0, unitsPerCaseSource: line.unitsPerCaseSource, sourceRow: Number(line.sourceRow) || index + 1, saleValue: Number(line.saleValue) || 0,
    }));
  });
  if (!detailed.length) return result;
  const movements = result.movements
    .filter(movement => !(movement.kind === 'ENTRADA_PREVISTA_CARTEIRA' && detailedCodes.has(cleanCode(movement.sku))))
    .concat(detailed)
    .sort((left, right) => { if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date); if (left.date && !right.date) return -1; if (!left.date && right.date) return 1; return left.id.localeCompare(right.id); });
  return { ...result, movements };
}

function enrichRealizedReceiptMovements(result: StockPresentation): StockPresentation {
  const receipts = operationalReceiptMovements();
  if (!receipts.length) return result;
  const existingIds = new Set(result.movements.map(movement => movement.id));
  const movements = [...receipts.filter(movement => !existingIds.has(movement.id)), ...result.movements]
    .sort((left, right) => { if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date); if (left.date && !right.date) return -1; if (!left.date && right.date) return 1; return left.id.localeCompare(right.id); });
  return { ...result, movements };
}

function hasPhysicalSnapshot(input: StockPresentationInputWithPackaging): boolean {
  if (!input.hasStock8013) return false;
  return input.inventory.some(item => (Number(item.physicalUnits) || 0) > 0 || (Number(item.physicalCases) || 0) > 0 || (Number(item.grossKg) || 0) > 0);
}

function packagingReconciliation(inventory: CanonicalInventoryProduct[], productSupport: CanonicalProductSupport[]): StockReconciliationCheck[] {
  const mastersBySku = new Map(productSupport.filter(master => cleanCode(master.sku)).map(master => [cleanCode(master.sku), master]));
  const mastersByEan = new Map(productSupport.filter(master => clean(master.ean)).map(master => [clean(master.ean), master]));
  return inventory.map(raw => {
    const item = raw as InventoryWithPackaging;
    const current = Math.max(Number(item.unitsPerCase) || 0, 0);
    const master = mastersBySku.get(cleanCode(item.factoryCode)) || mastersByEan.get(clean(item.ean));
    const external = Math.max(Number(master?.unitsPerCase) || 0, 0);
    const needsFactor = Number(item.quantity) > 0 || Number(item.pendingCases) > 0 || Number(item.physicalCases) > 0;
    const conflict = Boolean(item.unitsPerCaseConflict) || (current > 0 && external > 0 && !packagingFactorsAgree(current, external));
    if (conflict) return { id: `stock.packaging.${item.code}`, label: `Un/CX ${item.code}: fontes de embalagem concordam`, expected: current || null, calculated: external || null, difference: current > 0 && external > 0 ? external-current : null, status: 'DIVERGENT', source: '105 derivado × Lista/Tabela de produtos', note: item.unitsPerCaseNote || 'Fontes comprovadas de embalagem divergiram; conversão bloqueada.' };
    if (needsFactor && current <= 0 && external <= 0) return { id: `stock.packaging.${item.code}`, label: `Un/CX ${item.code}: fator identificado`, expected: 'fonte comprovada', calculated: 'UNKNOWN', difference: null, status: 'BLOCKED', source: '105 derivado / Lista-Tabela de produtos', note: 'FATOR DE EMBALAGEM NÃO IDENTIFICADO. Nenhum valor padrão foi inventado.' };
    return { id: `stock.packaging.${item.code}`, label: `Un/CX ${item.code}: fator identificado`, expected: current || external, calculated: current || external, difference: 0, status: 'OK', source: item.unitsPerCaseSource || (external > 0 ? 'PRICE_LIST' : 'UNKNOWN'), note: item.unitsPerCaseNote || undefined };
  });
}

function portfolioReconciliation(result: StockPresentation): StockReconciliationCheck[] {
  const pending = result.products.filter(product => product.pendingCases > 0 || product.pendingUnits > 0);
  const rows = pending.map<StockReconciliationCheck>(product => {
    if (product.unitsPerCase <= 0) return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX = unidades`, expected: null, calculated: product.pendingUnits, difference: null, status: 'BLOCKED', source: 'Carteira + fator de embalagem rastreado', note: 'Fator Un/CX não confirmado para este SKU.' };
    const expected = product.pendingCases * product.unitsPerCase; const difference = product.pendingUnits - expected;
    return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX = unidades`, expected, calculated: product.pendingUnits, difference, status: Math.abs(difference) <= 0.001 ? 'OK' : 'DIVERGENT', source: 'Carteira + fator de embalagem rastreado', note: `${product.pendingCases.toLocaleString('pt-BR')} cx × ${product.unitsPerCase.toLocaleString('pt-BR')} Un/CX` };
  });
  rows.push({ id: 'stock.portfolio.quantity.rule', label: 'Regra de quantidade da Carteira: Order Qty + Bill Qty', expected: 'Order Qty + Bill Qty', calculated: 'Order Qty + Bill Qty', difference: null, status: 'OK', source: 'Carteira', note: 'Regra confirmada: a Carteira é atualizada continuamente e tudo que permanece nela está pendente. Se houver valor nas duas colunas, ambos são somados porque podem representar notas distintas do mesmo item.' });
  return rows;
}

function enrichReconciliation(result: StockPresentation, inventory: CanonicalInventoryProduct[], support: CanonicalProductSupport[]): StockPresentation {
  return { ...result, reconciliation: [...result.reconciliation, ...packagingReconciliation(inventory, support), ...portfolioReconciliation(result)] };
}

export function buildStockPresentation(input: StockPresentationInputWithPackaging) {
  const restoredInventory = restoreLaunchCatalog(input.inventory || [], input.productSupport || []);
  const augmentedInput = { ...input, inventory: restoredInventory };
  const { itemCodeSupport: _itemCodeSupport, ...coreInput } = augmentedInput;
  const support = augmentProductSupport(augmentedInput);
  const result = buildCore({ ...coreInput, hasStock8013: hasPhysicalSnapshot(augmentedInput), productSupport: support });
  return enrichReconciliation(enrichRealizedReceiptMovements(enrichPortfolioMovements(enrichMovementPackaging(normalizePortfolioWinthor(result)), restoredInventory)), restoredInventory, input.productSupport || []);
}
