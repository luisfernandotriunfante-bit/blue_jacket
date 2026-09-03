import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parse286 } from '../src/canonical/parsers.ts';
import { sourceImportTestHelpers } from '../src/canonical/sourceImport.ts';

const SOURCE = 'cadastro-itens-286.xls';

test('286 lê Código e EAN nas colunas físicas do relatório Winthor', async () => {
  const visualHeader = Array(26).fill('');
  visualHeader[0] = 'Código';
  visualHeader[21] = 'Barras';

  const item = Array(26).fill('');
  item[0] = '11'; // filial: não é o código do produto
  item[1] = '469';
  item[2] = 'COLGATE LUMINOUS WHITE 70G';
  item[5] = '01X070G';
  item[7] = 'UN';
  item[20] = '6920354822193'; // o EAN fica em U, antes do cabeçalho visual Barras
  item[23] = '61030217';

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([visualHeader, item]), 'Report');
  const bytes = XLSX.write(workbook, { bookType: 'xls', type: 'array' });

  const parsed = await parse286(new File([bytes], SOURCE, { type: 'application/vnd.ms-excel' }));
  assert.equal(parsed.audits.length, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.winthor_code?.typed, '469');
  assert.equal(parsed.rows[0]!.internal_ean?.typed, '6920354822193');
  assert.equal(parsed.rows[0]!.manufacturer_code?.typed, '61030217');
});

test('a correção invalida o staging antigo do 286', () => {
  assert.equal(sourceImportTestHelpers.parserVersionFor(SOURCE), 'browser-v2-286-physical-column-layout');
});
