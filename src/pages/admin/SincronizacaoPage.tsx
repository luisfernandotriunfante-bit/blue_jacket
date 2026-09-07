import { useEffect, useState, type ChangeEvent } from 'react';
import { loadBundleRecoveryLocalIdentity } from '../../canonical/bundleRecoveryLocalIdentity';
import { inspectCanonicalBundle, persistCanonicalBundle } from '../../canonical/bundleStore';
import { recoverTechnicalBundle } from '../../canonical/bundleRecovery';
import {
  clearIncomingDeviceSyncCode,
  connectDeviceSyncWorkspace,
  createDeviceSyncWorkspace,
  deviceSyncBackupStatus,
  deviceSyncHasNewerRemoteSnapshot,
  deviceSyncIdentity,
  deviceSyncLink,
  incomingDeviceSyncCode,
  restoreCurrentDeviceSnapshot,
  uploadCurrentDeviceSnapshot,
  type DeviceSyncIdentity,
} from '../../canonical/cloudSync';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../../canonical/sourceImport';
import { SOURCE_LABELS } from '../../canonical/sourceContract';
import {
  systemDataOperationBusyMessage,
  systemDataOperationCoordinator,
} from '../../canonical/systemDataOperationCoordinator';
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';

type BackupStatus = Awaited<ReturnType<typeof deviceSyncBackupStatus>>;

