import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';

const base = { sources: [], generatedAt: '', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE A', top_target: 500 }] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'TARGET', sales_target: 1000 }] };

test('Meta T&C sozinha não cria Meta Redes Geral', () => {
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 5000000, networkTargetTotal: null });
  assert.equal(view.totals.networkTarget, null);
  assert.equal(view.rows[0]?.networkTarget, null);
  assert.equal(view.rows[0]?.tcReferenceTarget, 2500000);
});
