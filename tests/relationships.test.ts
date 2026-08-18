import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClients, buildNetworks } from '../src/services/canonical/aggregate.ts';
import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';
import { buildRelationshipContext } from '../src/services/canonical/relationships.ts';
import { normalizeCnpj } from '../src/services/canonical/utils.ts';
import type { PremiseClient, ReferenceClientNetwork, RouteStore } from '../src/services/canonical/runtime.ts';
import { sale } from './helpers.ts';

const route=(overrides:Partial<RouteStore>={}):RouteStore=>({cnpj:'02318826000200',cnpjRaw:'02.318.826/0002-00',cnpjNormalizationStatus:'EXACT_14',name:'Loja',fantasyName:'Loja',city:'Campo Grande',networkRaw:'Rede Roteiro',managerCnpj:'',groupingCode:'',tier:'',storeType:'',target:0,...overrides});
const premise=(overrides:Partial<PremiseClient>={}):PremiseClient=>({cnpj:'02318826000200',cnpjRaw:'2318826000200',cnpjNormalizationStatus:'PADDED_EXCEL',name:'Loja',city:'Campo Grande',network:'',profile:'',isTop:false,...overrides});

test('normalização registra como o CNPJ chegou sem transformar CPF',()=>{
  assert.deepEqual(normalizeCnpj(2318826000200),{raw:'2318826000200',digits:'2318826000200',canonical:'02318826000200',status:'PADDED_EXCEL',note:'Excel removeu 1 zero(s) inicial(is); valor recomposto e mantido na auditoria.'});
  assert.equal(normalizeCnpj('02.318.826/0002-00').status,'EXACT_14');
  assert.equal(normalizeCnpj('529.982.247-25').status,'CPF_OR_AMBIGUOUS');
  assert.equal(normalizeCnpj('529.982.247-25').canonical,'52998224725');
  assert.equal(normalizeCnpj('73351000122',{declaredCnpj:true}).canonical,'00073351000122');
  assert.equal(normalizeCnpj('123').status,'INVALID_LENGTH');
});

test('mesmo CNPJ cruza entre 8022, Premissas, Roteiro e referência preservando originais',()=>{
  const transaction=sale({cnpj:'02318826000200',cnpjRaw:'2318826000200',cnpjNormalizationStatus:'PADDED_EXCEL',value:100});
  const reference:ReferenceClientNetwork={cnpj:'02318826000200',cnpjRaw:'02.318.826/0002-00',cnpjNormalizationStatus:'EXACT_14',network:'Rede Referência'};
  const context=buildRelationshipContext([transaction],[premise()],[route()],[reference]);
  const audit=reconcileNetworkAssignments([transaction],context.premisesByCnpj,Array.from(context.routeByCnpj.values()),context.referenceNetworks,context.referenceByCnpj)[0];
  assert.deepEqual(audit.sourcePresence,{'8022':true,PREMISSAS:true,ROTEIRO:true,REFERENCIA:true});
  assert.deepEqual(audit.originalCnpjs?.['8022'],['2318826000200']);
  assert.deepEqual(audit.originalCnpjs?.PREMISSAS,['2318826000200']);
  assert.deepEqual(audit.originalCnpjs?.ROTEIRO,['02.318.826/0002-00']);
  assert.deepEqual(audit.originalCnpjs?.REFERENCIA,['02.318.826/0002-00']);
  assert.equal(context.audit.sourceSummaries.find(item=>item.source==='PREMISSAS')?.matchedSalesCnpjs,1);
});

test('referência não é rebatizada como Premissas quando a rede da Premissas está vazia',()=>{
  const transaction=sale({cnpj:'02318826000200',value:100});
  const reference:ReferenceClientNetwork={cnpj:'02318826000200',network:'Rede Referência'};
  const context=buildRelationshipContext([transaction],[premise()],[ ],[reference]);
  assert.equal(context.premisesByCnpj.get(transaction.cnpj)?.network,'');
  const audit=reconcileNetworkAssignments([transaction],context.premisesByCnpj,[],context.referenceNetworks,context.referenceByCnpj)[0];
  assert.equal(audit.source,'REFERENCIA');
  assert.equal(audit.network,'Rede Referência');
});

test('clientes e lojas usam a mesma resolução Premissas → Roteiro → referência → Sem Rede',()=>{
  const transactions=[sale({cnpj:'02318826000200',value:100}),sale({cnpj:'00000000000002',value:200})];
  const routes=[route({networkRaw:'Sol'})];
  const clients=buildClients(transactions,new Map(),routes,new Map());
  assert.equal(clients.find(item=>item.cnpj==='02318826000200')?.network,'Rede Sol');
  assert.equal(clients.find(item=>item.cnpj==='00000000000002')?.network,'SEM REDE');
  const networks=buildNetworks(transactions,new Map(),routes,new Map());
  assert.equal(networks.find(item=>item.key==='REDE SOL')?.stores.length,1);
  assert.equal(networks.some(item=>item.key==='REDE'),false);
  assert.equal(networks.reduce((sum,item)=>sum+item.total,0),300);
});

test('conflito de rede dentro da mesma fonte não fica silencioso',()=>{
  const context=buildRelationshipContext([], [premise({network:'Rede A'}),premise({network:'Rede B'})], [], []);
  assert.equal(context.audit.sourceSummaries.find(item=>item.source==='PREMISSAS')?.duplicateCnpjs,1);
  assert.deepEqual(context.audit.networkConflicts,[{source:'PREMISSAS',cnpj:'02318826000200',networks:['Rede A','Rede B']}]);
  assert.equal(context.premisesByCnpj.get('02318826000200')?.network,'Rede B');
});
