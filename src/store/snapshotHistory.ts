import type { CanonicalState, ManualConfiguration } from '../domain/canonical';

export interface CanonicalSnapshotRecord {
  id: string;
  competence: string;
  referenceDate: string;
  periodStart: string;
  periodEnd: string;
  closedAt: string;
  reason: 'REPLACED' | 'MONTH_CLOSE';
  canonical: CanonicalState;
  manualConfiguration: ManualConfiguration;
}

export function snapshotCompetence(state: Pick<CanonicalState, 'periodStart'> | null | undefined): string {
  const match = String(state?.periodStart || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

export function snapshotId(state: Pick<CanonicalState, 'generatedAt' | 'periodStart' | 'referenceDate'>): string {
  return `${snapshotCompetence(state)}:${state.referenceDate}:${state.generatedAt}`;
}

export function shouldArchive(previous: CanonicalState | null | undefined, next: CanonicalState | null | undefined): boolean {
  if (!previous || !next) return false;
  return snapshotId(previous) !== snapshotId(next);
}

export function createCanonicalSnapshot(
  canonical: CanonicalState,
  manualConfiguration: ManualConfiguration,
  closedAt = new Date().toISOString(),
  reason: CanonicalSnapshotRecord['reason'] = 'REPLACED',
): CanonicalSnapshotRecord {
  return {
    id: snapshotId(canonical),
    competence: snapshotCompetence(canonical),
    referenceDate: canonical.referenceDate,
    periodStart: canonical.periodStart,
    periodEnd: canonical.periodEnd,
    closedAt,
    reason,
    canonical: structuredClone(canonical),
    manualConfiguration: structuredClone(manualConfiguration),
  };
}

/** Returns the last frozen version for each competence, ready for rolling calculations. */
export function latestSnapshotsByCompetence(records: CanonicalSnapshotRecord[]): CanonicalSnapshotRecord[] {
  const latest = new Map<string, CanonicalSnapshotRecord>();
  for (const record of records) {
    const current = latest.get(record.competence);
    if (!current || current.closedAt.localeCompare(record.closedAt) <= 0) latest.set(record.competence, record);
  }
  return [...latest.values()].sort((a, b) => a.competence.localeCompare(b.competence));
}

const DB_NAME = 'blue-jacket-data';
const DB_VERSION = 2;
const STATE_STORE = 'state';
const SNAPSHOT_STORE = 'snapshots';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível neste navegador.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir o histórico de snapshots.'));
  });
}

export async function saveCanonicalSnapshot(record: CanonicalSnapshotRecord): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Falha ao salvar snapshot congelado.'));
      tx.objectStore(SNAPSHOT_STORE).put(record);
    });
  } finally { db.close(); }
}

export async function listCanonicalSnapshots(): Promise<CanonicalSnapshotRecord[]> {
  const db = await openDatabase();
  try {
    return await new Promise<CanonicalSnapshotRecord[]>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const request = tx.objectStore(SNAPSHOT_STORE).getAll();
      request.onsuccess = () => resolve((request.result as CanonicalSnapshotRecord[]).sort((a, b) => a.closedAt.localeCompare(b.closedAt)));
      request.onerror = () => reject(request.error || new Error('Falha ao ler snapshots congelados.'));
    });
  } finally { db.close(); }
}

export async function loadLatestSnapshot(competence: string): Promise<CanonicalSnapshotRecord | null> {
  const rows = (await listCanonicalSnapshots()).filter(row => row.competence === competence);
  return rows.at(-1) || null;
}
