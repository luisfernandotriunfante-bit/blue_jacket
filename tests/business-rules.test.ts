import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProdutoEstoque } from '../src/store/DataContext.tsx';
import { applyLaunchList, applyPortfolio } from '../src/services/canonical/operations.ts';
import { buildCoordinators, buildNetworks, buildVendorResults } from '../src/services/canonical/aggregate.ts';
import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';
import type { ProductMaster, RcaMap, RouteStore } from '../src/services/canonical/runtime.ts';
import { gtin13, sale } from './helpers.ts';
import { DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical.ts';

function master(sku:string,ean:string,unitsPerCase:number):ProductMaster{return{sku,ean,description:sku,category:'',subcategory:'',brand:'',isLaunch:false,boxPrice:0,unitPrice:0,unitsPerCase,line:''}}

test('carteira converte a soma de Order Qty e Bill Qty em unidades pelo Un/CX e mantém custo integral',()=>{
  const ean=gtin13('789000000001');const price=master('MAT1',ean,12);
  const products=new Map<string,ProdutoEstoque>();
  const cadastro={byInternal:new Map([['100',{description:'Produto',ean,factoryCode:'MAT1'}]]),factoryToInternal:new Map([['MAT1','100']])};
  const priceList={bySku:new Map([['MAT1',price]]),byEan:new Map([[ean,price]])};
  const row=Array(9).fill('');row[4]='MAT1';row[6]=10;row[7]=8;row[8]=1000;
  const result=applyPortfolio([[],row],products,cadastro,priceList,0.3);
  assert.equal(result.cost,1000);assert.equal(result.sale,1300);assert.equal(products.get('100')?.saldoPedidoCaixas,18);assert.equal(products.get('100')?.saldoPedido,216);assert.equal(products.get('100')?.hasWinthor,true);
});

test('carteira usa somente a coluna preenchida quando a outra está vazia e soma ambas quando coexistem',()=>{
  const ean=gtin13('789000000011');const price=master('MAT-SOMA',ean,12);
  const products=new Map<string,ProdutoEstoque>();
  const cadastro={byInternal:new Map([['110',{description:'Produto Soma',ean,factoryCode:'MAT-SOMA'}]]),factoryToInternal:new Map([['MAT-SOMA','110']])};
  const priceList={bySku:new Map([['MAT-SOMA',price]]),byEan:new Map([[ean,price]])};
  const row=(orderQty:number,billQty:number,cost:number)=>{const value=Array(9).fill('');value[4]='MAT-SOMA';value[6]=orderQty;value[7]=billQty;value[8]=cost;return value;};
  const result=applyPortfolio([[],row(5,0,100),row(0,7,200),row(3,2,300)],products,cadastro,priceList,0);
  assert.equal(result.cost,600);assert.equal(result.sale,600);assert.equal(products.get('110')?.saldoPedidoCaixas,17);assert.equal(products.get('110')?.saldoPedido,204);
});

test('acréscimo padrão da carteira reproduz a entrada L24 da planilha fórmula',()=>{
  assert.equal(DEFAULT_MANUAL_CONFIGURATION.portfolioSaleMarkup,0.31530488350705);
});

test('Sem Winthor nasce somente da carteira sem correspondência no Cadastro 286',()=>{
  const registeredEan=gtin13('789000000002');const newEan=gtin13('789000000003');
  const registered=master('MAT-CAD',registeredEan,6);const novel=master('MAT-NOVO',newEan,24);
  const cadastro={byInternal:new Map([['200',{description:'Cadastrado',ean:registeredEan,factoryCode:'MAT-CAD'}]]),factoryToInternal:new Map([['MAT-CAD','200']])};
  const priceList={bySku:new Map([['MAT-CAD',registered],['MAT-NOVO',novel]]),byEan:new Map([[registeredEan,registered],[newEan,novel]])};
  const rows=[[],...['MAT-CAD','MAT-NOVO'].map((material,index)=>{const row=Array(9).fill('');row[4]=material;row[6]=1;row[8]=100+index;return row})];
  const products=new Map<string,ProdutoEstoque>();applyPortfolio(rows,products,cadastro,priceList,0);
  assert.equal(products.get('200')?.hasWinthor,true);assert.equal(products.get('PORTFOLIO-MAT-NOVO')?.hasWinthor,false);
  assert.equal(Array.from(products.values()).filter(product=>product.hasWinthor===false).length,1);
});

test('Lançamento vem exclusivamente da lista oficial e é conciliado por EAN',()=>{
  const listed=gtin13('789000000004');const missing=gtin13('789000000005');const unrelated=gtin13('789000000006');
  const products=new Map<string,ProdutoEstoque>([['100',{codigo:'100',descricao:'Listado',ean:listed,quantidade:0,saldoMinimo:0,custoUnitario:0,vendaUnitario:0,entradas:0,saidas:0,saldoPedido:0,isLancamento:false,hasWinthor:true}],['200',{codigo:'200',descricao:'Não listado',ean:unrelated,quantidade:0,saldoMinimo:0,custoUnitario:0,vendaUnitario:0,entradas:0,saidas:0,saldoPedido:0,isLancamento:true,hasWinthor:true}]]);
  const rows=[['EAN','DESCRICAO'],[listed,'Listado'],[listed,'Duplicado'],[missing,'Sem cadastro']];
  const result=applyLaunchList(rows,products,{bySku:new Map(),byEan:new Map()});
  assert.deepEqual(result,{matched:1,unresolved:1,unique:2});assert.equal(products.get('100')?.isLancamento,true);assert.equal(products.get('200')?.isLancamento,false);
});

test('positivação adicional a faturar exclui CNPJ já faturado',()=>{
  const transactions=[sale({cnpj:'00000000000001',status:'FATURADO',value:100}),sale({cnpj:'00000000000001',status:'A FATURAR',value:50}),sale({cnpj:'00000000000002',status:'A FATURAR',value:25})];
  const rca:RcaMap={newCode:'101',oldCode:'1',name:'Vendedor',coordinatorCode:'10',coordinatorName:'FLAVIO'};
  const vendors=buildVendorResults(transactions,new Map([['101',rca]]),new Map([['1',rca]]),[{oldCode:'1',name:'Vendedor',supervisorName:'FLAVIO',salesTarget:1000,positivityTarget:10}],{total:20,elapsed:10,remaining:10});
  assert.equal(vendors[0].invoicedPositivation,1);assert.equal(vendors[0].futurePositivation,1);assert.equal(vendors[0].totalPositivation,2);
  const coordinators=buildCoordinators(vendors);assert.equal(coordinators[0].total,175);assert.equal(coordinators[0].totalPositivation,2);
});

test('redes usam fallback do Roteiro e preservam vendas sem rede em grupo explícito',()=>{
  const transactions=[sale({cnpj:'00000000000001',value:100}),sale({cnpj:'00000000000002',value:200}),sale({cnpj:'00000000000003',value:300})];
  const premises=new Map([['00000000000001',{cnpj:'00000000000001',name:'A',city:'',network:'',profile:'',isTop:false}],['00000000000002',{cnpj:'00000000000002',name:'B',city:'',network:'Rede Premissas',profile:'',isTop:false}]]);
  const route:RouteStore[]=[{cnpj:'00000000000001',name:'A',fantasyName:'',city:'',networkRaw:'Roteiro',managerCnpj:'',groupingCode:'',tier:'',storeType:'',target:0},{cnpj:'00000000000002',name:'B',fantasyName:'',city:'',networkRaw:'Outra',managerCnpj:'',groupingCode:'',tier:'',storeType:'',target:0}];
  const networks=buildNetworks(transactions,premises,route,new Map());
  assert.equal(networks.reduce((sum,network)=>sum+network.total,0),600);assert.equal(networks.find(network=>network.key==='REDE ROTEIRO')?.total,100);assert.equal(networks.find(network=>network.key==='REDE PREMISSAS')?.total,200);assert.equal(networks.find(network=>network.key==='SEM REDE')?.total,300);
  const audit=reconcileNetworkAssignments(transactions,premises,route,new Map());
  assert.equal(audit.find(item=>item.cnpj==='00000000000001')?.source,'ROTEIRO');assert.deepEqual(audit.find(item=>item.cnpj==='00000000000002')?.divergentSources,['ROTEIRO: Rede Outra']);assert.equal(audit.find(item=>item.cnpj==='00000000000003')?.source,'SEM_REDE');
});

test.todo('Meta Redes redistribui ajustes e preserva exatamente o total geral');
test.todo('Cobertura reproduz a fórmula original depois de confirmar faturado versus Sell Out');
