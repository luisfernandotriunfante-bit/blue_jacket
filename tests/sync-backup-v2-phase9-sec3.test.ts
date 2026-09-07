import assert from 'node:assert/strict';
import test from 'node:test';

type EdgeHandler = (req: Request) => Promise<Response>;
type HistoryRow = {
  workspace_id: string;
  object_key: string;
  state: 'PENDING' | 'READY';
  claim_token: string;
  payload_bytes: number | null;
  created_at: string;
  updated_at: string;
};

type Scenario = {
  metadataWorkspaceId?: string;
  metadataState?: 'PENDING' | 'READY';
  metadataBytes?: number | null;
  storageEntries?: Array<{ workspaceId: string; payload: Uint8Array }>;
  forcedStorageResponse?: { status: number; body?: unknown };
};

const workspaceA = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};
const workspaceB = {
  workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  secret: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
};
const objectKey = 'c'.repeat(64);
const storagePath = (workspaceId: string) => `${workspaceId}/history/${objectKey}.bjh`;

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function runHistoryDownloadScenario(scenario: Scenario) {
  const globalWithDeno = globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string | undefined }; serve(handler: EdgeHandler): void };
  };
  const previousDeno = globalWithDeno.Deno;
  const previousFetch = globalThis.fetch;
  let handler: EdgeHandler | undefined;
  const metadataReads: Array<{ workspaceId: string; objectKey: string }> = [];
  const storageReads: string[] = [];
  const historyRows = new Map<string, HistoryRow>();
  const storage = new Map<string, Uint8Array>();
  const keyHashB = await sha256(workspaceB.secret);
  const workspaceRowB = {
    workspace_id: workspaceB.workspaceId,
    key_hash: keyHashB,
    updated_at: '2026-09-07T00:00:00.000Z',
    payload_bytes: 0,
    protocol_version: 1,
    revision: 0,
    current_object: null,
  };
  const historyKey = (workspaceId: string, key: string) => `${workspaceId}:${key}`;
  if (scenario.metadataWorkspaceId) {
    const now = '2026-09-07T00:00:00.000Z';
    historyRows.set(historyKey(scenario.metadataWorkspaceId, objectKey), {
      workspace_id: scenario.metadataWorkspaceId,
      object_key: objectKey,
      state: scenario.metadataState ?? 'READY',
      claim_token: '11111111-1111-4111-8111-111111111111',
      payload_bytes: scenario.metadataBytes ?? null,
      created_at: now,
      updated_at: now,
    });
  }
  for (const entry of scenario.storageEntries ?? []) storage.set(storagePath(entry.workspaceId), entry.payload.slice());

  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  const queryValue = (url: URL, name: string) => {
    const raw = url.searchParams.get(name) ?? '';
    return raw.startsWith('eq.') ? decodeURIComponent(raw.slice(3)) : raw;
  };

  globalWithDeno.Deno = {
    env: {
      get(name: string) {
        if (name === 'SUPABASE_URL') return 'https://mock.supabase.co';
        if (name === 'SUPABASE_SECRET_KEYS') return JSON.stringify({ default: 'mock-service-role' });
        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-role';
        return undefined;
      },
    },
    serve(captured: EdgeHandler) { handler = captured; },
  };

  globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (url.pathname === '/rest/v1/blue_jacket_sync_workspaces' && method === 'GET') {
      return queryValue(url, 'workspace_id') === workspaceB.workspaceId ? jsonResponse([workspaceRowB]) : jsonResponse([]);
    }

    if (url.pathname === '/rest/v1/blue_jacket_sync_history_objects' && method === 'GET') {
      const workspaceId = queryValue(url, 'workspace_id');
      const key = queryValue(url, 'object_key');
      metadataReads.push({ workspaceId, objectKey: key });
      const row = historyRows.get(historyKey(workspaceId, key));
      return jsonResponse(row ? [row] : []);
    }

    if (url.pathname.startsWith('/storage/v1/object/blue-jacket-sync/') && method === 'GET') {
      const path = url.pathname.slice('/storage/v1/object/blue-jacket-sync/'.length);
      storageReads.push(path);
      if (scenario.forcedStorageResponse) {
        return jsonResponse(scenario.forcedStorageResponse.body ?? { message: 'forced response' }, scenario.forcedStorageResponse.status);
      }
      const payload = storage.get(path);
      if (!payload) return jsonResponse({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 404);
      return new Response(payload.slice(), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(payload.byteLength) },
      });
    }

    throw new Error(`UNEXPECTED_FETCH ${method} ${url}`);
  };

  try {
    const moduleUrl = new URL(`../supabase/functions/blue-jacket-sync/index.ts?sec3=${Date.now()}-${Math.random()}`, import.meta.url);
    await import(moduleUrl.href);
    assert.ok(handler);
    const response = await handler(new Request('https://edge.mock/functions/v1/blue-jacket-sync', {
      method: 'GET',
      headers: {
        'x-blue-jacket-action': 'history-download',
        'x-blue-jacket-workspace': workspaceB.workspaceId,
        'x-blue-jacket-secret': workspaceB.secret,
        'x-blue-jacket-object-key': objectKey,
      },
    }));
    const type = response.headers.get('content-type') ?? '';
    const body = type.includes('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer());
    return { response, body, metadataReads, storageReads };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDeno === undefined) delete globalWithDeno.Deno;
    else globalWithDeno.Deno = previousDeno;
  }
}

