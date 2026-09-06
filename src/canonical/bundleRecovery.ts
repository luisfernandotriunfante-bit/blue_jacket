import { canonicalInputHash } from './adminRegistryIdentity';
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
  localAdminRegistryHash?: string | (() => Promise<string>);
};

async function resolveLocalAdminRegistryHash(value: BundleRecoveryDependencies['localAdminRegistryHash']) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return value();
  throw new Error('BUNDLE_LOCAL_REGISTRY_IDENTITY_REQUIRED');
}

/**
 * Um Bundle continua técnico M1-M4. v19 só é ativado diretamente quando a
 * identidade do Registry que o produziu é a mesma do Registry local. Qualquer
 * bundle v18, ou v19 de outro Registry, é reconstruído pelas fontes locais +
 * Registry local antes de a referência ativa ser alterada.
 *
 * Esta função é deliberadamente pura em relação à persistência administrativa:
 * o hash do Registry local é fornecido pela camada de orquestração e nunca é
 * descoberto aqui por IndexedDB ou outro storage externo.
 */
export async function recoverTechnicalBundle({ currentEngineVersion, inspectBundle, persistBundle, rebuildFromStaging, activate, localAdminRegistryHash }: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const prepared = await inspectBundle();
  const imported = prepared;
  const requiresRegistryIdentity = currentEngineVersion === V19_ENGINE;
  const localRegistryHash = requiresRegistryIdentity ? await resolveLocalAdminRegistryHash(localAdminRegistryHash) : null;

  const importedInputValid = !requiresRegistryIdentity
    || (Boolean(imported.active.adminRegistryHash)
      && Boolean(imported.active.canonicalInputHash)
      && await canonicalInputHash(imported.active.stagingManifestHash, imported.active.adminRegistryHash!) === imported.active.canonicalInputHash);
  const registryMatches = !requiresRegistryIdentity
    || (importedInputValid && imported.active.adminRegistryHash === localRegistryHash);

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
  if (requiresRegistryIdentity) {
    if (rebuilt.adminRegistryHash !== localRegistryHash || !rebuilt.canonicalInputHash) throw new Error('BUNDLE_REBUILD_REGISTRY_IDENTITY_MISMATCH');
    const expectedCanonicalInputHash = await canonicalInputHash(rebuilt.stagingManifestHash, localRegistryHash!);
    if (rebuilt.canonicalInputHash !== expectedCanonicalInputHash) throw new Error('BUNDLE_REBUILD_CANONICAL_INPUT_IDENTITY_MISMATCH');
  }
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}
