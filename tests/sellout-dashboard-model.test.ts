import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSellOutDashboardModel } from '../src/canonical/sellOutDashboardModel.ts';
import type { SellOutViewModel } from '../src/canonical/operationalViewModels.ts';
import type { CanonicalList } from '../src/canonical/types.ts';

const base: SellOutViewModel = {
  motorBuildId: 'motor-test', stagingManifestHash: 'hash', generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', sourceFacts: { sales: 3, targets: 0 },
  totals: { invoiced: 150, toInvoice: 50, realized: 200, salesTarget: 999, positivityTarget: 999, positiveCustomers: 2, salesAchievement: null, positivityAchievement: null, daysWithSales: 2 },
  vendorRows: [{ key: 'v1', rcaCanonicalId: 'RCA:1', rawRcaCode: '1', rcaName: 'RCA 1', rcaCurrentCode: '1', rcaLegacyCode: null, supervisorCode: null, supervisorName: null, label: 'RCA 1', salesTarget: 80, positivityTarget: 8, invoiced: 150, toInvoice: 50, realized: 200, positiveCustomers: 2, achievement: 2.5, positivityAchievement: .25, resolutionStatus: 'RESOLVED' }],
  dailyRows: [{ date: '2026-08-24', invoiced: 100, toInvoice: 0, realized: 100 }, { date: '2026-08-25', invoiced: 50, toInvoice: 50, realized: 100 }],
  networkRows: [], salesByLine: [{ line: 'Linha A', invoiced: 150, toInvoice: 50, realized: 200, share: 1, resolutionStatus: 'CLASSIFIED' }], stock: null, audits: [], reconciliation: { vendorsEqualTotal: true, dailyEqualTotal: true, networksEqualMappedUniverse: true, mappedNetworkValue: 0 },
};

const m3: CanonicalList = {
  id: 'M3_MOVIMENTO_VENDAS', generatedAt: base.generatedAt, competence: base.competence, snapshotDate: '2026-08-25', sources: ['8022'], warnings: [], errors: [],
  records: [
    { fact_type: 'SALE', event_date: '2026-08-24', customer_canonical_id: 'C:1', order_status: 'FATURADO' },
    { fact_type: 'SALE', event_date: '2026-08-25', customer_canonical_id: 'C:1', order_status: 'A FATURAR' },
    { fact_type: 'SALE', event_date: '2026-08-25', customer_canonical_id: 'C:2', order_status: 'FATURADO' },
  ],
};

test('dashboard aplica metas manuais sem alterar metas por RCA', () => {
  const dashboard = buildSellOutDashboardModel({ base, m3, targets: { sellOutTarget: 400, positivityTarget: 4 } });
  assert.equal(dashboard.totals.sellOutTarget, 400);
  assert.equal(dashboard.totals.positivityTarget, 4);
  assert.equal(dashboard.totals.salesAchievement, .5);
  assert.equal(dashboard.totals.positivityAchievement, .5);
  assert.equal(dashboard.operationalModel.totals.salesTarget, 400);
  assert.equal(dashboard.operationalModel.vendorRows[0].salesTarget, 80);
  assert.equal(dashboard.operationalModel.vendorRows[0].positivityTarget, 8);
});

test('dashboard materializa positivação faturada e série diária fora da tela', () => {
  const dashboard = buildSellOutDashboardModel({ base, m3, targets: { sellOutTarget: 400, positivityTarget: 4 } });
  assert.equal(dashboard.totals.invoicedPositiveCustomers, 2);
  assert.equal(dashboard.dailyRows[0].totalPositivation, 1);
  assert.equal(dashboard.dailyRows[0].invoicedPositivation, 1);
  assert.equal(dashboard.dailyRows[1].totalPositivation, 2);
  assert.equal(dashboard.dailyRows[1].invoicedPositivation, 1);
  assert.equal(dashboard.totals.realized, 200);
});

test('dashboard preserva linhas prontas do view-model quando M1 não é fornecido', () => {
  const dashboard = buildSellOutDashboardModel({ base, m3, targets: { sellOutTarget: null, positivityTarget: null } });
  assert.deepEqual(dashboard.lineRows, base.salesByLine);
  assert.equal(dashboard.totals.salesAchievement, null);
  assert.equal(dashboard.totals.positivityAchievement, null);
});

test('dashboard materializa as cinco divisões históricas antes da tela e da exportação', () => {
  const m1: CanonicalList = {
    id: 'M1_ITEM_ESTOQUE', generatedAt: base.generatedAt, competence: base.competence, snapshotDate: '2026-08-25', sources: ['286'], warnings: [], errors: [],
    records: [
      { item_canonical_id: 'I:1', winthor_code: '1', description_internal: 'CD COLGATE TOTAL 12' },
      { item_canonical_id: 'I:2', winthor_code: '2', description_internal: 'ESCOVA DENTAL COLGATE' },
      { item_canonical_id: 'I:3', winthor_code: '3', description_internal: 'SABONETE PROTEX' },
      { item_canonical_id: 'I:4', winthor_code: '4', description_internal: 'SHAMPOO PALMOLIVE' },
      { item_canonical_id: 'I:5', winthor_code: '5', description_internal: 'PINHO SOL ORIGINAL' },
    ],
  };
  const sales: CanonicalList = {
    id: 'M3_MOVIMENTO_VENDAS', generatedAt: base.generatedAt, competence: base.competence, snapshotDate: '2026-08-25', sources: ['8022'], warnings: [], errors: [],
    records: [1, 2, 3, 4, 5].map(code => ({ fact_type: 'SALE', event_date: '2026-08-25', customer_canonical_id: `C:${code}`, order_status: code === 5 ? 'A FATURAR' : 'FATURADO', winthor_product_code: String(code), value: 100 })),
  };
  const lineBase: SellOutViewModel = { ...base, sourceFacts: { sales: 5, targets: 0 }, totals: { ...base.totals, invoiced: 400, toInvoice: 100, realized: 500, positiveCustomers: 5 }, dailyRows: [{ date: '2026-08-25', invoiced: 400, toInvoice: 100, realized: 500 }] };
  const dashboard = buildSellOutDashboardModel({ base: lineBase, m1, m3: sales, targets: { sellOutTarget: 1000, positivityTarget: 10 } });
  assert.deepEqual(dashboard.lineRows.map(row => row.line), ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza']);
  assert.deepEqual(dashboard.lineRows.map(row => row.realized), [100, 100, 100, 100, 100]);
  assert.equal(dashboard.lineRows[4].toInvoice, 100);
  assert.equal(dashboard.lineUnclassifiedValue, 0);
  assert.deepEqual(dashboard.operationalModel.salesByLine, dashboard.lineRows);
});
