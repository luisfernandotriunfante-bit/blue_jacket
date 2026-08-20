import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');

test('configurações lista explicitamente todas as novas fontes operacionais', () => {
  for (const label of ['Tabela de Preços Winthor · PCTABPR', 'Entrada de Notas 218', 'Notas Recebidas 12.322']) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('configurações separa fontes por frequência de atualização', () => {
  for (const group of ['Rotina diária', 'Mensal / competência', 'Apoio / quando mudar', 'Histórico']) {
    assert.match(page, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('cada fonte pode selecionar arquivo diretamente da própria linha', () => {
  assert.match(page, /Selecionar arquivo/);
  assert.match(page, /onAddFile/);
});
