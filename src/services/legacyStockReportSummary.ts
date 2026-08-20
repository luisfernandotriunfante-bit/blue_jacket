import type { CanonicalState } from '../domain/canonical';
import { buildLegacyStockReportRows } from './legacyStockReport';

export interface LegacyStockReportSummary {
  skuWinthorCount: number;
  launchCount: number;
  stock8013Loaded: boolean;
}

/**
 * Resume exatamente o mesmo conjunto de linhas usado pelo relatório antigo.
 * Isso evita que a tela de Documentos consulte o inventory cru e mostre um
 * número de lançamentos diferente do Excel efetivamente gerado.
 */
export function summarizeLegacyStockReport(state: CanonicalState): LegacyStockReportSummary {
  const rows = buildLegacyStockReportRows(state);
  return {
    skuWinthorCount: rows.length,
    launchCount: rows.filter(row => row.launch === 'X').length,
    stock8013Loaded: state.sources.some(source => source.kind === 'stock8013' && source.loaded),
  };
}
