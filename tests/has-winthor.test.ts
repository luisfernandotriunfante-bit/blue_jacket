import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockPresentation } from '../src/domain/stockModel.ts';

const base:any={
  code:'EAN-7890000000000',description:'Lançamento sem Winthor',ean:'7890000000000',quantity:0,costUnit:0,saleUnit:0,
  pendingQty:0,pendingCases:0,pendingCost:0,pendingSale:0,isLaunch:true,hasWinthor:false,factoryCode:'MAT-X',physicalCases:0,physicalUnits:0,grossKg:0,
};
const master:any={sku:'MAT-X',ean:'7890000000000',description:'Lançamento sem Winthor',category:'',subcategory:'',brand:'',isLaunch:true,boxPrice:0,unitPrice:0,unitsPerCase:12,line:''};

test('hasWinthor continua falso para item cadastralmente sem Winthor mesmo fora da Carteira',()=>{
  const result=buildStockPresentation({inventory:[base],productSupport:[master],transactions:[],hasStock8013:false});
  assert.equal(result.products[0].hasWinthor,false);
  assert.equal(result.summary.noWinthorCount,0);
});

test('Sem Winthor operacional conta somente item sem Winthor efetivamente presente na Carteira',()=>{
  const result=buildStockPresentation({inventory:[{...base,pendingCases:2,pendingQty:24,pendingCost:100,pendingSale:130}],productSupport:[master],transactions:[],hasStock8013:false});
  assert.equal(result.products[0].hasWinthor,false);
  assert.equal(result.summary.noWinthorCount,1);
  assert.ok(result.alerts.some(alert=>alert.kind==='SEM_WINTHOR'));
});
