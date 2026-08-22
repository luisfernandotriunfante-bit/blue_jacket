import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadOperationalSourceState } from '../src/services/operationalSources.ts';
import { loadPortfolioContinuityResult } from '../src/services/portfolioContinuityFiles.ts';

function storageWith(raw:string|null){
  return {getItem:()=>raw,setItem:()=>{},removeItem:()=>{}} as any;
}

test('JSON operacional corrompido retorna erro explícito de persistência',()=>{
  const state=loadOperationalSourceState(storageWith('{invalido'));
  assert.match(state.persistenceError||'',/Falha ao restaurar fontes operacionais/i);
  assert.equal(state.portfolioRows.length,0);
});

test('continuidade da Carteira corrompida é distinguida de ausência de snapshot',()=>{
  const corrupt=loadPortfolioContinuityResult(storageWith('{invalido'));
  assert.equal(corrupt.snapshot,null); assert.match(corrupt.error,/Falha ao restaurar a continuidade/i);
  const absent=loadPortfolioContinuityResult(storageWith(null));
  assert.equal(absent.snapshot,null); assert.equal(absent.error,'');
});

test('Clientes & Sortimento não possui mais catch silencioso que retorna base vazia',()=>{
  const source=fs.readFileSync(new URL('../src/services/customerIntelligenceRepository.ts',import.meta.url),'utf8');
  assert.match(source,/Persistência Clientes & Sortimento: falha ao restaurar a base anterior/);
  assert.doesNotMatch(source,/catch\s*\{\s*return EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;\s*\}/);
});
