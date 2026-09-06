import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { loadAdminRegistryState } from '../../canonical/adminRegistryIndexedDb';
import { loadCandidateList } from '../../canonical/candidateLists';
import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import { sourceDependencyMatrix, type SourceReplacementReadiness } from '../../canonical/sourceDependencyContract';
import { evaluateSourceReplacementReadinessV21 } from '../../canonical/sourceReplacementCertification';
import {
  detectSourceForFileName,
  isSourceStageCurrent,
  loadSourceStaging,
  loadSourceStagingManifests,
  processSourceUpdates,
  requestPersistentSourceStorage,
  type SourceStageManifest,
} from '../../canonical/sourceImport';
import {
  HARD_REQUIRED_SOURCE_IDS,
  REPLACEABLE_SOURCE_IDS,
  SOURCE_LABELS,
  SUPPORTED_SOURCE_IDS,
  sourceScopeFor,
} from '../../canonical/sourceContract';
import { operationalCompetenceFromPhysicalStages, resolveEffectiveSourceSet, type SourceBuildDiagnostic } from '../../canonical/sourceReplacementRuntime';
import { loadSourceReplacementState, type SourceReplacementState } from '../../canonical/sourceReplacementState';
import { systemDataOperationBusyMessage, systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import { loadTargetState } from '../../canonical/targetStore';
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';
import {
  activateBuildAndWaitForAutoSync,
  baseUpdateCompletionStatus,
  baseUpdateCoordinator,
  type BaseAutoSyncResult,
  type BaseUpdateCoordinatorState,
} from './baseUpdateFlow';
import {
  activateCertifiedSourceReplacement,
  revokeCertifiedSourceReplacement,
  sourceReplacementLifecycle,
} from './sourceReplacementFlow';

const hardSet = new Set<string>(HARD_REQUIRED_SOURCE_IDS);
const replaceableSet = new Set<string>(REPLACEABLE_SOURCE_IDS);
const statusLabel = (manifest: SourceStageManifest | undefined, file: File | undefined) => file ? 'SELECIONADA' : manifest ? isSourceStageCurrent(manifest) ? 'DISPONÍVEL' : 'ATUALIZAÇÃO NECESSÁRIA' : 'AUSENTE';
const shortHash = (hash: string) => hash ? `${hash.slice(0, 10)}…` : '';
const replacementLabel = (authority: string | null | undefined) => authority === 'AdminRegistry.RCAs' ? 'Cadastro RCA' : authority === 'AdminRegistry.Lançamentos' ? 'Cadastro Lançamentos' : authority === 'AdminRegistry.TopRetailers' ? 'Top Varejistas' : authority === 'TargetState.RcaTargets' ? 'Target Registry' : 'Não disponível';
const scopeLabel = (scope: string | null) => !scope ? '—' : scope === 'GLOBAL' ? 'GLOBAL' : scope.startsWith('COMPETENCE:') ? `${scope.slice(16, 18)}/${scope.slice(11, 15)}` : scope;

function sourceError(reason: unknown) {
  const code = String(reason);
  if (code.includes('HARD_MISSING:')) return `FONTE FÍSICA OBRIGATÓRIA ausente: ${code.split('HARD_MISSING:')[1]?.split('|').map(source => SOURCE_LABELS[source] ?? source).join(', ')}.`;
  if (code.includes('REPLACEMENT_REQUIRED:')) return `Fonte condicional sem certificado válido: ${code.split('REPLACEMENT_REQUIRED:')[1]?.split('|').map(source => SOURCE_LABELS[source] ?? source).join(', ')}.`;
  if (code.includes('REPLACEMENT_REVIEW_REQUIRED:')) return 'REVISÃO NECESSÁRIA — NOVA VERSÃO DA FONTE DETECTADA. O arquivo novo não foi reintroduzido silenciosamente no motor.';
  if (code.includes('REPLACEMENT_COVERAGE_BROKEN:')) return 'COBERTURA INTERNA QUEBRADA. O motor não fará fallback físico enquanto a substituição permanecer certificada.';
  if (code.includes('SOURCE_REPLACEMENT_REVOKE_PHYSICAL_REQUIRED')) return 'Reenvie a fonte antes de revogar esta substituição.';
  if (code.includes('SOURCE_REPLACEMENT_NOT_READY')) return 'SUBSTITUIÇÃO AINDA NÃO PRONTA — a readiness precisa ser READY no escopo exato.';
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

type BasesPageProps = { onCanonicalActivated?: (active: ActiveCanonicalBundle) => Promise<BaseAutoSyncResult> };

export function BasesPage({ onCanonicalActivated }: BasesPageProps) {
  const { activeCanonical, activateCanonical, deactivateCanonical } = useData();
  const [updateState, setUpdateState] = useState(() => baseUpdateCoordinator.getState());
  const [operationState, setOperationState] = useState(() => systemDataOperationCoordinator.getState());
  const [replacementLifecycleState, setReplacementLifecycleState] = useState(() => sourceReplacementLifecycle.getState());
  const [pageError, setPageError] = useState('');
  const [pageStatus, setPageStatus] = useState('');
  const [selected, setSelected] = useState<Partial<Record<string, File>>>({});
  const [manifests, setManifests] = useState<SourceStageManifest[]>([]);
  const [dependencyReadiness, setDependencyReadiness] = useState<SourceReplacementReadiness[]>([]);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<SourceBuildDiagnostic[]>([]);
  const [replacementState, setReplacementState] = useState<SourceReplacementState | null>(null);
  const [operationalCompetence, setOperationalCompetence] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const dependencyContracts = useMemo(() => new Map(sourceDependencyMatrix().map(contract => [contract.id, contract])), []);
  const readinessBySource = useMemo(() => new Map(dependencyReadiness.map(item => [item.sourceId, item])), [dependencyReadiness]);
  const diagnosticBySource = useMemo(() => new Map(sourceDiagnostics.map(item => [item.sourceId, item])), [sourceDiagnostics]);

  const refresh = async () => {
    try {
      const [value, registry, target, ...storedRaw] = await Promise.all([
        loadSourceStagingManifests(), loadAdminRegistryState(), Promise.resolve(loadTargetState()),
        ...SUPPORTED_SOURCE_IDS.map(source => loadSourceStaging(source)),
      ]);
      const stored = storedRaw.filter((item): item is NonNullable<typeof item> => Boolean(item));
      const stages = stored.map(item => item.parsed);
      const replacements = loadSourceReplacementState();
      const competence = operationalCompetenceFromPhysicalStages(stored);
      setManifests(value);
      setDependencyReadiness(evaluateSourceReplacementReadinessV21(stages, registry, target));
      setSourceDiagnostics(resolveEffectiveSourceSet({ physicalStages: stored, replacementState: replacements, adminRegistryState: registry, targetState: target }).diagnostics);
      setReplacementState(replacements);
      setOperationalCompetence(competence);
      setPageError('');
    } catch (reason) { setPageError(sourceError(reason)); }
  };

  useEffect(() => baseUpdateCoordinator.subscribe(setUpdateState), []);
  useEffect(() => systemDataOperationCoordinator.subscribe(setOperationState), []);
  useEffect(() => sourceReplacementLifecycle.subscribe(setReplacementLifecycleState), []);
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!updateState.busy && updateState.phase !== 'IDLE') void refresh(); }, [updateState.busy, updateState.phase]);
  useEffect(() => { if (!['CHECKING','BUILDING_BASELINE','BUILDING_REPLACED','VERIFYING','PERSISTING','ACTIVATING','SYNCING'].includes(replacementLifecycleState.phase)) void refresh(); }, [replacementLifecycleState.phase]);

  const manifestBySource = useMemo(() => new Map(manifests.map(manifest => [manifest.source, manifest])), [manifests]);
  const validCount = SUPPORTED_SOURCE_IDS.filter(source => isSourceStageCurrent(manifestBySource.get(source))).length;
  const hardValidCount = HARD_REQUIRED_SOURCE_IDS.filter(source => isSourceStageCurrent(manifestBySource.get(source))).length;
  const selectedCount = Object.keys(selected).length;
  const canReprocess = Boolean(activeCanonical) && hardValidCount === HARD_REQUIRED_SOURCE_IDS.length;

  const assignMany = (files: File[]) => { const next = { ...selected }; const unknown: string[] = []; for (const file of files) { const source = detectSourceForFileName(file.name); if (source) next[source] = file; else unknown.push(file.name); } setSelected(next); setUnmatched(unknown); setPageError(''); };
  const onMany = (event: ChangeEvent<HTMLInputElement>) => { assignMany(Array.from(event.target.files ?? [])); event.target.value = ''; };
  const onSource = (source: string, event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setSelected(current => ({ ...current, [source]: file })); event.target.value = ''; };

  const process = async () => {
    const globalResult = await systemDataOperationCoordinator.run('BASE_UPDATE', async () => baseUpdateCoordinator.run(async controls => {
      controls.setPhase('PROCESSING');
      try {
        const storage = await requestPersistentSourceStorage();
        if (storage.quota && storage.usage && storage.quota - storage.usage < 200 * 1024 * 1024) throw new Error('STORAGE_SPACE_LOW: menos de 200 MB livres para processar as bases.');
        const base = activeCanonical ? { active: activeCanonical, lists: Object.fromEntries((await Promise.all((['M1_ITEM_ESTOQUE','M2_CLIENTE_RCA','M3_MOVIMENTO_VENDAS','M4_HISTORICO_TRANSICAO'] as const).map(async id => [id, await loadCandidateList(id)]))) as [string, unknown][]) as any } : undefined;
        const result = await processSourceUpdates(selected, progress => controls.setProgress(progress), base);
        if (result.rejected.length) return { phase: 'FAILED' as const, status: '', error: `Fonte rejeitada; o build anterior foi preservado. ${result.rejected.map(item => `${SOURCE_LABELS[item.source] ?? item.source}: ${item.errors.join(' | ')}`).join(' · ')}` };
        if (result.missing.length) {
          const blocks = result.blocking;
          const messages = [
            blocks?.hardMissing.length ? `Hard missing: ${blocks.hardMissing.map(source => SOURCE_LABELS[source] ?? source).join(', ')}` : '',
            blocks?.replacementRequired.length ? `Substituição/arquivo requerido: ${blocks.replacementRequired.map(source => SOURCE_LABELS[source] ?? source).join(', ')}` : '',
            blocks?.reviewRequired.length ? `REVISÃO NECESSÁRIA: ${blocks.reviewRequired.map(source => SOURCE_LABELS[source] ?? source).join(', ')}` : '',
            blocks?.coverageBroken.length ? `COBERTURA QUEBRADA: ${blocks.coverageBroken.map(source => SOURCE_LABELS[source] ?? source).join(', ')}` : '',
          ].filter(Boolean).join(' · ');
          return { phase: 'SUCCESS' as const, status: `Stagings salvos, mas nenhum build novo foi ativado. ${messages}`, error: '' };
        }
        if (!result.active) throw new Error('CANONICAL_BUILD_NOT_CREATED');
        const localStatus = result.updated.length ? `ATUALIZAÇÃO CONCLUÍDA — ${result.updated.length} fonte(s) atualizada(s), ${result.unchanged.length} reutilizada(s). Build ativo: ${result.active.motorBuildId}.` : `MOTOR REPROCESSADO — build v21 ativado: ${result.active.motorBuildId}.`;
        controls.setPhase('ACTIVATING');
        const syncResult = await activateBuildAndWaitForAutoSync(result.active, activateCanonical, async active => { controls.setPhase('SYNCING'); return onCanonicalActivated ? onCanonicalActivated(active) : { status: 'NOT_PAIRED' }; });
        setSelected({}); const status = baseUpdateCompletionStatus(localStatus, syncResult);
        if (syncResult.status === 'SYNC_FAILED') return { phase: 'LOCAL_SUCCESS_SYNC_FAILED' as const, status, error: sourceError(syncResult.error) };
        return { phase: 'SUCCESS' as const, status, error: '' };
      } catch (reason) { return { phase: 'FAILED' as const, status: '', error: sourceError(reason) }; }
    }));
    if (globalResult.status === 'BUSY') setPageError(systemDataOperationBusyMessage(globalResult.owner));
    else if (globalResult.value.status === 'BUSY') setPageError('Já existe uma atualização de bases em andamento.');
  };

  const activateReplacement = async (source: string) => {
    const scope = sourceScopeFor(source, operationalCompetence);
    if (!scope) { setPageError('A competência operacional está MIXED/UNRESOLVED; não é permitido adivinhar escopo Top/Target.'); return; }
    setPageError(''); setPageStatus('');
    try {
      const result = await activateCertifiedSourceReplacement(source, scope, { activate: activateCanonical, deactivate: deactivateCanonical });
      setPageStatus(`SUBSTITUIÇÃO ATIVA — ${SOURCE_LABELS[source] ?? source} (${scopeLabel(scope)}). Build: ${result.active.motorBuildId}.`);
      await refresh();
    } catch (reason) { setPageError(sourceError(reason)); }
  };

  const revokeReplacement = async (source: string) => {
    const scope = sourceScopeFor(source, operationalCompetence);
    if (!scope) { setPageError('Não há escopo operacional inequívoco para revogar esta substituição mensal.'); return; }
    setPageError(''); setPageStatus('');
    try {
      const result = await revokeCertifiedSourceReplacement(source, scope, { activate: activateCanonical, deactivate: deactivateCanonical });
      setPageStatus(`SUBSTITUIÇÃO REVOGADA — ${SOURCE_LABELS[source] ?? source} voltou ao uso físico. Build: ${result.active.motorBuildId}.`);
      await refresh();
    } catch (reason) { setPageError(sourceError(reason)); }
  };

  const processing = updateState.busy;
  const globallyBusy = operationState.busy;
  const processLabel = processing ? updateState.phase === 'SYNCING' ? 'Sincronizando…' : updateState.phase === 'ACTIVATING' ? 'Ativando…' : 'Processando…' : selectedCount ? 'PROCESSAR E ATUALIZAR SISTEMA' : 'REPROCESSAR MOTOR ATUAL';

  return <PanelPage title="Bases" metricLabel="Fontes físicas disponíveis" metricValue={`${validCount}/19`}>
    <PanelAlert tone="info"><strong>19 fontes suportadas · 15 sempre obrigatórias · 4 condicionalmente substituíveis.</strong><br />As quatro fontes condicionais só podem faltar quando existe certificado válido para o escopo exato. Não interrompa o fornecimento de nenhum arquivo apenas por existir uma authority administrativa.</PanelAlert>
    {activeCanonical ? <PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}<br />Uso efetivo: {activeCanonical.sourceReplacements?.length ?? 0} substituição(ões) certificada(s).</PanelAlert> : <PanelAlert tone="info">Sem build ativo. As 15 fontes hard-required são sempre físicas; cada candidata adicional exige fonte física ou certificado válido.</PanelAlert>}

    <PanelCard>
      <PanelSectionHeader eyebrow="IMPORTAÇÃO REAL" title="Arquivos originais → Blue Jacket" description="Fonte suportada pode continuar sendo enviada a qualquer momento. Sob certificado ativo, uma nova versão entra em revisão e nunca reaparece silenciosamente no motor." />
      <label className="panel-button" style={{ display: 'inline-block', cursor: processing ? 'not-allowed' : 'pointer' }} aria-disabled={processing}>Selecionar vários arquivos<input type="file" multiple disabled={processing} accept=".xls,.xlsx,.txt" onChange={onMany} style={{ display: 'none' }} /></label>{' '}
      <button className="panel-button" disabled={processing || globallyBusy || (!selectedCount && !canReprocess)} onClick={() => void process()}>{processLabel}</button>
      {processing ? <PanelAlert tone="info">{updatePhaseMessage(updateState)}</PanelAlert> : null}
      {replacementLifecycleState.phase !== 'IDLE' && replacementLifecycleState.phase !== 'SUCCESS' ? <PanelAlert tone={replacementLifecycleState.phase === 'FAILED' ? 'error' : replacementLifecycleState.phase === 'LOCAL_SUCCESS_SYNC_FAILED' ? 'warning' : 'info'}>{replacementLifecycleState.phase} — {replacementLifecycleState.message}{replacementLifecycleState.error ? ` ${replacementLifecycleState.error}` : ''}</PanelAlert> : null}
      {operationState.busy && operationState.owner !== 'BASE_UPDATE' ? <PanelAlert tone="info">{systemDataOperationBusyMessage(operationState.owner)}</PanelAlert> : null}
      {unmatched.length ? <PanelAlert tone="warning">Não identifiquei automaticamente: {unmatched.join(', ')}.</PanelAlert> : null}
      {updateState.status ? <PanelAlert tone="success">{updateState.status}</PanelAlert> : null}
      {updateState.error ? <PanelAlert tone="error">{updateState.error}</PanelAlert> : null}
      {pageStatus ? <PanelAlert tone="success">{pageStatus}</PanelAlert> : null}
      {pageError ? <PanelAlert tone="error">{pageError}</PanelAlert> : null}

      <div className="panel-table-wrap" style={{ marginTop: 12 }}><table className="panel-table">
        <thead><tr><th>Fonte</th><th>Fonte física</th><th>Papel</th><th>Authority</th><th>Readiness</th><th>Certificação</th><th>Escopo</th><th>Uso no motor</th><th>Arquivo / hash</th><th>Ações</th></tr></thead>
        <tbody>{SUPPORTED_SOURCE_IDS.map(source => {
          const manifest = manifestBySource.get(source); const file = selected[source]; const contract = dependencyContracts.get(source); const readiness = readinessBySource.get(source); const diagnostic = diagnosticBySource.get(source);
          const scope = sourceScopeFor(source, operationalCompetence);
          const certificates = replacementState?.certificates.filter(item => item.sourceId === source) ?? [];
          const currentCertificate = scope ? certificates.find(item => item.scope === scope) : null;
          const detail = scope === 'GLOBAL' ? readiness?.details.find(item => item.competence === null) ?? readiness?.details[0] : scope ? readiness?.details.find(item => `COMPETENCE:${item.competence}` === scope) : undefined;
          const ready = detail?.status === 'READY';
          const certification = diagnostic?.status === 'REPLACED' ? 'SUBSTITUIÇÃO ATIVA' : diagnostic?.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : diagnostic?.status === 'COVERAGE_BROKEN' ? 'BROKEN' : currentCertificate ? 'ATIVA — fora do build atual' : certificates.length ? `ATIVA: ${certificates.map(item => scopeLabel(item.scope)).join(', ')}` : 'NÃO ATIVA';
          const motorUse = diagnostic?.status === 'REPLACED' ? 'SUBSTITUIÇÃO INTERNA' : hardSet.has(source) || diagnostic?.status === 'PHYSICAL' ? 'FONTE FÍSICA' : diagnostic?.status === 'REVIEW_REQUIRED' || diagnostic?.status === 'COVERAGE_BROKEN' ? 'BLOQUEADO' : 'FONTE FÍSICA REQUERIDA';
          return <tr key={source}>
            <td>{SOURCE_LABELS[source] ?? source}</td>
            <td>{statusLabel(manifest, file)}</td>
            <td>{hardSet.has(source) ? 'FONTE FÍSICA OBRIGATÓRIA' : 'CONDICIONALMENTE SUBSTITUÍVEL'}</td>
            <td>{replacementLabel(contract?.replacementAuthority)}</td>
            <td>{replaceableSet.has(source) && readiness ? <details><summary>{detail?.status ?? readiness.status}</summary>{readiness.details.map(item => <div key={`${source}:${item.competence ?? 'GLOBAL'}`} style={{ marginTop: 6, minWidth: 280 }}><strong>{item.competence ?? 'Global'}</strong><br />Fonte: {item.sourceRecords} · Cobertos: {item.coveredInternally} · Manual: {item.manual} · Seed: {item.seed} · Tombstones: {item.tombstones} · Conflitos: {item.conflicts} · Não resolvidos: {item.unresolved}<br />{item.reason}</div>)}</details> : 'NÃO APLICÁVEL'}</td>
            <td>{replaceableSet.has(source) ? certification : 'NÃO APLICÁVEL'}</td>
            <td>{replaceableSet.has(source) ? scopeLabel(scope) : '—'}</td>
            <td>{motorUse}</td>
            <td>{file?.name ?? manifest?.fileName ?? '—'}{manifest ? <><br /><span className="panel-muted">{shortHash(manifest.fileHash)}</span></> : null}</td>
            <td>
              <label className="panel-button" style={{ display: 'inline-block', cursor: globallyBusy ? 'not-allowed' : 'pointer' }} aria-disabled={globallyBusy}>Selecionar<input type="file" disabled={globallyBusy} accept=".xls,.xlsx,.txt" onChange={event => onSource(source, event)} style={{ display: 'none' }} /></label>
              {replaceableSet.has(source) ? <><br />
                {!currentCertificate ? <button className="panel-button" disabled={globallyBusy || !ready || !manifest || !scope} onClick={() => void activateReplacement(source)}>ATIVAR SUBSTITUIÇÃO</button> : <button className="panel-button" disabled={globallyBusy} onClick={() => void revokeReplacement(source)}>REVOGAR SUBSTITUIÇÃO</button>}
              </> : null}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
    </PanelCard>
  </PanelPage>;
}