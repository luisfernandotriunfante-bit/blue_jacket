import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct } from '../src/domain/canonical.ts';

test('motor de estoque usa Master/Un-CX carregado no inventário mesmo sem Lista de Preços', () => {
  const inventory = [{
    code: '100', description: 'Produto', ean: '7891024000001', quantity: 125, costUnit: 2, saleUnit: 3,
    pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true,
    factoryCode: 'MAT1', physicalCases: 10, physicalUnits: 125, grossKg: 0, unitsPerCase: 12,
  }] as Array<CanonicalInventoryProduct & { unitsPerCase: number }>;
  const result = buildStockPresentation({ inventory, productSupport: [], hasStock8013: true });
  assert.equal(result.products[0].unitsPerCase, 12);
  assert.equal(result.products[0].physicalCases, 10);
  assert.equal(result.products[0].looseUnits, 5);
  assert.equal(result.products[0].physicalTotalUnits, 125);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.quantity.formula')?.status, 'OK');
});
