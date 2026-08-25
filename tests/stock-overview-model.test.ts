import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStockOverviewModel } from '../src/canonical/stockOverviewModel.ts';
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
    internal_ean: '7890000000001',
    description_internal: 'CD TESTE 90G',
    physical_stock_units: 90,
    cost_unit_105: 10,
    pVenda1_region11: 20,
  },
  {
    item_canonical_id: 'ITEM:2',
    winthor_code: '2',
    manufacturer_code: '61052479',
    internal_ean: '7890000000002',
    description_internal: 'SAB TESTE 85G',
    physical_stock_units: 180,
    cost_unit_105: 5,
    pVenda1_region11: 10,
  },
]);

const m3 = list('M3_MOVIMENTO_VENDAS', [
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '1', units: 90, order_status: 'FATURADO' },
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '2', units: 90, order_status: 'FATURADO' },
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

test('Carteira Colgate resolve material numérico com zeros à esquerda sem descrição', () => {
  const model = buildStockOverviewModel({ m1, m3, m4 });
  assert.equal(model.totals.totalInboundQty, 15);
  assert.equal(model.totals.mappedInboundQty, 15);
  assert.equal(model.totals.inboundQty, 15);
  assert.equal(model.totals.inboundValue, 120);
  assert.equal(model.totals.projectedUnits, 285);
  assert.equal(model.totals.projectedPurchaseValue, 1920);
  assert.equal(model.dataQuality.inboundUnmappedRows, 0);
});

test('Carteira desconta Bill Qty e valor das notas já recebidas em 218 e 12.322 sem duplicar recebimento', () => {
  const m3WithReceipts = list('M3_MOVIMENTO_VENDAS', [
    ...m3.records.filter(row => row.fact_type === 'SALE'),
    {
      fact_type: 'INBOUND_ORDER', industry_material: '61052478', invoice_number: '00000123-1',
      order_qty: 20, bill_qty: 10, inbound_net_value: 300,
    },
    {
      fact_type: 'INBOUND_ORDER', industry_material: '61052479', invoice_number: '00000456-1',
      order_qty: 0, bill_qty: 5, inbound_net_value: 50,
    },
    {
      fact_type: 'INBOUND_ORDER', industry_material: '61052478',
      order_qty: 10, bill_qty: 0, inbound_net_value: 100,
    },
    { fact_type: 'RECEIPT', invoice_number: '123', received_units: 10 },
  ]);
  const m4WithReceipts = list('M4_HISTORICO_TRANSICAO', [
    { row_type: 'RECEIPT_12322', invoice_number: '00000456', invoice_value: 50 },
    { row_type: 'RECEIPT_12322', invoice_number: '00000123', invoice_value: 300 },
  ]);

  const model = buildStockOverviewModel({ m1, m3: m3WithReceipts, m4: m4WithReceipts });
  assert.equal(model.totals.grossInboundQty, 45);
  assert.equal(model.totals.receivedInboundQty, 15);
  assert.equal(model.totals.totalInboundQty, 30);
  assert.equal(model.totals.grossInboundValue, 450);
  assert.equal(model.totals.receivedInboundValue, 150);
  assert.equal(model.totals.inboundValue, 300);
  assert.equal(model.totals.matchedReceiptInvoices218, 1);
  assert.equal(model.totals.matchedReceiptInvoices12322, 2);
  assert.equal(model.totals.inboundQty, 30);
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
