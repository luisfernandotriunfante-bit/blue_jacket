import type { CanonicalState } from '../domain/canonical';

const DB_NAME = 'blue-jacket-data';
const DB_VERSION = 2;
const STORE_NAME = 'state';
const CANONICAL_KEY = 'canonical';

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
  });
}

async function readIndexedCanonical(): Promise<CanonicalState | null> {
  const db = await openDatabase();
  try {
    return await new Promise<CanonicalState | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CANONICAL_KEY);
      request.onsuccess = () => resolve((request.result as CanonicalState | undefined) || null);
      request.onerror = () => reject(request.error || new Error('Falha ao ler estado canônico.'));
    });
  } finally {
    db.close();
  }
}

export async function saveCanonicalState(state: CanonicalState): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao salvar estado canônico.'));
      transaction.onabort = () => reject(transaction.error || new Error('Gravação do estado canônico foi abortada.'));
      transaction.objectStore(STORE_NAME).put(state, CANONICAL_KEY);
    });
  } finally {
    db.close();
  }
}

export async function clearCanonicalState(_storage?: LocalStorageLike | null): Promise<void> {
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Falha ao limpar estado canônico.'));
        transaction.objectStore(STORE_NAME).delete(CANONICAL_KEY);
      });
    } finally {
      db.close();
    }
  } catch {
    // Limpeza é best-effort em navegadores sem IndexedDB.
  }
}

/**
 * Ausência de registro retorna null; falha de acesso/leitura é propagada para que a UI
 * não trate persistência corrompida ou indisponível como se o usuário nunca tivesse carregado dados.
 */
export async function loadCanonicalState(_storage?: LocalStorageLike | null): Promise<CanonicalState | null> {
  return readIndexedCanonical();
}

export function safeLocalStorageWrite(storage: LocalStorageLike | null | undefined, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
