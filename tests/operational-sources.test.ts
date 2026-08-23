import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOperationalPortfolioRows,
  parseEntryNotes218,
  parseOperationalPortfolio,
  parseReceivedNotes12322,
  parseWinthorTablePrices,
} from '../src/services/operationalSources.ts';

test('PCTABPR usa PVENDA1 ativo da região 11 e ignora PTABELA quando PVENDA1 existe', () => {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'REGIAO', 'CODFILIAL', 'STATUSREGIAO', 'PTABELA', 'PVENDA1'],
    [565, 11, 'TABELA CAMPO GRANDE - MCD', 11, 'A', 99.99, 20.27],
    [612, 12, 'OUTRA REGIAO', 12, 'A', 15, 88.88],
    [857, 11, 'TABELA CAMPO GRANDE - MCD', 11, 'I', 50, 40],
  ];
  assert.deepEqual(parseWinthorTablePrices(rows), { '565': 20.27 });
});

test('PCTABPR sem PVENDA1 é rejeitada sem fallback silencioso para PTABELA', () => {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'STATUSREGIAO', 'PTABELA', 'PVENDA'],
    [565, 11, 'A', 20.27, 20.27],
  ];
  assert.throws(() => parseWinthorTablePrices(rows), /CODPROD\/PVENDA1/);
});

test('PCTABPR ignora mesmo CODPROD fora de NUMREGIAO=11 mesmo quando CODFILIAL ou nome parecem MCD', () => {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'REGIAO', 'CODFILIAL', 'STATUSREGIAO', 'PVENDA1'],
    [5924, 11, 'REGIAO 11', 11, 'A', 46.32],
    [5924, 95, 'TABELA CAMPO GRANDE - MCD 2', 11, 'A', 45.39],
  ];
  assert.deepEqual(parseWinthorTablePrices(rows), { '5924': 46.32 });
});

test('PCTABPR exige NUMREGIAO e não usa CODFILIAL como substituto', () => {
  const rows = [['CODPROD','CODFILIAL','STATUSREGIAO','PVENDA1'],[5924,11,'A',46.32]];
  assert.throws(() => parseWinthorTablePrices(rows), /NUMREGIAO/i);
});

test('PCTABPR consolida PVENDA1 elegível repetido quando os valores são iguais',()=>{
  const rows=[['CODPROD','NUMREGIAO','STATUSREGIAO','PVENDA1'],[565,11,'A',20.27],[565,11,'A',20.27]];
  assert.deepEqual(parseWinthorTablePrices(rows),{'565':20.27});
});

test('PCTABPR bloqueia conflito de PVENDA1 em vez de usar última linha',()=>{
  const rows=[['CODPROD','NUMREGIAO','STATUSREGIAO','PVENDA1'],[565,11,'A',20.27],[565,11,'A',21.99]];
  assert.throws(()=>parseWinthorTablePrices(rows),/conflito.*565.*20\.27.*21\.99/i);
});

test('218 identifica nota, preserva identidade e itens recebidos', () => {
  const rows: unknown[][] = [];
  rows.push(['Dt. Entrada', '', '', '', 'Nota Fiscal', '', '', '', 'Dt. Emissão', '', '', 'Fornecedor', 'Razão', '', '', '', '', '', 'CGC', '', '', 'Vl. Total']);
  const note = Array(22).fill('');
  note[0] = '19/08/2026'; note[4] = '*2953129'; note[8] = '08/08/2026'; note[12] = 'A - COLGATE-PALMOLIVE COMERCIAL LTDA'; note[18] = '00382468003375'; note[21] = 261126.71;
  rows.push(note);
  rows.push(['', '', '', '', 'Código', 'Produto', '', '', '', '', '', '', '', '', 'UN', '', 'Qt.', 'P.Unit.']);
  const item = Array(18).fill('');
  item[4] = 988; item[5] = 'SAB PALM FRAMB AMORA 85G'; item[15] = 11520; item[17] = 4.442545;
  rows.push(item);
  const parsed = parseEntryNotes218(rows);
  assert.equal(parsed.invoices.length, 1);
  assert.equal(parsed.invoices[0].invoice, '2953129');
  assert.equal(parsed.invoices[0].invoiceNumber, '2953129');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].sku, '988');
  assert.equal(parsed.items[0].units, 11520);
});

test('12.322 identifica notas históricas já recebidas sem criar quantidade por SKU', () => {
  const text = '   2942484 13/07/26 30/07/26    382468003375 A-COLGATE       212.01 0000     81.230,90       0,00       0,00 001 SP                           0';
  const parsed = parseReceivedNotes12322(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].invoice, '2942484');
  assert.equal(parsed[0].invoiceNumber, '2942484');
  assert.equal(parsed[0].entryDate, '2026-07-30');
  assert.equal(parsed[0].totalValue, 81230.9);
  assert.equal('units' in parsed[0], false);
});

test('Carteira reconhece assinatura estrutural, preserva NF/série, material, quantidades e valor', () => {
  const rows = [
    ['Order Date', 'Invoice', 'x', 'x', 'Material', 'Material Desc', 'Order Qty', 'Bill Qty', 'Net Value'],
    ['01/08/26', '002953129-1', '', '', '565', 'Produto A', 10, 2, 1000],
  ];
  assert.equal(isOperationalPortfolioRows(rows),true);
  const parsed = parseOperationalPortfolio(rows);
  assert.equal(parsed.invoiceColumnDetected, true);
  assert.equal(parsed.rows[0].invoice, '2953129');
  assert.equal(parsed.rows[0].invoiceRaw, '002953129-1');
  assert.equal(parsed.rows[0].invoiceSeries, '1');
  assert.equal(parsed.rows[0].orderQty, 10);
  assert.equal(parsed.rows[0].billQty, 2);
  assert.equal(parsed.rows[0].costValue,1000);
});

test('Carteira de Clientes não possui assinatura de Carteira operacional',()=>{
  const rows=[['COD CLIENTE','CNPJ','RAZAO SOCIAL','VENDEDOR','LIMITE'],['123','00123456000199','Cliente A','RCA 1',1000]];
  assert.equal(isOperationalPortfolioRows(rows),false);
});

test('layout desconhecido de Carteira é bloqueado sem fallback por posição física',()=>{
  const rows=[['A','B','C','D','E','F','G','H','I'],['x','y','','','565','Produto A',10,2,1000]];
  assert.throws(()=>parseOperationalPortfolio(rows),/layout não reconhecido.*MATERIAL.*ORDER QTY.*BILL QTY.*NET VALUE/i);
});
