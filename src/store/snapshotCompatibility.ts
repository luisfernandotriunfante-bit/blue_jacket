import type { CanonicalState } from '../domain/canonical';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';

export const STALE_ITEM_SNAPSHOT_NOTICE = 'A fotografia salva foi descartada porque foi criada pela versão que podia interpretar a filial 11 do Cadastro 286 como código de produto. Recarregue Cadastro 286 + Posição 105; na mesma reconstrução, carregue também PCTABPR e Lista de Preço Colgate para restaurar preço e embalagem industrial.';

export function getCanonicalSnapshotCompatibilityIssue(state: CanonicalState | null | undefined): string {
  if (!state) return '';
  if (!isUnifiedCanonicalState(state)) return 'A fotografia salva pertence a uma arquitetura anterior e foi descartada. Reprocesse as fontes pela Base Unificada atual.';

  const layer = state.unified;
  const sourceTypes = new Set(layer.sources.map(source => source.sourceType));
  const has286 = sourceTypes.has('286');
  const has105 = sourceTypes.has('105');
  if (!has286 || !has105) return '';

  const unresolved105 = layer.qualityIssues.filter(issue => issue.code === 'STOCK_105_CODE_NOT_IN_ITEM_MASTER').length;
  const branchElevenAsProduct = layer.items.some(item => item.winthorCode === '11' && item.sourceKeys?.['286'] === '11');
  const identifiedWinthorItems = layer.items.filter(item => item.hasWinthor && /^\d+$/.test(item.winthorCode)).length;

  // Assinatura observada no snapshot defeituoso: a filial 11 vira o único/few códigos Winthor
  // enquanto dezenas ou centenas de linhas do 105 ficam sem ITEM_MASTER. Não usamos apenas o
  // código 11 como evidência, porque ele poderia existir legitimamente em outro cadastro.
  if (branchElevenAsProduct && unresolved105 >= 25 && identifiedWinthorItems <= 20) return STALE_ITEM_SNAPSHOT_NOTICE;
  return '';
}
