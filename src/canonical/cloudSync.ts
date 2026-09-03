import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildCanonicalFromStoredSources, exportSourceStorageSnapshot, restoreSourceStorageSnapshot, type SourceStorageSnapshot } from './sourceImport';
import { loadReportSettings, restoreReportSettings, type ReportSettings } from './reportSettings';
import { resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from './runtime';

const SYNC_URL = 'https://wsdmcnvnpjpberzeizjc.supabase.co/functions/v1/blue-jacket-sync';
const PUBLISHABLE_KEY = 'sb_publishable_W6YcgHB39DwRXCFR0wZUBA_pAafJ8wp';
const IDENTITY_KEY = 'blue-jacket-v4:device-sync-identity';
const STATE_KEY = 'blue-jacket-v4:device-sync-state';
const MAGIC = new TextEncoder().encode('BJS1');

export type DeviceSyncIdentity = { workspaceId: string; secret: string };
type DeviceSyncState = { workspaceId: string; remoteUpdatedAt: string };
export type DeviceSyncStatus = { updatedAt: string; bytes: number };
export type CloudSnapshot = {
  format: 'blue-jacket-device-sync/v1';
  createdAt: string;
  active: ActiveCanonicalBundle | null;
  sources: SourceStorageSnapshot;
  settings: ReportSettings;
};

function isIdentity(value: unknown): value is DeviceSyncIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSyncIdentity>;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.workspaceId ?? '') && /^[A-Za-z0-9_-]{40,100}$/.test(candidate.secret ?? '');
}

function isSyncState(value: unknown): value is DeviceSyncState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSyncState>;
  return typeof candidate.workspaceId === 'string' && typeof candidate.remoteUpdatedAt === 'string' && Number.isFinite(Date.parse(candidate.remoteUpdatedAt));
}

function isStatus(value: unknown): value is DeviceSyncStatus {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSyncStatus>;
  return typeof candidate.updatedAt === 'string' && Number.isFinite(Date.parse(candidate.updatedAt)) && typeof candidate.bytes === 'number' && Number.isFinite(candidate.bytes) && candidate.bytes >= 0;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function pairingCode(identity: DeviceSyncIdentity) { return `BJ1.${identity.workspaceId}.${identity.secret}`; }

function parsePairingCode(value: string): DeviceSyncIdentity {
  let candidate = value.trim();
  try {
    const url = new URL(candidate);
    candidate = new URLSearchParams(url.hash.replace(/^#/, '')).get('sync') ?? candidate;
  } catch { /* The compact BJ1 code is also accepted directly. */ }
  const match = candidate.match(/^BJ1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,100})$/i);
  if (!match || !isIdentity({ workspaceId: match[1], secret: match[2] })) throw new Error('SYNC_PAIRING_CODE_INVALID');
  return { workspaceId: match[1], secret: match[2] };
}

function readError(response: Response) {
  return response.json().then((body: { error?: string }) => body.error || `SYNC_HTTP_${response.status}`).catch(() => `SYNC_HTTP_${response.status}`);
}

async function request(action: string, identity?: DeviceSyncIdentity, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', PUBLISHABLE_KEY);
  headers.set('x-blue-jacket-action', action);
  if (identity) {
    headers.set('x-blue-jacket-workspace', identity.workspaceId);
    headers.set('x-blue-jacket-secret', identity.secret);
  }
  const response = await fetch(SYNC_URL, { ...init, headers, cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

async function cryptoKey(secret: string) {
  return crypto.subtle.importKey('raw', base64UrlToBytes(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(identity: DeviceSyncIdentity, snapshot: CloudSnapshot) {
  const packed = zipSync({ 'snapshot.json': strToU8(JSON.stringify(snapshot)) }, { level: 9 });
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(identity.secret), packed));
  const result = new Uint8Array(MAGIC.length + iv.length + encrypted.length);
  result.set(MAGIC); result.set(iv, MAGIC.length); result.set(encrypted, MAGIC.length + iv.length);
  return result;
}

async function decrypt(identity: DeviceSyncIdentity, payload: Uint8Array) {
  if (payload.length <= MAGIC.length + 12 || !MAGIC.every((value, index) => payload[index] === value)) throw new Error('SYNC_PAYLOAD_INVALID');
  const iv = payload.slice(MAGIC.length, MAGIC.length + 12);
  const encrypted = payload.slice(MAGIC.length + 12);
  const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await cryptoKey(identity.secret), encrypted));
  const text = strFromU8(unzipSync(packed)['snapshot.json'] ?? new Uint8Array());
  const snapshot = JSON.parse(text) as CloudSnapshot;
  if (snapshot?.format !== 'blue-jacket-device-sync/v1' || !snapshot.sources || !snapshot.settings || typeof snapshot.settings !== 'object') throw new Error('SYNC_PAYLOAD_INVALID');
  return snapshot;
}

function saveIdentity(identity: DeviceSyncIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  const state = deviceSyncState();
  if (!state || state.workspaceId !== identity.workspaceId) localStorage.removeItem(STATE_KEY);
}

function saveSyncState(identity: DeviceSyncIdentity, remoteUpdatedAt: string) {
  if (!Number.isFinite(Date.parse(remoteUpdatedAt))) return;
  localStorage.setItem(STATE_KEY, JSON.stringify({ workspaceId: identity.workspaceId, remoteUpdatedAt } satisfies DeviceSyncState));
}

function deviceSyncState() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    return isSyncState(state) ? state : null;
  } catch { return null; }
}

export function deviceSyncIdentity() {
  try {
    const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? 'null');
    return isIdentity(identity) ? identity : null;
  } catch { return null; }
}

