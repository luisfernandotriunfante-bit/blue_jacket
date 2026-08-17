import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtPct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const fmtPct2 = (value: number) => `${((value || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fmtDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function completedBusinessDays(periodStart: string, updatedAt: string, holidays: string[]) {
  if (!periodStart || !updatedAt) return 0;
  const [year, month, day] = periodStart.split('-').map(Number);
  const start = new Date(year, month - 1, day, 12, 0, 0, 0);
  const updated = new Date(updatedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(updated.getTime())) return 0;
  const end = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate() - 1, 12, 0, 0, 0);
  const holidaySet = new Set(holidays || []);
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6 && !holidaySet.has(localIso(cursor))) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

type TabId = 'resumo' | 'redes' | 'gerencial';
type MetricRow = { label: string; value: string; detail?: string; accent?: boolean; };
type NetworkPanelRow = { key: string; name: string; target: number; invoiced: number; toInvoice: number; total: number; invoicedTrend: number; totalTrend: number; clients: number; };

function QuickMetric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return <div style={{ minWidth: 0, padding: '3px 16px 4px', borderLeft: '2px solid rgba(239,51,64,0.52)' }}><div style={{ color: 'var(--panel-muted)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div><div style={{ color: accent ? 'var(--panel-red)' : 'var(--panel-text)', fontSize: 'clamp(0.98rem, 1.6vw, 1.28rem)', fontWeight: 820, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>{detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.66rem', marginTop: '5px', lineHeight: 1.25 }}>{detail}</div> : null}</div>;
}

function MetricColumn({ title, rows }: { title: string; rows: MetricRow[] }) {
  return <section style={{ minWidth: 0, padding: '2px 22px 2px 18px', borderLeft: '2px solid rgba(239,51,64,0.46)' }}><div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.095em', textTransform: 'uppercase', marginBottom: '8px' }}>{title}</div><div>{rows.map((row, index) => <div key={`${title}-${row.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '16px', alignItems: 'center', padding: '9px 0', borderTop: index === 0 ? '1px solid rgba(255,255,255,0.085)' : '1px solid rgba(255,255,255,0.055)' }}><div style={{ minWidth: 0 }}><div style={{ color: 'var(--panel-text-dim)', fontSize: '0.69rem', fontWeight: 720 }}>{row.label}</div>{row.detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.64rem', marginTop: '2px', lineHeight: 1.25 }}>{row.detail}</div> : null}</div><div style={{ color: row.accent ? 'var(--panel-red)' : 'var(--panel-text)', fontSize: '0.85rem', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.value}</div></div>)}</div></section>;
}

function NetworkCard({ network, featured = false }: { network: NetworkPanelRow; featured?: boolean }) {
  const coverage = (value: number) => network.target > 0 ? value / network.target : 0;
  const rows = [
    { label: 'Meta Mês', value: network.target, pct: null as number | null },
    { label: 'Acum. Mês Faturado', value: network.invoiced, pct: coverage(network.invoiced) },
    { label: 'Tendência Faturado', value: network.invoicedTrend, pct: coverage(network.invoicedTrend) },
    { label: 'Acum. Mês Venda', value: network.total, pct: coverage(network.total) },
    { label: 'Tendência Venda', value: network.totalTrend, pct: coverage(network.totalTrend) },
  ];
  return <PanelCard style={{ padding: 0, overflow: 'hidden', border: featured ? '1px solid rgba(239,51,64,0.34)' : undefined }}>
    <div style={{ padding: '14px 18px', background: featured ? 'rgba(239,51,64,0.12)' : 'rgba(255,255,255,0.035)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}><strong style={{ color: 'white', fontSize: featured ? '0.9rem' : '0.82rem', letterSpacing: '0.035em', textTransform: 'uppercase' }}>{network.name}</strong><span style={{ color: 'var(--panel-muted)', fontSize: '0.67rem', whiteSpace: 'nowrap' }}>{network.clients ? `${fmtInt(network.clients)} clientes` : 'Consolidado'}</span></div></div>
    <div style={{ padding: '6px 18px 12px' }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 1fr) minmax(120px, auto) 92px', gap: '12px', padding: '7px 0', color: 'var(--panel-muted)', fontSize: '0.61rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.055em' }}><span>Indicador</span><span style={{ textAlign: 'right' }}>Valor</span><span style={{ textAlign: 'right' }}>% Cob. Meta</span></div>{rows.map((row, index) => { const below = row.pct !== null && row.pct < 1; return <div key={row.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 1fr) minmax(120px, auto) 92px', gap: '12px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.055)' }}><span style={{ color: index === 0 ? 'white' : 'var(--panel-text-dim)', fontSize: '0.7rem', fontWeight: index === 0 ? 780 : 650 }}>{row.label}</span><span style={{ color: index === 0 ? '#fde047' : 'white', textAlign: 'right', fontSize: '0.78rem', fontWeight: index === 0 ? 850 : 760, whiteSpace: 'nowrap' }}>{fmtBRL(row.value)}</span><span style={{ color: row.pct === null ? 'var(--panel-muted)' : below ? '#fca5a5' : '#86efac', textAlign: 'right', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{row.pct === null ? '—' : fmtPct2(row.pct)}</span></div>; })}</div>
  </PanelCard>;
}

