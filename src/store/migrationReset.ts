/**
 * Stage 1 migration boundary.
 *
 * This is deliberately a destructive, one-way cleanup for runtime data. The
 * migration backup lives in docs/migration-baseline and is never read by the
 * application. New engines must introduce their own persistence contract.
 */
const ACTIVE_KEY_PREFIXES = ['blue-jacket:', 'bj_', 'bj_stock_alerts:', 'blue_jacket_'];
const ACTIVE_DATABASES = ['blue-jacket-data', 'blue-jacket-customer-intelligence'];

function clearStorage(storage: Storage | undefined) {
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && ACTIVE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) storage.removeItem(key);
  }
}

function deleteDatabase(name: string) {
  if (typeof indexedDB === 'undefined') return;
  try { indexedDB.deleteDatabase(name); } catch { /* best effort during app bootstrap */ }
}

/** Clears only Blue Jacket operational state; it never imports or reuses it. */
export function resetActiveRuntimeState(): void {
  if (typeof window === 'undefined') return;
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
  ACTIVE_DATABASES.forEach(deleteDatabase);
}

export const RESET_NOTICE = 'Etapa 1 concluída: não existe carga oficial ativa. A ingestão permanece bloqueada até a implantação dos novos motores.';
