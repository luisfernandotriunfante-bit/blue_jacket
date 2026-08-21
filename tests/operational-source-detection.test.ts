import test from 'node:test';
import assert from 'node:assert/strict';
import { supplementalSourceKind } from '../src/services/operationalSources.ts';

test('identifica variações de nome do relatório 12.322', () => {
  const names = [
    '12 322.txt',
    '12.322.txt',
    '12-322.txt',
    '12_322.txt',
    '12322.txt',
  ];

  for (const name of names) {
    assert.equal(supplementalSourceKind(name), 'receivedNotes12322', name);
  }
});

test('não confunde outros arquivos com 12.322', () => {
  assert.equal(supplementalSourceKind('entrada-notas-218.xls'), 'entryNotes218');
  assert.equal(supplementalSourceKind('pctabpr 13.xlsx'), 'winthorTablePrices');
  assert.equal(supplementalSourceKind('CARTEIRA 17.08.xlsx'), null);
});
