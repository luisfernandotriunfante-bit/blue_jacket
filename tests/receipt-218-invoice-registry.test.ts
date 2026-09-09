import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parse218 } from '../src/canonical/parsers.ts';
import { buildCanonicalBundleFromStaging, buildM3 } from '../src/canonical/motors.ts';
import { sourceImportTestHelpers } from '../src/canonical/sourceImport.ts';

const SOURCE = 'entrada-notas-218.xls';

test('218 materializa a NF mesmo sem depender do bloco de itens', async () => {
  const invoiceHeader = Array(24).fill('');
  invoiceHeader[0] = 'Dt. Entrada';
  invoiceHeader[2] = 'Nº Trans. Ent.';
  invoiceHeader[4] = 'Nota Fiscal';
  invoiceHeader[5] = 'Tipo Ent.';
  invoiceHeader[7] = 'Série';
  invoiceHeader[8] = 'Dt. Emissão';
  invoiceHeader[10] = 'Filial';
  invoiceHeader[11] = 'Cod.';
  invoiceHeader[12] = 'Fornecedor';
  invoiceHeader[18] = 'CGC';
  invoiceHeader[20] = 'UF';
  invoiceHeader[21] = 'Vl. Total';

  const invoiceRow = Array(24).fill('');
  invoiceRow[0] = new Date('2026-08-20T12:00:00Z');
  invoiceRow[2] = '204906';
  invoiceRow[4] = '2953096';
  invoiceRow[5] = 'E';
  invoiceRow[7] = '1';
  invoiceRow[8] = new Date('2026-08-08T12:00:00Z');
  invoiceRow[10] = '1';
  invoiceRow[11] = '38';
  invoiceRow[12] = 'COLGATE';
  invoiceRow[18] = '00382468000110';
  invoiceRow[20] = 'SP';
  invoiceRow[21] = 19245.57;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([invoiceHeader, invoiceRow]), 'Report');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const file = new File([bytes], SOURCE, { type: 'application/vnd.ms-excel' });

  const parsed = await parse218(file);
  assert.equal(parsed.audits.length, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!.invoice_raw?.typed, '2953096');
  assert.equal(parsed.rows[0]!.__receipt_scope?.typed, 'INVOICE');

  const m3 = buildM3([parsed]);
  const receipt = m3.records.find(row => row.fact_type === 'RECEIPT');
  assert.equal(receipt?.invoice_number, '2953096');
  assert.equal(receipt?.receipt_invoice_value, 19245.57);
  assert.equal(receipt?.receipt_scope, 'INVOICE');
  assert.equal(receipt?.source_lineage, '218:NF');

  // Este é o caminho usado pelo navegador ao remontar o build salvo. Garante
  // que o valor fiscal não fique apenas no motor de compatibilidade antigo.
  const browserBundle = buildCanonicalBundleFromStaging([parsed]);
  const browserReceipt = browserBundle.lists.M3_MOVIMENTO_VENDAS.records.find(row => row.fact_type === 'RECEIPT');
  assert.equal(browserReceipt?.receipt_invoice_value, 19245.57);
});

test('mudança do parser invalida o staging antigo do 218', () => {
  assert.equal(sourceImportTestHelpers.parserVersionFor(SOURCE), 'browser-v3-invoice-items-physical-layout');
});

test('218 lê quantidade física em P e descrição em E/F', async () => {
  const header=Array(24).fill('');header[0]='Dt. Entrada';
  const invoice=Array(24).fill('');invoice[0]=new Date('2026-09-04T12:00:00Z');invoice[4]='*2954241';invoice[21]=33509;
  const itemHeader=Array(24).fill('');itemHeader[4]='Código';itemHeader[5]='Produto';
  const item=Array(24).fill('');item[4]=1791;item[5]='ENXAG PLAX FR MINT';item[15]=240;item[17]=20.226083;item[18]=18.2606;item[20]=18.623011;item[21]=2102;item[23]='E';
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([header,invoice,itemHeader,item]),'Report');
  const bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});const parsed=await parse218(new File([bytes],SOURCE));
  const parsedItem=parsed.rows.find(row=>row.__receipt_scope?.typed==='ITEM')!;assert.equal(parsedItem.received_units.typed,240);assert.equal(parsedItem['receipt_item_code + description'].typed,'1791 · ENXAG PLAX FR MINT');
  const receipt=buildM3([parsed]).records.find(row=>row.receipt_scope==='ITEM')!;assert.equal(receipt.received_units,240);assert.equal(receipt.winthor_product_code,'1791 · ENXAG PLAX FR MINT');
});
