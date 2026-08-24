import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import {
  PanelAlert,
  PanelCard,
  PanelEmptyState,
  PanelInfoRow,
  PanelPage,
  PanelSectionHeader,
  PanelStat,
} from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtPct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const fmtPct2 = (value: number) => `${((value || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fmtDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const validIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

export type SellOutView = 'resumo' | 'redes' | 'gerencial';
export const SELL_OUT_TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'redes', label: 'Redes' },
  { id: 'gerencial', label: 'Gerencial' },
];
type MetricRow = { label: string; value: string; detail?: string; accent?: boolean; };
type NetworkPanelRow = { key: string; name: string; target: number; invoiced: number; toInvoice: number; total: number; invoicedTrend: number; totalTrend: number; clients: number; };

function QuickMetric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return (
    <div className="panel-quick-metric">
      <div className="panel-quick-label">{label}</div>
      <div className={`panel-quick-value${accent ? ' is-accent' : ''}`}>{value}</div>
      {detail ? <div className="panel-quick-detail">{detail}</div> : null}
    </div>
  );
}

function MetricColumn({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <div className="panel-stat">
      <div className="panel-eyebrow">{title}</div>
      <div style={{ marginTop: 8 }}>
        {rows.map((row, index) => (
          <PanelInfoRow
            key={`${title}-${row.label}-${index}`}
            label={<span>{row.label}{row.detail ? <span className="panel-muted" style={{ display: 'block', marginTop: 2, fontSize: 'var(--panel-font-caption)' }}>{row.detail}</span> : null}</span>}
            value={<span style={{ color: row.accent ? 'var(--panel-red)' : undefined }}>{row.value}</span>}
          />
        ))}
      </div>
    </div>
  );
}

function NetworkCard({ network, featured = false }: { network: NetworkPanelRow; featured?: boolean }) {
  const coverage = (value: number) => network.target > 0 ? value / network.target : 0;
  const rows = [
    { label: 'Meta mês', value: network.target, pct: null as number | null },
    { label: 'Acum. mês faturado', value: network.invoiced, pct: coverage(network.invoiced) },
    { label: 'A faturar', value: network.toInvoice, pct: null as number | null },
    { label: 'Tendência faturado', value: network.invoicedTrend, pct: coverage(network.invoicedTrend) },
    { label: 'Acum. mês venda', value: network.total, pct: coverage(network.total) },
    { label: 'Tendência venda', value: network.totalTrend, pct: coverage(network.totalTrend) },
  ];

  return (
    <PanelCard compact className={featured ? 'panel-kpi-red' : ''}>
      <PanelSectionHeader
        eyebrow={featured ? 'CONSOLIDADO' : 'REDE'}
        title={network.name}
        description={network.clients ? `${fmtInt(network.clients)} CNPJs na rede` : 'Consolidado'}
      />
      {rows.map((row, index) => {
        const below = row.pct !== null && row.pct < 1;
        const value = row.pct === null ? fmtBRL(row.value) : `${fmtBRL(row.value)} · ${fmtPct2(row.pct)}`;
        return <PanelInfoRow key={row.label} label={row.label} value={<span style={{ color: index === 0 ? 'var(--panel-amber-soft)' : below ? 'var(--panel-red-soft)' : undefined }}>{value}</span>} />;
      })}
    </PanelCard>
  );
}

export function SellOutPage({ view = 'resumo' }: { view?: SellOutView }) {
  const { canonical } = useData();
  const hasSalesSource = Boolean(canonical?.sources.some(source => source.kind === 'sales8022' && source.loaded));

  if (!canonical || !hasSalesSource) {
    return (
      <PanelPage title="Sell Out">
        <PanelEmptyState variant="page" title="Nenhum relatório de vendas carregado" description="Vá em Configurações e processe o Vendas 8022 para iniciar a visão gerencial." />
      </PanelPage>
    );
  }

  return (
    <PanelPage title="Sell Out" metricLabel="Total do período" metricValue={fmtBRL(canonical.sellOut.total)}>
      <div className="panel-stack">
        {view === 'resumo' ? <Resumo /> : view === 'redes' ? <Redes /> : <Gerencial />}
      </div>
    </PanelPage>
  );
}

function Resumo() {
  const { canonical } = useData();
  if (!canonical) return null;
  const summary = canonical.sellOut;
  // Protege também snapshots anteriores: uma data inválida nunca é forçada para dentro do calendário diário.
  const daily = canonical.daily.filter(day => validIsoDate(day.date));
  const latest = [...daily].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const dailyTotal = daily.reduce((sum, day) => sum + day.total, 0);
  const dailyDifference = summary.total - dailyTotal;

  return (
    <div className="panel-stack">
      <PanelCard compact>
        <PanelSectionHeader
          eyebrow="LEITURA RÁPIDA"
          title="Dia e acumulado"
          description="Somente os números essenciais antes da movimentação."
          action={latest ? <span className="panel-badge">ÚLTIMO MOVIMENTO · {fmtDate(latest.date)}</span> : undefined}
        />
        <div className="panel-quick-metrics">
          <QuickMetric label="Sell Out último dia" value={fmtBRL(latest?.total || 0)} />
          <QuickMetric label="Faturado último dia" value={fmtBRL(latest?.invoiced || 0)} />
          <QuickMetric label="A faturar último dia" value={fmtBRL(latest?.toInvoice || 0)} />
          <QuickMetric label="Positivação último dia" value={fmtInt(latest?.totalPositivation || 0)} />
          <QuickMetric label="Sell Out mês" value={fmtBRL(summary.total)} accent />
          <QuickMetric label="Faturado mês" value={fmtBRL(summary.invoiced)} />
          <QuickMetric label="A faturar mês" value={fmtBRL(summary.toInvoice)} />
          <QuickMetric label="Positivação mês" value={fmtInt(summary.totalPositivation)} />
        </div>
        {Math.abs(dailyDifference) > 0.01 ? <div style={{ marginTop: 14 }}><PanelAlert tone="warning">O Sell Out mensal contém {fmtBRL(Math.abs(dailyDifference))} que não fecha na série diária porque há movimento sem data válida na fonte. O valor permanece no total mensal e não foi atribuído artificialmente a nenhum dia.</PanelAlert></div> : null}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel e o mesmo controle de datas." />
        <DailyMovementWindow data={daily} />
      </PanelCard>

      <LineSummary />
    </div>
  );
}

function Redes() {
  const { canonical } = useData();
  if (!canonical) return null;
  const summary = canonical.sellOut;
  const trend = (value: number) => summary.businessDaysElapsed > 0 ? (value / summary.businessDaysElapsed) * summary.businessDaysTotal : 0;
  const sourceNetworks = canonical.networks.filter(network => network.networkTarget > 0);
  const topNetworks = [...sourceNetworks]
    .sort((a, b) => b.networkTarget - a.networkTarget || b.total - a.total)
    .slice(0, 5)
    .map(network => ({
      key: network.key,
      name: network.name,
      target: network.networkTarget,
      invoiced: network.invoiced,
      toInvoice: network.toInvoice,
      total: network.total,
      invoicedTrend: trend(network.invoiced),
      totalTrend: trend(network.total),
      clients: network.clients,
    }));

  if (!topNetworks.length) {
    return <PanelEmptyState title="Metas de redes não encontradas" description="As redes existem na base canônica, mas ainda não há metas operacionais configuradas para montar o Top 5." />;
  }

  const topFive = topNetworks.reduce<NetworkPanelRow>((acc, network) => ({
    ...acc,
    target: acc.target + network.target,
    invoiced: acc.invoiced + network.invoiced,
    toInvoice: acc.toInvoice + network.toInvoice,
    total: acc.total + network.total,
    invoicedTrend: acc.invoicedTrend + network.invoicedTrend,
    totalTrend: acc.totalTrend + network.totalTrend,
    clients: acc.clients + network.clients,
  }), { key: 'TOP-5', name: 'TOP 5 REDES', target: 0, invoiced: 0, toInvoice: 0, total: 0, invoicedTrend: 0, totalTrend: 0, clients: 0 });

  return (
    <div className="panel-stack">
      <PanelCard>
        <PanelSectionHeader
          eyebrow="REDES"
          title="Acompanhamento das Top 5 Redes"
          description="Tendência = acumulado ÷ dias trabalhados × dias úteis do mês. Venda = Faturado + A Faturar."
          action={<span className="panel-badge">DIAS ÚTEIS · {summary.businessDaysTotal} · TRABALHADOS · {summary.businessDaysElapsed}</span>}
        />
        <NetworkCard network={topFive} featured />
      </PanelCard>
      <div className="panel-grid panel-grid-2">
        {topNetworks.map(network => <NetworkCard key={network.key} network={network} />)}
      </div>
    </div>
  );
}

function ManagerialSummary() {
  const { canonical } = useData();
  if (!canonical) return null;
  const s = canonical.sellOut;
  const h = canonical.history;
  const hasSellOutTarget = s.sellOutTarget > 0;
  const hasPositivityTarget = s.industryPositivityTarget > 0;
  const dailyTarget = hasSellOutTarget && s.businessDaysTotal > 0 ? s.sellOutTarget / s.businessDaysTotal : 0;
  const dailyCoverage = dailyTarget > 0 ? s.totalDailyAverage / dailyTarget : null;
  const positivityDailyTarget = hasPositivityTarget && s.businessDaysTotal > 0 ? s.industryPositivityTarget / s.businessDaysTotal : 0;
  const positivityDailyCurrent = s.businessDaysElapsed > 0 ? s.totalPositivation / s.businessDaysElapsed : 0;
  const positivityGap = Math.max(s.industryPositivityTarget - s.totalPositivation, 0);
  const positivityDailyNeeded = hasPositivityTarget && s.businessDaysRemaining > 0 ? positivityGap / s.businessDaysRemaining : 0;
  const salesGap = Math.max(s.sellOutTarget - s.total, 0);
  const lastYear = h?.sameMonthLastYear ?? null;
  const avg3 = h?.average3ClosedMonths ?? null;
  const compare = (base: number | null) => base && base > 0 ? fmtPct((s.invoicedTrend / base) - 1) : '—';
  const neededSalesValue = !hasSellOutTarget || s.businessDaysRemaining <= 0 ? '—' : fmtBRL(s.neededDailyAverage);
  const neededSalesDetail = !hasSellOutTarget ? 'Meta T&C não informada' : s.businessDaysRemaining > 0 ? `Saldo de dias úteis: ${s.businessDaysRemaining}` : `Sem dias úteis restantes · falta final: ${fmtBRL(salesGap)}`;
  const neededPosValue = !hasPositivityTarget || s.businessDaysRemaining <= 0 ? '—' : positivityDailyNeeded.toFixed(1);
  const neededPosDetail = !hasPositivityTarget ? 'Meta de positivação não carregada' : s.businessDaysRemaining > 0 ? `Saldo de dias úteis: ${s.businessDaysRemaining}` : `Sem dias úteis restantes · falta final: ${fmtInt(positivityGap)}`;

  return (
    <PanelCard>
      <PanelSectionHeader eyebrow="GERENCIAL" title="Acompanhamento do mês" description="Mesma regra de dias trabalhados, tendência e metas em todas as visões." />
      <div className="panel-grid panel-grid-3">
        <MetricColumn title="Sell Out diário" rows={[
          { label: 'Meta · venda média diária', value: hasSellOutTarget ? fmtBRL(dailyTarget) : '—', detail: hasSellOutTarget ? 'Meta T&C ÷ dias úteis do mês' : 'Meta T&C não informada' },
          { label: 'Venda média diária', value: fmtBRL(s.totalDailyAverage), detail: dailyCoverage !== null ? `${fmtPct(dailyCoverage)} da meta diária` : 'Meta T&C não informada', accent: dailyCoverage !== null && dailyCoverage < 1 },
          { label: 'Venda média diária necessária', value: neededSalesValue, detail: neededSalesDetail },
        ]} />
        <MetricColumn title="Sell Out mês" rows={[
          { label: 'Meta mês', value: hasSellOutTarget ? fmtBRL(s.sellOutTarget) : '—', detail: hasSellOutTarget ? undefined : 'Meta T&C não informada' },
          { label: 'Acum. mês faturado', value: fmtBRL(s.invoiced), detail: hasSellOutTarget ? `${fmtPct(s.invoiced / s.sellOutTarget)} da meta` : 'Meta T&C não informada' },
          { label: 'Tendência faturado', value: fmtBRL(s.invoicedTrend), detail: hasSellOutTarget ? `${fmtPct(s.invoicedTrend / s.sellOutTarget)} da meta` : 'Meta T&C não informada' },
          { label: 'Acum. mês venda', value: fmtBRL(s.total), detail: hasSellOutTarget ? `${fmtPct(s.attainment)} da meta` : 'Meta T&C não informada' },
          { label: 'Tendência venda', value: fmtBRL(s.totalTrend), detail: hasSellOutTarget ? `${fmtPct(s.totalTrend / s.sellOutTarget)} da meta` : 'Meta T&C não informada', accent: hasSellOutTarget && s.totalTrend < s.sellOutTarget },
          { label: 'Dias trabalhados / úteis', value: `${s.businessDaysElapsed}/${s.businessDaysTotal}`, detail: `Saldo: ${s.businessDaysRemaining}` },
        ]} />
        <MetricColumn title="Positivação" rows={[
          { label: 'Meta', value: hasPositivityTarget ? fmtInt(s.industryPositivityTarget) : '—', detail: hasPositivityTarget ? undefined : 'Meta de positivação não carregada' },
          { label: 'Realizado total', value: fmtInt(s.totalPositivation), detail: hasPositivityTarget ? `${fmtPct(s.positivityAttainment)} da meta` : 'Meta de positivação não carregada', accent: hasPositivityTarget && s.positivityAttainment < 1 },
          { label: 'Positivação faturada', value: fmtInt(s.invoicedPositivation) },
          { label: 'Meta média diária', value: hasPositivityTarget ? positivityDailyTarget.toFixed(1) : '—' },
          { label: 'Média diária atual', value: positivityDailyCurrent.toFixed(1) },
          { label: 'Necessário por dia', value: neededPosValue, detail: neededPosDetail },
        ]} />
      </div>
      <div className="panel-grid panel-grid-2" style={{ marginTop: 18 }}>
        <QuickMetric label="Mesmo mês ano anterior" value={lastYear !== null ? fmtBRL(lastYear) : 'Histórico não carregado'} detail={`Vs. tendência faturada: ${compare(lastYear)}`} />
        <QuickMetric label="Média dos 3 meses" value={avg3 !== null ? fmtBRL(avg3) : 'Histórico não carregado'} detail={`Vs. tendência faturada: ${compare(avg3)}`} />
      </div>
      {h?.average3MonthKeys?.length ? <div className="panel-muted" style={{ marginTop: 9, fontSize: 'var(--panel-font-caption)' }}>Média móvel baseada em {h.average3MonthKeys.join(' · ')}.</div> : null}
    </PanelCard>
  );
}

function LineSummary() {
  const { canonical } = useData();
  if (!canonical) return null;
  const classified = canonical.lines.reduce((sum, line) => sum + line.total, 0);
  const difference = canonical.sellOut.total - classified;
  return (
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT POR LINHA" title="Resultado das cinco linhas comerciais" description="Classificação feita pela base canônica de produtos/EAN e usada também nos documentos gerados." />
      <div className="panel-grid panel-grid-auto">
        {canonical.lines.map(line => <PanelStat key={line.name} label={line.name} value={fmtBRL(line.total)} note={`Meta ${line.target > 0 ? fmtBRL(line.target) : 'não informada'}${line.target > 0 ? ` · ${fmtPct(line.attainment)}` : ''}`} />)}
      </div>
      {Math.abs(difference) > 0.01 ? <div style={{ marginTop: 14 }}><PanelAlert tone="warning">{difference > 0 ? `${fmtBRL(difference)} do Sell Out permanece sem classificação em uma das cinco linhas. O total foi preservado e nenhuma linha foi inventada.` : `As cinco linhas excedem o Sell Out em ${fmtBRL(Math.abs(difference))}. A reconciliação deve ser tratada antes de considerar a abertura por linha fechada.`}</PanelAlert></div> : null}
    </PanelCard>
  );
}

function Gerencial() {
  const { canonical } = useData();
  if (!canonical) return null;
  const coordinators = canonical.coordinators;
  const vendors = canonical.vendors;
  const rows = coordinators.map(coord => ({
    name: coord.name,
    target: coord.salesTarget,
    invoiced: coord.invoiced,
    toInvoice: coord.toInvoice,
    total: coord.total,
    attainment: coord.attainment,
    positivity: coord.totalPositivation,
    positivityTarget: coord.positivityTarget,
  }));
  const vendorSales = vendors.reduce((sum, vendor) => sum + vendor.total, 0);
  const salesOutsideOfficialRca = canonical.sellOut.total - vendorSales;
  const vendorTargets = vendors.reduce((sum, vendor) => sum + vendor.salesTarget, 0);
  const targetWithoutOfficialRca = canonical.industryTarget - vendorTargets;
  const vendorPosTargets = vendors.reduce((sum, vendor) => sum + vendor.positivityTarget, 0);
  const posTargetWithoutOfficialRca = canonical.industryPositivityTarget - vendorPosTargets;

  return (
    <div className="panel-stack">
      <ManagerialSummary />
      {(Math.abs(salesOutsideOfficialRca) > 0.01 || targetWithoutOfficialRca > 0.01 || posTargetWithoutOfficialRca > 0.01) ? <PanelAlert tone="warning">A visão por vendedor não fecha integralmente com os totais globais porque existem fatos sem RCA oficial resolvido. {Math.abs(salesOutsideOfficialRca) > 0.01 ? `Venda fora de RCA oficial: ${fmtBRL(Math.abs(salesOutsideOfficialRca))}. ` : ''}{targetWithoutOfficialRca > 0.01 ? `Meta de venda Bússola não atribuída: ${fmtBRL(targetWithoutOfficialRca)}. ` : ''}{posTargetWithoutOfficialRca > 0.01 ? `Meta de positivação não atribuída: ${fmtInt(posTargetWithoutOfficialRca)}.` : ''} Esses valores foram preservados e não redistribuídos.</PanelAlert> : null}
      <PanelCard>
        <PanelSectionHeader eyebrow="COORDENAÇÃO" title="Resultado gerencial" description="Consolidação das equipes usando metas da Bússola e movimentos do 8022." />
        {rows.length ? <div className="panel-table-wrap">
          <table className="panel-table">
            <thead><tr><th>Coordenador</th><th className="is-right">Meta</th><th className="is-right">Faturado</th><th className="is-right">A Faturar</th><th className="is-right">Total</th><th className="is-right">% Meta</th><th className="is-right">Pos. Total</th><th className="is-right">Meta Pos.</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.name}><td className="is-strong">{row.name}</td><td className="is-right">{row.target ? fmtBRL(row.target) : '—'}</td><td className="is-right">{fmtBRL(row.invoiced)}</td><td className="is-right">{fmtBRL(row.toInvoice)}</td><td className="is-right is-strong">{fmtBRL(row.total)}</td><td className="is-right is-red">{row.target ? fmtPct(row.attainment) : '—'}</td><td className="is-right">{fmtInt(row.positivity)}</td><td className="is-right">{row.positivityTarget ? fmtInt(row.positivityTarget) : '—'}</td></tr>)}</tbody>
          </table>
        </div> : <PanelEmptyState variant="compact" title="Nenhuma coordenação resolvida" description="Carregue Novos RCAs e Bússola para materializar a visão por coordenação. Vendas sem vínculo oficial permanecem no Sell Out global." />}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="VENDEDORES" title="Ritmo individual" description="Metas e realizado vêm da mesma base canônica usada no restante do painel." />
        {vendors.length ? <div className="panel-table-wrap" style={{ maxHeight: 600 }}>
          <table className="panel-table" style={{ minWidth: 2100 }}>
            <thead><tr>{['Coord.','Vendedor','Meta','Faturado','% Fat.','A Faturar','Realizado + A Fat.','% Total','Ideal Hoje','Dif. Ideal','Falta Venda','Meta Pos.','Pos. Fat.','Pos. A Fat.','Pos. Total','% Pos.','Ideal Pos. Hoje','Dif. Ideal Pos.','Falta Pos.','Nec. Pos./dia'].map((heading,index)=><th key={heading} className={index < 2 ? '' : 'is-right'}>{heading}</th>)}</tr></thead>
            <tbody>{vendors.map(vendor => {
              const invAtt = vendor.salesTarget > 0 ? vendor.invoiced / vendor.salesTarget : 0;
              const idealDiff = Math.max(vendor.idealSalesToday - vendor.total, 0);
              const idealPosDiff = Math.max(vendor.idealPositivationToday - vendor.totalPositivation, 0);
              const values = [
                vendor.salesTarget > 0 ? fmtBRL(vendor.salesTarget) : '—', fmtBRL(vendor.invoiced), vendor.salesTarget > 0 ? fmtPct(invAtt) : '—', fmtBRL(vendor.toInvoice), fmtBRL(vendor.total), vendor.salesTarget > 0 ? fmtPct(vendor.attainment) : '—', fmtBRL(vendor.idealSalesToday), fmtBRL(idealDiff), fmtBRL(vendor.salesGapToTarget), vendor.positivityTarget > 0 ? fmtInt(vendor.positivityTarget) : '—', fmtInt(vendor.invoicedPositivation), fmtInt(vendor.futurePositivation), fmtInt(vendor.totalPositivation), vendor.positivityTarget > 0 ? fmtPct(vendor.positivityAttainment) : '—', vendor.idealPositivationToday.toFixed(1), idealPosDiff.toFixed(1), fmtInt(vendor.positivityGapToTarget), canonical.sellOut.businessDaysRemaining > 0 && vendor.positivityTarget > 0 ? vendor.positivityDailyTarget.toFixed(1) : '—',
              ];
              return <tr key={`${vendor.newCode}-${vendor.oldCode}`}><td className="is-muted">{vendor.coordinatorName}</td><td className="is-strong">{vendor.name}</td>{values.map((value,index) => <td key={index} className={`is-right${index === 4 || index === 12 ? ' is-strong' : ''}${index === 5 ? ' is-red' : ''}`}>{value}</td>)}</tr>;
            })}</tbody>
          </table>
        </div> : <PanelEmptyState variant="compact" title="Nenhum vendedor oficial resolvido" description="A venda global continua disponível. Para a abertura individual, carregue Novos RCAs e Bússola com os códigos oficiais." />}
      </PanelCard>
    </div>
  );
}
