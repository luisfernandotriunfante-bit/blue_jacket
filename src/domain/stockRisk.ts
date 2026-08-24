export type StockRiskStatus = 'ruptura' | 'risco' | 'ok' | 'sem-giro' | 'sem-winthor';

export type StockRiskInput = {
  hasWinthor: boolean | undefined;
  quantity: number;
  soldUnits: number;
  coverageDays: number | null;
  pendingQty: number;
  pendingCases?: number;
  coverageTargetDays: number;
};

/**
 * Classificação de ruptura definida para a visão de estoque:
 * - SEM WINTHOR: item sem código Winthor confirmado;
 * - RUPTURA: item Winthor com estoque zerado;
 * - SEM GIRO: há estoque, mas não houve saída faturada suficiente para calcular cobertura;
 * - RISCO: cobertura abaixo da meta e sem o item na carteira Colgate;
 * - OK: demais itens com giro.
 *
 * A existência de Carteira é factual mesmo quando o Un/CX indústria ainda não permite
 * convertê-la em unidades. Por isso pendingCases também impede classificar o SKU como risco.
 */
export function classifyStockRisk(input: StockRiskInput): StockRiskStatus {
  if (input.hasWinthor !== true) return 'sem-winthor';

  const quantity = Math.max(Number(input.quantity) || 0, 0);
  if (quantity <= 0) return 'ruptura';

  const soldUnits = Math.max(Number(input.soldUnits) || 0, 0);
  if (soldUnits <= 0 || input.coverageDays === null || !Number.isFinite(input.coverageDays)) return 'sem-giro';

  const coverageTargetDays = Math.max(Number(input.coverageTargetDays) || 0, 0);
  const pendingQty = Math.max(Number(input.pendingQty) || 0, 0);
  const pendingCases = Math.max(Number(input.pendingCases) || 0, 0);
  const hasPendingPortfolio = pendingQty > 0 || pendingCases > 0;

  if (coverageTargetDays > 0 && input.coverageDays < coverageTargetDays && !hasPendingPortfolio) return 'risco';
  return 'ok';
}

export function stockRiskLabel(status: StockRiskStatus): string {
  if (status === 'ruptura') return 'RUPTURA';
  if (status === 'risco') return 'RISCO';
  if (status === 'sem-giro') return 'SEM GIRO';
  if (status === 'sem-winthor') return 'SEM WINTHOR';
  return 'OK';
}
