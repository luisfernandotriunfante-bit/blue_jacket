import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyManualConfiguration, DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical.ts';
import { projectCanonicalFromUnified } from '../src/services/motors/calculationService.ts';
import { parseSales8022 } from '../src/services/motors/salesMotor.ts';

function baseCanonical(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    generatedAt: '2026-08-23T00:00:00.000Z',
    referenceDate: '2026-08-23',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    sources: [],
    support: { rcas: [], vendorTargets: [], clients: [], activeRoute: [], products: [], itemCodes: [] },
    transactions: [],
    inventory: [],
    daily: [],
    history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '2025-08', average3ClosedMonths: null, average3MonthKeys: [] },
    industryTarget: 0,
    industryPositivityTarget: 0,
    sellOut: {
      invoiced: 400,
      toInvoice: 100,
      total: 500,
      sellOutTarget: 1000,
      attainment: .5,
      invoicedPositivation: 4,
      futurePositivation: 1,
      totalPositivation: 5,
      industryPositivityTarget: 10,
      positivityAttainment: .5,
      ticketAverage: 100,
      businessDaysTotal: 21,
      businessDaysElapsed: 15,
      businessDaysRemaining: 6,
      invoicedDailyAverage: 0,
      totalDailyAverage: 0,
      neededDailyAverage: 0,
      invoicedTrend: 0,
      totalTrend: 0,
    },
    stock: {
      costValue: 0, saleValue: 0, pendingPurchaseCost: 0, pendingPurchaseSale: 0,
      projectedCostValue: 0, projectedSaleValue: 0, physicalUnits: 0, physicalCases: 0, grossKg: 0,
      coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60,
    },
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
    ...overrides,
  } as any;
}

function unified(salesFacts: any[] = []) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-23T00:00:00.000Z',
    sources: [], qualityIssues: [], items: [], customers: [], customerClassifications: [], rcas: [], customerRcaRelations: [], topRetailerSnapshots: [],
    salesFacts, inboundOrders: [], receiptHeaders: [], receiptItems: [], targets: [], historicalSalesFacts: [], legacyProductMap: [], historicalCustomerProduct: [], historicalReceipts: [], unifiedSales: [],
  } as any;
}

function sale(date: string, value: number, status: 'FATURADO' | 'A FATURAR' = 'FATURADO') {
  return {
    salesFactId: `S:${date}:${value}`, movementDate: date, customerCanonicalId: '', winthorCustomerCode: '', cnpj: '00123456000199', rcaCanonicalId: '', transactionRcaCode: '', rcaAssignmentStatus: 'UNRESOLVED',
    itemCanonicalId: '', winthorProductCode: '', industrySku: '', orderWinthor: '', orderRca: '', invoiceNumber: '', invoiceDate: '', rawOrderStatus: status, rawBlockStatus: '', salesStatus: status,
    units: 0, cases: 0, grossWeightKg: 0, netWeightKg: 0, weightTons: 0, value, saleType: 'VENDA', line: '', source: '8022',
  } as any;
}

test('Meta T&C zero é autoritativa e não revive valor antigo do snapshot', () => {
  const base = baseCanonical({
    lines: [{ name: 'Creme Dental', share: 1, target: 1000, invoiced: 400, toInvoice: 100, total: 500, attainment: .5 }],
  });
  const configured = applyManualConfiguration(base, { ...DEFAULT_MANUAL_CONFIGURATION, sellOutTarget: 0, holidays: [] });
  assert.ok(configured);
  assert.equal(configured.sellOut.sellOutTarget, 0);
  assert.equal(configured.sellOut.attainment, 0);
  assert.equal(configured.lines[0].target, 0);
});

test('calendário manual pode fechar em zero dias úteis sem herdar quantidade antiga', () => {
  const base = baseCanonical({ referenceDate: '2026-08-03', periodStart: '2026-08-03', periodEnd: '2026-08-03' });
  const configured = applyManualConfiguration(base, { ...DEFAULT_MANUAL_CONFIGURATION, sellOutTarget: 1000, holidays: ['2026-08-03'] });
  assert.ok(configured);
  assert.equal(configured.sellOut.businessDaysTotal, 0);
  assert.equal(configured.sellOut.businessDaysElapsed, 0);
  assert.equal(configured.sellOut.businessDaysRemaining, 0);
  assert.equal(configured.sellOut.neededDailyAverage, 0);
});

