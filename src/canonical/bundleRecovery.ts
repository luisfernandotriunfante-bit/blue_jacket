import type { BundleImportResult } from './bundleStore';
import type { ActiveCanonicalBundle } from './runtime';

export type BundleRecoveryResult = {
  active: ActiveCanonicalBundle;
  mode: 'COMPATIBLE' | 'REBUILT';
  imported: BundleImportResult;
};

type BundleRecoveryDependencies = {
  currentEngineVersion: string;
  importBundle: () => Promise<BundleImportResult>;
  rebuildFromStaging: () => Promise<ActiveCanonicalBundle>;
  activate: (bundle: ActiveCanonicalBundle) => void;
};

/**
 * Decide e conclui a recuperação antes de alterar a referência ativa.
 * Um ZIP legado nunca é ativado; se sua reconstrução falhar, o estado anterior
 * permanece intacto porque `activate` ainda não foi chamado.
 */
export async function recoverTechnicalBundle({ currentEngineVersion, importBundle, rebuildFromStaging, activate }: BundleRecoveryDependencies): Promise<BundleRecoveryResult> {
  const imported = await importBundle();
  if (imported.active.engineVersion === currentEngineVersion) {
    activate(imported.active);
    return { active: imported.active, mode: 'COMPATIBLE', imported };
  }
  let rebuilt: ActiveCanonicalBundle;
  try {
    rebuilt = await rebuildFromStaging();
  } catch (reason) {
    throw new Error(`BUNDLE_LEGACY_REBUILD_UNAVAILABLE:${String(reason)}`);
  }
  if (rebuilt.engineVersion !== currentEngineVersion) throw new Error(`BUNDLE_REBUILD_ENGINE_MISMATCH:${rebuilt.engineVersion}`);
  if (rebuilt.motorBuildId === imported.motorBuildId) throw new Error('BUNDLE_REBUILD_DID_NOT_CREATE_NEW_BUILD');
  activate(rebuilt);
  return { active: rebuilt, mode: 'REBUILT', imported };
}
