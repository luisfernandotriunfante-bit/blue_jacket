import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConsolidatedPortfolioRows, hasPendingPortfolio, prioritizeStockAlerts } from '../src/domain/stockUi.ts';
import type { StockAlert } from '../src/domain/stockModelCore.ts';

function alert(id: string, severity: StockAlert['severity']): StockAlert {
  return { id, kind: 'SEM_EAN', severity, sku: id, ean: '', product: id, message: id };
}

test('presença na Carteira considera unidades ou caixas', () => {
  assert.equal(hasPendingPortfolio({ pendingUnits: 0, pendingCases: 2 }), true);
  assert.equal(hasPendingPortfolio({ pendingUnits: 12, pendingCases: 0 }), true);
  assert.equal(hasPendingPortfolio({ pendingUnits: 0, pendingCases: 0 }), false);
});

test('central de alertas prioriza críticos antes do corte visual', () => {
  const alerts = [alert('info', 'info'), alert('warning', 'warning'), alert('critical', 'critical')];
  assert.deepEqual(prioritizeStockAlerts(alerts, 2).map(item => item.id), ['critical', 'warning']);
  assert.deepEqual(alerts.map(item => item.id), ['info', 'warning', 'critical']);
});

test('carga mista de Carteira mantém aviso enquanto existir linha consolidada', () => {
  assert.equal(hasConsolidatedPortfolioRows([{ sourceRow: 10 }, {}]), true);
  assert.equal(hasConsolidatedPortfolioRows([{ sourceRow: 10 }, { sourceRow: 11 }]), false);
  assert.equal(hasConsolidatedPortfolioRows([{}]), true);
});
