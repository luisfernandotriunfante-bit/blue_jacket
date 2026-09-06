import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const metas = fs.readFileSync(new URL('../src/pages/MetasPage.tsx', import.meta.url), 'utf8');
const networks = fs.readFileSync(new URL('../src/pages/TopRetailNetworksPage.tsx', import.meta.url), 'utf8');
const reportSettings = fs.readFileSync(new URL('../src/canonical/reportSettings.ts', import.meta.url), 'utf8');

test('Meta Redes Geral é mantida em Administração → Metas via TargetState e não possui editor na aba Redes', () => {
  assert.ok(metas.includes('Meta Redes Geral (R$)'));
  assert.match(metas, /actions\.saveGeneral/);
  assert.ok(networks.includes('networkTargetFor(competence)'));
  assert.match(reportSettings, /TargetState is the operational authority/);
  assert.doesNotMatch(networks, /setNetworkTargetFor|Salvar meta de redes|Meta total das redes/);
});
