import type { AdminRegistryState, LaunchRegistryRecord, TopRetailRegistryRecord } from './adminRegistry';
import { diagnoseLaunchRecords, diagnoseRcaRecords, diagnoseTopRetailRecords } from './adminRegistry';
import { resolveLaunchAuthority, resolveTopAuthority } from './adminRegistryAuthority';
import { competenceFromParsedSource, isValidCompetenceId } from './competence';
import { SOURCE_IDS } from './parsers';
import { createRcaResolver, rcaMasterEntries, type RcaResolution } from './rcaResolver';
import { REQUIRED_SOURCE_IDS, SOURCE_LABELS } from './sourceImport';
import { BUSSOLA_SOURCE_ID, materializeEffectiveTargetFacts, resolveTargetAuthority } from './targetAuthority';
import type { TargetState } from './targetStore';
import type { ParsedSource, RawTyped } from './types';

export const SUPPORTED_SOURCE_IDS = [...new Set(SOURCE_IDS)];

export type SourceConsumer =
  | 'M1' | 'M2' | 'M3' | 'M4'
  | 'STOCK' | 'SELL_OUT' | 'NETWORKS' | 'PRODUCTS' | 'LAUNCHES' | 'SORTIMENT'
  | 'PORTFOLIO' | 'RECEIPTS' | 'PRICING' | 'ADMIN_SEED';
export type SourceCapability =
  | 'ITEM_IDENTITY' | 'CURRENT_STOCK' | 'STOCK_DIAGNOSTIC' | 'LOGISTICS' | 'PRICE'
  | 'SORTIMENT' | 'CUSTOMER_MASTER' | 'COMMERCIAL_CLASSIFICATION' | 'RCA_RESOLUTION'
  | 'LAUNCH_CLASSIFICATION' | 'TOP_RETAIL_ROUTE' | 'SELL_OUT_MOVEMENT' | 'INBOUND_PORTFOLIO'
  | 'RECEIPTS' | 'HISTORICAL_MOVEMENT' | 'HISTORICAL_CUSTOMER_PRODUCT' | 'RCA_TARGETS';
export type SourceReplacementAuthority = 'AdminRegistry.RCAs' | 'AdminRegistry.Lançamentos' | 'AdminRegistry.TopRetailers' | 'TargetState.RcaTargets';
export type SourceDiagnosticClassification = 'HARD_REQUIRED' | 'REPLACEABLE_CANDIDATE' | 'SAFE_ENRICHMENT_CANDIDATE' | 'UNRESOLVED_DEPENDENCY';
export type SourceRequirement = 'REQUIRED_CURRENT';
export type SourceDependencyContract = {
  id: string;
  label: string;
  parser: string;
  stagingFields: string[];
  motors: Array<'M1' | 'M2' | 'M3' | 'M4'>;
  resolvers: string[];
  consumers: SourceConsumer[];
  capabilities: SourceCapability[];
  currentRequirement: SourceRequirement;
  replacementCandidate: boolean;
  replacementAuthority: SourceReplacementAuthority | null;
  replacementScope: string | null;
  defaultClassification: SourceDiagnosticClassification;
  fallback: string | null;
  consequenceIfMissing: string;
  notes: string;
};

type ContractInput = Omit<SourceDependencyContract, 'label' | 'currentRequirement'> & { label?: string };
const contract = (input: ContractInput): SourceDependencyContract => ({
  ...input,
  label: input.label ?? SOURCE_LABELS[input.id] ?? input.id,
  currentRequirement: 'REQUIRED_CURRENT',
});
const hard = (input: Omit<ContractInput, 'replacementCandidate' | 'replacementAuthority' | 'replacementScope' | 'defaultClassification'>): SourceDependencyContract => contract({
  ...input,
  replacementCandidate: false,
  replacementAuthority: null,
  replacementScope: null,
  defaultClassification: 'HARD_REQUIRED',
});
const candidate = (input: Omit<ContractInput, 'replacementCandidate' | 'defaultClassification'> & { replacementAuthority: SourceReplacementAuthority; replacementScope: string }): SourceDependencyContract => contract({
  ...input,
  replacementCandidate: true,
  defaultClassification: 'UNRESOLVED_DEPENDENCY',
});

const history379 = (id: '379 25.txt' | '379 26.txt', year: string) => hard({
  id, parser: 'parse379',
  stagingFields: ['movement_date', 'invoice_number', 'legacy_product_code', 'quantity_raw', 'value_raw', 'discount_raw', 'operation_code', 'cfop', 'customer_document', 'legacy_rca_code', 'net_weight', 'gross_weight', 'movement_class'],
  motors: ['M4'], resolvers: ['createRcaResolver.resolveLegacy'], consumers: ['M4', 'STOCK', 'PRODUCTS'], capabilities: ['HISTORICAL_MOVEMENT'],
  fallback: null,
  consequenceIfMissing: `Histórico transacional de ${year} deixa de existir; ausência não equivale a movimento zero.`,
  notes: `M4 materializa TRANSACTION_379 de ${year}.`,
});

