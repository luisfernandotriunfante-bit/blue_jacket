import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { officialAssortmentCoverage } from '../src/services/customerIntelligenceOfficialWorkbook.ts';

test('arquivo apenas de Julho não é promovido silenciosamente para Agosto/Setembro', () => {
  const workbook = { SheetNames: ['Jul26 - Base Sortimento'], Sheets: { 'Jul26 - Base Sortimento': XLSX.utils.aoa_to_sheet([['EAN','DESCRIÇÃO']]) } } as XLSX.WorkBook;
  const coverage = officialAssortmentCoverage(workbook);
  assert.equal(coverage.hasJuly, true);
  assert.equal(coverage.hasAugSep, false);
});
