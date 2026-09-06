export type SystemDataOperationOwner =
  | 'BASE_UPDATE'
  | 'SYNC_SEND'
  | 'SYNC_RESTORE'
  | 'SYNC_CREATE_AND_SEND'
  | 'SYNC_PAIR_AND_RESTORE'
  | 'BUNDLE_RECOVERY'
  | 'STARTUP_REMOTE_RESTORE';

export type SystemDataOperationState = {
  busy: boolean;
  owner: SystemDataOperationOwner | null;
};

type SystemDataOperationListener = (state: SystemDataOperationState) => void;

const idleState = (): SystemDataOperationState => ({ busy: false, owner: null });

/**
 * Application-lifetime mutual exclusion for operations that read or mutate
 * source staging, the active canonical build, encrypted cloud snapshots, or
 * technical bundle recovery. There is intentionally no queue: a second action
 * is rejected as BUSY so it can be requested again against fresh state later.
 */
export function createSystemDataOperationCoordinator() {
  let state = idleState();
  const listeners = new Set<SystemDataOperationListener>();

  const publish = (next: SystemDataOperationState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  return {
    getState: () => state,
    subscribe(listener: SystemDataOperationListener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    async run<T>(owner: SystemDataOperationOwner, operation: () => Promise<T>) {
      if (state.busy) return { status: 'BUSY', owner: state.owner } as const;
      publish({ busy: true, owner });
      try {
        return { status: 'DONE', value: await operation() } as const;
      } finally {
        publish(idleState());
      }
    },
  };
}

export const systemDataOperationCoordinator = createSystemDataOperationCoordinator();

export function systemDataOperationBusyMessage(owner: SystemDataOperationOwner | null) {
  if (owner === 'BASE_UPDATE') return 'Há uma atualização de bases em andamento. Aguarde a conclusão antes de iniciar outra operação de sincronização ou recuperação.';
  if (owner === 'SYNC_SEND') return 'Há um envio da cópia atual em andamento. Aguarde a conclusão antes de atualizar bases, restaurar ou recuperar bundle.';
  if (owner === 'SYNC_RESTORE' || owner === 'SYNC_PAIR_AND_RESTORE' || owner === 'STARTUP_REMOTE_RESTORE') return 'Há uma restauração sincronizada em andamento. Aguarde a conclusão antes de iniciar outra operação de dados.';
  if (owner === 'SYNC_CREATE_AND_SEND') return 'A sincronização entre aparelhos está sendo criada e a cópia inicial ainda está em envio. Aguarde a conclusão.';
  if (owner === 'BUNDLE_RECOVERY') return 'Há uma recuperação de Bundle Canônico em andamento. Aguarde a conclusão antes de atualizar bases ou sincronizar.';
  return 'Há outra operação de dados em andamento. Aguarde a conclusão e tente novamente.';
}
