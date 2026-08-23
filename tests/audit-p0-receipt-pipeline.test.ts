import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInboundFacts } from '../src/services/motors/salesMotor.ts';

const item = (code='988',sku='MAT988',factor=10) => ({
  itemCanonicalId:`WINTHOR:${code}`,winthorCode:code,internalDescription:`Produto ${code}`,internalEan:'',manufacturerCode:sku,industrySku:sku,industryDescription:`Produto ${code}`,industryEan:'',industryDun14:'',internalUnitsPerCase:null,industryUnitsPerCase:factor,casesPerPallet:null,physicalStockUnits:0,blockedStockUnits:0,reservedStockUnits:0,availableStockUnits:0,costUnit105:0,physicalCases8013:0,physicalUnits8013:0,grossKg8013:0,salePricePvenDa1:10,pVenda:null,vlSt:null,isLaunch:false,hasWinthor:true,sourceKeys:{},
}) as any;

const header=['Order Date','Customer Number','Customer Name','Order Number','Material','Description','Order Qty','Bill Qty','Net Value ( ZINV )','Nota Fiscal Number','Billing Type','Billing Date','Gross Weight'];
const row=(order:string,material:string,orderQty:number,billQty:number,value:number,invoice:string)=>['2026-08-20','1','Milenio',order,material,material,orderQty,billQty,value,invoice,'ZINV','2026-08-21',0];
const baseOperational=()=>({version:1,tablePriceFileName:'',tablePrices:{},entry218FileName:'',currentInvoices:[],receiptItems:[],legacy12322FileName:'',legacyInvoices:[],portfolioFileName:'',portfolioRows:[],portfolioInvoiceColumnDetected:false,portfolioHeader:[]}) as any;

function withReceipt(invoice:string,sku:string,units:number){
  const state=baseOperational();
  state.entry218FileName='entrada-notas-218.xls';
  state.currentInvoices=[{invoice,invoiceRaw:invoice,invoiceNormalized:invoice,invoiceSeries:'',entryDate:'2026-08-22',issueDate:'2026-08-21',totalValue:100,source:'218'}];
  state.receiptItems=[{invoice,invoiceRaw:invoice,invoiceNormalized:invoice,invoiceSeries:'',entryDate:'2026-08-22',issueDate:'2026-08-21',sku,product:`Produto ${sku}`,units,unitPrice:10,supplierName:'Colgate',supplierDocument:''}];
  return state;
}

test('P0: Carteira permanece integral quando não existe recebimento 218 correspondente',()=>{
  const result=buildInboundFacts([header,row('1','MAT988',6,4,1000,'2915720')],[item()],baseOperational());
  assert.equal(result.inboundOrders[0].pipelineQtyCases,10);
  assert.equal(result.inboundOrders[0].pipelineUnits,100);
  assert.equal(result.inboundOrders[0].receivedUnits,0);
  assert.equal(result.inboundOrders[0].remainingInTransitUnits,100);
  assert.equal(result.inboundOrders[0].inboundStatus,'BILLED_BY_COLGATE_IN_TRANSIT');
});

test('P0: recebimento parcial reduz somente a NF + item correspondentes uma única vez',()=>{
  const result=buildInboundFacts([header,row('1','MAT988',6,4,1000,'2915720')],[item()],withReceipt('2915720','988',40));
  assert.equal(result.inboundOrders[0].pipelineUnits,100);
  assert.equal(result.inboundOrders[0].receivedUnits,40);
  assert.equal(result.inboundOrders[0].remainingInTransitUnits,60);
  assert.equal(result.inboundOrders[0].inboundStatus,'PARTIALLY_RECEIVED');
  assert.equal(result.receiptItems[0].inboundMatchStatus,'PARTIAL');
});

test('P0: recebimento total não produz saldo negativo e marca pedido recebido',()=>{
  const result=buildInboundFacts([header,row('1','MAT988',6,4,1000,'2915720')],[item()],withReceipt('2915720','988',100));
  assert.equal(result.inboundOrders[0].remainingInTransitUnits,0);
  assert.equal(result.inboundOrders[0].inboundStatus,'RECEIVED_BY_MILENIO');
  assert.equal(result.receiptItems[0].inboundMatchStatus,'MATCHED');
});

test('P0: NF semelhante ou SKU diferente não baixa o pipeline errado',()=>{
  const items=[item(),item('777','MAT777',5)];
  const rows=[header,row('1','MAT988',10,0,1000,'2915720'),row('2','MAT777',10,0,500,'2915722')];
  const wrongInvoice=buildInboundFacts(rows,items,withReceipt('29157208','988',40));
  assert.equal(wrongInvoice.inboundOrders[0].receivedUnits,0);
  assert.equal(wrongInvoice.receiptItems[0].inboundMatchStatus,'UNMATCHED');
  const wrongSku=buildInboundFacts(rows,items,withReceipt('2915720','777',20));
  assert.equal(wrongSku.inboundOrders[0].receivedUnits,0);
  assert.equal(wrongSku.receiptItems[0].inboundMatchStatus,'UNMATCHED');
});

test('P0: overage fica explícito sem inflar Carteira ou esconder divergência',()=>{
  const result=buildInboundFacts([header,row('1','MAT988',10,0,1000,'2915720')],[item()],withReceipt('2915720','988',120));
  assert.equal(result.inboundOrders[0].remainingInTransitUnits,0);
  assert.equal(result.inboundOrders[0].receivedUnits,120);
  assert.equal(result.receiptItems[0].inboundMatchStatus,'OVERAGE');
});
