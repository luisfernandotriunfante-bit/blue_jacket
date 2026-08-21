import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperationalOverrides } from '../src/services/operationalSources.ts';
import { applyReceiptReconciliation } from '../src/services/receiptReconciliation.ts';

const config = { sellOutTarget: 0, coverageTargetDays: 60, portfolioSaleMarkup: 0.3, networkTargets: {}, holidays: [], lineShares: {} } as any;

function canonical() {
  return {
    schemaVersion: 2,
    generatedAt: '', referenceDate: '2026-08-21', periodStart: '2026-08-01', periodEnd: '2026-08-31', sources: [],
    support: {
      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
      products: [{ sku: 'MAT988', ean: '7890000000000', description: 'Produto 988', category: '', subcategory: '', brand: '', isLaunch: false, boxPrice: 0, unitPrice: 0, unitsPerCase: 10, line: '' }],
      itemCodes: [{ internalCode: '988', description: 'Produto 988', ean: '7890000000000', factoryCode: 'MAT988' }],
    },
    transactions: [], daily: [], history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: 100000, average3MonthKeys: [] },
    industryTarget: 0, industryPositivityTarget: 0,
    sellOut: { invoiced: 0, toInvoice: 0, total: 0, sellOutTarget: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0, industryPositivityTarget: 0, positivityAttainment: 0, ticketAverage: 0, businessDaysTotal: 20, businessDaysElapsed: 10, businessDaysRemaining: 10, invoicedDailyAverage: 0, totalDailyAverage: 0, neededDailyAverage: 0, invoicedTrend: 0, totalTrend: 0 },
    stock: { costValue: 1000, saleValue: 1300, pendingPurchaseCost: 0, pendingPurchaseSale: 0, projectedCostValue: 1000, projectedSaleValue: 1300, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    inventory: [{ code: '988', description: 'Produto 988', ean: '7890000000000', quantity: 100, costUnit: 10, saleUnit: 13, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: 'MAT988', physicalCases: 0, physicalUnits: 0, grossKg: 0 }],
    vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [],
  } as any;
}

function operational(invoice = '2915720') {
  return {
    version: 1,
    tablePriceFileName: '', tablePrices: {}, entry218FileName: '', currentInvoices: [], receiptItems: [],
    legacy12322FileName: '12.322.txt', legacyInvoices: [{ invoice: '2915720', entryDate: '2026-07-30', issueDate: '2026-07-13', totalValue: 400, source: '12.322' }],
    portfolioFileName: 'CARTEIRA.xlsx', portfolioRows: [
      { sourceRow: 2, materialCode: 'MAT988', description: 'Produto 988', orderQty: 10, billQty: 0, costValue: 400, invoice },
      { sourceRow: 3, materialCode: 'MAT988', description: 'Produto 988', orderQty: 10, billQty: 0, costValue: 600, invoice: '99999991' },
    ], portfolioInvoiceColumnDetected: true, portfolioHeader: [],
  } as any;
}

function pipeline(state:any, base=canonical()) {
  const adjusted=applyOperationalOverrides(base,state,config);
  const final=applyReceiptReconciliation(adjusted.canonical,state,config);
  return { adjusted, final };
}

test('pipeline real mantém Carteira bruta no override e abate recebimento uma única vez', () => {
  const { adjusted, final } = pipeline(operational());
  assert.equal(adjusted.canonical.stock.pendingPurchaseCost, 1000);
  assert.equal(adjusted.portfolioDeductedCost, 0);
  assert.equal(final.canonical.stock.pendingPurchaseCost, 600);
  assert.equal(final.canonical.inventory[0].pendingCases, 10);
  assert.equal(final.canonical.inventory[0].pendingQty, 100);
  assert.equal(final.audit.legacyAppliedCost, 400);
});

test('mesma NF visível ao override e à reconciliação nunca sofre duas baixas',()=>{
  const state=operational();
  const { adjusted, final }=pipeline(state);
  assert.equal(adjusted.canonical.stock.pendingPurchaseCost-final.canonical.stock.pendingPurchaseCost,400);
  assert.equal(final.canonical.stock.pendingPurchaseCost,600);
});

test('recebimento 218 parcial reduz somente o volume e custo efetivamente recebido',()=>{
  const state=operational('99999991');
  state.legacyInvoices=[];
  state.entry218FileName='entrada-notas-218.xls';
  state.receiptItems=[{invoice:'3000000',entryDate:'2026-08-20',issueDate:'2026-08-19',sku:'988',product:'Produto 988',units:40,unitPrice:4,supplierName:'Colgate',supplierDocument:''}];
  const { adjusted, final }=pipeline(state);
  assert.equal(adjusted.canonical.inventory[0].pendingQty,200);
  assert.equal(final.canonical.inventory[0].pendingQty,160);
  assert.equal(final.canonical.inventory[0].pendingCases,16);
  assert.equal(final.canonical.stock.pendingPurchaseCost,840);
  assert.equal(final.audit.confirmedUnits,40);
});

