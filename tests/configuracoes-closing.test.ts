import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStagedStorage } from '../src/services/stagedStorage.ts';

const page = () => readFileSync('src/pages/ConfiguracoesPage.tsx', 'utf8');

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failOnceOn = '';
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failOnceOn === key) {
      this.failOnceOn = '';
      throw new Error(`quota:${key}`);
    }
    this.values.set(key, String(value));
  }
}

test('staging de Configurações não altera persistência real antes do commit', () => {
  const base = new MemoryStorage();
  base.setItem('operacional', 'antigo');
  const staged = createStagedStorage(base);
  staged.storage.setItem('operacional', 'novo');
  staged.storage.setItem('continuidade', 'snapshot');
  assert.equal(staged.storage.getItem('operacional'), 'novo');
  assert.equal(base.getItem('operacional'), 'antigo');
  assert.equal(base.getItem('continuidade'), null);
  staged.commit();
  assert.equal(base.getItem('operacional'), 'novo');
  assert.equal(base.getItem('continuidade'), 'snapshot');
});

test('falha no commit transacional restaura chaves que já tinham sido gravadas', () => {
  const base = new MemoryStorage();
  base.setItem('a', 'anterior-a');
  base.setItem('b', 'anterior-b');
  const staged = createStagedStorage(base);
  staged.storage.setItem('a', 'novo-a');
  staged.storage.setItem('b', 'novo-b');
  base.failOnceOn = 'b';
  assert.throws(() => staged.commit(), /Persistência transacional.*quota:b/i);
  assert.equal(base.getItem('a'), 'anterior-a');
  assert.equal(base.getItem('b'), 'anterior-b');
});

test('pipeline da tela só commita fontes auxiliares depois do cálculo canônico', () => {
  const source = page();
  const stage = source.indexOf('const staged = createStagedStorage(localStorage)');
  const prepare = source.indexOf('prepareOperationalSources(selectedFiles, staged.storage)');
  const continuity = source.indexOf('applyPortfolioContinuityToPreparedState(selectedFiles, prepared.state, staged.storage)');
  const calculate = source.indexOf('const result = await processUnifiedFiles');
  const commit = source.indexOf('staged.commit()');
  const applyCanonical = source.indexOf('setCanonical(result.canonical)');
  assert.ok(stage >= 0 && prepare > stage && continuity > prepare && calculate > continuity && commit > calculate && applyCanonical > commit);
  assert.doesNotMatch(source, /prepareOperationalSources\(selectedFiles\)(?!,)/);
});

test('PCTABPR tem precedência sobre regra genérica de Lista de Preço Colgate na fila', () => {
  const source = page();
  const supplemental = source.indexOf('const supplemental = supplementalSourceKind(fileName)');
  const priceList = source.indexOf("raw.includes('COLGATE') && (raw.includes('PRECO') || raw.includes('PRICE'))");
  assert.ok(supplemental >= 0 && priceList > supplemental);
  assert.match(source, /if \(supplemental\) return SOURCES\.find\(source => source\.supplementalKind === supplemental\)/);
});

test('379 de 2025 e 2026 não compartilham status carregado apenas pelo sourceType 379', () => {
  const source = page();
  assert.match(source, /isYearSpecificHistory/);
  assert.match(source, /audits\.get\(source\.kind\)\?\.loaded/);
  assert.match(source, /!isYearSpecificHistory\(source\)/);
  assert.match(source, /history379_2025/);
  assert.match(source, /history379_2026/);
});

test('erros de persistência operacional e de continuidade ficam visíveis em Configurações', () => {
  const source = page();
  assert.match(source, /operationalState\.persistenceError/);
  assert.match(source, /Persistência das fontes operacionais/);
  assert.match(source, /portfolioContinuityResult\.error/);
  assert.match(source, /Persistência da continuidade da Carteira/);
  assert.match(source, /loadPortfolioContinuityResult/);
});

test('Configurações mantém reconciliação e qualidade canônicas visíveis', () => {
  const source = page();
  assert.match(source, /ReconciliationAuditPanel/);
  assert.match(source, /canonical\.unified\.qualityIssues/);
  assert.match(source, /Pendências conhecidas/);
  assert.match(source, /canonical\?\.warnings/);
});
