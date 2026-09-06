import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { compareOfficialCompetence, formatCompetenceId } from '../canonical/competence';
import { loadCompetenceState, subscribeCompetenceState, type CompetenceState } from '../canonical/competenceStore';
import { buildSellOutViewModel, type SellOutRow, type SellOutViewModel } from '../canonical/operationalViewModels';
import { exportSellOutExcel, exportSellOutJson } from '../canonical/operationalExporters';
import { sellOutTargetsFor } from '../canonical/reportSettings';
import { buildSellOutDashboardModel, type SellOutDashboardModel } from '../canonical/sellOutDashboardModel';
import { canonicalSellOutCompetence } from '../canonical/sellOutRules';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import './SellOutPage.css';

export const SELL_OUT_TABS = [{ id: 'resumo', label: 'Resumo' }, { id: 'redes', label: 'Redes' }, { id: 'gerencial', label: 'Gerencial' }];
export type SellOutView = (typeof SELL_OUT_TABS)[number]['id'];
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('pt-BR');
const percentValue = (input: number | null) => input === null ? '—' : percent.format(input);

function Alerts({ model }: { model: SellOutViewModel }) { return <>{model.audits.map(audit => <PanelAlert key={audit.code} tone="warning"><strong>{audit.code}</strong> — {audit.message} {audit.code === 'UNRESOLVED_RCA_IN_VIEW' ? ' O código antigo pode estar vazio; esta pendência significa que existe venda do 8022 sem RCA atual resolvido em NOVOS RCAS. Veja Gerencial → Conciliação RCA.' : audit.action}</PanelAlert>)}</>; }

function InfoHint({ text }: { text: string }) {
  return <span className="sellout-info" tabIndex={0} aria-label={text}><span aria-hidden="true">i</span><span className="sellout-info-tooltip" role="tooltip">{text}</span></span>;
}

function MetricCard({ label, value, progress, progressLabel, info }: { label: string; value: string; progress: number | null; progressLabel: string; info: string }) {
  const safeProgress = progress === null ? null : Math.max(0, Math.min(1, progress));
  return <div className="sellout-metric-card">
    <div className="sellout-metric-head"><span>{label}</span><InfoHint text={info} /></div>
    <div className="sellout-metric-value">{value}</div>
    <div className="sellout-progress-copy">{progressLabel}</div>
    <div className={`sellout-progress${safeProgress === null ? ' is-empty' : ''}`} aria-label={safeProgress === null ? 'Sem referência definida' : progressLabel}>
      <span style={{ width: safeProgress === null ? '0%' : `${safeProgress * 100}%` }} />
    </div>
  </div>;
}

