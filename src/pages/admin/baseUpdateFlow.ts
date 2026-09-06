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