export function SellOutPage() {
  const { canonical, sellOut } = useData(); const [activeTab, setActiveTab] = useState<TabId>('resumo');
  if (!canonical && !sellOut) return <PanelPage title="Sell Out"><PanelEmptyState icon="▥" title="Nenhum relatório de vendas carregado" description="Vá em Configurações e processe o vendas-8022 para iniciar a visão gerencial." /></PanelPage>;
  const total = canonical?.sellOut.total ?? sellOut?.vendaTotal ?? 0;
  const tabs: { id: TabId; label: string }[] = [{ id: 'resumo', label: 'Resumo' }, { id: 'redes', label: 'Redes' }, { id: 'gerencial', label: 'Gerencial' }];
  return <PanelPage title="Sell Out" metricLabel="Total do período" metricValue={fmtBRL(total)}><div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '22px' }}>{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '3px solid var(--panel-accent, #e31b2d)' : '3px solid transparent', color: activeTab === tab.id ? '#ef3340' : 'var(--panel-muted)', padding: '12px 16px', fontWeight: 750, cursor: 'pointer' }}>{tab.label}</button>)}</div>{activeTab === 'resumo' ? <Resumo /> : activeTab === 'redes' ? <Redes /> : <Gerencial />}</PanelPage>;
}

function Resumo() {
  const { canonical, sellOut } = useData(); const summary = canonical?.sellOut;
  const faturado = summary?.invoiced ?? sellOut?.faturadoTotal ?? 0; const aFaturar = summary?.toInvoice ?? sellOut?.aFaturarTotal ?? 0; const total = summary?.total ?? sellOut?.vendaTotal ?? 0; const positivacao = summary?.totalPositivation ?? sellOut?.positivacaoTotal ?? 0;
  const daily = canonical?.daily ?? (sellOut?.diasDeVenda || []).map(day => ({ date: day.data, invoiced: day.faturado, toInvoice: Math.max(day.venda - day.faturado, 0), total: day.venda, invoicedPositivation: day.positivacao, totalPositivation: day.positivacao }));
  const latest = [...daily].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return <div style={{ display: 'grid', gap: '22px' }}><PanelCard style={{ paddingTop: '18px', paddingBottom: '18px' }}><PanelSectionHeader eyebrow="LEITURA RÁPIDA" title="Dia e acumulado" description="Somente os números essenciais antes da movimentação." action={latest ? <span className="panel-badge">ATUALIZADO · {fmtDate(latest.date)}</span> : undefined}/><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', rowGap: '18px', marginTop: '14px' }}><QuickMetric label="Sell Out hoje" value={fmtBRL(latest?.total || 0)} /><QuickMetric label="Faturado hoje" value={fmtBRL(latest?.invoiced || 0)} /><QuickMetric label="A faturar hoje" value={fmtBRL(latest?.toInvoice || 0)} /><QuickMetric label="Positivação hoje" value={fmtInt(latest?.totalPositivation || 0)} /><QuickMetric label="Sell Out mês" value={fmtBRL(total)} accent /><QuickMetric label="Faturado mês" value={fmtBRL(faturado)} /><QuickMetric label="A faturar mês" value={fmtBRL(aFaturar)} /><QuickMetric label="Positivação mês" value={fmtInt(positivacao)} /></div></PanelCard><PanelCard><PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel e o mesmo controle de datas." /><DailyMovementWindow data={daily} /></PanelCard>{canonical ? <LineSummary /> : null}</div>;
}

