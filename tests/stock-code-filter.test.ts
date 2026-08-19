import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStockCodes, matchedStockCodes, normalizeStockCode, productMatchesStockCodeList } from '../src/domain/stockCodeFilter';

test('normaliza códigos copiados de TXT, CSV ou Excel', () => {
  assert.equal(normalizeStockCode("'11100071'"), '11100071');
  assert.equal(normalizeStockCode('789 1024-1379 4'), '789102413794');
  assert.equal(normalizeStockCode('507.0'), '507');
});

test('extrai lista única ignorando textos sem número', () => {
  const codes = extractStockCodes(['Código', '11100071; 11100148', '789102413794', 'produto']);
  assert.deepEqual([...codes], ['11100071', '11100148', '789102413794']);
});

test('filtro aceita código Winthor, código fábrica ou EAN', () => {
  const codes = new Set(['507', '11100148', '789102413794']);
  assert.equal(productMatchesStockCodeList({ codigo: '507' }, codes), true);
  assert.equal(productMatchesStockCodeList({ codigo: '900', factoryCode: '11100148' }, codes), true);
  assert.equal(productMatchesStockCodeList({ codigo: '901', ean: '789102413794' }, codes), true);
  assert.equal(productMatchesStockCodeList({ codigo: '902', factoryCode: '11100999' }, codes), false);
});

test('informa quantos códigos importados existem no catálogo', () => {
  const codes = new Set(['507', '11100148', '789102413794', '999999']);
  const matched = matchedStockCodes([
    { codigo: '507' },
    { factoryCode: '11100148' },
    { ean: '789102413794' },
  ], codes);
  assert.deepEqual([...matched], ['507', '11100148', '789102413794']);
});
