import type { AdminRegistryState, RcaRegistryRecord } from './adminRegistry';
import { registryValidity } from './adminRegistryAuthority';
import type { ParsedSource, RawTyped } from './types';

export type RcaResolutionContext = 'CURRENT' | 'LEGACY';
export type RcaResolutionStatus = 'RESOLVED_CURRENT_CONTEXT' | 'RESOLVED_LEGACY_CONTEXT' | 'RCA_UNRESOLVED' | 'AMBIGUOUS_RCA_CODE' | 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED';
export type RcaMasterRole = 'PRINCIPAL' | 'AUXILIAR';
export type RcaAuthority = 'MANUAL_REGISTRY' | 'ADMIN_REGISTRY' | 'IMPORTED_SOURCE' | 'NONE';

export type RcaMasterEntry = {
  currentCode: string;
  legacyCode: string | null;
  name: string | null;
  coordinatorCode: string | null;
  coordinatorName: string | null;
  role: RcaMasterRole;
  sourceRow: unknown;
  authority: Exclude<RcaAuthority, 'NONE'>;
  registryRecordId: string | null;
  validFromCompetence: string | null;
  validToCompetence: string | null;
};

export type RcaResolution = {
  context: RcaResolutionContext;
  inputCode: string | null;
  status: RcaResolutionStatus;
  canonicalId: string | null;
  currentCode: string | null;
  legacyCode: string | null;
  name: string | null;
  coordinatorCode: string | null;
  coordinatorName: string | null;
  role: RcaMasterRole | null;
  candidateCurrentCodes: string[];
  authority: RcaAuthority;
  registryRecordId: string | null;
  auditCode: string | null;
};