function Redes() {
  const { canonical, manualConfig } = useData();
  if (!canonical) return <PanelEmptyState icon="▦" title="Redes indisponíveis" description="Carregue a base canônica com Premissas, TOP REDES e Vendas 8022 para consolidar o resultado por rede." />;
  const s = canonical.sellOut;
  const totalDays = s.businessDaysTotal;
  const calculatedWorkedDays = completedBusinessDays(canonical.periodStart, canonical.generatedAt, manualConfig.holidays);
  const workedDays = calculatedWorkedDays > 0 ? calculatedWorkedDays : s.businessDaysElapsed;
  const trend = (value: number) => workedDays > 0 ? (value / workedDays) * totalDays : 0;
  const topNetworks = [...canonical.networks].filter(network => network.networkTarget > 0).sort((a, b) => b.networkTarget - a.networkTarget || b.total - a.total).slice(0, 5).map(network => ({ key: network.key, name: network.name, target: network.networkTarget, invoiced: network.invoiced, toInvoice: network.toInvoice, total: network.total, invoicedTrend: trend(network.invoiced), totalTrend: trend(network.total), clients: network.clients }));
  if (!topNetworks.length) return <PanelEmptyState icon="▦" title="Metas de redes não encontradas" description="As redes existem na base, mas ainda não há metas operacionais configuradas para montar o Top 5." />;
  const topFive: NetworkPanelRow = topNetworks.reduce<NetworkPanelRow>((acc, network) => ({ ...acc, target: acc.target + network.target, invoiced: acc.invoiced + network.invoiced, toInvoice: acc.toInvoice + network.toInvoice, total: acc.total + network.total, invoicedTrend: acc.invoicedTrend + network.invoicedTrend, totalTrend: acc.totalTrend + network.totalTrend, clients: acc.clients + network.clients }), { key: 'TOP-5', name: 'TOP 5 REDES', target: 0, invoiced: 0, toInvoice: 0, total: 0, invoicedTrend: 0, totalTrend: 0, clients: 0 });
  return <div style={{ display: 'grid', gap: '22px' }}><PanelCard><PanelSectionHeader eyebrow="REDES" title="Acompanhamento das Top 5 Redes" description="Tendência conforme a planilha padrão: acumulado ÷ dias trabalhados × dias úteis do mês. Venda = Faturado + A Faturar." action={<span className="panel-badge">DIAS ÚTEIS · {totalDays} · TRABALHADOS · {workedDays}</span>} /><div style={{ marginTop: '16px' }}><NetworkCard network={topFive} featured /></div></PanelCard><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(390px, 1fr))', gap: '14px' }}>{topNetworks.map(network => <NetworkCard key={network.key} network={network} />)}</div></div>;
}

