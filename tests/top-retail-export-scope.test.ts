import test from 'node:test';
import assert from 'node:assert/strict';
import { topNetworksExportRows } from '../src/canonical/operationalExporters.ts';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE A', top_target: 500 }] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'SALE', cnpj: '00111111000100', value: 100, order_status: 'FATURADO' }, { fact_type: 'TARGET', sales_target: 1000 }] };

test('JSON/planilha operacional recebem as mesmas colunas da tabela Redes', () => {
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 400 });
  const row = topNetworksExportRows(view)[0]!;
  assert.deepEqual(Object.keys(row), ['Rede', 'Clientes', 'Meta da rede', 'Meta Top Varejista', 'Ating. Meta Rede', 'Ating. Meta Top', 'Faturado', 'A faturar', 'Total', 'Participação']);
  assert.equal(row['Meta da rede'], 400);
  assert.equal(row['Meta Top Varejista'], 500);
  assert.equal(row.Total, 100);
});
