const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
const SERVICE_KEY = keys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'blue-jacket-sync';
const MAX_BYTES = 52_428_800;
const HISTORY_TABLE = 'blue_jacket_sync_history_objects';
const HISTORY_CLAIM_POLL_MS = 100;
const HISTORY_CLAIM_TIMEOUT_MS = 10_000;
const ORIGINS = new Set(['https://luisfernandotriunfante-bit.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);

type WorkspaceRow = {
  workspace_id: string;
  key_hash: string;
  updated_at: string;
  payload_bytes: number;
  protocol_version: number;
  revision: number;
  current_object: string | null;
};

type HistoryObjectRow = {
  workspace_id: string;
  object_key: string;
  state: 'PENDING' | 'READY';
  claim_token: string;
  payload_bytes: number | null;
  created_at: string;
  updated_at: string;
};

type HistoryUploadResult =
  | { status: 'CREATED' | 'EXISTING'; bytes: number }
  | { error: 'SYNC_HISTORY_UPLOAD_IN_PROGRESS' | 'SYNC_REMOTE_HISTORY_OBJECT_MISSING' | 'SYNC_REMOTE_HISTORY_OBJECT_CORRUPT'; http: 409 | 404 };

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://luisfernandotriunfante-bit.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-blue-jacket-action, x-blue-jacket-workspace, x-blue-jacket-secret, x-blue-jacket-if-revision, x-blue-jacket-object-key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'x-blue-jacket-updated-at',
    Vary: 'Origin',
  };
}
function reply(req: Request, body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(cors(req))) headers.set(key, value);
  return new Response(body, { ...init, headers });
}
function json(req: Request, body: unknown, status = 200) {
  return reply(req, JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function fail(req: Request, status: number, error: string) { return json(req, { error }, status); }
function validWorkspaceId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validObjectKey(value: string) { return /^[0-9a-f]{64}$/i.test(value); }
async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function serviceHeaders(extra: HeadersInit = {}) { return { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, ...extra }; }
function encodedPath(path: string) { return path.split('/').map(segment => encodeURIComponent(segment)).join('/'); }
function storageObjectUrl(path: string) { return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath(path)}`; }
function legacyCurrentPath(workspaceId: string) { return `${workspaceId}/current.bjs`; }
function historyObjectPath(workspaceId: string, objectKey: string) { return `${workspaceId}/history/${objectKey.toLowerCase()}.bjh`; }
function historyMetadataUrl(workspaceId: string, objectKey: string, suffix = '') {
  return `${SUPABASE_URL}/rest/v1/${HISTORY_TABLE}?workspace_id=eq.${encodeURIComponent(workspaceId)}&object_key=eq.${encodeURIComponent(objectKey)}${suffix}`;
}
function statusBody(row: WorkspaceRow) {
  return {
    updatedAt: row.updated_at,
    bytes: Number(row.payload_bytes),
    revision: Number(row.revision),
    protocolVersion: Number(row.protocol_version),
  };
}
function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function workspace(workspaceId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,key_hash,updated_at,payload_bytes,protocol_version,revision,current_object`, { headers: serviceHeaders() });
  if (!response.ok) throw new Error('WORKSPACE_READ_FAILED');
  return (await response.json() as WorkspaceRow[])[0];
}
async function access(req: Request) {
  const workspaceId = req.headers.get('x-blue-jacket-workspace') ?? '';
  const secret = req.headers.get('x-blue-jacket-secret') ?? '';
  if (!validWorkspaceId(workspaceId) || secret.length < 40 || secret.length > 100) return null;
  const row = await workspace(workspaceId);
  if (!row || !equal(row.key_hash, await hash(secret))) return null;
  return { workspaceId, row };
}

async function removeObject(path: string) {
  const response = await fetch(storageObjectUrl(path), { method: 'DELETE', headers: serviceHeaders() });
  if (response.status !== 404 && !response.ok) throw new Error('SYNC_DELETE_FAILED');
}

