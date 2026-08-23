import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateHistoricalCustomerProduct } from '../src/services/motors/historicalMotor.ts';

const base: any = {
  historicalSalesFactId: 'x', movementDate: '2026-01-01', invoiceNumber: '1', invoiceSeries: '1',
  legacyProductCode: '11111111', historicalGtin: '', gtinType: 'UNKNOWN', itemCanonicalId: '',
  quantityRaw: 0, signedQuantity: 0, valueRaw: 0, signedValue: 0, discountRaw: 0, signedDiscount: 0,
  operationCode: '', cfop: '', movementClass: 'SALE', orderNumber: '', supplier: '',
  customerCnpj: '03683158000100', customerRaw: '03683158000100', customerCanonicalId: 'CNPJ:03683158000100',
  legacyRcaCode: '1', rcaCanonicalId: '', netWeight: 0, grossWeight: 0, historicalCity: '',
  historicalCoordinator: '', historicalNetwork: '', historicalBranch: '', historicalGroup: '', qtdCx: 0,
  sourceYear: 2026, source: '379',
};

test('379 agrega quantidade líquida assinada compatível com 310.Volumes', () => {
  const sale = { ...base, historicalSalesFactId: 's', quantityRaw: 10, signedQuantity: 10, valueRaw: 100, signedValue: 100, movementClass: 'SALE' };
  const ret = { ...base, historicalSalesFactId: 'r', invoiceNumber: '2', quantityRaw: 2, signedQuantity: -2, valueRaw: 20, signedValue: -20, movementClass: 'RETURN' };
  const [agg] = aggregateHistoricalCustomerProduct([sale, ret]);
  assert.equal(agg.grossSaleUnits, 10);
  assert.equal(agg.returnUnits, 2);
  assert.equal(Math.abs(agg.netSignedUnits), 8);
  assert.equal(agg.netSalesValue, 80);
  assert.equal(agg.period, '2026');
});

test('YTD histórico usa apenas o ano mais recente quando 379 de 2025 e 2026 coexistem', () => {
  const sale2025 = { ...base, historicalSalesFactId: '2025', movementDate: '2025-07-01', sourceYear: 2025, quantityRaw: 40, signedQuantity: 40, valueRaw: 400, signedValue: 400 };
  const sale2026 = { ...base, historicalSalesFactId: '2026', movementDate: '2026-07-01', sourceYear: 2026, quantityRaw: 10, signedQuantity: 10, valueRaw: 100, signedValue: 100 };
  const aggregate = aggregateHistoricalCustomerProduct([sale2025, sale2026]);
  assert.equal(aggregate.length, 1);
  assert.equal(aggregate[0].period, '2026');
  assert.equal(aggregate[0].grossSaleUnits, 10);
  assert.equal(aggregate[0].netSalesValue, 100);
});

test('agregação histórica explícita continua permitindo consultar período fora do YTD sem apagar fatos de outros anos', () => {
  const sale2025 = { ...base, historicalSalesFactId: '2025', movementDate: '2025-07-01', sourceYear: 2025, quantityRaw: 40, signedQuantity: 40, valueRaw: 400, signedValue: 400 };
  const sale2026 = { ...base, historicalSalesFactId: '2026', movementDate: '2026-07-01', sourceYear: 2026, quantityRaw: 10, signedQuantity: 10, valueRaw: 100, signedValue: 100 };
  const aggregate = aggregateHistoricalCustomerProduct([sale2025, sale2026], 'TODOS');
  assert.equal(aggregate.length, 1);
  assert.equal(aggregate[0].period, 'TODOS');
  assert.equal(aggregate[0].grossSaleUnits, 50);
  assert.equal(aggregate[0].netSalesValue, 500);
});

test('reconciliação 310 usa ABS(netSignedUnits), nunca quantidade bruta de vendas, para Volumes', () => {
  const source = fs.readFileSync(new URL('../src/services/motors/unifiedEngine.ts', import.meta.url), 'utf8');
  assert.match(source, /Math\.abs\(Math\.abs\(row\.netSignedUnits\) - purchase\.volumes\)/);
  assert.doesNotMatch(source, /row\.grossSaleUnits - purchase\.volumes/);
});
