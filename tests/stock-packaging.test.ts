import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct, CanonicalSalesTransaction } from '../src/domain/canonical.ts';

function packaged(overrides: Partial<CanonicalInventoryProduct & { unitsPerCase: number }> = {}) {
  return {
    code: '100', description: 'Produto', ean: '7891024000001', quantity: 125, costUnit: 2, saleUnit: 3,
    pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true,
    factoryCode: 'MAT1', physicalCases: 10, physicalUnits: 125, grossKg: 0, unitsPerCase: 12,
    ...overrides,
  } as CanonicalInventoryProduct & { unitsPerCase: number };
}

function sale(overrides: Partial<CanonicalSalesTransaction> = {}): CanonicalSalesTransaction {
  return {
    date: '2026-08-19', status: 'FATURADO', clientCode: '1', clientName: 'Cliente', cnpj: '00000000000001', city: '',
    vendorCode: '1', vendorName: 'Vendedor', supervisorCode: '', supervisorName: '', manufacturerCode: 'MAT1', ean: '7891024000001',
    internalProductCode: '100', productDescription: 'Produto', cases: 1, units: 15, value: 100, saleType: 'VENDA', line: '',
    ...overrides,
  };
}

test('motor de estoque usa Master/Un-CX carregado no inventário mesmo sem Lista de Preços', () => {
  const result = buildStockPresentation({ inventory: [packaged()], productSupport: [], hasStock8013: true });
  assert.equal(result.products[0].unitsPerCase, 12);
  assert.equal(result.products[0].physicalCases, 10);
  assert.equal(result.products[0].looseUnits, 5);
  assert.equal(result.products[0].physicalTotalUnits, 125);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.quantity.formula')?.status, 'OK');
});

test('flag legado de 8013 sem evidência física não zera a posição 105', () => {
  const result = buildStockPresentation({ inventory: [packaged({ quantity: 120, physicalCases: 0, physicalUnits: 0, grossKg: 0 })], productSupport: [], hasStock8013: true });
  assert.equal(result.products[0].physicalTotalUnits, 120);
  assert.equal(result.reservation.mode, 'SEM_EVIDENCIA');
});

test('Carteira é reconciliada por SKU e regra Order Qty + Bill Qty está validada', () => {
  const result = buildStockPresentation({ inventory: [packaged({ pendingCases: 2, pendingQty: 24, pendingCost: 50 })], productSupport: [], hasStock8013: true });
  const rule = result.reconciliation.find(check => check.id === 'stock.portfolio.quantity.rule');
  assert.equal(result.reconciliation.find(check => check.id === 'stock.portfolio.sku.100')?.status, 'OK');
  assert.equal(rule?.status, 'OK');
  assert.equal(rule?.calculated, 'Order Qty + Bill Qty');
});

test('movimento usa caixas e calcula somente o residual comprovável como unidade avulsa', () => {
  const result = buildStockPresentation({ inventory: [packaged()], productSupport: [], transactions: [sale()], hasStock8013: true });
  const movement = result.movements.find(item => item.kind === 'SAIDA_FATURADA');
  assert.equal(movement?.cases, 1);
  assert.equal(movement?.totalUnits, 15);
  assert.equal(movement?.looseUnits, 3);
});

test('Sem Winthor só permanece para item efetivamente presente na Carteira', () => {
  const catalogOnly = buildStockPresentation({ inventory: [packaged({ hasWinthor: false, pendingCases: 0, pendingQty: 0 })], productSupport: [], hasStock8013: true });
  assert.equal(catalogOnly.products[0].hasWinthor, true);
  assert.equal(catalogOnly.summary.noWinthorCount, 0);
  assert.equal(catalogOnly.alerts.some(alert => alert.kind === 'SEM_WINTHOR'), false);

  const portfolioItem = buildStockPresentation({ inventory: [packaged({ hasWinthor: false, pendingCases: 1, pendingQty: 12, pendingCost: 30 })], productSupport: [], hasStock8013: true });
  assert.equal(portfolioItem.products[0].hasWinthor, false);
  assert.equal(portfolioItem.summary.noWinthorCount, 1);
  assert.equal(portfolioItem.alerts.some(alert => alert.kind === 'SEM_WINTHOR'), true);
});
