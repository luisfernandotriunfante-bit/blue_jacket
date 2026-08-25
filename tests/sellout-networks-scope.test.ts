import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/canonical/networkDashboardModel.ts', import.meta.url), 'utf8');

test('Redes lê somente M2/M3 e metas manuais persistidas, sem parser ou motor na página', () => {
  assert.ok(page.includes('buildTopNetworksViewModel({ m2, m3'));
  assert.ok(page.includes('networkTargetFor(model.competence)'));
  assert.ok(page.includes('networkAllocationFor(model.competence)'));
  assert.ok(page.includes('buildNetworkDashboardModel'));
  assert.doesNotMatch(page, /from ['"].*\/(parsers|motors)['"]/);
  assert.doesNotMatch(dashboard, /from ['"].*\/(parsers|motors)['"]/);
});

test('Redes usa o mesmo padrão visual de cards e botões secundários do Resumo', () => {
  assert.ok(page.includes('label="Meta Redes"'));
  assert.ok(page.includes('label="Total nas redes"'));
  assert.ok(page.includes('label="Faturado"'));
  assert.ok(page.includes('label="A faturar"'));
  assert.ok(page.includes('label="Redes com venda"'));
  assert.ok(page.includes('label="Clientes vinculados"'));
  assert.ok(page.includes('className="panel-secondary-button" onClick={() => exportTopNetworksExcel(networks)}'));
  assert.ok(page.includes('className="panel-secondary-button" onClick={() => exportTopNetworksJson(networks)}'));
});

test('Meta individual de rede é editável e redistribui o saldo sem alterar a meta total', () => {
  assert.ok(page.includes('redistributeNetworkAllocation'));
  assert.ok(page.includes('setNetworkAllocationFor(model.competence, allocation)'));
  assert.ok(page.includes('Redistribuir proporcional'));
});