const CONTRACTS: SourceDependencyContract[] = [
  history379('379 25.txt', '2025'),
  history379('379 26.txt', '2026'),
  hard({ id: '310 total 2026.txt', parser: 'parse310', stagingFields: ['legacy_product_code', 'purchase_count', 'purchase_net_weight', 'purchase_value', 'bonus_value', 'discount_value', 'return_value', 'customer_document', 'seller_code_legacy', 'group_code'], motors: ['M4'], resolvers: ['createRcaResolver.resolveLegacy'], consumers: ['M4', 'STOCK', 'PRODUCTS'], capabilities: ['HISTORICAL_CUSTOMER_PRODUCT'], fallback: null, consequenceIfMissing: 'Agregados YTD CNPJ×produto e RCA legado deixam de estar disponíveis.', notes: 'M4 materializa AGG_310.' }),
  hard({ id: '12.322.txt', parser: 'parse12322File', stagingFields: ['invoice_raw', 'invoice_issue_date', 'accounting_date', 'supplier_document', 'supplier_name', 'operation_code', 'invoice_value', 'discount', 'order_number'], motors: ['M4'], resolvers: [], consumers: ['M4', 'RECEIPTS', 'STOCK', 'PRODUCTS'], capabilities: ['RECEIPTS'], fallback: null, consequenceIfMissing: 'Histórico de recebimentos por NF deixa de participar da conciliação; ausência não equivale a zero recebido.', notes: 'M4 materializa RECEIPT_12322.' }),
  hard({ id: 'cadastro-itens-286.xls', parser: 'parse286File', stagingFields: ['winthor_code', 'internal_ean', 'manufacturer_code', 'description_286', 'pack_286', 'physical_286', 'blocked_286', 'reserved_286', 'available_286'], motors: ['M1'], resolvers: [], consumers: ['M1', 'STOCK', 'PRODUCTS', 'LAUNCHES'], capabilities: ['ITEM_IDENTITY', 'STOCK_DIAGNOSTIC'], fallback: '105 participa da base de itens, mas não substitui integralmente a identidade/atributos do 286.', consequenceIfMissing: 'Identidade Winthor/EAN/fabricante pode ficar incompleta ou incorreta.', notes: 'Uma das bases de item do M1 e identidade interna principal.' }),
  hard({ id: 'posicao-estoque-105.xls', parser: 'mergedReport', stagingFields: ['winthor_code', 'physical_stock_units', 'unit_cost_real', 'sale_price_105', 'pack_105'], motors: ['M1'], resolvers: [], consumers: ['M1', 'STOCK', 'PRODUCTS'], capabilities: ['CURRENT_STOCK'], fallback: null, consequenceIfMissing: 'Estoque físico e custo atuais ficam desconhecidos; zero não é substituto válido.', notes: 'Fonte direta de physical_stock_units e custo no M1.' }),
  hard({ id: 'estoque-8013.xls', parser: 'tabular', stagingFields: ['ean13', 'dun14', 'description_8013', 'category_8013', 'subbrand_8013', 'unit_weight_kg', 'case_weight_kg', 'stock_units_8013', 'stock_cases_8013', 'stock_weight_kg'], motors: ['M1'], resolvers: [], consumers: ['M1', 'STOCK', 'PRODUCTS'], capabilities: ['LOGISTICS', 'STOCK_DIAGNOSTIC'], fallback: 'Alguns atributos têm fallback de Sortimento/Lista, mas logística e diagnóstico 8013 não.', consequenceIfMissing: 'Logística/pesos e diagnóstico de estoque 8013 ficam indisponíveis; não devem virar fatos zero.', notes: 'M1 cruza 8013 por GTIN e prioriza categoria/subbrand quando disponível.' }),
  hard({ id: 'pctabpr 13.xlsx', parser: 'tabular', stagingFields: ['codprod', 'pvenda1', 'pvenda', 'vlst'], motors: ['M1'], resolvers: [], consumers: ['M1', 'PRICING', 'PRODUCTS', 'STOCK'], capabilities: ['PRICE'], fallback: null, consequenceIfMissing: 'Preços Winthor região 11 e ST ficam desconhecidos.', notes: 'M1 materializa pVenda1_region11, pVenda e vlSt.' }),
  hard({ id: 'Lista_de_Preco (8).xlsx', parser: 'tabular', stagingFields: ['sku', 'ean', 'dun_14', 'descricao_padrao', 'un_cx', 'cx_pal', 'preco_base'], motors: ['M1'], resolvers: [], consumers: ['M1', 'PRICING', 'PRODUCTS', 'STOCK', 'LAUNCHES'], capabilities: ['ITEM_IDENTITY', 'LOGISTICS', 'PRICE'], fallback: null, consequenceIfMissing: 'Masterdata/preço indústria e conversão caixa podem ficar desconhecidos.', notes: 'M1 cruza por EAN/SKU e materializa identidade indústria, Un/Cx e preço base.' }),
  candidate({ id: 'lançamentos.xlsx', parser: 'tabular', stagingFields: ['launch_winthor_code', 'launch_ean', 'launch_description', 'launch_type', 'launch_status'], motors: ['M1'], resolvers: ['resolveLaunchAuthority'], consumers: ['M1', 'PRODUCTS', 'LAUNCHES', 'ADMIN_SEED'], capabilities: ['LAUNCH_CLASSIFICATION'], replacementAuthority: 'AdminRegistry.Lançamentos', replacementScope: 'EAN/Winthor, is_launch e launch_status; Registry pode materializar lançamento ainda sem catálogo.', fallback: 'AdminRegistry.Lançamentos quando a cobertura efetiva é equivalente.', consequenceIfMissing: 'Sem Registry equivalente, ausência da planilha não significa “não lançamento”; capability fica desconhecida/degradada.', notes: 'MANUAL → SOURCE_SEED → fonte física.' }),
  hard({ id: "Sortimento Recomendado - Q3'26.xlsx", parser: 'parseSortimentoFile', stagingFields: ['ean', 'ean_novo', 'ean_antigo', 'winthor_code_sortiment', 'industry_code_sortiment', 'lifecycle_status', 'category', 'brand', 'subbrand', 'segment', 'subsegment', 'contents', 'amount', 'sortimentDataset'], motors: ['M1'], resolvers: [], consumers: ['M1', 'SORTIMENT', 'PRODUCTS', 'LAUNCHES'], capabilities: ['SORTIMENT'], fallback: null, consequenceIfMissing: 'Classificação de sortimento/canais/lifecycle fica desconhecida.', notes: 'M1 escolhe o dataset de maior prioridade por EAN/Winthor/código indústria.' }),
  hard({ id: 'Nova Base de Premissas - Q3.xlsx', parser: 'tabular', stagingFields: ['customer_document_declared', 'customer_name_premise', 'state', 'environment', 'profile'], motors: ['M2'], resolvers: [], consumers: ['M2', 'SELL_OUT', 'NETWORKS'], capabilities: ['CUSTOMER_MASTER', 'COMMERCIAL_CLASSIFICATION'], fallback: null, consequenceIfMissing: 'Universo/classificação comercial de clientes do M2 deixa de ser materializado.', notes: 'Linha-base do M2; Carteira de Clientes complementa cadastro/relação RCA.' }),
  candidate({ id: 'NOVOS RCAS.xlsx', parser: 'tabular', stagingFields: ['current_rca_code_principal', 'legacy_rca_code_principal', 'rca_name_raw_principal', 'coordinator_code_principal', 'coordinator_name_principal', 'current_rca_code_auxiliar', 'legacy_rca_code_auxiliar', 'rca_name_raw_auxiliar', 'coordinator_code_auxiliar', 'coordinator_name_auxiliar'], motors: ['M2', 'M3', 'M4'], resolvers: ['createRcaResolver'], consumers: ['M2', 'M3', 'M4', 'SELL_OUT', 'NETWORKS', 'ADMIN_SEED'], capabilities: ['RCA_RESOLUTION'], replacementAuthority: 'AdminRegistry.RCAs', replacementScope: 'RCA current/legacy, Principal/Auxiliar, coordenador e vigência.', fallback: 'AdminRegistry.RCAs quando a resolução efetiva com/sem fonte é idêntica.', consequenceIfMissing: 'Sem Registry equivalente, RCA current/legacy pode ficar não resolvido em M2, M3 e M4.', notes: 'MANUAL → SOURCE_SEED → NOVOS RCAS físico.' }),
  hard({ id: 'relatorio_carteira_clientes.xls', parser: 'tabular', stagingFields: ['customer_cnpj', 'customer_name', 'city', 'representative_code', 'winthor_customer_code', 'trade_name'], motors: ['M2'], resolvers: ['createRcaResolver.resolveCurrent'], consumers: ['M2', 'SELL_OUT', 'NETWORKS'], capabilities: ['CUSTOMER_MASTER', 'RCA_RESOLUTION'], fallback: 'Premissas fornece parte do cliente, mas não substitui a relação representativa/Winthor integral.', consequenceIfMissing: 'Dados cadastrais e vínculo representativo do cliente podem ficar incompletos.', notes: 'Complementa Premissas e enriquece Top Varejistas.' }),
  candidate({ id: "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", parser: 'tabular', stagingFields: ['cnpj', 'store_name', 'top_network', 'banner', 'manager_cnpj', 'group_code', 'top_category', 'top_target'], motors: ['M2'], resolvers: ['resolveTopAuthority', 'materializeTopRetailRouteInM2'], consumers: ['M2', 'NETWORKS', 'ADMIN_SEED'], capabilities: ['TOP_RETAIL_ROUTE'], replacementAuthority: 'AdminRegistry.TopRetailers', replacementScope: 'Mesma competência + CNPJ: rede, bandeira, gestor, grupo, categoria e Top Target.', fallback: 'AdminRegistry.TopRetailers da mesma competência quando a cobertura efetiva é equivalente.', consequenceIfMissing: 'Sem Registry equivalente da mesma competência, universo Top/Redes fica incompleto; agosto nunca substitui setembro.', notes: 'Readiness obrigatoriamente competência-específica.' }),
  hard({ id: 'vendas-8022.xls', parser: 'tabular', stagingFields: ['movement_date', 'customer_document', 'customer_winthor_code', 'customer_name', 'seller_code', 'seller_name', 'winthor_product_code', 'manufacturer_code', 'ean_product', 'order_status', 'units_sold', 'cases_sold', 'sale_value'], motors: ['M3'], resolvers: ['createRcaResolver.resolveCurrent'], consumers: ['M3', 'SELL_OUT', 'NETWORKS', 'STOCK', 'PRODUCTS'], capabilities: ['SELL_OUT_MOVEMENT'], fallback: null, consequenceIfMissing: 'Venda realizada/faturada/a faturar e positivação ficam ausentes; zero seria silenciosamente falso.', notes: 'M3 materializa SALE e sustenta a competência operacional do Sell Out.' }),
  hard({ id: 'CARTEIRA 24.08.xlsx', parser: 'tabular', stagingFields: ['order_date', 'billing_date', 'industry_material', 'industry_order_number', 'invoice_raw', 'order_qty', 'bill_qty', 'net_value', 'billing_type'], motors: ['M3'], resolvers: [], consumers: ['M3', 'PORTFOLIO', 'STOCK', 'PRODUCTS'], capabilities: ['INBOUND_PORTFOLIO'], fallback: null, consequenceIfMissing: 'Carteira em trânsito/projetado e pedidos de entrada ficam incompletos.', notes: 'M3 materializa INBOUND_ORDER; SourceImport preserva continuidade de snapshot.' }),
  hard({ id: 'entrada-notas-218.xls', parser: 'parse218File', stagingFields: ['receipt_date', 'invoice_issue_date', 'invoice_raw', 'invoice_series', 'receipt_item_code + description', 'received_units', 'receipt_unit_price', 'invoice_total', 'current_financial_cost', 'operation_code'], motors: ['M3'], resolvers: [], consumers: ['M3', 'RECEIPTS', 'STOCK', 'PRODUCTS'], capabilities: ['RECEIPTS'], fallback: '12.322 cobre histórico anterior, não substitui a baixa adicional atual do 218.', consequenceIfMissing: 'Recebimentos atuais e baixa adicional da Carteira ficam desconhecidos.', notes: 'M3 materializa RECEIPT em grão NF e item.' }),
  candidate({ id: BUSSOLA_SOURCE_ID, parser: 'tabular', stagingFields: ['pasta_type', 'industry_name', 'target_rca_code', 'target_rca_name', 'sales_target_pna', 'positivity_target'], motors: ['M3'], resolvers: ['createRcaResolver.resolveLegacy', 'materializeEffectiveTargetFacts'], consumers: ['M3', 'SELL_OUT', 'NETWORKS', 'ADMIN_SEED'], capabilities: ['RCA_TARGETS'], replacementAuthority: 'TargetState.RcaTargets', replacementScope: 'Metas RCA da mesma competência; somente MCD + COLGATE.', fallback: 'TargetState.RcaTargets da mesma competência quando cobertura é completa.', consequenceIfMissing: 'Sem TargetState equivalente, metas RCA ficam indisponíveis; Sell Out realizado continua independente.', notes: 'MANUAL → SOURCE_SEED → Bússola física; readiness por competência.' }),
];

