import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateBuildAndWaitForAutoSync,
  baseUpdateCompletionStatus,
  createBaseUpdateSerialGate,
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

test('CASO A — não pareado ativa o novo build e conclui sem erro de sincronização', async () => {
  const build = { motorBuildId: 'BUILD_A' };
  let active: Build | null = null;
  const outcome = await activateBuildAndWaitForAutoSync(
    build,
    value => { active = value; },
    async value => {
      assert.equal(value, build);
      return { status: 'NOT_PAIRED' };
    },
  );

  assert.equal(active, build);
  assert.deepEqual(outcome, { status: 'NOT_PAIRED' });
  assert.equal(baseUpdateCompletionStatus('ATUALIZAÇÃO LOCAL OK.', outcome), 'ATUALIZAÇÃO LOCAL OK.');
});

test('CASO B — pareado + sucesso mantém o fluxo pendente até o upload terminar', async () => {
  const build = { motorBuildId: 'BUILD_B' };
  const upload = deferred<BaseAutoSyncResult>();
  const events: string[] = [];
  let completed = false;

  const flow = activateBuildAndWaitForAutoSync(
    build,
    value => { events.push(`activate:${value.motorBuildId}`); },
    async value => {
      events.push(`sync-start:${value.motorBuildId}`);
      const result = await upload.promise;
      events.push(`sync-end:${value.motorBuildId}`);
      return result;
    },
  ).then(result => { completed = true; return result; });

  await tick();
  assert.equal(completed, false);
  assert.deepEqual(events, ['activate:BUILD_B', 'sync-start:BUILD_B']);

  upload.resolve({ status: 'SYNCED', bytes: 123, motorBuildId: 'BUILD_B' });
  const outcome = await flow;
  assert.equal(completed, true);
  assert.deepEqual(events, ['activate:BUILD_B', 'sync-start:BUILD_B', 'sync-end:BUILD_B']);
  assert.equal(outcome.status, 'SYNCED');
  assert.match(baseUpdateCompletionStatus('ATUALIZAÇÃO LOCAL OK.', outcome), /Sincronização entre aparelhos concluída/);
});

test('CASO C — pareado + falha preserva o build local e só conclui após a rejeição controlada', async () => {
  const previous = { motorBuildId: 'BUILD_OLD' };
  const build = { motorBuildId: 'BUILD_C' };
  const upload = deferred<BaseAutoSyncResult>();
  let active: Build = previous;
  let completed = false;

  const flow = activateBuildAndWaitForAutoSync(
    build,
    value => { active = value; },
    async () => upload.promise,
  ).then(result => { completed = true; return result; });

  await tick();
  assert.equal(active, build);
  assert.equal(completed, false);

  upload.reject(new Error('rede indisponível'));
  const outcome = await flow;
  assert.equal(completed, true);
  assert.equal(active, build);
  assert.equal(outcome.status, 'SYNC_FAILED');
  if (outcome.status !== 'SYNC_FAILED') assert.fail('esperava falha controlada de sync');
  assert.match(String(outcome.error), /rede indisponível/);
  assert.match(baseUpdateCompletionStatus('ATUALIZAÇÃO LOCAL OK.', outcome), /A cópia local foi preservada, mas a sincronização não foi enviada/);
});

test('CASO D — ordem é PROCESSAMENTO → ATIVAÇÃO → SYNC → LIBERAÇÃO', async () => {
  const build = { motorBuildId: 'BUILD_D' };
  const upload = deferred<BaseAutoSyncResult>();
  const events: string[] = [];
  let released = false;

  const workflow = (async () => {
    events.push('processamento');
    const outcome = await activateBuildAndWaitForAutoSync(
      build,
      () => { events.push('ativação'); },
      async () => {
        events.push('sync');
        const result = await upload.promise;
        events.push('sync-concluído');
        return result;
      },
    );
    released = true;
    events.push('liberação');
    return outcome;
  })();

  await tick();
  assert.equal(released, false);
  assert.deepEqual(events, ['processamento', 'ativação', 'sync']);

  upload.resolve({ status: 'SYNCED', bytes: 1, motorBuildId: 'BUILD_D' });
  await workflow;
  assert.equal(released, true);
  assert.deepEqual(events, ['processamento', 'ativação', 'sync', 'sync-concluído', 'liberação']);
});

test('CASO E — duas atualizações não concorrem enquanto o auto-sync da primeira está pendente', async () => {
  const gate = createBaseUpdateSerialGate();
  const upload = deferred<BaseAutoSyncResult>();
  let firstCompleted = false;
  let secondStarted = false;

  const first = gate.run(async () => {
    const outcome = await activateBuildAndWaitForAutoSync(
      { motorBuildId: 'BUILD_E1' },
      () => undefined,
      async () => upload.promise,
    );
    firstCompleted = true;
    return outcome;
  });

  await tick();
  assert.equal(gate.isBusy(), true);
  assert.equal(firstCompleted, false);

  const second = await gate.run(async () => {
    secondStarted = true;
    return { status: 'NOT_PAIRED' as const };
  });
  assert.deepEqual(second, { status: 'BUSY' });
  assert.equal(secondStarted, false);

  upload.resolve({ status: 'SYNCED', bytes: 2, motorBuildId: 'BUILD_E1' });
  const firstResult = await first;
  assert.equal(firstResult.status, 'DONE');
  assert.equal(firstCompleted, true);
  assert.equal(gate.isBusy(), false);

  const next = await gate.run(async () => {
    secondStarted = true;
    return { status: 'NOT_PAIRED' as const };
  });
  assert.equal(next.status, 'DONE');
  assert.equal(secondStarted, true);
});

test('snapshot de build anterior é rejeitado como falha de sync sem desfazer o novo build', async () => {
  const build = { motorBuildId: 'BUILD_NEW' };
  let active: Build | null = null;
  const outcome = await activateBuildAndWaitForAutoSync(
    build,
    value => { active = value; },
    async () => ({ status: 'SYNCED', bytes: 10, motorBuildId: 'BUILD_OLD' }),
  );

  assert.equal(active, build);
  assert.equal(outcome.status, 'SYNC_FAILED');
  if (outcome.status !== 'SYNC_FAILED') assert.fail('esperava rejeição de snapshot antigo');
  assert.match(String(outcome.error), /SYNC_ACTIVE_BUILD_MISMATCH/);
});
