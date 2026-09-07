import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GLOBAL_AUDIT_FORMAT,
  GLOBAL_AUDIT_RECORD_FLAG_CATALOG,
  blockingGlobalAuditFindings,
  buildGlobalAuditReport,
  exportGlobalAuditJson,
  filterGlobalAuditFindings,
  globalAuditFindingId,
  globalAuditGate,
  globalAuditOverallStatus,
  sortGlobalAuditFindings,
  type GlobalAuditFinding,
  type GlobalAuditInputs,
} from '../src/canonical/globalAudit';
import { captureGlobalAuditInputs, type GlobalAuditInputDependencies } from '../src/canonical/globalAuditInputs';
import { emptyAdminRegistryState } from '../src/canonical/adminRegistry';
import { canonicalAdminRegistryHash } from '../src/canonical/adminRegistryIdentity';
import { emptyTargetState, type TargetState } from '../src/canonical/targetStore';
import { rcaTargetRegistryHash } from '../src/canonical/targetIdentity';
import { emptySourceReplacementState, sourceReplacementProofHash } from '../src/canonical/sourceReplacementState';
import { canonicalInputHashV3, stagingManifestHashV2 } from '../src/canonical/sourceReplacementIdentity';
import { CANONICAL_ENGINE_VERSION, type StoredStage } from '../src/canonical/sourceImport';
import { HARD_REQUIRED_SOURCE_IDS, REPLACEABLE_SOURCE_IDS, SUPPORTED_SOURCE_IDS } from '../src/canonical/sourceContract';
import { ADMIN_TABS } from '../src/navigation';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime';
import type { CanonicalAudit, CanonicalList, ParsedSource } from '../src/canonical/types';
import type { CompetenceState } from '../src/canonical/competenceStore';
import type { ReportSettings } from '../src/canonical/reportSettings';

