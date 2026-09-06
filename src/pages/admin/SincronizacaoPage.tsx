import { useEffect, useState, type ChangeEvent } from 'react';
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
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';

export function syncErrorMessage(reason: unknown) {
  const code = String(reason);
  if (code.includes('SYNC_SOURCES_INCOMPLETE')) return 'Ainda faltam fontes válidas neste aparelho. Conclua a carga das 19 bases antes de ativar a sincronização.';
  if (code.includes('SYNC_SOURCE_SNAPSHOT_OUTDATED')) return 'A cópia remota foi gerada com uma regra antiga. Atualize essa base no aparelho de origem e sincronize novamente.';
  if (code.includes('SYNC_SNAPSHOT_MISSING')) return 'Ainda não existe uma cópia sincronizada para restaurar.';
  if (code.includes('SYNC_PAYLOAD_INVALID')) return 'A cópia recebida não passou na validação de integridade e não foi aplicada.';
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
  const [syncCode, setSyncCode] = useState('');
  const [syncNotice, setSyncNotice] = useState('');

  useEffect(() => {
    const incoming = incomingDeviceSyncCode();
    if (!incoming) return;
    clearIncomingDeviceSyncCode();
    setSyncing(true);
    setError('');
    void (async () => {
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
    })();
  }, []);

  const onBundleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('Validando e restaurando bundle técnico…');
    setError('');
    try {
      const recovered = await recoverTechnicalBundle({
        currentEngineVersion: CANONICAL_ENGINE_VERSION,
        inspectBundle: () => inspectCanonicalBundle(file),
        persistBundle: prepared => persistCanonicalBundle(prepared),
        rebuildFromStaging: () => buildCanonicalFromStoredSources(),
        activate: activateCanonical,
      });
      setStatus(recovered.mode === 'COMPATIBLE'
        ? `Bundle ${recovered.active.motorBuildId} validado e ativado com a engine atual.`
        : `Bundle legado validado. Dados foram reconstruídos com a engine atual. Build ativo: ${recovered.active.motorBuildId}.`);
    } catch (reason) {
      setStatus('');
      setError(syncErrorMessage(reason));
    } finally {
      event.target.value = '';
    }
  };

  const startDeviceSync = async () => {
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
  };

  const restoreFromDeviceSync = async () => {
    if (!deviceSync) return;
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
  };

  const pairByCode = async () => {
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

  return <PanelPage title="Sincronização" metricLabel="Engine" metricValue="v18">
    {activeCanonical
      ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}</PanelAlert>
      : <PanelAlert tone="info">Nenhum build canônico está ativo neste aparelho.</PanelAlert>}

    <PanelCard>
      <PanelSectionHeader eyebrow="SINCRONIZAÇÃO ENTRE APARELHOS" title="Computador e celular" description="A cópia é cifrada antes do envio. Abra o link de pareamento uma única vez no outro aparelho; as próximas atualizações continuam usando o mesmo workspace seguro." />
      {deviceSync ? <>
        <PanelAlert tone="success">Este aparelho já está pareado. Compartilhe o link abaixo somente com o seu outro aparelho.</PanelAlert>
        <textarea className="panel-input" readOnly value={syncLink} aria-label="Link de pareamento seguro" style={{ width: '100%', minHeight: 58, marginBottom: 8 }} />
        <button className="panel-button" disabled={syncing} onClick={() => void copyPairingLink()}>Copiar link de pareamento</button>{' '}
        <button className="panel-button" disabled={syncing} onClick={() => void restoreFromDeviceSync()}>{syncing ? 'Sincronizando…' : 'Restaurar cópia sincronizada'}</button>
      </> : <>
        <button className="panel-button" disabled={syncing || !activeCanonical} onClick={() => void startDeviceSync()}>{syncing ? 'Preparando…' : 'ATIVAR SINCRONIZAÇÃO NESTE APARELHO'}</button>
        <p className="panel-muted">No outro aparelho, abra o link que será gerado aqui ou cole o código de pareamento abaixo.</p>
        <input className="panel-input" value={syncCode} onChange={event => setSyncCode(event.target.value)} placeholder="Cole o link ou o código BJ1..." aria-label="Link ou código de pareamento" />{' '}
        <button className="panel-button" disabled={syncing || !syncCode.trim()} onClick={() => void pairByCode()}>{syncing ? 'Conectando…' : 'PAREAR E RESTAURAR'}</button>
      </>}
      {syncNotice ? <PanelAlert tone="success">{syncNotice}</PanelAlert> : null}
      {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="AVANÇADO / RECUPERAÇÃO" title="Restaurar Bundle Canônico" description="Backup técnico. Bundles antigos somente são ativados após reconstrução segura com a engine atual." />
      <label className="panel-button" style={{ display: 'inline-block', cursor: 'pointer' }}>
        Selecionar bundle ZIP
        <input type="file" accept=".zip,application/zip" onChange={onBundleImport} style={{ display: 'none' }} />
      </label>
      <p className="panel-muted">Engine obrigatória: {CANONICAL_ENGINE_VERSION}</p>
      {status ? <PanelAlert tone="success">{status}</PanelAlert> : null}
    </PanelCard>
  </PanelPage>;
}
