import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import { matchesAssortmentRanges, parseAssortmentPresence, parseRangeAssortmentPresence } from '../src/canonical/assortment.ts';
import type { ParsedSource, RawTyped } from '../src/canonical/types.ts';

const typed = (value: unknown): RawTyped => ({ raw: value, typed: value });
const source = (name: string, records: Array<Record<string, unknown>>): ParsedSource => ({
  source: name, fileName: name, sheet: 'Planilha1', audits: [],
  rows: records.map(record => Object.fromEntries(Object.entries(record).map(([field, value]) => [field, typed(value)]))),
});

test('recorte de Produtos mostra somente os canais que representam faixas de clientes', () => {
  const channels = parseRangeAssortmentPresence(JSON.stringify({ hiper: 1, super_g: 2, c_c: 1, drogaria: 1, farma_bairro_1_a_4: 2, e_commerce_pure_players_1p_3p: 1, vizinhan_a_gde: 1, vizinhan_a_peq: 2, tradicional_independente: 1, sortimento_distribuidores: 1 }));
  assert.deepEqual(channels.map(channel => channel.label), ['Hiper', 'Super G', 'Vizinhança GDE', 'Vizinhança PEQ', 'Tradicional']);
  assert.ok(channels.every(channel => channel.range.startsWith('Faixa ')));
});

test('filtro múltiplo aceita item presente em qualquer faixa selecionada', () => {
  const item = { assortment: parseRangeAssortmentPresence(JSON.stringify({ hiper: 1, super_g: 0, super_p: 0, vizinhan_a_gde: 2, vizinhan_a_peq: 0 })) };
  assert.equal(matchesAssortmentRanges(item.assortment, []), true);
  assert.equal(matchesAssortmentRanges(item.assortment, ['Faixa 2', 'Faixa 4']), true);
  assert.equal(matchesAssortmentRanges(item.assortment, ['Faixa 2', 'Faixa 5']), false);
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
  const channels = parseAssortmentPresence(JSON.stringify({ hiper: 1, super_g: 2, farma_bairro_1_a_4: 5, vizinhan_a_gde: 1, vizinhan_a_peq: 0 }));
  assert.deepEqual(channels.map(channel => [channel.label, channel.range, channel.classification]), [
    ['Hiper', 'Faixa 1', 'Mandatório'],
    ['Super G', 'Faixa 2', 'Importante'],
    ['Farma Bairro 1 a 4', '', 'Recomendado'],
    ['Vizinhança GDE', 'Faixa 4', 'Mandatório'],
  ]);
});
