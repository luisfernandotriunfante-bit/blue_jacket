import type { BundleImportResult, PreparedCanonicalBundle } from './bundleStore';
import type { ActiveCanonicalBundle } from './runtime';

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
};

/**
 * Decide e conclui a recuperação antes de alterar a referência ativa.
 * Um ZIP legado nunca é ativado; se sua reconstrução falhar, o estado anterior
 * permanece intacto porque `activate` ainda não foi chamado.
 */
export async function recoverTechnicalBundle({ currentEngineVersion, inspectBundle, persistBundle, rebuildFromStaging, activate }: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const prepared = await inspectBundle();
  const imported = prepared;
  if (imported.active.engineVersion === currentEngineVersion) {
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
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}
