import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStockOverviewModel } from '../src/canonical/stockOverviewModel.ts';
import { sourceImportTestHelpers } from '../src/canonical/sourceImport.ts';
import type { CanonicalList } from '../src/canonical/types.ts';

function list(id: CanonicalList['id'], records: Array<Record<string, unknown>>): CanonicalList {
  return {
    id,
    records,
    sources: [],
    generatedAt: '2026-08-25T00:00:00Z',
    competence: '2026-08',
    snapshotDate: '2026-08-25',
    warnings: [],
    errors: [],
  };
}

const m1 = list('M1_ITEM_ESTOQUE', [
  {
    item_canonical_id: 'ITEM:1',
    winthor_code: '1',
    manufacturer_code: '61052478',
    industry_sku: '61052478',
    internal_ean: '7890000000001',
    description_internal: 'CD TESTE 90G',
    physical_stock_units: 90,
    cost_unit_105: 10,
    pVenda1_region11: 20,
    units_per_case_industry: 6,
  },
  {
    item_canonical_id: 'ITEM:2',
    winthor_code: '2',
    manufacturer_code: '61052479',
    industry_sku: '61052479',
    internal_ean: '7890000000002',
    description_internal: 'SAB TESTE 85G',
    physical_stock_units: 180,
    cost_unit_105: 5,
    pVenda1_region11: 10,
    units_per_case_industry: 12,
  },
]);

const m3 = list('M3_MOVIMENTO_VENDAS', [
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '1', industry_sku: '61052478', units: 90, cases: 15, order_status: 'FATURADO' },
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '2', industry_sku: '61052479', units: 90, cases: 7.5, order_status: 'FATURADO' },
  {
    fact_type: 'INBOUND_ORDER',
    industry_material: '000000000061052478',
    order_qty: 10,
    bill_qty: 5,
    inbound_net_value: 120,
  },
]);

const m4 = list('M4_HISTORICO_TRANSICAO', []);

test('cobertura geral é a média dos dias de cobertura dos SKUs com giro', () => {
  const model = buildStockOverviewModel({ m1, m3, m4 });
  assert.equal(model.totals.mappedDemandItems, 2);
  assert.equal(model.totals.coverageDays, 135);
});

test('Carteira converte caixas em unidades por Un/CX e não usa descrição', () => {
  const model = buildStockOverviewModel({ m1, m3, m4 });
  assert.equal(model.totals.totalInboundQty, 15);
  assert.equal(model.totals.mappedInboundQty, 15);
  assert.equal(model.totals.inboundQty, 90);
  assert.equal(model.totals.inboundValue, 120);
  assert.equal(model.totals.projectedUnits, 360);
  assert.equal(model.totals.projectedPurchaseValue, 1920);
  assert.equal(model.dataQuality.inboundUnmappedRows, 0);
});

test('218 baixa todo Bill Qty da NF recebida, inclusive linhas cujo item não foi mapeado', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '00000123-1', order_qty: 0, bill_qty: 10, inbound_net_value: 100 },
    { fact_type: 'INBOUND_ORDER', industry_material: 'SEM-MAPEAMENTO', invoice_number: '00000123-1', order_qty: 0, bill_qty: 5, inbound_net_value: 50 },
    { fact_type: 'RECEIPT', invoice_number: '123', winthor_product_code: '1', received_units: 60 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4 });
  assert.equal(model.totals.grossInboundQty, 15);
  assert.equal(model.totals.receivedInboundQty, 15);
  assert.equal(model.totals.totalInboundQty, 0);
  assert.equal(model.totals.inboundValue, 0);
  assert.equal(model.totals.matchedReceiptInvoices218, 1);
  assert.equal(model.totals.inboundQty, 0);
});

test('NF encontrada no 218 zera todo o valor financeiro da linha, mesmo com Order Qty ainda aberto', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '123', order_qty: 7, bill_qty: 10, inbound_net_value: 170 },
    { fact_type: 'RECEIPT', invoice_number: '123', winthor_product_code: '1', received_units: 30 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4 });
  assert.equal(model.totals.receivedInboundQty, 10);
  assert.equal(model.totals.totalInboundQty, 7);
  assert.equal(model.totals.inboundValue, 0);
  assert.equal(model.totals.inboundQty, 42);
});

