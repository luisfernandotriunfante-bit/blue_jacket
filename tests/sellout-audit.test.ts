import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRawSales8022, buildVendorResultsWithValidatedPositivity, summarizeTransactionPositivity } from '../src/services/canonical/salesAudit.ts';
import { buildCoordinators } from '../src/services/canonical/aggregate.ts';
import { canonicalCoordinatorName } from '../src/services/canonical/utils.ts';
import type { SalesTransaction } from '../src/services/canonical/runtime.ts';
import { sale } from './helpers.ts';

function row({status='FATURADO',saleType='VENDA',value=100,cnpj='12345678000190',vendor='701',product='11100001',cases=1,units=12}:{status?:string;saleType?:string;value?:number;cnpj?:string;vendor?:string;product?:string;cases?:number;units?:number}={}){
  const r=Array(33).fill('');r[5]=cnpj;r[15]=status;r[17]=vendor;r[21]=product;r[26]=cases;r[27]=units;r[31]=value;r[32]=saleType;return r;
}

test('auditoria independente do 8022 separa faturado, a faturar e motivos de descarte',()=>{
  const rows=[Array(33).fill(''),
    row({status:'FATURADO',value:100,cnpj:'12345678000190',vendor:'701',product:'11100001',cases:2,units:24}),
    row({status:'FATURADO',value:50,cnpj:'22345678000190',vendor:'702',product:'11100002',cases:1,units:6}),
    row({status:'A FATURAR',value:30,cnpj:'12345678000190',vendor:'701',product:'11100001'}),
    row({status:'A FATURAR',value:20,cnpj:'32345678000190',vendor:'703',product:'11100003'}),
    row({status:'CANCELADO',value:999}),
    row({status:'FATURADO',saleType:'BONIFICACAO',value:888}),
    row({status:'FATURADO',value:0}),
  ];
  const audit=auditRawSales8022(rows);
  assert.equal(audit.validRows,4);assert.equal(audit.ignoredRows,3);
  assert.equal(audit.ignoredStatus,1);assert.equal(audit.ignoredSaleType,1);assert.equal(audit.ignoredZeroValue,1);
  assert.equal(audit.invoiced,150);assert.equal(audit.toInvoice,50);assert.equal(audit.total,200);
  assert.equal(audit.cases,5);assert.equal(audit.units,54);
  assert.equal(audit.validCnpjs,3);assert.equal(audit.vendors,3);assert.equal(audit.products,3);
  assert.equal(audit.invoicedPositivation,2);assert.equal(audit.futurePositivation,1);assert.equal(audit.totalPositivation,3);
});

test('CPF, CNPJ vazio e identificador ambíguo não contam como positivação, mas venda permanece no Sell Out',()=>{
  const transactions:SalesTransaction[]=[
    sale({cnpj:'12345678000190',status:'FATURADO',value:100}),
    sale({cnpj:'12345678000190',status:'A FATURAR',value:20}),
    sale({cnpj:'22345678000190',status:'A FATURAR',value:30}),
    sale({cnpj:'12345678901',status:'FATURADO',value:40,cnpjNormalizationStatus:'CPF_OR_AMBIGUOUS'}),
    sale({cnpj:'',status:'A FATURAR',value:10,cnpjNormalizationStatus:'EMPTY'}),
  ];
  const positivity=summarizeTransactionPositivity(transactions);
  assert.deepEqual(positivity,{invoiced:1,future:1,total:2,validCnpjs:2});
  assert.equal(transactions.reduce((sum,tx)=>sum+tx.value,0),200);
});

test('venda sem vendedor fica em NÃO CLASSIFICADO e somas de vendedor e coordenação fecham',()=>{
  const transactions:SalesTransaction[]=[
    sale({vendorCode:'701',vendorName:'A',supervisorName:'FLAVIO',cnpj:'12345678000190',status:'FATURADO',value:100}),
    sale({vendorCode:'701',vendorName:'A',supervisorName:'FLAVIO',cnpj:'22345678000190',status:'A FATURAR',value:50}),
    sale({vendorCode:'',vendorName:'',supervisorName:'',cnpj:'32345678000190',status:'A FATURAR',value:25}),
  ];
  const vendors=buildVendorResultsWithValidatedPositivity(transactions,new Map(),new Map(),[],{total:20,elapsed:10,remaining:10});
  const unclassified=vendors.find(v=>v.newCode==='SEM_VENDEDOR');
  assert.ok(unclassified);assert.equal(unclassified?.name,'NÃO CLASSIFICADO');assert.equal(unclassified?.total,25);
  const total=transactions.reduce((sum,tx)=>sum+tx.value,0);
  assert.equal(vendors.reduce((sum,v)=>sum+v.total,0),total);
  const coordinators=buildCoordinators(vendors);
  assert.equal(coordinators.reduce((sum,c)=>sum+c.total,0),total);
});

test('positivação por vendedor não conta CPF/ambíguo e não duplica cliente faturado no a faturar',()=>{
  const transactions:SalesTransaction[]=[
    sale({vendorCode:'701',vendorName:'A',cnpj:'12345678000190',status:'FATURADO',value:100}),
    sale({vendorCode:'701',vendorName:'A',cnpj:'12345678000190',status:'A FATURAR',value:50}),
    sale({vendorCode:'701',vendorName:'A',cnpj:'22345678000190',status:'A FATURAR',value:25}),
    sale({vendorCode:'701',vendorName:'A',cnpj:'12345678901',cnpjNormalizationStatus:'CPF_OR_AMBIGUOUS',status:'FATURADO',value:15}),
  ];
  const vendors=buildVendorResultsWithValidatedPositivity(transactions,new Map(),new Map(),[],{total:20,elapsed:10,remaining:10});
  assert.equal(vendors[0].invoiced,115);assert.equal(vendors[0].toInvoice,75);assert.equal(vendors[0].total,190);
  assert.equal(vendors[0].invoicedPositivation,1);assert.equal(vendors[0].futurePositivation,1);assert.equal(vendors[0].totalPositivation,2);
});

test('nomes de coordenação seguem consolidações já definidas',()=>{
  assert.equal(canonicalCoordinatorName('CLAUDIO'),'FLAVIO');
  assert.equal(canonicalCoordinatorName('Claudio Silva'),'FLAVIO');
  assert.equal(canonicalCoordinatorName('Thiago da Silva Conegundes'),'THIAGO');
  assert.equal(canonicalCoordinatorName('Thiago'),'THIAGO');
});
