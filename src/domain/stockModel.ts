export * from './stockModelCore';

import type { CanonicalInventoryProduct, CanonicalProductSupport } from './canonical';
import type { UnitsPerCaseSource } from './packaging';
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
type InventoryWithPackaging = CanonicalInventoryProduct & {
  internalUnitsPerCase?: number | null;
  industryUnitsPerCase?: number | null;
  physicalSource105?: boolean;
  portfolioLines?: StockPortfolioLine[];
};
export type StockPresentationInputWithPackaging = CoreStockPresentationInput & { itemCodeSupport?: StockItemCodeSupport[] };

const clean = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');

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
    const industryFactor = Math.max(Number(master.unitsPerCase) || 0, 0);
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
      internalUnitsPerCase: null,
      industryUnitsPerCase: industryFactor || null,
      physicalSource105: false,
      portfolioLines: [],
    } as InventoryWithPackaging;
    items.push(catalogItem);
    existingCodes.add(catalogCode);
    if (factory) byFactory.set(factory, catalogItem);
    byEan.set(ean, catalogItem);
  });
  return items;
}

/** hasWinthor é fato cadastral. O KPI e o alerta operacional Sem Winthor só dependem da presença real na Carteira. */
function refreshOperationalNoWinthorCount(result: StockPresentation): StockPresentation {
  const products = result.products.map(product => {
    const operationalNoWinthor = !product.hasWinthor && (product.pendingUnits > 0 || product.pendingCases > 0);
    const withoutOldAlert = product.alerts.filter(alert => alert.kind !== 'SEM_WINTHOR');
    const alerts = operationalNoWinthor
      ? [...withoutOldAlert, { id: `SEM_WINTHOR:${product.code}`, kind: 'SEM_WINTHOR' as const, severity: 'warning' as const, sku: product.code, ean: product.ean, product: product.description, message: 'Item da Carteira sem correspondência confirmada no Cadastro 286 / Winthor.' }]
      : withoutOldAlert;
    return { ...product, alerts };
  });
  const noWinthorCount = products.filter(product => !product.hasWinthor && (product.pendingUnits > 0 || product.pendingCases > 0)).length;
  return { ...result, products, alerts: products.flatMap(product => product.alerts), summary: { ...result.summary, noWinthorCount } };
}

