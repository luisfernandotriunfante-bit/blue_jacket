import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseOfficialAssortmentWorkbook } from '../src/services/customerIntelligenceSources.ts';

function sheet(rows: unknown[][]) { return XLSX.utils.aoa_to_sheet(rows); }

function rows(label: string) {
  const header = ['STATUS','COD','','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO','Hiper'];
  return [
    [label,'','','','','','','','','','','','','','','TOTAL SKUs',1],
    ['','','','','','','','','','','','','','','','TOTAL SKUs MANDATÓRIOS (1)',1],
    ['','','','','','','','','','','','','','','','TOTAL SKUs IMPORTANTES (2)',0],
    header,
    ['ATIVO','61000001','11100001','7891000000011','','','','','','','','','','','','Mandatório',1],
    ['ATIVO','61000002','11100002','7891000000028','','','','','','','','','','','','Plano tático',5],
  ];
}

test('valor 5 continua recomendado pela regra de negócio mesmo quando controle declarado da fonte o exclui', () => {
  const workbook = { SheetNames: ['Jul26 - Base_Sortimento_Naciona','Ago & Set26 - Base_Sortimento_N','Descontinuados Q326'], Sheets: {
    'Jul26 - Base_Sortimento_Naciona': sheet(rows("Jul'26 Base Sortimento Nacional")),
    'Ago & Set26 - Base_Sortimento_N': sheet(rows("Ago e Set'26 Base Sortimento Nacional")),
    'Descontinuados Q326': sheet([['STATUS','COD','EAN','DESCRIÇÃO'],['', '', '', '']]),
  } } as XLSX.WorkBook;
  const parsed = parseOfficialAssortmentWorkbook(workbook);
  const current = parsed.competences[1];
  const nonZero = current.products.filter(product => (product.recommendations.find(item => item.channel === 'Hiper')?.value || 0) !== 0).length;
  assert.equal(current.expectedTotalsByChannel.Hiper.total, 1);
  assert.equal(nonZero, 2);
  assert.equal(current.products.find(product => product.ean === '7891000000028')?.recommendations[0].value, 5);
});
