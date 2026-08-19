import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/services/documentGenerator.ts','utf8');
const workbookSource = readFileSync('src/services/templateWorkbook.ts','utf8');

test('TOP REDES não exporta rede sem Meta Redes e sem Meta Tops', () => {
  const block = source.match(/function officialNetworks[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(block, /network\.networkTarget > 0 \|\| network\.topTarget > 0/);
  assert.doesNotMatch(block, /network\.total !== 0/);
});

test('TOP REDES aplica percentual validado em G H K L inclusive em estilo herdado', () => {
  assert.match(source, /workbook\.copyNumberFormat\(sheet,'K4',networkPercentageRefs\)/);
  assert.match(source, /workbook\.copyNumberFormat\(sheet,'K4',attainmentPercentageRefs\)/);
  assert.match(source, /detailRows\.flatMap\(row => \[ref\('G',row\),ref\('H',row\)\]\)/);
  assert.match(source, /detailRows\.flatMap\(row => \[ref\('K',row\),ref\('L',row\)\]\)/);
  assert.match(workbookSource, /effectiveNumberFormatId/);
  assert.match(workbookSource, /currentDirectNumFmtId === numFmtId && currentApplyNumberFormat === applyNumberFormat/);
  assert.match(workbookSource, /formattedStyle\.setAttribute\('applyNumberFormat', '1'\)/);
});
