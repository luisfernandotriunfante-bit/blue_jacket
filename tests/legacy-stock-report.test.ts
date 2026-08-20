import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import type { CanonicalInventoryProduct, CanonicalState } from '../src/domain/canonical.ts';
import { buildLegacyStockReportRows, buildLegacyStockReportXlsx } from '../src/services/legacyStockReport.ts';
import { summarizeLegacyStockReport } from '../src/services/legacyStockReportSummary.ts';

function product(overrides: Partial<CanonicalInventoryProduct> = {}): CanonicalInventoryProduct {
  return {
    code: '11100138',
    description: 'CD COLG TRIP ACAO PRECO ESPEC',
    ean: '7891024037973',
    quantity: 18864,
    costUnit: 5,
    saleUnit: 8.1305,
    pendingQty: 0,
    pendingCases: 0,
    pendingCost: 0,
    pendingSale: 0,
    isLaunch: false,
    hasWinthor: true,
    factoryCode: '61000138',
    physicalCases: 262,
    physicalUnits: 18864,
    grossKg: 0,
    ...overrides,
  };
}

function state(items: CanonicalInventoryProduct[] = [product()], stock8013 = true): CanonicalState {
  const costValue = items.reduce((sum, item) => sum + item.quantity * item.costUnit, 0);
  const saleValue = items.reduce((sum, item) => sum + item.quantity * item.saleUnit, 0);
  return {
    schemaVersion: 2,
    generatedAt: '2026-08-20T12:00:00.000Z',
    referenceDate: '2026-08-20',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    sources: stock8013 ? [{ kind: 'stock8013', fileName: '8013.xls', loaded: true, rows: items.length }] : [],
    support: {
      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
      products: items.map(item => ({ sku: item.factoryCode, ean: item.ean, description: item.description, category: '', subcategory: '', brand: 'Colgate', isLaunch: item.isLaunch, boxPrice: 0, unitPrice: item.saleUnit, unitsPerCase: item.code === '11100138' ? 72 : 12, line: '' })),
      itemCodes: items.map(item => ({ internalCode: item.code, description: item.description, ean: item.ean, factoryCode: item.factoryCode })),
    },
    transactions: [], inventory: items, daily: [],
    history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: null, average3MonthKeys: [] },
    industryTarget: 0,
    industryPositivityTarget: 0,
    sellOut: {
      invoiced: 0, toInvoice: 0, total: 0, sellOutTarget: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0,
      industryPositivityTarget: 0, positivityAttainment: 0, ticketAverage: 0, businessDaysTotal: 0, businessDaysElapsed: 0, businessDaysRemaining: 0,
      invoicedDailyAverage: 0, totalDailyAverage: 0, neededDailyAverage: 0, invoicedTrend: 0, totalTrend: 0,
    },
    stock: {
      costValue, saleValue, pendingPurchaseCost: 0, pendingPurchaseSale: 0, projectedCostValue: costValue, projectedSaleValue: saleValue,
      physicalUnits: items.reduce((sum, item) => sum + item.physicalUnits, 0), physicalCases: items.reduce((sum, item) => sum + item.physicalCases, 0), grossKg: 0,
      coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 0,
    },
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
  };
}

test('relatório antigo reproduz múltiplo, ST, preços e estoque em caixas da referência conhecida', () => {
  const [row] = buildLegacyStockReportRows(state());
  assert.equal(row.code, '11100138');
  assert.equal(row.ean, '7891024037973');
  assert.equal(row.unitsPerCase, 72);
  assert.equal(row.multiple, 1);
  assert.equal(row.stPercent, 1.6683);
  assert.equal(row.unitPrice, 8.1305);
  assert.ok(row.unitPriceSt !== null && Math.abs(row.unitPriceSt - 8.2661411315) < 1e-10);
  assert.ok(row.boxPrice !== null && Math.abs(row.boxPrice - 585.396) < 1e-10);
  assert.ok(row.boxPriceSt !== null && Math.abs(row.boxPriceSt - 595.162161468) < 1e-9);
  assert.equal(row.stockCases, 262);
  assert.equal(row.launch, '');
});

test('relatório não inventa múltiplo, ST ou estoque em caixas quando a fonte não existe', () => {
  const unknown = product({ code: '99999999', ean: '7890000000000', factoryCode: 'MAT999', physicalCases: 10, physicalUnits: 120 });
  const [row] = buildLegacyStockReportRows(state([unknown], false));
  assert.equal(row.multiple, null);
  assert.equal(row.stPercent, null);
  assert.equal(row.unitPriceSt, null);
  assert.equal(row.boxPriceSt, null);
  assert.equal(row.stockCases, null);
});

test('lançamento do relatório segue o cadastro oficial canônico atual, não a lista antiga', () => {
  const [row] = buildLegacyStockReportRows(state([product({ isLaunch: true })]));
  assert.equal(row.launch, 'X');
});

test('contador de Documentos usa o mesmo lançamento restaurado do relatório, mesmo com snapshot cru zerado', () => {
  const current = state([product({ isLaunch: false })]);
  current.support.products[0].isLaunch = true;
  const [row] = buildLegacyStockReportRows(current);
  const summary = summarizeLegacyStockReport(current);
  assert.equal(row.launch, 'X');
  assert.equal(summary.launchCount, 1);
  assert.equal(summary.skuWinthorCount, 1);
});

test('arquivo gerado contém apenas o relatório PREÇO com as onze colunas A:K', () => {
  const files = unzipSync(buildLegacyStockReportXlsx(state()));
  const workbook = strFromU8(files['xl/workbook.xml']);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(workbook, /sheet name="PREÇO"/);
  assert.equal((workbook.match(/<sheet /g) || []).length, 1);
  assert.match(sheet, /dimension ref="A1:K3"/);
  assert.match(sheet, /mergeCell ref="A1:E1"/);
  assert.match(sheet, /mergeCell ref="F1:I1"/);
  assert.match(sheet, /autoFilter ref="A2:K3"/);
  assert.match(sheet, /INFORMAÇÕES DO ITEM/);
  assert.match(sheet, /PREÇOS/);
  assert.match(sheet, /ESTOQUE CX/);
  assert.match(sheet, /LANÇAMENTOS/);
  assert.doesNotMatch(sheet, /<c r="L\d+/);
});

test('XLSX consegue abrir o arquivo gerado e encontra os valores do relatório', () => {
  const workbook = XLSX.read(buildLegacyStockReportXlsx(state()), { type: 'array' });
  assert.deepEqual(workbook.SheetNames, ['PREÇO']);
  const sheet = workbook.Sheets['PREÇO'];
  assert.equal(sheet.A1.v, 'INFORMAÇÕES DO ITEM');
  assert.equal(sheet.A2.v, 'COD');
  assert.equal(sheet.K2.v, 'LANÇAMENTOS');
  assert.equal(String(sheet.A3.v), '11100138');
  assert.equal(String(sheet.B3.v), '7891024037973');
  assert.equal(sheet.D3.v, 72);
  assert.equal(sheet.E3.v, 1);
  assert.equal(sheet.J3.v, 262);
});
