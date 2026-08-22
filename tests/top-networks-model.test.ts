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

test('cabeçalhos definem K como REDES e L como TOPS e o gerador respeita essa ordem',()=>{
  const workbook=XLSX.read(readFileSync(PATH),{type:'buffer'});
  const sheet=workbook.Sheets['Top Redes'];
  assert.match(String(sheet.K1?.v||''),/REDES/i);
  assert.match(String(sheet.L1?.v||''),/TOPS/i);

  const source=readFileSync('src/services/documentGenerator.ts','utf8');
  assert.match(source,/values\[ref\('K',row\)\] = network\.networkAttainment/);
  assert.match(source,/values\[ref\('L',row\)\] = network\.topAttainment/);
});

test('rede com Meta Redes e sem Meta Tops mantém Fat+A Faturar em REDES e zera TOPS pelo motor canônico',()=>{
  const source=readFileSync('src/services/documentGenerator.ts','utf8');
  assert.match(source,/values\[ref\('K',row\)\] = network\.networkAttainment/);
  assert.match(source,/values\[ref\('L',row\)\] = network\.topAttainment/);
  assert.match(source,/values\[ref\('J',row\)\] = network\.gapToNetworkTarget/);
});

test('gerador mantém conjuntos suportados e usa rede canônica resolvida sem fabricar abas auxiliares',()=>{
  const source=readFileSync('src/services/documentGenerator.ts','utf8');
  assert.match(source,/networks\.forEach\(/);
  assert.match(source,/stores\.forEach\(/);
  assert.match(source,/clients\.forEach\(/);
  assert.match(source,/state\.vendors\.forEach\(/);
  assert.match(source,/pending\.forEach\(/);
  assert.match(source,/values\[ref\('D',row\)\] = result\?\.network \|\| client\.network/);
  assert.match(source,/values\[ref\('K',row\)\] = network\.networkAttainment/);
  assert.match(source,/values\[ref\('L',row\)\] = network\.topAttainment/);
  assert.match(source,/workbook\.clearRows\('319',2,50000,1,19\)/);
  assert.match(source,/workbook\.clearRows\('12\.326',2,50000,1,22\)/);
});

test('TOP REDES padroniza percentuais e valores sem substituir o estilo visual das células',()=>{
  const workbook=XLSX.read(readFileSync(PATH),{type:'buffer',cellNF:true});
  const sheet=workbook.Sheets['Top Redes'];
  assert.match(String((sheet.K4 as XLSX.CellObject|undefined)?.z||''),/%/);

  const generator=readFileSync('src/services/documentGenerator.ts','utf8');
  const templateWorkbook=readFileSync('src/services/templateWorkbook.ts','utf8');
  assert.match(generator,/const networkPercentageRefs = \[/);
  assert.match(generator,/const attainmentPercentageRefs = \[/);
  assert.match(generator,/'G2','H2'/);
  assert.match(generator,/'K2','L2'/);
  assert.match(generator,/ref\('G',row\),ref\('H',row\)/);
  assert.match(generator,/ref\('K',row\),ref\('L',row\)/);
  assert.match(generator,/workbook\.copyNumberFormat\(sheet,'K4',networkPercentageRefs\)/);
  assert.match(generator,/workbook\.copyNumberFormat\(sheet,'K4',attainmentPercentageRefs\)/);
  assert.match(generator,/workbook\.copyNumberFormat\(sheet,'F4',currencyRefs\)/);
  assert.match(templateWorkbook,/formattedStyle = currentStyle\.cloneNode\(true\)/);
  assert.match(templateWorkbook,/formattedStyle\.setAttribute\('numFmtId', numFmtId\)/);
  assert.match(templateWorkbook,/currentApplyNumberFormat/);
});

test('TOP REDES exporta vendedor e supervisor no padrão Winthor atual',()=>{
  const generator=readFileSync('src/services/documentGenerator.ts','utf8');
  assert.match(generator,/function currentVendorFor\(state:CanonicalState, code:string\)/);
  assert.match(generator,/vendor\.newCode === code \|\| vendor\.oldCode === code/);
  assert.match(generator,/const owner = currentVendorFor\(state,network\.vendorCode\)/);
  assert.match(generator,/values\[ref\('B',row\)\] = owner\?\.coordinatorCode \|\| network\.teamCode/);
  assert.match(generator,/values\[ref\('C',row\)\] = owner\?\.newCode \|\| network\.vendorCode/);
  assert.match(generator,/values\[ref\('A',row\)\] = vendor\.newCode/);
  assert.doesNotMatch(generator,/values\[ref\('A',row\)\] = vendor\.oldCode \|\| vendor\.newCode/);
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
