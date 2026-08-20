import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEGACY_CANONICAL_KEY, safeLocalStorageWrite } from '../src/store/canonicalPersistence';

class QuotaStorage {
  values = new Map<string, string>([[LEGACY_CANONICAL_KEY, 'base-grande-antiga']]);
  setItem(key: string, value: string) {
    if (this.values.has(LEGACY_CANONICAL_KEY)) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
}

test('escrita pequena libera bj_canonical legado e não propaga erro de quota', () => {
  const storage = new QuotaStorage();
  assert.equal(safeLocalStorageWrite(storage, 'bj_metricas', '{"ok":true}'), true);
  assert.equal(storage.getItem(LEGACY_CANONICAL_KEY), null);
  assert.equal(storage.getItem('bj_metricas'), '{"ok":true}');
});

test('DataContext persiste a base grande no IndexedDB e não em localStorage', () => {
  const source = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /loadCanonicalState\(localStorage\)/);
  assert.match(source, /saveCanonicalState\(data\)/);
  assert.match(source, /LEGACY_CANONICAL_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\(['"]bj_canonical['"]/);
});

test('hidratação reaplica fontes operacionais salvas, incluindo PCTABPR', () => {
  const source = fs.readFileSync(new URL('../src/store/DataContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /loadOperationalSourceState\(localStorage\)/);
  assert.match(source, /applyOperationalOverrides\(storedCanonical,operational,storedManual\)/);
});
