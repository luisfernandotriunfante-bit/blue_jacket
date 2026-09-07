import type { SourceReplacementAuthority } from './sourceContract';
import { REPLACEABLE_SOURCE_IDS, type SourceReplacementScope } from './sourceContract';

export const SOURCE_REPLACEMENT_STATE_FORMAT = 'blue-jacket-source-replacement-state/v1' as const;
export const SOURCE_REPLACEMENT_PROOF_VERSION = 'blue-jacket-source-replacement-proof/v1' as const;
export const EMPTY_SOURCE_REPLACEMENT_PROOF: string = 'EMPTY';
const STORAGE_KEY = 'blue-jacket-v21:source-replacement-state';

export type SourceReplacementCertificate = {
  id: string;
  sourceId: string;
  scope: SourceReplacementScope;
  replacementAuthority: SourceReplacementAuthority;
  sourceFileHash: string;
  sourceParserVersion: string;
  sourceSchemaVersion: string;
  sourceRows: number;
  coverageKeys: string[];
  coverageHash: string;
  proofVersion: typeof SOURCE_REPLACEMENT_PROOF_VERSION;
  certifiedAt: string;
};

export type SourceReplacementState = {
  format: typeof SOURCE_REPLACEMENT_STATE_FORMAT;
  certificates: SourceReplacementCertificate[];
};

export type SourceReplacementStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

type Listener = (state: SourceReplacementState | null) => void;
const encoder = new TextEncoder();

async function sha256(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(value));
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const replacementSources = new Set<string>(REPLACEABLE_SOURCE_IDS);
const authorityForSource: Record<string, SourceReplacementAuthority> = {
  'NOVOS RCAS.xlsx': 'AdminRegistry.RCAs',
  'lançamentos.xlsx': 'AdminRegistry.Lançamentos',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'AdminRegistry.TopRetailers',
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx': 'TargetState.RcaTargets',
};

const validScope = (sourceId: string, scope: unknown): scope is SourceReplacementScope => {
  if (sourceId === 'NOVOS RCAS.xlsx' || sourceId === 'lançamentos.xlsx') return scope === 'GLOBAL';
  return typeof scope === 'string' && /^COMPETENCE:\d{4}-(0[1-9]|1[0-2])$/.test(scope);
};

function normalizeCoverageKeys(keys: string[]) {
  return [...new Set(keys.map(key => String(key).trim()).filter(Boolean))].sort();
}

export async function coverageHashFor(keys: string[]) {
  return sha256(['blue-jacket-source-replacement-coverage/v1', ...normalizeCoverageKeys(keys)]);
}

export function certificateSemanticProjection(certificate: SourceReplacementCertificate) {
  return {
    sourceId: certificate.sourceId,
    scope: certificate.scope,
    replacementAuthority: certificate.replacementAuthority,
    sourceFileHash: certificate.sourceFileHash,
    sourceParserVersion: certificate.sourceParserVersion,
    sourceSchemaVersion: certificate.sourceSchemaVersion,
    sourceRows: certificate.sourceRows,
    coverageKeys: normalizeCoverageKeys(certificate.coverageKeys),
    coverageHash: certificate.coverageHash,
    proofVersion: certificate.proofVersion,
  };
}

export async function sourceReplacementProofHash(certificates: SourceReplacementCertificate[]) {
  if (!certificates.length) return EMPTY_SOURCE_REPLACEMENT_PROOF;
  const projection = certificates.map(certificateSemanticProjection)
    .sort((a, b) => `${a.sourceId}|${a.scope}`.localeCompare(`${b.sourceId}|${b.scope}`));
  return sha256([SOURCE_REPLACEMENT_PROOF_VERSION, ...projection]);
}

export function sourceReplacementsFromCertificates(certificates: SourceReplacementCertificate[]) {
  return certificates
    .map(certificate => ({ source: certificate.sourceId, scope: certificate.scope }))
    .sort((a, b) => `${a.source}|${a.scope}`.localeCompare(`${b.source}|${b.scope}`));
}