function ManagerialSummary() {
  const { canonical } = useData(); if (!canonical) return null;
  const s = canonical.sellOut; const h = canonical.history;
  const dailyTarget = s.businessDaysTotal > 0 ? s.sellOutTarget / s.businessDaysTotal : 0; const dailyCoverage = dailyTarget > 0 ? s.totalDailyAverage / dailyTarget : 0;
  const positivityDailyTarget = s.businessDaysTotal > 0 ? s.industryPositivityTarget / s.businessDaysTotal : 0; const positivityDailyCurrent = s.businessDaysElapsed > 0 ? s.totalPositivation / s.businessDaysElapsed : 0; const positivityDailyNeeded = s.businessDaysRemaining > 0 ? Math.max(s.industryPositivityTarget - s.totalPositivation, 0) / s.businessDaysRemaining : Math.max(s.industryPositivityTarget - s.totalPositivation, 0);
  const lastYear = h?.sameMonthLastYear ?? null; const avg3 = h?.average3ClosedMonths ?? null; const compare = (base:number|null) => base && base > 0 ? fmtPct((s.invoicedTrend / base) - 1) : '—';
  return <PanelCard><PanelSectionHeader eyebrow="GERENCIAL" title="Acompanhamento do mês" description="Leitura concentrada do diário, fechamento mensal e positivação, sem repetir cards grandes." /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))', gap: '12px', marginTop: '16px' }}><MetricColumn title="Sell Out diário" rows={[{ label: 'Meta · venda média diária', value: fmtBRL(dailyTarget), detail: 'Meta T&C ÷ dias úteis do mês' },{ label: 'Venda média diária', value: fmtBRL(s.totalDailyAverage), detail: `${fmtPct(dailyCoverage)} da meta diária`, accent: dailyCoverage < 1 },{ label: 'Venda média diária necessária', value: fmtBRL(s.neededDailyAverage), detail: `${s.businessDaysRemaining} dias úteis restantes` }]}/><MetricColumn title="Sell Out mês" rows={[{ label: 'Meta mês', value: fmtBRL(s.sellOutTarget) },{ label: 'Acum. mês faturado', value: fmtBRL(s.invoiced), detail: s.sellOutTarget > 0 ? `${fmtPct(s.invoiced / s.sellOutTarget)} da meta` : 'Meta T&C não informada' },{ label: 'Tendência faturado', value: fmtBRL(s.invoicedTrend), detail: s.sellOutTarget > 0 ? `${fmtPct(s.invoicedTrend / s.sellOutTarget)} da meta` : undefined },{ label: 'Acum. mês venda', value: fmtBRL(s.total), detail: s.sellOutTarget > 0 ? `${fmtPct(s.attainment)} da meta` : 'Meta T&C não informada' },{ label: 'Tendência venda', value: fmtBRL(s.totalTrend), detail: s.sellOutTarget > 0 ? `${fmtPct(s.totalTrend / s.sellOutTarget)} da meta` : undefined, accent: s.sellOutTarget > 0 && s.totalTrend < s.sellOutTarget },{ label: 'Dias úteis', value: `${s.businessDaysElapsed}/${s.businessDaysTotal}`, detail: `${s.businessDaysRemaining} restantes` }]}/><MetricColumn title="Positivação" rows={[{ label: 'Meta', value: fmtInt(s.industryPositivityTarget) },{ label: 'Realizado total', value: fmtInt(s.totalPositivation), detail: `${fmtPct(s.positivityAttainment)} da meta`, accent: s.positivityAttainment < 1 },{ label: 'Positivação faturada', value: fmtInt(s.invoicedPositivation) },{ label: 'Meta média diária', value: positivityDailyTarget.toFixed(1) },{ label: 'Média diária atual', value: positivityDailyCurrent.toFixed(1) },{ label: 'Necessário por dia', value: positivityDailyNeeded.toFixed(1), detail: `${s.businessDaysRemaining} dias úteis restantes` }]}/></div><div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.075)' }}><div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '8px' }}>Comparativos históricos</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}><QuickMetric label="Mesmo mês ano anterior" value={lastYear !== null ? fmtBRL(lastYear) : 'Histórico não carregado'} detail={`Vs. tendência faturada: ${compare(lastYear)}`} /><QuickMetric label="Média dos 3 meses" value={avg3 !== null ? fmtBRL(avg3) : 'Histórico não carregado'} detail={`Vs. tendência faturada: ${compare(avg3)}`} /></div>{h?.average3MonthKeys?.length ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.67rem', marginTop: '9px' }}>Média móvel baseada em {h.average3MonthKeys.join(' · ')}.</div> : null}</div></PanelCard>;
}

