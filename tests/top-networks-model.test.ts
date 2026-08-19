import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const PATH='public/templates/top-redes-padrao.xlsx';

function snapshotSheet(sheet:XLSX.WorkSheet,maxRows=6,maxCols=24){
  const range=XLSX.utils.decode_range(sheet['!ref']||'A1:A1');
  const rows=[] as Array<{row:number;values:unknown[]}>;
  const endRow=Math.min(range.e.r,maxRows-1);
  const endCol=Math.min(range.e.c,maxCols-1);
  for(let r=0;r<=endRow;r+=1){
    const values=[] as unknown[];
    for(let c=0;c<=endCol;c+=1){
      const ref=XLSX.utils.encode_cell({r,c});
      const cell=sheet[ref] as XLSX.CellObject|undefined;
      values.push(cell?.v??null);
    }
    rows.push({row:r+1,values});
  }
  return{ref:sheet['!ref']||'',rows};
}

test('modelo TOP REDES expõe cabeçalhos e áreas operacionais para auditoria de conteúdo',()=>{
  const workbook=XLSX.read(readFileSync(PATH),{type:'buffer',cellFormula:true,cellNF:true,cellText:true});
  const expected=['Top Redes','12.326','319','12.326ana','Loja a Loja','redes','Equipe'];
  assert.deepEqual(workbook.SheetNames,expected);
  const snapshot=Object.fromEntries(expected.map(name=>[name,snapshotSheet(workbook.Sheets[name])]));
  console.log('TOP_REDES_MODEL_SNAPSHOT='+JSON.stringify(snapshot));

  assert.match(String(workbook.Sheets['Top Redes']?.A3?.v||''),/REDE/i);
  assert.match(String(workbook.Sheets['Loja a Loja']?.A2?.v||''),/CNPJ/i);
  assert.match(String(workbook.Sheets['redes']?.A1?.v||''),/CNPJ/i);
  assert.match(String(workbook.Sheets['Equipe']?.A1?.v||''),/COD/i);
});
