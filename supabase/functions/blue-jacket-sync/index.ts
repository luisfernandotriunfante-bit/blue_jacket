const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
const SERVICE_KEY = keys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'blue-jacket-sync';
const ORIGINS = new Set(['https://luisfernandotriunfante-bit.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://luisfernandotriunfante-bit.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-blue-jacket-action, x-blue-jacket-workspace, x-blue-jacket-secret',
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
function objectUrl(workspaceId: string) { return SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + workspaceId + '/current.bjs'; }
async function workspace(workspaceId: string) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.' + encodeURIComponent(workspaceId) + '&select=workspace_id,key_hash,updated_at,payload_bytes', { headers: serviceHeaders() });
  if (!response.ok) throw new Error('WORKSPACE_READ_FAILED');
  return (await response.json() as Array<{ workspace_id: string; key_hash: string; updated_at: string; payload_bytes: number }>)[0];
}
async function access(req: Request) {
  const workspaceId = req.headers.get('x-blue-jacket-workspace') ?? '';
  const secret = req.headers.get('x-blue-jacket-secret') ?? '';
  if (!validWorkspaceId(workspaceId) || secret.length < 40 || secret.length > 100) return null;
  const row = await workspace(workspaceId);
  if (!row || !equal(row.key_hash, await hash(secret))) return null;
  return { workspaceId, row };
}
async function removeSnapshot(workspaceId: string) {
  const response = await fetch(objectUrl(workspaceId), { method: 'DELETE', headers: serviceHeaders() });
  if (response.status !== 404 && !response.ok) throw new Error('SYNC_DELETE_FAILED');
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
      const created = await fetch(SUPABASE_URL + '/rest/v1/blue_jacket_sync_workspaces', {
        method: 'POST',
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ workspace_id: workspaceId, key_hash: await hash(secret) }),
      });
      return created.ok ? json(req, { status: 'READY' }, 201) : fail(req, 502, 'SYNC_WORKSPACE_CREATE_FAILED');
    }

    const verified = await access(req);
    if (!verified) return fail(req, 401, 'SYNC_UNAUTHORIZED');

    if (action === 'status' && req.method === 'GET') return json(req, { updatedAt: verified.row.updated_at, bytes: verified.row.payload_bytes });

    if (action === 'download' && req.method === 'GET') {
      const object = await fetch(objectUrl(verified.workspaceId), { headers: serviceHeaders() });
      if (object.status === 404) return fail(req, 404, 'SYNC_SNAPSHOT_MISSING');
      if (!object.ok) return fail(req, 502, 'SYNC_DOWNLOAD_FAILED');
      return reply(req, object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'x-blue-jacket-updated-at': verified.row.updated_at } });
    }

    if (action === 'upload' && req.method === 'PUT') {
      const payload = await req.arrayBuffer();
      if (!payload.byteLength || payload.byteLength > 52_428_800) return fail(req, 413, 'SYNC_PAYLOAD_INVALID');
      const stored = await fetch(objectUrl(verified.workspaceId), {
        method: 'PUT',
        headers: serviceHeaders({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
        body: payload,
      });
      if (!stored.ok) return fail(req, 502, 'SYNC_UPLOAD_FAILED');
      const updatedAt = new Date().toISOString();
      const metadata = await fetch(SUPABASE_URL + '/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.' + encodeURIComponent(verified.workspaceId), {
        method: 'PATCH',
        headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ payload_bytes: payload.byteLength, updated_at: updatedAt }),
      });
      return metadata.ok ? json(req, { status: 'SYNCED', bytes: payload.byteLength, updatedAt }) : fail(req, 502, 'SYNC_METADATA_UPDATE_FAILED');
    }

    if (action === 'delete' && req.method === 'DELETE') {
      await removeSnapshot(verified.workspaceId);
      const deleted = await fetch(SUPABASE_URL + '/rest/v1/blue_jacket_sync_workspaces?workspace_id=eq.' + encodeURIComponent(verified.workspaceId), {
        method: 'DELETE',
        headers: serviceHeaders({ Prefer: 'return=minimal' }),
      });
      return deleted.ok ? json(req, { status: 'DELETED' }) : fail(req, 502, 'SYNC_DELETE_FAILED');
    }

    return fail(req, 404, 'SYNC_ACTION_NOT_FOUND');
  } catch {
    return fail(req, 500, 'SYNC_INTERNAL_ERROR');
  }
});
