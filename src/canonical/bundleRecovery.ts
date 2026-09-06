import { canonicalInputHash } from './adminRegistryIdentity';
import { canonicalInputHashV2 } from './targetIdentity';
import type { BundleImportResult, PreparedCanonicalBundle } from './bundleStore';
import type { ActiveCanonicalBundle } from './runtime';

const V19_ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';
const V20_ENGINE = 'browser-stage4-product-assortment-v20-targets-by-competence';

export type BundleRecoveryResult = {
  active: ActiveCanonicalBundle;
  mode: 'COMPATIBLE' | 'REBUILT';
  imported: BundleImportResult;
};

type BundleRecoveryDependencies = {
  currentEngineVersion: string;
  inspectBundle: () => Promise<PreparedCanonicalBundle>;
  persistBundle: (prepared: PreparedCanonicalBundle) => Promise<BundleImportResult>;
  rebuildFromStaging: () => Promise<ActiveCanonicalBundle>;
  activate: (bundle: ActiveCanonicalBundle) => void;
  localAdminRegistryHash?: string | (() => Promise<string>);
  localRcaTargetRegistryHash?: string | (() => Promise<string>);
};

async function resolveIdentity(value: string | (() => Promise<string>) | undefined, error: string) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return value();
  throw new Error(error);
}

/** Pure domain recovery: local administrative identities are injected by orchestration; no IndexedDB/storage reads occur here. */
export async function recoverTechnicalBundle({ currentEngineVersion, inspectBundle, persistBundle, rebuildFromStaging, activate, localAdminRegistryHash, localRcaTargetRegistryHash }: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const prepared = await inspectBundle();
  const imported = prepared;
  const requiresRegistryIdentity = currentEngineVersion === V19_ENGINE || currentEngineVersion === V20_ENGINE;
  const requiresTargetIdentity = currentEngineVersion === V20_ENGINE;
  const localRegistryHash = requiresRegistryIdentity ? await resolveIdentity(localAdminRegistryHash, 'BUNDLE_LOCAL_REGISTRY_IDENTITY_REQUIRED') : null;
  const localTargetHash = requiresTargetIdentity ? await resolveIdentity(localRcaTargetRegistryHash, 'BUNDLE_LOCAL_TARGET_IDENTITY_REQUIRED') : null;

  let importedInputValid = true;
  if (imported.active.engineVersion === V20_ENGINE) {
    importedInputValid = Boolean(imported.active.adminRegistryHash && imported.active.rcaTargetRegistryHash && imported.active.canonicalInputHash)
      && await canonicalInputHashV2(imported.active.stagingManifestHash, imported.active.adminRegistryHash!, imported.active.rcaTargetRegistryHash!) === imported.active.canonicalInputHash;
  } else if (imported.active.engineVersion === V19_ENGINE) {
    importedInputValid = Boolean(imported.active.adminRegistryHash && imported.active.canonicalInputHash)
      && await canonicalInputHash(imported.active.stagingManifestHash, imported.active.adminRegistryHash!) === imported.active.canonicalInputHash;
  }
  const registryMatches = !requiresRegistryIdentity || (importedInputValid && imported.active.adminRegistryHash === localRegistryHash);
  const targetMatches = !requiresTargetIdentity || (importedInputValid && imported.active.rcaTargetRegistryHash === localTargetHash);

  if (imported.active.engineVersion === currentEngineVersion && registryMatches && targetMatches) {
    const persisted = await persistBundle(prepared);
    activate(persisted.active);
    return { active: persisted.active, mode: 'COMPATIBLE', imported: persisted };
  }

  let rebuilt: ActiveCanonicalBundle;
  try { rebuilt = await rebuildFromStaging(); }
  catch (reason) { throw new Error(`BUNDLE_LEGACY_REBUILD_UNAVAILABLE:${String(reason)}`); }
  if (rebuilt.engineVersion !== currentEngineVersion) throw new Error(`BUNDLE_REBUILD_ENGINE_MISMATCH:${rebuilt.engineVersion}`);
  if (rebuilt.motorBuildId === imported.motorBuildId) throw new Error('BUNDLE_REBUILD_DID_NOT_CREATE_NEW_BUILD');
  if (rebuilt.stagingManifestHash !== imported.stagingManifestHash) throw new Error('BUNDLE_STAGING_SNAPSHOT_MISMATCH');
  if (requiresRegistryIdentity) {
    if (rebuilt.adminRegistryHash !== localRegistryHash || !rebuilt.canonicalInputHash) throw new Error('BUNDLE_REBUILD_REGISTRY_IDENTITY_MISMATCH');
  }
  if (requiresTargetIdentity) {
    if (rebuilt.rcaTargetRegistryHash !== localTargetHash) throw new Error('BUNDLE_REBUILD_TARGET_IDENTITY_MISMATCH');
    const expected = await canonicalInputHashV2(rebuilt.stagingManifestHash, localRegistryHash!, localTargetHash!);
    if (rebuilt.canonicalInputHash !== expected) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  } else if (currentEngineVersion === V19_ENGINE) {
    const expected = await canonicalInputHash(rebuilt.stagingManifestHash, localRegistryHash!);
    if (rebuilt.canonicalInputHash !== expected) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  }
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}
