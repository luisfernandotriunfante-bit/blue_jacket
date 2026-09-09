import { competenceFromParsedSource, isValidCompetenceId } from './competence';
import { loadAdminRegistryState } from './adminRegistryIndexedDb';
import { createRcaResolver } from './rcaResolver';
import { loadSourceStaging } from './sourceImport';
import { BUSSOLA_SOURCE_ID } from './targetAuthority';
import { emptyTargetState, validateTargetState, type RcaTargetRecord, type TargetState } from './targetStore';
import type { ParsedSource, RawTyped } from './types';

export type TargetSeedStatus = 'NEW' | 'UPDATABLE' | 'EQUAL' | 'MANUAL_PROTECTED' | 'CONFLICT' | 'RCA_UNRESOLVED' | 'RCA_AMBIGUOUS' | 'COMPETENCE_MISMATCH' | 'MISSING_SOURCE';
export type TargetSeedCandidate = { competence: string; rcaCanonicalId: string; sourceRcaCode: string | null; salesTarget: number; positivityTarget: number };
export type TargetSeedPreviewItem = { status: TargetSeedStatus; businessKey: string; recordId: string | null; reason: string | null; candidate?: TargetSeedCandidate };
export type TargetSeedPreview = {
  source: typeof BUSSOLA_SOURCE_ID;
  sourceCompetence: string | null;
  editedCompetence: string;
  counts: { new: number; updatable: number; equal: number; manualProtected: number; conflicts: number; rcaUnresolved: number; competenceMismatch: number; missingFromSource: number };
  generalTargets: { sellOutTarget: number | null; positivityTarget: number | null; networkTarget: number | null };
  items: TargetSeedPreviewItem[];
};

const typed = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? null;
const numberTarget = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const semanticCandidate = (candidate: TargetSeedCandidate) => JSON.stringify(candidate);
const semanticRecord = (record: RcaTargetRecord) => JSON.stringify({ competence: record.competence, rcaCanonicalId: record.rcaCanonicalId, sourceRcaCode: record.sourceRcaCode, salesTarget: record.salesTarget, positivityTarget: record.positivityTarget });
const keyOf = (competence: string, rcaCanonicalId: string) => `${competence}|${rcaCanonicalId}`;

export type TargetSeedDependencies = {
  loadBussola: () => Promise<{ parsed: ParsedSource } | undefined>;
  loadRegistry: typeof loadAdminRegistryState;
};
const defaults: TargetSeedDependencies = {
  loadBussola: () => loadSourceStaging(BUSSOLA_SOURCE_ID),
  loadRegistry: loadAdminRegistryState,
};

