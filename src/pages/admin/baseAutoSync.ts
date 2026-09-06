import {
  deviceSyncIdentity,
  uploadCurrentDeviceSnapshot,
  type DeviceSyncIdentity,
} from '../../canonical/cloudSync';
import {
  resolveActiveCanonicalBundle,
  type ActiveCanonicalBundle,
} from '../../canonical/runtime';
import type { BaseAutoSyncResult } from './baseUpdateFlow';

type SyncedSnapshot = {
  bytes: number;
  active: ActiveCanonicalBundle;
  updatedAt: string;
};

export type BaseAutoSyncDependencies = {
  getIdentity: () => DeviceSyncIdentity | null;
  getActive: () => ActiveCanonicalBundle | null;
  upload: (identity: DeviceSyncIdentity) => Promise<SyncedSnapshot>;
};

const defaultDependencies: BaseAutoSyncDependencies = {
  getIdentity: deviceSyncIdentity,
  getActive: resolveActiveCanonicalBundle,
  upload: identity => uploadCurrentDeviceSnapshot(identity),
};

const mismatch = (expected: string, received: string | null | undefined) =>
  new Error(`SYNC_ACTIVE_BUILD_MISMATCH: expected ${expected}, received ${received ?? 'NONE'}`);

/**
 * Automatic sync used after Bases activates a build.
 * PRE-CHECK prevents uploading a stale active pointer; POST-CHECK validates the snapshot actually sent.
 */
export async function syncActiveBuildIfPaired(
  expectedMotorBuildId: string,
  dependencies: BaseAutoSyncDependencies = defaultDependencies,
): Promise<BaseAutoSyncResult> {
  const identity = dependencies.getIdentity();
  if (!identity) return { status: 'NOT_PAIRED' };

  const activeBeforeUpload = dependencies.getActive();
  if (!activeBeforeUpload || activeBeforeUpload.motorBuildId !== expectedMotorBuildId) {
    throw mismatch(expectedMotorBuildId, activeBeforeUpload?.motorBuildId);
  }

  const synced = await dependencies.upload(identity);
  if (synced.active.motorBuildId !== expectedMotorBuildId) {
    throw mismatch(expectedMotorBuildId, synced.active.motorBuildId);
  }

  return {
    status: 'SYNCED',
    bytes: synced.bytes,
    motorBuildId: synced.active.motorBuildId,
  };
}
