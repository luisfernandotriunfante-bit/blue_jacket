import { useEffect, useMemo, useState } from 'react';
import { loadAdminRegistryState } from '../canonical/adminRegistryIndexedDb';
import type { AdminRegistryState } from '../canonical/adminRegistry';
import { loadCandidateList } from '../canonical/candidateLists';
import { formatCompetenceId, isValidCompetenceId } from '../canonical/competence';
import { competenceRecord, loadCompetenceState, subscribeCompetenceState, type CompetenceState } from '../canonical/competenceStore';
import { createRcaResolver } from '../canonical/rcaResolver';
import { legacyTargetsPendingFor } from '../canonical/reportSettings';
import { systemDataOperationBusyMessage, systemDataOperationCoordinator } from '../canonical/systemDataOperationCoordinator';
import { resolveTargetAuthority } from '../canonical/targetAuthority';
import { loadTargetState, subscribeTargetState, type RcaTargetRecord, type TargetState } from '../canonical/targetStore';
import type { TargetSeedPreview } from '../canonical/targetSeed';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { canonicalTargetActions, migrateLegacyGeneralTarget, targetUpdateCoordinator } from './admin/targetUpdateFlow';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';

type RcaCatalogRow = {
  rcaCanonicalId: string;
  name: string | null;
  currentCode: string | null;
  legacyCode: string | null;
  supervisorCode: string | null;
  supervisorName: string | null;
};

type RcaForm = { rcaCanonicalId: string; salesTarget: string; positivityTarget: string; note: string; recordId: string | null };
const EMPTY_RCA_FORM: RcaForm = { rcaCanonicalId: '', salesTarget: '', positivityTarget: '', note: '', recordId: null };

const optionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('A meta deve ser um número maior ou igual a zero.');
  return parsed;
};
const requiredNumber = (value: string) => {
  const parsed = optionalNumber(value);
  if (parsed === null) throw new Error('A meta RCA é obrigatória; ausência não é convertida em zero.');
  return parsed;
};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

function registryCatalog(registry: AdminRegistryState | null) {
  const resolver = createRcaResolver([], registry);
  const rows = new Map<string, RcaCatalogRow>();
  for (const record of registry?.rcas ?? []) {
    if (!record.active) continue;
    const resolution = resolver.resolveCurrent(record.currentCode);
    if (!resolution.canonicalId) continue;
    const existing = rows.get(resolution.canonicalId);
    rows.set(resolution.canonicalId, {
      rcaCanonicalId: resolution.canonicalId,
      name: record.name ?? existing?.name ?? resolution.name,
      currentCode: record.currentCode || existing?.currentCode || resolution.currentCode,
      legacyCode: record.legacyCode ?? existing?.legacyCode ?? resolution.legacyCode,
      supervisorCode: record.coordinatorCode ?? existing?.supervisorCode ?? resolution.coordinatorCode,
      supervisorName: record.coordinatorName ?? existing?.supervisorName ?? resolution.coordinatorName,
    });
  }
  return rows;
}

function canonicalRcaCatalog(registry: AdminRegistryState | null, m2: CanonicalList | null) {
  const rows = new Map<string, RcaCatalogRow>();
  for (const record of m2?.records ?? []) {
    const id = text(record.rca_canonical_id);
    if (!id) continue;
    const current = rows.get(id);
    rows.set(id, {
      rcaCanonicalId: id,
      name: current?.name ?? text(record.rca_name),
      currentCode: current?.currentCode ?? text(record.rca_current_code) ?? id.replace(/^RCA:/, ''),
      legacyCode: current?.legacyCode ?? text(record.rca_legacy_code),
      supervisorCode: current?.supervisorCode ?? text(record.coordinator_code),
      supervisorName: current?.supervisorName ?? text(record.coordinator_name),
    });
  }
  for (const [id, row] of registryCatalog(registry)) {
    const current = rows.get(id);
    rows.set(id, {
      rcaCanonicalId: id,
      name: row.name ?? current?.name ?? null,
      currentCode: row.currentCode ?? current?.currentCode ?? null,
      legacyCode: row.legacyCode ?? current?.legacyCode ?? null,
      supervisorCode: row.supervisorCode ?? current?.supervisorCode ?? null,
      supervisorName: row.supervisorName ?? current?.supervisorName ?? null,
    });
  }
  return [...rows.values()].sort((a, b) => (a.supervisorName ?? 'ZZZ').localeCompare(b.supervisorName ?? 'ZZZ') || (a.name ?? a.currentCode ?? a.rcaCanonicalId).localeCompare(b.name ?? b.currentCode ?? b.rcaCanonicalId));
}

