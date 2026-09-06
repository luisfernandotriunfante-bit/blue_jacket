import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cloudSyncTestHelpers, type CloudRestoreDependencies, type CloudSnapshot } from '../src/canonical/cloudSync.ts';
import { compareOfficialCompetence } from '../src/canonical/competence.ts';
import {
  createManualCompetence,
  initializeCompetenceFromAvailableEvidence,
  loadCompetenceState,
  restoreCompetenceState,
  setCurrentCompetence,
  type CompetenceState,
} from '../src/canonical/competenceStore.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const NOW = '2026-09-06T14:20:00.000Z';
const LATER = '2026-09-06T14:21:00.000Z';
const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const openRecord = (id: string, origin: CompetenceState['records'][number]['origin'] = 'MANUAL') => ({
  id,
  status: 'OPEN' as const,
  createdAt: NOW,
  updatedAt: NOW,
  origin,
});

const competenceState = (currentCompetence: string | null, records: CompetenceState['records']): CompetenceState => ({
  schemaVersion: 'v1',
  initializedAt: NOW,
  updatedAt: NOW,
  currentCompetence,
  records,
});

const active = {
  status: 'ACTIVE',
  motorBuildId: 'BUILD_BOOTSTRAP_LIFECYCLE',
  stagingManifestHash: 'hash',
  schemaVersion: 'v1',
  engineVersion: 'browser-stage4-product-assortment-v18-sellout-closure',
  approvedAt: NOW,
  rowCounts: {},
  factTypeCounts: {},
} as any;

const sources = {
  format: 'blue-jacket-source-storage/v1' as const,
  exportedAt: NOW,
  staging: [],
};

const emptySettings = {
  networkTargetByCompetence: {},
  networkAllocationByCompetence: {},
  sellOutTargetByCompetence: {},
  positivityTargetByCompetence: {},
  legacySellOutTarget: null,
  legacyPositivityTarget: null,
  inboundForecastByInvoice: {},
};

const augustSettings = {
  ...emptySettings,
  sellOutTargetByCompetence: { '2026-08': 1 },
};

function restoredSettingsCompetences(settings: typeof emptySettings | typeof augustSettings) {
  return [...new Set([
    ...Object.keys(settings.sellOutTargetByCompetence),
    ...Object.keys(settings.positivityTargetByCompetence),
    ...Object.keys(settings.networkTargetByCompetence),
  ])];
}

function cloudHarness(target: ReturnType<typeof memoryStorage>, initialSettings = emptySettings) {
  let currentSources = structuredClone(sources);
  let currentSettings: typeof emptySettings | typeof augustSettings = structuredClone(initialSettings);
  const dependencies: CloudRestoreDependencies = {
    exportSources: async () => structuredClone(currentSources),
    loadSettings: () => structuredClone(currentSettings),
    loadCompetence: () => loadCompetenceState(target),
    restoreSources: async next => { currentSources = structuredClone(next); },
    restoreSettings: next => {
      currentSettings = structuredClone(next as typeof emptySettings | typeof augustSettings);
      return currentSettings;
    },
    replaceCompetence: next => {
      if (next === null) {
        target.removeItem('blue-jacket-v1-competence-state');
        return null;
      }
      return restoreCompetenceState(next, target);
    },
    build: async () => active,
  };
  return { dependencies, settings: () => structuredClone(currentSettings) };
}

// T25
 test('T25 — fresh app sem build/settings não cria CompetenceState vazio', () => {
  const target = memoryStorage();
  const result = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: false,
    observedM3: null,
    settingsCompetences: [],
    target,
    now: NOW,
  });
  assert.equal(result.status, 'WAIT');
  assert.equal(result.state, null);
  assert.equal(loadCompetenceState(target), null);
});

// T26
 test('T26 — primeiro build com M3 único completa bootstrap e seleciona o mês', () => {
  const target = memoryStorage();
  initializeCompetenceFromAvailableEvidence({ hasActiveBuild: false, observedM3: null, settingsCompetences: [], target, now: NOW });
  const result = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: [],
    target,
    now: LATER,
  });
  assert.equal(result.status, 'INITIALIZED');
  assert.equal(result.state?.currentCompetence, '2026-09');
  assert.deepEqual(result.state?.records.map(record => [record.id, record.status, record.origin]), [['2026-09', 'OPEN', 'MIGRATION_M3']]);
});

// T27
 test('T27 — state vazio criado pelo PR #163 é reparado pelo primeiro M3 válido', () => {
  const target = memoryStorage();
  restoreCompetenceState(competenceState(null, []), target);
  const result = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: [],
    target,
    now: LATER,
  });
  assert.equal(result.status, 'REPAIRED');
  assert.equal(result.state?.currentCompetence, '2026-09');
  assert.equal(result.state?.records[0]?.origin, 'MIGRATION_M3');
});

// T28
 test('T28 — state real com current é preservado integralmente diante de M3 novo', () => {
  const target = memoryStorage();
  const original = competenceState('2026-08', [openRecord('2026-08')]);
  restoreCompetenceState(original, target);
  const result = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: ['2026-09'],
    target,
    now: LATER,
  });
  assert.equal(result.status, 'PRESERVED');
  assert.deepEqual(result.state, original);
  assert.deepEqual(loadCompetenceState(target), original);
});

