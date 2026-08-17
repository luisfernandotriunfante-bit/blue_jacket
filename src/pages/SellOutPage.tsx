import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { DailyMovementWindow } from '../ui/charts/DailyMovementWindow';
import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtPct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;

type TabId = 'resumo' | 'gerencial';

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

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
        <PanelKpi label="Sell Out Total" value={fmtBRL(total)} tone="red" />
        <PanelKpi label="Faturado" value={fmtBRL(faturado)} tone="blue" />
        <PanelKpi label="A Faturar" value={fmtBRL(aFaturar)} tone="green" />
        <PanelKpi label="Positivação Total" value={fmtInt(positivacao)} tone="purple" />
      </div>

      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
          <PanelKpi label="Meta Sell Out T&C" value={fmtBRL(summary.sellOutTarget)} detail={`Atingimento ${fmtPct(summary.attainment)}`} />
          <PanelKpi label="Tendência" value={fmtBRL(summary.totalTrend)} detail={`${summary.businessDaysElapsed}/${summary.businessDaysTotal} dias úteis`} />
          <PanelKpi label="Necessário / dia" value={fmtBRL(summary.neededDailyAverage)} detail={`${summary.businessDaysRemaining} dias úteis restantes`} tone="amber" />
          <PanelKpi label="Meta Positivação" value={fmtInt(summary.industryPositivityTarget)} detail={`Atingimento ${fmtPct(summary.positivityAttainment)}`} />
        </div>
      ) : null}

      <PanelCard>
        <PanelSectionHeader eyebrow="MOVIMENTO" title="Fechamento diário" description="Janela móvel de dez dias. O mesmo controle movimenta os dois gráficos e a planilha; ao abrir, o dia mais atual fica no limite direito da visualização." />
        <DailyMovementWindow data={daily} />
      </PanelCard>

      {canonical ? <LineSummary /> : null}
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
      <PanelCard>
        <PanelSectionHeader eyebrow="COORDENAÇÃO" title="Resultado gerencial" description="Consolidação das equipes usando metas da Bússola e movimentos do 8022." />
        <div style={{ overflowX: 'auto', marginTop: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr>{['Coordenador','Meta','Faturado','A Faturar','Total','% Meta','Pos. Total','Meta Pos.'].map((heading, index) => <th key={heading} style={{ padding: '10px 12px', textAlign: index === 0 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.68rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td style={{ padding: '11px 12px', color: 'white', fontWeight: 700 }}>{row.name}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.target ? fmtBRL(row.target) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtBRL(row.invoiced)}</td><td style={{ padding: '11px 12px', textAlign: 'right', color: '#4ade80' }}>{fmtBRL(row.toInvoice)}</td><td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 750 }}>{fmtBRL(row.total)}</td><td style={{ padding: '11px 12px', textAlign: 'right', color: '#ef3340' }}>{row.target ? fmtPct(row.attainment) : '—'}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{fmtInt(row.positivity)}</td><td style={{ padding: '11px 12px', textAlign: 'right' }}>{row.positivityTarget ? fmtInt(row.positivityTarget) : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </PanelCard>

      {canonical ? (
        <PanelCard>
          <PanelSectionHeader eyebrow="VENDEDORES" title="Ritmo individual" description="Meta, realizado + a faturar, gap e positivação por vendedor." />
          <div style={{ overflowX: 'auto', marginTop: '14px', maxHeight: '560px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr>{['Coord.','Vendedor','Meta','Total','% Meta','Falta Meta','Pos.','Meta Pos.','Target Pos./Dia'].map((heading, index) => <th key={heading} style={{ position: 'sticky', top: 0, background: '#11161d', padding: '9px 10px', textAlign: index < 2 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.66rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead>
              <tbody>{vendors.map(vendor => <tr key={`${vendor.newCode}-${vendor.oldCode}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}><td style={{ padding: '9px 10px', color: 'var(--panel-muted)' }}>{vendor.coordinatorName}</td><td style={{ padding: '9px 10px', color: 'white', fontWeight: 650 }}>{vendor.name}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtBRL(vendor.total)}</td><td style={{ padding: '9px 10px', textAlign: 'right', color: '#ef3340' }}>{fmtPct(vendor.attainment)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtBRL(vendor.salesGapToTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.totalPositivation)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtInt(vendor.positivityTarget)}</td><td style={{ padding: '9px 10px', textAlign: 'right', color: '#fcd34d' }}>{vendor.positivityDailyTarget.toFixed(1)}</td></tr>)}</tbody>
            </table>
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
