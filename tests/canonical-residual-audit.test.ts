import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { buildInboundFacts } from '../src/services/motors/salesMotor.ts';
import { buildCanonicalStockWorkbook, summarizeCanonicalStockWorkbook } from '../src/services/stockWorkbook.ts';

const item = {
  itemCanonicalId:'WINTHOR:100',winthorCode:'100',internalDescription:'Produto',internalEan:'7891000000011',manufacturerCode:'MAT1',industrySku:'MAT1',industryDescription:'Produto',industryEan:'7891000000011',industryDun14:'',internalUnitsPerCase:12,industryUnitsPerCase:12,casesPerPallet:null,physicalStockUnits:0,blockedStockUnits:0,reservedStockUnits:0,availableStockUnits:0,costUnit105:5,physicalCases8013:0,physicalUnits8013:0,grossKg8013:0,salePricePvenDa1:10,pVenda:null,vlSt:null,isLaunch:false,hasWinthor:true,sourceKeys:{},
} as any;

const operational = {
  version:1,tablePriceFileName:'',tablePrices:{},entry218FileName:'',currentInvoices:[],receiptItems:[],legacy12322FileName:'',legacyInvoices:[],portfolioFileName:'CARTEIRA 20.08.xlsx',portfolioRows:[{sourceRow:3}],portfolioInvoiceColumnDetected:false,portfolioHeader:[],
} as any;

test('Motor de Vendas consome somente sourceRows mantidos pela continuidade da Carteira', () => {
  const rows = [
    ['Order Date','Customer Number','Customer Name','Order Number','Material','Description','Order Qty','Bill Qty','Net Value ( ZINV )','Nota Fiscal Number','Billing Type','Billing Date','Gross Weight'],
    ['2026-08-01','1','Milenio','900','MAT1','Histórico retroativo',10,0,1000,'','','',0],
    ['2026-08-20','1','Milenio','901','MAT1','Pedido válido',2,1,300,'','','',0],
  ];
  const result = buildInboundFacts(rows, [item], operational);
  assert.deepEqual(result.inboundOrders.map(row => row.orderNumber), ['901']);
  assert.equal(result.inboundOrders[0].pipelineQtyCases, 3);
});

test('workbook de Estoque usa Projetado = Disponível + Carteira e não Físico + Carteira', () => {
  const state = {
    sources:[{kind:'stock105',loaded:true,fileName:'105.xls',rows:1,updatedAt:'',fileModifiedAt:'',note:''}],
    support:{products:[],itemCodes:[]},
    inventory:[{
      code:'100',description:'Produto',ean:'7891000000011',quantity:100,costUnit:5,saleUnit:10,
      pendingQty:24,pendingCases:2,pendingCost:120,pendingSale:240,isLaunch:false,hasWinthor:true,factoryCode:'MAT1',
      physicalCases:999,physicalUnits:9999,grossKg:0,internalUnitsPerCase:12,industryUnitsPerCase:12,physicalSource105:true,
    }],
    transactions:[{date:'2026-08-23',status:'A FATURAR',clientCode:'1',clientName:'Cliente',cnpj:'00123456000199',city:'',vendorCode:'1',vendorName:'',supervisorCode:'',supervisorName:'',manufacturerCode:'MAT1',ean:'7891000000011',internalProductCode:'100',productDescription:'Produto',cases:0,units:20,value:200,saleType:'VENDA',line:''}],
    sellOut:{businessDaysElapsed:10},
    stock:{costValue:500,saleValue:1000},
    referenceDate:'2026-08-23',
  } as any;
  const summary = summarizeCanonicalStockWorkbook(state);
  assert.equal(summary.physicalUnits, 100);
  assert.equal(summary.reservedUnits, 20);
  assert.equal(summary.availableUnits, 80);
  assert.equal(summary.pendingUnits, 24);
  assert.equal(summary.projectedUnits, 104);
  assert.equal(summary.projectedSaleValue, 1040);

  const workbook = buildCanonicalStockWorkbook(state);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Estoque);
  assert.equal(rows[0]['Un/CX Interno · 8013'], 12);
  assert.equal(rows[0]['Reservado · 8022 A Faturar'], 20);
  assert.equal(rows[0]['Disponível (un.)'], 80);
  assert.equal(rows[0]['Estoque Projetado (un.)'], 104);
  assert.equal(rows[0]['Potencial Projetado a Venda'], 1040);
});

test('resíduos estruturais permanecem bloqueados por testes de arquitetura', () => {
  const unified = fs.readFileSync(new URL('../src/services/motors/unifiedEngine.ts', import.meta.url), 'utf8');
  const launches = fs.readFileSync(new URL('../src/pages/LancamentosPage.tsx', import.meta.url), 'utf8');
  assert.match(unified, /portfolioAllowedSourceRows/);
  assert.match(unified, /HISTORICAL_CURRENT_SALES_OVERLAP/);
  assert.match(unified, /\.filter\(row => row\.period === '2026'\)/);
  assert.match(unified, /unitsPerCase: item\.industryUnitsPerCase \|\| 0/);
  assert.doesNotMatch(unified, /unitsPerCase: item\.industryUnitsPerCase \|\| item\.internalUnitsPerCase/);
  assert.match(launches, /hasStock105/);
  assert.doesNotMatch(launches, /hasStock8013/);
});
