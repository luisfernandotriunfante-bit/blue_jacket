import { canonicalAdminRegistryHash } from './adminRegistryIdentity';
import { diagnoseLaunchRecords, diagnoseRcaRecords, diagnoseTopRetailRecords, type AdminRegistryState, type RegistryDiagnostic } from './adminRegistry';
import { compareOfficialCompetence, type CompetenceCompatibility } from './competence';
import type { CompetenceState } from './competenceStore';
import { buildSellOutViewModel, type SellOutViewModel, type ViewAudit } from './operationalViewModels';
import type { ReportSettings } from './reportSettings';
import { hasCompleteCanonicalInputIdentityV21, type ActiveCanonicalBundle } from './runtime';
import { buildSellOutDashboardModel, type SellOutDashboardModel } from './sellOutDashboardModel';
import { CANONICAL_ENGINE_VERSION, isSourceStageCurrent, type StoredStage } from './sourceImport';
import { HARD_REQUIRED_SOURCE_IDS, REPLACEABLE_SOURCE_IDS, SOURCE_CONTRACT_VERSION, SOURCE_LABELS, SUPPORTED_SOURCE_IDS } from './sourceContract';
import { canonicalInputHashV3, stagingManifestHashV2 } from './sourceReplacementIdentity';
import { resolveEffectiveSourceSet, type SourceBuildDiagnostic } from './sourceReplacementRuntime';
import { sourceReplacementProofHash, sourceReplacementsFromCertificates, type SourceReplacementState } from './sourceReplacementState';
import { buildStockOverviewModel, type StockOverviewModel } from './stockOverviewModel';
import { resolveTargetAuthority } from './targetAuthority';
import { rcaTargetRegistryHash } from './targetIdentity';
import { competenceTargetRecord, type TargetState } from './targetStore';
import { buildTopRetailNetworksViewModel, type TopRetailNetworksViewModel } from './topRetailNetworksModel';
import type { CanonicalAudit, CanonicalList } from './types';

export const GLOBAL_AUDIT_FORMAT = 'blue-jacket-global-audit/v1' as const;
export type GlobalAuditOverallStatus = 'HEALTHY' | 'ATTENTION' | 'BLOCKED';
export type GlobalAuditFindingStatus = 'PASS' | 'BLOCKER' | 'WARNING' | 'INFO';
export type GlobalAuditDomain = 'SYSTEM' | 'SOURCES' | 'CANONICAL' | 'REGISTRIES' | 'TARGETS' | 'COMPETENCE' | 'SELL_OUT' | 'NETWORKS' | 'STOCK' | 'PRODUCTS';
export type GlobalAuditSample = { source?: string; file?: string; row?: number; value?: string };

export type GlobalAuditFinding = {
  id: string;
  code: string;
  status: GlobalAuditFindingStatus;
  domain: GlobalAuditDomain;
  title: string;
  message: string;
  action: string;
  count: number;
  source?: string;
  listId?: CanonicalList['id'];
  competence?: string;
  scope?: string;
  samples?: GlobalAuditSample[];
  technicalDetails?: Record<string, unknown>;
};

export type GlobalAuditSummary = { total: number; blockers: number; warnings: number; info: number; pass: number };
export type GlobalAuditSection = GlobalAuditSummary & { domain: GlobalAuditDomain };
export type GlobalAuditTechnicalDetails = {
  motorBuildId: string | null;
  engine: string | null;
  sourceContractVersion: string | null;
  stagingManifestHash: string | null;
  adminRegistryHash: string | null;
  rcaTargetRegistryHash: string | null;
  sourceReplacementProofHash: string | null;
  canonicalInputHash: string | null;
  sourceReplacements: Array<{ source: string; scope: string }>;
};

export type AuditLoadResult<T> = { value: T | null; error: string | null };
export type GlobalAuditInputs = {
  active: ActiveCanonicalBundle | null;
  lists: Record<CanonicalList['id'], AuditLoadResult<CanonicalList>>;
  stages: StoredStage[];
  stageErrors: Array<{ source: string; error: string }>;
  registry: AuditLoadResult<AdminRegistryState>;
  target: AuditLoadResult<TargetState>;
  competence: AuditLoadResult<CompetenceState>;
  replacement: AuditLoadResult<SourceReplacementState>;
  reportSettings: AuditLoadResult<ReportSettings>;
};

export type GlobalAuditReport = {
  format: typeof GLOBAL_AUDIT_FORMAT;
  generatedAt: string;
  activeBuild: ActiveCanonicalBundle | null;
  overallStatus: GlobalAuditOverallStatus;
  partial: boolean;
  summary: GlobalAuditSummary;
  sections: GlobalAuditSection[];
  findings: GlobalAuditFinding[];
  technicalDetails: GlobalAuditTechnicalDetails;
};

const STATUS_ORDER: Record<GlobalAuditFindingStatus, number> = { BLOCKER: 0, WARNING: 1, INFO: 2, PASS: 3 };
const DOMAINS: GlobalAuditDomain[] = ['SYSTEM', 'SOURCES', 'CANONICAL', 'REGISTRIES', 'TARGETS', 'COMPETENCE', 'SELL_OUT', 'NETWORKS', 'STOCK', 'PRODUCTS'];
const LIST_IDS: CanonicalList['id'][] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
const moneyClose = (a: number, b: number) => Math.abs(a - b) <= 0.01;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const safeString = (value: unknown) => value instanceof Error ? value.message : String(value ?? 'Erro desconhecido');
const scopeKey = (finding: Pick<GlobalAuditFinding, 'domain' | 'code' | 'source' | 'listId' | 'competence' | 'scope'>) => [finding.domain, finding.code, finding.scope ?? '', finding.source ?? '', finding.listId ?? '', finding.competence ?? ''].join('|');
const stableToken = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');

export function globalAuditFindingId(input: Pick<GlobalAuditFinding, 'domain' | 'code' | 'source' | 'listId' | 'competence' | 'scope'>) {
  return stableToken(scopeKey(input));
}

function finding(input: Omit<GlobalAuditFinding, 'id' | 'count'> & { id?: string; count?: number }): GlobalAuditFinding {
  const base = { ...input, count: input.count ?? 1 } as Omit<GlobalAuditFinding, 'id'>;
  return { ...base, id: input.id ?? globalAuditFindingId(base) };
}

export function sortGlobalAuditFindings(findings: GlobalAuditFinding[]) {
  return [...findings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || a.domain.localeCompare(b.domain)
    || a.code.localeCompare(b.code)
    || a.id.localeCompare(b.id));
}

function summarize(findings: GlobalAuditFinding[]): GlobalAuditSummary {
  return {
    total: findings.length,
    blockers: findings.filter(item => item.status === 'BLOCKER').length,
    warnings: findings.filter(item => item.status === 'WARNING').length,
    info: findings.filter(item => item.status === 'INFO').length,
    pass: findings.filter(item => item.status === 'PASS').length,
  };
}

