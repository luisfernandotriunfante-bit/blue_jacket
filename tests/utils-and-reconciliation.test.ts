import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCnpj, canonicalCoordinatorName } from '../src/services/canonical/utils.ts';
import { numericCheck, sumRawSales8022 } from '../src/services/canonical/reconciliation.ts';
import { resolveClientNetwork } from '../src/services/canonical/networkResolution.ts';

test('CNPJ preserva 14 dígitos e recompõe zeros perdidos pelo Excel',()=>{
  assert.equal(cleanCnpj('02.318.826/0002-00'),'02318826000200');
  assert.equal(cleanCnpj(2318826000200),'02318826000200');
  assert.equal(cleanCnpj(318826000200),'00318826000200');
});

test('CPF de 11 dígitos não é transformado artificialmente em CNPJ',()=>{
  assert.equal(cleanCnpj('529.982.247-25'),'52998224725');
});

test('gestores confirmados são consolidados pelo mesmo nome canônico',()=>{
  assert.equal(canonicalCoordinatorName('Claudio Souza'),'FLAVIO');
  assert.equal(canonicalCoordinatorName('Thiago da Silva Conegundes'),'THIAGO');
  assert.equal(canonicalCoordinatorName('Thiago'),'THIAGO');
});

test('reconciliação numérica mostra esperado, calculado, diferença e status',()=>{
  const ok=numericCheck({id:'ok',level:'SOURCE',label:'Teste',expected:10,calculated:10.004,source:'Fonte',tolerance:0.005});
  const divergent=numericCheck({id:'bad',level:'SPREADSHEET',label:'Teste',expected:10,calculated:10.01,source:'Planilha',tolerance:0.005});
  assert.equal(ok.status,'OK');
  assert.equal(divergent.status,'DIVERGENT');
  assert.equal(divergent.difference,0.009999999999999787);
});

test('fonte de rede segue Premissas, depois Roteiro, depois referência',()=>{
  assert.equal(resolveClientNetwork('Rede A','Rede B','Rede C').source,'PREMISSAS');
  assert.deepEqual(resolveClientNetwork('Rede A','Rede B','').divergentSources,['ROTEIRO: Rede B']);
  assert.equal(resolveClientNetwork('','Sol','').source,'ROTEIRO');
  assert.equal(resolveClientNetwork('','','Nova Estrela').source,'REFERENCIA');
  assert.equal(resolveClientNetwork('','','').source,'SEM_REDE');
});

test('soma direta do 8022 é independente do parser canônico',()=>{
  const rows:any[][]=[[],[],[],[]];
  rows[1][15]='FATURADO';rows[1][31]='1.234,56';rows[1][32]='VENDA';
  rows[2][15]='A FATURAR';rows[2][31]=100;rows[2][32]='VENDA';
  rows[3][15]='FATURADO';rows[3][31]=999;rows[3][32]='BONIFICACAO';
  assert.deepEqual(sumRawSales8022(rows),{invoiced:1234.56,toInvoice:100,total:1334.56,validRows:2,ignoredRows:1});
});
