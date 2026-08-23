import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation, DEFAULT_STOCK_ALERT_CONFIGURATION } from '../src/domain/stockModel.ts';
import { loadStockAlertConfiguration, normalizeStockAlertConfiguration, saveStockAlertConfiguration } from '../src/store/stockPreferences.ts';
import type { CanonicalInventoryProduct, CanonicalProductSupport, CanonicalSalesTransaction } from '../src/domain/canonical.ts';

type CanonicalStockFixture = CanonicalInventoryProduct & {
  internalUnitsPerCase: number | null;
  industryUnitsPerCase: number | null;
  physicalSource105: boolean;
};

function inventory(overrides: Partial<CanonicalStockFixture> = {}): CanonicalStockFixture {
  return {
    code: '100', description: 'Produto', ean: '7891024000001', quantity: 100,
    costUnit: 2, saleUnit: 3, pendingQty: 30, pendingCases: 2.5, pendingCost: 60, pendingSale: 90,
    isLaunch: false, hasWinthor: true, factoryCode: 'MAT1',
    // Campos 8013 abaixo existem somente para auditoria e não definem o físico canônico.
    physicalCases: 999, physicalUnits: 9999, grossKg: 0,
    internalUnitsPerCase: 12, industryUnitsPerCase: 12, physicalSource105: true,
    ...overrides,
  };
}

function master(overrides: Partial<CanonicalProductSupport> = {}): CanonicalProductSupport {
  return {
    sku: 'MAT1', ean: '7891024000001', description: 'Produto', category: '', subcategory: '', brand: 'Colgate',
    isLaunch: false, boxPrice: 0, unitPrice: 0, unitsPerCase: 12, line: '',
    ...overrides,
  };
}

function sale(overrides: Partial<CanonicalSalesTransaction> = {}): CanonicalSalesTransaction {
  return {
    date: '2026-08-19', status: 'A FATURAR', clientCode: '1', clientName: 'Cliente', cnpj: '00000000000001', city: '',
    vendorCode: '1', vendorName: 'Vendedor', supervisorCode: '', supervisorName: '', manufacturerCode: 'MAT1', ean: '7891024000001',
    internalProductCode: '100', productDescription: 'Produto', cases: 1, units: 20, value: 100, saleType: 'VENDA', line: '',
    ...overrides,
  };
}

test('estoque decompõe o físico 105 em caixas internas e unidades avulsas sem descartar residual', () => {
  const result = buildStockPresentation({ inventory: [inventory({ quantity: 125 })], productSupport: [master()], hasStock105: true, stockCostValue: 250, stockSaleValue: 375 });
  assert.equal(result.products[0].physicalCases, 10);
  assert.equal(result.products[0].looseUnits, 5);
  assert.equal(result.products[0].physicalTotalUnits, 125);
  assert.equal(result.products[0].equivalentCases, 125 / 12);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.quantity.formula')?.status, 'OK');
});

test('posição física 105 subtrai a reserva exatamente uma vez', () => {
  const result = buildStockPresentation({ inventory: [inventory({ quantity: 100 })], productSupport: [master()], transactions: [sale()], hasStock105: true });
  assert.equal(result.reservation.mode, 'POSICAO_BRUTA');
  assert.equal(result.products[0].reservedUnits, 20);
  assert.equal(result.products[0].availableUnits, 80);
  assert.equal(result.products[0].projectedUnits, 110);
});

test('8013 divergente não transforma a posição 105 em saldo líquido nem substitui o físico', () => {
  const result = buildStockPresentation({ inventory: [inventory({ quantity: 80, physicalUnits: 100, physicalCases: 8 })], productSupport: [master()], transactions: [sale()], hasStock105: true, hasStock8013: true });
  assert.equal(result.reservation.mode, 'POSICAO_BRUTA');
  assert.equal(result.products[0].physicalTotalUnits, 80);
  assert.equal(result.products[0].reservedUnits, 20);
  assert.equal(result.products[0].availableUnits, 60);
  assert.equal(result.products[0].projectedUnits, 90);
});

test('sem posição 105 comprovada a reserva não é subtraída silenciosamente', () => {
  const result = buildStockPresentation({ inventory: [inventory({ quantity: 90, physicalSource105: false })], productSupport: [master()], transactions: [sale()], hasStock105: false, hasStock8013: true });
  assert.equal(result.reservation.mode, 'SEM_EVIDENCIA');
  assert.equal(result.products[0].availableUnits, 90);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.reservation.mode')?.status, 'BLOCKED');
});

