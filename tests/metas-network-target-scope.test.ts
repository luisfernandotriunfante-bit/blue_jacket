import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const metas = fs.readFileSync(new URL('../src/pages/MetasPage.tsx', import.meta.url), 'utf8');
const networks = fs.readFileSync(new URL('../src/pages/TopRetailNetworksPage.tsx', import.meta.url), 'utf8');

test('Meta Redes Geral é mantida na aba Metas e não possui editor na aba Redes', () => {
  assert.ok(metas.includes('Meta Redes Geral (R$)'));
  assert.ok(metas.includes('setNetworkTargetFor(competence'));
  assert.ok(networks.includes('networkTargetFor(lists.m3.competence)'));
  assert.doesNotMatch(networks, /setNetworkTargetFor|Salvar meta de redes|Meta total das redes/);
});
