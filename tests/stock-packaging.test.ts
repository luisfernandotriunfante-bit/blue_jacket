import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct } from '../src/domain/canonical.ts';

function packaged(overrides: Partial<CanonicalInventoryProduct & { unitsPerCase: number }> = {}) {
  return {
    code: '100', description: 'Produto', ean: '7891024000001', quantity: 125, costUnit: 2, saleUnit: 3,
    pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true,
    factoryCode: 'MAT1', physicalCases: 10, physicalUnits: 125, grossKg: 0, unitsPerCase: 12,
    ...overrides,
  } as CanonicalInventoryProduct & { unitsPerCase: number };
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
