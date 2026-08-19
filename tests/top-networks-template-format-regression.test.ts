import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';

const PATH = 'public/templates/top-redes-padrao.xlsx';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function packageParts() {
  const files = unzipSync(new Uint8Array(readFileSync(PATH)));
  const workbookDoc = new DOMParser().parseFromString(strFromU8(files['xl/workbook.xml']), 'application/xml');
  const relDoc = new DOMParser().parseFromString(strFromU8(files['xl/_rels/workbook.xml.rels']), 'application/xml');
  const sheet = Array.from(workbookDoc.getElementsByTagNameNS(MAIN_NS,'sheet')).find(item => item.getAttribute('name') === 'Top Redes');
  const rid = sheet?.getAttributeNS(REL_NS,'id') || sheet?.getAttribute('r:id');
  const rel = Array.from(relDoc.getElementsByTagName('Relationship')).find(item => item.getAttribute('Id') === rid);
  const target = String(rel?.getAttribute('Target') || '').replace(/^\//,'').replace(/^\.\//,'');
  const sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
  return { files, sheetDoc:new DOMParser().parseFromString(strFromU8(files[sheetPath]), 'application/xml') };
}

test('TOP REDES mantém F com a mesma tipografia/alinhamento estrutural dos demais valores', () => {
  const { sheetDoc } = packageParts();
  const cells = new Map(Array.from(sheetDoc.getElementsByTagNameNS(MAIN_NS,'c')).map(cell => [cell.getAttribute('r') || '',cell]));
  assert.equal(cells.get('F4')?.getAttribute('s'), cells.get('I4')?.getAttribute('s'));
});

test('TOP REDES mantém G e H como percentual no modelo', () => {
  const workbook = XLSX.read(readFileSync(PATH), { type:'buffer', cellNF:true });
  const sheet = workbook.Sheets['Top Redes'];
  assert.match(String((sheet.G4 as XLSX.CellObject).z || ''), /%/);
  assert.match(String((sheet.H4 as XLSX.CellObject).z || ''), /%/);
});

test('TOP REDES estende a formatação condicional de F G H e não deixa dxf trocar percentual por General', () => {
  const { files, sheetDoc } = packageParts();
  const sqrefs = Array.from(sheetDoc.getElementsByTagNameNS(MAIN_NS,'conditionalFormatting')).map(item => item.getAttribute('sqref') || '');
  assert.ok(sqrefs.some(value => /F4:F1000/.test(value)));
  assert.ok(sqrefs.some(value => /G4:G1000/.test(value)));
  assert.ok(sqrefs.some(value => /H4:H1000/.test(value)));

  const dxfIds = new Set(Array.from(sheetDoc.getElementsByTagNameNS(MAIN_NS,'cfRule')).map(rule => Number(rule.getAttribute('dxfId'))).filter(Number.isFinite));
  const stylesDoc = new DOMParser().parseFromString(strFromU8(files['xl/styles.xml']), 'application/xml');
  const dxfs = Array.from(stylesDoc.getElementsByTagNameNS(MAIN_NS,'dxf'));
  dxfIds.forEach(id => {
    const numFmt = dxfs[id]?.getElementsByTagNameNS(MAIN_NS,'numFmt')[0];
    assert.equal(numFmt, undefined, `dxf ${id} não pode sobrescrever o formato numérico`);
  });
});
