import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { importCanonicalBundle } from '../canonical/bundleStore';
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
} from '../canonical/cloudSync';
import { loadCandidateList } from '../canonical/candidateLists';
import { APPROVED_CANONICAL_BUILD } from '../canonical/runtime';
import { networkTargetFor, setNetworkTargetFor } from '../canonical/reportSettings';
import {
  detectSourceForFileName,
  isSourceStageCurrent,
  loadSourceStagingManifests,
  processSourceUpdates,
  requestPersistentSourceStorage,
  REQUIRED_SOURCE_IDS,
  SOURCE_LABELS,
  type SourceStageManifest,
  type SourceUpdateProgress,
} from '../canonical/sourceImport';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const statusLabel = (manifest: SourceStageManifest | undefined, file: File | undefined) => file ? 'SELECIONADA' : manifest ? isSourceStageCurrent(manifest) ? 'VÁLIDA' : 'ATUALIZAÇÃO NECESSÁRIA' : 'NÃO CARREGADA';
const shortHash = (hash: string) => hash ? `${hash.slice(0, 10)}…` : '';

function syncError(reason: unknown) {
  const code = String(reason);
  if (code.includes('SYNC_SOURCES_INCOMPLETE')) return 'Ainda faltam fontes válidas neste aparelho. Conclua a carga das 19 bases antes de ativar a sincronização.';
  if (code.includes('SYNC_SOURCE_SNAPSHOT_OUTDATED')) return 'A cópia remota foi gerada com uma regra antiga. Atualize essa base no aparelho de origem e sincronize novamente.';
  if (code.includes('SYNC_SNAPSHOT_MISSING')) return 'Ainda não existe uma cópia sincronizada para restaurar.';
  if (code.includes('SYNC_PAYLOAD_INVALID')) return 'A cópia recebida não passou na validação de integridade e não foi aplicada.';
  if (code.includes('SOURCES_OUTDATED:')) {
    const sources = code.split('SOURCES_OUTDATED:')[1]?.split('|').map(source => SOURCE_LABELS[source] ?? source).join(', ');
    return `A regra de leitura mudou. Selecione novamente somente: ${sources || 'a fonte marcada como atualização necessária'}.`;
  }
  return code;
}

