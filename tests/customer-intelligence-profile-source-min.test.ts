import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { hasStandaloneCustomerProfile } from '../src/services/customerIntelligenceProfiles.ts';

test('Exportação PDVs é fonte de perfil mesmo sem 310', () => {
  const wb = { SheetNames: ['Exportação PDVs'], Sheets: { 'Exportação PDVs': XLSX.utils.aoa_to_sheet([['COD CLIENTE','NOME_CLIENTE','FAIXAS','PERFIL','TIPO']]) } } as XLSX.WorkBook;
  assert.equal(hasStandaloneCustomerProfile(wb), true);
});