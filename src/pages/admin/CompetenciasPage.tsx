import { useEffect, useState } from 'react';
import { loadCandidateList } from '../../canonical/candidateLists';
import { compareOfficialCompetence, competenceFromFileName, formatCompetenceId, isValidCompetenceId } from '../../canonical/competence';
import {
  createManualCompetence,
  loadCompetenceState,
  setCurrentCompetence,
  subscribeCompetenceState,
  type CompetenceState,
} from '../../canonical/competenceStore';
import { reportSettingsCompetences } from '../../canonical/reportSettings';
import { canonicalSellOutCompetence } from '../../canonical/sellOutRules';
import { loadSourceStagingManifests } from '../../canonical/sourceImport';
import { useData } from '../../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../../ui/pattern/PanelVisual';

const ROUTE_SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const originLabel = (origin: string) => ({
  MANUAL: 'Manual',
  MIGRATION_M3: 'Migração inicial · M3',
  MIGRATION_REPORT_SETTINGS: 'Migração inicial · Metas',
  SYNC: 'Sincronização',
}[origin] ?? origin);

const compatibilityLabel = (status: ReturnType<typeof compareOfficialCompetence>) => ({
  MATCH: 'COMPATÍVEL',
  MISMATCH: 'INCOMPATÍVEL',
  NO_OFFICIAL_COMPETENCE: 'SEM COMPETÊNCIA OFICIAL',
  OBSERVED_MIXED: 'MIXED',
  OBSERVED_UNRESOLVED: 'UNRESOLVED',
  NO_OBSERVED_DATA: 'SEM DADOS OBSERVADOS',
}[status]);

export function CompetenciasPage() {
  const { activeCanonical } = useData();
  const [state, setState] = useState<CompetenceState | null>(() => {
    try { return loadCompetenceState(); } catch { return null; }
  });
  const [month, setMonth] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [m3Evidence, setM3Evidence] = useState<string | null>(null);
  const [routeEvidence, setRouteEvidence] = useState<string | null>(null);
  const [targetEvidence, setTargetEvidence] = useState<string[]>(() => reportSettingsCompetences());

  useEffect(() => {
    try { return subscribeCompetenceState(setState); }
    catch (reason) { setError(`Estado de Competências inválido: ${String(reason)}`); return undefined; }
  }, []);

  useEffect(() => {
    let live = true;
    setTargetEvidence(reportSettingsCompetences());
    const route = loadSourceStagingManifests().then(manifests => {
      const manifest = manifests.find(item => item.source === ROUTE_SOURCE);
      return competenceFromFileName(manifest?.fileName) ?? null;
    }).catch(() => null);
    const m3 = activeCanonical
      ? loadCandidateList('M3_MOVIMENTO_VENDAS').then(list => canonicalSellOutCompetence(list.records, list.competence)).catch(() => 'UNRESOLVED')
      : Promise.resolve(null);
    Promise.all([m3, route]).then(([sellOut, roteiro]) => {
      if (!live) return;
      setM3Evidence(sellOut);
      setRouteEvidence(roteiro);
    });
    return () => { live = false; };
  }, [activeCanonical?.motorBuildId]);

  const current = state?.records.find(record => record.id === state.currentCompetence) ?? null;
  const official = state?.currentCompetence ?? null;
  const m3Compatibility = compareOfficialCompetence(official, m3Evidence);
  const routeCompatibility = compareOfficialCompetence(official, routeEvidence);

  const create = () => {
    try {
      const result = createManualCompetence(month);
      setError('');
      setMessage(result.created ? `Competência ${formatCompetenceId(month)} criada como ABERTA.` : `A competência ${formatCompetenceId(month)} já está registrada.`);
      if (result.created) setMonth('');
    } catch (reason) { setMessage(''); setError(String(reason)); }
  };

  const makeCurrent = (id: string) => {
    try {
      setCurrentCompetence(id);
      setError('');
      setMessage(`Competência ${formatCompetenceId(id)} definida como corrente. Nenhuma competência anterior foi fechada.`);
    } catch (reason) { setMessage(''); setError(String(reason)); }
  };

  return <PanelPage title="Competências" metricLabel="Competência atual" metricValue={official ? formatCompetenceId(official) : 'Não definida'}>
    {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
    {message ? <PanelAlert tone="success">{message}</PanelAlert> : null}

    <PanelCard>
      <PanelSectionHeader eyebrow="PERÍODO ADMINISTRATIVO OFICIAL" title="Competência corrente" description="A competência oficial valida as evidências mensais dos dados; ela não reescreve datas, fontes ou M1–M4." />
      {current
        ? <div><strong>Competência atual:</strong> {formatCompetenceId(current.id)}<br /><strong>Status:</strong> ABERTA</div>
        : <PanelAlert tone="warning">Nenhuma competência corrente definida.</PanelAlert>}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="CADASTRO" title="Cadastrar competência" description="Criar e tornar atual são ações distintas. Toda competência criada nesta fase nasce ABERTA." />
      <div className="panel-inline-actions">
        <label className="panel-field" style={{ maxWidth: 260 }}><span className="panel-mini-label">Competência</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
        <button type="button" className="panel-button" disabled={!isValidCompetenceId(month)} onClick={create}>Criar competência</button>
      </div>
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="REGISTRY" title="Competências registradas" description="Pode haver mais de uma competência ABERTA, mas apenas uma corrente. Esta fase não fecha nem reabre meses." />
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Competência</th><th>Status</th><th>Corrente</th><th>Origem</th><th>Criada em</th><th>Atualizada em</th><th>Ação</th></tr></thead><tbody>
        {(state?.records ?? []).map(record => <tr key={record.id}><td><strong>{formatCompetenceId(record.id)}</strong></td><td>{record.status === 'OPEN' ? 'ABERTA' : 'FECHADA'}</td><td>{official === record.id ? 'SIM' : 'NÃO'}</td><td>{originLabel(record.origin)}</td><td>{dateTime.format(new Date(record.createdAt))}</td><td>{dateTime.format(new Date(record.updatedAt))}</td><td>{record.status === 'OPEN' && official !== record.id ? <button type="button" className="panel-secondary-button" onClick={() => makeCurrent(record.id)}>Tornar atual</button> : '—'}</td></tr>)}
        {!state?.records.length ? <tr><td colSpan={7}>Nenhuma competência registrada.</td></tr> : null}
      </tbody></table></div>
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="EVIDÊNCIAS DO BUILD" title="Oficial × fontes observadas" description="Divergências são exibidas; nenhuma evidência é corrigida ou reinterpretada automaticamente." />
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Evidência</th><th>Competência</th><th>Compatibilidade</th></tr></thead><tbody>
        <tr><td>Competência oficial</td><td>{official ? formatCompetenceId(official) : 'Não definida'}</td><td>—</td></tr>
        <tr><td>Sell Out / M3</td><td>{m3Evidence ? formatCompetenceId(m3Evidence) : 'Sem dados'}</td><td>{compatibilityLabel(m3Compatibility)}</td></tr>
        <tr><td>Roteiro Top</td><td>{routeEvidence ? formatCompetenceId(routeEvidence) : 'UNRESOLVED'}</td><td>{compatibilityLabel(routeCompatibility)}</td></tr>
        <tr><td>Metas cadastradas</td><td>{targetEvidence.length ? targetEvidence.map(formatCompetenceId).join(', ') : 'Nenhuma'}</td><td>REFERÊNCIA</td></tr>
      </tbody></table></div>
    </PanelCard>
  </PanelPage>;
}
