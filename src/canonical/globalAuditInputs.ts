import { loadAdminRegistryState } from './adminRegistryIndexedDb';
import { loadCandidateList } from './candidateLists';
import { loadCompetenceState } from './competenceStore';
import { buildGlobalAuditReport, type AuditLoadResult, type GlobalAuditInputs, type GlobalAuditReport } from './globalAudit';
import { loadReportSettings } from './reportSettings';
import { resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from './runtime';
import { loadSourceStaging, type StoredStage } from './sourceImport';
import { SUPPORTED_SOURCE_IDS } from './sourceContract';
import { loadSourceReplacementState } from './sourceReplacementState';
import { loadTargetState } from './targetStore';
import type { AdminRegistryState } from './adminRegistry';
import type { CompetenceState } from './competenceStore';
import type { ReportSettings } from './reportSettings';
import type { SourceReplacementState } from './sourceReplacementState';
import type { TargetState } from './targetStore';
import type { CanonicalList } from './types';

const LIST_IDS: CanonicalList['id'][] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
const reasonText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason ?? 'Erro desconhecido');

export type GlobalAuditInputDependencies = {
  loadActive: () => ActiveCanonicalBundle | null;
  loadList: (id: CanonicalList['id']) => Promise<CanonicalList>;
  loadStage: (source: string) => Promise<StoredStage | undefined>;
  loadRegistry: () => Promise<AdminRegistryState | null>;
  loadTarget: () => TargetState | null;
  loadCompetence: () => CompetenceState | null;
  loadReplacement: () => SourceReplacementState | null;
  loadReportSettings: () => ReportSettings;
};

export const globalAuditProductionDependencies: GlobalAuditInputDependencies = {
  loadActive: () => resolveActiveCanonicalBundle(),
  loadList: id => loadCandidateList(id),
  loadStage: source => loadSourceStaging(source),
  loadRegistry: () => loadAdminRegistryState(),
  loadTarget: () => loadTargetState(),
  loadCompetence: () => loadCompetenceState(),
  loadReplacement: () => loadSourceReplacementState(),
  loadReportSettings: () => loadReportSettings(),
};

async function safeAsync<T>(reader: () => Promise<T | null>): Promise<AuditLoadResult<T>> {
  try { return { value: await reader(), error: null }; }
  catch (reason) { return { value: null, error: reasonText(reason) }; }
}

function safeSync<T>(reader: () => T | null): AuditLoadResult<T> {
  try { return { value: reader(), error: null }; }
  catch (reason) { return { value: null, error: reasonText(reason) }; }
}

const sameActive = (before: ActiveCanonicalBundle | null, after: ActiveCanonicalBundle | null) => (before?.motorBuildId ?? null) === (after?.motorBuildId ?? null);

async function readOnce(deps: GlobalAuditInputDependencies): Promise<{ input: GlobalAuditInputs; activeBefore: ActiveCanonicalBundle | null; activeAfter: ActiveCanonicalBundle | null }> {
  const activeBefore = deps.loadActive();
  const listEntries = await Promise.all(LIST_IDS.map(async id => [id, await safeAsync(() => deps.loadList(id))] as const));
  const stageEntries = await Promise.all(SUPPORTED_SOURCE_IDS.map(async source => [source, await safeAsync(() => deps.loadStage(source).then(value => value ?? null))] as const));
  const [registry, target, competence, replacement, reportSettings] = await Promise.all([
    safeAsync(() => deps.loadRegistry()),
    Promise.resolve(safeSync(() => deps.loadTarget())),
    Promise.resolve(safeSync(() => deps.loadCompetence())),
    Promise.resolve(safeSync(() => deps.loadReplacement())),
    Promise.resolve(safeSync(() => deps.loadReportSettings())),
  ]);
  const activeAfter = deps.loadActive();
  const lists = Object.fromEntries(listEntries) as GlobalAuditInputs['lists'];
  const stages: StoredStage[] = [];
  const stageErrors: Array<{ source: string; error: string }> = [];
  for (const [source, result] of stageEntries) {
    if (result.error) stageErrors.push({ source, error: result.error });
    else if (result.value) stages.push(result.value);
  }
  return {
    activeBefore,
    activeAfter,
    input: { active: activeAfter, lists, stages, stageErrors, registry, target, competence, replacement, reportSettings },
  };
}

/**
 * Read-only snapshot with optimistic consistency. No global operation owner is acquired.
 * If the active motor changes while inputs are being read, the mixed snapshot is discarded
 * and a fresh read is attempted.
 */
export async function captureGlobalAuditInputs(deps: GlobalAuditInputDependencies = globalAuditProductionDependencies, maxAttempts = 3): Promise<GlobalAuditInputs> {
  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    const read = await readOnce(deps);
    if (sameActive(read.activeBefore, read.activeAfter)) return read.input;
  }
  throw new Error('GLOBAL_AUDIT_ACTIVE_CHANGED_DURING_READ');
}

export async function loadGlobalAuditReport(deps: GlobalAuditInputDependencies = globalAuditProductionDependencies): Promise<GlobalAuditReport> {
  const input = await captureGlobalAuditInputs(deps);
  return buildGlobalAuditReport(input);
}

export const globalAuditInputsTestHelpers = { safeAsync, safeSync, sameActive, readOnce, LIST_IDS };
