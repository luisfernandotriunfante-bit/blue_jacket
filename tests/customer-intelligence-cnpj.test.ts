import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { filterCustomerProfilesByDeclaredCnpj } from '../src/services/customerIntelligenceCustomers.ts';
import type { CustomerCommercialProfile } from '../src/domain/customerIntelligenceTypes.ts';

const profile = (cnpj: string, raw: string): CustomerCommercialProfile => ({ cnpj, cnpjRaw: raw, name: raw, clientCode: '', network: '', environment: '', profile: '', tier: 'FAIXA 1', assortmentChannel: 'Hiper', city: '', state: '', vendorCode: '', coordinatorCode: '', coordinatorName: '', source: 'TESTE' });

test('Exportação PDVs respeita TIPO e nunca transforma CPF/código inválido em cliente CNPJ', () => {
  const workbook = { SheetNames: ['Exportação PDVs (9)'], Sheets: {
    'Exportação PDVs (9)': XLSX.utils.aoa_to_sheet([
      ['COD CLIENTE','TIPO'],
      [4594132000140,'CNPJ'],
      [12345678901,'CPF/CODIGO INVALIDO'],
    ]),
  } } as XLSX.WorkBook;
  const customers = [profile('04594132000140','4594132000140'), profile('00012345678901','12345678901')];
  const result = filterCustomerProfilesByDeclaredCnpj(workbook, customers);
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].cnpj, '04594132000140');
  assert.equal(result.removedInvalidType, 1);
});
