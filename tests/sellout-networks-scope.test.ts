import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/TopRetailNetworksPage.tsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/canonical/topRetailNetworksModel.ts', import.meta.url), 'utf8');

test('aba Redes é roteada para a visão oficial Top Varejistas e lê somente M2/M3 + metas manuais', () => {
  assert.ok(main.includes("activeSellOutTopTab === 'redes' ? <TopRetailNetworksPage />"));
  assert.ok(page.includes("loadCandidateList('M2_CLIENTE_RCA')"));
  assert.ok(page.includes("loadCandidateList('M3_MOVIMENTO_VENDAS')"));
  assert.ok(page.includes('sellOutTargets()'));
  assert.ok(page.includes('networkTargetFor(lists.m3.competence)'));
  assert.doesNotMatch(page, /from ['"].*\/(parsers|motors)['"]/);
});

test('Redes mostra exatamente os quatro cards solicitados e não edita meta dentro da aba', () => {
  assert.ok(page.includes('label="Meta Redes"'));
  assert.ok(page.includes('label="Realizado"'));
  assert.ok(page.includes('label="Clientes × com venda"'));
  assert.ok(page.includes('label="Gap de valor"'));
  assert.doesNotMatch(page, /Salvar meta de redes|Redistribuir proporcional|panel-input-currency/);
});

test('universo da aba é exclusivamente top_network do M2 e não premise/canonical network', () => {
  assert.ok(model.includes('text(customer.top_network)'));
  assert.doesNotMatch(model, /premise_network|canonical_network/);
});

test('tabela Redes contém as colunas operacionais solicitadas', () => {
  for (const label of ['Rede', 'Clientes', 'Meta da rede', 'Meta Top Varejista', 'Ating. Meta Rede', 'Ating. Meta Top', 'Faturado', 'A faturar', 'Total', 'Participação']) {
    assert.ok(page.includes(`>${label}<`) || page.includes(`>${label}</`), `coluna ausente: ${label}`);
  }
});
