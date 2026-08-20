import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProdutoEstoque } from '../src/store/DataContext.tsx';
import type { CanonicalStockSummary } from '../src/domain/canonical.ts';
import { buildSellOutStockPolicy, resolvePortfolioPositionDate, summarizePortfolioAge } from '../src/domain/portfolioPolicy.ts';
import { applyPortfolio } from '../src/services/canonical/operations.ts';
import type { ProductMaster } from '../src/services/canonical/runtime.ts';
import { gtin13 } from './helpers.ts';

function stock(overrides: Partial<CanonicalStockSummary> = {}): CanonicalStockSummary {
  return {
    costValue: 12_500_000,
    saleValue: 17_500_000,
    pendingPurchaseCost: 13_500_000,
    pendingPurchaseSale: 17_700_000,
    projectedCostValue: 26_000_000,
    projectedSaleValue: 35_200_000,
    physicalUnits: 2_200_000,
    physicalCases: 73_000,
    grossKg: 0,
    coverageCurrentDays: 42,
    coverageProjectedDays: 84,
    coverageCostCurrentDays: 30,
    coverageCostProjectedDays: 63,
    coverageTargetDays: 60,
    ...overrides,
  };
}

function master(sku: string, ean: string, unitsPerCase: number): ProductMaster {
  return { sku, ean, description: sku, category: '', subcategory: '', brand: '', isLaunch: false, boxPrice: 0, unitPrice: 0, unitsPerCase, line: '' };
}

test('gerador de Sell Out usa estoque atual como base e mantém Carteira somente no cenário projetado', () => {
  const policy = buildSellOutStockPolicy(stock());
  assert.equal(policy.portfolioAffectsOperationalBase, false);
  assert.equal(policy.operational.saleValue, 17_500_000);
  assert.equal(policy.operational.coverageSaleDays, 42);
  assert.equal(policy.transitScenario.portfolioCostValue, 13_500_000);
  assert.equal(policy.transitScenario.projectedSaleValue, 35_200_000);
  assert.equal(policy.transitScenario.projectedCoverageSaleDays, 84);
});

test('posição da Carteira é inferida do nome do arquivo quando houver DD.MM', () => {
  assert.equal(resolvePortfolioPositionDate('CARTEIRA 17.08.xlsx', '2026-08-19'), '2026-08-17');
  assert.equal(resolvePortfolioPositionDate('CARTEIRA.xlsx', '2026-08-19'), '2026-08-19');
});

test('idade da Carteira separa até 30, 31–60, 61–90 e acima de 90 dias sem alterar valores', () => {
  const result = summarizePortfolioAge([
    { orderDate: '2026-08-10', totalCases: 1, costValue: 100 },
    { orderDate: '2026-07-01', totalCases: 2, costValue: 200 },
    { orderDate: '2026-06-01', totalCases: 3, costValue: 300 },
    { orderDate: '2026-05-01', totalCases: 4, costValue: 400 },
    { billingDate: '2026-08-15', totalCases: 5, costValue: 500 },
  ], '2026-08-17');

  assert.equal(result.totalLines, 5);
  assert.equal(result.datedLines, 5);
  assert.equal(result.buckets.find(bucket => bucket.key === 'ATE_30')?.costValue, 600);
  assert.equal(result.buckets.find(bucket => bucket.key === '31_60')?.costValue, 200);
  assert.equal(result.buckets.find(bucket => bucket.key === '61_90')?.costValue, 300);
  assert.equal(result.buckets.find(bucket => bucket.key === 'MAIS_90')?.costValue, 400);
  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.costValue, 0), 1500);
});

test('parser da Carteira preserva Order Date e Billing Date junto da regra Order Qty + Bill Qty', () => {
  const ean = gtin13('789000000021');
  const productMaster = master('MAT-DATA', ean, 12);
  const cadastro = { byInternal: new Map([['120', { description: 'Produto Data', ean, factoryCode: 'MAT-DATA', unitsPerCase: 12 }]]), factoryToInternal: new Map([['MAT-DATA', '120']]) };
  const priceList = { bySku: new Map([['MAT-DATA', productMaster]]), byEan: new Map([[ean, productMaster]]) };
  const products = new Map<string, ProdutoEstoque>();
  const header = ['Order Date', 'Billing Date', '', '', 'Material', '', 'Order Qty', 'Bill Qty', 'Net Value (ZINV)'];
  const row = ['2026-07-15', '2026-08-01', '', '', 'MAT-DATA', '', 3, 2, 500];
  const result = applyPortfolio([header, row], products, cadastro, priceList, 0);

  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].orderDate, '2026-07-15');
  assert.equal(result.lines[0].billingDate, '2026-08-01');
  assert.equal(result.lines[0].totalCases, 5);
  assert.equal(result.lines[0].totalUnits, 60);
  assert.equal(result.cost, 500);
});
