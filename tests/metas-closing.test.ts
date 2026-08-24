import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redistributeNetworkTotal, redistributeSingleNetwork, sumNetworkTargets } from '../src/domain/targetRules.ts';

const page = () => readFileSync('src/pages/MetasPage.tsx', 'utf8');
const canonical = () => readFileSync('src/domain/canonical.ts', 'utf8');
const persistence = () => readFileSync('src/store/competencePersistence.ts', 'utf8');

test('Metas distribui Meta Redes Geral por todas as redes reais e nunca por SEM REDE', () => {
  const source = page();
  assert.match(source, /canonical\.networks\.filter\(network => network\.key !== 'SEM REDE'\)/);
  assert.doesNotMatch(source, /network\.topTarget > 0 \|\| network\.networkTarget > 0/);
  assert.match(source, /SEM REDE nunca recebe meta/);
});

test('primeira Meta Redes Geral fecha exatamente mesmo quando todas as redes começam zeradas', () => {
  const rows = [
    { key: 'A', target: 0 },
    { key: 'B', target: 0 },
    { key: 'C', target: 0 },
  ];
  const next = redistributeNetworkTotal(rows, 900);
  assert.deepEqual(next, { A: 300, B: 300, C: 300 });
  assert.equal(sumNetworkTargets(next), 900);
});

test('edição individual não cria Meta Redes Geral quando o total ainda é zero', () => {
  const rows = [
    { key: 'A', target: 0 },
    { key: 'B', target: 0 },
  ];
  const next = redistributeSingleNetwork(rows, 'A', 500);
  assert.deepEqual(next, { A: 0, B: 0 });
  assert.equal(sumNetworkTargets(next), 0);
});

test('edição individual continua preservando o total e redistribuindo o saldo', () => {
  const rows = [
    { key: 'A', target: 600 },
    { key: 'B', target: 300 },
    { key: 'C', target: 100 },
  ];
  const next = redistributeSingleNetwork(rows, 'A', 700);
  assert.equal(next.A, 700);
  assert.equal(next.B, 225);
  assert.equal(next.C, 75);
  assert.equal(sumNetworkTargets(next), 1000);
});

test('Meta T&C zero continua significando não informada também na apresentação de Metas', () => {
  const source = page();
  assert.match(source, /const hasSellOutTarget = canonical\.sellOut\.sellOutTarget > 0/);
  assert.match(source, /metricValue=\{hasSellOutTarget \? brl\(canonical\.sellOut\.sellOutTarget\) : '—'\}/);
  assert.match(source, /Meta atual: \{hasSellOutTarget \? brl/);
  assert.match(canonical(), /Zero significa explicitamente \"não informada\"/);
});

test('Metas diferencia fonte oficial ausente de valor oficial zero', () => {
  const source = page();
  assert.match(source, /source\.kind === 'compassTargets' && source\.loaded/);
  assert.match(source, /source\.kind === 'activeRoute' && source\.loaded/);
  assert.match(source, /Meta da indústria e meta de positivação permanecem indisponíveis; o sistema não assume zero/);
  assert.match(source, /A Meta Tops permanece indisponível; o sistema não assume zero/);
  assert.match(source, /hasCompassTargets \? brl\(canonical\.industryTarget\) : '—'/);
  assert.match(source, /hasActiveRoute \? brl\(topTotal\) : '—'/);
});

test('parcela da Bússola sem RCA resolvido permanece indústria e fica visível sem redistribuição', () => {
  const source = page();
  assert.match(source, /assignedSalesTarget = canonical\.vendors\.reduce/);
  assert.match(source, /unassignedSalesTarget = Math\.max\(canonical\.industryTarget - assignedSalesTarget, 0\)/);
  assert.match(source, /Meta vendas sem RCA resolvido/);
  assert.match(source, /não é redistribuída artificialmente entre vendedores/);
});

test('falha de persistência manual é visível na própria aba que afirma salvar as metas', () => {
  const source = page();
  assert.match(source, /configurationWarning = canonical\.warnings\.find/);
  assert.match(source, /não deve ser considerada salva até a persistência voltar a funcionar/);
  assert.match(persistence(), /MANUAL_CONFIG_PREFIX='bj_manual_config:'/);
  assert.match(persistence(), /saveManualConfiguration/);
});

test('calendário de Metas expõe o efeito real sobre dias úteis', () => {
  const source = page();
  assert.match(source, /Dias úteis do mês/);
  assert.match(source, /canonical\.sellOut\.businessDaysTotal/);
  assert.match(source, /Dias úteis decorridos/);
  assert.match(source, /canonical\.sellOut\.businessDaysElapsed/);
  assert.match(source, /Dias úteis restantes/);
  assert.match(source, /canonical\.sellOut\.businessDaysRemaining/);
});

test('distribuição das linhas continua transparente quando não fecha 100%', () => {
  const source = page();
  assert.match(source, /Math\.abs\(lineTotal - 1\) >= 0\.0001/);
  assert.match(source, /Para distribuir integralmente a Meta T&C, o total deve fechar em 100%/);
});