export function sourceDependencyMatrix(): SourceDependencyContract[] {
  return CONTRACTS.map(item => ({ ...item, stagingFields: [...item.stagingFields], motors: [...item.motors], resolvers: [...item.resolvers], consumers: [...item.consumers], capabilities: [...item.capabilities] }));
}
export function sourceDependencyContract(sourceId: string) { return CONTRACTS.find(item => item.id === sourceId) ?? null; }

export type ReplacementReadinessStatus = 'NOT_APPLICABLE' | 'NOT_READY' | 'READY' | 'CONFLICTED' | 'SOURCE_UNAVAILABLE' | 'REPLACEMENT_UNAVAILABLE';
export type ReplacementReadinessDetail = {
  sourceId: string;
  competence: string | null;
  status: ReplacementReadinessStatus;
  sourceRecords: number;
  coveredInternally: number;
  manual: number;
  seed: number;
  tombstones: number;
  conflicts: number;
  unresolved: number;
  reason: string;
};
export type SourceReplacementReadiness = {
  sourceId: string;
  replacementAuthority: SourceReplacementAuthority | null;
  status: ReplacementReadinessStatus;
  classification: SourceDiagnosticClassification;
  details: ReplacementReadinessDetail[];
};

const typedValue = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? row[field]?.raw ?? null;
const clean = (value: unknown) => String(value ?? '').trim().replace(/\.0$/, '');
const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const stage = (stages: ParsedSource[], sourceId: string) => stages.find(item => item.source === sourceId) ?? null;
const without = (stages: ParsedSource[], sourceId: string) => stages.filter(item => item.source !== sourceId);
const countOrigin = <T extends { origin: 'MANUAL' | 'SOURCE_SEED'; active: boolean }>(records: T[], origin: 'MANUAL' | 'SOURCE_SEED') => records.filter(record => record.origin === origin).length;
const tombstones = <T extends { origin: 'MANUAL' | 'SOURCE_SEED'; active: boolean }>(records: T[]) => records.filter(record => record.origin === 'MANUAL' && !record.active).length;

