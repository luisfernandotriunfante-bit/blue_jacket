import type { StockAlert } from './stockModelCore';

export function hasPendingPortfolio(item: { pendingUnits: number; pendingCases: number }) {
  return Number(item.pendingUnits) > 0 || Number(item.pendingCases) > 0;
}

const alertSeverityRank: Record<StockAlert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function prioritizeStockAlerts(alerts: StockAlert[], limit = 30) {
  const safeLimit = Math.max(Math.trunc(Number(limit) || 0), 0);
  return [...alerts]
    .sort((left, right) => alertSeverityRank[left.severity] - alertSeverityRank[right.severity])
    .slice(0, safeLimit);
}

export function hasConsolidatedPortfolioRows(movements: Array<{ sourceRow?: number }>) {
  return movements.some(movement => !(Number(movement.sourceRow) > 0));
}
