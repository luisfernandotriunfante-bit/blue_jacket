import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockOverviewModel } from '../src/canonical/stockOverviewModel.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m1 = { ...base, id: 'M1_ITEM_ESTOQUE' as const, records: [
  { item_canonical_id: 'ITEM:1', winthor_code: '1', manufacturer_code: 'A', internal_ean: '7891', description_internal: 'CD TOTAL 12', physical_stock_units: 100, cost_unit_105: 2, pVenda1_region11: 4 },
  { item_canonical_id: 'ITEM:2', winthor_code: '2', manufacturer_code: 'B', internal_ean: '7892', description_internal: 'SABONETE PROTEX', physical_stock_units: 10, cost_unit_105: 1, pVenda1_region11: 3, is_launch: true },
] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '1', units: 20, order_status: 'FATURADO' },
  { fact_type: 'SALE', event_date: '2026-08-25', winthor_product_code: '1', units: 10, order_status: 'A FATURAR' },
  { fact_type: 'INBOUND_ORDER', industry_material: 'A', order_qty: 15, bill_qty: 5 },
] };
const m4 = { ...base, id: 'M4_HISTORICO_TRANSICAO' as const, records: [
  { row_type: 'TRANSACTION_379', movement_date: '2026-07-25', historical_gtin: '7891', signed_quantity: 60 },
] };

test('visão geral combina M1/M3/M4 sem inventar giro para item sem histórico', () => {
  const model = buildStockOverviewModel({ m1, m3, m4 });
  assert.equal(model.totals.physicalUnits, 110);
  assert.equal(model.totals.reservedUnits, 10);
  assert.equal(model.totals.availableUnits, 100);
  assert.equal(model.totals.inboundQty, 20);
  assert.equal(model.totals.projectedUnits, 120);
  assert.equal(model.totals.purchaseValue, 210);
  assert.equal(model.totals.saleValue, 430);
  assert.equal(model.totals.mappedDemandItems, 1);
  assert.ok((model.totals.coverageDays ?? 0) > 0);
  assert.ok(model.alerts.some(item => item.code === 'NO_TURNOVER' && item.examples.some(example => example.includes('SABONETE PROTEX'))));
  assert.equal(model.alerts.some(item => item.code === 'LOW_COVERAGE' && item.examples.some(example => example.includes('SABONETE PROTEX'))), false);
  assert.equal(model.lines.find(row => row.line === 'Creme Dental')?.items, 1);
  assert.equal(model.lines.find(row => row.line === 'Sabonetes')?.items, 1);
});

test('Carteira segue Order Qty + Bill Qty e projeção usa só material mapeado', () => {
  const withUnmapped = { ...m3, records: [...m3.records, { fact_type: 'INBOUND_ORDER', industry_material: 'SEM_MAPA', order_qty: 100, bill_qty: 50 }] };
  const model = buildStockOverviewModel({ m1, m3: withUnmapped, m4 });
  assert.equal(model.totals.totalInboundQty, 170);
  assert.equal(model.totals.mappedInboundQty, 20);
  assert.equal(model.totals.inboundQty, 20);
  assert.equal(model.totals.projectedUnits, 120);
  assert.ok(model.alerts.some(item => item.code === 'INBOUND_UNMAPPED'));
});
