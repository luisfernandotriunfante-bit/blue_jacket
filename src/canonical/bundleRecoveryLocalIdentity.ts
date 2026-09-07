import { canonicalAdminRegistryHash } from './adminRegistryIdentity';
import { loadAdminRegistryState } from './adminRegistryIndexedDb';
import { loadSourceStaging } from './sourceImport';
import { SUPPORTED_SOURCE_IDS } from './sourceContract';
import { legacyStagingManifestHashV1 } from './sourceReplacementIdentity';
import { assertEffectiveSourceSetReady, resolveEffectiveSourceSet } from './sourceReplacementRuntime';
import {
  loadSourceReplacementState,
  sourceReplacementProofHash,
  sourceReplacementsFromCertificates,
} from './sourceReplacementState';
import { rcaTargetRegistryHash } from './targetIdentity';
import { loadTargetState } from './targetStore';

/**
 * Local orchestration for Bundle Recovery identity.
 * Storage reads stay outside the pure recoverTechnicalBundle domain function.
 */
export async function loadBundleRecoveryLocalIdentity() {
  const registry = await loadAdminRegistryState();
  const targetState = loadTargetState();
  const replacementState = loadSourceReplacementState();
  const physicalStages = (await Promise.all(SUPPORTED_SOURCE_IDS.map(source => loadSourceStaging(source))))
    .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  const effective = assertEffectiveSourceSetReady(resolveEffectiveSourceSet({
    physicalStages,
    replacementState,
    adminRegistryState: registry,
    targetState,
  }));

  return {
    localAdminRegistryHash: await canonicalAdminRegistryHash(registry),
    localRcaTargetRegistryHash: await rcaTargetRegistryHash(targetState),
    localSourceReplacementProofHash: await sourceReplacementProofHash(effective.certificates),
    localSourceReplacements: sourceReplacementsFromCertificates(effective.certificates),
    localLegacyStagingManifestHash: await legacyStagingManifestHashV1(physicalStages),
  };
}
