import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalSnapshot, latestSnapshotsByCompetence, shouldArchive, snapshotCompetence, snapshotId } from '../src/store/snapshotHistory.ts';
import { DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical.ts';

const base = (overrides: Partial<any> = {}) => ({
  schemaVersion: 2, generatedAt: '2026-08-24T12:00:00.000Z', referenceDate: '2026-08-24',
  periodStart: '2026-08-01', periodEnd: '2026-08-31', sources: [], support: { rcas: [], vendorTargets: [], clients: [], activeRoute: [], products: [], itemCodes: [] },
  transactions: [], inventory: [], daily: [], history: { months: [], sameMonthLastYear: null, sameMonthLastYearKey: '', average3ClosedMonths: null, average3MonthKeys: [] },
  industryTarget: 0, industryPositivityTarget: 0, sellOut: {} as any, stock: {} as any, vendors: [], coordinators: [], clients: [], networks: [], lines: [], warnings: [], ...overrides,
});

test('snapshot id and competence are stable and versioned', () => {
  const state = base();
  assert.equal(snapshotCompetence(state), '2026-08');
  assert.equal(snapshotId(state), '2026-08:2026-08-24:2026-08-24T12:00:00.000Z');
  assert.equal(shouldArchive(state, { ...state, generatedAt: '2026-08-25T12:00:00.000Z' }), true);
  assert.equal(shouldArchive(state, { ...state }), false);
});

test('snapshot freezes the canonical payload and manual configuration', () => {
  const state = base();
  const record = createCanonicalSnapshot(state, DEFAULT_MANUAL_CONFIGURATION, '2026-08-31T23:59:59.000Z', 'MONTH_CLOSE');
  assert.equal(record.reason, 'MONTH_CLOSE');
  assert.equal(record.competence, '2026-08');
  assert.notEqual(record.canonical, state);
  assert.notEqual(record.manualConfiguration, DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(record.closedAt, '2026-08-31T23:59:59.000Z');
});

test('keeps only the latest frozen version of each competence for continuous calculations', () => {
  const state = base();
  const older = createCanonicalSnapshot(state, DEFAULT_MANUAL_CONFIGURATION, '2026-08-31T23:00:00.000Z');
  const newer = createCanonicalSnapshot({ ...state, generatedAt: '2026-08-24T13:00:00.000Z' }, DEFAULT_MANUAL_CONFIGURATION, '2026-09-01T08:01:00.000Z');
  const other = createCanonicalSnapshot({ ...state, periodStart: '2026-09-01', generatedAt: '2026-09-01T12:00:00.000Z' }, DEFAULT_MANUAL_CONFIGURATION, '2026-10-01T08:01:00.000Z');
  assert.deepEqual(latestSnapshotsByCompetence([other, older, newer]).map(row => row.id), [newer.id, other.id]);
});
