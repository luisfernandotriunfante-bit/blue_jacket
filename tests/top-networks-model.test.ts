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

function number(sheet:XLSX.WorkSheet,ref:string){return Number((sheet[ref] as XLSX.CellObject|undefined)?.v||0)}
function close(actual:number,expected:number,tolerance=1e-9){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`)}

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

test('modelo comprova que no detalhe K usa Meta Tops e L usa Meta Redes',()=>{
  const workbook=XLSX.read(readFileSync(PATH),{type:'buffer'});
  const sheet=workbook.Sheets['Top Redes'];
  [4,5,6].forEach(row=>{
    const total=number(sheet,`F${row}`)+number(sheet,`I${row}`);
    close(number(sheet,`K${row}`),total/number(sheet,`E${row}`));
    close(number(sheet,`L${row}`),total/number(sheet,`D${row}`));
  });
});

test('gerador mantém todos os conjuntos de registros e usa rede canônica resolvida',()=>{
  const source=readFileSync('src/services/documentGenerator.ts','utf8');
  assert.match(source,/networks\.forEach\(/);
  assert.match(source,/stores\.forEach\(/);
  assert.match(source,/clients\.forEach\(/);
  assert.match(source,/state\.vendors\.forEach\(/);
  assert.match(source,/pending\.forEach\(/);
  assert.match(source,/values\[ref\('D',row\)\] = result\?\.network \|\| client\.network/);
  assert.match(source,/values\[ref\('K',row\)\] = ratio\(network\.total,network\.topTarget\)/);
  assert.match(source,/values\[ref\('L',row\)\] = ratio\(network\.total,network\.networkTarget\)/);
});

test('modelo mantém granularidade operacional significativa nas abas auxiliares',()=>{
  const workbook=XLSX.read(readFileSync(PATH),{type:'buffer'});
  const rows=(name:string)=>XLSX.utils.decode_range(workbook.Sheets[name]['!ref']||'A1:A1').e.r;
  assert.ok(rows('319')>=1);
  assert.ok(rows('12.326')>=1);
  assert.ok(rows('12.326ana')>=1);
  assert.ok(rows('Loja a Loja')>=1);
  assert.ok(rows('redes')>=1);
  assert.ok(rows('Equipe')>=1);
});

test.todo('BLOQUEADA POR REGRA NÃO CONFIRMADA: Equipe!E exige a origem do campo EQUIPE; o estado canônico atual não armazena esse atributo por RCA.');
test.todo('BLOQUEADA POR FONTE AUSENTE: 12.326 exige número do pedido/setor e demais campos do pedido; o 8022 canônico atual não preserva essa granularidade e não pode agrupar por CNPJ+RCA como substituto exato.');
test.todo('BLOQUEADA POR FONTE AUSENTE: 319 possui campos de peso/caixa e outros atributos que precisam de mapeamento explícito da fonte antes de serem reproduzidos como modelo original.');
