import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtPct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const fmtDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

type TabId = 'resumo' | 'gerencial';

type InfoRow = {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
};

function BigInfoCard({ eyebrow, title, mainLabel, mainValue, rows, note }: { eyebrow: string; title: string; mainLabel?: string; mainValue?: string; rows: InfoRow[]; note?: string }) {
  return (
    <PanelCard style={{ borderLeft: '4px solid var(--panel-red)', minHeight: '100%' }}>
      <PanelSectionHeader eyebrow={eyebrow} title={title} />
      {mainValue ? (
        <div style={{ marginBottom: '18px' }}>
          {mainLabel ? <div className="panel-mini-label" style={{ marginBottom: '6px' }}>{mainLabel}</div> : null}
          <div style={{ color: 'var(--panel-text)', fontSize: 'clamp(1.9rem, 3.6vw, 3rem)', fontWeight: 850, letterSpacing: '-0.04em', lineHeight: 1 }}>
            {mainValue}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: '0' }}>
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '18px', alignItems: 'center', padding: '11px 0', borderTop: index === 0 ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.055)' }}>
            <div>
              <div style={{ color: 'var(--panel-text-dim)', fontSize: '0.72rem', fontWeight: 750, letterSpacing: '0.045em', textTransform: 'uppercase' }}>{row.label}</div>
              {row.detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.72rem', marginTop: '3px' }}>{row.detail}</div> : null}
            </div>
            <div style={{ color: row.accent ? 'var(--panel-red)' : 'var(--panel-text)', fontWeight: 800, textAlign: 'right' }}>{row.value}</div>
          </div>
        ))}
      </div>
      {note ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.72rem', marginTop: '14px', lineHeight: 1.45 }}>{note}</div> : null}
    </PanelCard>
  );
}