const typedValue = (row: Record<string, RawTyped>, ...names: string[]) => {
  for (const name of names) {
    const candidate = row[name]?.typed;
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return null;
};

const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/\.0$/, '');
const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || null;
};
const normalizeName = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z ]/g, ' ')
  .replace(/\b(CL T|CLT|PJ)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function sourceEntryFromRow(row: Record<string, RawTyped>, role: RcaMasterRole): RcaMasterEntry | null {
  const suffix = role === 'PRINCIPAL' ? 'principal' : 'auxiliar';
  const currentCode = cleanCode(typedValue(row, `current_rca_code_${suffix}`));
  if (!currentCode) return null;
  return {
    currentCode,
    legacyCode: cleanCode(typedValue(row, `legacy_rca_code_${suffix}`)) || null,
    name: cleanText(typedValue(row, `rca_name_raw_${suffix}`)),
    coordinatorCode: cleanCode(typedValue(row, `coordinator_code_${suffix}`)) || null,
    coordinatorName: cleanText(typedValue(row, `coordinator_name_${suffix}`)),
    role,
    sourceRow: typedValue(row, '__source_row'),
    authority: 'IMPORTED_SOURCE',
    registryRecordId: null,
    validFromCompetence: null,
    validToCompetence: null,
  };
}

function registryEntry(record: RcaRegistryRecord): RcaMasterEntry {
  return {
    currentCode: record.currentCode,
    legacyCode: record.legacyCode,
    name: record.name,
    coordinatorCode: record.coordinatorCode,
    coordinatorName: record.coordinatorName,
    role: record.role,
    sourceRow: record.sourceRow,
    authority: record.origin === 'MANUAL' ? 'MANUAL_REGISTRY' : 'ADMIN_REGISTRY',
    registryRecordId: record.id,
    validFromCompetence: record.validFromCompetence,
    validToCompetence: record.validToCompetence,
  };
}

function uniqueEntries(entries: RcaMasterEntry[]) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = [entry.currentCode, entry.legacyCode ?? '', normalizeName(entry.name), entry.coordinatorCode ?? '', entry.coordinatorName ?? '', entry.role, entry.authority, entry.registryRecordId ?? ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rcaMasterEntries(parsedSources: ParsedSource[]) {
  const source = parsedSources.find(item => item.source === 'NOVOS RCAS.xlsx');
  if (!source) return [];
  const entries: RcaMasterEntry[] = [];
  for (const row of source.rows) {
    const principal = sourceEntryFromRow(row, 'PRINCIPAL');
    const auxiliar = sourceEntryFromRow(row, 'AUXILIAR');
    if (principal) entries.push(principal);
    if (auxiliar) entries.push(auxiliar);
  }
  return uniqueEntries(entries);
}

function chooseByName(entries: RcaMasterEntry[], nameHint?: unknown) {
  const normalizedHint = normalizeName(nameHint);
  if (!normalizedHint || entries.length <= 1) return entries;
  const exact = entries.filter(entry => normalizeName(entry.name) === normalizedHint);
  if (exact.length) return exact;
  const hintTokens = normalizedHint.split(' ').filter(token => token.length >= 3);
  if (!hintTokens.length) return entries;
  const scored = entries.map(entry => {
    const normalizedEntry = normalizeName(entry.name);
    const score = hintTokens.filter(token => normalizedEntry.includes(token)).length;
    return { entry, score };
  });
  const max = Math.max(...scored.map(item => item.score));
  return max > 0 ? scored.filter(item => item.score === max).map(item => item.entry) : entries;
}

const unresolved = (context: RcaResolutionContext, inputCode: string | null, status: RcaResolutionStatus = 'RCA_UNRESOLVED', authority: RcaAuthority = 'NONE', candidates: string[] = [], registryRecordId: string | null = null, auditCode: string | null = null): RcaResolution => ({
  context, inputCode, status, canonicalId: null, currentCode: null, legacyCode: null, name: null,
  coordinatorCode: null, coordinatorName: null, role: null, candidateCurrentCodes: candidates,
  authority, registryRecordId, auditCode,
});

function conflict(entries: RcaMasterEntry[], context: RcaResolutionContext) {
  const currentCodes = [...new Set(entries.map(entry => entry.currentCode))];
  const semantic = [...new Set(entries.map(entry => [entry.currentCode, entry.legacyCode ?? '', normalizeName(entry.name), entry.coordinatorCode ?? '', normalizeName(entry.coordinatorName)].join('|')))];
  return currentCodes.length > 1 || (context === 'CURRENT' && semantic.length > 1);
}

export function createRcaResolver(parsedSources: ParsedSource[], registry: AdminRegistryState | null = null) {
  const importedEntries = rcaMasterEntries(parsedSources);
  const registryRecords = registry?.rcas ?? [];

  const matchingRegistry = (context: RcaResolutionContext, inputCode: string, origin: 'MANUAL' | 'SOURCE_SEED') => registryRecords.filter(record => {
    if (record.origin !== origin) return false;
    return context === 'CURRENT' ? record.currentCode === inputCode : record.legacyCode === inputCode;
  });
  const matchingImported = (context: RcaResolutionContext, inputCode: string) => importedEntries.filter(entry => context === 'CURRENT' ? entry.currentCode === inputCode : entry.legacyCode === inputCode);

  const resolve = (context: RcaResolutionContext, rawCode: unknown, nameHint?: unknown, competence?: string | null): RcaResolution => {
    const inputCode = cleanCode(rawCode) || null;
    if (!inputCode) return unresolved(context, inputCode);

    for (const tier of ['MANUAL', 'SOURCE_SEED'] as const) {
      const records = matchingRegistry(context, inputCode, tier);
      const active = records.filter(record => record.active);
      const validityUnresolved = active.some(record => registryValidity(record, competence).unresolved);
      const applicable = active.filter(record => registryValidity(record, competence).applicable).map(registryEntry);
      const authority: RcaAuthority = tier === 'MANUAL' ? 'MANUAL_REGISTRY' : 'ADMIN_REGISTRY';

      if (applicable.length) {
        const currentCodes = [...new Set(applicable.map(entry => entry.currentCode))];
        if (conflict(applicable, context)) return unresolved(context, inputCode, 'AMBIGUOUS_RCA_CODE', authority, currentCodes, null, 'ADMIN_REGISTRY_RCA_AMBIGUOUS');
        const resolved = applicable.find(entry => entry.role === 'PRINCIPAL') ?? applicable[0];
        return {
          context,
          inputCode,
          status: context === 'CURRENT' ? 'RESOLVED_CURRENT_CONTEXT' : 'RESOLVED_LEGACY_CONTEXT',
          canonicalId: `RCA:${resolved.currentCode}`,
          currentCode: resolved.currentCode,
          legacyCode: resolved.legacyCode,
          name: resolved.name,
          coordinatorCode: resolved.coordinatorCode,
          coordinatorName: resolved.coordinatorName,
          role: resolved.role,
          candidateCurrentCodes: currentCodes,
          authority,
          registryRecordId: resolved.registryRecordId,
          auditCode: null,
        };
      }

      if (tier === 'MANUAL') {
        const tombstone = records.find(record => !record.active);
        if (tombstone) return unresolved(context, inputCode, 'RCA_UNRESOLVED', 'MANUAL_REGISTRY', [], tombstone.id, 'ADMIN_REGISTRY_RCA_TOMBSTONE');
      }
      if (validityUnresolved) return unresolved(context, inputCode, 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED', authority, [], active[0]?.id ?? null, 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED');
    }

    const imported = chooseByName(matchingImported(context, inputCode), nameHint);
    if (!imported.length) return unresolved(context, inputCode);
    const currentCodes = [...new Set(imported.map(entry => entry.currentCode))];
    const normalizedNames = [...new Set(imported.map(entry => normalizeName(entry.name)).filter(Boolean))];
    const importedConflict = currentCodes.length > 1 || (context === 'CURRENT' && currentCodes.length === 1 && normalizedNames.length > 1);
    if (importedConflict) return unresolved(context, inputCode, 'AMBIGUOUS_RCA_CODE', 'IMPORTED_SOURCE', currentCodes);
    const resolved = imported.find(entry => entry.role === 'PRINCIPAL') ?? imported[0];
    return {
      context,
      inputCode,
      status: context === 'CURRENT' ? 'RESOLVED_CURRENT_CONTEXT' : 'RESOLVED_LEGACY_CONTEXT',
      canonicalId: `RCA:${resolved.currentCode}`,
      currentCode: resolved.currentCode,
      legacyCode: resolved.legacyCode,
      name: resolved.name,
      coordinatorCode: resolved.coordinatorCode,
      coordinatorName: resolved.coordinatorName,
      role: resolved.role,
      candidateCurrentCodes: currentCodes,
      authority: 'IMPORTED_SOURCE',
      registryRecordId: null,
      auditCode: null,
    };
  };

  return {
    entries: uniqueEntries([...registryRecords.filter(record => record.active).map(registryEntry), ...importedEntries]),
    resolveCurrent: (code: unknown, nameHint?: unknown, competence?: string | null) => resolve('CURRENT', code, nameHint, competence),
    resolveLegacy: (code: unknown, nameHint?: unknown, competence?: string | null) => resolve('LEGACY', code, nameHint, competence),
  };
}
