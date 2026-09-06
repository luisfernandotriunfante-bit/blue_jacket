import { canonicalAdminRegistryHash } from './adminRegistryIdentity';
import { loadAdminRegistryState } from './adminRegistryIndexedDb';
import type { BundleImportResult, PreparedCanonicalBundle } from './bundleStore';
import type { ActiveCanonicalBundle } from './runtime';

const V19_ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';

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
  localAdminRegistryHash?: () => Promise<string>;
};

/**
 * Um Bundle continua técnico M1-M4. v19 só é ativado diretamente quando a
 * identidade do Registry que o produziu é a mesma do Registry local. Qualquer
 * bundle v18, ou v19 de outro Registry, é reconstruído pelas fontes locais +
 * Registry local antes de a referência ativa ser alterada.
 */
export async function recoverTechnicalBundle({ currentEngineVersion, inspectBundle, persistBundle, rebuildFromStaging, activate, localAdminRegistryHash }: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const prepared = await inspectBundle();
  const imported = prepared;
  const requiresRegistryIdentity = currentEngineVersion === V19_ENGINE;
  const localRegistryHash = requiresRegistryIdentity
    ? await (localAdminRegistryHash ? localAdminRegistryHash() : canonicalAdminRegistryHash(await loadAdminRegistryState()))
    : null;
  const registryMatches = !requiresRegistryIdentity
    || (Boolean(imported.active.adminRegistryHash) && imported.active.adminRegistryHash === localRegistryHash && Boolean(imported.active.canonicalInputHash));

  if (imported.active.engineVersion === currentEngineVersion && registryMatches) {
    const persisted = await persistBundle(prepared);
    activate(persisted.active);
    return { active: persisted.active, mode: 'COMPATIBLE', imported: persisted };
  }

  let rebuilt: ActiveCanonicalBundle;
  try {
    rebuilt = await rebuildFromStaging();
  } catch (reason) {
    throw new Error(`BUNDLE_LEGACY_REBUILD_UNAVAILABLE:${String(reason)}`);
  }
  if (rebuilt.engineVersion !== currentEngineVersion) throw new Error(`BUNDLE_REBUILD_ENGINE_MISMATCH:${rebuilt.engineVersion}`);
  if (rebuilt.motorBuildId === imported.motorBuildId) throw new Error('BUNDLE_REBUILD_DID_NOT_CREATE_NEW_BUILD');
  if (rebuilt.stagingManifestHash !== imported.stagingManifestHash) throw new Error('BUNDLE_STAGING_SNAPSHOT_MISMATCH');
  if (requiresRegistryIdentity && (rebuilt.adminRegistryHash !== localRegistryHash || !rebuilt.canonicalInputHash)) throw new Error('BUNDLE_REBUILD_REGISTRY_IDENTITY_MISMATCH');
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}