function CompactMetric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return (
    <div style={{ padding: '11px 12px', border: '1px solid rgba(255,255,255,0.075)', borderRadius: '12px', background: 'rgba(255,255,255,0.018)', minWidth: 0 }}>
      <div style={{ color: 'var(--panel-muted)', fontSize: '0.63rem', fontWeight: 800, letterSpacing: '0.055em', textTransform: 'uppercase', marginBottom: '5px' }}>{label}</div>
      <div style={{ color: accent ? 'var(--panel-red)' : 'var(--panel-text)', fontSize: '0.98rem', fontWeight: 820, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{value}</div>
      {detail ? <div style={{ color: 'var(--panel-muted)', fontSize: '0.66rem', marginTop: '4px', lineHeight: 1.3 }}>{detail}</div> : null}
    </div>
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
      <div className="panel-grid panel-grid-2">
        <BigInfoCard
          eyebrow="ÚLTIMO DIA"
          title={latest ? `Fechamento de ${fmtDate(latest.date)}` : 'Fechamento diário'}
          mainLabel="Sell Out do dia"
          mainValue={fmtBRL(latest?.total || 0)}
          rows={[
            { label: 'Faturado', value: fmtBRL(latest?.invoiced || 0) },
            { label: 'A faturar', value: fmtBRL(latest?.toInvoice || 0) },
            { label: 'Positivação faturada', value: fmtInt(latest?.invoicedPositivation || 0) },
            { label: 'Positivação total', value: fmtInt(latest?.totalPositivation || 0), accent: true },
          ]}
        />
        <BigInfoCard
          eyebrow="ACUMULADO"
          title="Resultado do mês até agora"
          mainLabel="Sell Out acumulado"
          mainValue={fmtBRL(total)}
          rows={[
            { label: 'Faturado acumulado', value: fmtBRL(faturado) },
            { label: 'A faturar acumulado', value: fmtBRL(aFaturar) },
            { label: 'Positivação total', value: fmtInt(positivacao) },
            { label: 'Última atualização', value: canonical ? fmtDate(canonical.referenceDate) : '—' },
          ]}
        />
      </div>

      <PanelCard>
        <PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Gráficos e planilha usam a mesma janela móvel e o mesmo controle de datas." />
        <DailyMovementWindow data={daily} />
      </PanelCard>

      {canonical ? <LineSummary /> : null}
    </div>
  );
}

function ManagerialSellOutCards() {
  const { canonical } = useData();
  if (!canonical) return null;
  const s = canonical.sellOut;
  const dailyTarget = s.businessDaysTotal > 0 ? s.sellOutTarget / s.businessDaysTotal : 0;
  const dailyCoverage = dailyTarget > 0 ? s.totalDailyAverage / dailyTarget : 0;
  const positivityDailyTarget = s.businessDaysTotal > 0 ? s.industryPositivityTarget / s.businessDaysTotal : 0;
  const positivityDailyCurrent = s.businessDaysElapsed > 0 ? s.totalPositivation / s.businessDaysElapsed : 0;
  const positivityDailyNeeded = s.businessDaysRemaining > 0 ? Math.max(s.industryPositivityTarget - s.totalPositivation, 0) / s.businessDaysRemaining : Math.max(s.industryPositivityTarget - s.totalPositivation, 0);

  return (
    <div className="panel-grid panel-grid-2">
      <PanelCard style={{ borderLeft: '4px solid var(--panel-red)' }}>
        <PanelSectionHeader eyebrow="SELL OUT" title="Ritmo diário e resultado do mês" description="Mesmas informações do acompanhamento gerencial, concentradas em um único bloco." />

        <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', margin: '14px 0 8px' }}>DIÁRIO</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          <CompactMetric label="Meta média/dia" value={fmtBRL(dailyTarget)} detail="Meta T&C ÷ dias úteis" />
          <CompactMetric label="Venda média/dia" value={fmtBRL(s.totalDailyAverage)} detail={`${fmtPct(dailyCoverage)} da meta diária`} accent={dailyCoverage < 1} />
          <CompactMetric label="Necessário/dia" value={fmtBRL(s.neededDailyAverage)} detail={`${s.businessDaysRemaining} dias úteis restantes`} />
        </div>

        <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', margin: '15px 0 8px' }}>MÊS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          <CompactMetric label="Meta mês" value={fmtBRL(s.sellOutTarget)} />
          <CompactMetric label="Faturado" value={fmtBRL(s.invoiced)} detail={s.sellOutTarget > 0 ? `${fmtPct(s.invoiced / s.sellOutTarget)} da meta` : 'Meta T&C não informada'} />
          <CompactMetric label="Tend. faturado" value={fmtBRL(s.invoicedTrend)} detail={s.sellOutTarget > 0 ? `${fmtPct(s.invoicedTrend / s.sellOutTarget)} da meta` : undefined} />
          <CompactMetric label="Sell Out" value={fmtBRL(s.total)} detail={s.sellOutTarget > 0 ? `${fmtPct(s.attainment)} da meta` : 'Meta T&C não informada'} />
          <CompactMetric label="Tend. Sell Out" value={fmtBRL(s.totalTrend)} detail={s.sellOutTarget > 0 ? `${fmtPct(s.totalTrend / s.sellOutTarget)} da meta` : undefined} accent={s.sellOutTarget > 0 && s.totalTrend < s.sellOutTarget} />
          <CompactMetric label="Dias úteis" value={`${s.businessDaysElapsed}/${s.businessDaysTotal}`} detail={`${s.businessDaysRemaining} restantes`} />
        </div>
      </PanelCard>

      <PanelCard style={{ borderLeft: '4px solid var(--panel-red)' }}>
        <PanelSectionHeader eyebrow="POSITIVAÇÃO + HISTÓRICO" title="Fechamento e comparativos" description="Positivação atual e referências históricas do painel original." />

        <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', margin: '14px 0 8px' }}>POSITIVAÇÃO</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          <CompactMetric label="Meta" value={fmtInt(s.industryPositivityTarget)} />
          <CompactMetric label="Realizado total" value={fmtInt(s.totalPositivation)} detail={`${fmtPct(s.positivityAttainment)} da meta`} accent={s.positivityAttainment < 1} />
          <CompactMetric label="Necessário/dia" value={positivityDailyNeeded.toFixed(1)} detail={`${s.businessDaysRemaining} dias úteis restantes`} />
          <CompactMetric label="Meta média/dia" value={positivityDailyTarget.toFixed(1)} />
          <CompactMetric label="Média atual/dia" value={positivityDailyCurrent.toFixed(1)} />
          <CompactMetric label="Faturada" value={fmtInt(s.invoicedPositivation)} />
        </div>

        <div style={{ color: 'var(--panel-red)', fontSize: '0.66rem', fontWeight: 850, letterSpacing: '0.09em', margin: '15px 0 8px' }}>HISTÓRICO</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          <CompactMetric label="Mesmo mês ano anterior" value="Dados não carregados" detail="Vs. tendência faturada: —" />
          <CompactMetric label="Média dos 3 meses" value="Dados não carregados" detail="Vs. tendência faturada: —" />
        </div>
        <div style={{ color: 'var(--panel-muted)', fontSize: '0.68rem', marginTop: '10px', lineHeight: 1.35 }}>Histórico permanece vazio até recebermos uma fonte validada; nenhum valor é estimado.</div>
      </PanelCard>
    </div>
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
      {canonical ? <ManagerialSellOutCards /> : null}

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
