import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStockOverviewModel } from '../src/canonical/stockOverviewModel.ts';
import { matchesAssortmentRanges } from '../src/canonical/assortment.ts';
import type { CanonicalList } from '../src/canonical/types.ts';

function list(id: CanonicalList['id'], records: Array<Record<string, unknown>>): CanonicalList {
  return { id, records, sources: [], generatedAt: '2026-09-05T00:00:00Z', competence: '2026-09', snapshotDate: '2026-09-05', warnings: [], errors: [] };
}

const emptyM4 = list('M4_HISTORICO_TRANSICAO', []);
const item = (overrides: Record<string, unknown> = {}) => ({
  item_canonical_id: 'ITEM:10', winthor_code: '10', manufacturer_code: 'SKU10', internal_ean: '7890000000010',
  description_internal: 'PRODUTO TESTE', physical_stock_units: 100, stock_286_reserved: null, stock_286_available: null,
  cost_unit_105: 5, pVenda1_region11: 10, units_per_case_industry: 10, ...overrides,
});

test('produto e totais da Visão Geral compartilham disponível e cobertura canônicos', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item()]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', source: '8022', fact_id: 'A', event_date: '2026-08-01', order_status: 'FATURADO', invoice_number: '1', winthor_product_code: '10', units: 10, value: 100 },
    { fact_type: 'SALE', source: '8022', fact_id: 'B', event_date: '2026-08-10', order_status: 'FATURADO', invoice_number: '2', winthor_product_code: '10', units: 10, value: 100 },
  ]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  assert.equal(model.analysis.days, 10);
  assert.equal(model.products[0]?.available, model.totals.availableUnits);
  assert.equal(model.products[0]?.coverage, model.totals.coverageDays);
  assert.equal(model.products[0]?.coverage, 50);
  assert.equal(model.products[0]?.averageMonthlySales, 60);
});

test('M3 e M4 complementam a janela sem contar duas vezes o mesmo movimento', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item()]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', source: '8022', fact_id: 'M3:1', event_date: '2026-08-10', order_status: 'FATURADO', invoice_number: '100', winthor_product_code: '10', units: 10, value: 100 },
  ]);
  const m4 = list('M4_HISTORICO_TRANSICAO', [
    { row_type: 'TRANSACTION_379', historical_fact_id: 'M4:DUP', movement_date: '2026-08-10', invoice_number: '100', legacy_product_code: '10', signed_quantity: 10, signed_value: 100 },
    { row_type: 'TRANSACTION_379', historical_fact_id: 'M4:OLD', movement_date: '2026-08-01', invoice_number: '90', legacy_product_code: '10', signed_quantity: 5, signed_value: 50 },
  ]);
  const model = buildStockOverviewModel({ m1, m3, m4 });
  assert.equal(model.analysis.days, 10);
  assert.equal(model.analysis.deduplicatedHistoricalRows, 1);
  assert.equal(model.products[0]?.sold, 15);
});

test('devolução do M3 reduz a venda líquida e pedido a faturar não entra no giro', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item()]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', event_date: '2026-08-01', order_status: 'FATURADO', invoice_number: '1', winthor_product_code: '10', units: 100, value: 1000 },
    { fact_type: 'SALE', event_date: '2026-08-02', order_status: 'FATURADO', invoice_number: '2', winthor_product_code: '10', sale_type: 'DEVOLUÇÃO', units: 20, value: -200 },
    { fact_type: 'SALE', event_date: '2026-08-03', order_status: 'A FATURAR', order_winthor: '9999', winthor_product_code: '10', units: 50, value: 500 },
  ]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  assert.equal(model.products[0]?.sold, 80);
  assert.equal(model.products[0]?.salesValue, 800);
});

test('zero e negativo explícitos de estoque disponível são preservados', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item({ stock_286_reserved: 100, stock_286_available: 0 }), item({ item_canonical_id: 'ITEM:11', winthor_code: '11', manufacturer_code: 'SKU11', internal_ean: '7890000000011', stock_286_available: -5 })]);
  const model = buildStockOverviewModel({ m1, m3: list('M3_MOVIMENTO_VENDAS', []), m4: emptyM4 });
  assert.equal(model.products.find(row => row.winthor === '10')?.available, 0);
  assert.equal(model.products.find(row => row.winthor === '10')?.availableSource, 'M1_EXPLICIT');
  assert.equal(model.products.find(row => row.winthor === '11')?.available, -5);
  assert.ok(model.alerts.some(alert => alert.code === 'NEGATIVE_AVAILABLE_STOCK'));
});