export async function previewBussolaTargetSeed(editedCompetence: string, state: TargetState | null, dependencies: TargetSeedDependencies = defaults): Promise<TargetSeedPreview> {
  if (!isValidCompetenceId(editedCompetence)) throw new Error('TARGET_COMPETENCE_INVALID');
  const stage = await dependencies.loadBussola();
  if (!stage) throw new Error('TARGET_BUSSOLA_STAGING_MISSING');
  const sourceCompetence = competenceFromParsedSource(stage.parsed);
  const registry = await dependencies.loadRegistry();
  const resolver = createRcaResolver([], registry);
  const rawRows = stage.parsed.rows.filter(row => String(typed(row, 'pasta_type') ?? '').trim().toUpperCase() === 'MCD' && String(typed(row, 'industry_name') ?? '').trim().toUpperCase() === 'COLGATE');
  const sourceSalesTargets = rawRows.map(row => numberTarget(typed(row, 'sales_target_pna'))).filter((value): value is number => value !== null);
  const sourcePositivityTargets = rawRows.map(row => numberTarget(typed(row, 'positivity_target'))).filter((value): value is number => value !== null);
  const topTargets = registry?.topRetailers.filter(record => record.active && record.competence === editedCompetence && record.topTarget !== null).map(record => record.topTarget as number) ?? [];
  const generalTargets = {
    sellOutTarget: sourceSalesTargets.length ? sourceSalesTargets.reduce((sum, value) => sum + value, 0) : null,
    positivityTarget: sourcePositivityTargets.length ? sourcePositivityTargets.reduce((sum, value) => sum + value, 0) : null,
    networkTarget: topTargets.length ? topTargets.reduce((sum, value) => sum + value, 0) : null,
  };
  const items: TargetSeedPreviewItem[] = [];
  const candidateGroups = new Map<string, TargetSeedCandidate[]>();

  for (const row of rawRows) {
    const code = typed(row, 'target_rca_code');
    if (!sourceCompetence || sourceCompetence !== editedCompetence) {
      items.push({ status: 'COMPETENCE_MISMATCH', businessKey: `${sourceCompetence ?? 'UNRESOLVED'}|${String(code ?? '')}`, recordId: null, reason: `A Bússola pertence a ${sourceCompetence ?? 'competência não resolvida'} e não pode alimentar metas de ${editedCompetence}.` });
      continue;
    }
    const resolution = resolver.resolveLegacy(code, typed(row, 'target_rca_name'), sourceCompetence);
    if (!resolution.canonicalId) {
      const ambiguous = resolution.status === 'AMBIGUOUS_RCA_CODE';
      items.push({ status: ambiguous ? 'RCA_AMBIGUOUS' : 'RCA_UNRESOLVED', businessKey: `${sourceCompetence}|${String(code ?? '')}`, recordId: null, reason: `RCA legado ${String(code ?? '')} não foi resolvido de forma única pela autoridade RCA atual.` });
      continue;
    }
    const salesTarget = numberTarget(typed(row, 'sales_target_pna'));
    const positivityTarget = numberTarget(typed(row, 'positivity_target'));
    if (salesTarget === null || positivityTarget === null) {
      items.push({ status: 'CONFLICT', businessKey: keyOf(sourceCompetence, resolution.canonicalId), recordId: null, reason: 'A Bússola possui meta ausente ou inválida; ausência não é convertida silenciosamente em zero.' });
      continue;
    }
    const candidate: TargetSeedCandidate = { competence: sourceCompetence, rcaCanonicalId: resolution.canonicalId, sourceRcaCode: String(code ?? '').trim() || null, salesTarget, positivityTarget };
    const key = keyOf(sourceCompetence, resolution.canonicalId);
    candidateGroups.set(key, [...(candidateGroups.get(key) ?? []), candidate]);
  }

  const seenSourceKeys = new Set<string>();
  for (const [businessKey, candidates] of candidateGroups) {
    const unique = [...new Map(candidates.map(candidate => [semanticCandidate(candidate), candidate])).values()];
    if (unique.length > 1) {
      items.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'A Bússola possui valores divergentes para a mesma competência + RCA canônico.' });
      continue;
    }
    const candidate = unique[0];
    seenSourceKeys.add(businessKey);
    const existing = state?.records.find(record => record.competence === candidate.competence)?.rcaTargets.filter(record => record.rcaCanonicalId === candidate.rcaCanonicalId) ?? [];
    const manual = existing.find(record => record.origin === 'MANUAL');
    if (manual) {
      items.push({ status: 'MANUAL_PROTECTED', businessKey, recordId: manual.id, reason: 'Registro MANUAL protegido contra reseed.', candidate });
      continue;
    }
    const seeded = existing.filter(record => record.origin === 'SOURCE_SEED');
    if (seeded.length > 1 && new Set(seeded.map(semanticRecord)).size > 1) {
      items.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'Há SOURCE_SEED divergentes já persistidos para esta chave.', candidate });
      continue;
    }
    if (!seeded.length) items.push({ status: 'NEW', businessKey, recordId: null, reason: null, candidate });
    else if (semanticRecord(seeded[0]) === semanticCandidate(candidate) && seeded[0].active) items.push({ status: 'EQUAL', businessKey, recordId: seeded[0].id, reason: null, candidate });
    else items.push({ status: 'UPDATABLE', businessKey, recordId: seeded[0].id, reason: null, candidate });
  }

  for (const record of state?.records.find(item => item.competence === editedCompetence)?.rcaTargets.filter(item => item.origin === 'SOURCE_SEED') ?? []) {
    const businessKey = keyOf(record.competence, record.rcaCanonicalId);
    if (!seenSourceKeys.has(businessKey)) items.push({ status: 'MISSING_SOURCE', businessKey, recordId: record.id, reason: 'Registro SOURCE_SEED não aparece na Bússola atual e foi preservado.' });
  }

  const counts = {
    new: items.filter(item => item.status === 'NEW').length,
    updatable: items.filter(item => item.status === 'UPDATABLE').length,
    equal: items.filter(item => item.status === 'EQUAL').length,
    manualProtected: items.filter(item => item.status === 'MANUAL_PROTECTED').length,
    conflicts: items.filter(item => item.status === 'CONFLICT' || item.status === 'RCA_AMBIGUOUS').length,
    rcaUnresolved: items.filter(item => item.status === 'RCA_UNRESOLVED' || item.status === 'RCA_AMBIGUOUS').length,
    competenceMismatch: items.filter(item => item.status === 'COMPETENCE_MISMATCH').length,
    missingFromSource: items.filter(item => item.status === 'MISSING_SOURCE').length,
  };
  return { source: BUSSOLA_SOURCE_ID, sourceCompetence, editedCompetence, counts, generalTargets, items };
}

export function applyBussolaTargetSeedPreview(current: TargetState | null, preview: TargetSeedPreview, now = new Date().toISOString()) {
  if (preview.sourceCompetence !== preview.editedCompetence) throw new Error('TARGET_SEED_COMPETENCE_MISMATCH');
  const state = structuredClone(current ?? emptyTargetState(now));
  let competence = state.records.find(record => record.competence === preview.editedCompetence);
  if (!competence) {
    competence = { competence: preview.editedCompetence, sellOutTarget: null, positivityTarget: null, networkTarget: null, rcaTargets: [], createdAt: now, updatedAt: now };
    state.records.push(competence);
  }
  if (competence.sellOutTarget === null && preview.generalTargets.sellOutTarget !== null) competence.sellOutTarget = preview.generalTargets.sellOutTarget;
  if (competence.positivityTarget === null && preview.generalTargets.positivityTarget !== null) competence.positivityTarget = preview.generalTargets.positivityTarget;
  if (competence.networkTarget === null && preview.generalTargets.networkTarget !== null) competence.networkTarget = preview.generalTargets.networkTarget;
  for (const item of preview.items.filter(item => item.status === 'NEW' || item.status === 'UPDATABLE')) {
    if (!item.candidate) continue;
    const existing = item.recordId ? competence.rcaTargets.find(record => record.id === item.recordId) : undefined;
    const next: RcaTargetRecord = {
      id: existing?.id ?? `TARGET_SEED:${item.candidate.competence}:${item.candidate.rcaCanonicalId}`,
      ...item.candidate,
      active: true,
      origin: 'SOURCE_SEED',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      note: existing?.note ?? null,
    };
    if (existing) Object.assign(existing, next); else competence.rcaTargets.push(next);
  }
  competence.updatedAt = now;
  state.updatedAt = now;
  return validateTargetState(state);
}

export const targetSeedTestHelpers = { numberTarget, semanticCandidate, semanticRecord, keyOf };
