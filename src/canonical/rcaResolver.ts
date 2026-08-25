import type { ParsedSource, RawTyped } from './types';

export type RcaResolutionContext = 'CURRENT' | 'LEGACY';
export type RcaResolutionStatus = 'RESOLVED_CURRENT_CONTEXT' | 'RESOLVED_LEGACY_CONTEXT' | 'RCA_UNRESOLVED' | 'AMBIGUOUS_RCA_CODE';
export type RcaMasterRole = 'PRINCIPAL' | 'AUXILIAR';

export type RcaMasterEntry = {
  currentCode: string;
  legacyCode: string | null;
  name: string | null;
  coordinatorCode: string | null;
  coordinatorName: string | null;
  role: RcaMasterRole;
  sourceRow: unknown;
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

function entryFromRow(row: Record<string, RawTyped>, role: RcaMasterRole): RcaMasterEntry | null {
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
  };
}

function uniqueEntries(entries: RcaMasterEntry[]) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = [entry.currentCode, entry.legacyCode ?? '', normalizeName(entry.name), entry.coordinatorCode ?? '', entry.role].join('|');
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
    const principal = entryFromRow(row, 'PRINCIPAL');
    const auxiliar = entryFromRow(row, 'AUXILIAR');
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

export function createRcaResolver(parsedSources: ParsedSource[]) {
  const entries = rcaMasterEntries(parsedSources);
  const current = new Map<string, RcaMasterEntry[]>();
  const legacy = new Map<string, RcaMasterEntry[]>();
  for (const entry of entries) {
    current.set(entry.currentCode, [...(current.get(entry.currentCode) ?? []), entry]);
    if (entry.legacyCode) legacy.set(entry.legacyCode, [...(legacy.get(entry.legacyCode) ?? []), entry]);
  }

  const resolve = (context: RcaResolutionContext, rawCode: unknown, nameHint?: unknown): RcaResolution => {
    const inputCode = cleanCode(rawCode) || null;
    if (!inputCode) return { context, inputCode, status: 'RCA_UNRESOLVED', canonicalId: null, currentCode: null, legacyCode: null, name: null, coordinatorCode: null, coordinatorName: null, role: null, candidateCurrentCodes: [] };
    const matches = chooseByName(context === 'CURRENT' ? (current.get(inputCode) ?? []) : (legacy.get(inputCode) ?? []), nameHint);
    const currentCodes = [...new Set(matches.map(entry => entry.currentCode))];
    const normalizedNames = [...new Set(matches.map(entry => normalizeName(entry.name)).filter(Boolean))];
    const conflict = currentCodes.length > 1 || (context === 'CURRENT' && currentCodes.length === 1 && normalizedNames.length > 1);
    if (!matches.length) return { context, inputCode, status: 'RCA_UNRESOLVED', canonicalId: null, currentCode: null, legacyCode: null, name: null, coordinatorCode: null, coordinatorName: null, role: null, candidateCurrentCodes: [] };
    if (conflict) return { context, inputCode, status: 'AMBIGUOUS_RCA_CODE', canonicalId: null, currentCode: null, legacyCode: null, name: null, coordinatorCode: null, coordinatorName: null, role: null, candidateCurrentCodes: currentCodes };
    const resolved = matches.find(entry => entry.role === 'PRINCIPAL') ?? matches[0];
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
    };
  };

  return {
    entries,
    resolveCurrent: (code: unknown, nameHint?: unknown) => resolve('CURRENT', code, nameHint),
    resolveLegacy: (code: unknown, nameHint?: unknown) => resolve('LEGACY', code, nameHint),
  };
}