async function objectInfo(path: string) {
  const response = await fetch(storageObjectUrl(path), { method: 'HEAD', headers: serviceHeaders() });
  if (response.status === 404) return { exists: false, bytes: 0 };
  if (!response.ok) throw new Error('SYNC_HISTORY_STATUS_FAILED');
  const bytes = Number(response.headers.get('content-length') ?? '0');
  return { exists: true, bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0 };
}

async function storageResponseMeansMissing(response: Response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const text = await response.text().catch(() => '');
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON 400 remains an infrastructure/error response */ }
  const code = String(body.code ?? '');
  const error = String(body.error ?? '');
  const statusCode = String(body.statusCode ?? '');
  const message = String(body.message ?? text).trim().toLowerCase();
  return code === 'NoSuchKey' || error === 'not_found' || statusCode === '404' || message === 'object not found';
}

async function downloadHistoryStorageObject(path: string) {
  const response = await fetch(storageObjectUrl(path), { headers: serviceHeaders() });
  if (response.ok) return { status: 'READY' as const, payload: await response.arrayBuffer() };
  if (await storageResponseMeansMissing(response)) return { status: 'MISSING' as const };
  return { status: 'ERROR' as const };
}

async function uploadCreateOnly(path: string, payload: ArrayBuffer) {
  const response = await fetch(storageObjectUrl(path), {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }),
    body: payload,
  });
  if (response.ok) return 'CREATED' as const;
  if (response.status === 400 || response.status === 409) {
    const info = await objectInfo(path);
    if (info.exists) return 'EXISTING' as const;
  }
  throw new Error('SYNC_HISTORY_UPLOAD_FAILED');
}

async function historyMetadata(workspaceId: string, objectKey: string) {
  const response = await fetch(historyMetadataUrl(workspaceId, objectKey, '&select=workspace_id,object_key,state,claim_token,payload_bytes,created_at,updated_at'), { headers: serviceHeaders() });
  if (!response.ok) throw new Error('SYNC_HISTORY_METADATA_READ_FAILED');
  return (await response.json() as HistoryObjectRow[])[0];
}