function recordForEditing(state: TargetState | null, competence: string, rcaCanonicalId: string) {
  const records = state?.records.find(item => item.competence === competence)?.rcaTargets.filter(item => item.rcaCanonicalId === rcaCanonicalId) ?? [];
  return records.find(item => item.origin === 'MANUAL') ?? records.find(item => item.origin === 'SOURCE_SEED') ?? null;
}

function previewLabel(preview: TargetSeedPreview) {
  const general=preview.generalTargets;
  return `Novos ${preview.counts.new} · Atualizáveis ${preview.counts.updatable} · Iguais ${preview.counts.equal} · MANUAL protegidos ${preview.counts.manualProtected} · Conflitos ${preview.counts.conflicts} · RCA não resolvido ${preview.counts.rcaUnresolved} · Competência divergente ${preview.counts.competenceMismatch} · Ausentes na fonte ${preview.counts.missingFromSource} · Gerais: T&C ${general.sellOutTarget?.toLocaleString('pt-BR') ?? '—'}, Positivação ${general.positivityTarget?.toLocaleString('pt-BR') ?? '—'}, Redes ${general.networkTarget?.toLocaleString('pt-BR') ?? '—'}`;
}

export function MetasPage() {
  const { activeCanonical, activateCanonical, deactivateCanonical } = useData();
  const [competenceState, setCompetenceState] = useState<CompetenceState | null>(() => { try { return loadCompetenceState(); } catch { return null; } });
  const [targetState, setTargetState] = useState<TargetState | null>(() => { try { return loadTargetState(); } catch { return null; } });
  const [registry, setRegistry] = useState<AdminRegistryState | null>(null);
  const [m2, setM2] = useState<CanonicalList | null>(null);
  const [competence, setCompetence] = useState('');
  const [sellOutTarget, setSellOutTarget] = useState('');
  const [positivityTarget, setPositivityTarget] = useState('');
  const [networkTarget, setNetworkTarget] = useState('');
  const [search, setSearch] = useState('');
  const [rcaForm, setRcaForm] = useState<RcaForm>(EMPTY_RCA_FORM);
  const [preview, setPreview] = useState<TargetSeedPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [lifecycle, setLifecycle] = useState(() => targetUpdateCoordinator.getState());
  const [globalOperation, setGlobalOperation] = useState(() => systemDataOperationCoordinator.getState());

  useEffect(() => { try { return subscribeCompetenceState(setCompetenceState); } catch (reason) { setError(`Estado de Competências inválido: ${String(reason)}`); return undefined; } }, []);
  useEffect(() => { try { return subscribeTargetState(setTargetState); } catch (reason) { setError(`TargetState inválido: ${String(reason)}`); return undefined; } }, []);
  useEffect(() => targetUpdateCoordinator.subscribe(setLifecycle), []);
  useEffect(() => systemDataOperationCoordinator.subscribe(setGlobalOperation), []);
  useEffect(() => { void loadAdminRegistryState().then(setRegistry).catch(reason => setError(String(reason))); }, [activeCanonical?.motorBuildId]);
  useEffect(() => {
    if (!activeCanonical) { setM2(null); return; }
    let live = true;
    void loadCandidateList('M2_CLIENTE_RCA').then(value => { if (live) setM2(value); }).catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [activeCanonical?.motorBuildId]);

  useEffect(() => {
    if (!competenceState) { setCompetence(''); return; }
    setCompetence(current => competenceState.records.some(record => record.id === current) ? current : competenceState.currentCompetence ?? competenceState.records[0]?.id ?? '');
  }, [competenceState?.updatedAt]);

  useEffect(() => {
    const record = targetState?.records.find(item => item.competence === competence);
    setSellOutTarget(record?.sellOutTarget?.toString() ?? '');
    setPositivityTarget(record?.positivityTarget?.toString() ?? '');
    setNetworkTarget(record?.networkTarget?.toString() ?? '');
    setPreview(null); setRcaForm(EMPTY_RCA_FORM); setNotice(''); setError('');
  }, [competence, targetState?.updatedAt]);

  const runtime = useMemo(() => ({ getActive: () => activeCanonical, activate: activateCanonical, deactivate: deactivateCanonical }), [activeCanonical, activateCanonical, deactivateCanonical]);
  const actions = useMemo(() => canonicalTargetActions(runtime), [runtime]);
  const selectedRecord = competenceRecord(competenceState, competence);
  const editable = Boolean(selectedRecord?.status === 'OPEN');
  const mutationBusy = lifecycle.busy || globalOperation.busy;
  const catalog = useMemo(() => canonicalRcaCatalog(registry, m2), [registry, m2]);
  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter(row => !query || [row.name, row.currentCode, row.legacyCode, row.supervisorName, row.supervisorCode].some(value => String(value ?? '').toLowerCase().includes(query)));
  }, [catalog, search]);
  const pendingLegacy = editable && isValidCompetenceId(competence) ? legacyTargetsPendingFor(competence) : { sellOutTarget: null, positivityTarget: null };
  const currentTargets = targetState?.records.find(record => record.competence === competence)?.rcaTargets ?? [];

  const unwrap = async (operation: Promise<any>) => {
    setError(''); setNotice('');
    const outer = await operation;
    if (outer.status === 'BUSY') { setError(systemDataOperationBusyMessage(outer.owner)); return false; }
    const coordinator = outer.value;
    if (coordinator.status === 'BUSY') { setError('Já existe uma alteração de Metas em andamento.'); return false; }
    const completion = coordinator.value;
    if (completion.phase === 'FAILED') { setError(completion.error); return false; }
    setNotice(completion.status);
    if (completion.phase === 'LOCAL_SUCCESS_SYNC_FAILED') setError(completion.error);
    return true;
  };

  const saveGeneral = async () => {
    if (!editable) return;
    try {
      await unwrap(actions.saveGeneral(competence, { sellOutTarget: optionalNumber(sellOutTarget), positivityTarget: optionalNumber(positivityTarget), networkTarget: optionalNumber(networkTarget) }));
    } catch (reason) { setError(String(reason)); }
  };

  const editRca = (row: RcaCatalogRow) => {
    const target = recordForEditing(targetState, competence, row.rcaCanonicalId);
    setRcaForm({ rcaCanonicalId: row.rcaCanonicalId, salesTarget: target ? String(target.salesTarget) : '', positivityTarget: target ? String(target.positivityTarget) : '', note: target?.note ?? '', recordId: target?.id ?? null });
  };

  const saveRca = async () => {
    if (!editable || !rcaForm.rcaCanonicalId) return;
    const row = catalog.find(item => item.rcaCanonicalId === rcaForm.rcaCanonicalId);
    if (!row) { setError('RCA_CANONICAL_CATALOG_REQUIRED'); return; }
    try {
      const ok = await unwrap(actions.upsertRca({ competence, rcaCanonicalId: row.rcaCanonicalId, sourceRcaCode: row.legacyCode ?? row.currentCode, salesTarget: requiredNumber(rcaForm.salesTarget), positivityTarget: requiredNumber(rcaForm.positivityTarget), note: rcaForm.note || null }, rcaForm.recordId ?? undefined));
      if (ok) setRcaForm(EMPTY_RCA_FORM);
    } catch (reason) { setError(String(reason)); }
  };

  const toggleRca = async (record: RcaTargetRecord) => {
    if (!editable) return;
    try { await unwrap(actions.setRcaActive(competence, record.id, !record.active)); }
    catch (reason) { setError(String(reason)); }
  };

  const previewBussola = async () => {
    if (!editable) return;
    setPreviewBusy(true); setError(''); setNotice('');
    try { setPreview(await actions.previewSeed(competence)); }
    catch (reason) { setError(String(reason)); setPreview(null); }
    finally { setPreviewBusy(false); }
  };

  const applyPreview = async () => {
    if (!editable || !preview) return;
    try { const ok = await unwrap(actions.applySeed(competence, preview)); if (ok) setPreview(null); }
    catch (reason) { setError(String(reason)); }
  };

  const migrateLegacy = async () => {
    if (!editable) return;
    try {
      if (pendingLegacy.sellOutTarget !== null) await unwrap(migrateLegacyGeneralTarget('sellOut', competence, runtime));
      if (pendingLegacy.positivityTarget !== null) await unwrap(migrateLegacyGeneralTarget('positivity', competence, runtime));
    } catch (reason) { setError(String(reason)); }
  };

  const knownCompetences = competenceState?.records ?? [];

  return <PanelPage title="Metas">
    <div className="panel-stack">
      <PanelCard>
        <PanelSectionHeader eyebrow="AUTORIDADE ADMINISTRATIVA" title="Metas por competência" description="TargetState é a autoridade oficial. CompetenceState controla a competência editada, mas nunca é usado pelo motor para presumir o mês de um TARGET." />
        {!competenceState?.currentCompetence ? <PanelAlert tone="warning">Nenhuma competência oficial corrente está definida. Cadastre ou selecione uma em Administração → Competências.</PanelAlert> : null}
        <label className="panel-field" style={{ maxWidth: 360, marginBottom: 16 }}><span className="panel-mini-label">Competência editada</span><select value={competence} onChange={event => setCompetence(event.target.value)}><option value="">Selecione uma competência</option>{knownCompetences.map(record => <option key={record.id} value={record.id}>{formatCompetenceId(record.id)} · {record.status === 'OPEN' ? 'ABERTA' : 'FECHADA'}</option>)}</select></label>
        {selectedRecord ? <PanelAlert tone={editable ? 'info' : 'warning'}><strong>Competência editada:</strong> {formatCompetenceId(selectedRecord.id)} · <strong>Status:</strong> {selectedRecord.status === 'OPEN' ? 'ABERTA' : 'FECHADA'}{!editable ? ' — somente leitura; nenhuma mutação, seed ou migração é permitida.' : ''}</PanelAlert> : null}
        {globalOperation.busy ? <PanelAlert tone="info">{systemDataOperationBusyMessage(globalOperation.owner)}</PanelAlert> : null}
        {notice ? <PanelAlert tone="success">{notice}</PanelAlert> : null}
        {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="METAS GERAIS" title="T&C, Positivação e Redes Geral" description="Essas três metas são competência-específicas e alteram a visão operacional, mas não M1–M4. Salvar somente estas metas não executa rebuild canônico." />
        {(pendingLegacy.sellOutTarget !== null || pendingLegacy.positivityTarget !== null) ? <PanelAlert tone="warning"><strong>Existe meta global legada ainda não vinculada.</strong> Ela não será aplicada automaticamente. <button type="button" className="panel-secondary-button" disabled={!editable || mutationBusy} onClick={() => void migrateLegacy()}>Migrar explicitamente para {formatCompetenceId(competence)}</button></PanelAlert> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          <label className="panel-field"><span className="panel-mini-label">Meta T&C Geral (R$)</span><input disabled={!editable || mutationBusy} inputMode="decimal" value={sellOutTarget} onChange={event => setSellOutTarget(event.target.value)} placeholder="Ausente ou valor ≥ 0" /></label>
          <label className="panel-field"><span className="panel-mini-label">Meta Positivação Geral</span><input disabled={!editable || mutationBusy} inputMode="decimal" value={positivityTarget} onChange={event => setPositivityTarget(event.target.value)} placeholder="Ausente ou valor ≥ 0" /></label>
          <label className="panel-field"><span className="panel-mini-label">Meta Redes Geral (R$)</span><input disabled={!editable || mutationBusy} inputMode="decimal" value={networkTarget} onChange={event => setNetworkTarget(event.target.value)} placeholder="Ausente ou valor ≥ 0" /></label>
        </div>
        <button type="button" className="panel-button" style={{ marginTop: 16 }} disabled={!editable || mutationBusy || !isValidCompetenceId(competence)} onClick={() => void saveGeneral()}>{mutationBusy ? 'Operação em andamento…' : 'Salvar metas gerais'}</button>
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="METAS POR RCA" title="Target Registry canônico" description="A chave funcional é competência + RCA canônico. MANUAL vence SOURCE_SEED; MANUAL inativo funciona como tombstone e impede a Bússola de reaparecer." />
        <div className="panel-stat-grid">
          <PanelStat label="RCAs canônicos" value={catalog.length} />
          <PanelStat label="Targets registrados" value={currentTargets.length} />
          <PanelStat label="MANUAL" value={currentTargets.filter(record => record.origin === 'MANUAL').length} />
          <PanelStat label="SOURCE_SEED" value={currentTargets.filter(record => record.origin === 'SOURCE_SEED').length} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input className="panel-input" style={{ minWidth: 300 }} placeholder="Buscar nome, código atual/antigo ou supervisor" value={search} onChange={event => setSearch(event.target.value)} />
          <button className="panel-secondary-button" disabled={!editable || mutationBusy || previewBusy} onClick={() => void previewBussola()}>{previewBusy ? 'Lendo staging…' : 'PRÉ-VISUALIZAR BÚSSOLA'}</button>
        </div>
        {preview ? <PanelAlert tone={preview.counts.conflicts || preview.counts.rcaUnresolved || preview.counts.competenceMismatch ? 'warning' : 'info'}><strong>Preview passivo — nenhuma gravação foi feita.</strong><br />{previewLabel(preview)}<br />As metas gerais ausentes também serão preenchidas pelas somas oficiais da Bússola e do Roteiro Top; valores já cadastrados são preservados.<br />{preview.sourceCompetence && preview.sourceCompetence !== competence ? `A Bússola pertence a ${formatCompetenceId(preview.sourceCompetence)} e não pode alimentar metas de ${formatCompetenceId(competence)}.` : null}<br /><button className="panel-button" disabled={!editable || mutationBusy || preview.sourceCompetence !== competence} onClick={() => void applyPreview()}>APLICAR ITENS SEGUROS</button></PanelAlert> : null}

        {rcaForm.rcaCanonicalId ? <div style={{ borderTop: '1px solid var(--panel-border, #ddd)', paddingTop: 16, marginBottom: 16 }}>
          <strong>{catalog.find(row => row.rcaCanonicalId === rcaForm.rcaCanonicalId)?.name ?? rcaForm.rcaCanonicalId}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 10 }}>
            <label className="panel-field"><span className="panel-mini-label">Meta Sell Out RCA</span><input disabled={!editable || mutationBusy} inputMode="decimal" value={rcaForm.salesTarget} onChange={event => setRcaForm({ ...rcaForm, salesTarget: event.target.value })} /></label>
            <label className="panel-field"><span className="panel-mini-label">Meta Positivação RCA</span><input disabled={!editable || mutationBusy} inputMode="decimal" value={rcaForm.positivityTarget} onChange={event => setRcaForm({ ...rcaForm, positivityTarget: event.target.value })} /></label>
            <label className="panel-field"><span className="panel-mini-label">Observação</span><input disabled={!editable || mutationBusy} value={rcaForm.note} onChange={event => setRcaForm({ ...rcaForm, note: event.target.value })} /></label>
          </div>
          <button className="panel-button" disabled={!editable || mutationBusy} onClick={() => void saveRca()}>Salvar meta RCA</button>{' '}<button className="panel-secondary-button" disabled={mutationBusy} onClick={() => setRcaForm(EMPTY_RCA_FORM)}>Cancelar</button>
        </div> : null}

        <div className="panel-table-wrap"><table className="panel-table" style={{ minWidth: 1280 }}><thead><tr><th>RCA</th><th>Código atual</th><th>Código antigo</th><th>Supervisor</th><th className="is-right">Meta Sell Out</th><th className="is-right">Meta Positivação</th><th>Origem</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredCatalog.map(row => {
          const resolution = resolveTargetAuthority(targetState, competence, row.rcaCanonicalId);
          const existing = recordForEditing(targetState, competence, row.rcaCanonicalId);
          const ambiguous = resolution.ambiguous;
          const status = ambiguous ? 'CONFLITO' : resolution.tombstone ? 'INATIVO / TOMBSTONE' : resolution.record ? 'ATIVO' : 'SEM TARGET INTERNO';
          return <tr key={row.rcaCanonicalId}><td>{row.name ?? row.rcaCanonicalId}</td><td>{row.currentCode ?? '—'}</td><td>{row.legacyCode ?? '—'}</td><td>{row.supervisorName ?? row.supervisorCode ?? '—'}</td><td className="is-right">{resolution.record ? resolution.record.salesTarget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td><td className="is-right">{resolution.record ? resolution.record.positivityTarget.toLocaleString('pt-BR') : '—'}</td><td>{ambiguous ? 'AMBÍGUO' : resolution.authority === 'NONE' ? 'BÚSSOLA / SEM REGISTRY' : resolution.authority}</td><td>{status}</td><td><button className="panel-secondary-button" disabled={!editable || mutationBusy || ambiguous} onClick={() => editRca(row)}>{existing ? 'Editar' : 'Definir'}</button>{existing ? <>{' '}<button className="panel-secondary-button" disabled={!editable || mutationBusy || ambiguous} onClick={() => void toggleRca(existing)}>{existing.active ? 'Inativar' : 'Reativar'}</button></> : null}</td></tr>;
        })}</tbody></table></div>
      </PanelCard>
    </div>
  </PanelPage>;
}
