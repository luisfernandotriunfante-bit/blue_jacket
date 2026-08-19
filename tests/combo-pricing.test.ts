import test from 'node:test';
import assert from 'node:assert/strict';
import { comboDiscount, parseComboPrice, selectComboProducts } from '../src/domain/comboPricing';

test('preço praticado aceita formato brasileiro e valor zero', () => {
  assert.equal(parseComboPrice('R$ 12,50'), 12.5);
  assert.equal(parseComboPrice('1.234,56'), 1234.56);
  assert.equal(parseComboPrice('0'), 0);
  assert.equal(parseComboPrice(''), null);
});

test('desconto compara preço praticado com preço de tabela', () => {
  assert.equal(comboDiscount(100, 80), 0.2);
  assert.equal(comboDiscount(100, 100), 0);
  assert.equal(comboDiscount(100, 110), -0.1);
  assert.equal(comboDiscount(0, 10), null);
});

test('combo aceita EAN, código Winthor ou fábrica e exige preço válido do 105', () => {
  const products = [
    { codigo: '507', descricao: 'A', ean: '7891000000001', factoryCode: '11100071', vendaUnitario: 10, hasWinthor: true },
    { codigo: '508', descricao: 'B', ean: '7891000000002', factoryCode: '11100072', vendaUnitario: 0, hasWinthor: true },
    { codigo: 'PORTFOLIO-X', descricao: 'C', ean: '7891000000003', factoryCode: '11100073', vendaUnitario: 12, hasWinthor: false },
  ];

  assert.deepEqual(selectComboProducts(products, new Set(['507'])).map(item => item.codigo), ['507']);
  assert.deepEqual(selectComboProducts(products, new Set(['7891000000001'])).map(item => item.codigo), ['507']);
  assert.deepEqual(selectComboProducts(products, new Set(['11100071'])).map(item => item.codigo), ['507']);
  assert.deepEqual(selectComboProducts(products, new Set(['508', '11100073'])), []);
});
