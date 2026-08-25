import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('stage 1 has no active legacy engine, parser or persistence module', () => {
  for (const path of ['src/services', 'src/domain', 'src/store/canonicalPersistence.ts', 'src/store/snapshotHistory.ts', 'src/store/competencePersistence.ts']) {
    assert.equal(existsSync(join(root, path)), false, `${path} must not remain active`);
  }
});

test('migration reset clears all known active runtime stores', () => {
  const source = readFileSync(join(root, 'src/store/migrationReset.ts'), 'utf8');
  for (const marker of ['blue-jacket-data', 'blue-jacket-customer-intelligence', 'blue-jacket:', 'bj_', 'blue_jacket_']) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('baseline artifacts are versioned and excluded from application imports', () => {
  const baseline = join(root, 'docs/migration-baseline/2026-08-24');
  for (const file of ['01_UI_INVENTORY.md', '02_CURRENT_VALUES.json', '03_CURRENT_SOURCES.json', '04_CURRENT_MANUAL_CONFIG.json', '05_CURRENT_EXPORTS.md', '06_PAGE_DATA_REQUIREMENTS.json', '07_MIGRATION_BACKUP.md']) assert.equal(existsSync(join(baseline, file)), true);
  const app = readFileSync(join(root, 'src/main.tsx'), 'utf8');
  assert.doesNotMatch(app, /migration-baseline/);
});
