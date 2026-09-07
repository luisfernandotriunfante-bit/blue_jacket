import { canonicalInputHash } from './adminRegistryIdentity';
import { canonicalInputHashV3 } from './sourceReplacementIdentity';
import { canonicalInputHashV2 } from './targetIdentity';
import type { BundleImportResult, PreparedCanonicalBundle } from './bundleStore';
import type { ActiveCanonicalBundle } from './runtime';

const V19_ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';
const V20_ENGINE = 'browser-stage4-product-assortment-v20-targets-by-competence';
const V21_ENGINE = 'browser-stage4-product-assortment-v21-source-replacement';

export type BundleRecoveryResult = {
  active: ActiveCanonicalBundle;
  mode: 'COMPATIBLE' | 'REBUILT';
  imported: BundleImportResult;
};

type SourceReplacementRef = { source: string; scope: string };
type BundleRecoveryDependencies = {
  currentEngineVersion: string;
  inspectBundle: () => Promise<PreparedCanonicalBundle>;
  persistBundle: (prepared: PreparedCanonicalBundle) => Promise<BundleImportResult>;
  rebuildFromStaging: () => Promise<ActiveCanonicalBundle>;
  activate: (bundle: ActiveCanonicalBundle) => void;
  localAdminRegistryHash?: string | (() => Promise<string>);
  localRcaTargetRegistryHash?: string | (() => Promise<string>);
  localSourceReplacementProofHash?: string | (() => Promise<string>);
  localSourceReplacements?: SourceReplacementRef[] | (() => Promise<SourceReplacementRef[]>);
  /** Legacy v19/v20 physical hash using blue-jacket staging manifest v1. */
  localLegacyStagingManifestHash?: string | (() => Promise<string>);
};

