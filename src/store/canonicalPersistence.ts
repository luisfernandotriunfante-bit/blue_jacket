import type { CanonicalState } from '../domain/canonical';

const DB_NAME = 'blue-jacket-data';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const CANONICAL_KEY = 'canonical';
export const LEGACY_CANONICAL_KEY = 'bj_canonical';

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(storage?: LocalStorageLike | null): LocalStorageLike | null {
  if (storage) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

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

export async function clearCanonicalState(storage?: LocalStorageLike | null): Promise<void> {
  const target = browserStorage(storage);
  target?.removeItem(LEGACY_CANONICAL_KEY);
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
    // Sem IndexedDB, a remoção do legado no localStorage já é suficiente.
  }
}

export async function loadCanonicalState(storage?: LocalStorageLike | null): Promise<CanonicalState | null> {
  try {
    const indexed = await readIndexedCanonical();
    if (indexed) return indexed;
  } catch {
    // Compatibilidade: tenta migrar a versão antiga armazenada no localStorage.
  }

  const target = browserStorage(storage);
  const raw = target?.getItem(LEGACY_CANONICAL_KEY);
  if (!raw) return null;

  try {
    const legacy = JSON.parse(raw) as CanonicalState;
    try {
      await saveCanonicalState(legacy);
      target?.removeItem(LEGACY_CANONICAL_KEY);
    } catch {
      // Se a migração não puder ser persistida, ainda permite usar a base nesta sessão.
    }
    return legacy;
  } catch {
    target?.removeItem(LEGACY_CANONICAL_KEY);
    return null;
  }
}

export function safeLocalStorageWrite(storage: LocalStorageLike | null | undefined, key: string, value: string): boolean {
  const target = browserStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, value);
    return true;
  } catch {
    // Versões antigas deixavam a base completa em bj_canonical e consumiam toda a quota.
    if (key !== LEGACY_CANONICAL_KEY) {
      try {
        target.removeItem(LEGACY_CANONICAL_KEY);
        target.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
