import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { loadCandidateList } from '../../canonical/candidateLists';
import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import {
  detectSourceForFileName,
  isSourceStageCurrent,
  loadSourceStagingManifests,
  processSourceUpdates,
  requestPersistentSourceStorage,
  REQUIRED_SOURCE_IDS,
  SOURCE_LABELS,
  type SourceStageManifest,
} from '../../canonical/sourceImport';
import {
  systemDataOperationBusyMessage,
  systemDataOperationCoordinator,
} from '../../canonical/systemDataOperationCoordinator';
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';
import {
  activateBuildAndWaitForAutoSync,
  baseUpdateCompletionStatus,
  baseUpdateCoordinator,
  type BaseAutoSyncResult,
  type BaseUpdateCoordinatorState,
} from './baseUpdateFlow';

const statusLabel = (manifest: SourceStageManifest | undefined, file: File | undefined) => file
  ? 'SELECIONADA'
  : manifest
    ? isSourceStageCurrent(manifest) ? 'VÁLIDA' : 'ATUALIZAÇÃO NECESSÁRIA'
    : 'NÃO CARREGADA';

const shortHash = (hash: string) => hash ? `${hash.slice(0, 10)}…` : '';

function sourceError(reason: unknown) {
  const code = String(reason);
  if (code.includes('SOURCES_OUTDATED:')) {
    const sources = code.split('SOURCES_OUTDATED:')[1]?.split('|').map(source => SOURCE_LABELS[source] ?? source).join(', ');
    return `A regra de leitura mudou. Selecione novamente somente: ${sources || 'a fonte marcada como atualização necessária'}.`;
  }
  return reason instanceof Error ? reason.message : code;
}

function updatePhaseMessage(state: BaseUpdateCoordinatorState) {
  if (state.phase === 'SYNCING') return 'Sincronizando o build recém-ativado entre aparelhos…';
  if (state.phase === 'ACTIVATING') return 'Ativando o novo build canônico…';
  if (state.progress) return `${state.progress.phase} — ${state.progress.message}`;
  return 'Processando atualização das bases…';
}

type BasesPageProps = {
  onCanonicalActivated?: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult>;
};

