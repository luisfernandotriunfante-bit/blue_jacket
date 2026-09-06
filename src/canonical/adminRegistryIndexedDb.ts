import { AdminRegistryRepository, type AdminRegistryState, type AdminRegistryStorage } from './adminRegistry';

const DB_NAME = 'blue-jacket-admin-registry-v1';
const DB_VERSION = 1;
const STORE = 'registry';
const CURRENT_KEY = 'current';

type StoredRegistry = { id: typeof CURRENT_KEY; snapshot: AdminRegistryState };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('ADMIN_REGISTRY_STORAGE_UNAVAILABLE'));
  });
}

export class IndexedDbAdminRegistryStorage implements AdminRegistryStorage {
  async read() {
    const database = await openDb();
    try {
      return await new Promise<unknown | null>((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(CURRENT_KEY);
        request.onsuccess = () => resolve((request.result as StoredRegistry | undefined)?.snapshot ?? null);
        request.onerror = () => reject(request.error ?? new Error('ADMIN_REGISTRY_STORAGE_READ_FAILED'));
      });
    } finally { database.close(); }
  }

  async write(value: AdminRegistryState) {
    const database = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put({ id: CURRENT_KEY, snapshot: value } satisfies StoredRegistry);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('ADMIN_REGISTRY_STORAGE_WRITE_FAILED'));
        transaction.onabort = () => reject(transaction.error ?? new Error('ADMIN_REGISTRY_STORAGE_WRITE_ABORTED'));
      });
    } finally { database.close(); }
  }

  async clear() {
    const database = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).delete(CURRENT_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('ADMIN_REGISTRY_STORAGE_CLEAR_FAILED'));
        transaction.onabort = () => reject(transaction.error ?? new Error('ADMIN_REGISTRY_STORAGE_CLEAR_ABORTED'));
      });
    } finally { database.close(); }
  }
}

export const adminRegistryRepository = new AdminRegistryRepository(new IndexedDbAdminRegistryStorage());

export async function loadAdminRegistryState() { return adminRegistryRepository.load(); }
export async function replaceAdminRegistryState(value: AdminRegistryState | null) { return adminRegistryRepository.replace(value); }
