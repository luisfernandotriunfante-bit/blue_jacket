import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseStandaloneCustomerProfiles } from '../src/services/customerIntelligenceProfiles.ts';

test('perfil exige CNPJ de 14 dígitos canônicos', () => {
  const wb = { SheetNames:['Exportação PDVs'], Sheets:{'Exportação PDVs': XLSX.utils.aoa_to_sheet([
    ['AMBIENTE','COD CLIENTE','NOME_CLIENTE','FAIXAS','ESTADO','CIDADE','PERFIL','TIPO','REDE'],
    ['H&S',4757459000519,'ABV','FAIXA 1','MS','DOURADOS','VAREJO','CNPJ','REDE ABV'],
  ])} } as XLSX.WorkBook;
  assert.equal(parseStandaloneCustomerProfiles(wb).customers[0].cnpj.length, 14);
});