test('normalização de NF encontra o maior bloco numérico quando série vem antes ou depois', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '001/00000123', order_qty: 0, bill_qty: 10, inbound_net_value: 100 },
    { fact_type: 'RECEIPT', invoice_number: '00000123-1', winthor_product_code: '1', received_units: 60 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4 });
  assert.equal(model.totals.totalInboundQty, 0);
  assert.equal(model.totals.inboundValue, 0);
  assert.equal(model.totals.matchedReceiptInvoices218, 1);
});

test('qualquer NF já existente no 12.322 sai integralmente da Carteira, independente da classificação', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '456', order_qty: 0, bill_qty: 10, inbound_net_value: 100 },
    { fact_type: 'INBOUND_ORDER', industry_material: '61052479', invoice_number: '789', order_qty: 0, bill_qty: 5, inbound_net_value: 50 },
  ]);
  const localM4 = list('M4_HISTORICO_TRANSICAO', [
    { row_type: 'RECEIPT_12322', receipt_class: 'MERCHANDISE', invoice_number: '00000456', invoice_value: 100 },
    { row_type: 'RECEIPT_12322', receipt_class: 'SUPPLIES', invoice_number: '00000789', invoice_value: 50 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4: localM4 });
  assert.equal(model.totals.receivedInboundQty, 15);
  assert.equal(model.totals.totalInboundQty, 0);
  assert.equal(model.totals.inboundValue, 0);
  assert.equal(model.totals.matchedReceiptInvoices12322, 2);
});

test('mesma NF em 218 e 12.322 não baixa Bill Qty duas vezes', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '456', order_qty: 20, bill_qty: 10, inbound_net_value: 300 },
    { fact_type: 'RECEIPT', invoice_number: '456', winthor_product_code: '1', received_units: 60 },
  ]);
  const localM4 = list('M4_HISTORICO_TRANSICAO', [
    { row_type: 'RECEIPT_12322', receipt_class: 'MERCHANDISE', invoice_number: '456', invoice_value: 300 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4: localM4 });
  assert.equal(model.totals.grossInboundQty, 30);
  assert.equal(model.totals.receivedInboundQty, 10);
  assert.equal(model.totals.totalInboundQty, 20);
  assert.equal(model.totals.inboundValue, 0);
});

test('ponte 8022 liga material Colgate ao Winthor quando M1 ainda não traz fabricante', () => {
  const localM1 = list('M1_ITEM_ESTOQUE', [{
    item_canonical_id: 'ITEM:3', winthor_code: '3', internal_ean: '7890000000003', description_internal: 'CD PONTE',
    physical_stock_units: 0, cost_unit_105: 10, pVenda1_region11: 20, units_per_case_industry: 4,
  }]);
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '3', industry_sku: '999999', units: 4, cases: 1, order_status: 'FATURADO' },
    { fact_type: 'INBOUND_ORDER', industry_material: '000000999999', order_qty: 2, bill_qty: 0, inbound_net_value: 40 },
  ]);
  const model = buildStockOverviewModel({ m1: localM1, m3: localM3, m4 });
  assert.equal(model.totals.mappedInboundQty, 2);
  assert.equal(model.totals.inboundQty, 8);
  assert.equal(model.dataQuality.inboundUnmappedRows, 0);
});


test('Visão Geral não reaplica checkpoint: consome exatamente a Carteira já validada no staging', () => {
  const localM3 = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    { fact_type: 'INBOUND_ORDER', industry_order_number: '9990000001', order_date: '2026-07-10', industry_material: '61052478', order_qty: 50, bill_qty: 0, inbound_net_value: 5000 },
  ]);
  const model = buildStockOverviewModel({ m1, m3: localM3, m4 });
  assert.equal(model.totals.totalInboundQty, 50);
  assert.equal(model.totals.inboundValue, 5000);
});


test('versão da Carteira invalida staging anterior após correção de baseline', () => {
  assert.equal(sourceImportTestHelpers.parserVersionFor('CARTEIRA 24.08.xlsx'), 'browser-v4-portfolio-baseline-current');
});

