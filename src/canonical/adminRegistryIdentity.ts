import type { AdminRegistryState, LaunchRegistryRecord, RcaRegistryRecord, TopRetailRegistryRecord } from './adminRegistry';

const encoder = new TextEncoder();

async function sha256(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(value));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const nullable = (value: string | null) => value ?? null;
const byJson = <T>(items: T[]) => [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function canonicalRca(record: RcaRegistryRecord) {
  return {
    currentCode: record.currentCode,
    legacyCode: nullable(record.legacyCode),
    name: nullable(record.name),
    coordinatorCode: nullable(record.coordinatorCode),
    coordinatorName: nullable(record.coordinatorName),
    role: record.role,
    active: record.active,
    validFromCompetence: nullable(record.validFromCompetence),
    validToCompetence: nullable(record.validToCompetence),
    origin: record.origin,
  };
}

function canonicalLaunch(record: LaunchRegistryRecord) {
  return {
    winthorCode: nullable(record.winthorCode),
    ean: nullable(record.ean),
    description: nullable(record.description),
    type: nullable(record.type),
    status: nullable(record.status),
    active: record.active,
    validFromCompetence: nullable(record.validFromCompetence),
    validToCompetence: nullable(record.validToCompetence),
    origin: record.origin,
  };
}

function canonicalTop(record: TopRetailRegistryRecord) {
  return {
    competence: record.competence,
    customerCnpj: record.customerCnpj,
    network: record.network,
    banner: nullable(record.banner),
    managerCnpj: nullable(record.managerCnpj),
    groupCode: nullable(record.groupCode),
    category: nullable(record.category),
    topTarget: record.topTarget,
    active: record.active,
    origin: record.origin,
  };
}

/** Semantic registry input only. Timestamps, notes, source rows and seed metadata never affect M1-M4 identity. */
export function canonicalAdminRegistryProjection(state: AdminRegistryState | null) {
  return {
    format: 'blue-jacket-admin-registry-canonical-input/v1',
    rcas: byJson((state?.rcas ?? []).map(canonicalRca)),
    launches: byJson((state?.launches ?? []).map(canonicalLaunch)),
    topRetailers: byJson((state?.topRetailers ?? []).map(canonicalTop)),
  };
}

export async function canonicalAdminRegistryHash(state: AdminRegistryState | null) {
  return sha256(canonicalAdminRegistryProjection(state));
}

export async function canonicalInputHash(stagingManifestHash: string, adminRegistryHash: string) {
  return sha256(['blue-jacket-canonical-input/v1', stagingManifestHash, adminRegistryHash]);
}

export const adminRegistryIdentityTestHelpers = { canonicalRca, canonicalLaunch, canonicalTop, sha256 };
