import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseSortimento } from '../src/canonical/parsers.ts';
import { ASSORTMENT_CHANNELS } from '../src/canonical/assortment.ts';
import { sourceImportTestHelpers } from '../src/canonical/sourceImport.ts';

const channels = ASSORTMENT_CHANNELS.map(channel => channel.headers[0]);
const sheet = (headers: string[], values: unknown[]) => XLSX.utils.aoa_to_sheet([headers, values]);
const workbook = (julyDescription: 'DESCRIÇÃO' | 'DESC', julyBlankBeforeEan = false) => {
  const book = XLSX.utils.book_new();
  const variants = [
    { name: 'Jul26 - Base_Sortimento_Naciona', headers: ['STATUS','COD CMD','COD','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO',julyDescription], values: ['ATIVO','565','COL565','7891234567895','','ORAL','','COLGATE','TOTAL','','','90G',90,'','','TOTAL 90G'] },
    { name: 'Ago & Set26 - Base_Sortimento_N', headers: ['STATUS','COD','','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO'], values: ['ATIVO','COL565','565','7891234567895','','ORAL','','COLGATE','TOTAL','','','90G',90,'','','TOTAL 90G'] },
    { name: 'SORTIMENTO HAIR CARE AGO26 &SET', headers: ['STATUS','COD ANTIGO','EAN ANTIGO','COD NOVO','EAN NOVO','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO'], values: ['ATIVO','','','565','7891234567895','','HAIR','','PALMOLIVE','','','','',0,'','','HAIR'] },
    { name: 'Descontinuados Q326', headers: ['STATUS','COD','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO'], values: ['INATIVO','565','7891234567895','','ORAL','','COLGATE','TOTAL','','','90G',90,'','','TOTAL 90G'] },
  ];
  if (julyBlankBeforeEan) { variants[0].headers.splice(3, 0, ''); variants[0].values.splice(3, 0, ''); }
  for (const variant of variants) XLSX.utils.book_append_sheet(book, sheet([...variant.headers, ...channels], [...variant.values, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0]), variant.name);
  return book;
};

test('parser preserva cada canal nomeado das quatro abas do Sortimento Q3', async () => {
  const bytes = XLSX.write(workbook('DESCRIÇÃO'), { bookType: 'xlsx', type: 'array' });
  const parsed = await parseSortimento(new File([bytes], "Sortimento Recomendado - Q3'26.xlsx"));
  assert.equal(parsed.audits.length, 0);
  const current = parsed.rows.find(row => row.sortimentDataset?.typed === 'AUG_SEP_BASE');
  assert.equal(current?.hiper?.typed, 1);
  assert.equal(current?.super_g?.typed, 2);
  assert.equal(current?.vizinhan_a_gde?.typed, 1);
  assert.equal(current?.vizinhan_a_peq?.typed, 2);
});

test('parser aceita a variante contratada DESC na base de Julho', async () => {
  const bytes = XLSX.write(workbook('DESC'), { bookType: 'xlsx', type: 'array' });
  const parsed = await parseSortimento(new File([bytes], "Sortimento Recomendado - Q3'26.xlsx"));
  assert.equal(parsed.audits.length, 0);
  assert.equal(parsed.rows.filter(row => row.sortimentDataset?.typed === 'JUL_BASE').length, 1);
});

test('parser aceita a variante de Julho com coluna D vazia antes do EAN', async () => {
  const bytes = XLSX.write(workbook('DESCRIÇÃO', true), { bookType: 'xlsx', type: 'array' });
  const parsed = await parseSortimento(new File([bytes], "Sortimento Recomendado - Q3'26.xlsx"));
  assert.equal(parsed.audits.length, 0);
  const july = parsed.rows.find(row => row.sortimentDataset?.typed === 'JUL_BASE');
  assert.equal(july?.ean?.typed, '7891234567895');
  assert.equal(july?.category?.typed, 'ORAL');
  assert.equal(july?.hiper?.typed, 1);
});

test('mudança de canais invalida o staging antigo do Sortimento Q3', () => {
  assert.equal(sourceImportTestHelpers.parserVersionFor("Sortimento Recomendado - Q3'26.xlsx"), 'browser-v4-jul-optional-blank-before-ean');
});