export function clearDeviceSyncIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(STATE_KEY);
}

export async function deviceSyncRemoteStatus(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const response = await request('status', identity);
  const status = await response.json() as unknown;
  if (!isStatus(status)) throw new Error('SYNC_STATUS_INVALID');
  return status;
}

/** Returns true only when a paired server snapshot is newer than this device's last verified copy. */
export async function deviceSyncHasNewerRemoteSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) return false;
  const local = deviceSyncState();
  if (!local || local.workspaceId !== identity.workspaceId) return false;
  const remote = await deviceSyncRemoteStatus(identity);
  return remote.bytes > 0 && Date.parse(remote.updatedAt) > Date.parse(local.remoteUpdatedAt);
}

export async function createDeviceSyncWorkspace() {
  const identity: DeviceSyncIdentity = { workspaceId: crypto.randomUUID(), secret: randomSecret() };
  await request('register', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) });
  saveIdentity(identity);
  return identity;
}

export async function connectDeviceSyncWorkspace(code: string) {
  const identity = parsePairingCode(code);
  await deviceSyncRemoteStatus(identity);
  saveIdentity(identity);
  return identity;
}

export function deviceSyncCode(identity: DeviceSyncIdentity) { return pairingCode(identity); }

export function deviceSyncLink(identity: DeviceSyncIdentity) {
  const url = new URL(window.location.href);
  url.hash = `sync=${encodeURIComponent(pairingCode(identity))}`;
  return url.toString();
}

export function incomingDeviceSyncCode() {
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get('sync') ?? null;
}

export function clearIncomingDeviceSyncCode() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export async function uploadCurrentDeviceSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const active = resolveActiveCanonicalBundle();
  if (!active) throw new Error('SYNC_NO_ACTIVE_BUILD');
  const createdAt = new Date().toISOString();
  const sources = await exportSourceStorageSnapshot();
  const payload = await encrypt(identity, { format: 'blue-jacket-device-sync/v1', createdAt, active, sources, settings: loadReportSettings() });
  const response = await request('upload', identity, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: payload });
  const status = await response.json() as unknown;
  if (!isStatus(status)) throw new Error('SYNC_STATUS_INVALID');
  saveSyncState(identity, status.updatedAt);
  return { bytes: payload.byteLength, active, updatedAt: status.updatedAt };
}

export async function restoreCurrentDeviceSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const response = await request('download', identity);
  const remoteUpdatedAt = response.headers.get('x-blue-jacket-updated-at');
  const snapshot = await decrypt(identity, new Uint8Array(await response.arrayBuffer()));
  const previousSources = await exportSourceStorageSnapshot().catch(() => null);
  const previousSettings = loadReportSettings();
  try {
    await restoreSourceStorageSnapshot(snapshot.sources);
    restoreReportSettings(snapshot.settings);
    const active = await buildCanonicalFromStoredSources();
    saveSyncState(identity, remoteUpdatedAt && Number.isFinite(Date.parse(remoteUpdatedAt)) ? remoteUpdatedAt : snapshot.createdAt);
    return active;
  } catch (reason) {
    if (previousSources) {
      try {
        await restoreSourceStorageSnapshot(previousSources);
        restoreReportSettings(previousSettings);
        await buildCanonicalFromStoredSources();
      } catch { /* The original restore error remains the actionable failure. */ }
    }
    throw reason;
  }
}

export async function deleteDeviceSyncWorkspace(identity = deviceSyncIdentity()) {
  if (!identity) return;
  await request('delete', identity, { method: 'DELETE' });
  clearDeviceSyncIdentity();
}

export const cloudSyncTestHelpers = { pairingCode, parsePairingCode, encrypt, decrypt };
