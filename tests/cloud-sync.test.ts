import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudSyncTestHelpers, type CloudSnapshot, type DeviceSyncIdentity } from '../src/canonical/cloudSync.ts';

const identity: DeviceSyncIdentity = {
  workspaceId: '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a',
  secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const snapshot: CloudSnapshot = {
  format: 'blue-jacket-device-sync/v1',
  createdAt: '2026-09-03T00:00:00.000Z',
  active: null,
  sources: { format: 'blue-jacket-source-storage/v1', exportedAt: '2026-09-03T00:00:00.000Z', staging: [] },
  settings: { networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTarget: null, positivityTarget: null },
};

test('pairing code carries a valid workspace identity and rejects malformed input', () => {
  const code = cloudSyncTestHelpers.pairingCode(identity);
  assert.deepEqual(cloudSyncTestHelpers.parsePairingCode(code), identity);
  assert.throws(() => cloudSyncTestHelpers.parsePairingCode(code.replace(/a$/, '!')), /SYNC_PAIRING_CODE_INVALID/);
});

test('device snapshot is authenticated-encrypted before it reaches remote storage', async () => {
  const payload = await cloudSyncTestHelpers.encrypt(identity, snapshot);
  assert.deepEqual([...payload.slice(0, 4)], [66, 74, 83, 49]);
  assert.ok(!new TextDecoder().decode(payload).includes('blue-jacket-device-sync/v1'));
  assert.deepEqual(await cloudSyncTestHelpers.decrypt(identity, payload), snapshot);
  await assert.rejects(() => cloudSyncTestHelpers.decrypt({ ...identity, secret: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }, payload));
});