const sb = (number: number, title: string, fn: () => void | Promise<void>) => test(`SB${number} — ${title}`, fn);

sb(113, 'cross-workspace metadata ausente retorna 404 MISSING antes do Storage', async () => {
  const foreign = new TextEncoder().encode('workspace-A-history');
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceA.workspaceId,
    metadataState: 'READY',
    metadataBytes: foreign.byteLength,
    storageEntries: [{ workspaceId: workspaceA.workspaceId, payload: foreign }],
  });
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.body, { error: 'SYNC_REMOTE_HISTORY_OBJECT_MISSING' });
  assert.deepEqual(result.metadataReads, [{ workspaceId: workspaceB.workspaceId, objectKey }]);
  assert.equal(result.storageReads.length, 0);
});

sb(114, 'download nunca resolve path de outro workspace', async () => {
  const own = new TextEncoder().encode('workspace-B-history');
  const foreign = new TextEncoder().encode('workspace-A-history');
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'READY',
    metadataBytes: own.byteLength,
    storageEntries: [
      { workspaceId: workspaceA.workspaceId, payload: foreign },
      { workspaceId: workspaceB.workspaceId, payload: own },
    ],
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.storageReads, [storagePath(workspaceB.workspaceId)]);
  assert.equal(result.storageReads.some(path => path.startsWith(workspaceA.workspaceId)), false);
});

sb(115, 'READY no workspace correto devolve bytes bit-a-bit', async () => {
  const own = new TextEncoder().encode('workspace-B-ready-payload');
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'READY',
    metadataBytes: own.byteLength,
    storageEntries: [{ workspaceId: workspaceB.workspaceId, payload: own }],
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, own);
});

sb(116, 'metadata ausente é ausência normal e não 5xx', async () => {
  const result = await runHistoryDownloadScenario({});
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.body, { error: 'SYNC_REMOTE_HISTORY_OBJECT_MISSING' });
  assert.equal(result.storageReads.length, 0);
});

sb(117, 'metadata PENDING nunca libera bytes', async () => {
  const own = new TextEncoder().encode('pending-must-not-download');
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'PENDING',
    metadataBytes: null,
    storageEntries: [{ workspaceId: workspaceB.workspaceId, payload: own }],
  });
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.body, { error: 'SYNC_REMOTE_HISTORY_OBJECT_MISSING' });
  assert.equal(result.storageReads.length, 0);
});

sb(118, 'READY com Storage ausente normaliza Object not found para 404 MISSING', async () => {
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'READY',
    metadataBytes: 10,
    forcedStorageResponse: { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } },
  });
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.body, { error: 'SYNC_REMOTE_HISTORY_OBJECT_MISSING' });
});

sb(119, 'READY com payload_bytes incompatível retorna 409 CORRUPT', async () => {
  const own = new TextEncoder().encode('short');
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'READY',
    metadataBytes: own.byteLength + 1,
    storageEntries: [{ workspaceId: workspaceB.workspaceId, payload: own }],
  });
  assert.equal(result.response.status, 409);
  assert.deepEqual(result.body, { error: 'SYNC_REMOTE_HISTORY_OBJECT_CORRUPT' });
});

sb(120, 'falha real de Storage permanece 5xx e não vira MISSING', async () => {
  const result = await runHistoryDownloadScenario({
    metadataWorkspaceId: workspaceB.workspaceId,
    metadataState: 'READY',
    metadataBytes: 10,
    forcedStorageResponse: { status: 503, body: { message: 'backend unavailable' } },
  });
  assert.equal(result.response.status, 502);
  assert.deepEqual(result.body, { error: 'SYNC_HISTORY_DOWNLOAD_FAILED' });
});