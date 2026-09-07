import {
  applyRegistrySeed,
  setRegistryRecordActive,
  upsertManualLaunch,
  upsertManualRca,
  upsertManualTopRetail,
  type AdminRegistryKind,
  type AdminRegistryState,
  type LaunchManualInput,
  type RcaManualInput,
  type TopManualInput,
} from '../../canonical/adminRegistry';
import { canonicalAdminRegistryHash } from '../../canonical/adminRegistryIdentity';
import { adminRegistryRepository } from '../../canonical/adminRegistryIndexedDb';
import { loadAdminRegistrySeedParsedSource } from '../../canonical/adminRegistrySeed';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../../canonical/sourceImport';
import { canonicalInputHashV3 } from '../../canonical/sourceReplacementIdentity';
import { systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import { rcaTargetRegistryHash } from '../../canonical/targetIdentity';
import { loadTargetState, type TargetState } from '../../canonical/targetStore';
import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import { syncActiveBuildIfPaired } from './baseAutoSync';
import type { BaseAutoSyncResult } from './baseUpdateFlow';

export type RegistryUpdatePhase = 'IDLE' | 'MUTATING' | 'BUILDING' | 'ACTIVATING' | 'SYNCING' | 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
export type RegistryUpdateCoordinatorState = { phase: RegistryUpdatePhase; busy: boolean; status: string; error: string; motorBuildId: string | null; adminRegistryHash: string | null; canonicalInputHash: string | null };
type ActivePhase = 'MUTATING' | 'BUILDING' | 'ACTIVATING' | 'SYNCING';
export type RegistryUpdateCompletion = { phase: 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED'; status: string; error: string; motorBuildId?: string | null; adminRegistryHash?: string | null; canonicalInputHash?: string | null };
type Listener = (state: RegistryUpdateCoordinatorState) => void;
export type RegistryUpdateControls = { setPhase: (phase: ActivePhase) => void };
const idle = (): RegistryUpdateCoordinatorState => ({ phase: 'IDLE', busy: false, status: '', error: '', motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null });

export function createRegistryUpdateCoordinator() {
  let state = idle(); const listeners = new Set<Listener>();
  const publish = (patch: Partial<RegistryUpdateCoordinatorState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return {
    getState: () => state,
    subscribe(listener: Listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    dismissResult() { if (state.busy) return false; state = idle(); for (const listener of listeners) listener(state); return true; },
    async run(operation: (controls: RegistryUpdateControls) => Promise<RegistryUpdateCompletion>) {
      if (state.busy) return { status: 'BUSY' } as const;
      publish({ phase: 'MUTATING', busy: true, status: '', error: '', motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null });
      try {
        const completion = await operation({ setPhase: phase => publish({ phase }) });
        publish({ phase: completion.phase, busy: false, status: completion.status, error: completion.error, motorBuildId: completion.motorBuildId ?? null, adminRegistryHash: completion.adminRegistryHash ?? null, canonicalInputHash: completion.canonicalInputHash ?? null });
        return { status: 'DONE', value: completion } as const;
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason); const completion: RegistryUpdateCompletion = { phase: 'FAILED', status: '', error };
        publish({ ...completion, busy: false, motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null });
        return { status: 'DONE', value: completion } as const;
      }
    },
  };
}
export const registryUpdateCoordinator = createRegistryUpdateCoordinator();

export type RegistryUpdateRuntime = { getActive: () => ActiveCanonicalBundle | null; activate: (active: ActiveCanonicalBundle) => void; deactivate: () => void; autoSync?: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult> };
export type RegistryTransactionDependencies = {
  loadRegistry: () => Promise<AdminRegistryState | null>;
  replaceRegistry: (state: AdminRegistryState | null) => Promise<AdminRegistryState | null>;
  loadTargetState: () => TargetState | null;
  build: (registry: AdminRegistryState | null) => Promise<ActiveCanonicalBundle>;
  registryHash: (state: AdminRegistryState | null) => Promise<string>;
  targetHash: (state: TargetState | null) => Promise<string>;
  inputHash: (sourceHash: string, registryHash: string, targetHash: string, replacementProofHash: string) => Promise<string>;
  sync: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult>;
  engineVersion: string;
};

const defaultTransactionDependencies: RegistryTransactionDependencies = {
  loadRegistry: () => adminRegistryRepository.load(),
  replaceRegistry: state => adminRegistryRepository.replace(state),
  loadTargetState,
  build: registry => buildCanonicalFromStoredSources(undefined, registry),
  registryHash: canonicalAdminRegistryHash,
  targetHash: rcaTargetRegistryHash,
  inputHash: canonicalInputHashV3,
  sync: active => syncActiveBuildIfPaired(active.motorBuildId),
  engineVersion: CANONICAL_ENGINE_VERSION,
};

/** Cadastros rebuilds v21 against current TargetState and current certified-source state. Coverage broken by a Registry edit blocks before activation. */
export async function executeRegistryUpdateTransaction<T>(mutation: () => Promise<T>, runtime: RegistryUpdateRuntime, controls: RegistryUpdateControls, dependencies: RegistryTransactionDependencies = defaultTransactionDependencies): Promise<RegistryUpdateCompletion> {
  const previousRegistry = await dependencies.loadRegistry(); const previousActive = runtime.getActive(); let activated = false;
  try {
    controls.setPhase('MUTATING'); await mutation();
    const nextRegistry = await dependencies.loadRegistry(); const targetState = dependencies.loadTargetState();
    const expectedRegistryHash = await dependencies.registryHash(nextRegistry); const expectedTargetHash = await dependencies.targetHash(targetState);
    controls.setPhase('BUILDING');
    const nextActive = await dependencies.build(nextRegistry);
    if (nextActive.sourceContractVersion !== 'v2' || !nextActive.sourceReplacementProofHash) throw new Error('ADMIN_REGISTRY_BUILD_REPLACEMENT_IDENTITY_MISSING');
    const expectedInputHash = await dependencies.inputHash(nextActive.stagingManifestHash, expectedRegistryHash, expectedTargetHash, nextActive.sourceReplacementProofHash);
    if (nextActive.engineVersion !== dependencies.engineVersion || nextActive.adminRegistryHash !== expectedRegistryHash || nextActive.rcaTargetRegistryHash !== expectedTargetHash || nextActive.canonicalInputHash !== expectedInputHash) throw new Error('ADMIN_REGISTRY_BUILD_IDENTITY_MISMATCH');
    controls.setPhase('ACTIVATING'); runtime.activate(nextActive); activated = true;
    controls.setPhase('SYNCING');
    let sync: BaseAutoSyncResult | { status: 'SYNC_FAILED'; error: unknown };
    try { sync = runtime.autoSync ? await runtime.autoSync(nextActive) : await dependencies.sync(nextActive); } catch (error) { sync = { status: 'SYNC_FAILED', error }; }
    const localStatus = `ALTERAÇÃO CANÔNICA CONCLUÍDA — Build ativo: ${nextActive.motorBuildId}.`;
    if (sync.status === 'SYNC_FAILED') return { phase: 'LOCAL_SUCCESS_SYNC_FAILED', status: `${localStatus} A cópia local foi preservada, mas a sincronização não foi enviada.`, error: sync.error instanceof Error ? sync.error.message : String(sync.error), motorBuildId: nextActive.motorBuildId, adminRegistryHash: nextActive.adminRegistryHash ?? null, canonicalInputHash: nextActive.canonicalInputHash ?? null };
    return { phase: 'SUCCESS', status: sync.status === 'SYNCED' ? `${localStatus} Sincronização entre aparelhos concluída.` : localStatus, error: '', motorBuildId: nextActive.motorBuildId, adminRegistryHash: nextActive.adminRegistryHash ?? null, canonicalInputHash: nextActive.canonicalInputHash ?? null };
  } catch (reason) {
    if (!activated) { try { await dependencies.replaceRegistry(previousRegistry); if (previousActive) runtime.activate(previousActive); else runtime.deactivate(); } catch { /* original */ } }
    throw reason;
  }
}

export async function runCanonicalRegistryMutation<T>(mutation: () => Promise<T>, runtime: RegistryUpdateRuntime) { return systemDataOperationCoordinator.run('REGISTRY_UPDATE', async () => registryUpdateCoordinator.run(controls => executeRegistryUpdateTransaction(mutation, runtime, controls))); }
export function canonicalRegistryActions(runtime: RegistryUpdateRuntime) {
  return {
    upsertRca: (input: RcaManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualRca(adminRegistryRepository, input, id), runtime),
    upsertLaunch: (input: LaunchManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualLaunch(adminRegistryRepository, input, id), runtime),
    upsertTopRetail: (input: TopManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualTopRetail(adminRegistryRepository, input, id), runtime),
    setActive: (kind: AdminRegistryKind, id: string, active: boolean) => runCanonicalRegistryMutation(() => setRegistryRecordActive(adminRegistryRepository, kind, id, active), runtime),
    applySeed: (kind: AdminRegistryKind) => runCanonicalRegistryMutation(async () => applyRegistrySeed(adminRegistryRepository, kind, await loadAdminRegistrySeedParsedSource(kind)), runtime),
  };
}