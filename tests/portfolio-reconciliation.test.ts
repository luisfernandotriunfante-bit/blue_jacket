import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProdutoEstoque } from '../src/store/DataContext.tsx';
import type { ProductMaster, StockProduct } from '../src/services/canonical/runtime.ts';
import { reconcilePortfolioRows } from '../src/services/canonical/portfolioReconciliation.ts';
import { gtin13 } from './helpers.ts';

function master(sku:string,ean:string,unitsPerCase:number):ProductMaster{return{sku,ean,description:sku,category:'',subcategory:'',brand:'',isLaunch:false,boxPrice:0,unitPrice:0,unitsPerCase,line:''}}
function stock(code:string,ean:string,factoryCode:string):StockProduct{return{codigo:code,descricao:code,ean,quantidade:0,saldoMinimo:0,custoUnitario:0,vendaUnitario:0,entradas:0,saidas:0,saldoPedido:0,saldoPedidoCaixas:0,saldoPedidoValorCusto:0,saldoPedidoValorVenda:0,isLancamento:false,hasWinthor:true,factoryCode}}

test('carteira reconcilia cada linha com caixas × Un/CX e diferença zero',()=>{
  const eanA=gtin13('789000000011');const eanB=gtin13('789000000012');
  const a=master('MAT-A',eanA,12);const b=master('MAT-B',eanB,24);
  const cadastro={byInternal:new Map([['100',{description:'A',ean:eanA,factoryCode:'MAT-A'}],['200',{description:'B',ean:eanB,factoryCode:'MAT-B'}]]),factoryToInternal:new Map([['MAT-A','100'],['MAT-B','200']])};
  const priceList={bySku:new Map([['MAT-A',a],['MAT-B',b]]),byEan:new Map([[eanA,a],[eanB,b]])};
  const products=new Map<string,StockProduct>([['100',stock('100',eanA,'MAT-A')],['200',stock('200',eanB,'MAT-B')]]);
  const rowA=Array(9).fill('');rowA[4]='MAT-A';rowA[6]=10;rowA[7]=8;rowA[8]=1000;
  const rowB=Array(9).fill('');rowB[4]='MAT-B';rowB[6]=0;rowB[7]=5;rowB[8]=500;

  const audit=reconcilePortfolioRows([[],rowA,rowB],products,cadastro,priceList,0.3);

  assert.equal(audit.sourceLines,2);
  assert.equal(audit.lines[0].selectedCaseSource,'ORDER_QTY');
  assert.equal(audit.lines[0].selectedCases,10);
  assert.equal(audit.lines[0].unitsPerCase,12);
  assert.equal(audit.lines[0].expectedUnits,120);
  assert.equal(audit.lines[0].calculatedUnits,120);
  assert.equal(audit.lines[0].difference,0);
  assert.equal(audit.lines[1].selectedCaseSource,'BILL_QTY');
  assert.equal(audit.lines[1].expectedUnits,120);
  assert.equal(audit.lines[1].calculatedUnits,120);
  assert.equal(audit.unitDifference,0);
  assert.equal(audit.expectedUnits,240);
  assert.equal(audit.calculatedUnits,240);
});

test('Sem Winthor registra tentativa e motivo quando carteira não encontra Cadastro 286',()=>{
  const ean=gtin13('789000000013');const novel=master('MAT-NOVO',ean,6);
  const cadastro={byInternal:new Map<string,{description:string;ean:string;factoryCode:string}>(),factoryToInternal:new Map<string,string>()};
  const priceList={bySku:new Map([['MAT-NOVO',novel]]),byEan:new Map([[ean,novel]])};
  const row=Array(9).fill('');row[4]='MAT-NOVO';row[6]=2;row[8]=100;
  const audit=reconcilePortfolioRows([[],row],new Map<string,StockProduct>(),cadastro,priceList,0.3);
  const line=audit.lines[0];
  assert.equal(line.matchMethod,'SEM_286');
  assert.equal(line.hasWinthor,false);
  assert.match(line.matchReason,/não encontrou código interno, código fabricante ou EAN/i);
  assert.equal(line.ean,ean);
  assert.equal(line.expectedUnits,12);
  assert.equal(line.calculatedUnits,12);
  assert.equal(audit.noWinthor,1);
});

test('produto ausente da Posição 105 não vira Sem Winthor quando existe no Cadastro 286',()=>{
  const ean=gtin13('789000000014');const price=master('MAT-CAD',ean,8);
  const cadastro={byInternal:new Map([['300',{description:'Cadastrado',ean,factoryCode:'MAT-CAD'}]]),factoryToInternal:new Map([['MAT-CAD','300']])};
  const priceList={bySku:new Map([['MAT-CAD',price]]),byEan:new Map([[ean,price]])};
  const row=Array(9).fill('');row[4]='MAT-CAD';row[6]=3;row[8]=200;
  const audit=reconcilePortfolioRows([[],row],new Map<string,ProdutoEstoque>() as Map<string,StockProduct>,cadastro,priceList,0.3);
  const line=audit.lines[0];
  assert.equal(line.matchMethod,'CODIGO_FABRICANTE');
  assert.equal(line.internalCode,'300');
  assert.equal(line.hasWinthor,true);
  assert.equal(audit.noWinthor,0);
});

test('fator Un/CX ausente permanece explícito e não fabrica unidades',()=>{
  const ean=gtin13('789000000015');const price=master('SEM-FATOR',ean,0);
  const cadastro={byInternal:new Map([['400',{description:'Sem fator',ean,factoryCode:'SEM-FATOR'}]]),factoryToInternal:new Map([['SEM-FATOR','400']])};
  const priceList={bySku:new Map([['SEM-FATOR',price]]),byEan:new Map([[ean,price]])};
  const row=Array(9).fill('');row[4]='SEM-FATOR';row[6]=4;row[8]=50;
  const audit=reconcilePortfolioRows([[],row],new Map<string,StockProduct>(),cadastro,priceList,0.3);
  assert.equal(audit.lines[0].missingUnitsPerCase,true);
  assert.equal(audit.lines[0].expectedUnits,0);
  assert.equal(audit.lines[0].calculatedUnits,0);
  assert.equal(audit.missingUnitsPerCase,1);
});
