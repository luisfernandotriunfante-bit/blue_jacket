import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildComboClientLookup, extractComboCnpjs, normalizeComboClientCode, normalizeComboCnpj } from '../src/domain/comboClients';
import { buildComboWorkbook } from '../src/services/comboWorkbook';

test('normaliza CNPJ digitado ou vindo do Excel sem perder zeros à esquerda', () => {
  assert.equal(normalizeComboCnpj('12.345.678/0001-90'), '12345678000190');
  assert.equal(normalizeComboCnpj('1234567800019'), '01234567800019');
  assert.equal(normalizeComboCnpj('12345678000'), '00012345678000');
  assert.equal(normalizeComboCnpj('12345'), '');
});

test('extrai lista única de CNPJs de TXT, CSV ou planilha', () => {
  const cnpjs = extractComboCnpjs(['CNPJ', '12.345.678/0001-90; 98.765.432/0001-10', '12345678000190']);
  assert.deepEqual([...cnpjs], ['12345678000190', '98765432000110']);
});

test('vínculo automático usa clientCode do 8022 e preserva conflitos para resolução manual', () => {
  const lookup = buildComboClientLookup([
    { cnpj: '12.345.678/0001-90', clientCode: '00123', clientName: 'Cliente A' },
    { cnpj: '12345678000190', clientCode: '123', clientName: 'Cliente A' },
    { cnpj: '98.765.432/0001-10', clientCode: '500', clientName: 'Cliente B' },
    { cnpj: '98765432000110', clientCode: '501', clientName: 'Cliente B' },
  ]);
  assert.deepEqual(lookup.get('12345678000190'), { cnpj: '12345678000190', name: 'Cliente A', codes: ['123'] });
  assert.deepEqual(lookup.get('98765432000110')?.codes, ['500', '501']);
  assert.equal(normalizeComboClientCode('000500.0'), '500');
});

test('Excel do combo possui exatamente as abas Produtos e Clientes com as colunas solicitadas', () => {
  const workbook = buildComboWorkbook([
    { codigo: '100', descricao: 'Produto Teste', tablePrice: 10, practicedPrice: 8 },
  ], [
    { cnpj: '01234567800019', clientCode: '500' },
  ]);

  assert.deepEqual(workbook.SheetNames, ['Produtos', 'Clientes']);
  const productRows = XLSX.utils.sheet_to_json(workbook.Sheets.Produtos, { header: 1, raw: true }) as unknown[][];
  const clientRows = XLSX.utils.sheet_to_json(workbook.Sheets.Clientes, { header: 1, raw: true }) as unknown[][];

  assert.deepEqual(productRows[0], ['Código do Item Winthor', 'Descrição Produto', 'Preço de Tabela', 'Preço Praticado', '% de Desconto']);
  assert.deepEqual(productRows[1], ['100', 'Produto Teste', 10, 8, 0.2]);
  assert.deepEqual(clientRows, [
    ['CNPJ', 'Código Winthor'],
    ['01234567800019', '500'],
  ]);
});
