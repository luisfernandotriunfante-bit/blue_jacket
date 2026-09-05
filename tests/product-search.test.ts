import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesProductSearch } from '../src/canonical/productSearch.ts';

const item = { description: 'CREME DENTAL COLGATE TOTAL 90G', winthor: '17-44', distributor: '61052478', ean: '7891234567895', line: 'CREME DENTAL', brand: 'COLGATE', subbrand: 'TOTAL', category: 'ORAL CARE' };

test('código numérico ou hifenizado exige correspondência exata', () => {
  assert.equal(matchesProductSearch(item, '17-44'), true);
  assert.equal(matchesProductSearch(item, '1744'), true);
  assert.equal(matchesProductSearch(item, '4567'), false);
  assert.equal(matchesProductSearch(item, '789123'), false);
});

test('descrição, marca e sub-brand continuam aceitando busca parcial', () => {
  assert.equal(matchesProductSearch(item, 'total'), true);
  assert.equal(matchesProductSearch(item, 'creme dental'), true);
});