export function BasesPage({ onCanonicalActivated }: BasesPageProps) {
  const { activeCanonical, activateCanonical } = useData();
  const [updateState, setUpdateState] = useState(() => baseUpdateCoordinator.getState());
  const [operationState, setOperationState] = useState(() => systemDataOperationCoordinator.getState());
  const [pageError, setPageError] = useState('');
  const [selected, setSelected] = useState<Partial<Record<string, File>>>({});
  const [manifests, setManifests] = useState<SourceStageManifest[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const refresh = () => loadSourceStagingManifests()
    .then(value => { setManifests(value); setPageError(''); })
    .catch(reason => setPageError(String(reason)));

  useEffect(() => baseUpdateCoordinator.subscribe(setUpdateState), []);
  useEffect(() => systemDataOperationCoordinator.subscribe(setOperationState), []);
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!updateState.busy && updateState.phase !== 'IDLE') void refresh();
  }, [updateState.busy, updateState.phase]);

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
    setSelected(next);
    setUnmatched(unknown);
    setPageError('');
  };

  const onMany = (event: ChangeEvent<HTMLInputElement>) => {
    assignMany(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const onSource = (source: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelected(current => ({ ...current, [source]: file }));
    event.target.value = '';
  };

  const process = async () => {
    const globalResult = await systemDataOperationCoordinator.run('BASE_UPDATE', async () => baseUpdateCoordinator.run(async controls => {
      controls.setPhase('PROCESSING');
      try {
        const storage = await requestPersistentSourceStorage();
        if (storage.quota && storage.usage && storage.quota - storage.usage < 200 * 1024 * 1024) {
          throw new Error('STORAGE_SPACE_LOW: menos de 200 MB livres para processar as bases.');
        }
        const base = activeCanonical ? {
          active: activeCanonical,
          lists: Object.fromEntries((await Promise.all((['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'] as const)
            .map(async id => [id, await loadCandidateList(id)]))) as [string, unknown][]) as any,
        } : undefined;
        const result = await processSourceUpdates(selected, progress => controls.setProgress(progress), base);
        if (result.rejected.length) {
          return {
            phase: 'FAILED' as const,
            status: '',
            error: `Fonte rejeitada; o build anterior foi preservado. ${result.rejected.map(item => `${SOURCE_LABELS[item.source] ?? item.source}: ${item.errors.join(' | ')}`).join(' · ')}`,
          };
        }
        if (result.missing.length) {
          return {
            phase: 'SUCCESS' as const,
            status: `Stagings salvos. Ainda faltam ${result.missing.length} fonte(s): ${result.missing.map(source => SOURCE_LABELS[source] ?? source).join(', ')}.`,
            error: '',
          };
        }
        if (!result.active) throw new Error('CANONICAL_BUILD_NOT_CREATED');

        const localStatus = result.updated.length
          ? `ATUALIZAÇÃO CONCLUÍDA — ${result.updated.length} fonte(s) atualizada(s), ${result.unchanged.length} reutilizada(s). Build ativo: ${result.active.motorBuildId}.`
          : `MOTOR REPROCESSADO — ${result.manifests.length} fonte(s) válida(s) foram reaproveitadas e o novo build foi ativado. Build ativo: ${result.active.motorBuildId}.`;

        controls.setPhase('ACTIVATING');
        const syncResult = await activateBuildAndWaitForAutoSync(
          result.active,
          activateCanonical,
          async active => {
            controls.setPhase('SYNCING');
            return onCanonicalActivated ? onCanonicalActivated(active) : { status: 'NOT_PAIRED' };
          },
        );
        setSelected({});
        const status = baseUpdateCompletionStatus(localStatus, syncResult);
        if (syncResult.status === 'SYNC_FAILED') {
          return {
            phase: 'LOCAL_SUCCESS_SYNC_FAILED' as const,
            status,
            error: sourceError(syncResult.error),
          };
        }
        return { phase: 'SUCCESS' as const, status, error: '' };
      } catch (reason) {
        return { phase: 'FAILED' as const, status: '', error: sourceError(reason) };
      }
    }));

    if (globalResult.status === 'BUSY') {
      setPageError(systemDataOperationBusyMessage(globalResult.owner));
      return;
    }
    if (globalResult.value.status === 'BUSY') setPageError('Já existe uma atualização de bases em andamento.');
  };

  const processing = updateState.busy;
  const globallyBusy = operationState.busy;
  const processLabel = processing
    ? updateState.phase === 'SYNCING' ? 'Sincronizando…' : updateState.phase === 'ACTIVATING' ? 'Ativando…' : 'Processando…'
    : selectedCount ? 'PROCESSAR E ATUALIZAR SISTEMA' : 'REPROCESSAR MOTOR ATUAL';

  return <PanelPage title="Bases" metricLabel="Fontes válidas" metricValue={`${validCount}/19`}>
    {activeCanonical
      ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}<br />Atualize somente os relatórios que mudaram; os demais stagings válidos serão reutilizados. Uma fonte marcada como “Atualização necessária” precisa ser selecionada novamente para aplicar sua nova regra de leitura.</PanelAlert>
      : <PanelAlert tone="info">Primeira carga: selecione as 19 fontes originais. Depois disso, cada atualização pode substituir apenas as fontes que mudaram.</PanelAlert>}

    <PanelCard>
      <PanelSectionHeader eyebrow="IMPORTAÇÃO REAL" title="Arquivos originais → Blue Jacket" description="O motor processa as fontes no navegador: parser → staging → M1–M4 → novo build ativo." />
      <label className="panel-button" style={{ display: 'inline-block', cursor: processing ? 'not-allowed' : 'pointer' }} aria-disabled={processing}>
        Selecionar vários arquivos
        <input type="file" multiple disabled={processing} accept=".xls,.xlsx,.txt" onChange={onMany} style={{ display: 'none' }} />
      </label>{' '}
      <button className="panel-button" disabled={processing || globallyBusy || (!selectedCount && !canReprocess)} onClick={() => void process()}>
        {processLabel}
      </button>
      {processing ? <PanelAlert tone="info">{updatePhaseMessage(updateState)}</PanelAlert> : null}
      {operationState.busy && operationState.owner !== 'BASE_UPDATE' ? <PanelAlert tone="info">{systemDataOperationBusyMessage(operationState.owner)}</PanelAlert> : null}
      {unmatched.length ? <PanelAlert tone="warning">Não identifiquei automaticamente: {unmatched.join(', ')}. Use o botão da fonte correta na tabela abaixo.</PanelAlert> : null}
      {updateState.status ? <PanelAlert tone="success">{updateState.status}</PanelAlert> : null}
      {updateState.error ? <PanelAlert tone="error">{updateState.error}</PanelAlert> : null}
      {pageError ? <PanelAlert tone="error">{pageError}</PanelAlert> : null}
      <div className="panel-table-wrap" style={{ marginTop: 12 }}>
        <table className="panel-table">
          <thead><tr><th>Fonte</th><th>Status</th><th>Arquivo atual</th><th>Linhas</th><th>Hash</th><th>Substituir</th></tr></thead>
          <tbody>{REQUIRED_SOURCE_IDS.map(source => {
            const manifest = manifestBySource.get(source);
            const file = selected[source];
            return <tr key={source}>
              <td>{SOURCE_LABELS[source] ?? source}</td>
              <td>{statusLabel(manifest, file)}</td>
              <td>{file?.name ?? manifest?.fileName ?? '—'}</td>
              <td>{manifest?.parsedRows ?? '—'}</td>
              <td>{manifest ? shortHash(manifest.fileHash) : '—'}</td>
              <td><label className="panel-button" style={{ display: 'inline-block', cursor: processing ? 'not-allowed' : 'pointer' }} aria-disabled={processing}>Selecionar<input type="file" disabled={processing} accept=".xls,.xlsx,.txt" onChange={event => onSource(source, event)} style={{ display: 'none' }} /></label></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </PanelCard>
  </PanelPage>;
}
