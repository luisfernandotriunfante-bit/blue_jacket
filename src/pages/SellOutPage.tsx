import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtPct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const fmtDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

type TabId = 'resumo' | 'gerencial';

type MetricRow = {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
};

function QuickMetric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return (
    <div style={{ minWidth: 0, padding: '3px 16px 4px', borderLeft: '2px solid rgba(239,51,64,0.52)' }}>
      <div style={{ color: 'var(--panel-muted)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ color: accent ? 'var(--panel-red)' : 'var(--panel-text)', fontSize: 'clamp(0.98rem, 1.6vw, 1.28rem)', fontWeight: 820, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.66rem', marginTop: '5px', lineHeight: 1.25 }}>{detail}</div> : null}
    </div>
  );
}

function MetricColumn({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <section style={{ minWidth: 0, padding: '2px 22px 2px 18px', borderLeft: '2px solid rgba(239,51,64,0.46)' }}>
      <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.095em', textTransform: 'uppercase', marginBottom: '8px' }}>{title}</div>
      <div>
        {rows.map((row, index) => (
          <div key={`${title}-${row.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '16px', alignItems: 'center', padding: '9px 0', borderTop: index === 0 ? '1px solid rgba(255,255,255,0.085)' : '1px solid rgba(255,255,255,0.055)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--panel-text-dim)', fontSize: '0.69rem', fontWeight: 720 }}>{row.label}</div>
              {row.detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.64rem', marginTop: '2px', lineHeight: 1.25 }}>{row.detail}</div> : null}
            </div>
            <div style={{ color: row.accent ? 'var(--panel-red)' : 'var(--panel-text)', fontSize: '0.85rem', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SellOutPage() {
  const { canonical, sellOut } = useData();
  const [activeTab, setActiveTab] = useState<TabId>('resumo');

  if (!canonical && !sellOut) {
    return (
      <PanelPage title="Sell Out">
        <PanelEmptyState icon="▥" title="Nenhum relatório de vendas carregado" description="Vá em Configurações e processe o vendas-8022 para iniciar a visão gerencial." />
      </PanelPage>
    );
  }

  const total = canonical?.sellOut.total ?? sellOut?.vendaTotal ?? 0;
  const tabs: { id: TabId; label: string }[] = [{ id: 'resumo', label: 'Resumo' }, { id: 'gerencial', label: 'Gerencial' }];

  return (
    <PanelPage title="Sell Out" metricLabel="Total do período" metricValue={fmtBRL(total)}>
      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '22px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '3px solid var(--panel-accent, #e31b2d)' : '3px solid transparent', color: activeTab === tab.id ? '#ef3340' : 'var(--panel-muted)', padding: '12px 16px', fontWeight: 750, cursor: 'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'resumo' ? <Resumo /> : <Gerencial />}
    </PanelPage>
  );
}

function Resumo() {
  const { canonical, sellOut } = useData();
  const summary = canonical?.sellOut;
  const faturado = summary?.invoiced ?? sellOut?.faturadoTotal ?? 0;
  const aFaturar = summary?.toInvoice ?? sellOut?.aFaturarTotal ?? 0;
  const total = summary?.total ?? sellOut?.vendaTotal ?? 0;
  const positivacao = summary?.totalPositivation ?? sellOut?.positivacaoTotal ?? 0;
  const daily = canonical?.daily ?? (sellOut?.diasDeVenda || []).map(day => ({ date: day.data, invoiced: day.faturado, toInvoice: Math.max(day.venda - day.faturado, 0), total: day.venda, invoicedPositivation: day.positivacao, totalPositivation: day.positivacao }));
  const latest = [...daily].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <PanelCard style={{ paddingTop: '18px', paddingBottom: '18px' }}>
        <PanelSectionHeader
          eyebrow="LEITURA RÁPIDA"
          title="Dia e acumulado"
          description="Somente os números essenciais antes da movimentação."
          action={latest ? <span className="panel-badge">ATUALIZADO · {fmtDate(latest.date)}</span> : undefined}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', rowGap: '18px', marginTop: '14px' }}>
          <QuickMetric label="Sell Out hoje" value={fmtBRL(latest?.total || 0)} />
          <QuickMetric label="Faturado hoje" value={fmtBRL(latest?.invoiced || 0)} />
          <QuickMetric label="A faturar hoje" value={fmtBRL(latest?.toInvoice || 0)} />
          <QuickMetric label="Positivação hoje" value={fmtInt(latest?.totalPositivation || 0)} />
          <QuickMetric label="Sell Out mês" value={fmtBRL(total)} accent />
          <QuickMetric label="Faturado mês" value={fmtBRL(faturado)} />
          <QuickMetric label="A faturar mês" value={fmtBRL(aFaturar)} />
          <QuickMetric label="Positivação mês" value={fmtInt(positivacao)} />
        </div>
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel e o mesmo controle de datas." />
        <DailyMovementWindow data={daily} />
      </PanelCard>

      {canonical ? <LineSummary /> : null}
    </div>
  );
}

function ManagerialSummary() {
  const { canonical } = useData();
  if (!canonical) return null;
  const s = canonical.sellOut;
  const dailyTarget = s.businessDaysTotal > 0 ? s.sellOutTarget / s.businessDaysTotal : 0;
  const dailyCoverage = dailyTarget > 0 ? s.totalDailyAverage / dailyTarget : 0;
  const positivityDailyTarget = s.businessDaysTotal > 0 ? s.industryPositivityTarget / s.businessDaysTotal : 0;
  const positivityDailyCurrent = s.businessDaysElapsed > 0 ? s.totalPositivation / s.businessDaysElapsed : 0;
  const positivityDailyNeeded = s.businessDaysRemaining > 0 ? Math.max(s.industryPositivityTarget - s.totalPositivation, 0) / s.businessDaysRemaining : Math.max(s.industryPositivityTarget - s.totalPositivation, 0);

  return (
    <PanelCard>
      <PanelSectionHeader eyebrow="GERENCIAL" title="Acompanhamento do mês" description="Leitura concentrada do diário, fechamento mensal e positivação, sem repetir cards grandes." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))', gap: '12px', marginTop: '16px' }}>
        <MetricColumn
          title="Sell Out diário"
          rows={[
            { label: 'Meta · venda média diária', value: fmtBRL(dailyTarget), detail: 'Meta T&C ÷ dias úteis do mês' },
            { label: 'Venda média diária', value: fmtBRL(s.totalDailyAverage), detail: `${fmtPct(dailyCoverage)} da meta diária`, accent: dailyCoverage < 1 },
            { label: 'Venda média diária necessária', value: fmtBRL(s.neededDailyAverage), detail: `${s.businessDaysRemaining} dias úteis restantes` },
          ]}
        />
        <MetricColumn
          title="Sell Out mês"
          rows={[
            { label: 'Meta mês', value: fmtBRL(s.sellOutTarget) },
            { label: 'Acum. mês faturado', value: fmtBRL(s.invoiced), detail: s.sellOutTarget > 0 ? `${fmtPct(s.invoiced / s.sellOutTarget)} da meta` : 'Meta T&C não informada' },
            { label: 'Tendência faturado', value: fmtBRL(s.invoicedTrend), detail: s.sellOutTarget > 0 ? `${fmtPct(s.invoicedTrend / s.sellOutTarget)} da meta` : undefined },
            { label: 'Acum. mês venda', value: fmtBRL(s.total), detail: s.sellOutTarget > 0 ? `${fmtPct(s.attainment)} da meta` : 'Meta T&C não informada' },
            { label: 'Tendência venda', value: fmtBRL(s.totalTrend), detail: s.sellOutTarget > 0 ? `${fmtPct(s.totalTrend / s.sellOutTarget)} da meta` : undefined, accent: s.sellOutTarget > 0 && s.totalTrend < s.sellOutTarget },
            { label: 'Dias úteis', value: `${s.businessDaysElapsed}/${s.businessDaysTotal}`, detail: `${s.businessDaysRemaining} restantes` },
          ]}
        />
        <MetricColumn
          title="Positivação"
          rows={[
            { label: 'Meta', value: fmtInt(s.industryPositivityTarget) },
            { label: 'Realizado total', value: fmtInt(s.totalPositivation), detail: `${fmtPct(s.positivityAttainment)} da meta`, accent: s.positivityAttainment < 1 },
            { label: 'Positivação faturada', value: fmtInt(s.invoicedPositivation) },
            { label: 'Meta média diária', value: positivityDailyTarget.toFixed(1) },
            { label: 'Média diária atual', value: positivityDailyCurrent.toFixed(1) },
            { label: 'Necessário por dia', value: positivityDailyNeeded.toFixed(1), detail: `${s.businessDaysRemaining} dias úteis restantes` },
          ]}
        />
      </div>

      <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.075)' }}>
        <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '8px' }}>Comparativos históricos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
          <QuickMetric label="Mesmo mês ano anterior" value="Dados não carregados" detail="Vs. tendência faturada: —" />
          <QuickMetric label="Média dos 3 meses" value="Dados não carregados" detail="Vs. tendência faturada: —" />
        </div>
        <div style={{ color: 'var(--panel-muted)', fontSize: '0.67rem', marginTop: '9px' }}>Esses dois campos permanecem vazios até recebermos uma fonte histórica validada; nenhum valor é estimado.</div>
      </div>
    </PanelCard>
  );
}

function LineSummary() {
  const { canonical } = useData();
  if (!canonical) return null;
  return (
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT POR LINHA" title="Resultado das cinco linhas comerciais" description="Classificação feita pela base de produtos/EAN e usada também nos documentos gerados." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px' }}>
        {canonical.lines.map(line => (
          <div key={line.name} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px', background: 'rgba(255,255,255,0.025)' }}>
            <div style={{ color: '#ef3340', fontSize: '0.68rem', fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{line.name}</div>
            <div style={{ color: 'white', fontSize: '1.12rem', fontWeight: 800, marginTop: '8px' }}>{fmtBRL(line.total)}</div>
            <div style={{ color: 'var(--panel-muted)', fontSize: '0.72rem', marginTop: '5px' }}>Meta {fmtBRL(line.target)} · {fmtPct(line.attainment)}</div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function Gerencial() {
  const { canonical, sellOut } = useData();
  const coordinators = canonical?.coordinators || [];
  const vendors = canonical?.vendors || [];
  const legacyCoordinators = sellOut?.coordenadores || [];
  const hasCanonical = Boolean(canonical);

  const rows = useMemo(() => {
    if (hasCanonical) return coordinators.map(coord => ({ name: coord.name, target: coord.salesTarget, invoiced: coord.invoiced, toInvoice: coord.toInvoice, total: coord.total, attainment: coord.attainment, positivity: coord.totalPositivation, positivityTarget: coord.positivityTarget }));
    return legacyCoordinators.map(coord => ({ name: coord.nomeCoord, target: 0, invoiced: coord.faturado, toInvoice: coord.aFaturar, total: coord.faturado + coord.aFaturar, attainment: 0, positivity: coord.positivacao, positivityTarget: 0 }));
  }, [hasCanonical, coordinators, legacyCoordinators]);

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      {canonical ? <ManagerialSummary /> : null}

      <PanelCard>
        <PanelSectionHeader eyebrow="COORDENAÇÃO" title="Resultado gerencial" description="Consolidação das equipes usando metas da Bússola e movimentos do 8022." />
        <div style={{ overflowX: 'auto', marginTop: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr>{['Coordenador','Meta','Faturado','A Faturar','Total','% Meta','Pos. Total','Meta Pos.'].map((heading, index) => <th key={heading} style={{ padding: '10px 12px', textAlign: index === 0 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.68rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td style={{ padding: '11px 12px', color: 'white', fontWeight: 700 }}>{row.name}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.target ? fmtBRL(row.target) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtBRL(row.invoiced)}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtBRL(row.toInvoice)}</td><td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 750 }}>{fmtBRL(row.total)}</td><td style={{ padding: '11px 12px', textAlign: 'right', color: '#ef3340' }}>{row.target ? fmtPct(row.attainment) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtInt(row.positivity)}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.positivityTarget ? fmtInt(row.positivityTarget) : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </PanelCard>

      {canonical ? (
        <PanelCard>
          <PanelSectionHeader eyebrow="VENDEDORES" title="Ritmo individual" description="Meta, realizado + a faturar, gap e positivação por vendedor." />
          <div style={{ overflowX: 'auto', marginTop: '14px', maxHeight: '560px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr>{['Coord.','Vendedor','Meta','Total','% Meta','Falta Meta','Pos.','Meta Pos.','Target Pos./Dia'].map((heading, index) => <th key={heading} style={{ position: 'sticky', top: 0, background: '#11161d', padding: '9px 10px', textAlign: index < 2 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.66rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead>
              <tbody>{vendors.map(vendor => <tr key={`${vendor.newCode}-${vendor.oldCode}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}><td style={{ padding: '9px 10px', color: 'var(--panel-muted)' }}>{vendor.coordinatorName}</td><td style={{ padding: '9px 10px', color: 'white', fontWeight: 650 }}>{vendor.name}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtBRL(vendor.total)}</td><td style={{ padding: '9px 10px', textAlign: 'right', color: '#ef3340' }}>{fmtPct(vendor.attainment)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesGapToTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.totalPositivation)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.positivityTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{vendor.positivityDailyTarget.toFixed(1)}</td></tr>)}</tbody>
            </table>
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