export function globalAuditOverallStatus(findings: GlobalAuditFinding[]): GlobalAuditOverallStatus {
  if (findings.some(item => item.status === 'BLOCKER')) return 'BLOCKED';
  if (findings.some(item => item.status === 'WARNING')) return 'ATTENTION';
  return 'HEALTHY';
}

export function blockingGlobalAuditFindings(report: GlobalAuditReport) {
  return report.findings.filter(item => item.status === 'BLOCKER');
}

export function globalAuditGate(report: GlobalAuditReport): 'CLEAR' | 'BLOCKED' {
  return blockingGlobalAuditFindings(report).length ? 'BLOCKED' : 'CLEAR';
}

const auditStatus = (severity: CanonicalAudit['severity']): GlobalAuditFindingStatus => severity === 'BLOCKED' || severity === 'BLOCKED_DEPENDENT_CALC' ? 'BLOCKER' : severity === 'WARNING' ? 'WARNING' : 'INFO';

function aggregateCanonicalAudits(audits: CanonicalAudit[], domain: GlobalAuditDomain, listId?: CanonicalList['id'], forcedStatus?: GlobalAuditFindingStatus) {
  const groups = new Map<string, { audit: CanonicalAudit; status: GlobalAuditFindingStatus; count: number; samples: GlobalAuditSample[] }>();
  for (const audit of audits) {
    const status = forcedStatus ?? auditStatus(audit.severity);
    const key = [status, audit.code, audit.source, audit.file, audit.message, audit.action, listId ?? ''].join('|');
    const current = groups.get(key) ?? { audit, status, count: 0, samples: [] };
    current.count += 1;
    if (current.samples.length < 5) current.samples.push({ source: audit.source, file: audit.file, row: audit.row });
    groups.set(key, current);
  }
  return [...groups.values()].map(({ audit, status, count, samples }) => finding({
    code: audit.code,
    status,
    domain,
    title: audit.code,
    message: audit.message,
    action: audit.action,
    count,
    source: audit.source,
    listId,
    samples,
  }));
}

const RECORD_FLAG_CATALOG: Record<string, { status: GlobalAuditFindingStatus; title: string; action: string }> = {
  RCA_UNRESOLVED: { status: 'WARNING', title: 'RCA não resolvido', action: 'Revisar Cadastros → RCAs.' },
  AMBIGUOUS_RCA_CODE: { status: 'WARNING', title: 'RCA ambíguo', action: 'Revisar Cadastros → RCAs.' },
  ADMIN_REGISTRY_RCA_AMBIGUOUS: { status: 'WARNING', title: 'RCA ambíguo no cadastro', action: 'Revisar Cadastros → RCAs.' },
  ADMIN_REGISTRY_VALIDITY_UNRESOLVED: { status: 'WARNING', title: 'Vigência RCA não resolvida', action: 'Revisar Cadastros → RCAs.' },
  ADMIN_REGISTRY_RCA_TOMBSTONE: { status: 'INFO', title: 'RCA suprimido administrativamente', action: 'Nenhuma ação automática. Revisar o cadastro se a supressão não for esperada.' },
  AMBIGUOUS_TARGET: { status: 'WARNING', title: 'Meta RCA ambígua', action: 'Revisar Administração → Metas.' },
  MIXED_COMPETENCE: { status: 'WARNING', title: 'Competência mista', action: 'Revisar Competências e as fontes mensais.' },
  UNRESOLVED: { status: 'WARNING', title: 'Vínculo não resolvido', action: 'Revisar a origem do vínculo indicado.' },
  AMBIGUOUS: { status: 'WARNING', title: 'Vínculo ambíguo', action: 'Revisar a origem do vínculo indicado.' },
};
export const GLOBAL_AUDIT_RECORD_FLAG_CATALOG = RECORD_FLAG_CATALOG;

function splitAuditFlags(value: unknown) {
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(/[|;,]/).map(token => token.trim()).filter(Boolean);
}

function recordFlagFindings(lists: CanonicalList[]) {
  const groups = new Map<string, { token: string; listId: CanonicalList['id']; status: GlobalAuditFindingStatus; count: number; samples: GlobalAuditSample[]; stale: boolean }>();
  for (const list of lists) {
    for (const [index, record] of list.records.entries()) {
      for (const token of splitAuditFlags(record.audit_flags)) {
        const stale = token === 'RCA_UNRESOLVED' && Boolean(text(record.rca_canonical_id));
        const known = RECORD_FLAG_CATALOG[token];
        const status: GlobalAuditFindingStatus = stale ? 'BLOCKER' : known?.status ?? 'WARNING';
        const code = stale ? 'STALE_RCA_UNRESOLVED_AUDIT' : known ? `RECORD_AUDIT_${token}` : 'UNCLASSIFIED_RECORD_AUDIT_FLAG';
        const key = [code, list.id, token].join('|');
        const current = groups.get(key) ?? { token, listId: list.id, status, count: 0, samples: [], stale };
        current.count += 1;
        if (current.samples.length < 5) current.samples.push({ row: index + 1, value: token });
        groups.set(key, current);
      }
    }
  }
  return [...groups.values()].map(group => {
    const known = RECORD_FLAG_CATALOG[group.token];
    const code = group.stale ? 'STALE_RCA_UNRESOLVED_AUDIT' : known ? `RECORD_AUDIT_${group.token}` : 'UNCLASSIFIED_RECORD_AUDIT_FLAG';
    return finding({
      code,
      status: group.status,
      domain: 'CANONICAL',
      title: group.stale ? 'RCA resolvido conserva audit residual' : known?.title ?? 'Audit flag não classificado',
      message: group.stale
        ? 'Há registro com RCA canônico resolvido que ainda conserva RCA_UNRESOLVED.'
        : known ? `${group.count} registro(s) carregam o flag ${group.token}.` : `O token ${group.token} não existe no catálogo explícito da Auditoria Global.`,
      action: group.stale ? 'Reprocessar as bases após revisar a autoridade RCA.' : known?.action ?? 'Classificar este novo audit flag antes de depender dele em fechamento futuro.',
      count: group.count,
      listId: group.listId,
      samples: group.samples,
      technicalDetails: { token: group.token },
    });
  });
}

function loadFailureFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const failures: Array<[AuditLoadResult<unknown>, string, GlobalAuditDomain, string, string]> = [
    [input.registry, 'ADMIN_REGISTRY_LOAD_FAILED', 'REGISTRIES', 'Falha ao carregar Cadastros', 'Revisar o storage de Cadastros; nenhuma limpeza foi executada.'],
    [input.target, 'TARGET_STATE_LOAD_FAILED', 'TARGETS', 'Falha ao carregar Metas', 'Revisar o TargetState; nenhuma limpeza foi executada.'],
    [input.competence, 'COMPETENCE_STATE_LOAD_FAILED', 'COMPETENCE', 'Falha ao carregar Competências', 'Revisar Competências; nenhuma reparação automática foi executada.'],
    [input.replacement, 'SOURCE_REPLACEMENT_LOAD_FAILED', 'SOURCES', 'Falha ao carregar certificados', 'Revisar Administração → Bases e os certificados existentes.'],
    [input.reportSettings, 'REPORT_SETTINGS_LOAD_FAILED', 'SYSTEM', 'Falha ao carregar preferências do relatório', 'Revisar as configurações locais usadas pelas previsões de entrada.'],
  ];
  for (const [result, code, domain, title, action] of failures) if (result.error) out.push(finding({ code, status: 'BLOCKER', domain, title, message: result.error, action }));
  for (const stage of input.stageErrors) out.push(finding({ code: 'SOURCE_STAGING_LOAD_FAILED', status: 'BLOCKER', domain: 'SOURCES', title: 'Falha ao carregar staging', message: stage.error, action: 'Atualizar Bases para esta fonte após revisar o storage.', source: stage.source }));
  for (const id of LIST_IDS) if (input.lists[id].error) out.push(finding({ code: 'CANONICAL_LIST_LOAD_FAILED', status: 'BLOCKER', domain: 'CANONICAL', title: `Falha ao carregar ${id}`, message: input.lists[id].error!, action: 'Revisar o build ativo e atualizar Bases.', listId: id }));
  return out;
}

function activeBasics(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const active = input.active;
  if (!active) {
    out.push(finding({ code: 'NO_ACTIVE_CANONICAL_BUILD', status: 'BLOCKER', domain: 'SYSTEM', title: 'Sem build canônico ativo', message: 'Nenhum build canônico ativo pôde ser lido.', action: 'Atualizar Bases e materializar um build canônico v21.' }));
    return out;
  }
  out.push(finding({
    code: active.engineVersion === CANONICAL_ENGINE_VERSION ? 'ACTIVE_ENGINE_CURRENT' : 'ACTIVE_ENGINE_LEGACY',
    status: active.engineVersion === CANONICAL_ENGINE_VERSION ? 'PASS' : 'BLOCKER',
    domain: 'SYSTEM',
    title: 'Engine do build ativo',
    message: active.engineVersion === CANONICAL_ENGINE_VERSION ? 'O build ativo usa exatamente a engine homologada v21.' : `Engine ativa incompatível: ${active.engineVersion}.`,
    action: active.engineVersion === CANONICAL_ENGINE_VERSION ? 'Nenhuma ação necessária.' : 'Atualizar Bases para reconstruir na engine atual.',
    technicalDetails: { engineVersion: active.engineVersion },
  }));
  const complete = active.engineVersion === CANONICAL_ENGINE_VERSION && hasCompleteCanonicalInputIdentityV21(active);
  out.push(finding({
    code: complete ? 'ACTIVE_IDENTITY_COMPLETE' : 'ACTIVE_IDENTITY_INCOMPLETE',
    status: complete ? 'PASS' : 'BLOCKER',
    domain: 'SYSTEM',
    title: 'Identidade do build ativo',
    message: complete ? 'A identidade v21 completa está materializada.' : 'A identidade v21 está incompleta.',
    action: complete ? 'Nenhuma ação necessária.' : 'Atualizar Bases para gerar um build v21 completo.',
  }));
  return out;
}

function rowAndFactCountFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const active = input.active;
  if (!active) return out;
  const loaded = LIST_IDS.flatMap(id => input.lists[id].value ? [input.lists[id].value!] : []);
  if (loaded.length === LIST_IDS.length) {
    const mismatches = loaded.filter(list => active.rowCounts[list.id] !== list.records.length);
    out.push(finding({
      code: mismatches.length ? 'ACTIVE_ROW_COUNT_MISMATCH' : 'ACTIVE_ROW_COUNTS_MATCH',
      status: mismatches.length ? 'BLOCKER' : 'PASS',
      domain: 'CANONICAL',
      title: 'Contagem de registros M1–M4',
      message: mismatches.length ? 'A contagem gravada no Active diverge das listas materializadas.' : 'As contagens do Active conferem com M1–M4.',
      action: mismatches.length ? 'Atualizar Bases e revisar a persistência do build.' : 'Nenhuma ação necessária.',
      count: mismatches.length || 4,
      samples: mismatches.slice(0, 5).map(list => ({ value: `${list.id}: active=${active.rowCounts[list.id]} real=${list.records.length}` })),
    }));
  }
  const m3 = input.lists.M3_MOVIMENTO_VENDAS.value;
  if (m3) {
    const actual = { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };
    for (const record of m3.records) {
      const type = String(record.fact_type ?? '') as keyof typeof actual;
      if (type in actual) actual[type] += 1;
    }
    const mismatch = (Object.keys(actual) as Array<keyof typeof actual>).filter(key => actual[key] !== active.factTypeCounts[key]);
    out.push(finding({
      code: mismatch.length ? 'ACTIVE_FACT_COUNT_MISMATCH' : 'ACTIVE_FACT_COUNTS_MATCH',
      status: mismatch.length ? 'BLOCKER' : 'PASS',
      domain: 'CANONICAL',
      title: 'Contagem de fatos M3',
      message: mismatch.length ? 'factTypeCounts do Active diverge do M3 materializado.' : 'SALE, INBOUND_ORDER, RECEIPT e TARGET conferem com o Active.',
      action: mismatch.length ? 'Atualizar Bases e revisar a persistência do build.' : 'Nenhuma ação necessária.',
      count: mismatch.length || 4,
      technicalDetails: { actual, active: active.factTypeCounts },
    }));
  }
  return out;
}

