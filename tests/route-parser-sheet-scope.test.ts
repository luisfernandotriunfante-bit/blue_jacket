import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseRoteiroTop } from '../src/canonical/parsers.ts';
import { sourceImportTestHelpers } from '../src/canonical/sourceImport.ts';

const SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";

test('Roteiro Top lê somente o contrato da aba Roteiro Ativo', async () => {
  const headers = ['APG','DISTRIBUIDOR','CNPJ','LOJA','BANDEIRA','REDE','ENDEREÇO','UF','CNPJ GESTOR','COD AGRUPAMENTO','CATEGORIA','TIPO LOJA','SCANNTECH','COMPRA','AMBIENTE DE VAREJO','NOME FANTASIA','CIDADE','REGIONAL',"META AGO'26"];
  const row = ['BR5204','MILENIO','12345678000190','LOJA TESTE','BANDEIRA TESTE','REDE ALFA','RUA TESTE 1','MS','12345678000190','GRUPO 1','OURO','LOJA FISICA','SIM','LOJA A LOJA','SUPER','FANTASIA TESTE','CAMPO GRANDE','CO/N',52941.58];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]), 'Roteiro Ativo');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ALTERAÇÕES']]), 'Alterações');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const file = new File([bytes], SOURCE, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const parsed = await parseRoteiroTop(file);
  assert.equal(parsed.audits.length, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.cnpj?.typed, '12345678000190');
  assert.equal(parsed.rows[0]!.distributor?.typed, 'MILENIO');
  assert.equal(parsed.rows[0]!.store_name?.typed, 'LOJA TESTE');
  assert.equal(parsed.rows[0]!.top_network?.typed, 'REDE ALFA');
  assert.equal(parsed.rows[0]!.top_target?.typed, 52941.58);
  assert.equal(parsed.rows[0]!.network, undefined);
});

test('Roteiro Top aceita a meta do mês vigente na coluna S', async () => {
  const headers = ['APG','DISTRIBUIDOR','CNPJ','LOJA','BANDEIRA','REDE','ENDEREÇO','UF','CNPJ GESTOR','COD AGRUPAMENTO','CATEGORIA','TIPO LOJA','SCANNTECH','COMPRA','AMBIENTE DE VAREJO','NOME FANTASIA','CIDADE','REGIONAL',"META SET'26"];
  const row = ['BR5204','MILENIO','12345678000190','LOJA TESTE','BANDEIRA TESTE','REDE ALFA','RUA TESTE 1','MS','12345678000190','GRUPO 1','OURO','LOJA FISICA','SIM','LOJA A LOJA','SUPER','FANTASIA TESTE','CAMPO GRANDE','CO/N',73500];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]), 'Roteiro Ativo');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const file = new File([bytes], SOURCE, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const parsed = await parseRoteiroTop(file);
  assert.equal(parsed.audits.length, 0);
  assert.equal(parsed.rows[0]!.top_target?.typed, 73500);
});

test('Roteiro Top mantém a rejeição para uma coluna S que não seja meta mensal', async () => {
  const headers = ['APG','DISTRIBUIDOR','CNPJ','LOJA','BANDEIRA','REDE','ENDEREÇO','UF','CNPJ GESTOR','COD AGRUPAMENTO','CATEGORIA','TIPO LOJA','SCANNTECH','COMPRA','AMBIENTE DE VAREJO','NOME FANTASIA','CIDADE','REGIONAL','META ACUMULADA'];
  const row = ['BR5204','MILENIO','12345678000190','LOJA TESTE','BANDEIRA TESTE','REDE ALFA','RUA TESTE 1','MS','12345678000190','GRUPO 1','OURO','LOJA FISICA','SIM','LOJA A LOJA','SUPER','FANTASIA TESTE','CAMPO GRANDE','CO/N',73500];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]), 'Roteiro Ativo');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const file = new File([bytes], SOURCE, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const parsed = await parseRoteiroTop(file);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.audits[0]?.code, 'PARSER_SCHEMA_CHANGED');
});

test('mudança do parser invalida o staging antigo do Roteiro Top', () => {
  assert.equal(sourceImportTestHelpers.parserVersionFor(SOURCE), 'browser-v3-route-monthly-meta');
});
