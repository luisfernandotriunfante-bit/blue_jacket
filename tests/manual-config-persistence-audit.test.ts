import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadManualConfiguration } from '../src/store/competencePersistence.ts';

class MemoryStorage {
  values = new Map<string,string>();
  getItem(key:string){ return this.values.get(key) ?? null; }
  setItem(key:string,value:string){ this.values.set(key,value); }
  removeItem(key:string){ this.values.delete(key); }
}

test('configuração de competência corrompida retorna erro explícito sem fingir ausência',()=>{
  const storage=new MemoryStorage();
  storage.setItem('bj_manual_config:2026-08','{json quebrado');
  const loaded=loadManualConfiguration(storage,'2026-08');
  assert.equal(loaded.source,'DEFAULT');
  assert.match(loaded.persistenceError||'',/corrompida/i);
});

test('DataContext propaga erro de persistência manual para warnings visíveis',()=>{
  const context=readFileSync('src/store/DataContext.tsx','utf8');
  const page=readFileSync('src/pages/ConfiguracoesPage.tsx','utf8');
  assert.match(context,/manualConfigPersistenceError/);
  assert.match(context,/warnings:\s*Array\.from\(new Set\(\[\.\.\.configured\.warnings,\s*manualConfigPersistenceError\]\)\)/);
  assert.match(page,/canonical\.warnings\.map/);
  assert.match(page,/Pendências conhecidas/);
});
