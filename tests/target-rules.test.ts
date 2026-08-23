import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseCompassTargets } from '../src/services/motors/sourceParsers.ts';
import { redistributeNetworkTotal, redistributeSingleNetwork, resolveSellOutTarget, sumNetworkTargets } from '../src/domain/targetRules.ts';

function targetRow({coord='FLAVIO',code='701',channel='MCD',name='Vendedor',brand='COLGATE',sales=1000,positivity=10}:{coord?:string;code?:string;channel?:string;name?:string;brand?:string;sales?:number;positivity?:number}={}){
  const row=Array(22).fill('');row[0]=coord;row[1]=code;row[3]=channel;row[4]=name;row[7]=brand;row[16]=sales;row[21]=positivity;return row;
}

test('Bússola considera somente MCD + Colgate',()=>{
  const header=Array(22).fill('');header[16]='META PNA';
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
    header,
    targetRow({code:'701',brand:'COLGATE',sales:1000,positivity:10}),
    targetRow({code:'702',brand:'COLGATE-PALMOLIVE',sales:2000,positivity:20}),
    targetRow({code:'703',brand:'ELSEVE',sales:9000,positivity:90}),
    targetRow({code:'704',channel:'OUTRO',brand:'COLGATE',sales:8000,positivity:80}),
  ]),'Metas');
  const parsed=parseCompassTargets(workbook);
  assert.equal(parsed.length,2);
  assert.deepEqual(parsed.map(row=>row.oldCode),['701','702']);
  assert.equal(parsed.reduce((sum,row)=>sum+row.salesTarget,0),3000);
  assert.equal(parsed.reduce((sum,row)=>sum+row.positivityTarget,0),30);
});

test('Meta T&C não herda automaticamente a meta da indústria',()=>{
  assert.equal(resolveSellOutTarget(0),0);
  assert.equal(resolveSellOutTarget(5_000_000),5_000_000);
});

test('alterar Meta Redes Geral redistribui proporcionalmente e fecha exatamente o total',()=>{
  const rows=[{key:'A',target:500},{key:'B',target:300},{key:'C',target:200}];
  const next=redistributeNetworkTotal(rows,1_500);
  assert.equal(next.A,750);assert.equal(next.B,450);assert.equal(next.C,300);
  assert.equal(sumNetworkTargets(next),1_500);
});

test('editar uma rede mantém Meta Redes Geral e redistribui saldo proporcionalmente',()=>{
  const rows=[{key:'A',target:500},{key:'B',target:300},{key:'C',target:200}];
  const next=redistributeSingleNetwork(rows,'A',700);
  assert.equal(next.A,700);
  assert.equal(next.B,180);
  assert.equal(next.C,120);
  assert.equal(sumNetworkTargets(next),1000);
});

test('redistribuição fecha exatamente mesmo com pesos que geram dízima',()=>{
  const rows=[{key:'A',target:1},{key:'B',target:1},{key:'C',target:1}];
  const next=redistributeNetworkTotal(rows,1000);
  assert.equal(sumNetworkTargets(next),1000);
  const edited=redistributeSingleNetwork(Object.entries(next).map(([key,target])=>({key,target})),'A',500);
  assert.equal(sumNetworkTargets(edited),1000);
});