const EXECUTION_METADATA_KEYS = new Set(['generatedAt', 'snapshotDate', 'motorBuildId', 'stagingManifestHash', 'adminRegistryHash', 'rcaTargetRegistryHash', 'canonicalInputHash', 'createdAt', 'updatedAt']);
export function semanticBusinessSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticBusinessSnapshot).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).filter(key => !EXECUTION_METADATA_KEYS.has(key)).sort().map(key => [key, semanticBusinessSnapshot(object[key])]));
}
export function semanticBusinessEquivalent(a: unknown, b: unknown) { return JSON.stringify(semanticBusinessSnapshot(a)) === JSON.stringify(semanticBusinessSnapshot(b)); }

const readiness = (sourceId: string, authority: SourceReplacementAuthority, status: ReplacementReadinessStatus, details: ReplacementReadinessDetail[]): SourceReplacementReadiness => ({
  sourceId,
  replacementAuthority: authority,
  status,
  classification: status === 'READY' ? 'REPLACEABLE_CANDIDATE' : 'UNRESOLVED_DEPENDENCY',
  details,
});
const detail = (input: ReplacementReadinessDetail): ReplacementReadinessDetail => input;
const aggregateStatus = (details: ReplacementReadinessDetail[]): ReplacementReadinessStatus => details.some(item => item.status === 'CONFLICTED') ? 'CONFLICTED' : details.length > 0 && details.every(item => item.status === 'READY') ? 'READY' : 'NOT_READY';