function enrichMovementPackaging(result: StockPresentation): StockPresentation {
  const factorByCode = new Map(result.products.map(product => [cleanCode(product.code), Number(product.unitsPerCase) || 0]));
  const movements = result.movements.map(movement => {
    // Carteira usa Un/CX indústria e já chega ao motor com quantidade materializada; nunca recalcular com o fator interno.
    if (movement.kind === 'ENTRADA_PREVISTA_CARTEIRA') return movement;
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
    const item = rawItem as InventoryWithPackaging;
    const lines = item.portfolioLines || [];
    if (!lines.length) return;
    detailedCodes.add(cleanCode(item.code));
    lines.forEach((line, index) => detailed.push({
      id: `CARTEIRA:${item.code}:${line.sourceRow || index + 1}:${index}`,
      direction: 'ENTRADA',
      stage: 'PREVISTA',
      kind: 'ENTRADA_PREVISTA_CARTEIRA',
      status: 'Entrada prevista',
      movement: 'Carteira',
      date: '',
      document: '',
      order: '',
      invoice: '',
      sku: item.code,
      ean: item.ean || line.ean || '',
      product: item.description || line.description,
      partner: 'Colgate → Milênio',
      partnerDocument: '',
      cases: Number(line.totalCases) || 0,
      looseUnits: 0,
      totalUnits: Number(line.totalUnits) || 0,
      value: Number(line.costValue) || 0,
      origin: 'CARTEIRA',
      orderQtyCases: Number(line.orderQty) || 0,
      billQtyCases: Number(line.billQty) || 0,
      unitsPerCase: Number(line.unitsPerCase) || 0,
      unitsPerCaseSource: line.unitsPerCaseSource,
      sourceRow: Number(line.sourceRow) || index + 1,
      saleValue: Number(line.saleValue) || 0,
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

function packingChecks(result: StockPresentation): StockReconciliationCheck[] {
  const rows: StockReconciliationCheck[] = [];
  result.products.forEach(product => {
    if (product.physicalTotalUnits > 0) {
      rows.push(product.unitsPerCase > 0
        ? { id:`stock.packaging.internal.${product.code}`, label:`Un/CX interno ${product.code}`, expected:product.unitsPerCase, calculated:product.unitsPerCase, difference:0, status:'OK', source:'8013 · PESO CDA / PESO UNIDADE', note:'Usado apenas para decompor o físico 105 em caixas completas e unidades avulsas.' }
        : { id:`stock.packaging.internal.${product.code}`, label:`Un/CX interno ${product.code}`, expected:'fator interno', calculated:'UNKNOWN', difference:null, status:'BLOCKED', source:'8013', note:'Físico 105 preservado em unidades; nenhuma caixa foi inventada.' });
    }
    if (product.pendingCases > 0) {
      rows.push(product.industryUnitsPerCase > 0
        ? { id:`stock.packaging.industry.${product.code}`, label:`Un/CX indústria ${product.code}`, expected:product.industryUnitsPerCase, calculated:product.industryUnitsPerCase, difference:0, status:'OK', source:'Lista de Preço Colgate', note:'Usado exclusivamente na conversão da Carteira Colgate.' }
        : { id:`stock.packaging.industry.${product.code}`, label:`Un/CX indústria ${product.code}`, expected:'fator indústria', calculated:'UNKNOWN', difference:null, status:'BLOCKED', source:'Lista de Preço Colgate', note:'Carteira preservada em caixas; unidades não foram inventadas.' });
    }
  });
  return rows;
}

function portfolioReconciliation(result: StockPresentation): StockReconciliationCheck[] {
  const pending = result.products.filter(product => product.pendingCases > 0 || product.pendingUnits > 0);
  const rows = pending.map<StockReconciliationCheck>(product => {
    if (product.industryUnitsPerCase <= 0) return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX indústria = unidades`, expected: null, calculated: product.pendingUnits, difference: null, status: 'BLOCKED', source: 'Carteira + Lista de Preço Colgate', note: 'Fator Un/CX indústria não confirmado para este SKU.' };
    const expected = product.pendingCases * product.industryUnitsPerCase;
    const difference = product.pendingUnits - expected;
    return { id: `stock.portfolio.sku.${product.code}`, label: `Carteira ${product.code}: caixas × Un/CX indústria = unidades`, expected, calculated: product.pendingUnits, difference, status: Math.abs(difference) <= 0.001 ? 'OK' : 'DIVERGENT', source: 'Carteira + Lista de Preço Colgate', note: `${product.pendingCases.toLocaleString('pt-BR')} cx × ${product.industryUnitsPerCase.toLocaleString('pt-BR')} Un/CX indústria` };
  });
  rows.push({ id: 'stock.portfolio.quantity.rule', label: 'Regra de quantidade da Carteira: Order Qty + Bill Qty', expected: 'Order Qty + Bill Qty', calculated: 'Order Qty + Bill Qty', difference: null, status: 'OK', source: 'Carteira', note: 'Regra confirmada: se houver valor nas duas colunas, ambos são somados; a conversão para unidades ocorre somente pelo Un/CX indústria.' });
  return rows;
}

function enrichReconciliation(result: StockPresentation): StockPresentation {
  return { ...result, reconciliation: [...result.reconciliation, ...packingChecks(result), ...portfolioReconciliation(result)] };
}

export function buildStockPresentation(input: StockPresentationInputWithPackaging) {
  const restoredInventory = restoreLaunchCatalog(input.inventory || [], input.productSupport || []);
  const { itemCodeSupport: _itemCodeSupport, ...coreInput } = { ...input, inventory: restoredInventory };
  const inferred105 = restoredInventory.some(item => Boolean((item as InventoryWithPackaging).physicalSource105));
  const result = buildCore({ ...coreInput, hasStock105: input.hasStock105 ?? inferred105, productSupport: input.productSupport || [] });
  return enrichReconciliation(
    enrichRealizedReceiptMovements(
      enrichPortfolioMovements(
        enrichMovementPackaging(refreshOperationalNoWinthorCount(result)),
        restoredInventory,
      ),
    ),
  );
}