test('fotografia atual da Carteira pode virar baseline sem reproduzir o checkpoint antigo', () => {
  const row = (order: string, date: string, value: number) => ({
    industry_order_number: { raw: order, typed: order },
    order_date: { raw: date, typed: date },
    net_value: { raw: value, typed: value },
  });
  const parsed = {
    source: 'CARTEIRA 24.08.xlsx',
    fileName: 'CARTEIRA 24.08.xlsx',
    sheet: 'Carteira',
    rows: [
      row('1160096370', '2026-08-17', 100),
      row('9990000001', '2026-07-10', 5000),
      row('1160110441', '2026-08-18', 50),
    ],
    audits: [],
  };
  const current = sourceImportTestHelpers.acceptCurrentPortfolioAsBaseline(parsed, 'CARTEIRA 24.08.xlsx', 'hash-24');
  assert.equal(current.snapshot.mode, 'BASELINE_CURRENT');
  assert.equal(current.parsed.rows.length, 3);
  assert.equal(current.snapshot.acceptedValue, 5150);
  assert.deepEqual(current.snapshot.orderNumbers, ['1160096370', '1160110441', '9990000001']);
});

test('continuidade dinâmica usa bootstrap uma vez e depois usa a fotografia anterior como nova âncora', () => {
  const row = (order: string, date: string, value: number) => ({
    industry_order_number: { raw: order, typed: order },
    order_date: { raw: date, typed: date },
    net_value: { raw: value, typed: value },
  });
  const firstParsed = {
    source: 'CARTEIRA 24.08.xlsx',
    fileName: 'CARTEIRA 24.08.xlsx',
    sheet: 'Carteira',
    rows: [
      row('1160096370', '2026-08-17', 100),
      row('9990000001', '2026-07-10', 5000),
      row('1160110441', '2026-08-18', 50),
    ],
    audits: [],
  };
  const first = sourceImportTestHelpers.applyPortfolioContinuity(firstParsed, 'CARTEIRA 24.08.xlsx', 'hash-24');
  assert.equal(first.snapshot.mode, 'BOOTSTRAP_2026_08_17');
  assert.equal(first.parsed.rows.length, 2);
  assert.equal(first.snapshot.acceptedValue, 150);
  assert.deepEqual(first.snapshot.orderNumbers, ['1160096370', '1160110441']);

  const secondParsed = {
    ...firstParsed,
    fileName: 'CARTEIRA 27.08.xlsx',
    rows: [
      row('1160096370', '2026-08-17', 80),
      row('1160110441', '2026-08-18', 40),
      row('7770000000', '2026-08-25', 70),
      row('8880000000', '2026-07-01', 9000),
    ],
  };
  const second = sourceImportTestHelpers.applyPortfolioContinuity(secondParsed, 'CARTEIRA 27.08.xlsx', 'hash-27', first.snapshot);
  assert.equal(second.snapshot.mode, 'ROLL_FORWARD');
  assert.equal(second.parsed.rows.length, 3);
  assert.equal(second.snapshot.acceptedValue, 190);
  assert.deepEqual(second.snapshot.orderNumbers, ['1160096370', '1160110441', '7770000000']);
  assert.equal(second.snapshot.snapshotDate, '2026-08-27');
});

test('treemap usa valor do estoque por item dentro das cinco linhas', () => {
  const model = buildStockOverviewModel({ m1, m3, m4 });
  const dental = model.treemap.find(group => group.line === 'Creme Dental');
  const soap = model.treemap.find(group => group.line === 'Sabonetes');
  assert.equal(dental?.totalValue, 1800);
  assert.equal(soap?.totalValue, 1800);
  assert.equal(dental?.tiles[0]?.saleValue, 1800);
});

test('Visão Geral do Estoque continua passiva e não lê arquivos originais', () => {
  const page = fs.readFileSync(new URL('../src/pages/EstoquePage.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes("loadCandidateList('M1_ITEM_ESTOQUE')"));
  assert.ok(page.includes("loadCandidateList('M3_MOVIMENTO_VENDAS')"));
  assert.ok(page.includes("loadCandidateList('M4_HISTORICO_TRANSICAO')"));
  assert.doesNotMatch(page, /parseSource|buildCanonicalBundleFromStaging|FileReader|\.xlsx|\.xls/);
});
