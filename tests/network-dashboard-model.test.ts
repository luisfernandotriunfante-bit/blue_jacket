import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetworkDashboardModel, redistributeNetworkAllocation, resolveNetworkAllocation } from '../src/canonical/networkDashboardModel.ts';
import type { TopNetworksViewModel } from '../src/canonical/operationalViewModels.ts';

const base: TopNetworksViewModel = {
  motorBuildId: 'motor-test', stagingManifestHash: 'hash', generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', audits: [], teamRows: [], storeRows: [],
  rows: [
    { network: 'A', customers: 1, invoiced: 500, toInvoice: 0, realized: 500, share: .5, resolutionStatus: 'SOURCE_PRESERVED', networkTarget: null, topTarget: null, gap: null, achievement: null },
    { network: 'B', customers: 1, invoiced: 300, toInvoice: 0, realized: 300, share: .3, resolutionStatus: 'SOURCE_PRESERVED', networkTarget: null, topTarget: null, gap: null, achievement: null },
    { network: 'C', customers: 1, invoiced: 200, toInvoice: 0, realized: 200, share: .2, resolutionStatus: 'SOURCE_PRESERVED', networkTarget: null, topTarget: null, gap: null, achievement: null },
  ],
  totals: { networks: 3, customers: 3, realized: 1000, invoiced: 1000, toInvoice: 0, networkTarget: null },
  reconciliation: { rowsEqualTotal: true, mappedUniverseValue: 1000 },
};

test('meta total de redes é distribuída proporcionalmente quando não há ajuste manual', () => {
  const resolved = resolveNetworkAllocation(2000, base.rows);
  assert.equal(resolved.source, 'PROPORTIONAL');
  assert.deepEqual(resolved.allocation, { A: 1000, B: 600, C: 400 });
});

test('ajuste de uma rede preserva a meta total e redistribui todas as demais pela participação', () => {
  const allocation = redistributeNetworkAllocation(2000, base.rows, 'A', 1200);
  assert.deepEqual(allocation, { A: 1200, B: 480, C: 320 });
  assert.equal(Object.values(allocation).reduce((sum, value) => sum + value, 0), 2000);
});

test('dashboard usa alocação manual pronta e recalcula somente gap e atingimento da meta manual', () => {
  const dashboard = buildNetworkDashboardModel({ base, networkTarget: 2000, allocation: { A: 1200, B: 480, C: 320 } });
  assert.equal(dashboard.allocationSource, 'MANUAL');
  assert.equal(dashboard.operationalModel.totals.networkTarget, 2000);
  assert.equal(dashboard.operationalModel.rows.find(row => row.network === 'A')?.networkTarget, 1200);
  assert.equal(dashboard.operationalModel.rows.find(row => row.network === 'A')?.gap, 700);
  assert.equal(dashboard.operationalModel.rows.find(row => row.network === 'A')?.achievement, 500 / 1200);
});
