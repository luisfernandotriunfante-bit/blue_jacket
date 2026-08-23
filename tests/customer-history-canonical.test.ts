import test from 'node:test';
import assert from 'node:assert/strict';
import { customerIntelligenceFromUnified } from '../src/services/motors/customerIntelligenceUnifiedAdapter.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';

test('adaptador comercial usa 379 canônico para produto e RCA mesmo quando 310 está carregado', () => {
  const cnpj='04594132000140';
  const state:any={
    customerIntelligenceSupport:{
      ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
      purchases:[{
        cnpj,cnpjRaw:cnpj,legacyProductCode:'11100002',winthorCode:'11100002',description:'Produto legado 310',volumes:8,quantity:2,purchaseValue:90,returnVolume:2,returnValue:10,netValue:90,vendorCode:'999',groupingCode:'',groupingDescription:'',
      }],
    },
    unified:{
      generatedAt:'2026-08-23T12:00:00.000Z',
      items:[{itemCanonicalId:'ITEM:2',winthorCode:'2002',industrySku:'61000002',manufacturerCode:'61000002',internalEan:'7891000000028',industryEan:'7891000000028',internalDescription:'Produto canônico',industryDescription:'Produto canônico'}],
      customers:[{customerCanonicalId:`CNPJ:${cnpj}`,cnpj,cnpjRaw:cnpj,customerName:'CLIENTE',winthorCustomerCode:'10',city:'CAMPO GRANDE'}],
      customerClassifications:[{cnpj,competence:'2026-08',range:'FAIXA 1',premiseNetwork:'REDE',environment:'H&S',profile:'VAREJO',premiseCity:'CAMPO GRANDE',premiseState:'MS'}],
      rcas:[{rcaCanonicalId:'RCA:55',currentRcaCode:'721',legacyRcaCode:'55'}],
      historicalCustomerProduct:[{
        customerCanonicalId:`CNPJ:${cnpj}`,cnpj,itemCanonicalId:'ITEM:2',legacyProductCode:'11100002',period:'2026',grossSaleUnits:10,returnUnits:2,netSignedUnits:8,grossSalesValue:100,returnValue:10,netSalesValue:90,netDiscount:0,purchaseInvoiceCount:2,legacySellerContext:'55',
      }],
      historicalSalesFacts:[{
        movementClass:'SALE',customerCnpj:cnpj,itemCanonicalId:'ITEM:2',legacyProductCode:'11100002',sourceYear:2026,legacyRcaCode:'55',rcaCanonicalId:'RCA:55',
      }],
    },
  };

  const support=customerIntelligenceFromUnified(state);
  assert.equal(support.purchases.length,1);
  assert.equal(support.purchases[0].vendorCode,'999');
  assert.equal(support.historicalPurchases.length,1);
  const history=support.historicalPurchases[0];
  assert.equal(history.source,'379');
  assert.equal(history.legacyProductCode,'11100002');
  assert.equal(history.winthorCode,'2002');
  assert.equal(history.ean,'7891000000028');
  assert.deepEqual(history.legacyRcaCodes,['55']);
  assert.deepEqual(history.rcaCanonicalIds,['RCA:55']);
  assert.deepEqual(history.currentRcaCodes,['721']);
  assert.equal(history.grossSalesValue,100);
  assert.equal(history.returnValue,10);
  assert.equal(history.netValue,90);
});

test('adaptador não promove código legado do 379 a Winthor quando ITEM_MASTER não resolveu código atual', () => {
  const cnpj='04594132000140';
  const state:any={
    customerIntelligenceSupport:{...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,purchases:[]},
    unified:{
      generatedAt:'2026-08-23T12:00:00.000Z',items:[{itemCanonicalId:'ITEM:LEG',winthorCode:'',industrySku:'',manufacturerCode:'',internalEan:'7891000000097',industryEan:'',internalDescription:'Legado sem Winthor',industryDescription:''}],customers:[],customerClassifications:[],rcas:[],
      historicalCustomerProduct:[{customerCanonicalId:`CNPJ:${cnpj}`,cnpj,itemCanonicalId:'ITEM:LEG',legacyProductCode:'11199999',period:'2026',grossSaleUnits:1,returnUnits:0,netSignedUnits:1,grossSalesValue:10,returnValue:0,netSalesValue:10,netDiscount:0,purchaseInvoiceCount:1,legacySellerContext:'77'}],
      historicalSalesFacts:[{movementClass:'SALE',customerCnpj:cnpj,itemCanonicalId:'ITEM:LEG',legacyProductCode:'11199999',sourceYear:2026,legacyRcaCode:'77',rcaCanonicalId:''}],
    },
  };
  const [history]=customerIntelligenceFromUnified(state).historicalPurchases;
  assert.equal(history.legacyProductCode,'11199999');
  assert.equal(history.winthorCode,'');
});
