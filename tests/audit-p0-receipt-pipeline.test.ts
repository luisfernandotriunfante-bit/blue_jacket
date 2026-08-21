import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperationalOverrides } from '../src/services/operationalSources.ts';
import { applyReceiptReconciliation } from '../src/services/receiptReconciliation.ts';

const config = { sellOutTarget: 0, coverageTargetDays: 60, portfolioSaleMarkup: 0.3, networkTargets: {}, holidays: [], lineShares: {} } as any;

function canonical() {
  return {
    schemaVersion: 2,
    generatedAt: '', referenceDate: '2026-08-21', periodStart: '2026-08-01', periodEnd: '2026-08-31', sources: [],
    support: {
      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
      products: [{ sku: 'MAT988', ean: '7890000000000', description: 'Produto 988', category: '', subcategory: '', brand: '', isLaunch: false, boxPrice: 0, unitPrice: 0, unitsPerCase: 10, line: '' }],
      itemCodes: [{ internalCode: '988', description: 'Produto 988', ean: '7890000000000', factoryCode: 'MAT988' }],
    },
    transactions: [], daily: [], history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: 100000, average3MonthKeys: [] },
    industryTarget: 0, industryPositivityTarget: 0,
    sellOut: { invoiced: 0, toInvoice: 0, total: 0, sellOutTarget: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0, industryPositivityTarget: 0, positivityAttainment: 0, ticketAverage: 0, businessDaysTotal: 20, businessDaysElapsed: 10, businessDaysRemaining: 10, invoicedDailyAverage: 0, totalDailyAverage: 0, neededDailyAverage: 0, invoicedTrend: 0, totalTrend: 0 },
    stock: { costValue: 1000, saleValue: 1300, pendingPurchaseCost: 0, pendingPurchaseSale: 0, projectedCostValue: 1000, projectedSaleValue: 1300, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    inventory: [{ code: '988', description: 'Produto 988', ean: '7890000000000', quantity: 100, costUnit: 10, saleUnit: 13, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: 'MAT988', physicalCases: 0, physicalUnits: 0, grossKg: 0 }],
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
  } as any;
}

function operational(invoice = '2915720') {
  return {
    version: 1,
    tablePriceFileName: '', tablePrices: {}, entry218FileName: '', currentInvoices: [], receiptItems: [],
    legacy12322FileName: '12.322.txt', legacyInvoices: [{ invoice: '2915720', entryDate: '2026-07-30', issueDate: '2026-07-13', totalValue: 400, source: '12.322' }],
    portfolioFileName: 'CARTEIRA.xlsx', portfolioRows: [
      { sourceRow: 2, materialCode: 'MAT988', description: 'Produto 988', orderQty: 10, billQty: 0, costValue: 400, invoice },
      { sourceRow: 3, materialCode: 'MAT988', description: 'Produto 988', orderQty: 10, billQty: 0, costValue: 600, invoice: '99999991' },
    ], portfolioInvoiceColumnDetected: true, portfolioHeader: [],
  } as any;
}

test('pipeline real não abate a mesma NF duas vezes entre override operacional e reconciliação 12.322', () => {
  const state = operational();
  const adjusted = applyOperationalOverrides(canonical(), state, config);
  // O override antigo já removia a NF quando o número vinha exatamente igual.
  assert.equal(adjusted.canonical.stock.pendingPurchaseCost, 600);
  const final = applyReceiptReconciliation(adjusted.canonical, state, config);
  // A reconciliação reconstrói a carteira-base e aplica uma única baixa: 1000 - 400 = 600.
  assert.equal(final.canonical.stock.pendingPurchaseCost, 600);
  assert.equal(final.canonical.inventory[0].pendingCases, 10);
  assert.equal(final.canonical.inventory[0].pendingQty, 100);
  assert.equal(final.audit.legacyAppliedCost, 400);
});

test('fallback de série não remove último dígito de uma NF comum que não termina em 1', () => {
  const state = operational('29157208');
  const result = applyReceiptReconciliation(applyOperationalOverrides(canonical(), { ...state, legacyInvoices: [] }, config).canonical, state, config);
  assert.equal(result.audit.legacyMatchedInvoiceCount, 0);
  assert.equal(result.audit.legacyAppliedCost, 0);
  assert.equal(result.canonical.stock.pendingPurchaseCost, 1000);
});