async function sourceAndIdentityFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const integrity = {
    supported: SUPPORTED_SOURCE_IDS.length,
    hard: HARD_REQUIRED_SOURCE_IDS.length,
    conditional: REPLACEABLE_SOURCE_IDS.length,
    union: new Set([...HARD_REQUIRED_SOURCE_IDS, ...REPLACEABLE_SOURCE_IDS]).size,
  };
  const contractOk = integrity.supported === 19 && integrity.hard === 15 && integrity.conditional === 4 && integrity.union === 19;
  out.push(finding({ code: 'SOURCE_CONTRACT_19_15_4', status: contractOk ? 'PASS' : 'BLOCKER', domain: 'SOURCES', title: 'Contrato de fontes v21', message: contractOk ? 'Contrato operacional contém 19 suportadas, 15 hard-required e 4 condicionais.' : 'O contrato operacional v21 não fecha 19/15/4.', action: contractOk ? 'Nenhuma ação necessária.' : 'Revisar sourceContract.ts antes de confiar no build.', technicalDetails: integrity }));

  const effective = resolveEffectiveSourceSet({
    physicalStages: input.stages,
    replacementState: input.replacement.value,
    adminRegistryState: input.registry.value,
    targetState: input.target.value,
  });
  const certBySource = new Map(effective.certificates.map(cert => [cert.sourceId, cert]));
  const sourceStatus: Record<SourceBuildDiagnostic['status'], GlobalAuditFindingStatus> = {
    HARD_PRESENT: 'PASS', PHYSICAL: 'PASS', REPLACED: 'PASS', HARD_MISSING: 'BLOCKER', REPLACEMENT_REQUIRED: 'BLOCKER', REVIEW_REQUIRED: 'BLOCKER', COVERAGE_BROKEN: 'BLOCKER',
  };
  for (const diagnostic of effective.diagnostics) {
    const cert = certBySource.get(diagnostic.sourceId);
    out.push(finding({
      code: `SOURCE_${diagnostic.status}`,
      status: sourceStatus[diagnostic.status],
      domain: 'SOURCES',
      title: SOURCE_LABELS[diagnostic.sourceId] ?? diagnostic.sourceId,
      message: diagnostic.reason,
      action: diagnostic.status === 'REVIEW_REQUIRED' ? 'Recertificar fonte.' : diagnostic.status === 'COVERAGE_BROKEN' ? 'Revisar a autoridade interna e recertificar a fonte.' : diagnostic.status === 'HARD_MISSING' || diagnostic.status === 'REPLACEMENT_REQUIRED' ? 'Atualizar Bases.' : 'Nenhuma ação necessária.',
      source: diagnostic.sourceId,
      scope: diagnostic.scope ?? undefined,
      competence: diagnostic.scope?.startsWith('COMPETENCE:') ? diagnostic.scope.slice('COMPETENCE:'.length) : undefined,
      technicalDetails: cert ? { usage: 'SUBSTITUIÇÃO INTERNA', authority: cert.replacementAuthority, certificateId: cert.id } : { usage: 'FÍSICA' },
    }));
  }
  for (const stage of input.stages) {
    const current = isSourceStageCurrent(stage.manifest);
    out.push(finding({
      code: current ? 'SOURCE_STAGING_CURRENT' : 'SOURCE_STAGING_OUTDATED',
      status: current ? 'PASS' : 'BLOCKER',
      domain: 'SOURCES',
      title: `${SOURCE_LABELS[stage.source] ?? stage.source} — staging`,
      message: current ? 'parserVersion/schemaVersion correspondem ao contrato atual.' : 'O staging foi produzido por parser/schema incompatível com a versão atual.',
      action: current ? 'Nenhuma ação necessária.' : 'Atualizar Bases para reprocessar esta fonte.',
      source: stage.source,
      technicalDetails: { file: stage.manifest.fileName, parserVersion: stage.manifest.parserVersion, schemaVersion: stage.manifest.schemaVersion },
    }));
    out.push(...aggregateCanonicalAudits(stage.parsed.audits, 'SOURCES'));
  }

  const active = input.active;
  const canRecalculate = active
    && active.engineVersion === CANONICAL_ENGINE_VERSION
    && !input.registry.error && !input.target.error && !input.replacement.error
    && effective.hardMissing.length === 0 && effective.replacementRequired.length === 0 && effective.reviewRequired.length === 0 && effective.coverageBroken.length === 0;
  if (canRecalculate) {
    try {
      const replacements = sourceReplacementsFromCertificates(effective.certificates);
      const sourceHash = await stagingManifestHashV2(input.stages, effective.omitted);
      const adminHash = await canonicalAdminRegistryHash(input.registry.value);
      const targetHash = await rcaTargetRegistryHash(input.target.value);
      const proofHash = await sourceReplacementProofHash(effective.certificates);
      const inputHash = await canonicalInputHashV3(sourceHash, adminHash, targetHash, proofHash);
      const checks: Array<[string, boolean, string, string, unknown]> = [
        ['ACTIVE_SOURCE_IDENTITY_DRIFT', active.stagingManifestHash === sourceHash, 'Identidade das fontes', sourceHash, active.stagingManifestHash],
        ['ACTIVE_ADMIN_REGISTRY_DRIFT', active.adminRegistryHash === adminHash, 'Identidade de Cadastros', adminHash, active.adminRegistryHash],
        ['ACTIVE_RCA_TARGET_DRIFT', active.rcaTargetRegistryHash === targetHash, 'Identidade de metas RCA', targetHash, active.rcaTargetRegistryHash],
        ['ACTIVE_REPLACEMENT_PROOF_DRIFT', active.sourceReplacementProofHash === proofHash, 'Proof das substituições', proofHash, active.sourceReplacementProofHash],
        ['ACTIVE_SOURCE_REPLACEMENTS_DRIFT', JSON.stringify(active.sourceReplacements ?? []) === JSON.stringify(replacements), 'Lista de substituições', JSON.stringify(replacements), JSON.stringify(active.sourceReplacements ?? [])],
        ['ACTIVE_CANONICAL_INPUT_DRIFT', active.canonicalInputHash === inputHash, 'Canonical input v3', inputHash, active.canonicalInputHash],
      ];
      for (const [driftCode, matches, title, expected, actual] of checks) out.push(finding({
        code: matches ? driftCode.replace('_DRIFT', '_MATCH') : driftCode,
        status: matches ? 'PASS' : 'BLOCKER',
        domain: 'SYSTEM',
        title,
        message: matches ? `${title} corresponde ao estado administrativo e físico atual.` : `${title} do Active diverge do estado atual.`,
        action: matches ? 'Nenhuma ação necessária.' : 'Atualizar Bases para reconstruir o build com a identidade atual.',
        technicalDetails: { expected, actual },
      }));
    } catch (reason) {
      out.push(finding({ code: 'ACTIVE_IDENTITY_RECALCULATION_FAILED', status: 'BLOCKER', domain: 'SYSTEM', title: 'Falha ao recalcular identidade', message: safeString(reason), action: 'Revisar Fontes, Cadastros, Metas e certificados antes de atualizar Bases.' }));
    }
  } else if (active) {
    out.push(finding({ code: 'ACTIVE_IDENTITY_RECALCULATION_BLOCKED', status: 'INFO', domain: 'SYSTEM', title: 'Identidade local não recalculada integralmente', message: 'Há inputs indisponíveis ou fontes não prontas; os blockers específicos permanecem visíveis.', action: 'Resolver os blockers indicados e atualizar a auditoria.' }));
  }
  return { findings: out, effective };
}

function canonicalFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const loaded: CanonicalList[] = [];
  for (const id of LIST_IDS) {
    const list = input.lists[id].value;
    if (!list) {
      if (!input.lists[id].error) out.push(finding({ code: 'CANONICAL_LIST_MISSING', status: 'BLOCKER', domain: 'CANONICAL', title: `${id} ausente`, message: 'A lista canônica obrigatória não foi carregada.', action: 'Atualizar Bases e revisar o build ativo.', listId: id }));
      continue;
    }
    loaded.push(list);
    out.push(finding({ code: 'CANONICAL_LIST_LOADED', status: 'PASS', domain: 'CANONICAL', title: `${id} carregada`, message: `${list.records.length} registro(s) materializados.`, action: 'Nenhuma ação necessária.', count: list.records.length, listId: id, competence: list.competence }));
    out.push(...aggregateCanonicalAudits(list.errors, 'CANONICAL', id, 'BLOCKER'));
    out.push(...aggregateCanonicalAudits(list.warnings, 'CANONICAL', id, 'WARNING'));
  }
  out.push(...recordFlagFindings(loaded));
  return out;
}

function registryFindings(input: GlobalAuditInputs) {
  if (input.registry.error) return [];
  const state = input.registry.value;
  const groups: Array<{ code: string; title: string; diagnostics: RegistryDiagnostic[]; records: number }> = [
    { code: 'RCA_REGISTRY_CLEAN', title: 'Cadastros — RCAs', diagnostics: diagnoseRcaRecords((state?.rcas ?? []).filter(record => record.active)), records: state?.rcas.length ?? 0 },
    { code: 'LAUNCH_REGISTRY_CLEAN', title: 'Cadastros — Lançamentos', diagnostics: diagnoseLaunchRecords((state?.launches ?? []).filter(record => record.active)), records: state?.launches.length ?? 0 },
    { code: 'TOP_REGISTRY_CLEAN', title: 'Cadastros — Top Varejistas', diagnostics: diagnoseTopRetailRecords((state?.topRetailers ?? []).filter(record => record.active)), records: state?.topRetailers.length ?? 0 },
  ];
  const out: GlobalAuditFinding[] = [];
  for (const group of groups) {
    if (!group.diagnostics.length) out.push(finding({ code: group.code, status: 'PASS', domain: 'REGISTRIES', title: group.title, message: `Nenhum conflito/error ativo em ${group.records} registro(s).`, action: 'Nenhuma ação necessária.', count: group.records || 1 }));
    for (const diagnostic of group.diagnostics) out.push(finding({ code: diagnostic.code, status: 'BLOCKER', domain: 'REGISTRIES', title: group.title, message: diagnostic.message, action: 'Revisar Administração → Cadastros.', count: diagnostic.recordIds.length, samples: diagnostic.recordIds.slice(0, 5).map(value => ({ value })) }));
  }
  return out;
}

function targetFindings(input: GlobalAuditInputs, sellOut: SellOutViewModel | null) {
  if (input.target.error) return [];
  const out: GlobalAuditFinding[] = [];
  const state = input.target.value;
  out.push(finding({ code: 'TARGET_STATE_VALID', status: 'PASS', domain: 'TARGETS', title: 'TargetState', message: state ? 'TargetState carregado e validado pelo repository oficial.' : 'Não há TargetState persistido; ausência não foi reinterpretada como meta zero.', action: 'Nenhuma ação automática.' }));
  for (const record of state?.records ?? []) {
    const identities = [...new Set(record.rcaTargets.map(item => item.rcaCanonicalId))];
    for (const id of identities) {
      const authority = resolveTargetAuthority(state, record.competence, id);
      if (authority.ambiguous) out.push(finding({ code: 'AMBIGUOUS_TARGET', status: 'BLOCKER', domain: 'TARGETS', title: 'Meta RCA ambígua', message: `${id} possui autoridade de meta ambígua em ${record.competence}.`, action: 'Revisar Administração → Metas; nenhum vencedor foi escolhido.', competence: record.competence, scope: id }));
    }
  }
  const official = input.competence.value?.currentCompetence ?? null;
  if (official) {
    const general = competenceTargetRecord(state, official);
    const generalChecks: Array<[keyof Pick<NonNullable<typeof general>, 'sellOutTarget' | 'positivityTarget' | 'networkTarget'>, string]> = [['sellOutTarget', 'SELL_OUT_TARGET_MISSING'], ['positivityTarget', 'POSITIVITY_TARGET_MISSING'], ['networkTarget', 'NETWORK_TARGET_MISSING']];
    for (const [key, code] of generalChecks) {
      const value = general?.[key] ?? null;
      out.push(finding({ code: value === null ? code : `${code.replace('_MISSING', '')}_PRESENT`, status: value === null ? 'WARNING' : 'PASS', domain: 'TARGETS', title: key, message: value === null ? `Meta geral ${key} não está definida para ${official}.` : `Meta geral ${key} está definida como ${value}; zero é valor válido.`, action: value === null ? 'Revisar Administração → Metas.' : 'Nenhuma ação necessária.', competence: official, technicalDetails: { value } }));
    }
    if (sellOut) {
      const targetIds = new Set((input.lists.M3_MOVIMENTO_VENDAS.value?.records ?? []).filter(record => record.fact_type === 'TARGET' && (!record.competence || record.competence === official)).map(record => text(record.rca_canonical_id)).filter((value): value is string => Boolean(value)));
      const salesIds = new Set((input.lists.M3_MOVIMENTO_VENDAS.value?.records ?? []).filter(record => record.fact_type === 'SALE' && Number(record.value ?? 0) !== 0 && (!record.competence || record.competence === official)).map(record => text(record.rca_canonical_id)).filter((value): value is string => Boolean(value)));
      for (const id of salesIds) if (!targetIds.has(id)) out.push(finding({ code: 'RCA_SALE_WITHOUT_TARGET', status: 'WARNING', domain: 'TARGETS', title: 'RCA com venda sem TARGET efetivo', message: `${id} possui SALE na competência oficial, mas nenhum TARGET efetivo materializado.`, action: 'Revisar Administração → Metas.', competence: official, scope: id }));
      for (const id of targetIds) if (!salesIds.has(id)) out.push(finding({ code: 'RCA_TARGET_WITHOUT_SALE', status: 'INFO', domain: 'TARGETS', title: 'TARGET sem SALE', message: `${id} possui TARGET válido sem SALE na competência oficial.`, action: 'Nenhuma ação necessária; isso não é erro por si só.', competence: official, scope: id }));
    }
  }
  return out;
}

