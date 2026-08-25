import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildNetworkDashboardModel, redistributeNetworkAllocation } from '../canonical/networkDashboardModel';
import { buildSellOutViewModel, buildTopNetworksViewModel, type SellOutRow, type SellOutViewModel } from '../canonical/operationalViewModels';
import { exportSellOutExcel, exportSellOutJson, exportTopNetworksExcel, exportTopNetworksJson } from '../canonical/operationalExporters';
import { networkAllocationFor, networkTargetFor, sellOutTargets, setNetworkAllocationFor, setNetworkTargetFor } from '../canonical/reportSettings';
import { buildSellOutDashboardModel, type SellOutDashboardModel } from '../canonical/sellOutDashboardModel';
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
const textValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numericValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;

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
    </PanelCard>
  </>;
}

function Networks({ model, m2, m3 }: { model: SellOutViewModel; m2: CanonicalList; m3: CanonicalList }) {
  const [, setRevision] = useState(0);
  const [draftTotal, setDraftTotal] = useState(() => networkTargetFor(model.competence)?.toString() ?? '');
  const [draftTargets, setDraftTargets] = useState<Record<string, string>>({});
  const manualTarget = networkTargetFor(model.competence);
  const savedAllocation = networkAllocationFor(model.competence);
  const built = buildTopNetworksViewModel({ m2, m3, generatedAt: model.generatedAt });
  const baseNetworks = { ...built, motorBuildId: model.motorBuildId, stagingManifestHash: model.stagingManifestHash, teamRows: model.vendorRows };
  const dashboard = buildNetworkDashboardModel({ base: baseNetworks, networkTarget: manualTarget, allocation: savedAllocation });
  const networks = dashboard.operationalModel;
  const attainment = manualTarget && manualTarget > 0 ? networks.totals.realized / manualTarget : null;
  const mappedShare = model.totals.realized > 0 ? networks.totals.realized / model.totals.realized : null;
  const invoicedShare = networks.totals.realized > 0 ? networks.totals.invoiced / networks.totals.realized : null;
  const toInvoiceShare = networks.totals.realized > 0 ? networks.totals.toInvoice / networks.totals.realized : null;
  const customerShare = model.totals.positiveCustomers > 0 ? networks.totals.customers / model.totals.positiveCustomers : null;
  const sourceNetworks = new Set(m2.records.flatMap(row => [textValue(row.canonical_network), textValue(row.premise_network), textValue(row.top_network)].filter(Boolean) as string[])).size;
  const networkCoverage = sourceNetworks > 0 ? networks.totals.networks / sourceNetworks : null;

  const saveTotal = () => {
    if (!draftTotal.trim()) {
      setNetworkTargetFor(model.competence, null);
      setDraftTotal('');
      setDraftTargets({});
      setRevision(value => value + 1);
      return;
    }
    const parsed = Number(draftTotal.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setNetworkTargetFor(model.competence, parsed);
    setDraftTotal(String(parsed));
    setDraftTargets({});
    setRevision(value => value + 1);
  };

  const commitNetworkTarget = (network: string) => {
    if (manualTarget === null) return;
    const raw = draftTargets[network];
    if (raw === undefined) return;
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) { setDraftTargets(current => { const next = { ...current }; delete next[network]; return next; }); return; }
    const allocation = redistributeNetworkAllocation(manualTarget, networks.rows, network, parsed);
    setNetworkAllocationFor(model.competence, allocation);
    setDraftTargets({});
    setRevision(value => value + 1);
  };

  const resetAllocation = () => {
    setNetworkAllocationFor(model.competence, null);
    setDraftTargets({});
    setRevision(value => value + 1);
  };

  return <>
    <div className="sellout-metric-grid">
      <MetricCard label="Meta Redes" value={manualTarget === null ? 'Definir abaixo' : currency.format(manualTarget)} progress={attainment} progressLabel={attainment === null ? 'Meta não definida' : `${percent.format(attainment)} atingido`} info="Meta total das redes definida manualmente nesta competência. Não vem da Bússola nem de nenhuma planilha auxiliar." />
      <MetricCard label="Total nas redes" value={currency.format(networks.totals.realized)} progress={mappedShare} progressLabel={mappedShare === null ? 'Sem Sell Out realizado' : `${percent.format(mappedShare)} do Sell Out`} info="Somente vendas do M3 cujos CNPJs possuem rede resolvida no M2." />
      <MetricCard label="Faturado" value={currency.format(networks.totals.invoiced)} progress={invoicedShare} progressLabel={invoicedShare === null ? 'Sem venda em redes' : `${percent.format(invoicedShare)} das vendas em redes`} info="Parcela já faturada das vendas vinculadas a redes." />
      <MetricCard label="A faturar" value={currency.format(networks.totals.toInvoice)} progress={toInvoiceShare} progressLabel={toInvoiceShare === null ? 'Sem venda em redes' : `${percent.format(toInvoiceShare)} das vendas em redes`} info="Parcela a faturar das vendas vinculadas a redes." />
      <MetricCard label="Redes com venda" value={number.format(networks.totals.networks)} progress={networkCoverage} progressLabel={networkCoverage === null ? 'Sem redes mapeadas' : `${percent.format(networkCoverage)} das redes mapeadas`} info="Quantidade de redes do M2 que possuem movimento de venda no M3." />
      <MetricCard label="Clientes vinculados" value={number.format(networks.totals.customers)} progress={customerShare} progressLabel={customerShare === null ? 'Sem positivação' : `${percent.format(customerShare)} dos positivados`} info="CNPJs positivos do M3 que possuem rede resolvida no M2." />
    </div>

    <PanelCard>
      <PanelSectionHeader eyebrow="META DE REDES" title="Distribuição da meta" description="A meta total é manual. Sem ajuste individual, ela é distribuída pela participação atual de cada rede. Ao alterar uma rede, o saldo é redistribuído proporcionalmente entre todas as demais." action={<span className={`panel-badge${dashboard.allocationSource === 'MANUAL' ? ' panel-badge-red' : ''}`}>{dashboard.allocationSource === 'MANUAL' ? 'AJUSTE MANUAL ATIVO' : dashboard.allocationSource === 'PROPORTIONAL' ? 'DISTRIBUIÇÃO PROPORCIONAL' : 'META NÃO DEFINIDA'}</span>} />
      <div className="panel-toolbar">
        <label className="panel-field" style={{ minWidth: 260 }}>
          <span className="panel-field-label">Meta total das redes · {model.competence}</span>
          <input className="panel-input panel-input-currency" type="number" min="0" step="0.01" value={draftTotal} onChange={event => setDraftTotal(event.target.value)} placeholder="Ex.: 3000000" />
        </label>
        <div className="panel-inline-actions">
          <button type="button" className="panel-secondary-button" onClick={saveTotal}>Salvar meta de redes</button>
          <button type="button" className="panel-secondary-button" onClick={resetAllocation} disabled={manualTarget === null}>Redistribuir proporcional</button>
        </div>
      </div>
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="TOP REDES" title="Realizado por rede" description="Rede e Meta Tops vêm do M2; Faturado e A Faturar vêm do M3; Meta Redes vem somente da meta manual acima. Cliente sem rede não é forçado para nenhuma rede." action={<div className="panel-inline-actions"><button className="panel-secondary-button" onClick={() => exportTopNetworksExcel(networks)}>Exportar Excel</button><button className="panel-secondary-button" onClick={() => exportTopNetworksJson(networks)}>Exportar JSON</button></div>} />
      <div className="panel-table-wrap"><table className="panel-table" style={{ minWidth: 1450 }}><thead><tr><th>Rede</th><th className="is-right">Clientes</th><th className="is-right">Participação</th><th className="is-right">Meta Redes</th><th className="is-right">Meta Tops</th><th className="is-right">Faturado</th><th className="is-right">A faturar</th><th className="is-right">Total</th><th className="is-right">% Meta Redes</th><th className="is-right">% Meta Tops</th><th className="is-right">Gap</th></tr></thead><tbody>{networks.rows.map(row => {
        const topAchievement = row.topTarget && row.topTarget > 0 ? row.realized / row.topTarget : null;
        const inputValue = draftTargets[row.network] ?? (row.networkTarget === null ? '' : String(row.networkTarget));
        return <tr key={row.network}><td className="is-strong">{row.network}</td><td className="is-right">{number.format(row.customers)}</td><td className="is-right">{percent.format(row.share)}</td><td className="is-right"><input className="panel-input panel-input-compact panel-input-currency" style={{ width: 145 }} type="number" min="0" step="0.01" disabled={manualTarget === null} value={inputValue} onChange={event => setDraftTargets(current => ({ ...current, [row.network]: event.target.value }))} onBlur={() => commitNetworkTarget(row.network)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></td><td className="is-right">{row.topTarget === null ? '—' : currency.format(row.topTarget)}</td><td className="is-right is-blue">{currency.format(row.invoiced)}</td><td className="is-right is-green">{currency.format(row.toInvoice)}</td><td className="is-right is-strong">{currency.format(row.realized)}</td><td className="is-right">{percentValue(row.achievement)}</td><td className="is-right">{percentValue(topAchievement)}</td><td className={`is-right${row.gap !== null && row.gap > 0 ? ' is-red' : ' is-green'}`}>{row.gap === null ? '—' : currency.format(row.gap)}</td></tr>;
      })}</tbody></table></div>
    </PanelCard>
  </>;
}

function VendorTable({ rows }: { rows: SellOutRow[] }) { return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>RCA</th><th>Cód. atual</th><th>Cód. antigo</th><th>Meta</th><th>Faturado</th><th>A faturar</th><th>Total</th><th>Clientes positivos</th><th>Positivação</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.rcaName ?? row.label}</td><td>{row.rcaCurrentCode ?? row.rawRcaCode ?? '—'}</td><td>{row.rcaLegacyCode ?? '—'}</td><td>{currency.format(row.salesTarget)}</td><td>{currency.format(row.invoiced)}</td><td>{currency.format(row.toInvoice)}</td><td>{currency.format(row.realized)}</td><td>{number.format(row.positiveCustomers)}</td><td>{percentValue(row.positivityAchievement)}</td><td>{row.resolutionStatus}</td></tr>)}</tbody></table></div>; }

