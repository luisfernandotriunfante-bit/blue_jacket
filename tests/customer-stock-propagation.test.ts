import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildCustomerIntelligence } from '../src/domain/customerIntelligence.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';
import { buildCustomerInternalDossierWorkbook } from '../src/services/customerIntelligenceExport.ts';

const cnpj = '04594132000140';

function support() {
  return {
    ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
    assortmentCompetences: [{
      key: '2026-08_09', label: 'Ago/Set 2026', validFrom: '2026-08-01', validTo: '2026-09-30', sourceSheet: 'OFICIAL',
      expectedTotalsByChannel: { Hiper: { total: 2, mandatory: 2, important: 0 } },
      products: [
        { ean: '7891000000011', colgateSku: '61000001', winthorCode: '11100001', description: 'Lançamento com Carteira', categoryMaster: '', category: '', subcategory: '', brand: 'COLGATE', subbrand: '', segment: '', subsegment: '', contents: '', amount: '', promoPack: '', launchLabel: 'Lançamento Q3', lifecycleStatus: 'ATIVO', recommendations: [{ channel: 'Hiper', value: 1 }], sourceSheet: 'OFICIAL' },
        { ean: '7891000000097', colgateSku: '61000009', winthorCode: '99999999', description: 'Produto só no sortimento', categoryMaster: '', category: '', subcategory: '', brand: 'COLGATE', subbrand: '', segment: '', subsegment: '', contents: '', amount: '', promoPack: '', launchLabel: '', lifecycleStatus: 'ATIVO', recommendations: [{ channel: 'Hiper', value: 1 }], sourceSheet: 'OFICIAL' },
      ],
    }],
    customers: [{ cnpj, cnpjRaw: '4594132000140', name: 'CLIENTE TESTE', clientCode: '', network: 'REDE TESTE', environment: 'H&S', profile: 'VAREJO', tier: 'FAIXA 1', assortmentChannel: 'Hiper', city: 'CAMPO GRANDE', state: 'MS', vendorCode: '', coordinatorCode: '', coordinatorName: '', source: 'TESTE' }],
  } as any;
}

function canonical() {
  return {
    schemaVersion: 2, generatedAt: '', referenceDate: '2026-08-21', periodStart: '2026-08-01', periodEnd: '2026-08-31', sources: [],
    support: { rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {}, products: [], itemCodes: [] },
    transactions: [], daily: [], history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: null, average3MonthKeys: [] },
    industryTarget: 0, industryPositivityTarget: 0,
    sellOut: { invoiced: 0, toInvoice: 0, total: 0, sellOutTarget: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0, industryPositivityTarget: 0, positivityAttainment: 0, ticketAverage: 0, businessDaysTotal: 20, businessDaysElapsed: 10, businessDaysRemaining: 10, invoicedDailyAverage: 0, totalDailyAverage: 0, neededDailyAverage: 0, invoicedTrend: 0, totalTrend: 0 },
    stock: { costValue: 0, saleValue: 0, pendingPurchaseCost: 120, pendingPurchaseSale: 0, projectedCostValue: 120, projectedSaleValue: 0, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    inventory: [{
      code: '11100001', description: 'Lançamento com Carteira', ean: '7891000000011', quantity: 0, costUnit: 0, saleUnit: 0,
      pendingQty: 0, pendingCases: 3, pendingCost: 120, pendingSale: 0, isLaunch: true, hasWinthor: true, factoryCode: '61000001',
      physicalCases: 0, physicalUnits: 0, grossKg: 0, unitsPerCase: 0, unitsPerCaseSource: 'UNKNOWN', unitsPerCaseCandidates: [], unitsPerCaseConflict: false,
    }],
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
  } as any;
}

test('Clientes & Sortimento preserva Carteira em caixas quando Un/CX é desconhecido sem fabricar unidades', () => {
  const result = buildCustomerIntelligence(canonical(), support(), cnpj, '2026-08-21');
  const product = result.products.find(item => item.ean === '7891000000011');
  assert.ok(product);
  assert.equal(product?.hasWinthor, true);
  assert.equal(product?.portfolioCases, 3);
  assert.equal(product?.portfolioUnits, 0);
  assert.equal(product?.unitsPerCase, 0);
  assert.equal(product?.unitsPerCaseSource, 'UNKNOWN');
  assert.equal(product?.availability, 'SOMENTE_CARTEIRA');
  assert.equal(product?.opportunityPriority, 'MUITO_ALTA');
  assert.equal(result.launches.portfolioOnly, 1);
  assert.equal(result.launches.withoutStockAndPortfolio, 0);
});

test('código Winthor escrito apenas no sortimento oficial não altera o fato cadastral hasWinthor', () => {
  const result = buildCustomerIntelligence(canonical(), support(), cnpj, '2026-08-21');
  const product = result.products.find(item => item.ean === '7891000000097');
  assert.ok(product);
  assert.equal(product?.winthorCode, '99999999');
  assert.equal(product?.hasWinthor, false);
  assert.equal(product?.availability, 'SEM_WINTHOR');
  assert.equal(product?.opportunityPriority, 'BLOQUEIO_CADASTRO');
});

test('dossiê exporta exatamente caixas, unidades e origem Un/CX materializadas pelo motor', () => {
  const result = buildCustomerIntelligence(canonical(), support(), cnpj, '2026-08-21');
  const workbook = buildCustomerInternalDossierWorkbook(result);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Sortimento completo'], { defval: '' });
  const row = rows.find(item => item.EAN === '7891000000011');
  assert.ok(row);
  assert.equal(row?.['Carteira caixas'], 3);
  assert.equal(row?.['Carteira unidades'], 0);
  assert.equal(row?.['Un/CX'], '');
  assert.equal(row?.['Origem Un/CX'], 'UNKNOWN');
  assert.equal(row?.Disponibilidade, 'SOMENTE EM CARTEIRA');
});