function competenceFindings(input: GlobalAuditInputs, sellOut: SellOutViewModel | null) {
  if (input.competence.error) return [];
  const state = input.competence.value;
  const official = state?.currentCompetence ?? null;
  const observed = sellOut?.competence ?? null;
  const compatibility = compareOfficialCompetence(official, observed);
  const messages: Record<CompetenceCompatibility, string> = {
    MATCH: 'Competência oficial e competência observada no Sell Out correspondem.',
    NO_OFFICIAL_COMPETENCE: 'Não há competência oficial selecionada.',
    MISMATCH: `Competência oficial ${official ?? '—'} diverge da observada ${observed ?? '—'}.`,
    OBSERVED_MIXED: 'O Sell Out observou mais de uma competência.',
    OBSERVED_UNRESOLVED: 'A competência observada não pôde ser resolvida.',
    NO_OBSERVED_DATA: 'Não há dados observados para comparar com a competência oficial.',
  };
  const status = compatibility === 'MATCH' ? 'PASS' : 'BLOCKER';
  const out = [finding({ code: compatibility === 'MATCH' ? 'COMPETENCE_MATCH' : compatibility, status, domain: 'COMPETENCE', title: 'Compatibilidade de competência', message: messages[compatibility], action: status === 'PASS' ? 'Nenhuma ação necessária.' : 'Revisar Administração → Competências e as fontes mensais.', competence: official ?? undefined, technicalDetails: { official, observed, compatibility } })];
  for (const record of state?.records ?? []) {
    if (record.id === official) continue;
    out.push(finding({ code: record.status === 'OPEN' ? 'ADDITIONAL_OPEN_COMPETENCE' : 'NON_CURRENT_CLOSED_COMPETENCE', status: 'INFO', domain: 'COMPETENCE', title: record.status === 'OPEN' ? 'Competência OPEN adicional' : 'Competência CLOSED não selecionada', message: `${record.id} está ${record.status} e não é a competência atual.`, action: 'Nenhuma ação necessária.', competence: record.id }));
  }
  return out;
}

function viewAuditFinding(audit: ViewAudit, domain: GlobalAuditDomain, forceBlocker = false) {
  return finding({ code: audit.code, status: forceBlocker ? 'BLOCKER' : 'WARNING', domain, title: audit.code, message: audit.message, action: audit.action, count: audit.count });
}

function sellOutAndNetworkFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const m1 = input.lists.M1_ITEM_ESTOQUE.value;
  const m2 = input.lists.M2_CLIENTE_RCA.value;
  const m3 = input.lists.M3_MOVIMENTO_VENDAS.value;
  if (!m1 || !m2 || !m3) return { findings: out, sellOut: null as SellOutViewModel | null, dashboard: null as SellOutDashboardModel | null, networks: null as TopRetailNetworksViewModel | null };
  const base = buildSellOutViewModel({ m1, m2, m3 });
  const official = input.competence.value?.currentCompetence ?? null;
  const general = official ? competenceTargetRecord(input.target.value, official) : null;
  const dashboard = buildSellOutDashboardModel({ base, m1, m3, targets: { sellOutTarget: general?.sellOutTarget ?? null, positivityTarget: general?.positivityTarget ?? null } });
  out.push(finding({ code: 'SELL_OUT_OFFICIAL_MODEL_REUSED', status: 'PASS', domain: 'SELL_OUT', title: 'Modelo oficial de Sell Out', message: 'A Auditoria usa buildSellOutViewModel e buildSellOutDashboardModel.', action: 'Nenhuma ação necessária.' }));
  out.push(...base.audits.map(audit => viewAuditFinding(audit, 'SELL_OUT')));
  for (const diagnostic of base.rcaDiagnostics) out.push(finding({ code: 'SELL_OUT_RCA_DIAGNOSTIC', status: 'WARNING', domain: 'SELL_OUT', title: diagnostic.reason, message: `${diagnostic.kind} ${diagnostic.code}: ${diagnostic.reason}.`, action: diagnostic.action, count: Math.max(1, diagnostic.saleLines), samples: diagnostic.samples.slice(0, 5).map(value => ({ value })) }));
  if (Math.abs(dashboard.lineUnclassifiedValue) > 0.005) out.push(finding({ code: 'SELL_OUT_LINE_UNCLASSIFIED', status: 'WARNING', domain: 'SELL_OUT', title: 'Valor sem linha comercial', message: `Há ${dashboard.lineUnclassifiedValue} de Sell Out não classificado nas cinco linhas.`, action: 'Revisar o vínculo de produtos/linha.', count: dashboard.lineUnclassifiedRecords || 1, samples: dashboard.lineUnclassifiedExamples.map(value => ({ value })) }));
  else out.push(finding({ code: 'SELL_OUT_LINES_CLASSIFIED', status: 'PASS', domain: 'SELL_OUT', title: 'Linhas comerciais classificadas', message: 'Não há valor residual fora das linhas comerciais.', action: 'Nenhuma ação necessária.' }));
  if (dashboard.ambiguousProductRecords > 0) out.push(finding({ code: 'AMBIGUOUS_PRODUCT_RECORDS', status: 'WARNING', domain: 'PRODUCTS', title: 'Produtos com identificador ambíguo', message: `${dashboard.ambiguousProductRecords} registro(s) possuem resolução ambígua de produto.`, action: 'Revisar os identificadores de produto; nenhum vínculo foi escolhido automaticamente.', count: dashboard.ambiguousProductRecords, samples: dashboard.ambiguousProductExamples.map(value => ({ value })) }));
  else out.push(finding({ code: 'AMBIGUOUS_PRODUCT_RECORDS_NONE', status: 'PASS', domain: 'PRODUCTS', title: 'Identificadores de produto', message: 'O dashboard não encontrou produto ambíguo.', action: 'Nenhuma ação necessária.' }));

  const financialOk = moneyClose(dashboard.totals.invoiced + dashboard.totals.toInvoice, dashboard.totals.realized);
  out.push(finding({ code: financialOk ? 'SELL_OUT_FINANCIAL_RECONCILIATION_OK' : 'SELL_OUT_FINANCIAL_RECONCILIATION_MISMATCH', status: financialOk ? 'PASS' : 'BLOCKER', domain: 'SELL_OUT', title: 'Faturado + A faturar', message: financialOk ? 'Faturado + A faturar reconcilia com o realizado do dashboard oficial.' : 'Faturado + A faturar diverge do realizado do dashboard oficial.', action: financialOk ? 'Nenhuma ação necessária.' : 'Revisar o view-model oficial antes de usar o Sell Out.', technicalDetails: { invoiced: dashboard.totals.invoiced, toInvoice: dashboard.totals.toInvoice, realized: dashboard.totals.realized } }));
  const lineTotal = dashboard.lineRows.reduce((sum, row) => sum + row.realized, 0);
  const linesOk = moneyClose(lineTotal, dashboard.totals.realized);
  out.push(finding({ code: linesOk ? 'SELL_OUT_LINE_RECONCILIATION_OK' : 'SELL_OUT_LINE_RECONCILIATION_MISMATCH', status: linesOk ? 'PASS' : 'BLOCKER', domain: 'SELL_OUT', title: 'Reconciliação das linhas comerciais', message: linesOk ? 'Linhas + não classificado reconciliam com o total.' : 'Linhas + não classificado divergem do total.', action: linesOk ? 'Nenhuma ação necessária.' : 'Revisar o dashboard oficial.', technicalDetails: { lineTotal, realized: dashboard.totals.realized } }));
  const vendorTotal = base.vendorRows.reduce((sum, row) => sum + row.realized, 0);
  const supervisorTotal = base.supervisorRows.reduce((sum, row) => sum + row.realized, 0);
  const managerialOk = moneyClose(vendorTotal, dashboard.totals.realized) && moneyClose(supervisorTotal, dashboard.totals.realized);
  out.push(finding({ code: managerialOk ? 'SELL_OUT_MANAGERIAL_RECONCILIATION_OK' : 'SELL_OUT_MANAGERIAL_RECONCILIATION_MISMATCH', status: managerialOk ? 'PASS' : 'BLOCKER', domain: 'SELL_OUT', title: 'Reconciliação gerencial RCA/supervisor', message: managerialOk ? 'RCAs e supervisores reconciliam com o total gerencial.' : 'RCAs/supervisores divergem do total gerencial.', action: managerialOk ? 'Nenhuma ação necessária.' : 'Revisar o view-model oficial.', technicalDetails: { vendorTotal, supervisorTotal, realized: dashboard.totals.realized } }));
  out.push(finding({ code: 'EXTERNAL_SELL_OUT_RECONCILIATION_NOT_EVALUATED', status: 'INFO', domain: 'SELL_OUT', title: 'Conciliação externa não avaliada', message: 'A Auditoria Global valida a consistência interna. A conciliação com relatório externo não foi executada nesta leitura.', action: 'Executar conciliação externa separadamente quando necessária.' }));

  const networks = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: general?.sellOutTarget ?? null, networkTargetTotal: general?.networkTarget ?? null });
  out.push(finding({ code: 'NETWORKS_OFFICIAL_MODEL_REUSED', status: 'PASS', domain: 'NETWORKS', title: 'Modelo oficial de Redes/Top', message: 'A Auditoria usa buildTopRetailNetworksViewModel sem reagrupar a rede.', action: 'Nenhuma ação necessária.' }));
  for (const audit of networks.audits) out.push(viewAuditFinding(audit, 'NETWORKS', audit.code.startsWith('TOP_ROUTE_COMPETENCE_')));
  const routeCompatible = !networks.audits.some(audit => audit.code.startsWith('TOP_ROUTE_COMPETENCE_'));
  if (routeCompatible) out.push(finding({ code: 'NETWORK_COMPETENCE_MATCH', status: 'PASS', domain: 'NETWORKS', title: 'Competência Top/Redes', message: `Roteiro/Top está coerente com ${networks.competence}.`, action: 'Nenhuma ação necessária.', competence: networks.competence }));
  const networkTarget = general?.networkTarget ?? null;
  if (networkTarget !== null) {
    const assigned = networks.rows.reduce((sum, row) => sum + (row.networkTarget ?? 0), 0);
    const targetOk = moneyClose(assigned, networkTarget);
    out.push(finding({ code: targetOk ? 'NETWORK_TARGET_RECONCILIATION_OK' : 'NETWORK_TARGET_RECONCILIATION_MISMATCH', status: targetOk ? 'PASS' : 'BLOCKER', domain: 'NETWORKS', title: 'Meta Redes Geral', message: targetOk ? 'A soma das metas das redes reconcilia com a Meta Redes Geral.' : 'A soma das metas das redes diverge da Meta Redes Geral.', action: targetOk ? 'Nenhuma ação necessária.' : 'Revisar Administração → Metas e o modelo oficial de Redes.', competence: official ?? undefined, technicalDetails: { assigned, networkTarget } }));
  } else out.push(finding({ code: 'NETWORK_TARGET_RECONCILIATION_NOT_APPLICABLE', status: 'INFO', domain: 'NETWORKS', title: 'Meta Redes Geral não disponível', message: 'A soma de metas de redes não foi declarada como reconciliada porque a Meta Redes Geral está ausente.', action: 'Revisar Administração → Metas.' }));
  return { findings: out, sellOut: base, dashboard, networks };
}