function RcaReconciliation({ model, m2, m3 }: { model: SellOutViewModel; m2: CanonicalList; m3: CanonicalList }) {
  const diagnostics = useMemo(() => {
    const customers = new Map<string, Record<string, unknown>>();
    for (const customer of m2.records) { const cnpj = textValue(customer.cnpj); if (cnpj && !customers.has(cnpj)) customers.set(cnpj, customer); }

    const salesPending = model.vendorRows.flatMap(row => {
      if (row.resolutionStatus !== 'UNRESOLVED') return [];
      const code = row.rawRcaCode ?? 'SEM_RCA';
      const sales = m3.records.filter(fact => fact.fact_type === 'SALE' && !textValue(fact.rca_canonical_id) && (textValue(fact.transaction_rca_code) ?? 'SEM_RCA') === code);
      if (!sales.length) return [];
      const samples = new Map<string, string>();
      for (const sale of sales) {
        const cnpj = textValue(sale.cnpj);
        if (!cnpj || samples.has(cnpj)) continue;
        const customer = customers.get(cnpj);
        const name = textValue(customer?.trade_name) ?? textValue(customer?.customer_name) ?? cnpj;
        samples.set(cnpj, `${name} · ${cnpj}`);
        if (samples.size >= 5) break;
      }
      return [{ kind: 'NOVOS RCAS', code, rca: row.rcaName ?? null, supervisor: row.supervisorName ?? null, reason: 'Venda no 8022 sem RCA atual resolvido', salesTarget: row.salesTarget, positivityTarget: row.positivityTarget, saleLines: sales.length, realized: row.realized, action: 'Atualizar NOVOS RCAS', samples: [...samples.values()] }];
    });

    const unresolvedTargets = m3.records.flatMap(fact => {
      if (fact.fact_type !== 'TARGET' || textValue(fact.rca_canonical_id)) return [];
      const salesTarget = numericValue(fact.sales_target);
      const positivityTarget = numericValue(fact.positivity_target);
      if (salesTarget <= 0 && positivityTarget <= 0) return [];
      return [{ kind: 'NOVOS RCAS', code: textValue(fact.transaction_rca_code) ?? 'SEM_RCA', rca: null, supervisor: null, reason: 'Meta ativa na Bússola sem RCA correspondente no master atual', salesTarget, positivityTarget, saleLines: 0, realized: 0, action: 'Atualizar NOVOS RCAS', samples: [] as string[] }];
    });

    const targetsByCanonical = new Map<string, { salesTarget: number; positivityTarget: number }>();
    for (const fact of m3.records) {
      if (fact.fact_type !== 'TARGET') continue;
      const id = textValue(fact.rca_canonical_id);
      if (!id) continue;
      const current = targetsByCanonical.get(id) ?? { salesTarget: 0, positivityTarget: 0 };
      current.salesTarget += numericValue(fact.sales_target);
      current.positivityTarget += numericValue(fact.positivity_target);
      targetsByCanonical.set(id, current);
    }

    const activeRcas = new Map<string, { code: string; name: string | null; supervisor: string | null }>();
    for (const customer of m2.records) {
      const id = textValue(customer.rca_canonical_id);
      if (!id || activeRcas.has(id)) continue;
      activeRcas.set(id, { code: textValue(customer.rca_current_code) ?? id.replace(/^RCA:/, ''), name: textValue(customer.rca_name), supervisor: textValue(customer.coordinator_name) });
    }
    const bussolaPending = [...activeRcas.entries()].flatMap(([id, rca]) => {
      const target = targetsByCanonical.get(id);
      if (target && (target.salesTarget > 0 || target.positivityTarget > 0)) return [];
      return [{ kind: 'BÚSSOLA', code: rca.code, rca: rca.name, supervisor: rca.supervisor, reason: target ? 'RCA ativo em NOVOS RCAS com meta zerada na Bússola' : 'RCA ativo em NOVOS RCAS sem linha de meta na Bússola', salesTarget: target?.salesTarget ?? 0, positivityTarget: target?.positivityTarget ?? 0, saleLines: 0, realized: 0, action: 'Atualizar Bússola', samples: [] as string[] }];
    });

    const dedup = new Map<string, (typeof salesPending)[number] | (typeof unresolvedTargets)[number] | (typeof bussolaPending)[number]>();
    for (const item of [...salesPending, ...unresolvedTargets, ...bussolaPending]) dedup.set(`${item.action}|${item.code}|${item.reason}`, item);
    return [...dedup.values()];
  }, [model, m2, m3]);

  if (!diagnostics.length) return null;
  return <PanelCard><PanelSectionHeader eyebrow="CONCILIAÇÃO RCA" title="Pendências entre 8022, NOVOS RCAS e Bússola" description="Regra oficial: Bússola zerada + RCA fora de NOVOS RCAS é inativo e não aparece. Meta ativa sem RCA exige ajuste em NOVOS RCAS. RCA ativo sem meta ou com meta zerada exige ajuste na Bússola." /><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>RCA</th><th>Cód.</th><th>Supervisor</th><th>Diagnóstico</th><th>Meta venda</th><th>Meta posit.</th><th>Linhas SALE</th><th>Sell Out</th><th>Ação</th><th>Referência</th></tr></thead><tbody>{diagnostics.map((item, index) => <tr key={`${item.action}:${item.code}:${index}`}><td>{item.rca ?? '—'}</td><td><strong>{item.code}</strong></td><td>{item.supervisor ?? '—'}</td><td>{item.reason}</td><td>{currency.format(item.salesTarget)}</td><td>{number.format(item.positivityTarget)}</td><td>{number.format(item.saleLines)}</td><td>{currency.format(item.realized)}</td><td><strong>{item.action}</strong></td><td>{item.samples.length ? item.samples.join(' | ') : '—'}</td></tr>)}</tbody></table></div></PanelCard>;
}

