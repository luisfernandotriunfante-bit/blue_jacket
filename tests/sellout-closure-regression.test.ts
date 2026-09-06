import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSellOutViewModel } from '../src/canonical/operationalViewModels.ts';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';
import { canonicalCustomerKey, classifySellOutStatus, isQualifyingPositiveSale } from '../src/canonical/sellOutRules.ts';
import { loadReportSettings, networkTargetFor, restoreReportSettings, sellOutTargetsFor, setNetworkTargetFor, setSellOutTargetsFor } from '../src/canonical/reportSettings.ts';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import { readFileSync, existsSync } from 'node:fs';
import { buildSellOutDashboardModel } from '../src/canonical/sellOutDashboardModel.ts';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
});
const base = { sources: [], generatedAt: '2026-08-31T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-31', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [
  { cnpj: '11111111000111', customer_name: 'Cliente 1', rca_canonical_id: 'RCA:10', rca_current_code: '10', rca_legacy_code: '900', rca_name: 'RCA A', coordinator_code: '1', coordinator_name: 'Supervisor A', top_network: 'Rede A', manager_cnpj: '11111111000111', top_target: 500 },
  { cnpj: '22222222000122', customer_name: 'Cliente 2', rca_canonical_id: 'RCA:10', rca_current_code: '10', rca_name: 'RCA A', coordinator_code: '1', coordinator_name: 'Supervisor A', top_network: 'Rede A', manager_cnpj: '11111111000111', top_target: 500 },
] };

test('status canônico não transforma vazio ou desconhecido em faturado', () => {
  assert.equal(classifySellOutStatus('FATURADO'), 'INVOICED');
  assert.equal(classifySellOutStatus('A FATURAR'), 'TO_INVOICE');
  assert.equal(classifySellOutStatus(''), 'UNKNOWN');
  assert.equal(classifySellOutStatus('BLOQUEADO'), 'UNKNOWN');
});

test('positivação exige cliente válido, valor positivo e venda não devolvida', () => {
  const sale = { cnpj: '11111111000111', value: 10, order_status: 'FATURADO' };
  assert.equal(canonicalCustomerKey(sale), 'CUSTOMER:11111111000111');
  assert.equal(isQualifyingPositiveSale(sale), true);
  assert.equal(isQualifyingPositiveSale({ ...sale, value: 0 }), false);
  assert.equal(isQualifyingPositiveSale({ ...sale, value: -10 }), false);
  assert.equal(isQualifyingPositiveSale({ ...sale, sale_type: 'DEVOLUÇÃO' }), false);
  assert.equal(isQualifyingPositiveSale({ ...sale, cnpj: '123' }), false);
});

test('mesmo CNPJ repete no diário por dia e conta uma vez no acumulado', () => {
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 100 },
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 50 },
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-02', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'A FATURAR', value: 20 },
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-02', cnpj: '22222222000122', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: -5, sale_type: 'DEVOLUÇÃO' },
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-02', cnpj: '22222222000122', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 0 },
  ] };
  const view = buildSellOutViewModel({ m2, m3 });
  assert.equal(view.totals.realized, 165);
  assert.equal(view.totals.invoiced + view.totals.toInvoice, view.totals.realized);
  assert.equal(view.totals.positiveCustomers, 1);
  assert.equal(view.totals.invoicedPositiveCustomers, 1);
  assert.deepEqual(view.dailyRows.map(row => row.totalPositivation), [1, 1]);
});

test('status e data inválidos ficam auditados sem divergência silenciosa', () => {
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'DESCONHECIDO', value: 90 },
    { fact_type: 'SALE', competence: '2026-08', event_date: null, cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 10 },
  ] };
  const view = buildSellOutViewModel({ m2, m3 });
  assert.equal(view.totals.realized, 10);
  assert.equal(view.reconciliation.dailyEqualTotal, true);
  assert.ok(view.audits.some(audit => audit.code === 'UNKNOWN_SALE_STATUS'));
  assert.ok(view.audits.some(audit => audit.code === 'INVALID_SALE_DATE'));
});

test('Redes usa a mesma venda qualificável e mantém rede sem venda', () => {
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', order_status: 'FATURADO', value: -10, sale_type: 'DEVOLUÇÃO' },
    { fact_type: 'TARGET', competence: '2026-08', sales_target: 1000 },
  ] };
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 500 });
  assert.equal(view.rows.length, 1);
  assert.equal(view.totals.customersWithSales, 0);
  assert.equal(view.totals.realized, -10);
});