function stockFindings(input: GlobalAuditInputs) {
  const out: GlobalAuditFinding[] = [];
  const m1 = input.lists.M1_ITEM_ESTOQUE.value;
  const m3 = input.lists.M3_MOVIMENTO_VENDAS.value;
  const m4 = input.lists.M4_HISTORICO_TRANSICAO.value;
  if (!m1 || !m3 || !m4) return { findings: out, model: null as StockOverviewModel | null };
  const forecasts = input.reportSettings.value?.inboundForecastByInvoice ?? {};
  const model = buildStockOverviewModel({ m1, m3, m4, forecasts });
  out.push(finding({ code: 'STOCK_OVERVIEW_MODEL_REUSED', status: 'PASS', domain: 'STOCK', title: 'Modelo oficial de Estoque', message: 'A Auditoria usa buildStockOverviewModel sem reimplementar fórmulas.', action: 'Nenhuma ação necessária.' }));
  const expectedInbound = model.totals.grossInboundValue - model.totals.deductedBy12322Value - model.totals.deductedBy218Value;
  const portfolioOk = moneyClose(expectedInbound, model.totals.inboundValue);
  out.push(finding({ code: portfolioOk ? 'PORTFOLIO_RECONCILIATION_OK' : 'PORTFOLIO_RECONCILIATION_MISMATCH', status: portfolioOk ? 'PASS' : 'BLOCKER', domain: 'STOCK', title: 'Conciliação da Carteira', message: portfolioOk ? 'Carteira bruta − 12.322 − baixa adicional 218 reconcilia com o saldo final.' : 'A conciliação monetária da Carteira não fecha nos valores do modelo oficial.', action: portfolioOk ? 'Nenhuma ação necessária.' : 'Revisar a Carteira e os recebimentos 12.322/218.', technicalDetails: { grossInboundValue: model.totals.grossInboundValue, deductedBy12322Value: model.totals.deductedBy12322Value, deductedBy218Value: model.totals.deductedBy218Value, inboundValue: model.totals.inboundValue } }));
  out.push(finding({ code: model.totals.receiptOverlapInvoices > 0 ? 'PORTFOLIO_12322_218_OVERLAP' : 'PORTFOLIO_12322_218_NO_OVERLAP', status: model.totals.receiptOverlapInvoices > 0 ? 'INFO' : 'PASS', domain: 'STOCK', title: 'Sobreposição 12.322 × 218', message: model.totals.receiptOverlapInvoices > 0 ? `${model.totals.receiptOverlapInvoices} NF(s) aparecem nas duas fontes; o modelo impede baixa dupla.` : 'Nenhuma NF sobreposta foi encontrada.', action: 'Nenhuma correção automática.', count: Math.max(1, model.totals.receiptOverlapInvoices) }));
  out.push(finding({ code: model.totals.unmatchedBilledInvoices > 0 ? 'BILLED_WITHOUT_RECEIPT' : 'BILLED_WITHOUT_RECEIPT_NONE', status: model.totals.unmatchedBilledInvoices > 0 ? 'WARNING' : 'PASS', domain: 'STOCK', title: 'Faturada sem recebimento', message: model.totals.unmatchedBilledInvoices > 0 ? `${model.totals.unmatchedBilledInvoices} NF(s) faturadas ainda não possuem recebimento encontrado.` : 'Não há NF faturada pendente de recebimento no modelo.', action: model.totals.unmatchedBilledInvoices > 0 ? 'Acompanhar recebimentos; não é falha matemática.' : 'Nenhuma ação necessária.', count: Math.max(1, model.totals.unmatchedBilledInvoices) }));
  const quality: Array<[string, string, number, GlobalAuditDomain]> = [
    ['STOCK_NO_SALE_PRICE', 'Itens sem PVENDA1', model.dataQuality.noSalePriceItems, 'STOCK'],
    ['STOCK_UNCLASSIFIED_LINE', 'Itens sem linha comercial', model.dataQuality.unclassifiedItems, 'STOCK'],
    ['PORTFOLIO_ITEM_UNIT_FACTOR_UNMAPPED', 'Carteira sem item + Un/CX', model.dataQuality.inboundUnmappedRows, 'STOCK'],
    ['HISTORICAL_PRODUCT_UNMAPPED', 'Histórico sem vínculo', model.dataQuality.historicalUnmappedRows, 'STOCK'],
    ['SALE_PRODUCT_UNMAPPED', '8022 sem vínculo', model.dataQuality.currentUnmappedRows, 'STOCK'],
    ['AMBIGUOUS_PRODUCT_IDENTIFIER', 'Identificadores ambíguos', model.dataQuality.ambiguousProductIdentifiers, 'PRODUCTS'],
  ];
  for (const [code, title, count, domain] of quality) out.push(finding({ code: count > 0 ? code : `${code}_NONE`, status: count > 0 ? 'WARNING' : 'PASS', domain, title, message: count > 0 ? `${count} ocorrência(s) no StockOverviewModel.` : 'Nenhuma ocorrência no StockOverviewModel.', action: count > 0 ? 'Revisar a qualidade do vínculo indicado.' : 'Nenhuma ação necessária.', count: Math.max(1, count) }));
  for (const alert of model.alerts) out.push(finding({ code: `STOCK_ALERT_${alert.code}`, status: 'WARNING', domain: 'STOCK', title: alert.title, message: alert.detail, action: 'Revisar a condição operacional indicada; a Auditoria não corrige dados.', count: alert.count, samples: alert.examples.map(value => ({ value })) }));
  out.push(finding({ code: 'STOCK_LAUNCH_ITEMS_RECOGNIZED', status: 'INFO', domain: 'STOCK', title: 'Lançamentos reconhecidos', message: `${model.totals.launchItems} lançamento(s) reconhecido(s) no modelo de Estoque.`, action: 'Nenhuma ação automática.', count: Math.max(1, model.totals.launchItems) }));
  out.push(finding({ code: 'STOCK_OLD_AUDIT_INFORMATION_PRESERVED', status: 'PASS', domain: 'STOCK', title: 'Informação histórica da Auditoria', message: 'Conciliação, saúde, qualidade de vínculos e lançamentos permanecem representados no relatório global.', action: 'Nenhuma ação necessária.' }));
  return { findings: out, model };
}

