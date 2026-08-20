import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { enrichAssortmentWith322 } from '../src/services/customerIntelligence322.ts';
import type { AssortmentCompetence } from '../src/domain/customerIntelligenceTypes.ts';

const competence: AssortmentCompetence = {
  key: '2026-08_09', label: 'Agosto/Setembro/26', validFrom: '2026-08-01', validTo: '2026-09-30', sourceSheet: 'oficial',
  expectedTotalsByChannel: { Hiper: { total: 1, mandatory: 1, important: 0 } },
  products: [{ ean: '7509546667881', colgateSku: '', winthorCode: '', description: 'Produto', categoryMaster: '', category: '', subcategory: '', brand: '', subbrand: '', segment: '', subsegment: '', contents: '', amount: '', promoPack: '', launchLabel: '', lifecycleStatus: 'ATIVO', recommendations: [{ channel: 'Hiper', value: 1 }], sourceSheet: 'oficial' }],
};

test('322 complementa somente correspondência e não altera recomendação oficial', () => {
  const workbook = { SheetNames: ['322'], Sheets: { '322': XLSX.utils.aoa_to_sheet([
    ['COD','DESCRIÇÃO','UM','%COM','ACX','DM','%D.MAX','QTD CX','CONV','PESO LIQ','PESO BRU','PONTOS','CLASSE','COD FORN','COD BARRA'],
    [11100002,'Produto',0,0,'Nao','Sim',0,1,12,0,0,0,'0-Ven','61002166',7509546667881],
  ]) } } as XLSX.WorkBook;
  const result = enrichAssortmentWith322(workbook, [competence]);
  assert.equal(result.matchedByEan, 1);
  assert.equal(result.competences[0].products[0].winthorCode, '11100002');
  assert.equal(result.competences[0].products[0].colgateSku, '61002166');
  assert.equal(result.competences[0].products[0].recommendations[0].value, 1);
  assert.equal(result.competences[0].expectedTotalsByChannel.Hiper.total, 1);
});
