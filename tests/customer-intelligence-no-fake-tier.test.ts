import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseActiveRoute } from '../src/services/canonical/supportCore.ts';

test('categoria OURO do Roteiro não vira FAIXA', () => {
  const row = Array(19).fill(''); row[1]='MILENIO'; row[2]=4757459000519; row[10]='OURO';
  const wb = { SheetNames:['Roteiro Ativo'], Sheets:{'Roteiro Ativo': XLSX.utils.aoa_to_sheet([Array(19).fill(''),row])} } as XLSX.WorkBook;
  assert.equal(parseActiveRoute(wb)[0].tier, '');
});