test('Winthor sem match continua tentando SKU e EAN', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item()]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', event_date: '2026-08-01', order_status: 'FATURADO', winthor_product_code: '999', industry_sku: 'SKU10', units: 4, value: 40 },
    { fact_type: 'SALE', event_date: '2026-08-02', order_status: 'FATURADO', winthor_product_code: '998', ean_product: '7890000000010', units: 6, value: 60 },
  ]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  assert.equal(model.products[0]?.sold, 10);
  assert.equal(model.analysis.unmappedCurrentRows, 0);
});

test('EAN ambíguo não é atribuído silenciosamente', () => {
  const duplicated = '7890000000099';
  const m1 = list('M1_ITEM_ESTOQUE', [item({ internal_ean: duplicated }), item({ item_canonical_id: 'ITEM:11', winthor_code: '11', manufacturer_code: 'SKU11', internal_ean: duplicated })]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [{ fact_type: 'SALE', event_date: '2026-08-01', order_status: 'FATURADO', winthor_product_code: '999', ean_product: duplicated, units: 10, value: 100 }]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  assert.equal(model.products.reduce((sum, row) => sum + row.sold, 0), 0);
  assert.equal(model.analysis.unmappedCurrentRows, 1);
  assert.ok(model.alerts.some(alert => alert.code === 'AMBIGUOUS_PRODUCT_IDENTIFIER'));
});

test('item somente na Carteira permanece visível como pendente sem fabricar Un/CX', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item()]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [{ fact_type: 'INBOUND_ORDER', fact_id: 'CARTEIRA:1', industry_material: 'SKU-NOVO', invoice_number: '777', order_qty: 12, bill_qty: 0, inbound_net_value: 120 }]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  const pending = model.products.find(row => row.distributor === 'SKU-NOVO');
  assert.equal(pending?.unregistered, true);
  assert.equal(pending?.inboundQty, 12);
  assert.equal(pending?.unitsPerCase, null);
  assert.equal(pending?.projected, 0);
});

test('Produtos e Lançamentos não mantêm cálculo independente de giro ou cobertura', () => {
  const page = fs.readFileSync(new URL('../src/pages/ProductCatalogPage.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('buildStockOverviewModel'));
  assert.doesNotMatch(page, /sold\s*\/\s*3|sold\s*\/\s*90|available\s*\/\s*\(.*sold/);
});

test('valorização física, disponível e projetada usa a única ficha canônica do produto', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item({ physical_stock_units: 100, stock_286_available: 70, cost_unit_105: 5, pVenda1_region11: 10 })]);
  const m3 = list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'INBOUND_ORDER', industry_material: 'SKU10', invoice_number: '500', order_qty: 3, bill_qty: 0, inbound_net_value: 120 },
  ]);
  const model = buildStockOverviewModel({ m1, m3, m4: emptyM4 });
  assert.equal(model.totals.purchaseValue, 500);
  assert.equal(model.totals.saleValue, 1000);
  assert.equal(model.totals.availablePurchaseValue, 350);
  assert.equal(model.totals.availableSaleValue, 700);
  assert.equal(model.products[0]?.inboundUnits, 30);
  assert.equal(model.products[0]?.projected, 100);
  assert.equal(model.totals.projectedSaleValue, 1000);
});

test('Produtos e Lançamentos expõem a mesma ficha e diferem somente pelo recorte de lançamento', () => {
  const m1 = list('M1_ITEM_ESTOQUE', [item({ is_launch: true, launch_status: 'LANÇAMENTO' })]);
  const model = buildStockOverviewModel({ m1, m3: list('M3_MOVIMENTO_VENDAS', []), m4: emptyM4 });
  const product = model.products[0]!;
  assert.equal(product.isLaunch, true);
  assert.equal(product.unregistered, false);
  assert.equal(product.available, model.totals.availableUnits);
  assert.equal(product.coverage, null);
});

test('filtro múltiplo de sortimento opera como OR e item não materializado não é incluído', () => {
  const ranges = [
    { field: 'hiper', label: 'Hiper', range: 'Faixa 1', classification: 'Mandatório' as const },
    { field: 'vizinhan_a_peq', label: 'Vizinhança PEQ', range: 'Faixa 5', classification: 'Recomendado' as const },
  ];
  assert.equal(matchesAssortmentRanges(ranges, ['Faixa 1', 'Faixa 2']), true);
  assert.equal(matchesAssortmentRanges(ranges, ['Faixa 2', 'Faixa 3']), false);
  assert.equal(matchesAssortmentRanges([], ['Faixa 1']), false);
  assert.equal(matchesAssortmentRanges([], []), true);
});