// T29
 test('T29 — records sem current continuam decisão administrativa e não recebem M3 automaticamente', () => {
  const target = memoryStorage();
  const original = competenceState(null, [openRecord('2026-08')]);
  restoreCompetenceState(original, target);
  const result = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: [],
    target,
    now: LATER,
  });
  assert.equal(result.status, 'PRESERVED');
  assert.deepEqual(result.state, original);
  assert.equal(result.state?.currentCompetence, null);
  assert.equal(result.state?.records.some(record => record.id === '2026-09'), false);
});

// T30
 test('T30 — corrida assíncrona: decisão manual concluída antes do M3 sempre vence', async () => {
  const target = memoryStorage();
  let resolveObserved!: (value: string) => void;
  const observed = new Promise<string>(resolve => { resolveObserved = resolve; });
  const pendingBootstrap = observed.then(value => initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: value,
    settingsCompetences: [],
    target,
    now: LATER,
  }));

  createManualCompetence('2026-08', { target, now: NOW });
  setCurrentCompetence('2026-08', { target, now: NOW });
  resolveObserved('2026-09');

  const result = await pendingBootstrap;
  assert.equal(result.status, 'PRESERVED');
  assert.equal(result.state?.currentCompetence, '2026-08');
  assert.deepEqual(result.state?.records.map(record => record.id), ['2026-08']);
});

// T31
 test('T31 — snapshot legado em device novo bootstrapa settings + M3 após rebuild', async () => {
  const target = memoryStorage();
  const initial = initializeCompetenceFromAvailableEvidence({ hasActiveBuild: false, observedM3: null, settingsCompetences: [], target, now: NOW });
  assert.equal(initial.status, 'WAIT');
  assert.equal(loadCompetenceState(target), null);

  const harness = cloudHarness(target);
  const legacy: CloudSnapshot = {
    format: 'blue-jacket-device-sync/v1',
    createdAt: NOW,
    active,
    sources,
    settings: augustSettings,
  };
  await cloudSyncTestHelpers.applyCloudSnapshot(legacy, harness.dependencies);
  assert.equal(loadCompetenceState(target), null);

  const afterRebuild = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: restoredSettingsCompetences(harness.settings()),
    target,
    now: LATER,
  });
  assert.equal(afterRebuild.state?.currentCompetence, '2026-09');
  assert.deepEqual(afterRebuild.state?.records.map(record => record.id).sort(), ['2026-08', '2026-09']);
  assert.equal(afterRebuild.state?.records.find(record => record.id === '2026-08')?.origin, 'MIGRATION_REPORT_SETTINGS');
  assert.equal(afterRebuild.state?.records.find(record => record.id === '2026-09')?.origin, 'MIGRATION_M3');
});

// T32
 test('T32 — snapshot legado preserva state oficial real e M3 remoto vira mismatch', async () => {
  const target = memoryStorage();
  const local = competenceState('2026-08', [openRecord('2026-08')]);
  restoreCompetenceState(local, target);
  const harness = cloudHarness(target);
  const legacy: CloudSnapshot = {
    format: 'blue-jacket-device-sync/v1',
    createdAt: NOW,
    active,
    sources,
    settings: emptySettings,
  };
  await cloudSyncTestHelpers.applyCloudSnapshot(legacy, harness.dependencies);
  const afterRebuild = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: restoredSettingsCompetences(harness.settings()),
    target,
    now: LATER,
  });
  assert.deepEqual(afterRebuild.state, local);
  assert.equal(afterRebuild.state?.currentCompetence, '2026-08');
  assert.equal(compareOfficialCompetence(afterRebuild.state?.currentCompetence ?? null, '2026-09'), 'MISMATCH');
});

// T33
 test('T33 — snapshot novo restaura CompetenceState e bootstrap M3 não o sobrescreve', async () => {
  const target = memoryStorage();
  const remoteState = competenceState('2026-08', [openRecord('2026-08', 'SYNC')]);
  const harness = cloudHarness(target);
  const snapshot: CloudSnapshot = {
    format: 'blue-jacket-device-sync/v1',
    createdAt: NOW,
    active,
    sources,
    settings: emptySettings,
    competenceState: remoteState,
  };
  await cloudSyncTestHelpers.applyCloudSnapshot(snapshot, harness.dependencies);
  assert.deepEqual(loadCompetenceState(target), remoteState);

  const afterRebuild = initializeCompetenceFromAvailableEvidence({
    hasActiveBuild: true,
    observedM3: '2026-09',
    settingsCompetences: [],
    target,
    now: LATER,
  });
  assert.equal(afterRebuild.status, 'PRESERVED');
  assert.deepEqual(afterRebuild.state, remoteState);
  assert.equal(compareOfficialCompetence(afterRebuild.state?.currentCompetence ?? null, '2026-09'), 'MISMATCH');
});

 test('lifecycle production wiring espera evidência e relê o state após o await de M3', () => {
  const dataContext = source('../src/store/DataContext.tsx');
  assert.match(dataContext, /initializeCompetenceFromAvailableEvidence/);
  assert.doesNotMatch(dataContext, /bootstrapCompetenceState\(null,settingsCompetences\)/);
  assert.ok(dataContext.indexOf("loadCandidateList('M3_MOVIMENTO_VENDAS')") < dataContext.indexOf('initialize(observed,true)'));
});
