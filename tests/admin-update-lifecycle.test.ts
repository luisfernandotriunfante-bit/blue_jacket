import test from 'node:test';
import assert from 'node:assert/strict';
import { syncActiveBuildIfPaired, type BaseAutoSyncDependencies } from '../src/pages/admin/baseAutoSync.ts';
import {
  activateBuildAndWaitForAutoSync,
  baseUpdateCompletionStatus,
  baseUpdateCoordinator,
  type BaseAutoSyncResult,
} from '../src/pages/admin/baseUpdateFlow.ts';

type Build = { motorBuildId: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

function consumer() {
  let state = baseUpdateCoordinator.getState();
  const unsubscribe = baseUpdateCoordinator.subscribe(next => { state = next; });
  return { read: () => state, unsubscribe };
}

function resetCoordinator() {
  assert.equal(baseUpdateCoordinator.getState().busy, false);
  assert.equal(baseUpdateCoordinator.dismissResult(), true);
}

function runUpdate(
  build: Build,
  sync: Promise<BaseAutoSyncResult>,
  hooks: { onProcess?: () => void; onActivate?: (build: Build) => void } = {},
) {
  return baseUpdateCoordinator.run(async controls => {
    controls.setPhase('PROCESSING');
    hooks.onProcess?.();
    controls.setPhase('ACTIVATING');
    const outcome = await activateBuildAndWaitForAutoSync(
      build,
      value => hooks.onActivate?.(value),
      async () => {
        controls.setPhase('SYNCING');
        return sync;
      },
    );
    const localStatus = `ATUALIZAÇÃO CONCLUÍDA — Build ativo: ${build.motorBuildId}.`;
    if (outcome.status === 'SYNC_FAILED') {
      return {
        phase: 'LOCAL_SUCCESS_SYNC_FAILED' as const,
        status: baseUpdateCompletionStatus(localStatus, outcome),
        error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
      };
    }
    return {
      phase: 'SUCCESS' as const,
      status: baseUpdateCompletionStatus(localStatus, outcome),
      error: '',
    };
  });
}

test('CASO F — remount durante sync preserva busy global e bloqueia Update B', async () => {
  resetCoordinator();
  const syncA = deferred<BaseAutoSyncResult>();
  let processA = 0;
  let processB = 0;
  const firstView = consumer();

  const updateA = runUpdate(
    { motorBuildId: 'BUILD_F_A' },
    syncA.promise,
    { onProcess: () => { processA += 1; } },
  );
  await tick();
  assert.equal(firstView.read().phase, 'SYNCING');
  assert.equal(firstView.read().busy, true);

  firstView.unsubscribe();
  const remountedView = consumer();
  assert.equal(remountedView.read().phase, 'SYNCING');
  assert.equal(remountedView.read().busy, true);

  const updateB = await baseUpdateCoordinator.run(async () => {
    processB += 1;
    return { phase: 'SUCCESS', status: 'B', error: '' };
  });
  assert.deepEqual(updateB, { status: 'BUSY' });
  assert.equal(processA, 1);
  assert.equal(processB, 0);

  syncA.resolve({ status: 'SYNCED', bytes: 10, motorBuildId: 'BUILD_F_A' });
  await updateA;
  assert.equal(remountedView.read().busy, false);
  remountedView.unsubscribe();
  resetCoordinator();
});

test('CASO G — sucesso durante ausência da view permanece disponível no remount', async () => {
  resetCoordinator();
  const sync = deferred<BaseAutoSyncResult>();
  const firstView = consumer();
  const update = runUpdate({ motorBuildId: 'BUILD_G' }, sync.promise);
  await tick();
  firstView.unsubscribe();

  sync.resolve({ status: 'SYNCED', bytes: 20, motorBuildId: 'BUILD_G' });
  await update;

  const remountedView = consumer();
  assert.equal(remountedView.read().phase, 'SUCCESS');
  assert.equal(remountedView.read().busy, false);
  assert.match(remountedView.read().status, /Sincronização entre aparelhos concluída/);

  let nextStarted = false;
  const next = await baseUpdateCoordinator.run(async () => {
    nextStarted = true;
    return { phase: 'SUCCESS', status: 'NEXT', error: '' };
  });
  assert.equal(next.status, 'DONE');
  assert.equal(nextStarted, true);
  remountedView.unsubscribe();
  resetCoordinator();
});

test('CASO H — falha durante ausência preserva build local, resultado e motivo no remount', async () => {
  resetCoordinator();
  const sync = deferred<BaseAutoSyncResult>();
  let active: Build = { motorBuildId: 'BUILD_OLD' };
  const firstView = consumer();
  const update = runUpdate(
    { motorBuildId: 'BUILD_H' },
    sync.promise,
    { onActivate: build => { active = build; } },
  );
  await tick();
  assert.equal(active.motorBuildId, 'BUILD_H');
  firstView.unsubscribe();

  sync.reject(new Error('rede indisponível no remount'));
  await update;

  const remountedView = consumer();
  assert.equal(active.motorBuildId, 'BUILD_H');
  assert.equal(remountedView.read().phase, 'LOCAL_SUCCESS_SYNC_FAILED');
  assert.equal(remountedView.read().busy, false);
  assert.match(remountedView.read().status, /A cópia local foi preservada, mas a sincronização não foi enviada/);
  assert.match(remountedView.read().error, /rede indisponível no remount/);
  remountedView.unsubscribe();
  resetCoordinator();
});

test('CASO I — remover consumidor não cancela processamento, ativação ou sync', async () => {
  resetCoordinator();
  const processing = deferred<void>();
  const sync = deferred<BaseAutoSyncResult>();
  const events: string[] = [];
  const firstView = consumer();

  const update = baseUpdateCoordinator.run(async controls => {
    controls.setPhase('PROCESSING');
    events.push('processing');
    await processing.promise;
    controls.setPhase('ACTIVATING');
    events.push('activating');
    const outcome = await activateBuildAndWaitForAutoSync(
      { motorBuildId: 'BUILD_I' },
      () => { events.push('activated'); },
      async () => {
        controls.setPhase('SYNCING');
        events.push('syncing');
        return sync.promise;
      },
    );
    events.push('completed');
    return { phase: 'SUCCESS', status: baseUpdateCompletionStatus('LOCAL OK.', outcome), error: '' };
  });

  await tick();
  assert.deepEqual(events, ['processing']);
  firstView.unsubscribe();
  processing.resolve();
  await tick();
  assert.deepEqual(events, ['processing', 'activating', 'activated', 'syncing']);
  assert.equal(baseUpdateCoordinator.getState().phase, 'SYNCING');
  assert.equal(baseUpdateCoordinator.getState().busy, true);

  sync.resolve({ status: 'SYNCED', bytes: 30, motorBuildId: 'BUILD_I' });
  await update;
  assert.deepEqual(events, ['processing', 'activating', 'activated', 'syncing', 'completed']);
  assert.equal(baseUpdateCoordinator.getState().phase, 'SUCCESS');
  resetCoordinator();
});

const identity = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

const bundle = (motorBuildId: string) => ({ motorBuildId }) as any;

function syncDeps(activeId: string, uploadResultId: string, onUpload: () => void): BaseAutoSyncDependencies {
  return {
    getIdentity: () => identity,
    getActive: () => bundle(activeId),
    upload: async () => {
      onUpload();
      return { bytes: 42, active: bundle(uploadResultId), updatedAt: '2026-09-06T13:00:00.000Z' };
    },
  };
}

test('CASO J — pre-check rejeita active BUILD_OLD antes do upload esperado BUILD_NEW', async () => {
  let uploads = 0;
  await assert.rejects(
    () => syncActiveBuildIfPaired('BUILD_NEW', syncDeps('BUILD_OLD', 'BUILD_NEW', () => { uploads += 1; })),
    /SYNC_ACTIVE_BUILD_MISMATCH/,
  );
  assert.equal(uploads, 0);
});

test('CASO K — pre-check e post-check aceitam build correto e rejeitam retorno diferente', async () => {
  let uploads = 0;
  const ok = await syncActiveBuildIfPaired(
    'BUILD_NEW',
    syncDeps('BUILD_NEW', 'BUILD_NEW', () => { uploads += 1; }),
  );
  assert.deepEqual(ok, { status: 'SYNCED', bytes: 42, motorBuildId: 'BUILD_NEW' });
  assert.equal(uploads, 1);

  await assert.rejects(
    () => syncActiveBuildIfPaired('BUILD_NEW', syncDeps('BUILD_NEW', 'BUILD_OTHER', () => { uploads += 1; })),
    /SYNC_ACTIVE_BUILD_MISMATCH/,
  );
  assert.equal(uploads, 2);
});
