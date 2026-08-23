import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { StockPortfolioLine, StockPortfolioMovement } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct, CanonicalProductSupport, CanonicalSalesTransaction } from '../src/domain/canonical.ts';

type PackagedInventory = CanonicalInventoryProduct & {
  internalUnitsPerCase: number | null;
  industryUnitsPerCase: number | null;
  physicalSource105: boolean;
  portfolioLines?: StockPortfolioLine[];
};

function packaged(overrides: Partial<PackagedInventory> = {}): PackagedInventory {
  return {
    code: '100', description: 'Produto', ean: '7891024000001', quantity: 125, costUnit: 2, saleUnit: 3,
    pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true,
    factoryCode: 'MAT1', physicalCases: 999, physicalUnits: 9999, grossKg: 0,
    internalUnitsPerCase: 12, industryUnitsPerCase: 12, physicalSource105: true,
    ...overrides,
  };
}

function sale(overrides: Partial<CanonicalSalesTransaction> = {}): CanonicalSalesTransaction {
  return {
    date: '2026-08-19', status: 'FATURADO', clientCode: '1', clientName: 'Cliente', cnpj: '00000000000001', city: '',
    vendorCode: '1', vendorName: 'Vendedor', supervisorCode: '', supervisorName: '', manufacturerCode: 'MAT1', ean: '7891024000001',
    internalProductCode: '100', productDescription: 'Produto', cases: 1, units: 15, value: 100, saleType: 'VENDA', line: '',
    ...overrides,
  };
}

function launchMaster(ean = '7891024999999'): CanonicalProductSupport {
  return { sku: 'MAT-LANC', ean, description: 'Lançamento persistido', category: '', subcategory: '', brand: 'Marca', isLaunch: true, boxPrice: 0, unitPrice: 9.9, unitsPerCase: 12, line: '' };
}

test('motor de estoque usa Un/CX interno materializado no inventário mesmo sem Lista de Preço', () => {
  const result = buildStockPresentation({ inventory: [packaged()], productSupport: [], hasStock105: true });
  assert.equal(result.products[0].unitsPerCase, 12);
  assert.equal(result.products[0].physicalCases, 10);
  assert.equal(result.products[0].looseUnits, 5);
  assert.equal(result.products[0].physicalTotalUnits, 125);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.quantity.formula')?.status, 'OK');
});

test('flag legado de 8013 sem evidência 105 não zera nem substitui a posição carregada', () => {
  const result = buildStockPresentation({ inventory: [packaged({ quantity: 120, physicalCases: 0, physicalUnits: 0, grossKg: 0, physicalSource105: false })], productSupport: [], hasStock105: false, hasStock8013: true });
  assert.equal(result.products[0].physicalTotalUnits, 120);
  assert.equal(result.reservation.mode, 'SEM_EVIDENCIA');
});

test('Carteira é reconciliada pelo Un/CX indústria e regra Order Qty + Bill Qty permanece validada', () => {
  const result = buildStockPresentation({ inventory: [packaged({ pendingCases: 2, pendingQty: 24, pendingCost: 50, industryUnitsPerCase: 12 })], productSupport: [], hasStock105: true });
  const rule = result.reconciliation.find(check => check.id === 'stock.portfolio.quantity.rule');
  assert.equal(result.reconciliation.find(check => check.id === 'stock.portfolio.sku.100')?.status, 'OK');
  assert.equal(result.reconciliation.find(check => check.id === 'stock.portfolio.conversion')?.status, 'OK');
  assert.equal(rule?.status, 'OK');
  assert.equal(rule?.calculated, 'Order Qty + Bill Qty');
});

