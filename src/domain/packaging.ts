export type UnitsPerCaseSource = '105_DERIVED' | 'PRICE_LIST' | 'TABELA_OFICIAL' | 'UNKNOWN' | 'CONFLICT';

export interface PackagingCandidate {
  source: Exclude<UnitsPerCaseSource, 'UNKNOWN' | 'CONFLICT'>;
  value: number;
}

export interface PackagingResolution {
  unitsPerCase: number;
  source: UnitsPerCaseSource;
  candidates: PackagingCandidate[];
  conflict: boolean;
  note: string;
}

const FACTOR_TOLERANCE = 0.001;

export function packagingFactorsAgree(left: number, right: number): boolean {
  return Math.abs(Number(left) - Number(right)) <= FACTOR_TOLERANCE;
}

/**
 * No relatório 105, MASTER representa a quantidade equivalente de masters/caixas,
 * não "unidades por caixa". Portanto, quando há saldo físico, o fator é derivado
 * de Qt.Est. / Master. O fator físico precisa fechar em um inteiro dentro da
 * precisão do relatório; fora disso a origem é desconhecida e o motor não inventa.
 */
export function deriveUnitsPerCaseFrom105(quantityValue: unknown, masterEquivalentValue: unknown): PackagingResolution {
  const quantity = Number(quantityValue);
  const masterEquivalent = Number(masterEquivalentValue);
  if (!Number.isFinite(quantity) || !Number.isFinite(masterEquivalent) || quantity <= 0 || masterEquivalent <= 0) {
    return { unitsPerCase: 0, source: 'UNKNOWN', candidates: [], conflict: false, note: '105 sem Qt.Est. e Master positivos suficientes para derivar o fator.' };
  }

  const raw = quantity / masterEquivalent;
  const rounded = Math.round(raw);
  const reconstructed = rounded * masterEquivalent;
  const absoluteTolerance = Math.max(0.01, Math.abs(quantity) * 1e-6);
  if (!Number.isFinite(raw) || rounded <= 0 || Math.abs(reconstructed - quantity) > absoluteTolerance) {
    return { unitsPerCase: 0, source: 'UNKNOWN', candidates: [], conflict: false, note: `105 não fecha um fator físico inteiro: Qt.Est ${quantity} / Master ${masterEquivalent} = ${raw}.` };
  }

  return {
    unitsPerCase: rounded,
    source: '105_DERIVED',
    candidates: [{ source: '105_DERIVED', value: rounded }],
    conflict: false,
    note: `105_DERIVED: ${quantity} / ${masterEquivalent} = ${rounded} Un/CX.`,
  };
}

export function resolvePackagingCandidates(candidates: PackagingCandidate[]): PackagingResolution {
  const valid = candidates.filter(candidate => Number.isFinite(candidate.value) && candidate.value > 0);
  if (!valid.length) return { unitsPerCase: 0, source: 'UNKNOWN', candidates: [], conflict: false, note: 'Fator de embalagem não identificado em fonte comprovada.' };

  const first = valid[0];
  const conflicting = valid.some(candidate => !packagingFactorsAgree(candidate.value, first.value));
  if (conflicting) {
    return {
      unitsPerCase: 0,
      source: 'CONFLICT',
      candidates: valid,
      conflict: true,
      note: `Fontes comprovadas divergem: ${valid.map(candidate => `${candidate.source}=${candidate.value}`).join(' | ')}. Conversão bloqueada.`,
    };
  }

  return {
    unitsPerCase: first.value,
    source: first.source,
    candidates: valid,
    conflict: false,
    note: valid.length > 1 ? `Fontes comprovadas concordam em ${first.value} Un/CX.` : `${first.source}: ${first.value} Un/CX.`,
  };
}