function Management({ model, m2, m3 }: { model: SellOutViewModel; m2: CanonicalList; m3: CanonicalList }) {
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
    <RcaReconciliation model={model} m2={m2} m3={m3} />
    <PanelCard><PanelSectionHeader eyebrow="GERENCIAL" title="Vendedores separados por supervisor" description="RCA inativo que ficou na Bússola com metas zeradas e não existe mais em NOVOS RCAS é retirado da visualização operacional." action={<div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label className="panel-muted">Supervisor <select value={supervisor} onChange={event => setSupervisor(event.target.value)}><option value="ALL">Todos</option>{supervisors.map(item => <option key={item.key} value={item.key}>{item.name ?? 'Sem supervisor'}{item.code ? ` · ${item.code}` : ''}</option>)}</select></label><label className="panel-muted">RCA <select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="ALL">Todos</option><option value="RESOLVED">Resolvidos</option><option value="UNRESOLVED">Pendentes</option></select></label></div>} /></PanelCard>
    {groups.map(group => <PanelCard key={group.code ?? group.name ?? 'SEM_SUPERVISOR'}><PanelSectionHeader eyebrow="SUPERVISOR" title={`${group.name ?? 'Sem supervisor'}${group.code ? ` · Cód. ${group.code}` : ''}`} description={`${number.format(group.rows.length)} RCA(s) nesta supervisão`} /><VendorTable rows={group.rows} /></PanelCard>)}
  </>;
}

