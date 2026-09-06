import type { AdminRegistryState, LaunchRegistryRecord, TopRetailRegistryRecord } from './adminRegistry';
import type { CanonicalAudit, ParsedSource, RawTyped } from './types';

export type RegistryAuthority = 'MANUAL_REGISTRY' | 'ADMIN_REGISTRY' | 'IMPORTED_SOURCE' | 'NONE';
export type AuthorityResolution<T> = {
  record: T | null;
  authority: RegistryAuthority;
  registryRecordId: string | null;
  tombstone: boolean;
  ambiguous: boolean;
  validityUnresolved: boolean;
};

const typed = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? null;
const codeKey = (value: unknown) => {
  const raw = String(value ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '');
  if (!raw) return '';
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
};
const eanKey = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12) return `0${digits}`;
  return digits.length === 13 ? digits : digits.length === 14 ? digits : '';
};
const semanticLaunch = (record: LaunchRegistryRecord) => JSON.stringify({
  winthorCode: record.winthorCode, ean: record.ean, description: record.description, type: record.type,
  status: record.status, active: record.active, validFromCompetence: record.validFromCompetence,
  validToCompetence: record.validToCompetence, origin: record.origin,
});
const semanticTop = (record: TopRetailRegistryRecord) => JSON.stringify({
  competence: record.competence, customerCnpj: record.customerCnpj, network: record.network, banner: record.banner,
  managerCnpj: record.managerCnpj, groupCode: record.groupCode, category: record.category, topTarget: record.topTarget,
  active: record.active, origin: record.origin,
});

export const competenceFromDateEvidence = (value: unknown) => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
};

