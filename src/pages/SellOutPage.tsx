import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildSellOutViewModel, buildTopNetworksViewModel, type SellOutRow, type SellOutViewModel } from '../canonical/operationalViewModels';
import { exportSellOutExcel, exportSellOutJson, exportTopNetworksExcel, exportTopNetworksJson } from '../canonical/operationalExporters';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelAlert, PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import './SellOutPage.css';

export const SELL_OUT_TABS = [{ id: 'resumo', label: 'Resumo' }, { id: 'redes', label: 'Redes' }, { id: 'gerencial', label: 'Gerencial' }];
export type SellOutView = (typeof SELL_OUT_TABS)[number]['id'];
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('pt-BR');
const percentValue = (input: number | null) => input === null ? '—' : percent.format(input);
const textValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numericValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const isIsoDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

function Alerts({ model }: { model: SellOutViewModel }) { return <>{model.audits.map(audit => <PanelAlert key={audit.code} tone="warning"><strong>{audit.code}</strong> — {audit.message} {audit.code === 'UNRESOLVED_RCA_IN_VIEW' ? ' O código antigo pode estar vazio; esta pendência significa que existe venda do 8022 sem RCA atual resolvido em NOVOS RCAS. Veja Gerencial → Conciliação RCA.' : audit.action}</PanelAlert>)}</>; }

