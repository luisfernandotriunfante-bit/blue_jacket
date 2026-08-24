export interface StagedStorageTransaction {
  storage: Storage;
  commit: () => void;
}

function mergedKeys(base: Storage, changes: Map<string, string | null>) {
  const keys = new Set<string>();
  for (let index = 0; index < base.length; index += 1) {
    const key = base.key(index);
    if (key) keys.add(key);
  }
  for (const [key, value] of changes) {
    if (value === null) keys.delete(key);
    else keys.add(key);
  }
  return Array.from(keys);
}

/**
 * Storage transacional para o pipeline de Configurações.
 * Leituras enxergam o estado atual + alterações da carga, mas nenhuma escrita
 * chega ao storage real até commit(). Se o commit falhar, os valores anteriores
 * das chaves tocadas são restaurados em melhor esforço.
 */
export function createStagedStorage(base: Storage): StagedStorageTransaction {
  const changes = new Map<string, string | null>();
  const originals = new Map<string, string | null>();

  const remember = (key: string) => {
    if (!originals.has(key)) originals.set(key, base.getItem(key));
  };

  const storage: Storage = {
    get length() { return mergedKeys(base, changes).length; },
    clear() {
      for (const key of mergedKeys(base, changes)) {
        remember(key);
        changes.set(key, null);
      }
    },
    getItem(key: string) {
      return changes.has(key) ? changes.get(key) ?? null : base.getItem(key);
    },
    key(index: number) {
      return mergedKeys(base, changes)[index] ?? null;
    },
    removeItem(key: string) {
      remember(key);
      changes.set(key, null);
    },
    setItem(key: string, value: string) {
      remember(key);
      changes.set(key, String(value));
    },
  };

  const commit = () => {
    try {
      for (const [key, value] of changes) {
        if (value === null) base.removeItem(key);
        else base.setItem(key, value);
      }
    } catch (error) {
      for (const [key, value] of originals) {
        try {
          if (value === null) base.removeItem(key);
          else base.setItem(key, value);
        } catch {
          // Mantém a exceção original. Uma eventual falha de rollback não é mascarada.
        }
      }
      throw new Error(`Persistência transacional das fontes falhou; a base canônica não foi atualizada (${error instanceof Error ? error.message : 'erro de armazenamento'}).`);
    }
    changes.clear();
    originals.clear();
  };

  return { storage, commit };
}