export function validateSourceReplacementCertificate(value: unknown): SourceReplacementCertificate {
  if (!value || typeof value !== 'object') throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_INVALID');
  const candidate = value as Partial<SourceReplacementCertificate>;
  if (!candidate.id || typeof candidate.id !== 'string' || !candidate.sourceId || !replacementSources.has(candidate.sourceId)) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_INVALID');
  if (!validScope(candidate.sourceId, candidate.scope)) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_SCOPE_INVALID');
  if (candidate.replacementAuthority !== authorityForSource[candidate.sourceId]) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_AUTHORITY_INVALID');
  if (!candidate.sourceFileHash || !candidate.sourceParserVersion || !candidate.sourceSchemaVersion) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_SOURCE_IDENTITY_INVALID');
  if (!Number.isInteger(candidate.sourceRows) || Number(candidate.sourceRows) < 0) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_ROWS_INVALID');
  if (!Array.isArray(candidate.coverageKeys) || !candidate.coverageKeys.length || candidate.coverageKeys.some(key => typeof key !== 'string' || !key.trim())) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_COVERAGE_INVALID');
  if (!candidate.coverageHash || typeof candidate.coverageHash !== 'string') throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_COVERAGE_INVALID');
  if (candidate.proofVersion !== SOURCE_REPLACEMENT_PROOF_VERSION) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_PROOF_VERSION_INVALID');
  if (!candidate.certifiedAt || !Number.isFinite(Date.parse(candidate.certifiedAt))) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_TIME_INVALID');
  return { ...candidate, coverageKeys: normalizeCoverageKeys(candidate.coverageKeys) } as SourceReplacementCertificate;
}

export function validateSourceReplacementState(value: unknown): SourceReplacementState {
  if (!value || typeof value !== 'object') throw new Error('SOURCE_REPLACEMENT_STATE_INVALID');
  const candidate = value as Partial<SourceReplacementState>;
  if (candidate.format !== SOURCE_REPLACEMENT_STATE_FORMAT || !Array.isArray(candidate.certificates)) throw new Error('SOURCE_REPLACEMENT_STATE_INVALID');
  const certificates = candidate.certificates.map(validateSourceReplacementCertificate);
  const identities = certificates.map(certificate => `${certificate.sourceId}|${certificate.scope}`);
  if (new Set(identities).size !== identities.length) throw new Error('SOURCE_REPLACEMENT_STATE_DUPLICATE_SCOPE');
  return { format: SOURCE_REPLACEMENT_STATE_FORMAT, certificates };
}

export function emptySourceReplacementState(): SourceReplacementState {
  return { format: SOURCE_REPLACEMENT_STATE_FORMAT, certificates: [] };
}

export function certificateFor(state: SourceReplacementState | null, sourceId: string, scope: SourceReplacementScope) {
  return state?.certificates.find(certificate => certificate.sourceId === sourceId && certificate.scope === scope) ?? null;
}

export function withCertificate(state: SourceReplacementState | null, certificate: SourceReplacementCertificate) {
  const valid = validateSourceReplacementCertificate(certificate);
  const base = state ? validateSourceReplacementState(state) : emptySourceReplacementState();
  return validateSourceReplacementState({
    format: SOURCE_REPLACEMENT_STATE_FORMAT,
    certificates: [...base.certificates.filter(item => !(item.sourceId === valid.sourceId && item.scope === valid.scope)), valid],
  });
}

export function withoutCertificate(state: SourceReplacementState | null, sourceId: string, scope: SourceReplacementScope) {
  const base = state ? validateSourceReplacementState(state) : emptySourceReplacementState();
  return validateSourceReplacementState({ format: SOURCE_REPLACEMENT_STATE_FORMAT, certificates: base.certificates.filter(item => !(item.sourceId === sourceId && item.scope === scope)) });
}

export class SourceReplacementRepository {
  private listeners = new Set<Listener>();
  private storage: SourceReplacementStorage | null;
  constructor(storage: SourceReplacementStorage | null = typeof localStorage === 'undefined' ? null : localStorage) { this.storage = storage; }
  load() {
    if (!this.storage) return null;
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return validateSourceReplacementState(JSON.parse(raw));
  }
  save(state: SourceReplacementState) {
    const valid = validateSourceReplacementState(state);
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(valid));
    for (const listener of this.listeners) listener(valid);
    return valid;
  }
  replace(value: SourceReplacementState | null) {
    if (!value) {
      this.storage?.removeItem?.(STORAGE_KEY);
      for (const listener of this.listeners) listener(null);
      return null;
    }
    return this.save(value);
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.load());
    return () => { this.listeners.delete(listener); };
  }
}

export class InMemorySourceReplacementStorage implements SourceReplacementStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

export const sourceReplacementRepository = new SourceReplacementRepository();
export const loadSourceReplacementState = () => sourceReplacementRepository.load();
export const replaceSourceReplacementState = (state: SourceReplacementState | null) => sourceReplacementRepository.replace(state);

export const sourceReplacementStateTestHelpers = { sha256, normalizeCoverageKeys, authorityForSource, validScope, STORAGE_KEY };