function Summary({ model, m3 }: { model: SellOutViewModel; m3: CanonicalList }) {
  const daily = useMemo(() => {
    const totalPositivation = new Map<string, Set<string>>();
    const invoicedPositivation = new Map<string, Set<string>>();
    for (const fact of m3.records) {
      if (fact.fact_type !== 'SALE') continue;
      const date = textValue(fact.event_date);
      if (!isIsoDate(date)) continue;
      const customer = textValue(fact.customer_canonical_id) ?? textValue(fact.cnpj);
      if (!customer) continue;
      const totalSet = totalPositivation.get(date!) ?? new Set<string>();
      totalSet.add(customer);
      totalPositivation.set(date!, totalSet);
      if ((textValue(fact.order_status) ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() !== 'A FATURAR') {
        const invoicedSet = invoicedPositivation.get(date!) ?? new Set<string>();
        invoicedSet.add(customer);
        invoicedPositivation.set(date!, invoicedSet);
      }
    }
    return model.dailyRows
      .filter(row => isIsoDate(row.date))
      .map(row => ({ date: row.date, invoiced: row.invoiced, toInvoice: row.toInvoice, total: row.realized, invoicedPositivation: invoicedPositivation.get(row.date)?.size ?? 0, totalPositivation: totalPositivation.get(row.date)?.size ?? 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [model.dailyRows, m3]);
  const latest = daily.at(-1);
  const latestLabel = latest ? new Date(`${latest.date}T12:00:00`).toLocaleDateString('pt-BR') : '—';

  return <>
    <div className="panel-grid sellout-kpi-strip"><PanelKpi label="Faturado" value={currency.format(model.totals.invoiced)} tone="green" detail="Pedidos faturados" /><PanelKpi label="A faturar" value={currency.format(model.totals.toInvoice)} tone="amber" detail="Pedidos pendentes" /><PanelKpi label="Sell Out" value={currency.format(model.totals.realized)} tone="blue" detail={`${number.format(model.sourceFacts.sales)} movimentos`} /><PanelKpi label="Meta de vendas" value={currency.format(model.totals.salesTarget)} tone="purple" detail={`Atingimento ${percentValue(model.totals.salesAchievement)}`} /><PanelKpi label="Clientes positivos" value={number.format(model.totals.positiveCustomers)} detail={`Meta ${number.format(model.totals.positivityTarget)} · ${percentValue(model.totals.positivityAchievement)}`} /><PanelKpi label="Dias com venda" value={number.format(model.totals.daysWithSales)} detail="Dias movimentados" /></div>
    <PanelCard><PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel. A abertura sempre inicia no último dia válido do acompanhamento." action={<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span className="panel-badge">ÚLTIMO MOVIMENTO · {latestLabel}</span><button className="panel-button" onClick={() => exportSellOutExcel(model)}>Exportar Excel</button><button className="panel-button" onClick={() => exportSellOutJson(model)}>Exportar JSON</button></div>} />{daily.length ? <DailyMovementWindow data={daily} /> : <PanelEmptyState title="Sem movimento diário válido" description="As vendas permanecem no total do período, mas não existe data válida para montar a série diária." />}</PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="VENDA POR LINHA" title="Leitura por linhas" description="A estrutura fica abaixo do acompanhamento diário. As linhas comerciais oficiais ainda não foram definidas; nenhuma classificação nova será inventada nesta etapa." /><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Linha</th><th>Faturado</th><th>A faturar</th><th>Sell Out</th><th>Participação</th><th>Status</th></tr></thead><tbody>{model.salesByLine.map(row => <tr key={row.line}><td>{row.line}</td><td>{currency.format(row.invoiced)}</td><td>{currency.format(row.toInvoice)}</td><td>{currency.format(row.realized)}</td><td>{percent.format(row.share)}</td><td>{row.resolutionStatus}</td></tr>)}</tbody></table></div></PanelCard>
  </>;
}

function Networks({ model, m2, m3 }: { model: SellOutViewModel; m2: CanonicalList; m3: CanonicalList }) { const built = buildTopNetworksViewModel({ m2, m3, generatedAt: model.generatedAt }); const networks = { ...built, motorBuildId: model.motorBuildId, stagingManifestHash: model.stagingManifestHash, teamRows: model.vendorRows }; return <>
  <div className="panel-grid panel-grid-auto"><PanelKpi label="Redes com venda" value={number.format(networks.totals.networks)} tone="purple" detail="Somente clientes que pertencem a uma rede" /><PanelKpi label="Clientes vinculados" value={number.format(networks.totals.customers)} detail="CNPJ positivo com rede" /><PanelKpi label="Total nas redes" value={currency.format(networks.totals.realized)} tone="blue" detail="Clientes sem rede ficam naturalmente fora desta visão" /><PanelKpi label="Meta de redes" value="—" detail="Parâmetro manual não estava materializado no backup" /></div>
  <PanelCard><PanelSectionHeader eyebrow="TOP REDES" title="Realizado por rede" description="Rede vem de M2. Cliente sem rede não é erro e não é forçado para nenhuma rede." action={<><button className="panel-button" onClick={() => exportTopNetworksExcel(networks)}>Exportar Excel</button> <button className="panel-button" onClick={() => exportTopNetworksJson(networks)}>Exportar JSON</button></>} /><div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Rede</th><th>Clientes</th><th>Faturado</th><th>A faturar</th><th>Total</th><th>Participação</th><th>Status</th></tr></thead><tbody>{networks.rows.map(row => <tr key={row.network}><td>{row.network}</td><td>{number.format(row.customers)}</td><td>{currency.format(row.invoiced)}</td><td>{currency.format(row.toInvoice)}</td><td>{currency.format(row.realized)}</td><td>{percent.format(row.share)}</td><td>{row.resolutionStatus}</td></tr>)}</tbody></table></div></PanelCard>
</>; }

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
  if (!lists) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Carregando bundle canônico" description="Leitura passiva de M2 e M3; nenhum parser ou motor é acionado." /></PanelPage>;
  const baseModel = buildSellOutViewModel(lists);
  const model: SellOutViewModel = { ...baseModel, motorBuildId: activeCanonical.motorBuildId, stagingManifestHash: activeCanonical.stagingManifestHash };
  return <PanelPage title="Sell Out"><div className="panel-stack sellout-page-stack"><Alerts model={model} />{view === 'redes' ? <Networks model={model} m2={lists.m2} m3={lists.m3} /> : view === 'gerencial' ? <Management model={model} m2={lists.m2} m3={lists.m3} /> : <Summary model={model} m3={lists.m3} />}</div></PanelPage>;
}