export function SellOutPage({ view = 'resumo' }: { view?: SellOutView }) {
  const { activeCanonical } = useData(); const [lists, setLists] = useState<{ m1: CanonicalList; m2: CanonicalList; m3: CanonicalList } | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!activeCanonical) { setLists(null); return; } let live = true; setLists(null); setError(''); Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M2_CLIENTE_RCA'), loadCandidateList('M3_MOVIMENTO_VENDAS')]).then(([m1, m2, m3]) => { if (live) setLists({ m1, m2, m3 }); }).catch(reason => { if (live) setError(String(reason)); }); return () => { live = false; }; }, [activeCanonical]);
  if (!activeCanonical) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Não existe fallback legado para esta tela." /></PanelPage>;
  if (error) return <PanelPage title="Sell Out"><PanelAlert tone="error">Erro ao carregar o bundle ativo: {error}</PanelAlert></PanelPage>;
  if (!lists) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Carregando bundle canônico" description="Leitura passiva de M1, M2 e M3; nenhum parser ou motor é acionado." /></PanelPage>;
  const baseModel = buildSellOutViewModel(lists);
  const canonicalModel: SellOutViewModel = { ...baseModel, motorBuildId: activeCanonical.motorBuildId, stagingManifestHash: activeCanonical.stagingManifestHash };
  const dashboard = buildSellOutDashboardModel({ base: canonicalModel, m1: lists.m1, m3: lists.m3, targets: sellOutTargets() });
  const model = dashboard.operationalModel;
  return <PanelPage title="Sell Out"><div className="panel-stack sellout-page-stack"><Alerts model={model} />{view === 'redes' ? <Networks model={model} m2={lists.m2} m3={lists.m3} /> : view === 'gerencial' ? <Management model={model} m2={lists.m2} m3={lists.m3} /> : <Summary dashboard={dashboard} />}</div></PanelPage>;
}
