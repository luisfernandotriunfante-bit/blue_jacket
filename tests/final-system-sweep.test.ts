import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualConfiguration, DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical.ts';
import { buildNetworks } from '../src/services/motors/calculationService.ts';
import { customerIntelligenceFromUnified } from '../src/services/motors/customerIntelligenceUnifiedAdapter.ts';

function baseCanonical() {
  return {
    schemaVersion:2,
    generatedAt:'2026-08-23T00:00:00.000Z',referenceDate:'2026-08-23',periodStart:'2026-08-01',periodEnd:'2026-08-31',sources:[],support:{rcas:[],vendorTargets:[],clients:[],activeRoute:[],products:[],itemCodes:[]},transactions:[],
    inventory:[{code:'100',description:'Produto',ean:'7891000000011',quantity:100,costUnit:5,saleUnit:10,pendingQty:24,pendingCases:2,pendingCost:120,pendingSale:240,isLaunch:false,hasWinthor:true,factoryCode:'MAT1',physicalCases:8,physicalUnits:100,grossKg:0}],
    daily:[],history:{months:[],sameMonthLastYear:null,sameMonthLastYearKey:'2025-08',average3ClosedMonths:1000,average3MonthKeys:['2026-05','2026-06','2026-07']},industryTarget:0,industryPositivityTarget:0,
    sellOut:{invoiced:0,toInvoice:0,total:0,sellOutTarget:0,attainment:0,invoicedPositivation:0,futurePositivation:0,totalPositivation:0,industryPositivityTarget:0,positivityAttainment:0,ticketAverage:0,businessDaysTotal:21,businessDaysElapsed:15,businessDaysRemaining:6,invoicedDailyAverage:0,totalDailyAverage:0,neededDailyAverage:0,invoicedTrend:0,totalTrend:0},
    stock:{costValue:500,saleValue:1000,pendingPurchaseCost:120,pendingPurchaseSale:240,projectedCostValue:520,projectedSaleValue:1040,physicalUnits:100,physicalCases:8,grossKg:0,coverageCurrentDays:30,coverageProjectedDays:31,coverageCostCurrentDays:15,coverageCostProjectedDays:16,coverageTargetDays:60},
    vendors:[],coordinators:[],clients:[],networks:[],lines:[],warnings:[],
  } as any;
}

test('configuração manual preserva Projetado = Disponível + Carteira, sem voltar para Físico + Carteira', () => {
  const configured = applyManualConfiguration(baseCanonical(), { ...DEFAULT_MANUAL_CONFIGURATION, holidays:[] });
  assert.ok(configured);
  assert.equal(configured.stock.pendingPurchaseSale, 240);
  assert.equal(configured.stock.projectedSaleValue, 1040);
  assert.notEqual(configured.stock.projectedSaleValue, 1240);
});

test('Redes fecha venda com CNPJ válido em SEM REDE e associa Top por CNPJ, não pelo nome da taxonomia', () => {
  const unified = {
    customerClassifications:[{cnpj:'00111111000111',premiseNetwork:'REDE PREMISSAS'}],
    salesFacts:[
      {cnpj:'00111111000111',salesStatus:'FATURADO',value:100},
      {cnpj:'00222222000122',salesStatus:'FATURADO',value:50},
    ],
    topRetailerSnapshots:[
      {cnpj:'00111111000111',topRetailerNetwork:'REDE ROTEIRO DIFERENTE',target:70,storeName:'Loja A',topTradeName:'A',topCity:'Campo Grande',managerCnpj:'',groupCode:'',topCategory:'OURO',storeType:'LOJA'},
      {cnpj:'00222222000122',topRetailerNetwork:'OUTRA REDE ROTEIRO',target:30,storeName:'Loja B',topTradeName:'B',topCity:'Campo Grande',managerCnpj:'',groupCode:'',topCategory:'PRATA',storeType:'LOJA'},
    ],
  } as any;
  const networks = buildNetworks(unified, { ...DEFAULT_MANUAL_CONFIGURATION, networkTargets:{'REDE PREMISSAS':200} });
  const official = networks.find(network => network.name === 'REDE PREMISSAS');
  const unmapped = networks.find(network => network.key === 'SEM REDE');
  assert.ok(official);
  assert.ok(unmapped);
  assert.equal(official.total,100);
  assert.equal(official.topTarget,70);
  assert.equal(official.stores[0].routeNetwork,'REDE ROTEIRO DIFERENTE');
  assert.equal(unmapped.total,50);
  assert.equal(unmapped.topTarget,30);
  assert.equal(networks.reduce((sum,network)=>sum+network.total,0),150);
});

test('Clientes & Sortimento usa exclusivamente isLaunch do ITEM_MASTER canônico, não o rótulo do sortimento', () => {
  const state = {
    customerIntelligenceSupport:{
      schemaVersion:1,updatedAt:'',sources:[],lineage:[],customers:[],purchases:[],historicalPurchases:[],promotions:[],pricingRules:[],warnings:[],
      assortmentCompetences:[{key:'2026-08',label:'Ago/26',validFrom:'2026-08-01',validTo:'2026-08-31',sourceSheet:'Oficial',expectedTotalsByChannel:{},products:[
        {ean:'7891000000011',colgateSku:'MAT1',winthorCode:'100',description:'A',launchLabel:'LANÇAMENTO',recommendations:[]},
        {ean:'7891000000028',colgateSku:'MAT2',winthorCode:'200',description:'B',launchLabel:'',recommendations:[]},
      ]}],
    },
    unified:{
      generatedAt:'2026-08-23T00:00:00.000Z',historicalSalesFacts:[],historicalCustomerProduct:[],customerClassifications:[],customers:[],rcas:[],
      items:[
        {itemCanonicalId:'WINTHOR:100',winthorCode:'100',internalEan:'7891000000011',industryEan:'',industrySku:'MAT1',manufacturerCode:'MAT1',isLaunch:false},
        {itemCanonicalId:'WINTHOR:200',winthorCode:'200',internalEan:'7891000000028',industryEan:'',industrySku:'MAT2',manufacturerCode:'MAT2',isLaunch:true},
      ],
    },
  } as any;
  const support = customerIntelligenceFromUnified(state);
  const products = support.assortmentCompetences[0].products;
  assert.equal(products[0].launchLabel,'');
  assert.equal(products[1].launchLabel,'LANÇAMENTO');
});
