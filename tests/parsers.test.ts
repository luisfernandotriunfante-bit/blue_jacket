import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readWorkbook, sheetRows } from '../src/services/canonical/utils.ts';
import { parseCadastro286, parseCompassTargets, parsePremises } from '../src/services/canonical/support.ts';
import { parseSales, parseStock105 } from '../src/services/canonical/operations.ts';
import { gtin13 } from './helpers.ts';

function workbookFile(rows:any[][],name:string):File {
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Plan1');
  const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'});
  return new File([bytes],name);
}

function emptyPriceList(){return{bySku:new Map(),byEan:new Map()}}

test('Posição 105 completa identifica colunas e totaliza produtos',()=>{
  const rows:any[][]=[['CODIGO','DESCRICAO','ESTOQUE','CUSTO UNITARIO','P VENDA']];
  for(let index=1;index<=50;index+=1)rows.push([index,`Produto ${index}`,10,2,3]);
  const products=parseStock105(rows,{byInternal:new Map(),factoryToInternal:new Map()});
  assert.equal(products.size,50);assert.equal(products.get('1')?.quantidade,10);assert.equal(products.get('1')?.vendaUnitario,3);
});

test('Posição 105 compacta é normalizada antes do parser',async()=>{
  const rows:any[][]=[];
  for(let index=1;index<=50;index+=1){const row=Array(16).fill('');row[0]=index;row[1]=`Produto ${index}`;row[4]=10;row[6]=2;row[9]=3;rows.push(row)}
  const workbook=await readWorkbook(workbookFile(rows,'posicao-estoque-105.xlsx'),'stock105');
  const products=parseStock105(sheetRows(workbook),{byInternal:new Map(),factoryToInternal:new Map()});
  assert.equal(products.size,50);assert.equal(products.get('50')?.custoUnitario,2);
});

test('Cadastro 286 completo reconhece código Winthor, fábrica e EAN válido',()=>{
  const ean=gtin13('789123456789');const row=Array(26).fill('');row[0]='11';row[1]='100';row[2]='Produto';row[20]=ean;row[23]='MAT1';
  const cadastro=parseCadastro286([row]);
  assert.deepEqual(cadastro.byInternal.get('100'),{description:'Produto',ean,factoryCode:'MAT1'});assert.equal(cadastro.factoryToInternal.get('MAT1'),'100');
});

test('Cadastro 286 compacto é expandido antes do parser',async()=>{
  const ean=gtin13('789123456788');const row=Array(21).fill('');row[0]='11';row[1]='200';row[2]='Compacto';row[17]=ean;row[18]='MAT2';row[19]='12';row[20]='S';
  const workbook=await readWorkbook(workbookFile([row],'cadastro-itens-286.xlsx'),'items286');
  const cadastro=parseCadastro286(sheetRows(workbook));
  assert.equal(cadastro.byInternal.get('200')?.ean,ean);assert.equal(cadastro.factoryToInternal.get('MAT2'),'200');
});

test('8022 mantém Faturado e A Faturar e exclui tipo diferente de Venda',()=>{
  const rows:any[][]=[[],[],[],[]];
  const fill=(row:any[],status:string,value:number,type:string,cnpj:unknown)=>{row[2]='17/08/2026';row[3]='1';row[4]='Cliente';row[5]=cnpj;row[15]=status;row[17]='101';row[18]='Vendedor';row[19]='10';row[20]='Claudio';row[21]='MAT1';row[25]='Creme Dental';row[26]=1;row[27]=12;row[31]=value;row[32]=type};
  fill(rows[1],'FATURADO',100,'VENDA',2318826000200);fill(rows[2],'A FATURAR',50,'VENDA','02318826000200');fill(rows[3],'FATURADO',999,'BONIFICACAO','02318826000200');
  const parsed=parseSales(rows,emptyPriceList());
  assert.equal(parsed.length,2);assert.equal(parsed[0].cnpj,'02318826000200');assert.equal(parsed[0].supervisorName,'FLAVIO');assert.equal(parsed.reduce((sum,row)=>sum+row.value,0),150);
});

test('Bússola considera somente distribuidor MCD e valores Colgate',()=>{
  const rows:any[][]=[[],[],['SUP','COD','','DISTRIB','NOME','','','INDUSTRIA','','','','','','','','','META PNA','','','','','META POS']];
  const add=(dist:string,industry:string,code:string,sales:number,pos:number)=>{const row=Array(22).fill('');row[0]='Thiago da Silva Conegundes';row[1]=code;row[3]=dist;row[4]='Vendedor';row[7]=industry;row[16]=sales;row[21]=pos;rows.push(row)};
  add('MCD','COLGATE','10',1000,20);add('MCD','OUTRA','11',999,99);add('OUTRO','COLGATE','12',999,99);
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Metas');
  const targets=parseCompassTargets(workbook);
  assert.equal(targets.length,1);assert.equal(targets[0].salesTarget,1000);assert.equal(targets[0].supervisorName,'THIAGO');
});

test('Premissas usa a coluna TIPO para distinguir CNPJ com zeros perdidos de CPF/código inválido',()=>{
  const cnpjRow=Array(16).fill('');cnpjRow[2]=73351000122;cnpjRow[3]='Cliente CNPJ';cnpjRow[10]='MILENIO';cnpjRow[13]='CNPJ';cnpjRow[15]='Rede A';
  const invalidRow=Array(16).fill('');invalidRow[2]=52998224725;invalidRow[3]='Cliente CPF';invalidRow[10]='MILENIO';invalidRow[13]='CPF/CODIGO INVALIDO';
  const parsed=parsePremises([Array(16).fill(''),cnpjRow,invalidRow]);
  assert.equal(parsed[0].cnpj,'00073351000122');assert.equal(parsed[0].cnpjNormalizationStatus,'PADDED_EXCEL');
  assert.equal(parsed[1].cnpj,'52998224725');assert.equal(parsed[1].cnpjNormalizationStatus,'CPF_OR_AMBIGUOUS');
});
