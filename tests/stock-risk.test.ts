import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyStockRisk } from '../src/domain/stockRisk.ts';

test('item sem Winthor não entra como ruptura', () => {
  assert.equal(classifyStockRisk({ hasWinthor:false, quantity:0, soldUnits:100, coverageDays:0, pendingQty:20, coverageTargetDays:15 }), 'sem-winthor');
});

test('estoque zerado com Winthor é ruptura', () => {
  assert.equal(classifyStockRisk({ hasWinthor:true, quantity:0, soldUnits:0, coverageDays:null, pendingQty:0, coverageTargetDays:15 }), 'ruptura');
});

test('item com estoque mas sem saída faturada fica sem giro', () => {
  assert.equal(classifyStockRisk({ hasWinthor:true, quantity:50, soldUnits:0, coverageDays:null, pendingQty:0, coverageTargetDays:15 }), 'sem-giro');
});

test('cobertura abaixo da meta e sem carteira é risco', () => {
  assert.equal(classifyStockRisk({ hasWinthor:true, quantity:100, soldUnits:200, coverageDays:5, pendingQty:0, coverageTargetDays:15 }), 'risco');
});

test('carteira Colgate remove o item da classificação de risco', () => {
  assert.equal(classifyStockRisk({ hasWinthor:true, quantity:100, soldUnits:200, coverageDays:5, pendingQty:12, coverageTargetDays:15 }), 'ok');
});

test('cobertura igual ou acima da meta é OK', () => {
  assert.equal(classifyStockRisk({ hasWinthor:true, quantity:100, soldUnits:100, coverageDays:15, pendingQty:0, coverageTargetDays:15 }), 'ok');
});

test('filtro de risco continua independente do filtro de catálogo na tela reformulada', () => {
  const source = readFileSync(new URL('../src/pages/EstoquePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const \[activeFilter, setActiveFilter\]/);
  assert.match(source, /const \[statusFilter, setStatusFilter\]/);
  assert.match(source, /activeFilter === 'lancamento' && !product\.isLaunch/);
  assert.match(source, /statusFilter !== 'todos'/);
  assert.match(source, /riskStatusByCode\.get\(product\.code\) !== statusFilter/);
});