function rcaProjection(value: RcaResolution) {
  return { status: value.status, canonicalId: value.canonicalId, currentCode: value.currentCode, legacyCode: value.legacyCode, name: value.name, coordinatorCode: value.coordinatorCode, coordinatorName: value.coordinatorName, role: value.role, candidateCurrentCodes: [...value.candidateCurrentCodes].sort(), auditCode: value.auditCode };
}
function rcaReadiness(stages: ParsedSource[], registry: AdminRegistryState | null): SourceReplacementReadiness {
  const sourceId = 'NOVOS RCAS.xlsx';
  const physical = stage(stages, sourceId);
  const records = registry?.rcas ?? [];
  if (!physical && records.length === 0) return readiness(sourceId, 'AdminRegistry.RCAs', 'NOT_READY', [detail({ sourceId, competence: null, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: 0, reason: 'Fonte e Registry RCA ausentes; RCA_RESOLUTION está indisponível.' })]);
  if (!physical) return readiness(sourceId, 'AdminRegistry.RCAs', 'SOURCE_UNAVAILABLE', [detail({ sourceId, competence: null, status: 'SOURCE_UNAVAILABLE', sourceRecords: 0, coveredInternally: 0, manual: countOrigin(records, 'MANUAL'), seed: countOrigin(records, 'SOURCE_SEED'), tombstones: tombstones(records), conflicts: diagnoseRcaRecords(records).length, unresolved: 0, reason: 'Registry existe, mas a fonte física não está disponível para provar o universo conhecido.' })]);
  const entries = rcaMasterEntries(stages);
  if (!registry || records.length === 0) return readiness(sourceId, 'AdminRegistry.RCAs', 'REPLACEMENT_UNAVAILABLE', [detail({ sourceId, competence: null, status: 'REPLACEMENT_UNAVAILABLE', sourceRecords: entries.length, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: entries.length, reason: 'NOVOS RCAS ainda é a única autoridade disponível.' })]);
  const withSource = createRcaResolver(stages, registry);
  const noSource = createRcaResolver(without(stages, sourceId), registry);
  let covered = 0; let unresolved = 0; let authorityConflicts = 0;
  for (const entry of entries) {
    const checks: Array<[RcaResolution, RcaResolution]> = [[withSource.resolveCurrent(entry.currentCode), noSource.resolveCurrent(entry.currentCode)]];
    if (entry.legacyCode) checks.push([withSource.resolveLegacy(entry.legacyCode, entry.name), noSource.resolveLegacy(entry.legacyCode, entry.name)]);
    if (checks.some(([a, b]) => a.status === 'AMBIGUOUS_RCA_CODE' || b.status === 'AMBIGUOUS_RCA_CODE')) authorityConflicts += 1;
    else if (checks.every(([a, b]) => semanticBusinessEquivalent(rcaProjection(a), rcaProjection(b)))) covered += 1;
    else unresolved += 1;
  }
  const conflicts = diagnoseRcaRecords(records).length + authorityConflicts;
  const status: ReplacementReadinessStatus = conflicts ? 'CONFLICTED' : entries.length > 0 && covered === entries.length && unresolved === 0 ? 'READY' : 'NOT_READY';
  return readiness(sourceId, 'AdminRegistry.RCAs', status, [detail({ sourceId, competence: null, status, sourceRecords: entries.length, coveredInternally: covered, manual: countOrigin(records, 'MANUAL'), seed: countOrigin(records, 'SOURCE_SEED'), tombstones: tombstones(records), conflicts, unresolved, reason: status === 'READY' ? 'Resoluções current/legacy permanecem semanticamente iguais sem NOVOS RCAS.' : conflicts ? 'Há ambiguidade/conflito RCA na autoridade administrativa.' : 'Nem todo RCA físico conhecido está coberto pela autoridade administrativa.' })]);
}

