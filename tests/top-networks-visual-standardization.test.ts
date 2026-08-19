import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workbookSource = readFileSync('src/services/templateWorkbook.ts','utf8');
const generatorSource = readFileSync('src/services/documentGenerator.ts','utf8');

test('TOP REDES normaliza todas as linhas de detalhe pelo mesmo estilo-base', () => {
  assert.match(workbookSource, /const normalizeTopNetworks = sheetName === 'Top Redes'/);
  assert.match(workbookSource, /row\.removeAttribute\('hidden'\)/);
  assert.match(workbookSource, /row\.removeAttribute\('collapsed'\)/);
  assert.match(workbookSource, /sourceCell\?\.getAttribute\('s'\)/);
  assert.match(workbookSource, /cell\.setAttribute\('s', sourceStyle\)/);
});

test('TOP REDES limpa filtros herdados sem remover a estrutura de autofiltro', () => {
  assert.match(workbookSource, /function clearFilterCriteria\(document: XMLDocument\)/);
  assert.match(workbookSource, /filterColumn/);
  assert.match(workbookSource, /clearFilterCriteria\(document\)/);
  assert.match(workbookSource, /\^xl\\\/tables\\\/\[\^\/\]\+\\\.xml\$/);
});

test('percentuais usam formato efetivo herdado e forçam aplicação direta no Excel', () => {
  assert.match(workbookSource, /effectiveNumberFormatId/);
  assert.match(workbookSource, /cellStyleXfs/);
  assert.match(workbookSource, /formattedStyle\.setAttribute\('applyNumberFormat', '1'\)/);
  assert.match(generatorSource, /workbook\.copyNumberFormat\(sheet,'K4',networkPercentageRefs\)/);
  assert.match(generatorSource, /workbook\.copyNumberFormat\(sheet,'K4',attainmentPercentageRefs\)/);
});
