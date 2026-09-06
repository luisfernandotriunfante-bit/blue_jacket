import type { TargetState, RcaTargetRecord } from './targetStore';

const encoder = new TextEncoder();
async function sha256(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(value));
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const byJson = <T>(items: T[]) => [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const semanticRca = (record: RcaTargetRecord) => ({
  competence: record.competence,
  rcaCanonicalId: record.rcaCanonicalId,
  sourceRcaCode: record.sourceRcaCode,
  salesTarget: record.salesTarget,
  positivityTarget: record.positivityTarget,
  active: record.active,
  origin: record.origin,
});

export function canonicalRcaTargetProjection(state: TargetState | null) {
  return {
    format: 'blue-jacket-rca-target-canonical-input/v1',
    records: byJson((state?.records ?? []).flatMap(record => record.rcaTargets.map(semanticRca))),
  };
}

export function canonicalTargetStateProjection(state: TargetState | null) {
  return {
    format: 'blue-jacket-target-state-semantic/v1',
    records: [...(state?.records ?? [])]
      .sort((a, b) => a.competence.localeCompare(b.competence))
      .map(record => ({
        competence: record.competence,
        sellOutTarget: record.sellOutTarget,
        positivityTarget: record.positivityTarget,
        networkTarget: record.networkTarget,
        rcaTargets: byJson(record.rcaTargets.map(semanticRca)),
      })),
  };
}

export const rcaTargetRegistryHash = (state: TargetState | null) => sha256(canonicalRcaTargetProjection(state));
export const targetStateHash = (state: TargetState | null) => sha256(canonicalTargetStateProjection(state));

/** v20 identity. v19 remains blue-jacket-canonical-input/v1 in adminRegistryIdentity.ts. */
export function canonicalInputHashV2(stagingManifestHash: string, adminRegistryHash: string, rcaTargetsHash: string) {
  return sha256(['blue-jacket-canonical-input/v2', stagingManifestHash, adminRegistryHash, rcaTargetsHash]);
}

export const targetIdentityTestHelpers = { sha256, semanticRca };