test('recebimento 218 total zera volume e custo sem gerar saldo negativo',()=>{
  const state=operational('99999991');
  state.legacyInvoices=[];
  state.receiptItems=[{invoice:'3000001',entryDate:'2026-08-20',issueDate:'2026-08-19',sku:'988',product:'Produto 988',units:200,unitPrice:10,supplierName:'Colgate',supplierDocument:''}];
  const { final }=pipeline(state);
  assert.equal(final.canonical.inventory[0].pendingQty,0);
  assert.equal(final.canonical.inventory[0].pendingCases,0);
  assert.equal(final.canonical.stock.pendingPurchaseCost,0);
});

test('várias NFs do mesmo SKU são abatidas uma vez cada',()=>{
  const state=operational();
  state.portfolioRows=[
    {sourceRow:2,materialCode:'MAT988',description:'Produto 988',orderQty:10,billQty:0,costValue:400,invoice:'2915720'},
    {sourceRow:3,materialCode:'MAT988',description:'Produto 988',orderQty:10,billQty:0,costValue:600,invoice:'2915722'},
  ];
  state.legacyInvoices=[
    {invoice:'2915720',entryDate:'2026-07-30',issueDate:'2026-07-13',totalValue:400,source:'12.322'},
    {invoice:'2915722',entryDate:'2026-07-31',issueDate:'2026-07-14',totalValue:600,source:'12.322'},
  ];
  const { final }=pipeline(state);
  assert.equal(final.audit.legacyMatchedInvoiceCount,2);
  assert.equal(final.audit.legacyAppliedCost,1000);
  assert.equal(final.canonical.stock.pendingPurchaseCost,0);
  assert.equal(final.canonical.inventory[0].pendingQty,0);
});

test('vários SKUs são reconciliados sem cruzar recebimento para o produto errado',()=>{
  const base=canonical();
  base.support.products.push({sku:'MAT777',ean:'7890000000001',description:'Produto 777',category:'',subcategory:'',brand:'',isLaunch:false,boxPrice:0,unitPrice:0,unitsPerCase:5,line:''});
  base.support.itemCodes.push({internalCode:'777',description:'Produto 777',ean:'7890000000001',factoryCode:'MAT777'});
  base.inventory.push({code:'777',description:'Produto 777',ean:'7890000000001',quantity:50,costUnit:5,saleUnit:7,pendingQty:0,pendingCases:0,pendingCost:0,pendingSale:0,isLaunch:false,hasWinthor:true,factoryCode:'MAT777',physicalCases:0,physicalUnits:0,grossKg:0});
  const state=operational();
  state.portfolioRows=[
    {sourceRow:2,materialCode:'MAT988',description:'Produto 988',orderQty:10,billQty:0,costValue:400,invoice:'2915720'},
    {sourceRow:3,materialCode:'MAT777',description:'Produto 777',orderQty:10,billQty:0,costValue:600,invoice:'9999999'},
  ];
  const { final }=pipeline(state,base);
  const first=final.canonical.inventory.find((item:any)=>item.code==='988');
  const second=final.canonical.inventory.find((item:any)=>item.code==='777');
  assert.equal(first.pendingCost,0); assert.equal(first.pendingQty,0);
  assert.equal(second.pendingCost,600); assert.equal(second.pendingQty,50);
});

test('série explicitamente separada pode casar pelo mesmo número da NF',()=>{
  const state=operational('2915720');
  state.portfolioRows[0].invoiceRaw='002915720-1';
  const { final }=pipeline(state);
  assert.equal(final.audit.legacyMatchedInvoiceCount,1);
  assert.equal(final.audit.legacyAppliedCost,400);
});

test('NF de prefixo semelhante não casa sem série explicitamente separada', () => {
  const state = operational('29157208');
  const { final }=pipeline(state);
  assert.equal(final.audit.legacyMatchedInvoiceCount,0);
  assert.equal(final.audit.legacyAppliedCost,0);
  assert.equal(final.canonical.stock.pendingPurchaseCost,1000);
});

test('NF sem correspondência permanece pendente e não baixa produto algum',()=>{
  const state=operational('8888888');
  const { final }=pipeline(state);
  assert.equal(final.audit.legacyMatchedInvoiceCount,0);
  assert.equal(final.canonical.stock.pendingPurchaseCost,1000);
  assert.equal(final.canonical.inventory[0].pendingQty,200);
});
