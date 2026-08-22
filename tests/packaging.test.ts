import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveUnitsPerCaseFrom105, resolvePackagingCandidates } from '../src/domain/packaging.ts';
import { applyPortfolio, parseStock105 } from '../src/services/canonical/operations.ts';

const cadastro = { byInternal: new Map<string, any>(), factoryToInternal: new Map<string, string>() };
const portfolioHeader=['','','','','Material','Material Desc','Order Qty','Bill Qty','Net Value'];

function stockRows(quantity:number, master:number) {
  const rows:any[][]=[['CODIGO','DESCRICAO','ESTOQUE','MASTER','CUSTO UNITARIO','P VENDA']];
  for(let index=1; index<=50; index+=1) rows.push([index,`Produto ${index}`,quantity,master,2,3]);
  return rows;
}

function validStockSnapshotWithZeroFirstSku() {
  const rows=stockRows(120,10);
  rows[1][2]=0;
  rows[1][3]=44.25;
  return rows;
}

test('caso real A: 531 / 44,25 deriva exatamente 12 Un/CX',()=>{
  const result=deriveUnitsPerCaseFrom105(531,44.25);
  assert.equal(result.unitsPerCase,12); assert.equal(result.source,'105_DERIVED'); assert.equal(result.conflict,false);
});

test('caso real B: 774 / 7,1666667 deriva 108 Un/CX dentro da precisão do relatório',()=>{
  const result=deriveUnitsPerCaseFrom105(774,7.1666667);
  assert.equal(result.unitsPerCase,108); assert.equal(result.source,'105_DERIVED');
});

test('caso real C: 499 / 41,5833333 deriva 12 Un/CX',()=>{
  const result=deriveUnitsPerCaseFrom105(499,41.5833333);
  assert.equal(result.unitsPerCase,12); assert.equal(result.source,'105_DERIVED');
});

test('caso D: estoque zero não fabrica fator a partir do Master do 105',()=>{
  const result=deriveUnitsPerCaseFrom105(0,44.25);
  assert.equal(result.unitsPerCase,0); assert.equal(result.source,'UNKNOWN');
  const products=parseStock105(validStockSnapshotWithZeroFirstSku(),cadastro);
  assert.equal(products.get('1')?.quantidade,0); assert.equal(products.get('1')?.unitsPerCase,0); assert.equal(products.get('1')?.unitsPerCaseSource,'UNKNOWN');
  assert.equal(products.get('2')?.unitsPerCase,12);
});

test('caso F: fontes comprovadas divergentes bloqueiam conversão em vez de escolher maior ou última',()=>{
  const result=resolvePackagingCandidates([{source:'105_DERIVED',value:12},{source:'PRICE_LIST',value:24}]);
  assert.equal(result.unitsPerCase,0); assert.equal(result.source,'CONFLICT'); assert.equal(result.conflict,true); assert.match(result.note,/divergem/i);
});

test('fontes comprovadas iguais podem coexistir sem conflito',()=>{
  const result=resolvePackagingCandidates([{source:'105_DERIVED',value:12},{source:'PRICE_LIST',value:12}]);
  assert.equal(result.unitsPerCase,12); assert.equal(result.conflict,false);
});

test('Carteira usa fator 105 derivado quando não há segunda fonte e converte Order+Bill corretamente',()=>{
  const products=parseStock105(stockRows(531,44.25),cadastro);
  const row=Array(9).fill(''); row[4]='1'; row[6]=2; row[7]=3; row[8]=100;
  const result=applyPortfolio([portfolioHeader,row],products,cadastro,{bySku:new Map(),byEan:new Map()},0);
  assert.equal(result.unresolved,0); assert.equal(products.get('1')?.saldoPedidoCaixas,5); assert.equal(products.get('1')?.saldoPedido,60);
});

test('Carteira bloqueia unidades quando PRICE_LIST diverge do fator 105 derivado',()=>{
  const products=parseStock105(stockRows(531,44.25),cadastro);
  const product=products.get('1')!; product.factoryCode='MAT1';
  const master={sku:'MAT1',ean:'',description:'Produto 1',category:'',subcategory:'',brand:'',isLaunch:false,boxPrice:0,unitPrice:0,unitsPerCase:24,line:'' as const};
  const row=Array(9).fill(''); row[4]='MAT1'; row[6]=2; row[8]=100;
  const result=applyPortfolio([portfolioHeader,row],products,{byInternal:new Map([['1',{description:'Produto 1',ean:'',factoryCode:'MAT1'}]]),factoryToInternal:new Map([['MAT1','1']])},{bySku:new Map([['MAT1',master]]),byEan:new Map()},0);
  assert.equal(result.unresolved,1); assert.equal(product.unitsPerCase,0); assert.equal(product.unitsPerCaseSource,'CONFLICT'); assert.equal(product.saldoPedido,0); assert.equal(product.saldoPedidoCaixas,2);
});
