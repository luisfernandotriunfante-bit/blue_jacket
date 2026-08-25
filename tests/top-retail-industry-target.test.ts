import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';

const base = { sources: [], generatedAt: '', competence: '2026-08', snapshotDate: '', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE A', top_target: 100 }] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'TARGET', sales_target: 200 }, { fact_type: 'TARGET', sales_target: 300 }, { fact_type: 'SALE', cnpj: '00111111000100', value: 50 }] };

test('Meta Indústria usada na referência é a soma dos fatos TARGET do M3', () => {
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 500 });
  assert.equal(view.totals.industryTarget, 500);
  assert.equal(view.rows[0]?.tcReferenceTarget, 200);
});
