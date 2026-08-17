import type { CanonicalHistoryMonth, CanonicalHistorySummary } from '../../domain/canonical';

const rowPattern = /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\S+)\s+(\d{8})\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+(\d+)\s+(\d+)\s+/;

function brNumber(value: string): number {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parse379History(text: string): CanonicalHistoryMonth[] {
  const months = new Map<string, CanonicalHistoryMonth>();
  for (const line of text.split(/\r?\n/)) {
    const match = rowPattern.exec(line);
    if (!match) continue;
    const [, date,,,, valueRaw,, operation, cfop] = match;
    const [day, monthRaw, yearRaw] = date.split('/');
    if (!day || !monthRaw || !yearRaw) continue;
    const year = Number(yearRaw); const month = Number(monthRaw); const key = `${year}-${String(month).padStart(2, '0')}`;
    const value = brNumber(valueRaw);
    const current = months.get(key) || { key, year, month, value: 0, grossSales: 0, returns: 0 };

    // Regra validada contra o Painel Sell Out de julho/26:
    // vendas CFOP 5102/5403 menos devoluções CFOP 1202/1411,
    // sem descontar a operação 13202.
    if (cfop === '5102' || cfop === '5403') {
      current.grossSales += value;
      current.value += value;
    } else if ((cfop === '1202' || cfop === '1411') && operation !== '13202') {
      current.returns += value;
      current.value -= value;
    }
    months.set(key, current);
  }
  return Array.from(months.values()).filter(month => month.grossSales > 0 || month.returns > 0).sort((a, b) => a.key.localeCompare(b.key));
}

export function mergeHistoryMonths(previous: CanonicalHistoryMonth[] = [], incoming: CanonicalHistoryMonth[] = []): CanonicalHistoryMonth[] {
  const merged = new Map(previous.map(month => [month.key, month]));
  incoming.forEach(month => merged.set(month.key, month));
  return Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function buildHistorySummary(referenceDate: string, months: CanonicalHistoryMonth[]): CanonicalHistorySummary {
  const ref = new Date(`${referenceDate}T12:00:00`);
  const year = ref.getFullYear(); const month = ref.getMonth() + 1;
  const byKey = new Map(months.map(item => [item.key, item]));
  const lastYearKey = `${year - 1}-${String(month).padStart(2, '0')}`;
  const sameMonthLastYear = byKey.get(lastYearKey)?.value ?? null;

  const previousKeys: string[] = [];
  for (let offset = 1; offset <= 3; offset++) {
    const date = new Date(year, month - 1 - offset, 1);
    previousKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  const previousValues = previousKeys.map(key => byKey.get(key)?.value).filter((value): value is number => typeof value === 'number');
  const average3ClosedMonths = previousValues.length === 3 ? previousValues.reduce((sum, value) => sum + value, 0) / 3 : null;

  return { months, sameMonthLastYear, sameMonthLastYearKey: lastYearKey, average3ClosedMonths, average3MonthKeys: previousKeys };
}
