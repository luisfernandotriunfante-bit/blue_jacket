import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { unzipSync,strFromU8 } from 'fflate';

test('modelo Painel Sell Out preserva as abas oficiais exigidas',()=>{
  const workbook=XLSX.read(readFileSync('public/templates/painel-sell-out-padrao.xlsx'),{type:'buffer'});
  assert.deepEqual(workbook.SheetNames,['SELL OUT - Milenio 2026','EQUIPES']);
});

test('modelo TOP REDES preserva todas as abas operacionais',()=>{
  const workbook=XLSX.read(readFileSync('public/templates/top-redes-padrao.xlsx'),{type:'buffer'});
  assert.deepEqual(workbook.SheetNames,['Top Redes','12.326','319','12.326ana','Loja a Loja','redes','Equipe']);
});

test('limpeza estática está programada para remover calcChain e connections',()=>{
  const source=readFileSync('src/services/templateWorkbook.ts','utf8');
  assert.match(source,/delete this\.files\['xl\/calcChain\.xml'\]/);assert.match(source,/delete this\.files\['xl\/connections\.xml'\]/);assert.match(source,/endsWith\('\/connections'\)/);
  const topPackage=unzipSync(new Uint8Array(readFileSync('public/templates/top-redes-padrao.xlsx')));
  assert.ok(topPackage['xl/workbook.xml']);assert.ok(strFromU8(topPackage['xl/workbook.xml']).includes('sheet'));
});
