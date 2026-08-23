import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MANUAL_CONFIGURATION, type CanonicalInventoryProduct, type CanonicalSalesTransaction } from '../src/domain/canonical.ts';
import { buildStockPresentation } from '../src/domain/stockModelCore.ts';
import { EMPTY_UNIFIED_DATA_LAYER } from '../src/domain/unified.ts';
import { buildInventoryFromUnified } from '../src/services/motors/calculationService.ts';

function inventory(overrides: Partial<CanonicalInventoryProduct & { internalUnitsPerCase:number|null; industryUnitsPerCase:number|null; physicalSource105:boolean }> = {}) {
  return {
    code: '123',
    description: 'Produto teste',
    ean: '7891234567890',
    quantity: 100,
    costUnit: 2,
    saleUnit: 3,
    pendingQty: 48,
    pendingCases: 2,
    pendingCost: 50,
    pendingSale: 70,
    isLaunch: false,
    hasWinthor: true,
    factoryCode: '999',
    // valor propositalmente absurdo: não pode mais comandar o físico da tela.
    physicalCases: 84694,
    physicalUnits: 0,
    grossKg: 123,
    internalUnitsPerCase: 12,
    industryUnitsPerCase: 24,
    physicalSource105: true,
    ...overrides,
  } as CanonicalInventoryProduct & { internalUnitsPerCase:number|null; industryUnitsPerCase:number|null; physicalSource105:boolean };
}

function reserved(units:number):CanonicalSalesTransaction {
  return {
    date:'2026-08-20', status:'A FATURAR', clientCode:'1', clientName:'Cliente', cnpj:'12345678000199', city:'', vendorCode:'1', vendorName:'', supervisorCode:'', supervisorName:'', manufacturerCode:'999', ean:'7891234567890', internalProductCode:'123', productDescription:'Produto teste', cases:0, units, value:100, saleType:'VENDA', line:'',
  };
}

test('físico exibido nasce exclusivamente do 105 e ignora caixas de estoque do 8013', () => {
  const result = buildStockPresentation({ inventory:[inventory()], transactions:[reserved(10)], hasStock105:true, businessDaysElapsed:10 });
  const product = result.products[0];
  assert.equal(product.physicalTotalUnits, 100);
  assert.equal(product.physicalCases, 8);
  assert.equal(product.looseUnits, 4);
  assert.equal(result.summary.physicalUnits, 100);
  assert.equal(result.summary.physicalCases, 8);
  assert.equal(product.availableUnits, 90);
  assert.equal(result.reservation.mode, 'POSICAO_BRUTA');
});

test('Un/CX interno e Un/CX indústria permanecem independentes', () => {
  const result = buildStockPresentation({ inventory:[inventory()], transactions:[], hasStock105:true });
  const product = result.products[0];
  assert.equal(product.unitsPerCase, 12);
  assert.equal(product.industryUnitsPerCase, 24);
  assert.equal(product.physicalCases * product.unitsPerCase + product.looseUnits, 100);
  assert.equal(product.pendingCases * product.industryUnitsPerCase, product.pendingUnits);
  const portfolioCheck = result.reconciliation.find(check => check.id === 'stock.portfolio.conversion');
  assert.equal(portfolioCheck?.status, 'OK');
});

test('sem Un/CX interno o físico 105 é preservado e nenhuma caixa é inventada', () => {
  const result = buildStockPresentation({ inventory:[inventory({ internalUnitsPerCase:null })], transactions:[], hasStock105:true });
  const product = result.products[0];
  assert.equal(product.physicalTotalUnits, 100);
  assert.equal(product.physicalCases, 0);
  assert.equal(product.looseUnits, 0);
  assert.equal(result.summary.unconvertedPhysicalUnits, 100);
  assert.ok(product.alerts.some(alert => alert.kind === 'SEM_CONVERSAO_CAIXA'));
  assert.equal(product.pendingUnits, 48);
});

test('projeção canônica materializa fatores separados e deriva caixas físicas do 105', () => {
  const unified = {
    ...EMPTY_UNIFIED_DATA_LAYER,
    items: [{
      itemCanonicalId:'WINTHOR:123', winthorCode:'123', internalDescription:'Produto teste', internalEan:'7891234567890', manufacturerCode:'999', industrySku:'COL999', industryDescription:'Produto teste', industryEan:'7891234567890', industryDun14:'', internalUnitsPerCase:12, industryUnitsPerCase:24, casesPerPallet:null, physicalStockUnits:100, blockedStockUnits:0, reservedStockUnits:0, availableStockUnits:100, costUnit105:2, physicalCases8013:84694, physicalUnits8013:999999, grossKg8013:123, salePricePvenDa1:3, pVenda:null, vlSt:null, isLaunch:false, hasWinthor:true, sourceKeys:{'105':'123'},
    }],
    inboundOrders: [],
  } as typeof EMPTY_UNIFIED_DATA_LAYER;
  const projected = buildInventoryFromUnified(unified, '2026-08-20', DEFAULT_MANUAL_CONFIGURATION);
  const product = projected.inventory[0] as CanonicalInventoryProduct & { internalUnitsPerCase:number|null; industryUnitsPerCase:number|null; physicalSource105:boolean };
  assert.equal(product.physicalUnits, 100);
  assert.equal(product.physicalCases, 8);
  assert.equal(product.internalUnitsPerCase, 12);
  assert.equal(product.industryUnitsPerCase, 24);
  assert.equal(product.physicalSource105, true);
  assert.equal(projected.stock.physicalUnits, 100);
  assert.equal(projected.stock.physicalCases, 8);
});
