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
import { canonicalAdminRegistryHash, canonicalInputHash } from '../../canonical/adminRegistryIdentity';
import { adminRegistryRepository } from '../../canonical/adminRegistryIndexedDb';
import { loadAdminRegistrySeedParsedSource } from '../../canonical/adminRegistrySeed';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../../canonical/sourceImport';
import { systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import { syncActiveBuildIfPaired } from './baseAutoSync';
import type { BaseAutoSyncResult } from './baseUpdateFlow';

export type RegistryUpdatePhase =
  | 'IDLE'
  | 'MUTATING'
  | 'BUILDING'
  | 'ACTIVATING'
  | 'SYNCING'
  | 'SUCCESS'
  | 'LOCAL_SUCCESS_SYNC_FAILED'
  | 'FAILED';

export type RegistryUpdateCoordinatorState = {
  phase: RegistryUpdatePhase;
  busy: boolean;
  status: string;
  error: string;
  motorBuildId: string | null;
  adminRegistryHash: string | null;
  canonicalInputHash: string | null;
};

type ActivePhase = 'MUTATING' | 'BUILDING' | 'ACTIVATING' | 'SYNCING';
type Completion = {
  phase: 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
  status: string;
  error: string;
  motorBuildId?: string | null;
  adminRegistryHash?: string | null;
  canonicalInputHash?: string | null;
};
type Listener = (state: RegistryUpdateCoordinatorState) => void;

const idle = (): RegistryUpdateCoordinatorState => ({
  phase: 'IDLE', busy: false, status: '', error: '', motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null,
});

export function createRegistryUpdateCoordinator() {
  let state = idle();
  const listeners = new Set<Listener>();
  const publish = (patch: Partial<RegistryUpdateCoordinatorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    dismissResult() {
      if (state.busy) return false;
      state = idle();
      for (const listener of listeners) listener(state);
      return true;
    },
    async run(operation: (controls: { setPhase: (phase: ActivePhase) => void }) => Promise<Completion>) {
      if (state.busy) return { status: 'BUSY' } as const;
      publish({ phase: 'MUTATING', busy: true, status: '', error: '', motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null });
      try {
        const completion = await operation({ setPhase: phase => publish({ phase }) });
        publish({
          phase: completion.phase,
          busy: false,
          status: completion.status,
          error: completion.error,
          motorBuildId: completion.motorBuildId ?? null,
          adminRegistryHash: completion.adminRegistryHash ?? null,
          canonicalInputHash: completion.canonicalInputHash ?? null,
        });
        return { status: 'DONE', value: completion } as const;
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason);
        const completion: Completion = { phase: 'FAILED', status: '', error };
        publish({ ...completion, busy: false, motorBuildId: null, adminRegistryHash: null, canonicalInputHash: null });
        return { status: 'DONE', value: completion } as const;
      }
    },
  };
}

export const registryUpdateCoordinator = createRegistryUpdateCoordinator();

export type RegistryUpdateRuntime = {
  getActive: () => ActiveCanonicalBundle | null;
  activate: (active: ActiveCanonicalBundle) => void;
  deactivate: () => void;
  autoSync?: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult>;
};

export type RegistryMutationResult<T> = {
  mutationResult: T;
  state: AdminRegistryState | null;
  active: ActiveCanonicalBundle;
};

export async function runCanonicalRegistryMutation<T>(mutation: () => Promise<T>, runtime: RegistryUpdateRuntime) {
  return systemDataOperationCoordinator.run('REGISTRY_UPDATE', async () => registryUpdateCoordinator.run(async controls => {
    const previousRegistry = await adminRegistryRepository.load();
    const previousActive = runtime.getActive();
    let activated = false;
    let mutationResult!: T;
    try {
      controls.setPhase('MUTATING');
      mutationResult = await mutation();
      const nextRegistry = await adminRegistryRepository.load();
      const expectedRegistryHash = await canonicalAdminRegistryHash(nextRegistry);

      controls.setPhase('BUILDING');
      const nextActive = await buildCanonicalFromStoredSources(undefined, nextRegistry);
      const expectedInputHash = await canonicalInputHash(nextActive.stagingManifestHash, expectedRegistryHash);
      if (nextActive.engineVersion !== CANONICAL_ENGINE_VERSION
        || nextActive.adminRegistryHash !== expectedRegistryHash
        || nextActive.canonicalInputHash !== expectedInputHash) throw new Error('ADMIN_REGISTRY_BUILD_IDENTITY_MISMATCH');

      controls.setPhase('ACTIVATING');
      runtime.activate(nextActive);
      activated = true;

      let sync: BaseAutoSyncResult | { status: 'SYNC_FAILED'; error: unknown } = { status: 'NOT_PAIRED' };
      controls.setPhase('SYNCING');
      try {
        sync = runtime.autoSync ? await runtime.autoSync(nextActive) : await syncActiveBuildIfPaired(nextActive.motorBuildId);
      } catch (error) {
        sync = { status: 'SYNC_FAILED', error };
      }

      const localStatus = `ALTERAÇÃO CANÔNICA CONCLUÍDA — Build ativo: ${nextActive.motorBuildId}.`;
      if (sync.status === 'SYNC_FAILED') {
        return {
          phase: 'LOCAL_SUCCESS_SYNC_FAILED' as const,
          status: `${localStatus} A cópia local foi preservada, mas a sincronização não foi enviada.`,
          error: sync.error instanceof Error ? sync.error.message : String(sync.error),
          motorBuildId: nextActive.motorBuildId,
          adminRegistryHash: nextActive.adminRegistryHash ?? null,
          canonicalInputHash: nextActive.canonicalInputHash ?? null,
        };
      }
      return {
        phase: 'SUCCESS' as const,
        status: sync.status === 'SYNCED' ? `${localStatus} Sincronização entre aparelhos concluída.` : localStatus,
        error: '',
        motorBuildId: nextActive.motorBuildId,
        adminRegistryHash: nextActive.adminRegistryHash ?? null,
        canonicalInputHash: nextActive.canonicalInputHash ?? null,
      };
    } catch (reason) {
      if (!activated) {
        try {
          await adminRegistryRepository.replace(previousRegistry);
          if (previousActive) runtime.activate(previousActive); else runtime.deactivate();
        } catch { /* keep original failure as the actionable error */ }
      }
      throw reason;
    }
  }));
}

export function canonicalRegistryActions(runtime: RegistryUpdateRuntime) {
  return {
    upsertRca: (input: RcaManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualRca(adminRegistryRepository, input, id), runtime),
    upsertLaunch: (input: LaunchManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualLaunch(adminRegistryRepository, input, id), runtime),
    upsertTopRetail: (input: TopManualInput, id?: string) => runCanonicalRegistryMutation(() => upsertManualTopRetail(adminRegistryRepository, input, id), runtime),
    setActive: (kind: AdminRegistryKind, id: string, active: boolean) => runCanonicalRegistryMutation(() => setRegistryRecordActive(adminRegistryRepository, kind, id, active), runtime),
    applySeed: (kind: AdminRegistryKind) => runCanonicalRegistryMutation(async () => {
      const parsed = await loadAdminRegistrySeedParsedSource(kind);
      return applyRegistrySeed(adminRegistryRepository, kind, parsed);
    }, runtime),
  };
}
