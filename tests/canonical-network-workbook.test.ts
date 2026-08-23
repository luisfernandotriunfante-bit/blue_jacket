import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildCanonicalNetworkWorkbook } from '../src/services/networkWorkbook.ts';

function state() {
  return {
    referenceDate: '2026-08-23',
    networks: [
      { key:'REDE A', name:'REDE A', networkTarget:1000, topTarget:600, invoiced:500, toInvoice:250, total:750, networkAttainment:.75, topAttainment:1.25, gapToNetworkTarget:250, gapToTopTarget:0, clients:2, stores:[{cnpj:'00123456000199',name:'LOJA A',fantasyName:'A',city:'CAMPO GRANDE',managerCnpj:'',groupingCode:'',tier:'OURO',storeType:'LOJA',topTarget:600,invoiced:400,toInvoice:100,total:500}] },
      { key:'SEM REDE', name:'SEM REDE', networkTarget:0, topTarget:0, invoiced:10, toInvoice:0, total:10, networkAttainment:0, topAttainment:0, gapToNetworkTarget:0, gapToTopTarget:0, clients:1, stores:[] },
    ],
    sources:[{kind:'sales8022',fileName:'vendas-8022.xls',loaded:true,rows:10,updatedAt:'2026-08-23T00:00:00.000Z',note:'8022'}],
  } as any;
}

test('workbook de Redes nasce apenas do estado canônico e exclui SEM REDE da planilha comercial',()=>{
  const workbook=buildCanonicalNetworkWorkbook(state());
  assert.deepEqual(workbook.SheetNames,['Redes','Lojas','Fontes']);
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets['Redes']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].Rede,'REDE A');
  assert.equal(rows[0]['Meta Rede'],1000);
  assert.equal(rows[0]['Sell Out'],750);
  assert.equal(rows[0]['% Meta Rede'],.75);
  assert.equal(rows[0]['% Meta Tops'],1.25);
});

test('workbook de Redes preserva loja Top e linhagem da fonte sem abas 319/12.326',()=>{
  const workbook=buildCanonicalNetworkWorkbook(state());
  assert.equal(workbook.SheetNames.some(name=>/319|12\.326/i.test(name)),false);
  const stores=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets['Lojas']);
  assert.equal(stores[0].CNPJ,'00123456000199');
  assert.equal(stores[0].Categoria,'OURO');
  const sources=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets['Fontes']);
  assert.equal(sources[0].Arquivo,'vendas-8022.xls');
});
