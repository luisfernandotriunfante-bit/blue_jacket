import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseTopRetailerSnapshot } from '../src/services/motors/customerMotor.ts';

test('categoria OURO do Roteiro permanece categoria e não vira faixa', () => {
  const header = Array(19).fill('');
  header[1] = 'DISTRIBUIDOR';
  header[2] = 'CNPJ';
  header[3] = 'LOJA';
  header[5] = 'REDE';
  header[8] = 'CNPJ GESTOR';
  header[9] = 'COD AGRUPAMENTO';
  header[10] = 'CATEGORIA';
  header[11] = 'TIPO LOJA';
  header[15] = 'NOME FANTASIA';
  header[16] = 'CIDADE';
  header[18] = 'META AGOSTO';
  const row = Array(19).fill('');
  row[1] = 'MILENIO';
  row[2] = '04757459000519';
  row[3] = 'LOJA TESTE';
  row[10] = 'OURO';
  const wb = { SheetNames:['Roteiro Ativo'], Sheets:{'Roteiro Ativo': XLSX.utils.aoa_to_sheet([header,row])} } as XLSX.WorkBook;
  const parsed = parseTopRetailerSnapshot(wb, '2026-08');
  assert.equal(parsed[0].topCategory, 'OURO');
  assert.equal('range' in parsed[0], false);
});