function launchIdentity(row: Record<string, RawTyped>) { return { winthorCode: clean(typedValue(row, 'launch_winthor_code')), eans: [onlyDigits(typedValue(row, 'launch_ean'))] }; }
function launchSemantic(record: LaunchRegistryRecord | Record<string, RawTyped> | null) {
  if (!record) return null;
  if ('origin' in record) return { winthorCode: record.winthorCode, ean: record.ean, description: record.description, type: record.type, status: record.status, active: record.active };
  return { winthorCode: clean(typedValue(record, 'launch_winthor_code')) || null, ean: onlyDigits(typedValue(record, 'launch_ean')) || null, description: typedValue(record, 'launch_description'), type: typedValue(record, 'launch_type'), status: typedValue(record, 'launch_status'), active: true };
}
function authoritySemantic<T>(value: { record: T | null; tombstone: boolean; ambiguous: boolean; validityUnresolved: boolean }, normalize: (record: T | null) => unknown) { return { record: normalize(value.record), tombstone: value.tombstone, ambiguous: value.ambiguous, validityUnresolved: value.validityUnresolved }; }
function uniqueCompetence(stages: ParsedSource[]) {
  const values = [...new Set(stages.map(competenceFromParsedSource).filter((value): value is string => isValidCompetenceId(value)))];
  return values.length === 1 ? values[0] : null;
}
function launchReadiness(stages: ParsedSource[], registry: AdminRegistryState | null): SourceReplacementReadiness {
  const sourceId = 'lançamentos.xlsx'; const physical = stage(stages, sourceId); const records = registry?.launches ?? [];
  if (!physical && records.length === 0) return readiness(sourceId, 'AdminRegistry.Lançamentos', 'NOT_READY', [detail({ sourceId, competence: null, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: 0, reason: 'Fonte e Registry de Lançamentos ausentes; classificação fica indisponível.' })]);
  if (!physical) return readiness(sourceId, 'AdminRegistry.Lançamentos', 'SOURCE_UNAVAILABLE', [detail({ sourceId, competence: null, status: 'SOURCE_UNAVAILABLE', sourceRecords: 0, coveredInternally: 0, manual: countOrigin(records, 'MANUAL'), seed: countOrigin(records, 'SOURCE_SEED'), tombstones: tombstones(records), conflicts: diagnoseLaunchRecords(records).length, unresolved: 0, reason: 'Registry existe, mas não há fonte física para provar o universo de lançamentos.' })]);
  if (!registry || records.length === 0) return readiness(sourceId, 'AdminRegistry.Lançamentos', 'REPLACEMENT_UNAVAILABLE', [detail({ sourceId, competence: null, status: 'REPLACEMENT_UNAVAILABLE', sourceRecords: physical.rows.length, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: physical.rows.length, reason: 'A planilha ainda é a única autoridade dos lançamentos conhecidos.' })]);
  const competence = uniqueCompetence(stages); let covered = 0; let unresolved = 0; let authorityConflicts = 0;
  for (const row of physical.rows) {
    const identity = { ...launchIdentity(row), competence };
    const a = resolveLaunchAuthority(registry, row, identity); const b = resolveLaunchAuthority(registry, null, identity);
    if (a.ambiguous || b.ambiguous || a.validityUnresolved || b.validityUnresolved) authorityConflicts += 1;
    else if (semanticBusinessEquivalent(authoritySemantic(a, launchSemantic), authoritySemantic(b, launchSemantic))) covered += 1;
    else unresolved += 1;
  }
  const conflicts = diagnoseLaunchRecords(records).length + authorityConflicts;
  const status: ReplacementReadinessStatus = conflicts ? 'CONFLICTED' : physical.rows.length > 0 && covered === physical.rows.length && unresolved === 0 ? 'READY' : 'NOT_READY';
  return readiness(sourceId, 'AdminRegistry.Lançamentos', status, [detail({ sourceId, competence, status, sourceRecords: physical.rows.length, coveredInternally: covered, manual: countOrigin(records, 'MANUAL'), seed: countOrigin(records, 'SOURCE_SEED'), tombstones: tombstones(records), conflicts, unresolved, reason: status === 'READY' ? 'A autoridade efetiva de cada lançamento permanece igual sem a planilha.' : conflicts ? 'Há conflito/ambiguidade de lançamento no Registry.' : 'O Registry não cobre todo o universo físico conhecido.' })]);
}

