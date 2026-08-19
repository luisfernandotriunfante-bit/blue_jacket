import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildComboWorkbook } from '../src/services/comboWorkbook';

test('exportacao pode omitir clientes e colunas opcionais', () => {
  const workbook = buildComboWorkbook([
    { codigo: '100', descricao: 'Produto Teste', tablePrice: 10, practicedPrice: 8 },
  ], [
    { cnpj: '01234567800019', clientCode: '500' },
  ], {
    includeClients: false,
    includeTablePrice: false,
    includePracticedPrice: false,
    includeDiscount: false,
  });

  assert.deepEqual(workbook.SheetNames, ['Produtos']);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Produtos, { header: 1, raw: true }) as unknown[][];
  assert.deepEqual(rows, [
    ['Código do Item Winthor', 'Descrição Produto'],
    ['100', 'Produto Teste'],
  ]);
});

test('cada coluna opcional pode ser marcada de forma independente', () => {
  const workbook = buildComboWorkbook([
    { codigo: '100', descricao: 'Produto Teste', tablePrice: 10, practicedPrice: 8 },
  ], [], {
    includeClients: false,
    includeTablePrice: true,
    includePracticedPrice: false,
    includeDiscount: true,
  });

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Produtos, { header: 1, raw: true }) as unknown[][];
  assert.deepEqual(rows[0], ['Código do Item Winthor', 'Descrição Produto', 'Preço de Tabela', '% de Desconto']);
  assert.deepEqual(rows[1], ['100', 'Produto Teste', 10, 0.2]);
});
