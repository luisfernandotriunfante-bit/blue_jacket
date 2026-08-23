import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { runItemMotor } from '../src/services/motors/itemMotor.ts';
import { buildInboundFacts, buildTargets } from '../src/services/motors/salesMotor.ts';
import { calculateUnifiedSummary } from '../src/services/motors/calculationService.ts';

const item = (overrides:Record<string,unknown>={}) => ({
  itemCanonicalId:'WINTHOR:100',winthorCode:'100',internalDescription:'Produto',internalEan:'7891000000011',manufacturerCode:'MAT1',industrySku:'MAT1',industryDescription:'Produto',industryEan:'7891000000011',industryDun14:'',internalUnitsPerCase:null,industryUnitsPerCase:12,casesPerPallet:null,physicalStockUnits:0,blockedStockUnits:0,reservedStockUnits:0,availableStockUnits:0,costUnit105:0,physicalCases8013:0,physicalUnits8013:0,grossKg8013:0,salePricePvenDa1:10,pVenda:null,vlSt:null,isLaunch:false,hasWinthor:true,sourceKeys:{},...overrides,
}) as any;

const operational = { version:1,tablePriceFileName:'',tablePrices:{},entry218FileName:'',currentInvoices:[],receiptItems:[],legacy12322FileName:'',legacyInvoices:[],portfolioFileName:'',portfolioRows:[],portfolioInvoiceColumnDetected:false,portfolioHeader:[] } as any;

test('Carteira canônica soma Order Qty + Bill Qty e converte exclusivamente pelo Un/CX industrial',()=>{
  const rows=[
    ['Order Date','Customer Number','Customer Name','Order Number','Material','Description','Order Qty','Bill Qty','Net Value ( ZINV )','Nota Fiscal Number','Billing Type','Billing Date','Gross Weight'],
    ['2026-08-20','1','Milenio','900','MAT1','Produto',2,3,100,'','','',0],
  ];
  const result=buildInboundFacts(rows,[item()],operational);
  assert.equal(result.inboundOrders.length,1);
  assert.equal(result.inboundOrders[0].pipelineQtyCases,5);
  assert.equal(result.inboundOrders[0].pipelineUnits,60);
  assert.equal(result.inboundOrders[0].orderQtyCases,2);
  assert.equal(result.inboundOrders[0].billQtyCases,3);
});

test('Carteira sem Un/CX industrial preserva caixas e não inventa unidades',()=>{
  const rows=[
    ['Order Date','Customer Number','Customer Name','Order Number','Material','Description','Order Qty','Bill Qty','Net Value ( ZINV )','Nota Fiscal Number','Billing Type','Billing Date','Gross Weight'],
    ['2026-08-20','1','Milenio','901','MAT1','Produto',2,1,100,'','','',0],
  ];
  const result=buildInboundFacts(rows,[item({industryUnitsPerCase:null})],operational);
  assert.equal(result.inboundOrders[0].pipelineQtyCases,3);
  assert.equal(result.inboundOrders[0].pipelineUnits,null);
  assert.equal(result.qualityIssues.some(issue=>issue.code==='INDUSTRIAL_PACK_MISSING'),true);
});

