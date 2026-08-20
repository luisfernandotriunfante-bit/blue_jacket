export * from './stockModelCore';

import type { CanonicalInventoryProduct, CanonicalProductSupport } from './canonical';
import { buildStockPresentation as buildCore } from './stockModelCore';
import type { StockPresentationInput as CoreStockPresentationInput, StockPresentation, StockReconciliationCheck } from './stockModelCore';

export interface StockItemCodeSupport { internalCode: string; ean: string; factoryCode: string; unitsPerCase?: number; }
type InventoryWithPackaging = CanonicalInventoryProduct & { unitsPerCase?: number };
export type StockPresentationInputWithPackaging = CoreStockPresentationInput & { itemCodeSupport?: StockItemCodeSupport[] };

const clean = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');

function packagingFactor(item: InventoryWithPackaging, itemCodes: StockItemCodeSupport[]): number {
  const direct = Math.max(Number(item.unitsPerCase) || 0, 0);
  if (direct > 0) return direct;
  const internal = cleanCode(item.code); const factory = cleanCode(item.factoryCode); const ean = clean(item.ean);
  const match = itemCodes.find(candidate => {
    const candidateInternal = cleanCode(candidate.internalCode); const candidateFactory = cleanCode(candidate.factoryCode); const candidateEan = clean(candidate.ean);
    return Boolean((internal && candidateInternal === internal) || (factory && candidateFactory === factory) || (ean && candidateEan === ean));
  });
  return Math.max(Number(match?.unitsPerCase) || 0, 0);
}

function augmentProductSupport(input: StockPresentationInputWithPackaging): CanonicalProductSupport[] {
  const result = [...(input.productSupport || [])]; const itemCodes = input.itemCodeSupport || [];
  input.inventory.forEach(rawItem => {
    const item = rawItem as InventoryWithPackaging; const unitsPerCase = packagingFactor(item, itemCodes);
    if (unitsPerCase <= 0) return;
    const factory = cleanCode(item.factoryCode); const ean = clean(item.ean);
    const index = result.findIndex(master => Boolean((factory && cleanCode(master.sku) === factory) || (ean && clean(master.ean) === ean)));
    if (index >= 0) { if ((Number(result[index].unitsPerCase) || 0) <= 0) result[index] = { ...result[index], unitsPerCase }; return; }
    if (!factory && !ean) return;
    result.push({ sku: factory, ean, description: item.description || '', category: '', subcategory: '', brand: '', isLaunch: Boolean(item.isLaunch), boxPrice: 0, unitPrice: 0, unitsPerCase, line: '' });
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

function hasPhysicalSnapshot(input: StockPresentationInputWithPackaging): boolean {
  if (!input.hasStock8013) return false;
  return input.inventory.some(item => (Number(item.physicalUnits) || 0) > 0 || (Number(item.physicalCases) || 0) > 0 || (Number(item.grossKg) || 0) > 0);
}

function portfolioReconciliation(result: StockPresentation): StockReconciliationCheck[] {
  const pending = result.products.filter(product => product.pendingCases > 0 || product.pendingUnits > 0);
  const rows = pending.map<StockReconciliationCheck>(product => {
    if (product.unitsPerCase <= 0) return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX = unidades`, expected: null, calculated: product.pendingUnits, difference: null, status: 'BLOCKED', source: 'Carteira + Master 105/286', note: 'Fator Un/CX não confirmado para este SKU.' };
    const expected = product.pendingCases * product.unitsPerCase; const difference = product.pendingUnits - expected;
    return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX = unidades`, expected, calculated: product.pendingUnits, difference, status: Math.abs(difference) <= 0.001 ? 'OK' : 'DIVERGENT', source: 'Carteira + Master 105/286', note: `${product.pendingCases.toLocaleString('pt-BR')} cx × ${product.unitsPerCase.toLocaleString('pt-BR')} Un/CX` };
  });
  rows.push({ id: 'stock.portfolio.quantity.rule', label: 'Regra de quantidade da Carteira: Order Qty x Bill Qty', expected: null, calculated: 'Order Qty > 0 ? Order Qty : Bill Qty', difference: null, status: 'BLOCKED', source: 'Carteira', note: 'A precedência já existia no motor e foi preservada, mas não é declarada validada sem a regra/planilha que comprove qual campo representa a entrada prevista em cada status.' });
  return rows;
}

function enrichReconciliation(result: StockPresentation): StockPresentation {
  return { ...result, reconciliation: [...result.reconciliation, ...portfolioReconciliation(result)] };
}

export function buildStockPresentation(input: StockPresentationInputWithPackaging) {
  const { itemCodeSupport: _itemCodeSupport, ...coreInput } = input;
  const result = buildCore({ ...coreInput, hasStock8013: hasPhysicalSnapshot(input), productSupport: augmentProductSupport(input) });
  return enrichReconciliation(enrichMovementPackaging(normalizePortfolioWinthor(result)));
}