function technicalDetails(active: ActiveCanonicalBundle | null): GlobalAuditTechnicalDetails {
  return {
    motorBuildId: active?.motorBuildId ?? null,
    engine: active?.engineVersion ?? null,
    sourceContractVersion: active?.sourceContractVersion ?? null,
    stagingManifestHash: active?.stagingManifestHash ?? null,
    adminRegistryHash: active?.adminRegistryHash ?? null,
    rcaTargetRegistryHash: active?.rcaTargetRegistryHash ?? null,
    sourceReplacementProofHash: active?.sourceReplacementProofHash ?? null,
    canonicalInputHash: active?.canonicalInputHash ?? null,
    sourceReplacements: [...(active?.sourceReplacements ?? [])],
  };
}

export async function buildGlobalAuditReport(input: GlobalAuditInputs, generatedAt = new Date().toISOString()): Promise<GlobalAuditReport> {
  const findings: GlobalAuditFinding[] = [];
  findings.push(...loadFailureFindings(input));
  findings.push(...activeBasics(input));
  findings.push(...rowAndFactCountFindings(input));
  const sourceResult = await sourceAndIdentityFindings(input);
  findings.push(...sourceResult.findings);
  findings.push(...canonicalFindings(input));
  findings.push(...registryFindings(input));
  const sellOutResult = sellOutAndNetworkFindings(input);
  findings.push(...sellOutResult.findings);
  findings.push(...targetFindings(input, sellOutResult.sellOut));
  findings.push(...competenceFindings(input, sellOutResult.sellOut));
  findings.push(...stockFindings(input).findings);
  const ordered = sortGlobalAuditFindings(findings);
  const summary = summarize(ordered);
  const sections = DOMAINS.map(domain => ({ domain, ...summarize(ordered.filter(item => item.domain === domain)) }));
  const partial = Boolean(input.stageErrors.length || Object.values(input.lists).some(result => Boolean(result.error)) || input.registry.error || input.target.error || input.competence.error || input.replacement.error || input.reportSettings.error);
  return {
    format: GLOBAL_AUDIT_FORMAT,
    generatedAt,
    activeBuild: input.active ? { ...input.active, rowCounts: { ...input.active.rowCounts }, factTypeCounts: { ...input.active.factTypeCounts }, sourceReplacements: [...(input.active.sourceReplacements ?? [])] } : null,
    overallStatus: globalAuditOverallStatus(ordered),
    partial,
    summary,
    sections,
    findings: ordered,
    technicalDetails: technicalDetails(input.active),
  };
}

export function filterGlobalAuditFindings(findings: GlobalAuditFinding[], filters: { status?: 'ALL' | GlobalAuditFindingStatus; domain?: 'ALL' | GlobalAuditDomain; query?: string }) {
  const query = (filters.query ?? '').trim().toLocaleLowerCase('pt-BR');
  return findings.filter(item => (filters.status === undefined || filters.status === 'ALL' || item.status === filters.status)
    && (filters.domain === undefined || filters.domain === 'ALL' || item.domain === filters.domain)
    && (!query || [item.code, item.source, item.message, item.action, item.competence, item.listId, item.scope].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query)));
}

export function exportGlobalAuditJson(report: GlobalAuditReport) {
  const semantic = {
    format: report.format,
    generatedAt: report.generatedAt,
    activeBuild: report.activeBuild,
    overallStatus: report.overallStatus,
    partial: report.partial,
    summary: report.summary,
    sections: report.sections,
    findings: sortGlobalAuditFindings(report.findings),
    technicalDetails: report.technicalDetails,
  };
  return JSON.stringify(semantic, null, 2);
}

export const globalAuditTestHelpers = { summarize, splitAuditFlags, aggregateCanonicalAudits, recordFlagFindings, moneyClose, technicalDetails };
