import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeIndustryPriceListRows } from '../src/services/motors/unifiedEngine.ts';

test('Lista de Preço Colgate é reconhecida pela estrutura SKU + EAN + Un/CX mesmo com nome não padronizado', () => {
  const rows = [
    ['RELATÓRIO INDUSTRIAL'],
    ['SKU', 'Descrição Padrão', 'EAN', 'DUN14', 'Un/CX', 'CX/Pal'],
    ['61036090', 'Produto A', '7509546688091', '17509546688098', 12, 60],
  ];
  assert.equal(looksLikeIndustryPriceListRows(rows), true);
});

test('arquivo sem SKU/EAN/Un-CX não é promovido silenciosamente a Lista de Preço Colgate', () => {
  const rows = [['CODPROD', 'NUMREGIAO', 'PVENDA1'], [857, 11, 20.27]];
  assert.equal(looksLikeIndustryPriceListRows(rows), false);
});