test('configuração manual de rede não sobrescreve métricas Top calculadas só nos CNPJs Top', () => {
  const base = baseCanonical({ networks: [{
    key: 'REDE A', name: 'Rede A', networkTarget: 500, topTarget: 200, invoiced: 700, toInvoice: 300, total: 1000,
    networkAttainment: 2, topAttainment: .5, gapToNetworkTarget: 0, gapToTopTarget: 100, clients: 10, stores: [],
  }] });
  const configured = applyManualConfiguration(base, { ...DEFAULT_MANUAL_CONFIGURATION, networkTargets: { 'REDE A': 800 }, holidays: [] });
  assert.ok(configured);
  assert.equal(configured.networks[0].networkTarget, 800);
  assert.equal(configured.networks[0].networkAttainment, 1.25);
  assert.equal(configured.networks[0].topAttainment, .5);
  assert.equal(configured.networks[0].gapToTopTarget, 100);
});

test('venda sem data continua no Sell Out mensal e não é inventada na série diária', () => {
  const base = baseCanonical();
  const result = projectCanonicalFromUnified(base, unified([
    sale('', 100),
    sale('2026-08-20', 200),
    sale('2026-08-20', 50, 'A FATURAR'),
  ]), { ...DEFAULT_MANUAL_CONFIGURATION, sellOutTarget: 0, holidays: [] });
  assert.equal(result.sellOut.total, 350);
  assert.equal(result.sellOut.sellOutTarget, 0);
  assert.equal(result.daily.length, 1);
  assert.equal(result.daily[0].date, '2026-08-20');
  assert.equal(result.daily[0].total, 250);
});

test('8022 preserva fato com data inválida e registra a pendência de qualidade', () => {
  const rows = [
    ['DATA MOVIMENTO', 'STATUS PEDIDO', 'VALOR R$ NF', 'TIPO VENDA', 'CNPJ/CPF CLIENTE'],
    ['', 'FATURADO', 123.45, 'VENDA', '00123456000199'],
  ];
  const parsed = parseSales8022(rows, [], []);
  assert.equal(parsed.facts.length, 1);
  assert.equal(parsed.facts[0].value, 123.45);
  assert.equal(parsed.facts[0].movementDate, '');
  assert.equal(parsed.qualityIssues.some(issue => issue.code === 'SALES_MOVEMENT_DATE_UNRESOLVED'), true);
});

test('sem dias úteis restantes, necessidade diária não vira o saldo final', () => {
  const vendor = {
    newCode: '1', oldCode: '1', name: 'RCA', coordinatorCode: 'C', coordinatorName: 'Coord', salesTarget: 1000, positivityTarget: 20,
    invoiced: 400, toInvoice: 100, total: 500, attainment: .5, invoicedPositivation: 5, futurePositivation: 0, totalPositivation: 5, positivityAttainment: .25,
    idealSalesToday: 0, salesGapToIdeal: 0, salesGapToTarget: 500, idealPositivationToday: 0, positivityGapToIdeal: 0, positivityGapToTarget: 15, positivityDailyTarget: 15,
  };
  const base = baseCanonical({ referenceDate: '2026-08-31', vendors: [vendor] });
  const holidays: string[] = [];
  const configured = applyManualConfiguration(base, { ...DEFAULT_MANUAL_CONFIGURATION, sellOutTarget: 1000, holidays });
  assert.ok(configured);
  assert.equal(configured.sellOut.businessDaysRemaining, 0);
  assert.equal(configured.sellOut.neededDailyAverage, 0);
  assert.equal(configured.vendors[0].positivityDailyTarget, 0);
});

test('Sell Out mantém as três abas e Gerencial não possui hook depois de retorno condicional', () => {
  const source = readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /id: 'resumo', label: 'Resumo'/);
  assert.match(source, /id: 'redes', label: 'Redes'/);
  assert.match(source, /id: 'gerencial', label: 'Gerencial'/);
  assert.doesNotMatch(source, /function Gerencial\(\)[\s\S]*if \(!canonical\) return null;[\s\S]*useMemo/);
  assert.match(source, /Venda fora de RCA oficial/);
  assert.match(source, /permanece sem classificação/);
});