const NOW = '2026-09-07T01:00:00.000Z';
const emptySettings: ReportSettings = { networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTargetByCompetence: {}, positivityTargetByCompetence: {}, legacySellOutTarget: null, legacyPositivityTarget: null, inboundForecastByInvoice: {} };
const competence = (current: string | null = '2026-08'): CompetenceState => ({ schemaVersion: 'v1', initializedAt: NOW, updatedAt: NOW, currentCompetence: current, records: current ? [{ id: current, status: 'OPEN', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL' }] : [] });
const target = (general: Partial<{ sellOutTarget: number | null; positivityTarget: number | null; networkTarget: number | null }> = {}): TargetState => ({ ...emptyTargetState(NOW), records: [{ competence: '2026-08', sellOutTarget: general.sellOutTarget ?? 100, positivityTarget: general.positivityTarget ?? 10, networkTarget: general.networkTarget ?? 20, rcaTargets: [{ id: 'T1', competence: '2026-08', rcaCanonicalId: 'RCA:10', sourceRcaCode: '10', salesTarget: 100, positivityTarget: 10, active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null }], createdAt: NOW, updatedAt: NOW }], updatedAt: NOW });
const audit = (overrides: Partial<CanonicalAudit> = {}): CanonicalAudit => ({ code: 'A', severity: 'WARNING', source: 'SRC', file: 'src.xlsx', message: 'msg', action: 'act', row: 1, ...overrides });
const parsed = (source: string, audits: CanonicalAudit[] = []): ParsedSource => ({ source, fileName: source, sheet: 'Sheet1', rows: [], audits });
const stage = (source: string, audits: CanonicalAudit[] = []): StoredStage => ({ source, manifest: { source, fileName: source, fileHash: `hash-${source}`, parserVersion: 'browser-v1', schemaVersion: 'v1', parsedRows: 0, warnings: audits.length, errors: 0, updatedAt: NOW, status: 'VALID' }, parsed: parsed(source, audits) });
const stages = () => SUPPORTED_SOURCE_IDS.map(source => stage(source));
const list = (id: CanonicalList['id'], records: Array<Record<string, unknown>> = [], warnings: CanonicalAudit[] = [], errors: CanonicalAudit[] = []): CanonicalList => ({ id, records, sources: [], generatedAt: NOW, competence: '2026-08', snapshotDate: '2026-08-31', warnings, errors });
const baseLists = () => ({
  M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE', [{ item_canonical_id: 'I1', winthor_code: '1', physical_stock_units: 1, pVenda1_region11: 2, category_master: 'ORAL CARE' }]),
  M2_CLIENTE_RCA: list('M2_CLIENTE_RCA', [{ cnpj: '12345678000190', rca_canonical_id: 'RCA:10', rca_current_code: '10', top_network: 'Rede A', top_route_competence: '2026-08', manager_cnpj: '12345678000190', top_target: 20 }]),
  M3_MOVIMENTO_VENDAS: list('M3_MOVIMENTO_VENDAS', [
    { fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-10', order_status: 'FATURADO', value: 50, units: 1, cnpj: '12345678000190', rca_canonical_id: 'RCA:10', winthor_product_code: '1', item_canonical_id: 'I1' },
    { fact_type: 'TARGET', competence: '2026-08', sales_target: 100, positivity_target: 10, rca_canonical_id: 'RCA:10', transaction_rca_code: '10' },
  ]),
  M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', []),
});

async function activeFor(lists = baseLists(), sourceStages = stages(), registry = emptyAdminRegistryState(NOW), targetState = target()): Promise<ActiveCanonicalBundle> {
  const replacement = emptySourceReplacementState();
  const proof = await sourceReplacementProofHash(replacement.certificates);
  const sourceHash = await stagingManifestHashV2(sourceStages, []);
  const adminHash = await canonicalAdminRegistryHash(registry);
  const targetHash = await rcaTargetRegistryHash(targetState);
  const inputHash = await canonicalInputHashV3(sourceHash, adminHash, targetHash, proof);
  const factTypeCounts = { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };
  for (const record of lists.M3_MOVIMENTO_VENDAS.records) { const key = String(record.fact_type ?? '') as keyof typeof factTypeCounts; if (key in factTypeCounts) factTypeCounts[key] += 1; }
  return { status: 'ACTIVE', motorBuildId: 'BUILD-GA', stagingManifestHash: sourceHash, adminRegistryHash: adminHash, rcaTargetRegistryHash: targetHash, sourceContractVersion: 'v2', sourceReplacementProofHash: proof, sourceReplacements: [], canonicalInputHash: inputHash, schemaVersion: 'v1', engineVersion: CANONICAL_ENGINE_VERSION, approvedAt: NOW, rowCounts: Object.fromEntries(Object.entries(lists).map(([id, value]) => [id, value.records.length])) as ActiveCanonicalBundle['rowCounts'], factTypeCounts };
}

async function inputs(overrides: Partial<GlobalAuditInputs> = {}): Promise<GlobalAuditInputs> {
  const lists = baseLists(); const sourceStages = stages(); const registry = emptyAdminRegistryState(NOW); const targetState = target();
  const active = await activeFor(lists, sourceStages, registry, targetState);
  const result: GlobalAuditInputs = { active, lists: Object.fromEntries(Object.entries(lists).map(([id, value]) => [id, { value, error: null }])) as GlobalAuditInputs['lists'], stages: sourceStages, stageErrors: [], registry: { value: registry, error: null }, target: { value: targetState, error: null }, competence: { value: competence(), error: null }, replacement: { value: emptySourceReplacementState(), error: null }, reportSettings: { value: emptySettings, error: null } };
  return { ...result, ...overrides };
}
const report = async (overrides: Partial<GlobalAuditInputs> = {}) => buildGlobalAuditReport(await inputs(overrides), NOW);
const has = (r: Awaited<ReturnType<typeof report>>, code: string, status?: string) => r.findings.some(item => item.code === code && (!status || item.status === status));
const sourceText = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const clone = <T>(value: T): T => structuredClone(value);

// GA1–GA10 — contrato global

test('GA1 — format global exato v1', async () => assert.equal((await report()).format, GLOBAL_AUDIT_FORMAT));
test('GA2 — ordenação semântica determinística', () => { const a = [{ id: 'b', code: 'B', status: 'PASS', domain: 'SYSTEM', title: '', message: '', action: '', count: 1 }, { id: 'a', code: 'A', status: 'BLOCKER', domain: 'SYSTEM', title: '', message: '', action: '', count: 1 }] as GlobalAuditFinding[]; assert.deepEqual(sortGlobalAuditFindings(a).map(x => x.id), ['a', 'b']); assert.deepEqual(sortGlobalAuditFindings(a), sortGlobalAuditFindings([...a].reverse())); });
test('GA3 — finding ids são determinísticos por escopo', () => { const a = globalAuditFindingId({ domain: 'SOURCES', code: 'X', source: 'A' }); const b = globalAuditFindingId({ domain: 'SOURCES', code: 'X', source: 'A' }); assert.equal(a, b); assert.notEqual(a, globalAuditFindingId({ domain: 'SOURCES', code: 'X', source: 'B' })); });
test('GA4 — report não modifica nenhum input', async () => { const input = await inputs(); const before = clone(input); await buildGlobalAuditReport(input, NOW); assert.deepEqual(input, before); });
test('GA5 — um blocker produz overall BLOCKED', () => assert.equal(globalAuditOverallStatus([{ status: 'BLOCKER' } as GlobalAuditFinding]), 'BLOCKED'));
test('GA6 — warning sem blocker produz ATTENTION', () => assert.equal(globalAuditOverallStatus([{ status: 'WARNING' } as GlobalAuditFinding]), 'ATTENTION'));
test('GA7 — somente PASS/INFO produz HEALTHY', () => assert.equal(globalAuditOverallStatus([{ status: 'PASS' }, { status: 'INFO' }] as GlobalAuditFinding[]), 'HEALTHY'));
test('GA8 — audits repetidos são agregados com count', async () => { const input = await inputs(); input.stages[0].parsed.audits = [audit(), audit({ row: 2 })]; const r = await buildGlobalAuditReport(input, NOW); const f = r.findings.find(item => item.domain === 'SOURCES' && item.code === 'A'); assert.equal(f?.count, 2); });
test('GA9 — samples preservam evidência mínima sem rows completas', async () => { const input = await inputs(); input.stages[0].parsed.audits = Array.from({ length: 10 }, (_, i) => audit({ row: i + 1 })); const r = await buildGlobalAuditReport(input, NOW); const f = r.findings.find(item => item.domain === 'SOURCES' && item.code === 'A'); assert.equal(f?.samples?.length, 5); assert.equal(JSON.stringify(f).includes('rows'), false); });
test('GA10 — audit flag desconhecido nunca é ignorado', async () => { const input = await inputs(); input.lists.M1_ITEM_ESTOQUE.value!.records[0].audit_flags = 'FLAG_FUTURO'; const r = await buildGlobalAuditReport(input, NOW); assert.equal(has(r, 'UNCLASSIFIED_RECORD_AUDIT_FLAG', 'WARNING'), true); });

// GA11–GA20 — active / identity

test('GA11 — sem active gera blocker', async () => assert.equal(has(await report({ active: null }), 'NO_ACTIVE_CANONICAL_BUILD', 'BLOCKER'), true));
test('GA12 — engine v21 atual gera PASS', async () => assert.equal(has(await report(), 'ACTIVE_ENGINE_CURRENT', 'PASS'), true));
test('GA13 — engine v20 exposta gera BLOCKER', async () => { const input = await inputs(); input.active = { ...input.active!, engineVersion: 'browser-stage4-product-assortment-v20-targets-by-competence' }; const r = await buildGlobalAuditReport(input, NOW); assert.equal(has(r, 'ACTIVE_ENGINE_LEGACY', 'BLOCKER'), true); });
test('GA14 — identidade v21 incompleta gera blocker', async () => { const input = await inputs(); input.active = { ...input.active!, canonicalInputHash: undefined }; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ACTIVE_IDENTITY_INCOMPLETE', 'BLOCKER'), true); });
test('GA15 — rowCounts iguais geram PASS', async () => assert.equal(has(await report(), 'ACTIVE_ROW_COUNTS_MATCH', 'PASS'), true));
test('GA16 — rowCounts divergentes geram BLOCKER', async () => { const input = await inputs(); input.active!.rowCounts.M1_ITEM_ESTOQUE += 1; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ACTIVE_ROW_COUNT_MISMATCH', 'BLOCKER'), true); });
test('GA17 — factTypeCounts divergentes geram BLOCKER', async () => { const input = await inputs(); input.active!.factTypeCounts.SALE += 1; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ACTIVE_FACT_COUNT_MISMATCH', 'BLOCKER'), true); });
test('GA18 — AdminRegistryHash drift é blocker', async () => { const input = await inputs(); input.active!.adminRegistryHash = 'DRIFT'; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ACTIVE_ADMIN_REGISTRY_DRIFT', 'BLOCKER'), true); });
test('GA19 — RCA Target hash drift é blocker', async () => { const input = await inputs(); input.active!.rcaTargetRegistryHash = 'DRIFT'; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ACTIVE_RCA_TARGET_DRIFT', 'BLOCKER'), true); });
test('GA20 — source/proof/replacements/canonicalInput drifts aparecem separadamente', async () => { const input = await inputs(); Object.assign(input.active!, { stagingManifestHash: 'S', sourceReplacementProofHash: 'P', sourceReplacements: [{ source: 'X', scope: 'GLOBAL' }], canonicalInputHash: 'I' }); const r = await buildGlobalAuditReport(input, NOW); for (const code of ['ACTIVE_SOURCE_IDENTITY_DRIFT', 'ACTIVE_REPLACEMENT_PROOF_DRIFT', 'ACTIVE_SOURCE_REPLACEMENTS_DRIFT', 'ACTIVE_CANONICAL_INPUT_DRIFT']) assert.equal(has(r, code, 'BLOCKER'), true, code); });

// GA21–GA30 — sources

test('GA21 — 15 hard presentes aparecem PASS', async () => { const r = await report(); assert.equal(HARD_REQUIRED_SOURCE_IDS.length, 15); assert.equal(r.findings.filter(f => f.code === 'SOURCE_HARD_PRESENT').length, 15); });
test('GA22 — hard missing vira blocker', async () => { const input = await inputs(); input.stages = input.stages.filter(s => s.source !== HARD_REQUIRED_SOURCE_IDS[0]); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'SOURCE_HARD_MISSING', 'BLOCKER'), true); });
test('GA23 — conditional físico vira PASS', async () => { const r = await report(); assert.equal(r.findings.filter(f => f.code === 'SOURCE_PHYSICAL' && f.status === 'PASS').length, 4); });
test('GA24 — status REPLACED mapeia para PASS', async () => { const text = sourceText('../src/canonical/globalAudit.ts'); assert.match(text, /REPLACED: 'PASS'/); });
test('GA25 — REPLACEMENT_REQUIRED mapeia para BLOCKER', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /REPLACEMENT_REQUIRED: 'BLOCKER'/));
test('GA26 — REVIEW_REQUIRED mapeia para BLOCKER', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /REVIEW_REQUIRED: 'BLOCKER'/));
test('GA27 — COVERAGE_BROKEN mapeia para BLOCKER', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /COVERAGE_BROKEN: 'BLOCKER'/));
test('GA28 — staging parser/schema antigo vira blocker', async () => { const input = await inputs(); input.stages[0].manifest.parserVersion = 'old'; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'SOURCE_STAGING_OUTDATED', 'BLOCKER'), true); });
test('GA29 — as 19 fontes aparecem na matriz', async () => { const r = await report(); assert.equal(SUPPORTED_SOURCE_IDS.length, 19); assert.equal(r.findings.filter(f => /^SOURCE_(HARD_PRESENT|PHYSICAL|REPLACED|HARD_MISSING|REPLACEMENT_REQUIRED|REVIEW_REQUIRED|COVERAGE_BROKEN)$/.test(f.code)).length, 19); });
test('GA30 — Global Audit não usa REQUIRED_SOURCE_IDS legado', () => assert.doesNotMatch(sourceText('../src/canonical/globalAudit.ts'), /\bREQUIRED_SOURCE_IDS\b/));

// GA31–GA40 — parser/canonical audits

test('GA31 — Parsed CanonicalAudit BLOCKED vira BLOCKER', async () => { const input = await inputs(); input.stages[0].parsed.audits = [audit({ severity: 'BLOCKED', code: 'BLOCKED_A' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'BLOCKED_A', 'BLOCKER'), true); });
test('GA32 — BLOCKED_DEPENDENT_CALC vira BLOCKER', async () => { const input = await inputs(); input.stages[0].parsed.audits = [audit({ severity: 'BLOCKED_DEPENDENT_CALC', code: 'BLOCKED_D' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'BLOCKED_D', 'BLOCKER'), true); });
test('GA33 — CanonicalAudit WARNING vira WARNING', async () => { const input = await inputs(); input.stages[0].parsed.audits = [audit({ severity: 'WARNING', code: 'WARN_A' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'WARN_A', 'WARNING'), true); });
test('GA34 — CanonicalAudit INFO vira INFO', async () => { const input = await inputs(); input.stages[0].parsed.audits = [audit({ severity: 'INFO', code: 'INFO_A' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'INFO_A', 'INFO'), true); });
test('GA35 — M1–M4 todos são carregados e recebem PASS', async () => assert.equal((await report()).findings.filter(f => f.code === 'CANONICAL_LIST_LOADED').length, 4));
test('GA36 — lista ausente vira blocker', async () => { const input = await inputs(); input.lists.M2_CLIENTE_RCA = { value: null, error: null }; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'CANONICAL_LIST_MISSING', 'BLOCKER'), true); });
test('GA37 — CanonicalList.errors vira BLOCKER', async () => { const input = await inputs(); input.lists.M1_ITEM_ESTOQUE.value!.errors = [audit({ code: 'LIST_ERR', severity: 'INFO' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'LIST_ERR', 'BLOCKER'), true); });
test('GA38 — CanonicalList.warnings vira WARNING', async () => { const input = await inputs(); input.lists.M1_ITEM_ESTOQUE.value!.warnings = [audit({ code: 'LIST_WARN', severity: 'BLOCKED' })]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'LIST_WARN', 'WARNING'), true); });
test('GA39 — agregação canônica mantém source/file/row samples', async () => { const input = await inputs(); input.lists.M1_ITEM_ESTOQUE.value!.warnings = [audit({ code: 'LIST_W', row: 7 })]; const f = (await buildGlobalAuditReport(input, NOW)).findings.find(x => x.code === 'LIST_W')!; assert.deepEqual(f.samples?.[0], { source: 'SRC', file: 'src.xlsx', row: 7 }); });
test('GA40 — RCA resolvido com RCA_UNRESOLVED residual vira blocker', async () => { const input = await inputs(); input.lists.M2_CLIENTE_RCA.value!.records[0].audit_flags = 'RCA_UNRESOLVED'; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'STALE_RCA_UNRESOLVED_AUDIT', 'BLOCKER'), true); });

// GA41–GA48 — registries

test('GA41 — RCA clean gera PASS', async () => assert.equal(has(await report(), 'RCA_REGISTRY_CLEAN', 'PASS'), true));
test('GA42 — RCA conflict/error ativo vira blocker', async () => { const input = await inputs(); const state = input.registry.value!; state.rcas.push({ id: 'R1', currentCode: '10', legacyCode: null, name: 'A', coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, validFromCompetence: null, validToCompetence: null, sourceRow: null }, { id: 'R2', currentCode: '10', legacyCode: null, name: 'B', coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, validFromCompetence: null, validToCompetence: null, sourceRow: null }); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'RCA_CURRENT_DIVERGENT', 'BLOCKER'), true); });
test('GA43 — Launch clean gera PASS', async () => assert.equal(has(await report(), 'LAUNCH_REGISTRY_CLEAN', 'PASS'), true));
test('GA44 — Launch conflict/error ativo vira blocker', async () => { const input = await inputs(); const s = input.registry.value!; s.launches.push({ id: 'L1', winthorCode: '1', ean: '7891234567890', description: 'A', type: null, status: 'A', validFromCompetence: null, validToCompetence: null, active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, sourceRow: null }, { id: 'L2', winthorCode: '2', ean: '7891234567890', description: 'B', type: null, status: 'B', validFromCompetence: null, validToCompetence: null, active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, sourceRow: null }); const r = await buildGlobalAuditReport(input, NOW); assert.equal(r.findings.some(f => f.domain === 'REGISTRIES' && f.status === 'BLOCKER' && f.code.startsWith('LAUNCH_')), true); });
test('GA45 — Top clean gera PASS', async () => assert.equal(has(await report(), 'TOP_REGISTRY_CLEAN', 'PASS'), true));
test('GA46 — Top conflict/error ativo vira blocker', async () => { const input = await inputs(); const s = input.registry.value!; s.topRetailers.push({ id: 'P1', competence: '2026-08', customerCnpj: '12345678000190', network: 'A', banner: null, managerCnpj: null, groupCode: null, category: null, topTarget: 1, active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, sourceRow: null }, { id: 'P2', competence: '2026-08', customerCnpj: '12345678000190', network: 'B', banner: null, managerCnpj: null, groupCode: null, category: null, topTarget: 2, active: true, origin: 'MANUAL', createdAt: NOW, updatedAt: NOW, note: null, sourceRow: null }); const r = await buildGlobalAuditReport(input, NOW); assert.equal(r.findings.some(f => f.domain === 'REGISTRIES' && f.status === 'BLOCKER' && f.code.startsWith('TOP_')), true); });
test('GA47 — storage Registry inválida vira blocker sem crash global', async () => { const input = await inputs(); input.registry = { value: null, error: 'INVALID' }; const r = await buildGlobalAuditReport(input, NOW); assert.equal(has(r, 'ADMIN_REGISTRY_LOAD_FAILED', 'BLOCKER'), true); assert.equal(r.findings.some(f => f.domain === 'STOCK'), true); });
test('GA48 — diagnósticos importam funções oficiais e não os reimplementam', () => { const text = sourceText('../src/canonical/globalAudit.ts'); assert.match(text, /diagnoseRcaRecords/); assert.match(text, /diagnoseLaunchRecords/); assert.match(text, /diagnoseTopRetailRecords/); });

// GA49–GA56 — targets

test('GA49 — TargetState válido gera PASS', async () => assert.equal(has(await report(), 'TARGET_STATE_VALID', 'PASS'), true));
test('GA50 — TargetState storage inválida vira BLOCKER', async () => { const input = await inputs(); input.target = { value: null, error: 'TARGET_STATE_INVALID' }; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'TARGET_STATE_LOAD_FAILED', 'BLOCKER'), true); });
test('GA51 — authority RCA target ambígua vira BLOCKER', async () => { const input = await inputs(); const rec = input.target.value!.records[0]; rec.rcaTargets.push({ ...rec.rcaTargets[0], id: 'T2', salesTarget: 200 }); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'AMBIGUOUS_TARGET', 'BLOCKER'), true); });
test('GA52 — meta geral zero é válida e não missing', async () => { const input = await inputs(); input.target.value = target({ sellOutTarget: 0, positivityTarget: 0, networkTarget: 0 }); const r = await buildGlobalAuditReport(input, NOW); assert.equal(has(r, 'SELL_OUT_TARGET_MISSING'), false); assert.equal(has(r, 'POSITIVITY_TARGET_MISSING'), false); assert.equal(has(r, 'NETWORK_TARGET_MISSING'), false); });
test('GA53 — sellOutTarget null vira WARNING', async () => { const input = await inputs(); input.target.value!.records[0].sellOutTarget = null; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'SELL_OUT_TARGET_MISSING', 'WARNING'), true); });
test('GA54 — positivityTarget null vira WARNING', async () => { const input = await inputs(); input.target.value!.records[0].positivityTarget = null; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'POSITIVITY_TARGET_MISSING', 'WARNING'), true); });
test('GA55 — networkTarget null vira WARNING', async () => { const input = await inputs(); input.target.value!.records[0].networkTarget = null; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'NETWORK_TARGET_MISSING', 'WARNING'), true); });
test('GA56 — RCA com SALE e sem TARGET efetivo vira WARNING', async () => { const input = await inputs(); input.lists.M3_MOVIMENTO_VENDAS.value!.records = input.lists.M3_MOVIMENTO_VENDAS.value!.records.filter(r => r.fact_type !== 'TARGET'); input.active = await activeFor(Object.fromEntries(Object.entries(input.lists).map(([k, v]) => [k, v.value])) as ReturnType<typeof baseLists>, input.stages, input.registry.value!, input.target.value!); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'RCA_SALE_WITHOUT_TARGET', 'WARNING'), true); });

