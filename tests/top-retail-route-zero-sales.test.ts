import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };

test('rede presente no Roteiro continua na tabela mesmo sem venda', () => {
  const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE SEM VENDA', top_target: 500 }] };
  const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'TARGET', sales_target: 1000 }] };
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 400 });
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.customers, 1);
  assert.equal(view.rows[0]?.customersWithSales, 0);
  assert.equal(view.rows[0]?.realized, 0);
  assert.equal(view.rows[0]?.networkTarget, 400);
});