async function resolveIdentity(value: string | (() => Promise<string>) | undefined, error: string) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return value();
  throw new Error(error);
}
async function resolveReplacements(value: SourceReplacementRef[] | (() => Promise<SourceReplacementRef[]>) | undefined) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'function') return value();
  throw new Error('BUNDLE_LOCAL_REPLACEMENT_IDENTITY_REQUIRED');
}
const sameReplacements = (a: SourceReplacementRef[] | undefined, b: SourceReplacementRef[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

async function importedInputValid(active: ActiveCanonicalBundle) {
  if (active.engineVersion === V21_ENGINE) {
    return Boolean(active.adminRegistryHash && active.rcaTargetRegistryHash && active.sourceContractVersion === 'v2' && active.sourceReplacementProofHash && Array.isArray(active.sourceReplacements) && active.canonicalInputHash)
      && await canonicalInputHashV3(active.stagingManifestHash, active.adminRegistryHash!, active.rcaTargetRegistryHash!, active.sourceReplacementProofHash!) === active.canonicalInputHash;
  }
  if (active.engineVersion === V20_ENGINE) {
    return Boolean(active.adminRegistryHash && active.rcaTargetRegistryHash && active.canonicalInputHash)
      && await canonicalInputHashV2(active.stagingManifestHash, active.adminRegistryHash!, active.rcaTargetRegistryHash!) === active.canonicalInputHash;
  }
  if (active.engineVersion === V19_ENGINE) {
    return Boolean(active.adminRegistryHash && active.canonicalInputHash)
      && await canonicalInputHash(active.stagingManifestHash, active.adminRegistryHash!) === active.canonicalInputHash;
  }
  return true;
}

/** Pure domain recovery: all local identities are injected by orchestration; no storage reads occur here. */
export async function recoverTechnicalBundle({
  currentEngineVersion,
  inspectBundle,
  persistBundle,
  rebuildFromStaging,
  activate,
  localAdminRegistryHash,
  localRcaTargetRegistryHash,
  localSourceReplacementProofHash,
  localSourceReplacements,
  localLegacyStagingManifestHash,
}: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const prepared = await inspectBundle();
  const imported = prepared;
  const currentIsV21 = currentEngineVersion === V21_ENGINE;
  const requiresRegistryIdentity = currentEngineVersion === V19_ENGINE || currentEngineVersion === V20_ENGINE || currentIsV21;
  const requiresTargetIdentity = currentEngineVersion === V20_ENGINE || currentIsV21;
  const requiresReplacementIdentity = currentIsV21;
  const localRegistryHash = requiresRegistryIdentity ? await resolveIdentity(localAdminRegistryHash, 'BUNDLE_LOCAL_REGISTRY_IDENTITY_REQUIRED') : null;
  const localTargetHash = requiresTargetIdentity ? await resolveIdentity(localRcaTargetRegistryHash, 'BUNDLE_LOCAL_TARGET_IDENTITY_REQUIRED') : null;
  const localProofHash = requiresReplacementIdentity ? await resolveIdentity(localSourceReplacementProofHash, 'BUNDLE_LOCAL_REPLACEMENT_IDENTITY_REQUIRED') : null;
  const localReplacements = requiresReplacementIdentity ? await resolveReplacements(localSourceReplacements) : [];

  const inputValid = await importedInputValid(imported.active);
  const registryMatches = !requiresRegistryIdentity || (inputValid && imported.active.adminRegistryHash === localRegistryHash);
  const targetMatches = !requiresTargetIdentity || (inputValid && imported.active.rcaTargetRegistryHash === localTargetHash);
  const proofMatches = !requiresReplacementIdentity || (inputValid
    && imported.active.sourceContractVersion === 'v2'
    && imported.active.sourceReplacementProofHash === localProofHash
    && sameReplacements(imported.active.sourceReplacements, localReplacements));

  if (imported.active.engineVersion === currentEngineVersion && registryMatches && targetMatches && proofMatches) {
    const persisted = await persistBundle(prepared);
    activate(persisted.active);
    return { active: persisted.active, mode: 'COMPATIBLE', imported: persisted };
  }

  if ((imported.active.engineVersion === V19_ENGINE || imported.active.engineVersion === V20_ENGINE)) {
    const localLegacyHash = await resolveIdentity(localLegacyStagingManifestHash, 'BUNDLE_LOCAL_LEGACY_STAGING_IDENTITY_REQUIRED');
    if (imported.active.stagingManifestHash !== localLegacyHash) throw new Error('BUNDLE_STAGING_SNAPSHOT_MISMATCH');
  }

  let rebuilt: ActiveCanonicalBundle;
  try { rebuilt = await rebuildFromStaging(); }
  catch (reason) { throw new Error(`BUNDLE_LEGACY_REBUILD_UNAVAILABLE:${String(reason)}`); }
  if (rebuilt.engineVersion !== currentEngineVersion) throw new Error(`BUNDLE_REBUILD_ENGINE_MISMATCH:${rebuilt.engineVersion}`);
  if (rebuilt.motorBuildId === imported.motorBuildId) throw new Error('BUNDLE_REBUILD_DID_NOT_CREATE_NEW_BUILD');

  if (imported.active.engineVersion === V21_ENGINE && rebuilt.stagingManifestHash !== imported.stagingManifestHash) throw new Error('BUNDLE_STAGING_SNAPSHOT_MISMATCH');
  if (requiresRegistryIdentity && rebuilt.adminRegistryHash !== localRegistryHash) throw new Error('BUNDLE_REBUILD_REGISTRY_IDENTITY_MISMATCH');
  if (requiresTargetIdentity && rebuilt.rcaTargetRegistryHash !== localTargetHash) throw new Error('BUNDLE_REBUILD_TARGET_IDENTITY_MISMATCH');
  if (requiresReplacementIdentity) {
    if (rebuilt.sourceContractVersion !== 'v2' || rebuilt.sourceReplacementProofHash !== localProofHash || !sameReplacements(rebuilt.sourceReplacements, localReplacements) || !rebuilt.canonicalInputHash) throw new Error('BUNDLE_REBUILD_REPLACEMENT_IDENTITY_MISMATCH');
    const expected = await canonicalInputHashV3(rebuilt.stagingManifestHash, localRegistryHash!, localTargetHash!, localProofHash!);
    if (rebuilt.canonicalInputHash !== expected) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  } else if (requiresTargetIdentity) {
    const expected = await canonicalInputHashV2(rebuilt.stagingManifestHash, localRegistryHash!, localTargetHash!);
    if (rebuilt.canonicalInputHash !== expected) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  } else if (currentEngineVersion === V19_ENGINE) {
    const expected = await canonicalInputHash(rebuilt.stagingManifestHash, localRegistryHash!);
    if (rebuilt.canonicalInputHash !== expected) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  }
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}

export const bundleRecoveryTestHelpers = { V19_ENGINE, V20_ENGINE, V21_ENGINE, sameReplacements, importedInputValid };
