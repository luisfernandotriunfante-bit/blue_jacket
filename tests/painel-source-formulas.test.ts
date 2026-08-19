import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const PANEL_PATH='public/templates/painel-sell-out-padrao.xlsx';
const SHEET='SELL OUT - Milenio 2026';

function cellSnapshot(sheet:XLSX.WorkSheet,reference:string){
  const cell=sheet[reference] as XLSX.CellObject|undefined;
  return{reference,value:cell?.v??null,formula:cell?.f??null,type:cell?.t??null};
}

test('fonte Excel preserva células de estoque/carteira para auditoria de fórmula',()=>{
  const workbook=XLSX.read(readFileSync(PANEL_PATH),{type:'buffer',cellFormula:true,cellNF:true,cellText:true});
  const sheet=workbook.Sheets[SHEET];
  assert.ok(sheet,`Aba ${SHEET} ausente no modelo`);

  const references=['L20','L21','L22','L23','L24','L25','L26','L27','L28','L29','L30'];
  const snapshot=references.map(reference=>cellSnapshot(sheet,reference));
  console.log('PAINEL_ESTOQUE_CARTEIRA_FORMULAS='+JSON.stringify(snapshot));

  assert.equal(typeof sheet.L24?.v,'number','L24 deve preservar a entrada numérica usada pela referência');
});
