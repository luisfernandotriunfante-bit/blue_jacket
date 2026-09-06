import { useEffect, useState, type ChangeEvent } from 'react';
import { canonicalAdminRegistryHash } from '../../canonical/adminRegistryIdentity';
import { loadAdminRegistryState } from '../../canonical/adminRegistryIndexedDb';
import { inspectCanonicalBundle, persistCanonicalBundle } from '../../canonical/bundleStore';
import { recoverTechnicalBundle } from '../../canonical/bundleRecovery';
import {
  clearIncomingDeviceSyncCode,
  connectDeviceSyncWorkspace,
  createDeviceSyncWorkspace,
  deviceSyncIdentity,
  deviceSyncLink,
  incomingDeviceSyncCode,
  restoreCurrentDeviceSnapshot,
  uploadCurrentDeviceSnapshot,
  type DeviceSyncIdentity,
} from '../../canonical/cloudSync';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION, SOURCE_LABELS } from '../../canonical/sourceImport';
import {
  systemDataOperationBusyMessage,
  systemDataOperationCoordinator,
} from '../../canonical/systemDataOperationCoordinator';
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';

export function syncErrorMessage(reason: unknown) {
  const code = String(reason);
  if (code.includes('SYNC_SOURCES_INCOMPLETE')) return 'Ainda faltam fontes válidas neste aparelho. Conclua a carga das 19 bases antes de ativar a sincronização.';
  if (code.includes('SYNC_SOURCE_SNAPSHOT_OUTDATED')) return 'A cópia remota foi gerada com uma regra antiga. Atualize essa base no aparelho de origem e sincronize novamente.';
  if (code.includes('SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE')) return 'As fontes, os cadastros administrativos ou o build ativo mudaram durante a captura. Nenhuma cópia foi enviada; aguarde a operação em andamento e tente novamente.';
  if (code.includes('SYNC_SNAPSHOT_MISSING')) return 'Ainda não existe uma cópia sincronizada para restaurar.';
  if (code.includes('SYNC_PAYLOAD_INVALID')) return 'A cópia recebida não passou na validação de integridade e não foi aplicada.';
  if (code.includes('BUNDLE_LOCAL_REGISTRY_IDENTITY_REQUIRED')) return 'Não foi possível confirmar a identidade dos cadastros administrativos locais antes da recuperação do bundle.';
  if (code.includes('BUNDLE_LEGACY_REBUILD_UNAVAILABLE:')) return 'Este bundle pertence a uma versão antiga do motor e não contém as fontes necessárias para reconstrução com a versão atual. Utilize a cópia sincronizada ou recarregue as bases.';
  if (code.includes('BUNDLE_STAGING_SNAPSHOT_MISMATCH')) return 'Os relatórios armazenados neste aparelho não correspondem ao snapshot deste bundle. Não é possível reconstruir este backup com segurança. Restaure a cópia sincronizada correspondente ou carregue as fontes daquele snapshot.';
  if (code.includes('SOURCES_OUTDATED:')) {
    const sources = code.split('SOURCES_OUTDATED:')[1]?.split('|').map(source => SOURCE_LABELS[source] ?? source).join(', ');
    return `A regra de leitura mudou. Selecione novamente somente: ${sources || 'a fonte marcada como atualização necessária'}.`;
  }
  return reason instanceof Error ? reason.message : code;
}

