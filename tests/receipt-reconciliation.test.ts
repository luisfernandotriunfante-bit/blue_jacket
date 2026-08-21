import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyReceiptReconciliation, receiptItemKey } from '../src/services/receiptReconciliation.ts';

function baseCanonical() {
  return {
    schemaVersion: 2,
    generatedAt: '', referenceDate: '2026-08-21', periodStart: '2026-08-01', periodEnd: '2026-08-31',
    sources: [],
    support: {
      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
      products: [{ sku: '988', ean: '7890000000000', description: 'Produto 988', category: '', subcategory: '', brand: '', isLaunch: false, boxPrice: 0, unitPrice: 0, unitsPerCase: 10, line: '' }],
      itemCodes: [{ internalCode: '988', description: 'Produto 988', ean: '7890000000000', factoryCode: '988' }],
    },
    transactions: [], daily: [], history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: 100000, average3MonthKeys: [] },
    industryTarget: 0, industryPositivityTarget: 0,
    sellOut: { invoiced: 0, toInvoice: 0, total: 0, sellOutTarget: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0, industryPositivityTarget: 0, positivityAttainment: 0, ticketAverage: 0, businessDaysTotal: 20, businessDaysElapsed: 10, businessDaysRemaining: 10, invoicedDailyAverage: 0, totalDailyAverage: 0, neededDailyAverage: 0, invoicedTrend: 0, totalTrend: 0 },
    stock: { costValue: 50000, saleValue: 65000, pendingPurchaseCost: 10000, pendingPurchaseSale: 13000, projectedCostValue: 60000, projectedSaleValue: 78000, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 20, coverageProjectedDays: 23, coverageCostCurrentDays: 15, coverageCostProjectedDays: 18, coverageTargetDays: 60 },
    inventory: [{ code: '988', description: 'Produto 988', ean: '7890000000000', quantity: 100, costUnit: 10, saleUnit: 13, pendingQty: 1000, pendingCases: 100, pendingCost: 10000, pendingSale: 13000, isLaunch: false, hasWinthor: true, factoryCode: '988', physicalCases: 0, physicalUnits: 0, grossKg: 0 }],
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
  } as any;
}

function state({ legacy = true }: { legacy?: boolean } = {}) {
  return {
    version: 1,
    tablePriceFileName: '', tablePrices: {},
    entry218FileName: 'entrada-notas-218.xls',
    currentInvoices: [{ invoice: '2953129', entryDate: '2026-08-20', issueDate: '2026-08-19', totalValue: 2000, source: '218' }],
    receiptItems: [{ invoice: '2953129', entryDate: '2026-08-20', issueDate: '2026-08-19', sku: '988', product: 'Produto 988', units: 100, unitPrice: 20, supplierName: 'Colgate', supplierDocument: '' }],
    legacy12322FileName: legacy ? '12.322.txt' : '',
    legacyInvoices: legacy ? [{ invoice: '2953129', entryDate: '2026-08-20', issueDate: '2026-08-19', totalValue: 2000, source: '12.322' }] : [],
    portfolioFileName: 'carteira.xlsx',
    portfolioRows: [{ sourceRow: 2, materialCode: '988', description: 'Produto 988', orderQty: 60, billQty: 40, costValue: 10000, invoice: '' }],
    portfolioInvoiceColumnDetected: false,
    portfolioHeader: [],
  } as any;
}

const config = { sellOutTarget: 0, coverageTargetDays: 60, portfolioSaleMarkup: 0.3, networkTargets: {}, holidays: [], lineShares: {} } as any;

test('mantém Order Qty + Bill Qty como base física da Carteira', () => {
  const result = applyReceiptReconciliation(baseCanonical(), state({ legacy: false }), config, new Set());
  assert.equal(result.canonical.inventory[0].pendingCases, 100);
  assert.equal(result.canonical.inventory[0].pendingQty, 1000);
});

test('12.322 abate financeiramente a NF recebida sem alterar quantidade física sozinho', () => {
  const result = applyReceiptReconciliation(baseCanonical(), state(), config, new Set());
  assert.equal(result.canonical.inventory[0].pendingQty, 1000);
  assert.equal(result.canonical.inventory[0].pendingCases, 100);
  assert.equal(result.canonical.stock.pendingPurchaseCost, 8000);
  assert.equal(result.canonical.stock.pendingPurchaseSale, 10400);
  assert.equal(result.audit.legacyAppliedCost, 2000);
});

test('218 só abate quantidade depois de confirmação item a item e não duplica financeiro do 12.322', () => {
  const operational = state();
  const key = receiptItemKey(operational.receiptItems[0], 0);
  const result = applyReceiptReconciliation(baseCanonical(), operational, config, new Set([key]));
  assert.equal(result.canonical.inventory[0].pendingQty, 900);
  assert.equal(result.canonical.inventory[0].pendingCases, 90);
  assert.equal(result.canonical.stock.pendingPurchaseCost, 8000);
  assert.equal(result.audit.confirmedItemCost, 0);
});

test('218 confirmado abate também o financeiro quando a NF não está no 12.322', () => {
  const operational = state({ legacy: false });
  const key = receiptItemKey(operational.receiptItems[0], 0);
  const result = applyReceiptReconciliation(baseCanonical(), operational, config, new Set([key]));
  assert.equal(result.canonical.inventory[0].pendingQty, 900);
  assert.equal(result.canonical.stock.pendingPurchaseCost, 8000);
  assert.equal(result.audit.confirmedItemCost, 2000);
});

test('configurações expõe etapa explícita de confirmação dos itens do 218', () => {
  const page = fs.readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /Conferir itens do 218 antes de baixar a Carteira/);
  assert.match(page, /Aplicar confirmações/);
  assert.match(page, /12\.322 · já coberto/);
});

test('hidratação reaplica reconciliação de recebimentos após restaurar a base', () => {
  const context = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8');
  assert.match(context, /applyReceiptReconciliation/);
  assert.match(context, /loadReceiptConfirmations/);
});
