import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeLocalStorageWrite } from '../src/store/canonicalPersistence.ts';

class QuotaStorage {
  values = new Map<string, string>();
  setItem(key: string, value: string) {
    if (value.length > 10) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
}

test('escrita auxiliar não apaga outras chaves para contornar quota', () => {
  const storage = new QuotaStorage();
  storage.values.set('outra-chave','preservada');
  assert.equal(safeLocalStorageWrite(storage, 'config', '12345678901'), false);
  assert.equal(storage.getItem('outra-chave'), 'preservada');
  assert.equal(storage.getItem('config'), null);
});

test('DataContext persiste a base canônica somente no IndexedDB', () => {
  const source = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8');
  const persistence = fs.readFileSync(new URL('../src/store/canonicalPersistence.ts', import.meta.url), 'utf8');
  assert.match(source, /loadCanonicalState\(\)/);
  assert.match(source, /saveCanonicalState\(data\)/);
  assert.doesNotMatch(source, /bj_canonical|bj_produtos|bj_metricas|bj_sellout/);
  assert.match(persistence, /indexedDB\.open/);
  assert.doesNotMatch(persistence, /LEGACY_CANONICAL_KEY|bj_canonical/);
});

test('hidratação rejeita snapshot anterior à UnifiedDataLayer em vez de reaplicar overlays', () => {
  const source = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /stored && isUnifiedCanonicalState\(stored\) \? stored : null/);
  assert.match(source, /if \(stored && !storedCanonical\) await clearCanonicalState\(\)/);
  assert.doesNotMatch(source, /loadOperationalSourceState|applyOperationalOverrides|applyReceiptReconciliation/);
});
