import { DEFAULT_STOCK_ALERT_CONFIGURATION } from '../domain/stockModel';
import type { StockAlertConfiguration } from '../domain/stockModel';

export interface StockPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'bj_stock_alerts:';

const nullableNonNegative = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : null;
};

export function normalizeStockAlertConfiguration(value: Partial<StockAlertConfiguration> | null | undefined): StockAlertConfiguration {
  const source = value || {};
  return {
    zeroStockAsRupture: source.zeroStockAsRupture === true,
    riskCoverageDays: nullableNonNegative(source.riskCoverageDays),
    lowCoverageDays: nullableNonNegative(source.lowCoverageDays),
    excessCoverageDays: nullableNonNegative(source.excessCoverageDays),
  };
}

export function stockPreferenceKey(competence: string): string {
  return /^\d{4}-\d{2}$/.test(competence) ? `${PREFIX}${competence}` : `${PREFIX}global`;
}

export function loadStockAlertConfiguration(storage: StockPreferenceStorage, competence: string): StockAlertConfiguration {
  try {
    const raw = storage.getItem(stockPreferenceKey(competence));
    return raw ? normalizeStockAlertConfiguration(JSON.parse(raw)) : { ...DEFAULT_STOCK_ALERT_CONFIGURATION };
  } catch {
    return { ...DEFAULT_STOCK_ALERT_CONFIGURATION };
  }
}

export function saveStockAlertConfiguration(storage: StockPreferenceStorage, competence: string, configuration: StockAlertConfiguration): StockAlertConfiguration {
  const normalized = normalizeStockAlertConfiguration(configuration);
  storage.setItem(stockPreferenceKey(competence), JSON.stringify(normalized));
  return normalized;
}