test('Carteira entra como movimento de entrada prevista e participa somente do projetado', () => {
  const result = buildStockPresentation({ inventory: [inventory()], productSupport: [master()], transactions: [], hasStock105: true });
  const movement = result.movements.find(item => item.kind === 'ENTRADA_PREVISTA_CARTEIRA');
  assert.ok(movement);
  assert.equal(movement?.direction, 'ENTRADA');
  assert.equal(movement?.stage, 'PREVISTA');
  assert.equal(movement?.totalUnits, 30);
  assert.equal(result.products[0].availableUnits, 100);
  assert.equal(result.products[0].projectedUnits, 130);
  assert.equal(result.reconciliation.find(check => check.id === 'stock.projected.units')?.status, 'OK');
  assert.equal(result.reconciliation.find(check => check.id === 'stock.portfolio.units')?.status, 'OK');
});

test('8022 gera saídas faturadas e reservadas sem inventar documento ou NF', () => {
  const result = buildStockPresentation({
    inventory: [inventory({ pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0 })], productSupport: [master()],
    transactions: [sale({ status: 'FATURADO', units: 12, value: 50 }), sale({ status: 'A FATURAR', units: 20, value: 100 })], hasStock105: true,
  });
  assert.equal(result.movements.filter(item => item.kind === 'SAIDA_FATURADA').length, 1);
  assert.equal(result.movements.filter(item => item.kind === 'SAIDA_RESERVADA_PEDIDO').length, 1);
  assert.ok(result.movements.every(item => item.document === '' && item.invoice === '' && item.order === ''));
});

test('estoque zero com Winthor permanece ruptura por padrão e limites de cobertura continuam configuráveis', () => {
  const zero = inventory({ quantity: 0, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: true });
  const defaultResult = buildStockPresentation({ inventory: [zero], productSupport: [master()], hasStock105: true, alertConfiguration: DEFAULT_STOCK_ALERT_CONFIGURATION });
  assert.ok(defaultResult.alerts.some(alert => alert.kind === 'RUPTURA'));
  assert.ok(!defaultResult.alerts.some(alert => alert.kind === 'ESTOQUE_ZERADO'));
  assert.ok(defaultResult.alerts.some(alert => alert.kind === 'LANCAMENTO_SEM_ESTOQUE'));
  assert.ok(!defaultResult.alerts.some(alert => alert.kind === 'RISCO_RUPTURA' || alert.kind === 'BAIXO_ESTOQUE' || alert.kind === 'EXCESSO_ESTOQUE'));

  const explicitlyDisabled = buildStockPresentation({ inventory: [zero], productSupport: [master()], hasStock105: true, alertConfiguration: { ...DEFAULT_STOCK_ALERT_CONFIGURATION, zeroStockAsRupture: false } });
  assert.ok(explicitlyDisabled.alerts.some(alert => alert.kind === 'ESTOQUE_ZERADO'));
  assert.ok(!explicitlyDisabled.alerts.some(alert => alert.kind === 'RUPTURA'));
});

test('reconciliação não esconde ausência de Un/CX interno nem reserva sem SKU', () => {
  const result = buildStockPresentation({
    inventory: [inventory({ factoryCode: '', ean: '', quantity: 10, internalUnitsPerCase: null })], productSupport: [],
    transactions: [sale({ internalProductCode: '999', manufacturerCode: 'NAO-MAPEADO', ean: '', units: 5 })], hasStock105: true,
  });
  assert.equal(result.reconciliation.find(check => check.id === 'stock.quantity.internal-conversion')?.status, 'BLOCKED');
  assert.equal(result.reconciliation.find(check => check.id === 'stock.reserved.unresolved')?.status, 'BLOCKED');
  assert.equal(result.reservation.unresolvedReservedUnits, 5);
  assert.equal(result.products[0].physicalTotalUnits, 10);
  assert.equal(result.products[0].physicalCases, 0);
});

test('configuração de alertas de estoque é persistida por competência', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  saveStockAlertConfiguration(storage, '2026-08', { zeroStockAsRupture: false, riskCoverageDays: 7, lowCoverageDays: 15, excessCoverageDays: 90 });
  assert.equal(loadStockAlertConfiguration(storage, '2026-08').zeroStockAsRupture, false);
  assert.equal(loadStockAlertConfiguration(storage, '2026-08').riskCoverageDays, 7);
  assert.equal(loadStockAlertConfiguration(storage, '2026-09').zeroStockAsRupture, true);
  assert.equal(loadStockAlertConfiguration(storage, '2026-09').riskCoverageDays, null);
  assert.equal(normalizeStockAlertConfiguration({}).zeroStockAsRupture, true);
});
