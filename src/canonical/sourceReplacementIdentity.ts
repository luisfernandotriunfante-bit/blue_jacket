import { SUPPORTED_SOURCE_IDS } from './sourceContract';
import type { ReplacementStageEvidence } from './sourceReplacementRuntime';

export const STAGING_MANIFEST_FORMAT_V2 = 'blue-jacket-staging-manifest/v2' as const;
export const CANONICAL_INPUT_FORMAT_V3 = 'blue-jacket-canonical-input/v3' as const;
const encoder = new TextEncoder();

async function sha256(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(value));
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function stagingManifestProjectionV2(stages: ReplacementStageEvidence[], replacedSourceIds: string[]) {
  const replaced = new Set(replacedSourceIds);
  return [STAGING_MANIFEST_FORMAT_V2, ...SUPPORTED_SOURCE_IDS.map(sourceId => {
    if (replaced.has(sourceId)) return [sourceId, 'REPLACED'];
    const stage = stages.find(candidate => candidate.source === sourceId);
    if (!stage) throw new Error(`STAGING_MANIFEST_V2_SOURCE_MISSING:${sourceId}`);
    return [sourceId, 'PRESENT', stage.manifest.fileHash, stage.manifest.parserVersion, stage.manifest.schemaVersion];
  })];
}

export function stagingManifestHashV2(stages: ReplacementStageEvidence[], replacedSourceIds: string[]) {
  return sha256(stagingManifestProjectionV2(stages, replacedSourceIds));
}

export function canonicalInputHashV3(stagingManifestHash: string, adminRegistryHash: string, rcaTargetsHash: string, sourceReplacementProofHash: string) {
  return sha256([CANONICAL_INPUT_FORMAT_V3, stagingManifestHash, adminRegistryHash, rcaTargetsHash, sourceReplacementProofHash]);
}

export const sourceReplacementIdentityTestHelpers = { sha256 };
