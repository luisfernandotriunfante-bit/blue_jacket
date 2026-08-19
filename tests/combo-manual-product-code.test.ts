import test from 'node:test';
import assert from 'node:assert/strict';
import { matchedStockCodes, normalizeStockCode } from '../src/domain/stockCodeFilter';

test('codigo digitado manualmente aceita Winthor, EAN ou codigo de fabrica', () => {
  const products = [
    { codigo: '11100071', ean: '7891024033071', factoryCode: '61000123' },
  ];

  for (const raw of ['11100071', '7891024033071', '61000123', ' 11100071.0 ']) {
    const code = normalizeStockCode(raw);
    assert.equal(matchedStockCodes(products, new Set([code])).size, 1);
  }
});

test('codigo manual inexistente nao encontra produto', () => {
  const products = [{ codigo: '11100071', ean: '7891024033071', factoryCode: '61000123' }];
  const code = normalizeStockCode('99999999');
  assert.equal(matchedStockCodes(products, new Set([code])).size, 0);
});
