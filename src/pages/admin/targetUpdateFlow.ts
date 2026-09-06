import { competenceRecord, loadCompetenceState, type CompetenceState } from '../../canonical/competenceStore';
import { loadReportSettings, restoreReportSettings } from '../../canonical/reportSettings';
import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../../canonical/sourceImport';
import { systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import { canonicalInputHashV2, rcaTargetRegistryHash, targetStateHash } from '../../canonical/targetIdentity';
import { applyBussolaTargetSeedPreview, previewBussolaTargetSeed, type TargetSeedPreview } from '../../canonical/targetSeed';
import {
  loadTargetState,
  targetStateRepository,
  withGeneralTargets,
  withManualRcaTarget,
  withRcaTargetActive,
  type ManualRcaTargetInput,
  type TargetState,
} from '../../canonical/targetStore';
import { syncActiveBuildIfPaired } from './baseAutoSync';
import type { BaseAutoSyncResult } from './baseUpdateFlow';

export type TargetUpdatePhase = 'IDLE' | 'MUTATING' | 'BUILDING' | 'ACTIVATING' | 'SYNCING' | 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
export type TargetUpdateCoordinatorState = {
  phase: TargetUpdatePhase;
  busy: boolean;
  status: string;
  error: string;
  motorBuildId: string | null;
  targetStateHash: string | null;
  rcaTargetRegistryHash: string | null;
  canonicalInputHash: string | null;
};
type ActivePhase = 'MUTATING' | 'BUILDING' | 'ACTIVATING' | 'SYNCING';
export type TargetUpdateControls = { setPhase: (phase: ActivePhase) => void };
export type TargetUpdateCompletion = {
  phase: 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
  status: string;
  error: string;
  motorBuildId?: string | null;
  targetStateHash?: string | null;
  rcaTargetRegistryHash?: string | null;
  canonicalInputHash?: string | null;
};
type Listener = (state: TargetUpdateCoordinatorState) => void;

const idle = (): TargetUpdateCoordinatorState => ({ phase: 'IDLE', busy: false, status: '', error: '', motorBuildId: null, targetStateHash: null, rcaTargetRegistryHash: null, canonicalInputHash: null });

export function createTargetUpdateCoordinator() {
  let state = idle();
  const listeners = new Set<Listener>();
  const publish = (patch: Partial<TargetUpdateCoordinatorState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return {
    getState: () => state,
    subscribe(listener: Listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    dismissResult() { if (state.busy) return false; state = idle(); for (const listener of listeners) listener(state); return true; },
    async run(operation: (controls: TargetUpdateControls) => Promise<TargetUpdateCompletion>) {
      if (state.busy) return { status: 'BUSY' } as const;
      publish({ ...idle(), phase: 'MUTATING', busy: true });
      try {
        const completion = await operation({ setPhase: phase => publish({ phase }) });
        publish({ phase: completion.phase, busy: false, status: completion.status, error: completion.error, motorBuildId: completion.motorBuildId ?? null, targetStateHash: completion.targetStateHash ?? null, rcaTargetRegistryHash: completion.rcaTargetRegistryHash ?? null, canonicalInputHash: completion.canonicalInputHash ?? null });
        return { status: 'DONE', value: completion } as const;
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason);
        const completion: TargetUpdateCompletion = { phase: 'FAILED', status: '', error };
        publish({ ...completion, busy: false, motorBuildId: null, targetStateHash: null, rcaTargetRegistryHash: null, canonicalInputHash: null });
        return { status: 'DONE', value: completion } as const;
      }
    },
  };
}

export const targetUpdateCoordinator = createTargetUpdateCoordinator();

export type TargetUpdateRuntime = {
  getActive: () => ActiveCanonicalBundle | null;
  activate: (active: ActiveCanonicalBundle) => void;
  deactivate: () => void;
  autoSync?: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult>;
};

export type TargetTransactionDependencies = {
  loadTarget: () => TargetState | null;
  replaceTarget: (state: TargetState | null) => TargetState | null;
  loadCompetence: () => CompetenceState | null;
  build: (target: TargetState | null) => Promise<ActiveCanonicalBundle>;
  targetHash: (target: TargetState | null) => Promise<string>;
  rcaHash: (target: TargetState | null) => Promise<string>;
  inputHash: (sourceHash: string, registryHash: string, targetHash: string) => Promise<string>;
  sync: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult>;
  engineVersion: string;
};
const defaults: TargetTransactionDependencies = {
  loadTarget: loadTargetState,
  replaceTarget: state => targetStateRepository.replace(state),
  loadCompetence: loadCompetenceState,
  build: target => buildCanonicalFromStoredSources(undefined, undefined, target),
  targetHash: targetStateHash,
  rcaHash: rcaTargetRegistryHash,
  inputHash: canonicalInputHashV2,
  sync: active => syncActiveBuildIfPaired(active.motorBuildId),
  engineVersion: CANONICAL_ENGINE_VERSION,
};

export function assertTargetCompetenceOpen(competence: string, state: CompetenceState | null) {
  if (competenceRecord(state, competence)?.status !== 'OPEN') throw new Error('TARGET_COMPETENCE_NOT_OPEN');
}

export async function executeTargetUpdateTransaction(
  competence: string,
  mutation: (current: TargetState | null) => Promise<TargetState> | TargetState,
  runtime: TargetUpdateRuntime,
  controls: TargetUpdateControls,
  dependencies: TargetTransactionDependencies = defaults,
): Promise<TargetUpdateCompletion> {
  const previousTarget = dependencies.loadTarget();
  const previousActive = runtime.getActive();
  const previousRcaHash = await dependencies.rcaHash(previousTarget);
  let activated = false;
  try {
    controls.setPhase('MUTATING');
    const next = await mutation(previousTarget ? structuredClone(previousTarget) : null);
    // Race guard: the competence status is re-read immediately before persistence.
    assertTargetCompetenceOpen(competence, dependencies.loadCompetence());
    dependencies.replaceTarget(next);
    const verified = dependencies.loadTarget();
    const fullHash = await dependencies.targetHash(verified);
    const nextRcaHash = await dependencies.rcaHash(verified);
    const requiresRebuild = previousRcaHash !== nextRcaHash;

    let active = runtime.getActive();
    if (requiresRebuild) {
      controls.setPhase('BUILDING');
      const rebuilt = await dependencies.build(verified);
      if (!rebuilt.adminRegistryHash || rebuilt.engineVersion !== dependencies.engineVersion || rebuilt.rcaTargetRegistryHash !== nextRcaHash) throw new Error('TARGET_BUILD_IDENTITY_MISMATCH');
      const expectedInput = await dependencies.inputHash(rebuilt.stagingManifestHash, rebuilt.adminRegistryHash, nextRcaHash);
      if (rebuilt.canonicalInputHash !== expectedInput) throw new Error('TARGET_BUILD_IDENTITY_MISMATCH');
      controls.setPhase('ACTIVATING');
      runtime.activate(rebuilt);
      activated = true;
      active = rebuilt;
    }

    if (active) {
      controls.setPhase('SYNCING');
      let sync: BaseAutoSyncResult | { status: 'SYNC_FAILED'; error: unknown };
      try { sync = runtime.autoSync ? await runtime.autoSync(active) : await dependencies.sync(active); }
      catch (error) { sync = { status: 'SYNC_FAILED', error }; }
      const localStatus = requiresRebuild ? `METAS RCA SALVAS — Build ativo: ${active.motorBuildId}.` : 'METAS GERAIS SALVAS — nenhum rebuild canônico foi necessário.';
      if (sync.status === 'SYNC_FAILED') return { phase: 'LOCAL_SUCCESS_SYNC_FAILED', status: `${localStatus} A cópia local foi preservada; a sincronização falhou.`, error: sync.error instanceof Error ? sync.error.message : String(sync.error), motorBuildId: active.motorBuildId, targetStateHash: fullHash, rcaTargetRegistryHash: nextRcaHash, canonicalInputHash: active.canonicalInputHash ?? null };
      return { phase: 'SUCCESS', status: sync.status === 'SYNCED' ? `${localStatus} Sincronização concluída.` : localStatus, error: '', motorBuildId: active.motorBuildId, targetStateHash: fullHash, rcaTargetRegistryHash: nextRcaHash, canonicalInputHash: active.canonicalInputHash ?? null };
    }

    return { phase: 'SUCCESS', status: 'METAS SALVAS — nenhum build ativo estava disponível para sincronização.', error: '', motorBuildId: null, targetStateHash: fullHash, rcaTargetRegistryHash: nextRcaHash, canonicalInputHash: null };
  } catch (reason) {
    if (!activated) {
      try {
        dependencies.replaceTarget(previousTarget);
        if (previousActive) runtime.activate(previousActive); else runtime.deactivate();
      } catch { /* original error remains actionable */ }
    }
    throw reason;
  }
}

export function runCanonicalTargetMutation(competence: string, mutation: (current: TargetState | null) => Promise<TargetState> | TargetState, runtime: TargetUpdateRuntime) {
  return systemDataOperationCoordinator.run('TARGET_UPDATE', async () => targetUpdateCoordinator.run(controls => executeTargetUpdateTransaction(competence, mutation, runtime, controls)));
}

export function canonicalTargetActions(runtime: TargetUpdateRuntime) {
  return {
    saveGeneral: (competence: string, input: { sellOutTarget: number | null; positivityTarget: number | null; networkTarget: number | null }) => runCanonicalTargetMutation(competence, current => withGeneralTargets(current, competence, input), runtime),
    upsertRca: (input: ManualRcaTargetInput, id?: string) => runCanonicalTargetMutation(input.competence, current => withManualRcaTarget(current, input, id), runtime),
    setRcaActive: (competence: string, id: string, active: boolean) => runCanonicalTargetMutation(competence, current => withRcaTargetActive(current, competence, id, active), runtime),
    applySeed: (competence: string, preview: TargetSeedPreview) => runCanonicalTargetMutation(competence, current => applyBussolaTargetSeedPreview(current, preview), runtime),
    previewSeed: (competence: string) => previewBussolaTargetSeed(competence, loadTargetState()),
  };
}

/** Explicit migration only. The legacy field is cleared after TargetState was written and reread successfully. */
export async function migrateLegacyGeneralTarget(kind: 'sellOut' | 'positivity', competence: string, runtime: TargetUpdateRuntime) {
  const settingsBefore = loadReportSettings();
  const value = kind === 'sellOut' ? settingsBefore.legacySellOutTarget : settingsBefore.legacyPositivityTarget;
  if (value === null) throw new Error('TARGET_LEGACY_VALUE_MISSING');
  const currentGeneral = loadTargetState()?.records.find(record => record.competence === competence);
  const result = await runCanonicalTargetMutation(competence, current => withGeneralTargets(current, competence, {
    sellOutTarget: kind === 'sellOut' ? value : currentGeneral?.sellOutTarget ?? null,
    positivityTarget: kind === 'positivity' ? value : currentGeneral?.positivityTarget ?? null,
    networkTarget: currentGeneral?.networkTarget ?? null,
  }), runtime);
  if (result.status === 'DONE' && result.value.status === 'DONE' && result.value.value.phase !== 'FAILED') {
    const next = loadReportSettings();
    if (kind === 'sellOut') next.legacySellOutTarget = null; else next.legacyPositivityTarget = null;
    restoreReportSettings(next);
  }
  return result;
}
