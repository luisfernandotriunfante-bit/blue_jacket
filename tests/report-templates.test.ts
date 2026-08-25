import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { buildSellOutViewModel, buildTopNetworksViewModel } from '../src/canonical/operationalViewModels.ts';
import { fillSellOutTemplateBytes, fillTopNetworksTemplateBytes } from '../src/canonical/reportTemplates.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m1 = { ...base, id: 'M1_ITEM_ESTOQUE' as const, records: [{ item_canonical_id: 'ITEM:1', winthor_code: '1', category_master: 'Linha teste', physical_stock_units: 4, cost_unit_105: 10, pVenda1_region11: 15 }] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00123456000100', customer_name: 'Cliente Teste', trade_name: 'Loja Teste', city: 'Campo Grande', winthor_customer_code: '99', premise_network: 'REDE TESTE', top_target: 40, network_resolution_status: 'SOURCE_PRESERVED' }] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
  { fact_type: 'SALE', source: '8022', order_status: 'FATURADO', value: 100, event_date: '2026-08-01', cnpj: '00123456000100', transaction_rca_code: '10', item_canonical_id: 'ITEM:1' },
  { fact_type: 'SALE', source: '8022', order_status: 'A FATURAR', value: 20, event_date: '2026-08-02', cnpj: '00123456000100', transaction_rca_code: '10', item_canonical_id: 'ITEM:1' },
  { fact_type: 'TARGET', source: 'BUSSOLA', rca_canonical_id: 'RCA:10', transaction_rca_code: '10', sales_target: 200, positivity_target: 2 },
] };

test('official Sell Out template is preserved structurally and filled from the same canonical view-model', () => {
  const view = buildSellOutViewModel({ m1, m2, m3, generatedAt: '2026-08-25T00:00:00Z' });
  const bytes = fillSellOutTemplateBytes(new Uint8Array(readFileSync('public/templates/painel-sell-out-padrao.xlsx')), view);
  const reopened = XLSX.read(bytes, { type: 'array', cellDates: true });
  assert.deepEqual(reopened.SheetNames, ['SELL OUT - Milenio 2026', 'EQUIPES']);
  const sheet = reopened.Sheets['SELL OUT - Milenio 2026']!;
  assert.equal(sheet.M9?.v, 100); assert.equal(sheet.M10?.v, 20); assert.equal(sheet.M11?.v, 120); assert.equal(sheet.L19?.v, 60); assert.equal(sheet.L26?.v, 40);
  assert.equal(sheet.J41?.v, 120); assert.equal(typeof sheet.M11?.v, 'number');
  assert.equal(Object.values(unzipSync(bytes)).some(part => /<f(?:\s|>)/.test(strFromU8(part))), false);
});

test('official Top Redes export retains only its visual panel and has no formula or technical-base parts', () => {
  const view = buildTopNetworksViewModel({ m2, m3, generatedAt: '2026-08-25T00:00:00Z' });
  const bytes = fillTopNetworksTemplateBytes(new Uint8Array(readFileSync('public/templates/top-redes-padrao.xlsx')), view);
  const reopened = XLSX.read(bytes, { type: 'array', cellDates: true });
  assert.deepEqual(reopened.SheetNames, ['Top Redes']);
  const main = reopened.Sheets['Top Redes']!;
  assert.equal(main.F2?.v, 100); assert.equal(main.I2?.v, 20); assert.equal(main.A4?.v, 'REDE TESTE');
  const parts = unzipSync(bytes); const text = Object.entries(parts).map(([path, part]) => [path, strFromU8(part)] as const);
  assert.equal(text.some(([path]) => /12\.326|319|Loja a Loja|redes|Equipe/.test(path)), false);
  assert.equal(text.some(([, xml]) => /<f(?:\s|>)/.test(xml)), false);
  assert.equal(text.some(([path]) => /externalLinks|connections|queryTables|vbaProject/.test(path)), false);
});

test('template report modules do not read parsers, motors, source files, or mutate canonical lists', () => {
  for (const file of ['src/canonical/reportTemplates.ts', 'src/canonical/operationalExporters.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"].*\/(parsers|motors)['"]/);
    assert.doesNotMatch(source, /canonical-staging|canonical-motors/);
  }
});