function topCnpj(row: Record<string, RawTyped>) { return onlyDigits(typedValue(row, 'cnpj')); }
function topSemantic(record: TopRetailRegistryRecord | Record<string, RawTyped> | null) {
  if (!record) return null;
  if ('origin' in record) return { network: record.network, banner: record.banner, managerCnpj: record.managerCnpj, groupCode: record.groupCode, category: record.category, topTarget: record.topTarget, active: record.active };
  return { network: typedValue(record, 'top_network'), banner: typedValue(record, 'banner'), managerCnpj: onlyDigits(typedValue(record, 'manager_cnpj')) || null, groupCode: clean(typedValue(record, 'group_code')) || null, category: typedValue(record, 'top_category'), topTarget: typedValue(record, 'top_target'), active: true };
}
function topReadiness(stages: ParsedSource[], registry: AdminRegistryState | null): SourceReplacementReadiness {
  const sourceId = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"; const physical = stage(stages, sourceId); const physicalCompetence = physical ? competenceFromParsedSource(physical) : null; const records = registry?.topRetailers ?? [];
  if (!physical && records.length === 0) return readiness(sourceId, 'AdminRegistry.TopRetailers', 'NOT_READY', [detail({ sourceId, competence: null, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: 0, reason: 'Roteiro e Registry Top ausentes.' })]);
  const competences = [...new Set([physicalCompetence, ...records.map(record => record.competence)].filter((value): value is string => isValidCompetenceId(value)))].sort();
  const details: ReplacementReadinessDetail[] = competences.map(competence => {
    const physicalRows = physical && physicalCompetence === competence ? physical.rows.filter(row => topCnpj(row).length === 14 && String(typedValue(row, 'top_network') ?? '').trim()) : [];
    const registryAt = records.filter(record => record.competence === competence);
    if (!physical || physicalCompetence !== competence) return detail({ sourceId, competence, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: countOrigin(registryAt, 'MANUAL'), seed: countOrigin(registryAt, 'SOURCE_SEED'), tombstones: tombstones(registryAt), conflicts: diagnoseTopRetailRecords(registryAt).length, unresolved: 0, reason: 'Não existe Roteiro físico desta competência para provar cobertura; readiness não se propaga.' });
    if (!registry || registryAt.length === 0) return detail({ sourceId, competence, status: 'NOT_READY', sourceRecords: physicalRows.length, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: physicalRows.length, reason: 'Registry Top não cobre esta competência.' });
    let covered = 0; let unresolved = 0; let authorityConflicts = 0;
    for (const row of physicalRows) {
      const cnpj = topCnpj(row); const a = resolveTopAuthority(registry, competence, cnpj, row); const b = resolveTopAuthority(registry, competence, cnpj, null);
      if (a.ambiguous || b.ambiguous) authorityConflicts += 1;
      else if (semanticBusinessEquivalent(authoritySemantic(a, topSemantic), authoritySemantic(b, topSemantic))) covered += 1;
      else unresolved += 1;
    }
    const conflicts = diagnoseTopRetailRecords(registryAt).length + authorityConflicts;
    const status: ReplacementReadinessStatus = conflicts ? 'CONFLICTED' : physicalRows.length > 0 && covered === physicalRows.length && unresolved === 0 ? 'READY' : 'NOT_READY';
    return detail({ sourceId, competence, status, sourceRecords: physicalRows.length, coveredInternally: covered, manual: countOrigin(registryAt, 'MANUAL'), seed: countOrigin(registryAt, 'SOURCE_SEED'), tombstones: tombstones(registryAt), conflicts, unresolved, reason: status === 'READY' ? `Top ${competence} permanece equivalente sem o Roteiro físico.` : conflicts ? 'Há conflito Top na autoridade administrativa.' : 'Nem todo CNPJ Top físico está coberto nesta competência.' });
  });
  if (!details.length) details.push(detail({ sourceId, competence: physicalCompetence, status: physical ? 'REPLACEMENT_UNAVAILABLE' : 'SOURCE_UNAVAILABLE', sourceRecords: physical?.rows.length ?? 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: physical?.rows.length ?? 0, reason: physical ? 'Roteiro disponível, mas não existe Registry Top equivalente.' : 'Roteiro indisponível para prova.' }));
  return readiness(sourceId, 'AdminRegistry.TopRetailers', aggregateStatus(details), details);
}

function targetProjection(stages: ParsedSource[], targetState: TargetState | null, registry: AdminRegistryState | null, competence: string) {
  const effective = materializeEffectiveTargetFacts(stages, targetState, registry);
  return {
    facts: effective.facts.filter(fact => fact.competence === competence).map(fact => ({ fact_type: fact.fact_type, source: fact.source, competence: fact.competence, transaction_rca_code: fact.transaction_rca_code, rca_canonical_id: fact.rca_canonical_id, sales_target: fact.sales_target, positivity_target: fact.positivity_target, target_assignment_status: fact.target_assignment_status, audit_flags: fact.audit_flags })),
    audits: effective.audits.map(audit => ({ code: audit.code, severity: audit.severity, source: audit.source, message: audit.message })),
  };
}
function targetReadiness(stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null): SourceReplacementReadiness {
  const sourceId = BUSSOLA_SOURCE_ID; const physical = stage(stages, sourceId); const physicalCompetence = physical ? competenceFromParsedSource(physical) : null; const targetRecords = targetState?.records ?? [];
  if (!physical && targetRecords.every(record => record.rcaTargets.length === 0)) return readiness(sourceId, 'TargetState.RcaTargets', 'NOT_READY', [detail({ sourceId, competence: null, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: 0, reason: 'Bússola e TargetState RCA ausentes; RCA_TARGETS está indisponível.' })]);
  const competences = [...new Set([physicalCompetence, ...targetRecords.filter(record => record.rcaTargets.length).map(record => record.competence)].filter((value): value is string => isValidCompetenceId(value)))].sort();
  const details: ReplacementReadinessDetail[] = competences.map(competence => {
    const stateRecords = targetState?.records.find(record => record.competence === competence)?.rcaTargets ?? [];
    if (!physical || physicalCompetence !== competence) return detail({ sourceId, competence, status: 'NOT_READY', sourceRecords: 0, coveredInternally: 0, manual: countOrigin(stateRecords, 'MANUAL'), seed: countOrigin(stateRecords, 'SOURCE_SEED'), tombstones: tombstones(stateRecords), conflicts: 0, unresolved: 0, reason: 'Não existe Bússola física desta competência para provar cobertura; readiness não se propaga.' });
    const physicalRows = physical.rows.filter(row => String(typedValue(row, 'pasta_type') ?? '').trim().toUpperCase() === 'MCD' && String(typedValue(row, 'industry_name') ?? '').trim().toUpperCase() === 'COLGATE');
    const resolver = createRcaResolver(stages, registry); let covered = 0; let unresolved = 0; let conflicts = 0;
    for (const row of physicalRows) {
      const resolution = resolver.resolveLegacy(typedValue(row, 'target_rca_code'), typedValue(row, 'target_rca_name'), competence);
      if (!resolution.canonicalId) { unresolved += 1; continue; }
      const authority = resolveTargetAuthority(targetState, competence, resolution.canonicalId);
      if (authority.ambiguous) conflicts += 1;
      else if (authority.record || authority.tombstone) covered += 1;
      else unresolved += 1;
    }
    const equivalent = semanticBusinessEquivalent(targetProjection(stages, targetState, registry, competence), targetProjection(without(stages, sourceId), targetState, registry, competence));
    const status: ReplacementReadinessStatus = conflicts ? 'CONFLICTED' : physicalRows.length > 0 && covered === physicalRows.length && unresolved === 0 && equivalent ? 'READY' : 'NOT_READY';
    return detail({ sourceId, competence, status, sourceRecords: physicalRows.length, coveredInternally: covered, manual: countOrigin(stateRecords, 'MANUAL'), seed: countOrigin(stateRecords, 'SOURCE_SEED'), tombstones: tombstones(stateRecords), conflicts, unresolved, reason: status === 'READY' ? `TARGET ${competence} permanece semanticamente igual sem Bússola física.` : conflicts ? 'Há AMBIGUOUS_TARGET nesta competência.' : 'TargetState ainda não cobre integralmente os TARGETs seguros desta competência.' });
  });
  if (!details.length) details.push(detail({ sourceId, competence: physicalCompetence, status: physical ? 'REPLACEMENT_UNAVAILABLE' : 'SOURCE_UNAVAILABLE', sourceRecords: physical?.rows.length ?? 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: physical?.rows.length ?? 0, reason: physical ? 'Bússola disponível, mas TargetState RCA não cobre a competência.' : 'Bússola indisponível para prova.' }));
  return readiness(sourceId, 'TargetState.RcaTargets', aggregateStatus(details), details);
}