async function claimHistoryObject(workspaceId: string, objectKey: string, claimToken: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${HISTORY_TABLE}`, {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({
      workspace_id: workspaceId,
      object_key: objectKey,
      state: 'PENDING',
      claim_token: claimToken,
      payload_bytes: null,
    }),
  });
  if (response.ok) {
    const rows = await response.json() as HistoryObjectRow[];
    if (rows.length === 1 && rows[0].claim_token === claimToken && rows[0].state === 'PENDING') return true;
    throw new Error('SYNC_HISTORY_CLAIM_FAILED');
  }
  if (response.status === 409) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    if (body.code === '23505') return false;
  }
  throw new Error('SYNC_HISTORY_CLAIM_FAILED');
}

async function releaseHistoryClaim(workspaceId: string, objectKey: string, claimToken: string) {
  const response = await fetch(historyMetadataUrl(workspaceId, objectKey, `&claim_token=eq.${encodeURIComponent(claimToken)}&state=eq.PENDING`), {
    method: 'DELETE',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
  });
  if (!response.ok) throw new Error('SYNC_HISTORY_CLAIM_RELEASE_FAILED');
}

async function markHistoryReady(workspaceId: string, objectKey: string, claimToken: string, bytes: number) {
  const updatedAt = new Date().toISOString();
  const response = await fetch(historyMetadataUrl(workspaceId, objectKey, `&claim_token=eq.${encodeURIComponent(claimToken)}&state=eq.PENDING`), {
    method: 'PATCH',
    headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ state: 'READY', payload_bytes: bytes, updated_at: updatedAt }),
  });
  if (response.ok) {
    const rows = await response.json() as HistoryObjectRow[];
    if (rows.length === 1 && rows[0].claim_token === claimToken && rows[0].state === 'READY' && Number(rows[0].payload_bytes) === bytes) return rows[0];
  }
  const observed = await historyMetadata(workspaceId, objectKey).catch(() => undefined);
  if (observed?.claim_token === claimToken && observed.state === 'READY' && Number(observed.payload_bytes) === bytes) return observed;
  throw new Error('SYNC_HISTORY_METADATA_UPDATE_FAILED');
}

async function validateReadyHistoryObject(row: HistoryObjectRow, path: string): Promise<HistoryUploadResult> {
  const info = await objectInfo(path);
  if (!info.exists) return { error: 'SYNC_REMOTE_HISTORY_OBJECT_MISSING', http: 404 };
  if (row.payload_bytes === null || Number(row.payload_bytes) !== info.bytes) return { error: 'SYNC_REMOTE_HISTORY_OBJECT_CORRUPT', http: 409 };
  return { status: 'EXISTING', bytes: info.bytes };
}

async function ownerHistoryUpload(workspaceId: string, objectKey: string, claimToken: string, path: string, payload: ArrayBuffer): Promise<HistoryUploadResult> {
  let storageOutcome: 'CREATED' | 'EXISTING' | null = null;
  try {
    storageOutcome = await uploadCreateOnly(path, payload);
    const info = await objectInfo(path);
    if (!info.exists) throw new Error('SYNC_HISTORY_UPLOAD_VERIFY_FAILED');
    await markHistoryReady(workspaceId, objectKey, claimToken, info.bytes);
    return { status: storageOutcome, bytes: info.bytes };
  } catch (reason) {
    let claimCanBeReleased = storageOutcome !== 'CREATED';
    if (storageOutcome === 'CREATED') {
      try {
        await removeObject(path);
        claimCanBeReleased = true;
      } catch {
        claimCanBeReleased = false;
      }
    }
    if (claimCanBeReleased) await releaseHistoryClaim(workspaceId, objectKey, claimToken).catch(() => undefined);
    throw reason;
  }
}

async function resolveHistoryUpload(workspaceId: string, objectKey: string, path: string, payload: ArrayBuffer): Promise<HistoryUploadResult> {
  const claimToken = crypto.randomUUID();
  const deadline = Date.now() + HISTORY_CLAIM_TIMEOUT_MS;
  while (true) {
    if (await claimHistoryObject(workspaceId, objectKey, claimToken)) {
      return ownerHistoryUpload(workspaceId, objectKey, claimToken, path, payload);
    }
    const existing = await historyMetadata(workspaceId, objectKey);
    if (!existing) {
      if (Date.now() >= deadline) return { error: 'SYNC_HISTORY_UPLOAD_IN_PROGRESS', http: 409 };
      continue;
    }
    if (existing.state === 'READY') return validateReadyHistoryObject(existing, path);
    if (Date.now() >= deadline) return { error: 'SYNC_HISTORY_UPLOAD_IN_PROGRESS', http: 409 };
    await delay(HISTORY_CLAIM_POLL_MS);
  }
}

async function uploadCurrentCandidate(path: string, payload: ArrayBuffer) {
  const response = await fetch(storageObjectUrl(path), {
    method: 'PUT',
    headers: serviceHeaders({ 'Content-Type': 'application/octet-stream' }),
    body: payload,
  });
  if (!response.ok) throw new Error('SYNC_UPLOAD_FAILED');
}

async function listStorageFolder(prefix: string) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!response.ok) throw new Error('SYNC_DELETE_FAILED');
  return await response.json() as Array<{ id: string | null; name: string }>;
}

async function listWorkspaceFiles(prefix: string): Promise<string[]> {
  const items = await listStorageFolder(prefix);
  const paths: string[] = [];
  for (const item of items) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) paths.push(...await listWorkspaceFiles(path));
    else paths.push(path);
  }
  return paths;
}

async function removeWorkspaceObjects(workspaceId: string) {
  const paths = await listWorkspaceFiles(workspaceId).catch(() => [] as string[]);
  for (const path of paths) await removeObject(path);
  await removeObject(legacyCurrentPath(workspaceId)).catch(() => undefined);
}

async function casCurrentSnapshot(req: Request, verified: { workspaceId: string; row: WorkspaceRow }, payload: ArrayBuffer, expectedRevision: number) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return fail(req, 400, 'SYNC_REVISION_INVALID');
  if (expectedRevision !== Number(verified.row.revision)) return fail(req, 409, 'SYNC_REMOTE_CHANGED');
  const candidate = `${verified.workspaceId}/current/${crypto.randomUUID().replace(/-/g, '')}.bjs`;
  await uploadCurrentCandidate(candidate, payload);
  const updatedAt = new Date().toISOString();
  const metadata = await fetch(`${SUPABASE_URL}/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.${encodeURIComponent(verified.workspaceId)}&revision=eq.${expectedRevision}`, {
    method: 'PATCH',
    headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({
      protocol_version: 2,
      revision: expectedRevision + 1,
      current_object: candidate,
      payload_bytes: payload.byteLength,
      updated_at: updatedAt,
    }),
  });
  if (!metadata.ok) {
    await removeObject(candidate).catch(() => undefined);
    return fail(req, 502, 'SYNC_METADATA_UPDATE_FAILED');
  }
  const rows = await metadata.json() as WorkspaceRow[];
  if (rows.length !== 1) {
    await removeObject(candidate).catch(() => undefined);
    return fail(req, 409, 'SYNC_REMOTE_CHANGED');
  }
  const previous = verified.row.current_object;
  if (previous && previous !== candidate) await removeObject(previous).catch(() => undefined);
  if (!previous) await removeObject(legacyCurrentPath(verified.workspaceId)).catch(() => undefined);
  return json(req, { status: 'SYNCED', ...statusBody(rows[0]) });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply(req, null, { status: 204 });
  const action = req.headers.get('x-blue-jacket-action') ?? '';
  try {
    if (action === 'register' && req.method === 'POST') {
      const payload = await req.json() as { workspaceId?: string; secret?: string };
      const workspaceId = payload.workspaceId ?? '';
      const secret = payload.secret ?? '';
      if (!validWorkspaceId(workspaceId) || secret.length < 40 || secret.length > 100) return fail(req, 400, 'SYNC_IDENTITY_INVALID');
      if (await workspace(workspaceId)) return fail(req, 409, 'SYNC_WORKSPACE_EXISTS');
      const created = await fetch(`${SUPABASE_URL}/rest/v1/blue_jacket_sync_workspaces`, {
        method: 'POST',
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ workspace_id: workspaceId, key_hash: await hash(secret) }),
      });
      return created.ok ? json(req, { status: 'READY' }, 201) : fail(req, 502, 'SYNC_WORKSPACE_CREATE_FAILED');
    }

    const verified = await access(req);
    if (!verified) return fail(req, 401, 'SYNC_UNAUTHORIZED');

    if (action === 'status' && req.method === 'GET') return json(req, statusBody(verified.row));

    if (action === 'download' && req.method === 'GET') {
      const path = verified.row.current_object || legacyCurrentPath(verified.workspaceId);
      const object = await fetch(storageObjectUrl(path), { headers: serviceHeaders() });
      if (object.status === 404) return fail(req, 404, 'SYNC_SNAPSHOT_MISSING');
      if (!object.ok) return fail(req, 502, 'SYNC_DOWNLOAD_FAILED');
      return reply(req, object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'x-blue-jacket-updated-at': verified.row.updated_at } });
    }

    if (action === 'upload' && req.method === 'PUT') {
      if (Number(verified.row.protocol_version) >= 2) return fail(req, 409, 'SYNC_CLIENT_UPGRADE_REQUIRED');
      const payload = await req.arrayBuffer();
      if (!payload.byteLength || payload.byteLength > MAX_BYTES) return fail(req, 413, 'SYNC_PAYLOAD_INVALID');
      const stored = await fetch(storageObjectUrl(legacyCurrentPath(verified.workspaceId)), {
        method: 'PUT',
        headers: serviceHeaders({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
        body: payload,
      });
      if (!stored.ok) return fail(req, 502, 'SYNC_UPLOAD_FAILED');
      const updatedAt = new Date().toISOString();
      const metadata = await fetch(`${SUPABASE_URL}/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.${encodeURIComponent(verified.workspaceId)}`, {
        method: 'PATCH',
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ payload_bytes: payload.byteLength, updated_at: updatedAt }),
      });
      if (!metadata.ok) return fail(req, 502, 'SYNC_METADATA_UPDATE_FAILED');
      const rows = await metadata.json() as WorkspaceRow[];
      return rows.length === 1 ? json(req, { status: 'SYNCED', ...statusBody(rows[0]) }) : fail(req, 502, 'SYNC_METADATA_UPDATE_FAILED');
    }

    if (action === 'upload-v2' && req.method === 'PUT') {
      const expectedRaw = req.headers.get('x-blue-jacket-if-revision') ?? '';
      if (!/^\d+$/.test(expectedRaw)) return fail(req, 400, 'SYNC_REVISION_INVALID');
      const payload = await req.arrayBuffer();
      if (!payload.byteLength || payload.byteLength > MAX_BYTES) return fail(req, 413, 'SYNC_PAYLOAD_INVALID');
      return await casCurrentSnapshot(req, verified, payload, Number(expectedRaw));
    }

    const objectKey = req.headers.get('x-blue-jacket-object-key') ?? '';
    if (action.startsWith('history-') && !validObjectKey(objectKey)) return fail(req, 400, 'SYNC_HISTORY_OBJECT_KEY_INVALID');
    const historyPath = validObjectKey(objectKey) ? historyObjectPath(verified.workspaceId, objectKey) : '';

    if (action === 'history-status' && req.method === 'GET') {
      const metadata = await historyMetadata(verified.workspaceId, objectKey);
      if (!metadata || metadata.state === 'PENDING') return json(req, { exists: false, bytes: 0 });
      const resolved = await validateReadyHistoryObject(metadata, historyPath);
      if ('error' in resolved) return fail(req, resolved.http, resolved.error);
      return json(req, { exists: true, bytes: resolved.bytes });
    }

    if (action === 'history-upload' && req.method === 'PUT') {
      const payload = await req.arrayBuffer();
      if (!payload.byteLength || payload.byteLength > MAX_BYTES) return fail(req, 413, 'SYNC_PAYLOAD_INVALID');
      const outcome = await resolveHistoryUpload(verified.workspaceId, objectKey, historyPath, payload);
      if ('error' in outcome) return fail(req, outcome.http, outcome.error);
      return json(req, { status: outcome.status, bytes: outcome.bytes }, outcome.status === 'CREATED' ? 201 : 200);
    }

    if (action === 'history-download' && req.method === 'GET') {
      const metadata = await historyMetadata(verified.workspaceId, objectKey);
      if (!metadata || metadata.state !== 'READY') return fail(req, 404, 'SYNC_REMOTE_HISTORY_OBJECT_MISSING');
      const object = await downloadHistoryStorageObject(historyPath);
      if (object.status === 'MISSING') return fail(req, 404, 'SYNC_REMOTE_HISTORY_OBJECT_MISSING');
      if (object.status === 'ERROR') return fail(req, 502, 'SYNC_HISTORY_DOWNLOAD_FAILED');
      if (metadata.payload_bytes === null || Number(metadata.payload_bytes) !== object.payload.byteLength) return fail(req, 409, 'SYNC_REMOTE_HISTORY_OBJECT_CORRUPT');
      return reply(req, object.payload, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
    }

    if (action === 'delete' && req.method === 'DELETE') {
      await removeWorkspaceObjects(verified.workspaceId);
      const deleted = await fetch(`${SUPABASE_URL}/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.${encodeURIComponent(verified.workspaceId)}`, {
        method: 'DELETE',
        headers: serviceHeaders({ Prefer: 'return=minimal' }),
      });
      return deleted.ok ? json(req, { status: 'DELETED' }) : fail(req, 502, 'SYNC_DELETE_FAILED');
    }

    return fail(req, 404, 'SYNC_ACTION_NOT_FOUND');
  } catch (reason) {
    console.error('blue-jacket-sync', reason);
    return fail(req, 500, 'SYNC_INTERNAL_ERROR');
  }
});