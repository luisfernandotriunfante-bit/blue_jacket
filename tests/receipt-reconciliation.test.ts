import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyReceiptReconciliation } from '../src/services/receiptReconciliation.ts';

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

function state({ legacy = true, legacyInPortfolio = true }: { legacy?: boolean; legacyInPortfolio?: boolean } = {}) {
  return {
    version: 1,
    tablePriceFileName: '', tablePrices: {},
    entry218FileName: 'entrada-notas-218.xls',
    currentInvoices: [{ invoice: '2953129', entryDate: '2026-08-20', issueDate: '2026-08-19', totalValue: 2000, source: '218' }],
    receiptItems: [{ invoice: '2953129', entryDate: '2026-08-20', issueDate: '2026-08-19', sku: '988', product: 'Produto 988', units: 100, unitPrice: 20, supplierName: 'Colgate', supplierDocument: '' }],
    legacy12322FileName: legacy ? '12.322.txt' : '',
    legacyInvoices: legacy ? [{ invoice: '2915720', entryDate: '2026-07-30', issueDate: '2026-07-13', totalValue: 2500, source: '12.322' }] : [],
    portfolioFileName: 'carteira.xlsx',
    portfolioRows: [{ sourceRow: 2, materialCode: '988', description: 'Produto 988', orderQty: 60, billQty: 40, costValue: 2000, invoice: legacyInPortfolio ? '2915720' : '2999999', invoiceRaw: legacyInPortfolio ? '002915720-1' : '2999999', invoiceNumber: legacyInPortfolio ? '2915720' : '2999999', invoiceSeries: legacyInPortfolio ? '1' : '', invoiceNormalized: legacyInPortfolio ? '2915720-1' : '2999999' }],
    portfolioInvoiceColumnDetected: true,
    portfolioHeader: [],
  } as any;
}

const config = { sellOutTarget: 0, coverageTargetDays: 60, portfolioSaleMarkup: 0.3, networkTargets: {}, holidays: [], lineShares: {} } as any;

test('mantém Order Qty + Bill Qty quando não há recebimento que abata a Carteira', () => { const operational = state({ legacy: false }); operational.receiptItems = []; const result = applyReceiptReconciliation(baseCanonical(), operational, config); assert.equal(result.canonical.inventory[0].pendingCases, 100); assert.equal(result.canonical.inventory[0].pendingQty, 1000); });

test('12.322 abate NET VALUE, caixas e unidades da NF antiga presente na Carteira', () => {
  const operational = state(); operational.receiptItems = []; const result = applyReceiptReconciliation(baseCanonical(), operational, config);
  assert.equal(result.canonical.inventory[0].pendingQty, 0); assert.equal(result.canonical.inventory[0].pendingCases, 0); assert.equal(result.canonical.stock.pendingPurchaseCost, 8000); assert.equal(result.canonical.stock.pendingPurchaseSale, 10400); assert.equal(result.audit.legacyInvoiceCount, 1); assert.equal(result.audit.legacyMatchedInvoiceCount, 1); assert.equal(result.audit.legacyAppliedCost, 2000); assert.equal(result.audit.legacyAppliedCases, 100); assert.equal(result.audit.legacyAppliedUnits, 1000);
});

test('normaliza a série -1 da Carteira sem incorporar o dígito ao número da NF', () => { const operational = state(); operational.receiptItems = []; const result = applyReceiptReconciliation(baseCanonical(), operational, config); assert.equal(result.audit.legacyMatchedInvoiceCount, 1); });

test('12.322 não abate NF que não está presente na Carteira atual', () => { const operational = state({ legacyInPortfolio: false }); operational.receiptItems = []; const result = applyReceiptReconciliation(baseCanonical(), operational, config); assert.equal(result.canonical.stock.pendingPurchaseCost, 10000); assert.equal(result.canonical.inventory[0].pendingCases, 100); assert.equal(result.audit.legacyMatchedInvoiceCount, 0); assert.equal(result.audit.legacyAppliedCost, 0); });

test('12.322 ignora registros com entrada a partir de 01/08/2026', () => { const operational = state(); operational.receiptItems = []; operational.legacyInvoices = [{ invoice: '2915720', entryDate: '2026-08-01', issueDate: '2026-07-13', totalValue: 2500, source: '12.322' }] as any; const result = applyReceiptReconciliation(baseCanonical(), operational, config); assert.equal(result.canonical.stock.pendingPurchaseCost, 10000); assert.equal(result.canonical.inventory[0].pendingCases, 100); assert.equal(result.audit.legacyInvoiceCount, 0); });

test('218 abate automaticamente quantidade, caixas e financeiro a partir de agosto', () => { const operational = state({ legacy: false }); const result = applyReceiptReconciliation(baseCanonical(), operational, config, new Set()); assert.equal(result.canonical.inventory[0].pendingQty, 900); assert.equal(result.canonical.inventory[0].pendingCases, 90); assert.equal(result.canonical.stock.pendingPurchaseCost, 8000); assert.equal(result.audit.confirmedItems, 1); assert.equal(result.audit.confirmedItemCost, 2000); });

test('218 não depende mais da lista de confirmações armazenada', () => { const operational = state({ legacy: false }); const withNone = applyReceiptReconciliation(baseCanonical(), operational, config, new Set()); const withFakeConfirmation = applyReceiptReconciliation(baseCanonical(), operational, config, new Set(['qualquer-chave'])); assert.equal(withNone.canonical.stock.pendingPurchaseCost, withFakeConfirmation.canonical.stock.pendingPurchaseCost); assert.equal(withNone.canonical.inventory[0].pendingQty, withFakeConfirmation.canonical.inventory[0].pendingQty); });

test('218 ignora itens anteriores a 01/08/2026', () => { const operational = state({ legacy: false }); operational.receiptItems[0].entryDate = '2026-07-31'; const result = applyReceiptReconciliation(baseCanonical(), operational, config); assert.equal(result.canonical.inventory[0].pendingQty, 1000); assert.equal(result.canonical.stock.pendingPurchaseCost, 10000); assert.equal(result.audit.confirmedItems, 0); });

test('configurações usa o 218 como baixa automática e mantém tabela para auditoria item a item', () => { const page = fs.readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8'); assert.match(page, /Auditoria item a item do 218/); assert.match(page, /não é necessária nenhuma confirmação manual/); assert.match(page, /ABATIDO AUTOMATICAMENTE/); assert.doesNotMatch(page, /Aplicar confirmações/); });

test('hidratação reaplica reconciliação de recebimentos após restaurar a base', () => { const context = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8'); assert.match(context, /applyReceiptReconciliation/); });
