import test from 'node:test';
import assert from 'node:assert/strict';
import { getCanonicalSnapshotCompatibilityIssue, STALE_ITEM_SNAPSHOT_NOTICE } from '../src/store/snapshotCompatibility.ts';

function state(overrides: Record<string, unknown> = {}) {
  const issues = Array.from({ length: 80 }, (_, index) => ({
    id: `105:${index}`,
    domain: 'ITEM',
    severity: 'WARNING',
    code: 'STOCK_105_CODE_NOT_IN_ITEM_MASTER',
    message: 'unresolved',
    source: '105',
    entityKey: String(index),
  }));
  return {
    schemaVersion: 2,
    unifiedSchemaVersion: 1,
    unified: {
      schemaVersion: 1,
      generatedAt: '2026-08-23T00:00:00Z',
      sources: [{ sourceType: '286' }, { sourceType: '105' }],
      qualityIssues: issues,
      items: [
        { itemCanonicalId: 'WINTHOR:11', winthorCode: '11', hasWinthor: true, sourceKeys: { '286': '11' } },
        ...Array.from({ length: 100 }, (_, index) => ({ itemCanonicalId: `EAN:${index}`, winthorCode: '', hasWinthor: false, sourceKeys: {} })),
      ],
    },
    ...overrides,
  } as any;
}

test('descarta fotografia conhecida onde filial 11 virou código de produto e 105 ficou sem ITEM_MASTER', () => {
  assert.equal(getCanonicalSnapshotCompatibilityIssue(state()), STALE_ITEM_SNAPSHOT_NOTICE);
});

test('não descarta fotografia válida apenas porque existe código Winthor 11', () => {
  const valid = state();
  valid.unified.items = [
    { itemCanonicalId: 'WINTHOR:11', winthorCode: '11', hasWinthor: true, sourceKeys: { '286': '11' } },
    { itemCanonicalId: 'WINTHOR:857', winthorCode: '857', hasWinthor: true, sourceKeys: { '286': '857' } },
  ];
  valid.unified.qualityIssues = [];
  assert.equal(getCanonicalSnapshotCompatibilityIssue(valid), '');
});

test('não invalida fotografia sem 105 e 286 simultaneamente', () => {
  const partial = state();
  partial.unified.sources = [{ sourceType: '286' }];
  assert.equal(getCanonicalSnapshotCompatibilityIssue(partial), '');
});