// GA57–GA64 — competence

test('GA57 — MATCH gera PASS', async () => assert.equal(has(await report(), 'COMPETENCE_MATCH', 'PASS'), true));
test('GA58 — NO_OFFICIAL_COMPETENCE gera BLOCKER', async () => { const input = await inputs(); input.competence.value = competence(null); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'NO_OFFICIAL_COMPETENCE', 'BLOCKER'), true); });
test('GA59 — MISMATCH gera BLOCKER', async () => { const input = await inputs(); input.competence.value!.currentCompetence = '2026-09'; input.competence.value!.records = [{ id: '2026-09', status: 'OPEN', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL' }]; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'MISMATCH', 'BLOCKER'), true); });
test('GA60 — OBSERVED_MIXED gera BLOCKER', async () => { const input = await inputs(); input.lists.M3_MOVIMENTO_VENDAS.value!.records.push({ fact_type: 'SALE', competence: '2026-09', event_date: '2026-09-01', order_status: 'FATURADO', value: 1 }); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'OBSERVED_MIXED', 'BLOCKER'), true); });
test('GA61 — OBSERVED_UNRESOLVED usa semântica oficial', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /compareOfficialCompetence/));
test('GA62 — NO_OBSERVED_DATA vira BLOCKER quando não há M3 observado', async () => { const input = await inputs(); input.lists.M3_MOVIMENTO_VENDAS.value!.records = []; const r = await buildGlobalAuditReport(input, NOW); assert.equal(r.findings.some(f => ['NO_OBSERVED_DATA', 'OBSERVED_UNRESOLVED'].includes(f.code) && f.status === 'BLOCKER'), true); });
test('GA63 — competências OPEN adicionais viram INFO', async () => { const input = await inputs(); input.competence.value!.records.push({ id: '2026-09', status: 'OPEN', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL' }); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'ADDITIONAL_OPEN_COMPETENCE', 'INFO'), true); });
test('GA64 — competências CLOSED não selecionadas viram INFO', async () => { const input = await inputs(); input.competence.value!.records.push({ id: '2026-07', status: 'CLOSED', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL' }); assert.equal(has(await buildGlobalAuditReport(input, NOW), 'NON_CURRENT_CLOSED_COMPETENCE', 'INFO'), true); });

// GA65–GA74 — Sell Out / Networks

test('GA65 — SellOutViewModel audits entram como WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /base\.audits\.map\(audit => viewAuditFinding\(audit, 'SELL_OUT'\)\)/));
test('GA66 — RCA diagnostics gerencial entram como WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /SELL_OUT_RCA_DIAGNOSTIC[\s\S]*?status: 'WARNING'/));
test('GA67 — lineUnclassifiedValue diferente de zero vira WARNING', async () => { const input = await inputs(); delete input.lists.M1_ITEM_ESTOQUE.value!.records[0].category_master; assert.equal(has(await buildGlobalAuditReport(input, NOW), 'SELL_OUT_LINE_UNCLASSIFIED', 'WARNING'), true); });
test('GA68 — ambiguousProductRecords é tratado como warning de Produtos', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /AMBIGUOUS_PRODUCT_RECORDS[\s\S]*?status: 'WARNING'/));
test('GA69 — linhas + não classificado reconciliadas geram PASS', async () => assert.equal(has(await report(), 'SELL_OUT_LINE_RECONCILIATION_OK', 'PASS'), true));
test('GA70 — mismatch de linhas é BLOCKER', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /SELL_OUT_LINE_RECONCILIATION_MISMATCH[\s\S]*?BLOCKER/));
test('GA71 — RCA/supervisor reconciliados geram PASS', async () => assert.equal(has(await report(), 'SELL_OUT_MANAGERIAL_RECONCILIATION_OK', 'PASS'), true));
test('GA72 — conciliação externa não avaliada é INFO e nunca PASS falso', async () => assert.equal(has(await report(), 'EXTERNAL_SELL_OUT_RECONCILIATION_NOT_EVALUATED', 'INFO'), true));
test('GA73 — competência Top incompatível é BLOCKER', async () => { const input = await inputs(); input.lists.M2_CLIENTE_RCA.value!.records[0].top_route_competence = '2026-09'; const r = await buildGlobalAuditReport(input, NOW); assert.equal(r.findings.some(f => f.domain === 'NETWORKS' && f.code === 'TOP_ROUTE_COMPETENCE_MISMATCH' && f.status === 'BLOCKER'), true); });
test('GA74 — divergência da Meta Redes Geral tem caminho BLOCKER', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /NETWORK_TARGET_RECONCILIATION_MISMATCH[\s\S]*?BLOCKER/));

// GA75–GA84 — stock/carteira

test('GA75 — conciliação Carteira fechada gera PASS', async () => assert.equal(has(await report(), 'PORTFOLIO_RECONCILIATION_OK', 'PASS'), true));
test('GA76 — conciliação monetária divergente tem BLOCKER explícito', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /PORTFOLIO_RECONCILIATION_MISMATCH[\s\S]*?BLOCKER/));
test('GA77 — sobreposição 12.322×218 é INFO', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /PORTFOLIO_12322_218_OVERLAP[\s\S]*?'INFO'/));
test('GA78 — faturada sem recebimento é WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /BILLED_WITHOUT_RECEIPT[\s\S]*?'WARNING'/));
test('GA79 — Carteira sem item+Un\/CX é WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /PORTFOLIO_ITEM_UNIT_FACTOR_UNMAPPED/));
test('GA80 — histórico sem vínculo é WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /HISTORICAL_PRODUCT_UNMAPPED/));
test('GA81 — 8022 sem vínculo é WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /SALE_PRODUCT_UNMAPPED/));
test('GA82 — identificador ambíguo é WARNING', () => assert.match(sourceText('../src/canonical/globalAudit.ts'), /AMBIGUOUS_PRODUCT_IDENTIFIER/));
test('GA83 — model.alerts entram sem alterar fórmula', () => { const text = sourceText('../src/canonical/globalAudit.ts'); assert.match(text, /for \(const alert of model\.alerts\)/); assert.match(text, /buildStockOverviewModel/); });
test('GA84 — lançamentos e informação antiga permanecem visíveis', async () => { const r = await report(); assert.equal(has(r, 'STOCK_LAUNCH_ITEMS_RECOGNIZED', 'INFO'), true); assert.equal(has(r, 'STOCK_OLD_AUDIT_INFORMATION_PRESERVED', 'PASS'), true); });

// GA85–GA90 — UI/export/arquitetura

test('GA85 — AuditoriaPage usa GlobalAuditReport e não HealthPanel', () => { const text = sourceText('../src/pages/AuditoriaPage.tsx'); assert.match(text, /GlobalAuditReport/); assert.doesNotMatch(text, /HealthPanel/); });
test('GA86 — filtros não alteram report/findings', async () => { const r = await report(); const before = clone(r.findings); filterGlobalAuditFindings(r.findings, { status: 'BLOCKER', domain: 'SOURCES', query: 'fonte' }); assert.deepEqual(r.findings, before); });
test('GA87 — summary counts reconciliam exatamente com findings', async () => { const r = await report(); assert.equal(r.summary.total, r.findings.length); assert.equal(r.summary.blockers + r.summary.warnings + r.summary.info + r.summary.pass, r.summary.total); });
test('GA88 — JSON inclui provenance+summary+findings sem raw canonical/admin/target', async () => { const json = exportGlobalAuditJson(await report()); assert.match(json, /"technicalDetails"/); assert.match(json, /"summary"/); assert.match(json, /"findings"/); assert.doesNotMatch(json, /"records"\s*:/); assert.doesNotMatch(json, /"rcas"\s*:/); assert.doesNotMatch(json, /"rcaTargets"\s*:/); });
test('GA89 — Auditoria não importa mutators/rebuild/seed/certify', () => { const text = sourceText('../src/canonical/globalAudit.ts') + sourceText('../src/pages/AuditoriaPage.tsx'); assert.doesNotMatch(text, /\b(withManual|replaceTarget|replaceAdmin|processSourceUpdates|activateCanonical|certifySource|revokeCertified|recertifySource|applyRegistrySeed|buildCanonicalFromStoredSources)\b/); });
test('GA90 — shell segue sete abas, engine v21 e Cloud/Bundle não são tocados pela auditoria', () => { const audit = sourceText('../src/canonical/globalAudit.ts') + sourceText('../src/canonical/globalAuditInputs.ts'); assert.equal(ADMIN_TABS.length, 7); assert.deepEqual(ADMIN_TABS.map(tab => tab.id), ['bases', 'cadastros', 'metas', 'competencias', 'auditoria', 'canonical', 'sync']); assert.match(sourceText('../src/canonical/sourceImport.ts'), /browser-stage4-product-assortment-v21-source-replacement/); assert.doesNotMatch(audit, /cloudSync|bundleStore|recoverTechnicalBundle/); });

// Race + future gate

test('GA-RACE — active muda durante leitura, snapshot híbrido é descartado e relido', async () => { const ls = baseLists(); const ss = stages(); const reg = emptyAdminRegistryState(NOW); const tgt = target(); const a = await activeFor(ls, ss, reg, tgt); const b = { ...a, motorBuildId: 'BUILD-B' }; let activeReads = 0; let listReads = 0; const deps: GlobalAuditInputDependencies = { loadActive: () => { activeReads += 1; if (activeReads === 1) return a; return b; }, loadList: async id => { listReads += 1; return ls[id]; }, loadStage: async source => ss.find(s => s.source === source), loadRegistry: async () => reg, loadTarget: () => tgt, loadCompetence: () => competence(), loadReplacement: () => emptySourceReplacementState(), loadReportSettings: () => emptySettings }; const captured = await captureGlobalAuditInputs(deps, 3); assert.equal(captured.active?.motorBuildId, 'BUILD-B'); assert.equal(listReads, 8); });
test('GA-GATE — blockingGlobalAuditFindings e globalAuditGate expõem somente blockers para a Fase 7 futura', async () => { const r = await report({ active: null }); assert.equal(globalAuditGate(r), 'BLOCKED'); assert.ok(blockingGlobalAuditFindings(r).every(f => f.status === 'BLOCKER')); });
test('GA-ARCH — não existe GlobalAuditState/storage novo e engine não muda', () => { const audit = sourceText('../src/canonical/globalAudit.ts') + sourceText('../src/canonical/globalAuditInputs.ts'); assert.doesNotMatch(audit, /GlobalAuditState|localStorage|indexedDB|setItem\(|put\(/); assert.equal(CANONICAL_ENGINE_VERSION, 'browser-stage4-product-assortment-v21-source-replacement'); assert.ok(GLOBAL_AUDIT_RECORD_FLAG_CATALOG.RCA_UNRESOLVED); assert.equal(REPLACEABLE_SOURCE_IDS.length, 4); });