export function evaluateSourceReplacementReadiness(stages: ParsedSource[], adminRegistryState: AdminRegistryState | null, targetState: TargetState | null): SourceReplacementReadiness[] {
  const candidateResults = [rcaReadiness(stages, adminRegistryState), launchReadiness(stages, adminRegistryState), topReadiness(stages, adminRegistryState), targetReadiness(stages, adminRegistryState, targetState)];
  const byId = new Map(candidateResults.map(item => [item.sourceId, item]));
  return CONTRACTS.map(item => byId.get(item.id) ?? {
    sourceId: item.id,
    replacementAuthority: null,
    status: 'NOT_APPLICABLE',
    classification: item.defaultClassification,
    details: [detail({ sourceId: item.id, competence: null, status: 'NOT_APPLICABLE', sourceRecords: stage(stages, item.id)?.rows.length ?? 0, coveredInternally: 0, manual: 0, seed: 0, tombstones: 0, conflicts: 0, unresolved: 0, reason: item.consequenceIfMissing })],
  });
}

export type SourceOmissionDiagnostic = {
  sourceId: string;
  classification: SourceDiagnosticClassification;
  replacementAuthority: SourceReplacementAuthority | null;
  replacementStatus: ReplacementReadinessStatus;
  functionsWithoutInput: string[];
  fallback: string | null;
  silentDefaultRisk: boolean;
  consequence: string;
};
export function sourceOmissionMatrix(stages: ParsedSource[], adminRegistryState: AdminRegistryState | null, targetState: TargetState | null): SourceOmissionDiagnostic[] {
  const byId = new Map(evaluateSourceReplacementReadiness(stages, adminRegistryState, targetState).map(item => [item.sourceId, item]));
  return CONTRACTS.map(item => {
    const replacement = byId.get(item.id)!;
    const classification: SourceDiagnosticClassification = item.replacementCandidate && replacement.status === 'READY' ? 'REPLACEABLE_CANDIDATE' : item.replacementCandidate ? 'UNRESOLVED_DEPENDENCY' : item.defaultClassification;
    return {
      sourceId: item.id,
      classification,
      replacementAuthority: item.replacementAuthority,
      replacementStatus: replacement.status,
      functionsWithoutInput: [...item.motors, ...item.resolvers],
      fallback: item.fallback,
      silentDefaultRisk: classification !== 'SAFE_ENRICHMENT_CANDIDATE',
      consequence: item.consequenceIfMissing,
    };
  });
}

export function sourceDependencyContractIntegrity() {
  const ids = CONTRACTS.map(item => item.id);
  const supported = [...SUPPORTED_SOURCE_IDS].sort();
  const required = [...REQUIRED_SOURCE_IDS].sort();
  const contractIds = [...ids].sort();
  return {
    supportedCount: supported.length,
    requiredCount: required.length,
    contractCount: contractIds.length,
    duplicateContracts: ids.length - new Set(ids).size,
    supportedEqualsRequired: JSON.stringify(supported) === JSON.stringify(required),
    contractsCoverSupported: JSON.stringify(supported) === JSON.stringify(contractIds),
    labelsMatch: CONTRACTS.every(item => (SOURCE_LABELS[item.id] ?? item.id) === item.label),
  };
}
