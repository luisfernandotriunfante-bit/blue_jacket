import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComboPortfolioLookup } from '../src/domain/comboClientPortfolio';

test('lê Código Cliente + CNPJ do Relatório Carteira de Clientes', () => {
  const lookup = buildComboPortfolioLookup([
    ['Relatório Carteira de Clientes'],
    ['415 - REPRESENTANTE'],
    ['Código Cliente', 'CNPJ', 'Cliente', 'Fantasia'],
    [1234, '13.512.218/0001-77', 'MICHELLE PEREIRA MATRICARDI FERREIRA', 'MERCADO FERREIRA'],
    [5678, '42.716.444/0001-78', 'RONALDO COLMAN MONTIEL', 'MERCADO TREVO'],
    ['Clientes Ativos 2'],
  ]);

  assert.deepEqual(lookup.get('13512218000177'), {
    cnpj: '13512218000177',
    name: 'MICHELLE PEREIRA MATRICARDI FERREIRA',
    codes: ['1234'],
  });
  assert.equal(lookup.get('42716444000178')?.codes[0], '5678');
});

test('aceita cabeçalho repetido e não escolhe silenciosamente códigos conflitantes', () => {
  const lookup = buildComboPortfolioLookup([
    ['Código Cliente', 'CNPJ', 'Cliente'],
    ['00123', '01.234.567/0001-89', 'CLIENTE A'],
    ['Código Cliente', 'CNPJ', 'Cliente'],
    ['00124', '01.234.567/0001-89', 'CLIENTE A'],
  ]);

  assert.deepEqual(lookup.get('01234567000189')?.codes, ['123', '124']);
});
