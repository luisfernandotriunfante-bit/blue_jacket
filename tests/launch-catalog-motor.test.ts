import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import type { ParsedSource, RawTyped } from '../src/canonical/types.ts';

const typed = (value: unknown): RawTyped => ({ raw: value, typed: value });
const source = (name: string, records: Array<Record<string, unknown>>): ParsedSource => ({
  source: name,
  fileName: name,
  sheet: 'Planilha1',
  rows: records.map(record => Object.fromEntries(Object.entries(record).map(([field, value]) => [field, typed(value)]))),
  audits: [],
});

test('Lista Oficial vincula lançamento por EAN mesmo quando COD não coincide com Winthor', () => {
  const bundle = buildCanonicalBundleFromStaging([
    source('cadastro-itens-286.xls', [{ winthor_code: '999', internal_ean: '7891234567895', description_286: 'PRODUTO NOVO' }]),
    source('pctabpr 13.xlsx', [{ codprod: '999', pvenda: 9, vlst: 1.5, pvenda1: 10.5 }]),
    source('lançamentos.xlsx', [{ launch_winthor_code: '1', launch_ean: '7891234567895', launch_description: 'PRODUTO NOVO', launch_status: 'ATIVO' }]),
  ]);
  const item = bundle.lists.M1_ITEM_ESTOQUE.records.find(record => record.winthor_code === '999');
  assert.equal(item?.is_launch, true);
  assert.equal(item?.launch_status, 'ATIVO');
  assert.equal(item?.pVenda, 9);
  assert.equal(item?.vlSt, 1.5);
  assert.equal(item?.pVenda1_region11, 10.5);
});

test('lançamento ainda sem cadastro também é materializado no M1', () => {
  const bundle = buildCanonicalBundleFromStaging([
    source('lançamentos.xlsx', [{ launch_ean: '7891234567895', launch_description: 'SEM CADASTRO', launch_status: 'ATIVO' }]),
  ]);
  const item = bundle.lists.M1_ITEM_ESTOQUE.records.find(record => record.internal_ean === '7891234567895');
  assert.equal(item?.is_launch, true);
  assert.equal(item?.mapping_status, 'LAUNCH_PENDING_CATALOG');
});