export function ConfiguracoesPage() {
  const { activeCanonical, activateCanonical, deactivateCanonical } = useData();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Partial<Record<string, File>>>({});
  const [manifests, setManifests] = useState<SourceStageManifest[]>([]);
  const [progress, setProgress] = useState<SourceUpdateProgress | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [deviceSync, setDeviceSync] = useState<DeviceSyncIdentity | null>(() => deviceSyncIdentity());
  const [syncing, setSyncing] = useState(false);
  const [syncCode, setSyncCode] = useState('');
  const [syncNotice, setSyncNotice] = useState('');
  const competence = '2026-08';
  const [networkTarget, setNetworkTarget] = useState(() => networkTargetFor(competence)?.toString() ?? '');
  const refresh = () => loadSourceStagingManifests().then(setManifests).catch(reason => setError(String(reason)));

  useEffect(() => { void refresh(); }, []);
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
        await refresh();
        setSyncNotice(restored ? `Este aparelho foi pareado e recebeu o build ${restored.motorBuildId}.` : 'Este aparelho foi pareado; ainda não há build remoto para restaurar.');
      } catch (reason) {
        setError(`Não foi possível concluir o pareamento: ${syncError(reason)}`);
      } finally { setSyncing(false); }
    })();
  }, []);

  const manifestBySource = useMemo(() => new Map(manifests.map(manifest => [manifest.source, manifest])), [manifests]);
  const validCount = REQUIRED_SOURCE_IDS.filter(source => isSourceStageCurrent(manifestBySource.get(source))).length;
  const selectedCount = Object.keys(selected).length;
  const canReprocess = Boolean(activeCanonical) && validCount === REQUIRED_SOURCE_IDS.length;

  const assignMany = (files: File[]) => {
    const next: Partial<Record<string, File>> = { ...selected };
    const unknown: string[] = [];
    for (const file of files) {
      const source = detectSourceForFileName(file.name);
      if (source) next[source] = file;
      else unknown.push(file.name);
    }
    setSelected(next); setUnmatched(unknown); setError('');
  };
  const onMany = (event: ChangeEvent<HTMLInputElement>) => { assignMany(Array.from(event.target.files ?? [])); event.target.value = ''; };
  const onSource = (source: string, event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setSelected(current => ({ ...current, [source]: file })); event.target.value = ''; };

  const process = async () => {
    setProcessing(true); setError(''); setStatus('');
    try {
      const storage = await requestPersistentSourceStorage();
      if (storage.quota && storage.usage && storage.quota - storage.usage < 200 * 1024 * 1024) throw new Error('STORAGE_SPACE_LOW: menos de 200 MB livres para processar as bases.');
      const base = activeCanonical ? {
        active: activeCanonical,
        lists: Object.fromEntries((await Promise.all((['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'] as const).map(async id => [id, await loadCandidateList(id)]))) as [string, unknown][]) as any,
      } : undefined;
      const result = await processSourceUpdates(selected, setProgress, base);
      await refresh();
      if (result.rejected.length) { setError(`Fonte rejeitada; o bundle anterior foi preservado. ${result.rejected.map(item => `${SOURCE_LABELS[item.source] ?? item.source}: ${item.errors.join(' | ')}`).join(' · ')}`); return; }
      if (result.missing.length) { setStatus(`Stagings salvos. Ainda faltam ${result.missing.length} fonte(s): ${result.missing.map(source => SOURCE_LABELS[source] ?? source).join(', ')}.`); return; }
      if (!result.active) throw new Error('CANONICAL_BUILD_NOT_CREATED');
      activateCanonical(result.active);
      setSelected({});
      const localMessage = result.updated.length
        ? `ATUALIZAÇÃO CONCLUÍDA — ${result.updated.length} fonte(s) atualizada(s), ${result.unchanged.length} reutilizada(s). Build ativo: ${result.active.motorBuildId}.`
        : `MOTOR REPROCESSADO — ${result.manifests.length} fonte(s) válida(s) foram reaproveitadas e o novo build foi ativado. Build ativo: ${result.active.motorBuildId}.`;
      if (deviceSync) {
        try {
          const synced = await uploadCurrentDeviceSnapshot(deviceSync);
          setSyncNotice(`Sincronização concluída: ${synced.bytes.toLocaleString('pt-BR')} bytes cifrados foram enviados para os aparelhos pareados.`);
          setStatus(`${localMessage} Sincronização entre aparelhos concluída.`);
        } catch (syncFailure) {
          setStatus(`${localMessage} A cópia local foi preservada, mas a sincronização não foi enviada.`);
          setError(syncError(syncFailure));
        }
      } else setStatus(localMessage);
    } catch (reason) { setError(syncError(reason)); }
    finally { setProcessing(false); setProgress(null); }
  };

  const onBundleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setStatus('Validando e restaurando bundle técnico…'); setError('');
    try { const imported = await importCanonicalBundle(file); activateCanonical(); setStatus(`Bundle de restauração ${imported.motorBuildId} importado e ativado.`); }
    catch (reason) { setStatus(''); setError(String(reason)); }
    finally { event.target.value = ''; }
  };

  const startDeviceSync = async () => {
    if (!activeCanonical) { setError('Crie ou restaure um build ativo antes de parear outro aparelho.'); return; }
    setSyncing(true); setError(''); setSyncNotice('Criando cópia cifrada para o outro aparelho…');
    try {
      const identity = await createDeviceSyncWorkspace();
      const synced = await uploadCurrentDeviceSnapshot(identity);
      setDeviceSync(identity);
      setSyncNotice(`Sincronização ativa. A cópia inicial (${synced.bytes.toLocaleString('pt-BR')} bytes cifrados) está pronta para parear o celular.`);
    } catch (reason) { setSyncNotice(''); setError(`Não foi possível ativar a sincronização: ${syncError(reason)}`); }
    finally { setSyncing(false); }
  };

  const restoreFromDeviceSync = async () => {
    if (!deviceSync) return;
    setSyncing(true); setError('');
    try {
      const restored = await restoreCurrentDeviceSnapshot(deviceSync);
      if (restored) activateCanonical(restored); else deactivateCanonical();
      await refresh();
      setSyncNotice(restored ? `Build ${restored.motorBuildId} restaurado deste aparelho pareado.` : 'Não existe build remoto para restaurar.');
    } catch (reason) { setError(`Não foi possível restaurar a cópia sincronizada: ${syncError(reason)}`); }
    finally { setSyncing(false); }
  };

  const pairByCode = async () => {
    setSyncing(true); setError('');
    try {
      const identity = await connectDeviceSyncWorkspace(syncCode);
      const restored = await restoreCurrentDeviceSnapshot(identity);
      if (restored) activateCanonical(restored); else deactivateCanonical();
      setDeviceSync(identity); setSyncCode(''); await refresh();
      setSyncNotice(restored ? `Aparelho pareado e build ${restored.motorBuildId} restaurado.` : 'Aparelho pareado; ainda não há build remoto para restaurar.');
    } catch (reason) { setError(`Não foi possível parear este aparelho: ${syncError(reason)}`); }
    finally { setSyncing(false); }
  };

  const saveNetworkTarget = async () => {
    setNetworkTargetFor(competence, networkTarget.trim() === '' ? null : Number(networkTarget));
    setStatus('Meta Redes Geral salva para a competência.');
    if (!deviceSync) return;
    setSyncing(true);
    try {
      await uploadCurrentDeviceSnapshot(deviceSync);
      setSyncNotice('Meta manual e bases foram sincronizadas com o outro aparelho.');
    } catch (reason) { setError(`A meta foi salva neste aparelho, mas a sincronização não foi enviada: ${syncError(reason)}`); }
    finally { setSyncing(false); }
  };

  const copyPairingLink = async () => {
    const link = deviceSync ? deviceSyncLink(deviceSync) : '';
    try {
      await navigator.clipboard.writeText(link);
      setSyncNotice('Link de pareamento copiado. Abra-o somente no seu outro aparelho.');
    } catch { setError('Não foi possível copiar automaticamente. Selecione e copie o link exibido.'); }
  };

  const syncLink = deviceSync ? deviceSyncLink(deviceSync) : '';

  return <PanelPage title="Atualizar Bases" metricLabel="Fontes válidas" metricValue={`${validCount}/19`}>
    {activeCanonical
      ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}<br />Atualize somente os relatórios que mudaram; os demais stagings válidos serão reutilizados. Uma fonte marcada como “Atualização necessária” precisa ser selecionada novamente para aplicar sua nova regra de leitura.</PanelAlert>
      : <PanelAlert tone="info">Primeira carga: selecione as 19 fontes originais. Depois disso, cada atualização pode substituir apenas as fontes que mudaram.</PanelAlert>}

    <PanelCard>
      <PanelSectionHeader eyebrow="SINCRONIZAÇÃO ENTRE APARELHOS" title="Computador e celular" description="A cópia é cifrada antes do envio. Abra o link de pareamento uma única vez no outro aparelho; as próximas atualizações e metas manuais serão sincronizadas automaticamente." />
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
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="IMPORTAÇÃO REAL" title="Arquivos originais → Blue Jacket" description="O motor processa as fontes no navegador: parser → staging → M1–M4 → novo build ativo. Quando o pareamento estiver ativo, a cópia cifrada também será enviada ao outro aparelho." />
      <label className="panel-button" style={{ display: 'inline-block', cursor: 'pointer' }}>Selecionar vários arquivos<input type="file" multiple accept=".xls,.xlsx,.txt" onChange={onMany} style={{ display: 'none' }} /></label>{' '}
      <button className="panel-button" disabled={processing || (!selectedCount && !canReprocess)} onClick={() => void process()}>{processing ? 'Processando…' : selectedCount ? 'PROCESSAR E ATUALIZAR SISTEMA' : 'REPROCESSAR MOTOR ATUAL'}</button>
      {progress ? <p className="panel-muted">{progress.phase} — {progress.message}</p> : null}
      {unmatched.length ? <PanelAlert tone="warning">Não identifiquei automaticamente: {unmatched.join(', ')}. Use o botão da fonte correta na tabela abaixo.</PanelAlert> : null}
      {status ? <PanelAlert tone="success">{status}</PanelAlert> : null}
      {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
      <div className="panel-table-wrap" style={{ marginTop: 12 }}><table className="panel-table"><thead><tr><th>Fonte</th><th>Status</th><th>Arquivo atual</th><th>Linhas</th><th>Hash</th><th>Substituir</th></tr></thead><tbody>{REQUIRED_SOURCE_IDS.map(source => { const manifest = manifestBySource.get(source), file = selected[source]; return <tr key={source}><td>{SOURCE_LABELS[source] ?? source}</td><td>{statusLabel(manifest, file)}</td><td>{file?.name ?? manifest?.fileName ?? '—'}</td><td>{manifest?.parsedRows ?? '—'}</td><td>{manifest ? shortHash(manifest.fileHash) : '—'}</td><td><label className="panel-button" style={{ display: 'inline-block', cursor: 'pointer' }}>Selecionar<input type="file" accept=".xls,.xlsx,.txt" onChange={event => onSource(source, event)} style={{ display: 'none' }} /></label></td></tr>; })}</tbody></table></div>
    </PanelCard>

    <PanelCard><PanelSectionHeader eyebrow="META MANUAL" title="Meta Redes Geral" description="Parâmetro separado da meta de Sell Out, por competência. Sem valor, o relatório mostra Não configurada." /><label className="panel-muted">Competência {competence} <input type="number" min="0" value={networkTarget} onChange={event => setNetworkTarget(event.target.value)} /></label>{' '}<button className="panel-button" disabled={syncing} onClick={() => void saveNetworkTarget()}>Salvar Meta Redes</button></PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="AVANÇADO / RECUPERAÇÃO" title="Restaurar Bundle Canônico" description="Backup técnico. Não é necessário para a atualização normal das bases." /><label className="panel-button" style={{ display: 'inline-block', cursor: 'pointer' }}>Selecionar bundle ZIP<input type="file" accept=".zip,application/zip" onChange={onBundleImport} style={{ display: 'none' }} /></label><p className="panel-muted">Build homologado de recuperação: {APPROVED_CANONICAL_BUILD.motorBuildId}</p></PanelCard>
  </PanelPage>;
}