export function syncErrorMessage(reason: unknown) {
  const code = String(reason);
  if (code.includes('HARD_MISSING:')) return 'Ainda faltam fontes físicas sempre obrigatórias neste aparelho. Complete as 15 bases hard-required antes de continuar.';
  if (code.includes('REPLACEMENT_REQUIRED:')) return 'Uma fonte substituível está ausente sem certificado válido para o escopo atual. Reenvie a fonte ou ative uma substituição certificada.';
  if (code.includes('REPLACEMENT_REVIEW_REQUIRED:')) return 'Uma nova versão física foi detectada para uma fonte com substituição ativa. Reconciliar/recertificar ou revogar explicitamente antes de continuar.';
  if (code.includes('REPLACEMENT_COVERAGE_BROKEN:')) return 'A cobertura interna de uma substituição certificada foi quebrada. O build está bloqueado até a autoridade administrativa voltar a cobrir as chaves certificadas.';
  if (code.includes('SYNC_REMOTE_NEWER') || code.includes('SYNC_REMOTE_CHANGED')) return 'Existe uma revisão mais nova enviada por outro aparelho. Restaure-a antes de enviar alterações deste dispositivo.';
  if (code.includes('SYNC_REMOTE_BASELINE_REQUIRED')) return 'Este aparelho ainda não possui a revisão-base do backup remoto. Restaure a cópia remota antes de enviar alterações.';
  if (code.includes('SYNC_HISTORY_COLLISION')) return 'O histórico canônico local e o backup remoto divergem para o mesmo build. A sincronização foi bloqueada para evitar sobrescrita.';
  if (code.includes('SYNC_REMOTE_HISTORY_OBJECT_MISSING')) return 'O manifesto remoto referencia um arquivo histórico que não está mais disponível no backup. Nenhuma alteração local foi aplicada.';
  if (code.includes('SYNC_HISTORY_LOCAL_CORRUPT') || code.includes('CANONICAL_HISTORY_CORRUPT')) return 'Um arquivo do Histórico Canônico local não passou na validação de integridade. O envio foi bloqueado.';
  if (code.includes('SYNC_SOURCES_INCOMPLETE')) return 'Ainda faltam fontes válidas neste aparelho. Complete as fontes obrigatórias para o contexto atual antes de ativar a sincronização.';
  if (code.includes('SYNC_SOURCE_SNAPSHOT_OUTDATED')) return 'A cópia remota foi gerada com uma regra antiga. Atualize essa base no aparelho de origem e sincronize novamente.';
  if (code.includes('SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE')) return 'As fontes, os cadastros administrativos, as metas RCA, os certificados, o histórico ou o build ativo mudaram durante a captura. Nenhuma cópia atual foi enviada.';
  if (code.includes('SYNC_SNAPSHOT_MISSING')) return 'Ainda não existe uma cópia sincronizada para restaurar.';
  if (code.includes('SYNC_PAYLOAD_INVALID')) return 'A cópia recebida não passou na validação de integridade e não foi aplicada.';
  if (code.includes('BUNDLE_LOCAL_REGISTRY_IDENTITY_REQUIRED')) return 'Não foi possível confirmar a identidade dos cadastros administrativos locais antes da recuperação do bundle.';
  if (code.includes('BUNDLE_LOCAL_TARGET_IDENTITY_REQUIRED')) return 'Não foi possível confirmar a identidade das metas RCA locais antes da recuperação do bundle.';
  if (code.includes('BUNDLE_LOCAL_REPLACEMENT_IDENTITY_REQUIRED')) return 'Não foi possível confirmar a identidade das substituições certificadas locais antes da recuperação do bundle.';
  if (code.includes('BUNDLE_LOCAL_LEGACY_STAGING_IDENTITY_REQUIRED')) return 'Não foi possível confirmar a identidade física v20 necessária para reconstruir este bundle legado.';
  if (code.includes('BUNDLE_LEGACY_REBUILD_UNAVAILABLE:')) return 'Este bundle não pôde ser reconstruído com a engine atual e o conjunto de fontes/certificados deste aparelho.';
  if (code.includes('BUNDLE_STAGING_SNAPSHOT_MISMATCH')) return 'Os relatórios armazenados neste aparelho não correspondem ao snapshot deste bundle. Não é possível reconstruir este backup com segurança.';
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
  const [remoteBackup, setRemoteBackup] = useState<BackupStatus | null>(null);
  const [remoteNewer, setRemoteNewer] = useState(false);

  const refreshRemoteBackup = async (identity: DeviceSyncIdentity | null) => {
    if (!identity) {
      setRemoteBackup(null);
      setRemoteNewer(false);
      return;
    }
    try {
      const [backup, newer] = await Promise.all([deviceSyncBackupStatus(identity), deviceSyncHasNewerRemoteSnapshot(identity)]);
      setRemoteBackup(backup);
      setRemoteNewer(newer);
    } catch {
      setRemoteBackup(null);
      setRemoteNewer(false);
    }
  };

  useEffect(() => systemDataOperationCoordinator.subscribe(setOperationState), []);
  useEffect(() => { void refreshRemoteBackup(deviceSync); }, [deviceSync]);

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
          await refreshRemoteBackup(identity);
          setSyncNotice(restored
            ? `Este aparelho foi pareado e recebeu o build ${restored.motorBuildId}, incluindo o histórico canônico disponível no backup.`
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
        const localIdentity = await loadBundleRecoveryLocalIdentity();
        const recovered = await recoverTechnicalBundle({
          currentEngineVersion: CANONICAL_ENGINE_VERSION,
          inspectBundle: () => inspectCanonicalBundle(file),
          persistBundle: prepared => persistCanonicalBundle(prepared),
          rebuildFromStaging: () => buildCanonicalFromStoredSources(),
          activate: activateCanonical,
          ...localIdentity,
        });
        setStatus(recovered.mode === 'COMPATIBLE'
          ? `Bundle ${recovered.active.motorBuildId} validado e ativado com a engine atual.`
          : `Bundle legado ou de identidade diferente foi validado e reconstruído com a engine atual. Build ativo: ${recovered.active.motorBuildId}.`);
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
      setSyncNotice('Criando Backup v2 cifrado para o outro aparelho…');
      try {
        const identity = await createDeviceSyncWorkspace();
        const synced = await uploadCurrentDeviceSnapshot(identity);
        setDeviceSync(identity);
        await refreshRemoteBackup(identity);
        setSyncNotice(`Backup v2 ativo. Snapshot: ${synced.bytes.toLocaleString('pt-BR')} bytes; histórico: ${synced.historyUploaded} novo(s), ${synced.historyReused} já existente(s), ${synced.historyMissing} indisponível(is).`);
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
      setSyncNotice('Enviando estado atual e histórico oficial disponível…');
      try {
        const synced = await uploadCurrentDeviceSnapshot(deviceSync);
        await refreshRemoteBackup(deviceSync);
        setSyncNotice(`Backup v2 concluído na revisão ${synced.revision}. Snapshot: ${synced.bytes.toLocaleString('pt-BR')} bytes; archives novos: ${synced.historyUploaded}; reutilizados: ${synced.historyReused}; sem arquivo disponível: ${synced.historyMissing}.`);
      } catch (reason) {
        setSyncNotice('');
        setError(`Não foi possível enviar a cópia atual: ${syncErrorMessage(reason)}`);
        await refreshRemoteBackup(deviceSync);
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
      setSyncNotice('Restaurando estado e histórico canônico…');
      try {
        const restored = await restoreCurrentDeviceSnapshot(deviceSync);
        if (restored) activateCanonical(restored); else deactivateCanonical();
        const backup = await deviceSyncBackupStatus(deviceSync);
        setRemoteBackup(backup);
        setRemoteNewer(false);
        setSyncNotice(restored
          ? `Build ${restored.motorBuildId} restaurado. Histórico remoto disponível: ${backup.availableArchives}; ainda indisponível: ${backup.missingArchives}.`
          : 'Não existe build remoto para restaurar.');
      } catch (reason) {
        setSyncNotice('');
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
      setSyncNotice('Restaurando estado e histórico canônico…');
      try {
        const identity = await connectDeviceSyncWorkspace(syncCode);
        const restored = await restoreCurrentDeviceSnapshot(identity);
        if (restored) activateCanonical(restored); else deactivateCanonical();
        setDeviceSync(identity);
        setSyncCode('');
        await refreshRemoteBackup(identity);
        setSyncNotice(restored
          ? `Aparelho pareado e build ${restored.motorBuildId} restaurado com o histórico disponível.`
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
  const remoteProtocol = remoteBackup?.protocolVersion === 2 ? 'v2' : 'v1';

  return <PanelPage title="Sincronização" metricLabel="Engine" metricValue="v21">
    {activeCanonical
      ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}</PanelAlert>
      : <PanelAlert tone="info">Nenhum build canônico está ativo neste aparelho.</PanelAlert>}
    {operationState.busy ? <PanelAlert tone="info">{systemDataOperationBusyMessage(operationState.owner)}</PanelAlert> : null}

    <PanelCard>
      <PanelSectionHeader eyebrow="SYNC / BACKUP V2" title="Computador e celular" description="O snapshot operacional continua cifrado com AES-GCM; o Histórico Canônico é enviado em objetos incrementais separados e imutáveis. Pareamento BJ1 permanece o mesmo." />
      {deviceSync ? <>
        <PanelAlert tone="success">Este aparelho já está pareado. Compartilhe o link abaixo somente com o seu outro aparelho.</PanelAlert>
        {remoteBackup ? <div className="panel-grid panel-grid-4" style={{ marginBottom: 12 }}>
          <div><strong>Protocolo remoto</strong><br />{remoteProtocol}</div>
          <div><strong>Revisão remota</strong><br />{remoteBackup.revision}</div>
          <div><strong>Snapshot atual</strong><br />{remoteBackup.bytes.toLocaleString('pt-BR')} bytes</div>
          <div><strong>Histórico oficial</strong><br />{remoteBackup.availableArchives}/{remoteBackup.officialArchives} disponível</div>
        </div> : null}
        {remoteBackup?.protocolVersion === 1 && remoteBackup.bytes > 0 ? <PanelAlert tone="info">Cópia remota legada v1. Ela será atualizada para Backup v2 no próximo envio concluído com sucesso.</PanelAlert> : null}
        {remoteBackup?.protocolVersion === 2 && remoteBackup.missingArchives === 0 ? <PanelAlert tone="success">Backup atual e histórico estão completos.</PanelAlert> : null}
        {remoteBackup?.protocolVersion === 2 && remoteBackup.missingArchives > 0 ? <PanelAlert tone="info">Estado operacional protegido, mas existem {remoteBackup.missingArchives} fechamento(s) antigo(s) sem arquivo canônico disponível.</PanelAlert> : null}
        {remoteNewer ? <PanelAlert tone="error">Existe uma revisão mais nova enviada por outro aparelho. Restaure-a antes de enviar alterações deste dispositivo.</PanelAlert> : null}
        <textarea className="panel-input" readOnly value={syncLink} aria-label="Link de pareamento seguro" style={{ width: '100%', minHeight: 58, marginBottom: 8 }} />
        <button className="panel-button" onClick={() => void copyPairingLink()}>Copiar link de pareamento</button>{' '}
        <button className="panel-button" disabled={mutableOperationBusy || !activeCanonical || remoteNewer} onClick={() => void sendCurrentDeviceSnapshot()}>{syncing ? 'Sincronizando…' : 'ENVIAR CÓPIA ATUAL'}</button>{' '}
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