test('metas são independentes por competência e legado global não é espalhado', () => {
  storage.clear();
  restoreReportSettings({ sellOutTarget: 999, positivityTarget: 99 });
  assert.equal(sellOutTargetsFor('2026-08').sellOutTarget, null);
  assert.equal(loadReportSettings().legacySellOutTarget, 999);
  setSellOutTargetsFor('2026-08', 1000, 100);
  setSellOutTargetsFor('2026-09', 2000, 200);
  setNetworkTargetFor('2026-08', 500);
  setNetworkTargetFor('2026-09', 800);
  assert.deepEqual(sellOutTargetsFor('2026-08'), { sellOutTarget: 1000, positivityTarget: 100 });
  assert.deepEqual(sellOutTargetsFor('2026-09'), { sellOutTarget: 2000, positivityTarget: 200 });
  assert.equal(networkTargetFor('2026-08'), 500);
  assert.equal(networkTargetFor('2026-09'), 800);
});

test('competência do motor vem das datas do 8022, não do relógio do processamento', () => {
  const typed = (value: unknown) => ({ raw: value, typed: value });
  const source = { source: 'vendas-8022.xls', fileName: '8022-agosto.xls', sheet: 'vendas-8022', audits: [], rows: [{ movement_date: typed('2026-08-31'), order_status: typed('FATURADO'), sale_value: typed(10), customer_document: typed('11111111000111'), seller_code: typed('10'), __source_row: typed(1) }] };
  const bundle = buildCanonicalBundleFromStaging([source]);
  assert.equal(bundle.lists.M3_MOVIMENTO_VENDAS.competence, '2026-08');
  assert.equal(bundle.lists.M3_MOVIMENTO_VENDAS.records[0]?.competence, '2026-08');
});

test('8022 com meses misturados é bloqueado em vez de somado', () => {
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', event_date: '2026-08-31', cnpj: '11111111000111', order_status: 'FATURADO', value: 10 },
    { fact_type: 'SALE', event_date: '2026-09-01', cnpj: '11111111000111', order_status: 'FATURADO', value: 20 },
  ] };
  const view = buildSellOutViewModel({ m2, m3 });
  assert.equal(view.competence, 'MIXED');
  assert.equal(view.totals.realized, 0);
  assert.ok(view.audits.some(audit => audit.code === 'MIXED_COMPETENCE'));
});

test('cinco linhas mais não classificado reconciliam com o Sell Out', () => {
  const m1 = { ...base, id: 'M1_ITEM_ESTOQUE' as const, records: [{ item_canonical_id: 'ITEM:1', winthor_code: '1', category: 'TOOTHPASTE', description_internal: 'CD TOTAL' }] };
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 100, winthor_product_code: '1' },
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '22222222000122', rca_canonical_id: 'RCA:10', order_status: 'A FATURAR', value: 20, winthor_product_code: 'SEM-MATCH' },
  ] };
  const view = buildSellOutViewModel({ m1, m2, m3 });
  const dashboard = buildSellOutDashboardModel({ base: view, m1, m3, targets: { sellOutTarget: null, positivityTarget: null } });
  assert.equal(dashboard.lineRows.reduce((sum, row) => sum + row.realized, 0) + dashboard.lineUnclassifiedValue, view.totals.realized);
  assert.equal(dashboard.lineUnclassifiedRecords, 1);
});

test('soma de supervisores e RCAs reconcilia com o total gerencial', () => {
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '11111111000111', rca_canonical_id: 'RCA:10', order_status: 'FATURADO', value: 100 }] };
  const view = buildSellOutViewModel({ m2, m3 });
  assert.equal(view.vendorRows.reduce((sum, row) => sum + row.realized, 0), view.totals.realized);
  assert.equal(view.supervisorRows.reduce((sum, row) => sum + row.realized, 0), view.totals.realized);
  assert.equal(view.supervisorRows[0]?.invoiced + view.supervisorRows[0]?.toInvoice, view.supervisorRows[0]?.realized);
});

test('não resta segunda implementação operacional de Redes nem competência por relógio na tela de Metas', () => {
  const sellOutPage = readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');
  const metasPage = readFileSync(new URL('../src/pages/MetasPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sellOutPage, /function Networks\(|buildNetworkDashboardModel|buildTopNetworksViewModel/);
  assert.equal(existsSync(new URL('../src/canonical/networkDashboardModel.ts', import.meta.url)), false);
  assert.doesNotMatch(metasPage, /new Date\(\).*slice\(0, 7\)/);
  assert.ok(metasPage.includes('Competência editada'));
});
