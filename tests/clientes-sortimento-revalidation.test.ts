import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = () => readFileSync('src/pages/ClientesSortimentoUnifiedPage.tsx', 'utf8');
const documents = () => readFileSync('src/pages/DocumentosPage.tsx', 'utf8');
const adapter = () => readFileSync('src/services/motors/customerIntelligenceUnifiedAdapter.ts', 'utf8');

test('Clientes & Sortimento não permite análise histórica híbrida com snapshot operacional atual', () => {
  const source = page();
  assert.doesNotMatch(source, /type="date"/);
  assert.doesNotMatch(source, /setReferenceDate|\[referenceDate,/);
  assert.match(source, /buildCustomerIntelligence\(unifiedCanonical, support, selectedCnpj, unifiedCanonical\.referenceDate\)/);
  assert.match(source, /A análise operacional fica presa à fotografia canônica atual/);
  assert.match(source, /Referência operacional/);
});

test('Documentos por CNPJ usa exatamente a mesma referência canônica da tela', () => {
  const source = documents();
  assert.doesNotMatch(source, /customerReferenceDate|setCustomerReferenceDate/);
  assert.match(source, /buildCustomerIntelligence\(unifiedCanonical, customerSupport, selectedCustomerCnpj, unifiedCanonical\.referenceDate\)/);
  assert.match(source, /A referência não é editável/);
});

test('Visão Geral torna checks BLOCKED explicitamente visíveis', () => {
  const source = page();
  assert.match(source, /blockedAudits = result\.audit\.filter\(check => check\.status === 'BLOCKED'\)/);
  assert.match(source, /\$\{blockedAudits\.length\} bloqueio\(s\)/);
  assert.match(source, /· BLOQUEADO ·/);
  assert.match(source, /Checks não aprovados ficam explícitos/);
});

test('Lançamentos mantém a Lista Oficial materializada no ITEM_MASTER como autoridade', () => {
  const pageSource = page();
  const adapterSource = adapter();
  assert.match(adapterSource, /const launchLabel=item\?\.isLaunch\?'LANÇAMENTO':''/);
  assert.match(adapterSource, /O rótulo\s*\n?\s*\/\/ existente no Sortimento Oficial é apenas informativo/);
  assert.match(pageSource, /A autoridade de lançamento é a Lista Oficial de Lançamentos materializada no ITEM_MASTER por EAN/);
  assert.match(pageSource, /o rótulo do sortimento não cria lançamento sozinho/);
});

test('Promoções continua bloqueada de forma explícita quando falta fonte estruturada', () => {
  const source = page();
  assert.match(source, /Fonte estruturada pendente/);
  assert.match(source, /Nenhuma promoção oficial estruturada/);
  assert.match(source, /Nada é inventado sem fonte validada/);
  assert.match(source, /Mínimos de pedido continuam exibidos como condição/);
});