function Summary({ dashboard }: { dashboard: SellOutDashboardModel }) {
  const { operationalModel: model, totals } = dashboard;
  const latestLabel = dashboard.latestDate ? new Date(`${dashboard.latestDate}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const targetValue = (value: number | null, formatter: (value: number) => string) => value === null ? 'Definir em Metas' : formatter(value);
  const targetProgress = (value: number | null, label = 'da meta') => value === null ? 'Meta não definida' : `${percent.format(value)} ${label}`;

  return <>
    <div className="panel-badge">COMPETÊNCIA · {model.competence === 'MIXED' || model.competence === 'UNRESOLVED' ? model.competence : `${model.competence.slice(5, 7)}/${model.competence.slice(0, 4)}`}</div>
    <div className="sellout-metric-grid">
      <MetricCard label="Meta T&C" value={targetValue(totals.sellOutTarget, value => currency.format(value))} progress={totals.salesAchievement} progressLabel={targetProgress(totals.salesAchievement, 'atingido')} info="Meta geral de T&C definida manualmente na aba Metas." />
      <MetricCard label="Sell Out" value={currency.format(totals.realized)} progress={totals.salesAchievement} progressLabel={targetProgress(totals.salesAchievement)} info="Total realizado do Sell Out no período ativo, vindo do mesmo view-model usado nos gráficos e na exportação." />
      <MetricCard label="Faturado" value={currency.format(totals.invoiced)} progress={totals.invoicedShare} progressLabel={totals.invoicedShare === null ? 'Sem Sell Out realizado' : `${percent.format(totals.invoicedShare)} do Sell Out`} info="Parcela do Sell Out já faturada." />
      <MetricCard label="Meta positivação" value={targetValue(totals.positivityTarget, value => number.format(value))} progress={totals.positivityAchievement} progressLabel={targetProgress(totals.positivityAchievement, 'atingido')} info="Meta geral de positivação definida manualmente na aba Metas." />
      <MetricCard label="Positivado" value={number.format(totals.positiveCustomers)} progress={totals.positivityAchievement} progressLabel={targetProgress(totals.positivityAchievement)} info="Clientes distintos positivados no período ativo." />
      <MetricCard label="Pos. faturada" value={number.format(totals.invoicedPositiveCustomers)} progress={totals.invoicedPositivityAchievement} progressLabel={targetProgress(totals.invoicedPositivityAchievement)} info="Clientes distintos com venda já faturada no período ativo." />
    </div>
    <PanelCard><PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel. A abertura sempre inicia no último dia válido do acompanhamento." action={<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span className="panel-badge">ÚLTIMO MOVIMENTO · {latestLabel}</span><button className="panel-secondary-button" onClick={() => exportSellOutExcel(model)}>Exportar Excel</button><button className="panel-secondary-button" onClick={() => exportSellOutJson(model)}>Exportar JSON</button></div>} />{dashboard.dailyRows.length ? <DailyMovementWindow data={dashboard.dailyRows} totals={{ realized: totals.realized, positiveCustomers: totals.positiveCustomers, invoicedPositiveCustomers: totals.invoicedPositiveCustomers }} /> : <PanelEmptyState title="Sem movimento diário válido" description="As vendas permanecem no total do período, mas não existe data válida para montar a série diária." />}</PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="SELL OUT POR LINHA" title="Resultado das cinco linhas comerciais" description="As mesmas cinco divisões de produtos usadas no Sell Out anterior, preparadas antes da tela pela classificação canônica de itens." />
      <div className="sellout-line-grid">{dashboard.lineRows.map(row => <MetricCard key={row.line} label={row.line} value={currency.format(row.realized)} progress={row.share} progressLabel={`${percent.format(row.share)} do Sell Out`} info={`Faturado: ${currency.format(row.invoiced)} · A faturar: ${currency.format(row.toInvoice)}`} />)}</div>
      {dashboard.lineUnclassifiedValue !== 0 ? <PanelAlert tone="warning"><strong>Não classificado:</strong> {currency.format(dashboard.lineUnclassifiedValue)} em {number.format(dashboard.lineUnclassifiedRecords)} registro(s). Exemplos: {dashboard.lineUnclassifiedExamples.join(' · ') || 'sem identificador disponível'}.</PanelAlert> : null}
      {dashboard.ambiguousProductRecords ? <PanelAlert tone="warning"><strong>Produto ambíguo:</strong> {number.format(dashboard.ambiguousProductRecords)} registro(s) não foram vinculados arbitrariamente. Identificadores: {dashboard.ambiguousProductExamples.join(' · ')}.</PanelAlert> : null}
    </PanelCard>
  </>;
}

function VendorTable({ rows }: { rows: SellOutRow[] }) { return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>RCA</th><th>Cód. atual</th><th>Cód. antigo</th><th>Meta Sell Out</th><th>Faturado</th><th>A faturar</th><th>Total</th><th>% Meta Sell Out</th><th>Meta positivação</th><th>Clientes positivados</th><th>% Positivação</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.rcaName ?? row.label}</td><td>{row.rcaCurrentCode ?? row.rawRcaCode ?? '—'}</td><td>{row.rcaLegacyCode ?? '—'}</td><td>{currency.format(row.salesTarget)}</td><td>{currency.format(row.invoiced)}</td><td>{currency.format(row.toInvoice)}</td><td>{currency.format(row.realized)}</td><td>{percentValue(row.achievement)}</td><td>{number.format(row.positivityTarget)}</td><td>{number.format(row.positiveCustomers)}</td><td>{percentValue(row.positivityAchievement)}</td><td>{row.resolutionStatus === 'RESOLVED' ? 'Resolvido' : 'Pendente'}</td></tr>)}</tbody></table></div>; }

function RcaReconciliation({ model }: { model: SellOutViewModel }) {
  const diagnostics = model.rcaDiagnostics;
  if (!diagnostics.length) return null;
  return <PanelCard><PanelSectionHeader eyebrow="CONCILIAÇÃO RCA" title="Pendências entre 8022, NOVOS RCAS e Bússola" description="Diagnósticos materializados pelo mesmo view-model do Gerencial; a interface não resolve nem redistribui RCA." /><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>RCA</th><th>Cód.</th><th>Supervisor</th><th>Diagnóstico</th><th>Meta venda</th><th>Meta posit.</th><th>Linhas SALE</th><th>Sell Out</th><th>Ação</th></tr></thead><tbody>{diagnostics.map((item, index) => <tr key={`${item.action}:${item.code}:${index}`}><td>{item.rca ?? '—'}</td><td><strong>{item.code}</strong></td><td>{item.supervisor ?? '—'}</td><td>{item.reason}</td><td>{currency.format(item.salesTarget)}</td><td>{number.format(item.positivityTarget)}</td><td>{number.format(item.saleLines)}</td><td>{currency.format(item.realized)}</td><td><strong>{item.action}</strong></td></tr>)}</tbody></table></div></PanelCard>;
}
function Management({ model }: { model: SellOutViewModel }) {
  const [status, setStatus] = useState<'ALL' | 'RESOLVED' | 'UNRESOLVED'>('ALL');
  const [supervisor, setSupervisor] = useState('ALL');
  const operationalRows = useMemo(() => model.vendorRows.filter(row => row.resolutionStatus === 'RESOLVED' || row.realized > 0 || row.salesTarget > 0 || row.positivityTarget > 0), [model]);
  const supervisors = useMemo(() => [...new Map(operationalRows.map(row => { const key = row.supervisorCode ?? row.supervisorName ?? 'SEM_SUPERVISOR'; return [key, { key, code: row.supervisorCode, name: row.supervisorName }]; })).values()].sort((a, b) => (a.name ?? 'ZZZ').localeCompare(b.name ?? 'ZZZ') || (a.code ?? '').localeCompare(b.code ?? '')), [operationalRows]);
  const filtered = useMemo(() => operationalRows.filter(row => (status === 'ALL' || row.resolutionStatus === status) && (supervisor === 'ALL' || (row.supervisorCode ?? row.supervisorName ?? 'SEM_SUPERVISOR') === supervisor)), [status, supervisor, operationalRows]);
  const groups = useMemo(() => {
    const map = new Map<string, { code: string | null; name: string | null; rows: SellOutRow[] }>();
    for (const row of filtered) { const key = row.supervisorCode ?? row.supervisorName ?? 'SEM_SUPERVISOR'; const group = map.get(key) ?? { code: row.supervisorCode, name: row.supervisorName, rows: [] }; group.rows.push(row); map.set(key, group); }
    return [...map.values()].sort((a, b) => (a.name ?? 'ZZZ').localeCompare(b.name ?? 'ZZZ') || (a.code ?? '').localeCompare(b.code ?? ''));
  }, [filtered]);
  return <>
    <RcaReconciliation model={model} />
    <PanelCard><PanelSectionHeader eyebrow="GERENCIAL" title="Vendedores separados por supervisor" description="RCA inativo que ficou na Bússola com metas zeradas e não existe mais em NOVOS RCAS é retirado da visualização operacional." action={<div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label className="panel-muted">Supervisor <select value={supervisor} onChange={event => setSupervisor(event.target.value)}><option value="ALL">Todos</option>{supervisors.map(item => <option key={item.key} value={item.key}>{item.name ?? 'Sem supervisor'}{item.code ? ` · ${item.code}` : ''}</option>)}</select></label><label className="panel-muted">RCA <select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="ALL">Todos</option><option value="RESOLVED">Resolvidos</option><option value="UNRESOLVED">Pendentes</option></select></label></div>} /></PanelCard>
    {groups.map(group => { const summary = model.supervisorRows.find(row => row.key === (group.code ?? group.name ?? 'SEM_SUPERVISOR')); return <PanelCard key={group.code ?? group.name ?? 'SEM_SUPERVISOR'}><PanelSectionHeader eyebrow="SUPERVISOR" title={`${group.name ?? 'Sem supervisor'}${group.code ? ` · Cód. ${group.code}` : ''}`} description={summary ? `${number.format(summary.rcaCount)} RCA(s) · Meta ${currency.format(summary.salesTarget)} · Realizado ${currency.format(summary.realized)} · ${percentValue(summary.achievement)} · Gap ${currency.format(summary.gap)} · Positivação ${number.format(summary.positiveCustomers)}/${number.format(summary.positivityTarget)} (${percentValue(summary.positivityAchievement)})` : `${number.format(group.rows.length)} RCA(s)`} /><VendorTable rows={group.rows} /></PanelCard>; })}
  </>;
}

function competenceGateMessage(official: string | null, observed: string, status: ReturnType<typeof compareOfficialCompetence>) {
  if (status === 'NO_OFFICIAL_COMPETENCE') return 'Nenhuma competência oficial está selecionada. Defina-a em Administração → Competências.';
  if (status === 'OBSERVED_MIXED') return 'O Sell Out possui dados de mais de uma competência. Atualize o 8022 com um relatório mensal coerente.';
  if (status === 'OBSERVED_UNRESOLVED' || status === 'NO_OBSERVED_DATA') return 'A competência do Sell Out não pôde ser determinada a partir de SALE/event_date. Nenhum período oficial foi presumido.';
  return `Os dados de Sell Out pertencem a ${formatCompetenceId(observed)}, mas a competência oficial é ${formatCompetenceId(official)}. Atualize o 8022 ou revise a competência oficial em Administração → Competências.`;
}

export function SellOutPage({ view = 'resumo' }: { view?: SellOutView }) {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m2: CanonicalList; m3: CanonicalList } | null>(null);
  const [error, setError] = useState('');
  const [competenceState, setCompetenceState] = useState<CompetenceState | null>(() => { try { return loadCompetenceState(); } catch { return null; } });
  useEffect(() => { try { return subscribeCompetenceState(setCompetenceState); } catch (reason) { setError(`Estado de Competências inválido: ${String(reason)}`); return undefined; } }, []);
  useEffect(() => { if (!activeCanonical) { setLists(null); return; } let live = true; setLists(null); setError(''); Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M2_CLIENTE_RCA'), loadCandidateList('M3_MOVIMENTO_VENDAS')]).then(([m1, m2, m3]) => { if (live) setLists({ m1, m2, m3 }); }).catch(reason => { if (live) setError(String(reason)); }); return () => { live = false; }; }, [activeCanonical]);
  if (!activeCanonical) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Não existe fallback legado para esta tela." /></PanelPage>;
  if (error) return <PanelPage title="Sell Out"><PanelAlert tone="error">Erro ao carregar o bundle ativo: {error}</PanelAlert></PanelPage>;
  if (!lists) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Carregando bundle canônico" description="Leitura passiva de M1, M2 e M3; nenhum parser ou motor é acionado." /></PanelPage>;

  const observedCompetence = canonicalSellOutCompetence(lists.m3.records, lists.m3.competence);
  const officialCompetence = competenceState?.currentCompetence ?? null;
  const compatibility = compareOfficialCompetence(officialCompetence, observedCompetence);
  if (compatibility !== 'MATCH') return <PanelPage title="Sell Out"><PanelAlert tone="warning"><strong>Sell Out bloqueado por competência.</strong><br />{competenceGateMessage(officialCompetence, observedCompetence, compatibility)}</PanelAlert></PanelPage>;

  const baseModel = buildSellOutViewModel(lists);
  const canonicalModel: SellOutViewModel = { ...baseModel, motorBuildId: activeCanonical.motorBuildId, stagingManifestHash: activeCanonical.stagingManifestHash };
  const dashboard = buildSellOutDashboardModel({ base: canonicalModel, m1: lists.m1, m3: lists.m3, targets: sellOutTargetsFor(officialCompetence!) });
  const model = dashboard.operationalModel;
  return <PanelPage title="Sell Out"><div className="panel-stack sellout-page-stack"><Alerts model={model} />{view === 'gerencial' ? <Management model={model} /> : <Summary dashboard={dashboard} />}</div></PanelPage>;
}