test('Carteira preserva Order Qty e Bill Qty linha a linha na movimentação', () => {
  const item = packaged({ pendingCases: 12, pendingQty: 144, pendingCost: 100, pendingSale: 130, industryUnitsPerCase: 12 });
  item.portfolioLines = [{ sourceRow: 7, materialCode: 'MAT1', orderQty: 5, billQty: 7, totalCases: 12, unitsPerCase: 12, unitsPerCaseSource: 'PRICE_LIST', totalUnits: 144, costValue: 100, saleValue: 130, internalCode: '100', ean: item.ean, description: item.description, hasWinthor: true }];
  const result = buildStockPresentation({ inventory: [item], productSupport: [], hasStock105: true });
  const entries = result.movements.filter(movement => movement.kind === 'ENTRADA_PREVISTA_CARTEIRA') as StockPortfolioMovement[];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceRow, 7);
  assert.equal(entries[0].orderQtyCases, 5);
  assert.equal(entries[0].billQtyCases, 7);
  assert.equal(entries[0].cases, 12);
  assert.equal(entries[0].unitsPerCase, 12);
  assert.equal(entries[0].totalUnits, 144);
});

test('lançamento persistido no suporte reaparece após novo snapshot de estoque', () => {
  const ean = '7891024999999';
  const result = buildStockPresentation({ inventory: [packaged({ ean: '7891024000001', factoryCode: 'MAT1', isLaunch: false })], productSupport: [launchMaster(ean)], hasStock105: true });
  const restored = result.products.find(product => product.ean === ean);
  assert.ok(restored);
  assert.equal(restored?.isLaunch, true);
  assert.equal(restored?.industryUnitsPerCase, 12);
  assert.equal(restored?.unitsPerCase, 0);
  assert.equal(result.summary.launchCount, 1);
});

test('lançamento marcado no suporte prevalece sobre flag zerada do snapshot', () => {
  const ean = '7891024888888';
  const result = buildStockPresentation({ inventory: [packaged({ ean, factoryCode: 'MAT-LANC', isLaunch: false })], productSupport: [launchMaster(ean)], hasStock105: true });
  assert.equal(result.products.find(product => product.ean === ean)?.isLaunch, true);
  assert.equal(result.summary.launchCount, 1);
});

test('movimento de saída usa Un/CX interno e calcula somente o residual comprovável como avulsa', () => {
  const result = buildStockPresentation({ inventory: [packaged()], productSupport: [], transactions: [sale()], hasStock105: true });
  const movement = result.movements.find(item => item.kind === 'SAIDA_FATURADA');
  assert.equal(movement?.cases, 1);
  assert.equal(movement?.totalUnits, 15);
  assert.equal(movement?.looseUnits, 3);
});

test('diferença entre Un/CX interno e indústria é legítima e não bloqueia nenhum dos dois cálculos', () => {
  const result = buildStockPresentation({ inventory: [packaged({ quantity: 100, internalUnitsPerCase: 12, industryUnitsPerCase: 24, pendingCases: 2, pendingQty: 48 })], productSupport: [], hasStock105: true });
  const product = result.products[0];
  assert.equal(product.unitsPerCase, 12);
  assert.equal(product.industryUnitsPerCase, 24);
  assert.equal(product.physicalCases, 8);
  assert.equal(product.looseUnits, 4);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.portfolio.sku.100')?.status, 'OK');
  assert.ok(!result.reconciliation.some(check => check.status === 'DIVERGENT' && check.id.includes('packaging')));
});

test('hasWinthor permanece factual e Sem Winthor operacional só conta item efetivamente presente na Carteira', () => {
  const catalogOnly = buildStockPresentation({ inventory: [packaged({ hasWinthor: false, pendingCases: 0, pendingQty: 0 })], productSupport: [], hasStock105: true });
  assert.equal(catalogOnly.products[0].hasWinthor, false);
  assert.equal(catalogOnly.summary.noWinthorCount, 0);
  assert.equal(catalogOnly.alerts.some(alert => alert.kind === 'SEM_WINTHOR'), false);

  const portfolioItem = buildStockPresentation({ inventory: [packaged({ hasWinthor: false, pendingCases: 1, pendingQty: 12, pendingCost: 30, industryUnitsPerCase: 12 })], productSupport: [], hasStock105: true });
  assert.equal(portfolioItem.products[0].hasWinthor, false);
  assert.equal(portfolioItem.summary.noWinthorCount, 1);
  assert.equal(portfolioItem.alerts.some(alert => alert.kind === 'SEM_WINTHOR'), true);
});