export function SincronizacaoPage() {
  const { activeCanonical, activateCanonical, deactivateCanonical } = useData();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [deviceSync, setDeviceSync] = useState<DeviceSyncIdentity | null>(() => deviceSyncIdentity());
  const [syncing, setSyncing] = useState(false);
  const [operationState, setOperationState] = useState(() => systemDataOperationCoordinator.getState());
  const [syncCode, setSyncCode] = useState('');
  const [syncNotice, setSyncNotice] = useState('');

  useEffect(() => systemDataOperationCoordinator.subscribe(setOperationState), []);

  useEffect(() => {
    const incoming = incomingDeviceSyncCode();
    if (!incoming) return;
    void (async () => {
      const result = await systemDataOperationCoordinator.run('SYNC_PAIR_AND_RESTORE', async () => {
        clearIncomingDeviceSyncCode();
        setSyncing(true);
        setError('');
        try {
          const identity = await connectDeviceSyncWorkspace(incoming);
          const restored = await restoreCurrentDeviceSnapshot(identity);
          if (restored) activateCanonical(restored); else deactivateCanonical();
          setDeviceSync(identity);
          setSyncNotice(restored
            ? `Este aparelho foi pareado e recebeu o build ${restored.motorBuildId}.`
            : 'Este aparelho foi pareado; ainda não há build remoto para restaurar.');
        } catch (reason) {
          setError(`Não foi possível concluir o pareamento: ${syncErrorMessage(reason)}`);
        } finally {
          setSyncing(false);
        }
      });
      if (result.status === 'BUSY') setError(`Não foi possível concluir o pareamento agora. ${systemDataOperationBusyMessage(result.owner)}`);
    })();
  }, []);

  const onBundleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await systemDataOperationCoordinator.run('BUNDLE_RECOVERY', async () => {
      setStatus('Validando e restaurando bundle técnico…');
      setError('');
      try {
        const localRegistryHash = await canonicalAdminRegistryHash(await loadAdminRegistryState());
        const recovered = await recoverTechnicalBundle({
          currentEngineVersion: CANONICAL_ENGINE_VERSION,
          inspectBundle: () => inspectCanonicalBundle(file),
          persistBundle: prepared => persistCanonicalBundle(prepared),
          rebuildFromStaging: () => buildCanonicalFromStoredSources(),
          activate: activateCanonical,
          localAdminRegistryHash: localRegistryHash,
        });
        setStatus(recovered.mode === 'COMPATIBLE'
          ? `Bundle ${recovered.active.motorBuildId} validado e ativado com a engine atual.`
          : `Bundle legado validado. Dados foram reconstruídos com a engine atual. Build ativo: ${recovered.active.motorBuildId}.`);
      } catch (reason) {
        setStatus('');
        setError(syncErrorMessage(reason));
      }
    });
    if (result.status === 'BUSY') {
      setStatus('');
      setError(systemDataOperationBusyMessage(result.owner));
    }
    event.target.value = '';
  };

  const startDeviceSync = async () => {
    const result = await systemDataOperationCoordinator.run('SYNC_CREATE_AND_SEND', async () => {
      if (!activeCanonical) {
        setError('Crie ou restaure um build ativo antes de parear outro aparelho.');
        return;
      }
      setSyncing(true);
      setError('');
      setSyncNotice('Criando cópia cifrada para o outro aparelho…');
      try {
        const identity = await createDeviceSyncWorkspace();
        const synced = await uploadCurrentDeviceSnapshot(identity);
        setDeviceSync(identity);
        setSyncNotice(`Sincronização ativa. A cópia inicial (${synced.bytes.toLocaleString('pt-BR')} bytes cifrados) está pronta para parear o celular.`);
      } catch (reason) {
        setSyncNotice('');
        setError(`Não foi possível ativar a sincronização: ${syncErrorMessage(reason)}`);
      } finally {
        setSyncing(false);
      }
    });
    if (result.status === 'BUSY') setError(systemDataOperationBusyMessage(result.owner));
  };

  const sendCurrentDeviceSnapshot = async () => {
    if (!deviceSync) return;
    const result = await systemDataOperationCoordinator.run('SYNC_SEND', async () => {
      setSyncing(true);
      setError('');
      setSyncNotice('Enviando a cópia atual deste aparelho…');
      try {
        const synced = await uploadCurrentDeviceSnapshot(deviceSync);
        setSyncNotice(`Cópia atual enviada com sucesso (${synced.bytes.toLocaleString('pt-BR')} bytes cifrados). Bases, configurações e cadastros administrativos deste aparelho foram incluídos no mesmo snapshot seguro.`);
      } catch (reason) {
        setSyncNotice('');
        setError(`Não foi possível enviar a cópia atual: ${syncErrorMessage(reason)}`);
      } finally {
        setSyncing(false);
      }
    });
    if (result.status === 'BUSY') {
      setSyncNotice('');
      setError(systemDataOperationBusyMessage(result.owner));
    }
  };

  const restoreFromDeviceSync = async () => {
    if (!deviceSync) return;
    const result = await systemDataOperationCoordinator.run('SYNC_RESTORE', async () => {
      setSyncing(true);
      setError('');
      try {
        const restored = await restoreCurrentDeviceSnapshot(deviceSync);
        if (restored) activateCanonical(restored); else deactivateCanonical();
        setSyncNotice(restored
          ? `Build ${restored.motorBuildId} restaurado deste aparelho pareado.`
          : 'Não existe build remoto para restaurar.');
      } catch (reason) {
        setError(`Não foi possível restaurar a cópia sincronizada: ${syncErrorMessage(reason)}`);
      } finally {
        setSyncing(false);
      }
    });
    if (result.status === 'BUSY') setError(systemDataOperationBusyMessage(result.owner));
  };

  const pairByCode = async () => {
    const result = await systemDataOperationCoordinator.run('SYNC_PAIR_AND_RESTORE', async () => {
      setSyncing(true);
      setError('');
      try {
        const identity = await connectDeviceSyncWorkspace(syncCode);
        const restored = await restoreCurrentDeviceSnapshot(identity);
        if (restored) activateCanonical(restored); else deactivateCanonical();
        setDeviceSync(identity);
        setSyncCode('');
        setSyncNotice(restored
          ? `Aparelho pareado e build ${restored.motorBuildId} restaurado.`
          : 'Aparelho pareado; ainda não há build remoto para restaurar.');
      } catch (reason) {
        setError(`Não foi possível parear este aparelho: ${syncErrorMessage(reason)}`);
      } finally {
        setSyncing(false);
      }
    });
    if (result.status === 'BUSY') setError(systemDataOperationBusyMessage(result.owner));
  };

  const copyPairingLink = async () => {
    const link = deviceSync ? deviceSyncLink(deviceSync) : '';
    try {
      await navigator.clipboard.writeText(link);
      setSyncNotice('Link de pareamento copiado. Abra-o somente no seu outro aparelho.');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o link exibido.');
    }
  };

  const syncLink = deviceSync ? deviceSyncLink(deviceSync) : '';
  const mutableOperationBusy = syncing || operationState.busy;

  return <PanelPage title="Sincronização" metricLabel="Engine" metricValue="v19">
    {activeCanonical
      ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}</PanelAlert>
      : <PanelAlert tone="info">Nenhum build canônico está ativo neste aparelho.</PanelAlert>}
    {operationState.busy ? <PanelAlert tone="info">{systemDataOperationBusyMessage(operationState.owner)}</PanelAlert> : null}

    <PanelCard>
      <PanelSectionHeader eyebrow="SINCRONIZAÇÃO ENTRE APARELHOS" title="Computador e celular" description="A cópia é cifrada antes do envio. Abra o link de pareamento uma única vez no outro aparelho; as próximas atualizações continuam usando o mesmo workspace seguro." />
      {deviceSync ? <>
        <PanelAlert tone="success">Este aparelho já está pareado. Compartilhe o link abaixo somente com o seu outro aparelho.</PanelAlert>
        <textarea className="panel-input" readOnly value={syncLink} aria-label="Link de pareamento seguro" style={{ width: '100%', minHeight: 58, marginBottom: 8 }} />
        <button className="panel-button" onClick={() => void copyPairingLink()}>Copiar link de pareamento</button>{' '}
        <button className="panel-button" disabled={mutableOperationBusy || !activeCanonical} onClick={() => void sendCurrentDeviceSnapshot()}>{syncing ? 'Sincronizando…' : 'ENVIAR CÓPIA ATUAL'}</button>{' '}
        <button className="panel-button" disabled={mutableOperationBusy} onClick={() => void restoreFromDeviceSync()}>{syncing ? 'Sincronizando…' : 'Restaurar cópia sincronizada'}</button>
      </> : <>
        <button className="panel-button" disabled={mutableOperationBusy || !activeCanonical} onClick={() => void startDeviceSync()}>{syncing ? 'Preparando…' : 'ATIVAR SINCRONIZAÇÃO NESTE APARELHO'}</button>
        <p className="panel-muted">No outro aparelho, abra o link que será gerado aqui ou cole o código de pareamento abaixo.</p>
        <input className="panel-input" value={syncCode} onChange={event => setSyncCode(event.target.value)} placeholder="Cole o link ou o código BJ1..." aria-label="Link ou código de pareamento" />{' '}
        <button className="panel-button" disabled={mutableOperationBusy || !syncCode.trim()} onClick={() => void pairByCode()}>{syncing ? 'Conectando…' : 'PAREAR E RESTAURAR'}</button>
      </>}
      {syncNotice ? <PanelAlert tone="success">{syncNotice}</PanelAlert> : null}
      {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="AVANÇADO / RECUPERAÇÃO" title="Restaurar Bundle Canônico" description="Backup técnico. Bundles antigos somente são ativados após reconstrução segura com a engine atual." />
      <label className="panel-button" style={{ display: 'inline-block', cursor: mutableOperationBusy ? 'not-allowed' : 'pointer' }} aria-disabled={mutableOperationBusy}>
        Selecionar bundle ZIP
        <input type="file" disabled={mutableOperationBusy} accept=".zip,application/zip" onChange={onBundleImport} style={{ display: 'none' }} />
      </label>
      <p className="panel-muted">Engine obrigatória: {CANONICAL_ENGINE_VERSION}</p>
      {status ? <PanelAlert tone="success">{status}</PanelAlert> : null}
    </PanelCard>
  </PanelPage>;
}
