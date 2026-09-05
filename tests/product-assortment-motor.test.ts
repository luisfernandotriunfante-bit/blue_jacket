import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import { parseAssortmentPresence } from '../src/canonical/assortment.ts';
import type { ParsedSource, RawTyped } from '../src/canonical/types.ts';

const typed = (value: unknown): RawTyped => ({ raw: value, typed: value });
const source = (name: string, records: Array<Record<string, unknown>>): ParsedSource => ({
  source: name, fileName: name, sheet: 'Planilha1', audits: [],
  rows: records.map(record => Object.fromEntries(Object.entries(record).map(([field, value]) => [field, typed(value)]))),
});

test('M1 materializa canais oficiais do sortimento mais atual por EAN', () => {
  const bundle = buildCanonicalBundleFromStaging([
    source('cadastro-itens-286.xls', [{ winthor_code: '565', internal_ean: '7891234567895', description_286: 'COLGATE TOTAL' }]),
    source("Sortimento Recomendado - Q3'26.xlsx", [
      { sortimentDataset: 'JUL_BASE', ean: '7891234567895', hiper: 2, super_g: 0, vizinhan_a_gde: 0 },
      { sortimentDataset: 'AUG_SEP_BASE', ean: '7891234567895', hiper: 1, super_g: 2, vizinhan_a_gde: 1, vizinhan_a_peq: 0, brand: 'COLGATE', subbrand: 'TOTAL' },
    ]),
  ]);
  const item = bundle.lists.M1_ITEM_ESTOQUE.records.find(record => record.winthor_code === '565');
  assert.equal(item?.brand, 'COLGATE');
  assert.equal(item?.subbrand, 'TOTAL');
  assert.deepEqual(JSON.parse(String(item?.recommendation_json)), { hiper: 1, super_g: 2, vizinhan_a_gde: 1, vizinhan_a_peq: 0 });
});

test('leitura visual mostra somente faixas recomendadas e preserva a classificação', () => {
  const channels = parseAssortmentPresence(JSON.stringify({ hiper: 1, super_g: 2, vizinhan_a_gde: 1, vizinhan_a_peq: 0 }));
  assert.deepEqual(channels.map(channel => [channel.label, channel.range, channel.classification]), [
    ['Hiper', 'Faixa 1', 'Mandatório'],
    ['Super G', 'Faixa 2', 'Importante'],
    ['Vizinhança GDE', 'Faixa 4', 'Mandatório'],
  ]);
});
