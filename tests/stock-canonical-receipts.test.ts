import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct } from '../src/domain/canonical.ts';
import type { ReceiptHeaderRecord, ReceiptItemRecord } from '../src/domain/unified.ts';

type Fixture = CanonicalInventoryProduct & {
  internalUnitsPerCase:number|null;
  industryUnitsPerCase:number|null;
  physicalSource105:boolean;
};

function inventory(internalUnitsPerCase:number|null = 12):Fixture {
  return {
    code:'123', description:'Produto recebido', ean:'7891234567890', quantity:120,
    costUnit:2, saleUnit:3, pendingQty:0, pendingCases:0, pendingCost:0, pendingSale:0,
    isLaunch:false, hasWinthor:true, factoryCode:'MAT123', physicalCases:999, physicalUnits:9999, grossKg:0,
    internalUnitsPerCase, industryUnitsPerCase:24, physicalSource105:true,
  };
}

const header:ReceiptHeaderRecord = {
  receiptId:'218:NF001', receiptDate:'2026-08-22', entryTransactionNumber:'TR1', invoiceRaw:'123456', invoiceNormalized:'123456', entryType:'ENTRADA', series:'1', invoiceIssueDate:'2026-08-21', branch:'11', supplier:'COLGATE', supplierCnpj:'12345678000199', uf:'SP', totalValue:1000, ipiValue:0, source:'218',
};

function receipt(units=15):ReceiptItemRecord {
  return {
    receiptId:header.receiptId, itemCanonicalId:'WINTHOR:123', winthorProductCode:'123', description:'Produto recebido', branch:'11', pack:'', unit:'UN', receivedUnits:units, unitPrice:4, previousFinancialCost:0, currentFinancialCost:0, fiscalCode:'', operationCode:'', inboundMatchStatus:'MATCHED',
  };
}

test('entrada realizada do Estoque nasce de RECEIPT_HEADER + RECEIPT_ITEM', () => {
  const result = buildStockPresentation({ inventory:[inventory()], hasStock105:true, receiptHeaders:[header], receiptItems:[receipt()] });
  const movement = result.movements.find(row => row.kind === 'ENTRADA_REALIZADA');
  assert.ok(movement);
  assert.equal(movement?.date, '2026-08-22');
  assert.equal(movement?.invoice, '123456');
  assert.equal(movement?.sku, '123');
  assert.equal(movement?.ean, '7891234567890');
  assert.equal(movement?.cases, 1);
  assert.equal(movement?.looseUnits, 3);
  assert.equal(movement?.totalUnits, 15);
  assert.equal(movement?.value, 60);
  assert.equal(movement?.origin, 'RECEIPT_ITEM · 218');
});

test('218 sem Un/CX interno preserva unidades recebidas sem inventar caixas ou avulsas', () => {
  const result = buildStockPresentation({ inventory:[inventory(null)], hasStock105:true, receiptHeaders:[header], receiptItems:[receipt(15)] });
  const movement = result.movements.find(row => row.kind === 'ENTRADA_REALIZADA');
  assert.equal(movement?.cases, 0);
  assert.equal(movement?.looseUnits, 0);
  assert.equal(movement?.totalUnits, 15);
});

test('Estoque não consulta estado operacional paralelo depois que o 218 foi materializado no motor', () => {
  const model = readFileSync('src/domain/stockModel.ts', 'utf8');
  const page = readFileSync('src/pages/EstoquePage.tsx', 'utf8');
  assert.doesNotMatch(model, /operationalReceiptMovements\s*\(/);
  assert.doesNotMatch(model, /from\s+['"][^'"]*operationalSources['"]/);
  assert.match(model, /ReceiptHeaderRecord/);
  assert.match(model, /ReceiptItemRecord/);
  assert.match(page, /receiptHeaders:\s*unified\?\.receiptHeaders/);
  assert.match(page, /receiptItems:\s*unified\?\.receiptItems/);
  assert.doesNotMatch(page, /hasStock8013/);
});