test('218 reduz somente o pipeline correspondente e materializa recebimento parcial no Motor de Vendas',()=>{
  const rows=[
    ['Order Date','Customer Number','Customer Name','Order Number','Material','Description','Order Qty','Bill Qty','Net Value ( ZINV )','Nota Fiscal Number','Billing Type','Billing Date','Gross Weight'],
    ['2026-08-20','1','Milenio','902','MAT1','Produto',2,3,100,'123','ZINV','2026-08-21',0],
  ];
  const receiptState={...operational,
    currentInvoices:[{invoice:'123',invoiceRaw:'123',invoiceNormalized:'123',invoiceSeries:'',entryDate:'2026-08-22',issueDate:'2026-08-21',totalValue:20,source:'218'}],
    receiptItems:[{invoice:'123',invoiceRaw:'123',invoiceNormalized:'123',invoiceSeries:'',entryDate:'2026-08-22',issueDate:'2026-08-21',sku:'100',product:'Produto',units:12,unitPrice:10,supplierName:'Colgate',supplierDocument:''}],
  } as any;
  const result=buildInboundFacts(rows,[item()],receiptState);
  assert.equal(result.inboundOrders[0].pipelineUnits,60);
  assert.equal(result.inboundOrders[0].receivedUnits,12);
  assert.equal(result.inboundOrders[0].remainingInTransitUnits,48);
  assert.equal(result.inboundOrders[0].inboundStatus,'PARTIALLY_RECEIVED');
  assert.equal(result.receiptItems[0].inboundMatchStatus,'PARTIAL');
});

test('Lançamento é redefinido exclusivamente pela lista oficial por EAN',()=>{
  const prior=item({isLaunch:false});
  const result=runItemMotor({normalized286Rows:[],stock105Rows:[],stock8013Rows:[],priceListRows:[],launchRows:[['EAN'],['7891000000011']],pctabprWorkbook:null,previousItems:[prior]});
  assert.equal(result.items[0].isLaunch,true);
  const next=runItemMotor({normalized286Rows:[],stock105Rows:[],stock8013Rows:[],priceListRows:[],launchRows:[['EAN'],['7891000000097']],pctabprWorkbook:null,previousItems:result.items});
  assert.equal(next.items.find(row=>row.itemCanonicalId==='WINTHOR:100')?.isLaunch,false);
});

test('positivação atual conta CNPJs distintos válidos e Sell Out soma faturado + a faturar',()=>{
  const layer={
    salesFacts:[
      {salesStatus:'FATURADO',value:100,cnpj:'00123456000199'},
      {salesStatus:'A FATURAR',value:50,cnpj:'00123456000199'},
      {salesStatus:'A FATURAR',value:25,cnpj:'00987654000188'},
      {salesStatus:'FATURADO',value:10,cnpj:''},
    ],
    targets:[],
  } as any;
  const summary=calculateUnifiedSummary(layer);
  assert.equal(summary.invoiced,110);
  assert.equal(summary.toInvoice,75);
  assert.equal(summary.sellOut,185);
  assert.equal(summary.invoicedPositivation,1);
  assert.equal(summary.totalPositivation,2);
});

test('Bússola preserva meta sem RCA resolvido e mapeia somente pelo código legado',()=>{
  const header=Array(22).fill(''); header[16]='META PNA';
  const row=Array(22).fill(''); row[0]='FLAVIO';row[1]='701';row[3]='MCD';row[4]='RCA A';row[7]='COLGATE';row[16]=1000;row[21]=10;
  const unresolved=Array(22).fill(''); unresolved[0]='FLAVIO';unresolved[1]='999';unresolved[3]='MCD';unresolved[4]='RCA X';unresolved[7]='COLGATE';unresolved[16]=500;unresolved[21]=5;
  const workbook=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([header,row,unresolved]),'Metas');
  const rcas=[{rcaCanonicalId:'RCA:1701',currentRcaCode:'1701',legacyRcaCode:'701',rcaName:'RCA A',coordinatorCode:'1',coordinatorName:'FLAVIO',isColgate:true,effectiveFrom:'',effectiveTo:'',source:'NOVOS_RCAS'}] as any;
  const result=buildTargets(workbook,rcas,'2026-08-23');
  assert.equal(result.targets.reduce((sum,row)=>sum+row.salesTarget,0),1500);
  assert.equal(result.targets.find(row=>row.legacyRcaCode==='701')?.assignmentStatus,'RESOLVED');
  assert.equal(result.targets.find(row=>row.legacyRcaCode==='999')?.assignmentStatus,'UNRESOLVED_RCA');
});
