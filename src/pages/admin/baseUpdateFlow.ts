export type BaseAutoSyncResult =
  | { status: 'NOT_PAIRED' }
  | { status: 'SYNCED'; bytes: number; motorBuildId: string };

export type BasePostActivationResult = BaseAutoSyncResult | { status: 'SYNC_FAILED'; error: unknown };

export async function activateBuildAndWaitForAutoSync<T extends { motorBuildId: string }>(
  build: T,
  activate: (build: T) => void,
  autoSync?: (build: T) => Promise<BaseAutoSyncResult>,
): Promise<BasePostActivationResult> {
  activate(build);
  if (!autoSync) return { status: 'NOT_PAIRED' };

  try {
    const result = await autoSync(build);
    if (result.status === 'SYNCED' && result.motorBuildId !== build.motorBuildId) {
      throw new Error(`SYNC_ACTIVE_BUILD_MISMATCH: expected ${build.motorBuildId}, received ${result.motorBuildId}`);
    }
    return result;
  } catch (error) {
    return { status: 'SYNC_FAILED', error };
  }
}

export function baseUpdateCompletionStatus(localStatus: string, sync: BasePostActivationResult) {
  if (sync.status === 'SYNCED') return `${localStatus} Sincronização entre aparelhos concluída.`;
  if (sync.status === 'SYNC_FAILED') return `${localStatus} A cópia local foi preservada, mas a sincronização não foi enviada.`;
  return localStatus;
}

export function createBaseUpdateSerialGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    async run<T>(operation: () => Promise<T>) {
      if (busy) return { status: 'BUSY' } as const;
      busy = true;
      try {
        return { status: 'DONE', value: await operation() } as const;
      } finally {
        busy = false;
      }
    },
  };
}

export type BaseUpdatePhase =
  | 'IDLE'
  | 'PROCESSING'
  | 'ACTIVATING'
  | 'SYNCING'
  | 'SUCCESS'
  | 'LOCAL_SUCCESS_SYNC_FAILED'
  | 'FAILED';

export type BaseUpdateProgress = { phase: string; message: string };

export type BaseUpdateCoordinatorState = {
  phase: BaseUpdatePhase;
  busy: boolean;
  status: string;
  error: string;
  progress: BaseUpdateProgress | null;
};

export type BaseUpdateCompletion = {
  phase: 'SUCCESS' | 'LOCAL_SUCCESS_SYNC_FAILED' | 'FAILED';
  status: string;
  error: string;
};

type ActiveBaseUpdatePhase = 'PROCESSING' | 'ACTIVATING' | 'SYNCING';

type BaseUpdateControls = {
  setPhase: (phase: ActiveBaseUpdatePhase) => void;
  setProgress: (progress: BaseUpdateProgress | null) => void;
};

type BaseUpdateListener = (state: BaseUpdateCoordinatorState) => void;

const idleState = (): BaseUpdateCoordinatorState => ({
  phase: 'IDLE',
  busy: false,
  status: '',
  error: '',
  progress: null,
});

/**
 * Application-lifetime coordinator for source updates. Its module singleton survives
 * BasesPage unmount/remount and keeps both single-flight state and the last result.
 */
export function createBaseUpdateCoordinator() {
  let state = idleState();
  const listeners = new Set<BaseUpdateListener>();

  const publish = (patch: Partial<BaseUpdateCoordinatorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  return {
    getState: () => state,
    subscribe(listener: BaseUpdateListener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    dismissResult() {
      if (state.busy) return false;
      state = idleState();
      for (const listener of listeners) listener(state);
      return true;
    },
    async run(operation: (controls: BaseUpdateControls) => Promise<BaseUpdateCompletion>) {
      if (state.busy) return { status: 'BUSY' } as const;

      publish({ phase: 'PROCESSING', busy: true, status: '', error: '', progress: null });
      const controls: BaseUpdateControls = {
        setPhase: phase => publish({ phase, progress: phase === 'PROCESSING' ? state.progress : null }),
        setProgress: progress => publish({ progress }),
      };

      try {
        const completion = await operation(controls);
        publish({
          phase: completion.phase,
          busy: false,
          status: completion.status,
          error: completion.error,
          progress: null,
        });
        return { status: 'DONE', value: completion } as const;
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason);
        const completion: BaseUpdateCompletion = { phase: 'FAILED', status: '', error };
        publish({ ...completion, busy: false, progress: null });
        return { status: 'DONE', value: completion } as const;
      }
    },
  };
}

export const baseUpdateCoordinator = createBaseUpdateCoordinator();