export function registryValidity(record: { validFromCompetence: string | null; validToCompetence: string | null }, competence: string | null | undefined) {
  const limited = Boolean(record.validFromCompetence || record.validToCompetence);
  if (!limited) return { applicable: true, unresolved: false };
  if (!competence || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return { applicable: false, unresolved: true };
  if (record.validFromCompetence && competence < record.validFromCompetence) return { applicable: false, unresolved: false };
  if (record.validToCompetence && competence > record.validToCompetence) return { applicable: false, unresolved: false };
  return { applicable: true, unresolved: false };
}

const launchMatches = (record: LaunchRegistryRecord, winthorCode: unknown, eans: unknown[]) => {
  const code = codeKey(winthorCode);
  const recordCode = codeKey(record.winthorCode);
  const keys = eans.map(eanKey).filter(Boolean);
  const recordEan = eanKey(record.ean);
  return Boolean((code && recordCode && code === recordCode) || (recordEan && keys.includes(recordEan)));
};

export function resolveLaunchAuthority(
  registry: AdminRegistryState | null,
  imported: Record<string, RawTyped> | null,
  identity: { winthorCode: unknown; eans: unknown[]; competence?: string | null },
): AuthorityResolution<LaunchRegistryRecord | Record<string, RawTyped>> {
  const matching = (registry?.launches ?? []).filter(record => launchMatches(record, identity.winthorCode, identity.eans));
  const resolveTier = (origin: 'MANUAL' | 'SOURCE_SEED') => {
    const tier = matching.filter(record => record.origin === origin);
    const active = tier.filter(record => record.active);
    const applicable = active.filter(record => registryValidity(record, identity.competence).applicable);
    const unresolved = active.some(record => registryValidity(record, identity.competence).unresolved);
    if (applicable.length && new Set(applicable.map(semanticLaunch)).size > 1) return { ambiguous: true, record: null as LaunchRegistryRecord | null, unresolved };
    return { ambiguous: false, record: applicable[0] ?? null, unresolved };
  };

  const manual = resolveTier('MANUAL');
  if (manual.ambiguous) return { record: null, authority: 'MANUAL_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: true, validityUnresolved: manual.unresolved };
  if (manual.record) return { record: manual.record, authority: 'MANUAL_REGISTRY', registryRecordId: manual.record.id, tombstone: false, ambiguous: false, validityUnresolved: manual.unresolved };
  const manualTombstone = matching.some(record => record.origin === 'MANUAL' && !record.active);
  if (manualTombstone) return { record: null, authority: 'MANUAL_REGISTRY', registryRecordId: matching.find(record => record.origin === 'MANUAL' && !record.active)?.id ?? null, tombstone: true, ambiguous: false, validityUnresolved: manual.unresolved };
  if (manual.unresolved) return { record: null, authority: 'MANUAL_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: true };

  const seeded = resolveTier('SOURCE_SEED');
  if (seeded.ambiguous) return { record: null, authority: 'ADMIN_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: true, validityUnresolved: seeded.unresolved };
  if (seeded.record) return { record: seeded.record, authority: 'ADMIN_REGISTRY', registryRecordId: seeded.record.id, tombstone: false, ambiguous: false, validityUnresolved: seeded.unresolved };
  if (seeded.unresolved) return { record: null, authority: 'ADMIN_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: true };
  return imported
    ? { record: imported, authority: 'IMPORTED_SOURCE', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: false }
    : { record: null, authority: 'NONE', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: false };
}

export function effectiveRegistryLaunches(registry: AdminRegistryState | null, competence?: string | null) {
  const records = registry?.launches ?? [];
  const keys = new Set(records.flatMap(record => [record.winthorCode ? `W:${codeKey(record.winthorCode)}` : '', record.ean ? `E:${eanKey(record.ean)}` : '']).filter(Boolean));
  const winners: LaunchRegistryRecord[] = [];
  const audits: CanonicalAudit[] = [];
  const seenIds = new Set<string>();
  for (const key of keys) {
    const [kind, value] = key.split(':');
    const resolution = resolveLaunchAuthority(registry, null, { winthorCode: kind === 'W' ? value : null, eans: kind === 'E' ? [value] : [], competence });
    if (resolution.ambiguous) audits.push(authorityAudit('ADMIN_REGISTRY_LAUNCH_AMBIGUOUS', `Lançamento ${key} possui definições conflitantes na camada administrativa.`));
    else if (resolution.validityUnresolved) audits.push(authorityAudit('ADMIN_REGISTRY_VALIDITY_UNRESOLVED', `Lançamento ${key} possui vigência, mas a competência do snapshot não é inequívoca.`));
    else if (resolution.record && 'id' in resolution.record && !seenIds.has(resolution.record.id)) { winners.push(resolution.record); seenIds.add(resolution.record.id); }
  }
  return { records: winners, audits };
}

export function resolveTopAuthority(registry: AdminRegistryState | null, competence: string, customerCnpj: string, imported: Record<string, RawTyped> | null): AuthorityResolution<TopRetailRegistryRecord | Record<string, RawTyped>> {
  const matching = (registry?.topRetailers ?? []).filter(record => record.competence === competence && record.customerCnpj === customerCnpj);
  const tier = (origin: 'MANUAL' | 'SOURCE_SEED') => matching.filter(record => record.origin === origin && record.active);
  const manual = tier('MANUAL');
  if (manual.length && new Set(manual.map(semanticTop)).size > 1) return { record: null, authority: 'MANUAL_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: true, validityUnresolved: false };
  if (manual.length) return { record: manual[0], authority: 'MANUAL_REGISTRY', registryRecordId: manual[0].id, tombstone: false, ambiguous: false, validityUnresolved: false };
  const tombstone = matching.find(record => record.origin === 'MANUAL' && !record.active);
  if (tombstone) return { record: null, authority: 'MANUAL_REGISTRY', registryRecordId: tombstone.id, tombstone: true, ambiguous: false, validityUnresolved: false };
  const seeded = tier('SOURCE_SEED');
  if (seeded.length && new Set(seeded.map(semanticTop)).size > 1) return { record: null, authority: 'ADMIN_REGISTRY', registryRecordId: null, tombstone: false, ambiguous: true, validityUnresolved: false };
  if (seeded.length) return { record: seeded[0], authority: 'ADMIN_REGISTRY', registryRecordId: seeded[0].id, tombstone: false, ambiguous: false, validityUnresolved: false };
  return imported
    ? { record: imported, authority: 'IMPORTED_SOURCE', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: false }
    : { record: null, authority: 'NONE', registryRecordId: null, tombstone: false, ambiguous: false, validityUnresolved: false };
}

export function authorityAudit(code: string, message: string, source = 'AdminRegistry'): CanonicalAudit {
  return { code, severity: 'WARNING', source, file: '', message, action: 'Resolver a divergência em Administração → Cadastros antes de depender deste vínculo.' };
}

export const adminRegistryAuthorityTestHelpers = { codeKey, eanKey, semanticLaunch, semanticTop, typed };
