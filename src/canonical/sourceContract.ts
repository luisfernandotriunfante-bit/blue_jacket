import { SOURCE_IDS } from './parsers';

export const SOURCE_CONTRACT_VERSION = 'v2' as const;
export const SUPPORTED_SOURCE_IDS = [...new Set(SOURCE_IDS)];

export const HARD_REQUIRED_SOURCE_IDS = [
  '379 25.txt',
  '379 26.txt',
  '310 total 2026.txt',
  '12.322.txt',
  'cadastro-itens-286.xls',
  'posicao-estoque-105.xls',
  'estoque-8013.xls',
  'pctabpr 13.xlsx',
  'Lista_de_Preco (8).xlsx',
  "Sortimento Recomendado - Q3'26.xlsx",
  'Nova Base de Premissas - Q3.xlsx',
  'relatorio_carteira_clientes.xls',
  'vendas-8022.xls',
  'CARTEIRA 24.08.xlsx',
  'entrada-notas-218.xls',
] as const;

export const REPLACEABLE_SOURCE_IDS = [
  'NOVOS RCAS.xlsx',
  'lançamentos.xlsx',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx",
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx',
] as const;

/** Compatibility contract only. v21 build logic must not treat this as universal truth. */
export const LEGACY_V20_REQUIRED_SOURCE_IDS = [...SUPPORTED_SOURCE_IDS];

export const SOURCE_LABELS: Record<string, string> = {
  'cadastro-itens-286.xls': 'Cadastro de itens 286',
  'posicao-estoque-105.xls': 'Posição de estoque 105',
  'estoque-8013.xls': 'Estoque / logística 8013',
  'pctabpr 13.xlsx': 'PCTABPR',
  'Lista_de_Preco (8).xlsx': 'Lista de Preço',
  'lançamentos.xlsx': 'Lançamentos',
  "Sortimento Recomendado - Q3'26.xlsx": 'Sortimento Q3',
  'Nova Base de Premissas - Q3.xlsx': 'Premissas',
  'NOVOS RCAS.xlsx': 'Novos RCAs',
  'relatorio_carteira_clientes.xls': 'Carteira / Base de Clientes',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'Roteiro Top',
  'vendas-8022.xls': 'Vendas 8022',
  'CARTEIRA 24.08.xlsx': 'Carteira Colgate',
  'entrada-notas-218.xls': 'Recebimentos 218',
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx': 'Bússola',
  '379 25.txt': '379 — 2025',
  '379 26.txt': '379 — 2026',
  '310 total 2026.txt': '310 total 2026',
  '12.322.txt': '12.322',
};

export type SupportedSourceId = typeof SUPPORTED_SOURCE_IDS[number];
export type HardRequiredSourceId = typeof HARD_REQUIRED_SOURCE_IDS[number];
export type ReplaceableSourceId = typeof REPLACEABLE_SOURCE_IDS[number];
export type SourceReplacementScope = 'GLOBAL' | `COMPETENCE:${string}`;

const hard = new Set<string>(HARD_REQUIRED_SOURCE_IDS);
const replaceable = new Set<string>(REPLACEABLE_SOURCE_IDS);

export const isHardRequiredSource = (source: string): source is HardRequiredSourceId => hard.has(source);
export const isReplaceableSource = (source: string): source is ReplaceableSourceId => replaceable.has(source);

export function sourceScopeFor(source: string, competence: string | null): SourceReplacementScope | null {
  if (source === 'NOVOS RCAS.xlsx' || source === 'lançamentos.xlsx') return 'GLOBAL';
  if ((source === "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx" || source === 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx') && competence && /^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return `COMPETENCE:${competence}`;
  return null;
}

export function sourceContractIntegrity() {
  const supported = [...SUPPORTED_SOURCE_IDS].sort();
  const union = [...HARD_REQUIRED_SOURCE_IDS, ...REPLACEABLE_SOURCE_IDS].sort();
  return {
    supportedCount: supported.length,
    hardRequiredCount: HARD_REQUIRED_SOURCE_IDS.length,
    replaceableCount: REPLACEABLE_SOURCE_IDS.length,
    unionMatchesSupported: JSON.stringify(supported) === JSON.stringify(union),
    duplicateUnionEntries: union.length - new Set(union).size,
    labelsCoverSupported: SUPPORTED_SOURCE_IDS.every(source => Boolean(SOURCE_LABELS[source])),
  };
}
