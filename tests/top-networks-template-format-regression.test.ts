import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';

const SOURCE = 'public/templates/top-redes-padrao.xlsx';
const SCRIPT = 'scripts/prepare-top-redes-template.mjs';

function attribute(tag:string,name:string) {
  const escaped = name.replace(':','\\:');
  return tag.match(new RegExp(`\\b${escaped}="([^"]+)"`))?.[1] || '';
}

function preparedTemplate() {
  const dir = mkdtempSync(join(tmpdir(),'bj-top-redes-'));
  const path = join(dir,'top-redes-padrao.xlsx');
  copyFileSync(SOURCE,path);
  const result = spawnSync(process.execPath,[SCRIPT,path],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr || result.stdout);
  return { path, cleanup:()=>rmSync(dir,{recursive:true,force:true}) };
}

function packageParts(path:string) {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const workbookXml = strFromU8(files['xl/workbook.xml']);
  const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const sheetTag = workbookXml.match(/<sheet\b[^>]*\bname="Top Redes"[^>]*\/?>(?:<\/sheet>)?/)?.[0] || '';
  const rid = attribute(sheetTag,'r:id');
  const relationshipTag = Array.from(relsXml.matchAll(/<Relationship\b[^>]*\/>/g)).map(match=>match[0]).find(tag=>attribute(tag,'Id')===rid) || '';
  const target = attribute(relationshipTag,'Target').replace(/^\//,'').replace(/^\.\//,'');
  const sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
  return { files, sheetXml:strFromU8(files[sheetPath]) };
}

function cellStyle(sheetXml:string,reference:string) {
  const tag = sheetXml.match(new RegExp(`<c\\b[^>]*\\br="${reference}"[^>]*>`))?.[0] || '';
  return attribute(tag,'s');
}

test('TOP REDES mantém F com a mesma tipografia/alinhamento estrutural dos demais valores', () => {
  const prepared = preparedTemplate();
  try {
    const { sheetXml } = packageParts(prepared.path);
    assert.equal(cellStyle(sheetXml,'F4'),cellStyle(sheetXml,'I4'));
  } finally { prepared.cleanup(); }
});

test('TOP REDES mantém G e H como percentual depois da preparação do modelo', () => {
  const prepared = preparedTemplate();
  try {
    const workbook = XLSX.read(readFileSync(prepared.path), { type:'buffer', cellNF:true });
    const sheet = workbook.Sheets['Top Redes'];
    assert.match(String((sheet.G4 as XLSX.CellObject).z || ''), /%/);
    assert.match(String((sheet.H4 as XLSX.CellObject).z || ''), /%/);
  } finally { prepared.cleanup(); }
});

test('TOP REDES estende a formatação condicional de F G H e não deixa dxf trocar percentual por General', () => {
  const prepared = preparedTemplate();
  try {
    const { files, sheetXml } = packageParts(prepared.path);
    const sqrefs = Array.from(sheetXml.matchAll(/\bsqref="([^"]+)"/g)).map(match=>match[1]);
    assert.ok(sqrefs.some(value => /F4:F1000/.test(value)));
    assert.ok(sqrefs.some(value => /G4:G1000/.test(value)));
    assert.ok(sqrefs.some(value => /H4:H1000/.test(value)));

    const dxfIds = new Set(Array.from(sheetXml.matchAll(/<cfRule\b[^>]*\bdxfId="(\d+)"[^>]*>/g)).map(match=>Number(match[1])));
    const stylesXml = strFromU8(files['xl/styles.xml']);
    const dxfs = Array.from(stylesXml.matchAll(/<dxf\b[^>]*>[\s\S]*?<\/dxf>/g)).map(match=>match[0]);
    dxfIds.forEach(id => assert.doesNotMatch(dxfs[id] || '', /<numFmt\b/, `dxf ${id} não pode sobrescrever o formato numérico`));
  } finally { prepared.cleanup(); }
});
