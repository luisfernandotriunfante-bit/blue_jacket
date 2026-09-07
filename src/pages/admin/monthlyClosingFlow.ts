import { deviceSyncIdentity } from '../../canonical/cloudSync';
import {
  closeReferencesArchive,
  ensureCanonicalBuildArchived,
  indexedDbCanonicalHistoryRepository,
  type CanonicalHistoryArchive,
} from '../../canonical/canonicalHistory';
import {
  closeCompetenceInState,
  loadCompetenceState,
  reopenCompetenceInState,
  replaceCompetenceState,
  validateCompetenceState,
  type CompetenceState,
} from '../../canonical/competenceStore';
import { globalAuditGate, type GlobalAuditReport } from '../../canonical/globalAudit';
import { loadGlobalAuditReport } from '../../canonical/globalAuditInputs';
import {
  buildMonthlyClosingEvidence,
  monthlyClosingAuditHash,
  monthlyClosingBuildIdentity,
  previewMonthlyClosing,
  type MonthlyClosingAcknowledgement,
  type MonthlyClosingPreview,
} from '../../canonical/monthlyClosingIdentity';
import {
  activeCloseEvent,
  appendMonthlyClosingEvent,
  loadMonthlyClosingState,
  monthlyClosingEventId,
  nextCloseRevision,
  replaceMonthlyClosingState,
  validateMonthlyClosingState,
  type MonthlyClosingBuildIdentity,
  type MonthlyClosingCloseEvent,
  type MonthlyClosingReopenEvent,
  type MonthlyClosingState,
} from '../../canonical/monthlyClosingState';
import { resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from '../../canonical/runtime';
import { systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import { syncActiveBuildIfPaired } from './baseAutoSync';
import type { BaseAutoSyncResult } from './baseUpdateFlow';

export type MonthlyClosingAction = 'CLOSE' | 'REOPEN';
export type MonthlyClosingPhase = 'IDLE' | 'CHECKING' | 'PERSISTING' | 'SYNCING' | 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
export type MonthlyClosingLifecycleState = {
  phase: MonthlyClosingPhase;
  busy: boolean;
  action: MonthlyClosingAction | null;
  competence: string | null;
  revision: number | null;
  message: string;
  error: string;
};
type ActivePhase = 'CHECKING' | 'PERSISTING' | 'SYNCING';
type Listener = (state: MonthlyClosingLifecycleState) => void;
export type MonthlyClosingControls = { setPhase: (phase: ActivePhase) => void };
export type MonthlyClosingCompletion = {
  phase: 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
  action: MonthlyClosingAction;
  competence: string;
  revision: number | null;
  message: string;
  error: string;
};

const idle = (): MonthlyClosingLifecycleState => ({ phase: 'IDLE', busy: false, action: null, competence: null, revision: null, message: '', error: '' });

export function createMonthlyClosingCoordinator() {
  let state = idle();
  const listeners = new Set<Listener>();
  const publish = (patch: Partial<MonthlyClosingLifecycleState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return {
    getState: () => state,
    subscribe(listener: Listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    dismissResult() { if (state.busy) return false; state = idle(); for (const listener of listeners) listener(state); return true; },
    async run(action: MonthlyClosingAction, competence: string, operation: (controls: MonthlyClosingControls) => Promise<MonthlyClosingCompletion>) {
      if (state.busy) return { status: 'BUSY' } as const;
      publish({ ...idle(), phase: 'CHECKING', busy: true, action, competence });
      try {
        const completion = await operation({ setPhase: phase => publish({ phase }) });
        publish({ ...completion, busy: false });
        return { status: 'DONE', value: completion } as const;
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason);
        const completion: MonthlyClosingCompletion = { phase: 'FAILED', action, competence, revision: null, message: '', error };
        publish({ ...completion, busy: false });
        return { status: 'DONE', value: completion } as const;
      }
    },
  };
}

export const monthlyClosingCoordinator = createMonthlyClosingCoordinator();

export type MonthlyClosingArchiveResult = { status: 'CREATED' | 'EXISTING'; archive: CanonicalHistoryArchive };
export type MonthlyClosingFlowDependencies = {
  loadCompetence: () => CompetenceState | null;
  replaceCompetence: (state: CompetenceState | null) => CompetenceState | null;
  loadClosing: () => MonthlyClosingState | null;
  replaceClosing: (state: MonthlyClosingState | null) => MonthlyClosingState | null;
  loadAudit: () => Promise<GlobalAuditReport>;
  getActive: () => ActiveCanonicalBundle | null;
  ensureArchive: (identity: MonthlyClosingBuildIdentity) => Promise<MonthlyClosingArchiveResult>;
  deleteArchiveInternal: (archiveId: string) => Promise<void>;
  sync: (active: ActiveCanonicalBundle | null) => Promise<BaseAutoSyncResult>;
  now: () => string;
};

const defaults: MonthlyClosingFlowDependencies = {
  loadCompetence: loadCompetenceState,
  replaceCompetence: replaceCompetenceState,
  loadClosing: loadMonthlyClosingState,
  replaceClosing: replaceMonthlyClosingState,
  loadAudit: loadGlobalAuditReport,
  getActive: resolveActiveCanonicalBundle,
  ensureArchive: ensureCanonicalBuildArchived,
  deleteArchiveInternal: archiveId => indexedDbCanonicalHistoryRepository.deleteArchiveInternal(archiveId),
  sync: async active => {
    if (!deviceSyncIdentity()) return { status: 'NOT_PAIRED' };
    if (!active) throw new Error('SYNC_NO_ACTIVE_BUILD');
    return syncActiveBuildIfPaired(active.motorBuildId);
  },
  now: () => new Date().toISOString(),
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values: string[]) => [...new Set(values)].sort();

function requireCurrentOpen(state: CompetenceState | null, competence: string) {
  if (!state || state.currentCompetence !== competence || state.records.find(item => item.id === competence)?.status !== 'OPEN') throw new Error('MONTHLY_CLOSE_NOT_CURRENT');
  return validateCompetenceState(state);
}

function requireClosed(state: CompetenceState | null, competence: string) {
  if (!state || state.records.find(item => item.id === competence)?.status !== 'CLOSED') throw new Error('MONTHLY_REOPEN_NOT_CLOSED');
  return validateCompetenceState(state);
}

function verifyPair(expectedCompetence: CompetenceState, expectedClosing: MonthlyClosingState, dependencies: MonthlyClosingFlowDependencies) {
  const competence = dependencies.loadCompetence();
  const closing = dependencies.loadClosing();
  if (!competence || !closing || !same(validateCompetenceState(competence), expectedCompetence) || !same(validateMonthlyClosingState(closing), expectedClosing)) throw new Error('MONTHLY_CLOSE_PERSISTENCE_VERIFY_FAILED');
}

async function localSyncCompletion(action: MonthlyClosingAction, competence: string, revision: number, active: ActiveCanonicalBundle | null, controls: MonthlyClosingControls, dependencies: MonthlyClosingFlowDependencies): Promise<MonthlyClosingCompletion> {
  controls.setPhase('SYNCING');
  try {
    const sync = await dependencies.sync(active);
    const base = action === 'CLOSE'
      ? `Competência ${competence} fechada. Nenhuma nova competência foi selecionada automaticamente.`
      : `Competência ${competence} reaberta. Ela não foi selecionada como corrente automaticamente.`;
    return { phase: 'SUCCESS', action, competence, revision, message: sync.status === 'SYNCED' ? `${base} Sincronização concluída.` : base, error: '' };
  } catch (reason) {
    return {
      phase: 'LOCAL_SUCCESS_SYNC_FAILED', action, competence, revision,
      message: action === 'CLOSE' ? 'Competência fechada neste aparelho. A sincronização entre aparelhos falhou.' : 'Competência reaberta neste aparelho. A sincronização entre aparelhos falhou.',
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }
}

export type ExecuteMonthlyCloseInput = {
  competence: string;
  expectedAuditHash: string;
  expectedWarningIds: string[];
  warningsReviewed: boolean;
  note: string;
};

export async function executeMonthlyCloseTransaction(input: ExecuteMonthlyCloseInput, controls: MonthlyClosingControls, dependencies: MonthlyClosingFlowDependencies = defaults): Promise<MonthlyClosingCompletion> {
  controls.setPhase('CHECKING');
  const competenceBefore = requireCurrentOpen(dependencies.loadCompetence(), input.competence);
  const closingBefore = dependencies.loadClosing();
  if (closingBefore) validateMonthlyClosingState(closingBefore);
  const report = await dependencies.loadAudit();
  if (report.partial) throw new Error('MONTHLY_CLOSE_AUDIT_PARTIAL');
  if (globalAuditGate(report) === 'BLOCKED') throw new Error('MONTHLY_CLOSE_AUDIT_BLOCKED');
  const currentAuditHash = await monthlyClosingAuditHash(report);
  if (currentAuditHash !== input.expectedAuditHash) throw new Error('MONTHLY_CLOSE_AUDIT_CHANGED');
  const currentWarningIds = sorted(report.findings.filter(item => item.status === 'WARNING').map(item => item.id));
  if (!same(currentWarningIds, sorted(input.expectedWarningIds))) throw new Error('MONTHLY_CLOSE_AUDIT_CHANGED');
  const acknowledgement: MonthlyClosingAcknowledgement = { reviewed: input.warningsReviewed, warningIds: currentWarningIds, note: input.note };
  const preview = await previewMonthlyClosing(report, competenceBefore, input.competence, acknowledgement);
  if (!preview.canClose) throw new Error(preview.reason ?? 'MONTHLY_CLOSE_NOT_ALLOWED');
  const active = dependencies.getActive();
  if (!same(monthlyClosingBuildIdentity(active), preview.activeBuildIdentity)) throw new Error('MONTHLY_CLOSE_AUDIT_CHANGED');

  const competenceRecheck = requireCurrentOpen(dependencies.loadCompetence(), input.competence);
  if (!same(competenceRecheck, competenceBefore)) throw new Error('MONTHLY_CLOSE_COMPETENCE_CHANGED');
  const closingRecheck = dependencies.loadClosing();
  if (!same(closingRecheck, closingBefore)) throw new Error('MONTHLY_CLOSE_HISTORY_CHANGED');

  let archiveResult: MonthlyClosingArchiveResult;
  try {
    archiveResult = await dependencies.ensureArchive(preview.activeBuildIdentity!);
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    throw new Error(`MONTHLY_CLOSE_HISTORY_ARCHIVE_FAILED:${detail}`);
  }

  const occurredAt = dependencies.now();
  const revision = nextCloseRevision(closingBefore, input.competence);
  const evidence = await buildMonthlyClosingEvidence(report);
  const closeEvent: MonthlyClosingCloseEvent = {
    eventId: monthlyClosingEventId(input.competence, 'CLOSE', revision),
    type: 'CLOSE', competence: input.competence, revision, occurredAt,
    evidence,
    warningAcknowledgement: { acknowledged: currentWarningIds.length > 0 ? input.warningsReviewed : false, warningIds: currentWarningIds },
    note: input.note.trim() || null,
  };
  const closingAfter = appendMonthlyClosingEvent(closingBefore, closeEvent);
  const competenceAfter = closeCompetenceInState(competenceBefore, input.competence, occurredAt);

  controls.setPhase('PERSISTING');
  let localCommitted = false;
  try {
    dependencies.replaceClosing(closingAfter);
    dependencies.replaceCompetence(competenceAfter);
    verifyPair(competenceAfter, closingAfter, dependencies);
    localCommitted = true;
  } catch (reason) {
    if (!localCommitted) {
      try { dependencies.replaceClosing(closingBefore); } catch { /* original error */ }
      try { dependencies.replaceCompetence(competenceBefore); } catch { /* original error */ }
      if (archiveResult.status === 'CREATED' && !closeReferencesArchive(closingBefore, archiveResult.archive.archiveId)) {
        try { await dependencies.deleteArchiveInternal(archiveResult.archive.archiveId); } catch { /* preserve original transaction failure */ }
      }
    }
    throw reason;
  }
  return localSyncCompletion('CLOSE', input.competence, revision, active, controls, dependencies);
}

export type ExecuteMonthlyReopenInput = { competence: string; reason: string };

export async function executeMonthlyReopenTransaction(input: ExecuteMonthlyReopenInput, controls: MonthlyClosingControls, dependencies: MonthlyClosingFlowDependencies = defaults): Promise<MonthlyClosingCompletion> {
  controls.setPhase('CHECKING');
  if (!input.reason.trim()) throw new Error('MONTHLY_REOPEN_REASON_REQUIRED');
  const competenceBefore = requireClosed(dependencies.loadCompetence(), input.competence);
  const closingBefore = dependencies.loadClosing();
  if (closingBefore) validateMonthlyClosingState(closingBefore);
  const close = activeCloseEvent(closingBefore, input.competence);
  if (!close) throw new Error('MONTHLY_CLOSE_EVIDENCE_MISSING');
  const competenceRecheck = requireClosed(dependencies.loadCompetence(), input.competence);
  if (!same(competenceRecheck, competenceBefore)) throw new Error('MONTHLY_CLOSE_COMPETENCE_CHANGED');
  const closingRecheck = dependencies.loadClosing();
  if (!same(closingRecheck, closingBefore)) throw new Error('MONTHLY_CLOSE_HISTORY_CHANGED');

  const occurredAt = dependencies.now();
  const reopenEvent: MonthlyClosingReopenEvent = {
    eventId: monthlyClosingEventId(input.competence, 'REOPEN', close.revision),
    type: 'REOPEN', competence: input.competence, revision: close.revision, occurredAt,
    closeEventId: close.eventId,
    reason: input.reason.trim(),
  };
  const closingAfter = appendMonthlyClosingEvent(closingBefore, reopenEvent);
  const competenceAfter = reopenCompetenceInState(competenceBefore, input.competence, occurredAt);
  const active = dependencies.getActive();

  controls.setPhase('PERSISTING');
  let localCommitted = false;
  try {
    dependencies.replaceClosing(closingAfter);
    dependencies.replaceCompetence(competenceAfter);
    verifyPair(competenceAfter, closingAfter, dependencies);
    localCommitted = true;
  } catch (reason) {
    if (!localCommitted) {
      try { dependencies.replaceClosing(closingBefore); } catch { /* original error */ }
      try { dependencies.replaceCompetence(competenceBefore); } catch { /* original error */ }
    }
    throw reason;
  }
  return localSyncCompletion('REOPEN', input.competence, close.revision, active, controls, dependencies);
}

export async function loadMonthlyClosingPreview(competence: string, acknowledgement?: MonthlyClosingAcknowledgement, dependencies: Pick<MonthlyClosingFlowDependencies, 'loadAudit' | 'loadCompetence'> = defaults): Promise<MonthlyClosingPreview> {
  const report = await dependencies.loadAudit();
  return previewMonthlyClosing(report, dependencies.loadCompetence(), competence, acknowledgement);
}

export function runMonthlyClose(input: ExecuteMonthlyCloseInput, dependencies: MonthlyClosingFlowDependencies = defaults) {
  return systemDataOperationCoordinator.run('MONTHLY_CLOSE', async () => monthlyClosingCoordinator.run('CLOSE', input.competence, controls => executeMonthlyCloseTransaction(input, controls, dependencies)));
}

export function runMonthlyReopen(input: ExecuteMonthlyReopenInput, dependencies: MonthlyClosingFlowDependencies = defaults) {
  return systemDataOperationCoordinator.run('MONTHLY_CLOSE', async () => monthlyClosingCoordinator.run('REOPEN', input.competence, controls => executeMonthlyReopenTransaction(input, controls, dependencies)));
}

export const monthlyClosingFlowTestHelpers = { requireCurrentOpen, requireClosed, verifyPair, same, sorted };
