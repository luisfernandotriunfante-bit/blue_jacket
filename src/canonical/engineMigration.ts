import type { ActiveCanonicalBundle } from './runtime';

export function canonicalEngineNeedsRebuild(active: ActiveCanonicalBundle | null, currentVersion: string) {
  return Boolean(active && active.engineVersion !== currentVersion);
}

export async function rebuildForCanonicalEngine(
  active: ActiveCanonicalBundle,
  currentVersion: string,
  rebuild: () => Promise<ActiveCanonicalBundle>,
) {
  if (!canonicalEngineNeedsRebuild(active, currentVersion)) return active;
  const rebuilt = await rebuild();
  if (rebuilt.engineVersion !== currentVersion) throw new Error(`CANONICAL_ENGINE_REBUILD_VERSION_MISMATCH:${rebuilt.engineVersion}`);
  if (rebuilt.motorBuildId === active.motorBuildId) throw new Error('CANONICAL_ENGINE_REBUILD_DID_NOT_CREATE_NEW_BUILD');
  return rebuilt;
}
