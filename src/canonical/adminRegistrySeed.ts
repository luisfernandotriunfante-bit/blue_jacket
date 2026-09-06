import { applyRegistrySeed, previewRegistrySeed, type AdminRegistryKind } from './adminRegistry';
import { adminRegistryRepository } from './adminRegistryIndexedDb';
import { loadSourceStaging } from './sourceImport';

export const ADMIN_REGISTRY_SEED_SOURCE: Record<AdminRegistryKind, string> = {
  rcas: 'NOVOS RCAS.xlsx',
  launches: 'lançamentos.xlsx',
  topRetailers: "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx",
};

export async function loadAdminRegistrySeedParsedSource(kind: AdminRegistryKind) {
  const source = ADMIN_REGISTRY_SEED_SOURCE[kind];
  const staging = await loadSourceStaging(source);
  if (!staging?.parsed) throw new Error(`ADMIN_REGISTRY_SEED_SOURCE_MISSING:${source}`);
  return staging.parsed;
}

export async function previewCurrentAdminRegistrySeed(kind: AdminRegistryKind) {
  const [parsed, state] = await Promise.all([
    loadAdminRegistrySeedParsedSource(kind),
    adminRegistryRepository.load(),
  ]);
  return previewRegistrySeed(kind, parsed, state);
}

export async function applyCurrentAdminRegistrySeed(kind: AdminRegistryKind) {
  const parsed = await loadAdminRegistrySeedParsedSource(kind);
  return applyRegistrySeed(adminRegistryRepository, kind, parsed);
}