function LineSummary() {
  const { canonical } = useData(); if (!canonical) return null;
  return <PanelCard><PanelSectionHeader eyebrow="SELL OUT POR LINHA" title="Resultado das cinco linhas comerciais" description="Classificação feita pela base de produtos/EAN e usada também nos documentos gerados." /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px' }}>{canonical.lines.map(line => <div key={line.name} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px', background: 'rgba(255,255,255,0.025)' }}><div style={{ color: '#ef3340', fontSize: '0.68rem', fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{line.name}</div><div style={{ color: 'white', fontSize: '1.12rem', fontWeight: 800, marginTop: '8px' }}>{fmtBRL(line.total)}</div><div style={{ color: 'var(--panel-muted)', fontSize: '0.72rem', marginTop: '5px' }}>Meta {fmtBRL(line.target)} · {fmtPct(line.attainment)}</div></div>)}</div></PanelCard>;
}

function Gerencial() {
  const { canonical, sellOut } = useData(); const coordinators = canonical?.coordinators || []; const vendors = canonical?.vendors || []; const legacyCoordinators = sellOut?.coordenadores || []; const hasCanonical = Boolean(canonical);
  const rows = useMemo(() => { if (hasCanonical) return coordinators.map(coord => ({ name: coord.name, target: coord.salesTarget, invoiced: coord.invoiced, toInvoice: coord.toInvoice, total: coord.total, attainment: coord.attainment, positivity: coord.totalPositivation, positivityTarget: coord.positivityTarget })); return legacyCoordinators.map(coord => ({ name: coord.nomeCoord, target: 0, invoiced: coord.faturado, toInvoice: coord.aFaturar, total: coord.faturado + coord.aFaturar, attainment: 0, positivity: coord.positivacao, positivityTarget: 0 })); }, [hasCanonical, coordinators, legacyCoordinators]);
  return <div style={{ display: 'grid', gap: '22px' }}>{canonical ? <ManagerialSummary /> : null}<PanelCard><PanelSectionHeader eyebrow="COORDENAÇÃO" title="Resultado gerencial" description="Consolidação das equipes usando metas da Bússola e movimentos do 8022." /><div style={{ overflowX: 'auto', marginTop: '14px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}><thead><tr>{['Coordenador','Meta','Faturado','A Faturar','Total','% Meta','Pos. Total','Meta Pos.'].map((heading, index) => <th key={heading} style={{ padding: '10px 12px', textAlign: index === 0 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.68rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td style={{ padding: '11px 12px', color: 'white', fontWeight: 700 }}>{row.name}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.target ? fmtBRL(row.target) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtBRL(row.invoiced)}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtBRL(row.toInvoice)}</td><td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 750 }}>{fmtBRL(row.total)}</td><td style={{ padding: '11px 12px', textAlign: 'right', color: '#ef3340' }}>{row.target ? fmtPct(row.attainment) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtInt(row.positivity)}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.positivityTarget ? fmtInt(row.positivityTarget) : '—'}</td></tr>)}</tbody></table></div></PanelCard>{canonical ? <PanelCard><PanelSectionHeader eyebrow="VENDEDORES" title="Ritmo individual" description="Meta, realizado + a faturar, gap e positivação por vendedor." /><div style={{ overflowX: 'auto', marginTop: '14px', maxHeight: '560px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}><thead><tr>{['Coord.','Vendedor','Meta','Total','% Meta','Falta Meta','Pos.','Meta Pos.','Target Pos./Dia'].map((heading, index) => <th key={heading} style={{ position: 'sticky', top: 0, background: '#11161d', padding: '9px 10px', textAlign: index < 2 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.66rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead><tbody>{vendors.map(vendor => <tr key={`${vendor.newCode}-${vendor.oldCode}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}><td style={{ padding: '9px 10px', color: 'var(--panel-muted)' }}>{vendor.coordinatorName}</td><td style={{ padding: '9px 10px', color: 'white', fontWeight: 650 }}>{vendor.name}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtBRL(vendor.total)}</td><td style={{ padding: '9px 10px', textAlign: 'right', color: '#ef3340' }}>{fmtPct(vendor.attainment)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesGapToTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.totalPositivation)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.positivityTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{vendor.positivityDailyTarget.toFixed(1)}</td></tr>)}</tbody></table></div></PanelCard> : null}</div>;
}
