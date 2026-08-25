import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel, type StockOverviewModel } from '../canonical/stockOverviewModel';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { MigrationPage } from '../ui/pattern/MigrationEmptyState';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import './EstoquePage.css';

export type EstoqueView = 'overview' | 'products' | 'movements' | 'purchase-helper';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

function InfoHint({ text }: { text: string }) {
  return <span className="stock-info" tabIndex={0} aria-label={text}><span aria-hidden="true">i</span><span className="stock-info-tooltip" role="tooltip">{text}</span></span>;
}

function MetricCard({ label, value, progress, progressLabel, info }: { label: string; value: string; progress: number | null; progressLabel: string; info: string }) {
  const safe = progress === null ? null : Math.max(0, Math.min(1, progress));
  return <div className="stock-metric-card">
    <div className="stock-metric-head"><span>{label}</span><InfoHint text={info} /></div>
    <div className="stock-metric-value">{value}</div>
    <div className="stock-progress-copy">{progressLabel}</div>
    <div className={`stock-progress${safe === null ? ' is-empty' : ''}`} aria-label={safe === null ? 'Sem referência' : progressLabel}><span style={{ width: safe === null ? '0%' : `${safe * 100}%` }} /></div>
  </div>;
}

function HealthPanel({ model }: { model: StockOverviewModel }) {
  const visible = model.alerts.slice(0, 8);
  return <div className="stock-health-grid">
    <PanelCard>
      <PanelSectionHeader
        eyebrow="SAÚDE DO ESTOQUE"
        title="Avisos que pedem atenção"
        description={`Cobertura usa uma janela móvel de ${model.analysis.days} dias e só gera risco por cobertura quando existe giro mapeado. Lançamentos recebem prioridade própria.`}
      />
      {visible.length ? <div className="stock-alert-list">{visible.map(item => <div key={item.code} className="stock-alert" data-tone={item.tone}>
        <div className="stock-alert-head"><span className="stock-alert-title">{item.title}</span><span className="stock-alert-count">{number.format(item.count)}</span></div>
        <div className="stock-alert-detail">{item.detail}</div>
        {item.examples.length ? <div className="stock-alert-examples">Ex.: {item.examples.join(' · ')}</div> : null}
      </div>)}</div> : <PanelEmptyState title="Sem alertas para esta fotografia" description="Nenhuma condição monitorada foi acionada pelas listas canônicas ativas." />}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader
        eyebrow="ESTOQUE POR LINHA"
        title="Composição das cinco linhas"
        description="A mesma classificação comercial compartilhada com o Sell Out. O tamanho dos blocos representa a quantidade de SKUs da linha."
      />
      <div className="stock-treemap">{model.lines.map(row => {
        const colSpan = Math.max(3, Math.min(12, Math.round(row.itemShare * 18)));
        const rowSpan = row.itemShare >= .25 ? 2 : 1;
        return <div key={row.line} className="stock-treemap-cell" style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}>
          <strong>{row.line}</strong>
          <span>{number.format(row.items)} SKUs · {number.format(row.availableUnits)} disponíveis</span>
          <span>{currency.format(row.saleValue)} a PVENDA1</span>
        </div>;
      })}</div>
      <div className="stock-analysis-note">
        <span>{model.unclassifiedItems ? `${number.format(model.unclassifiedItems)} item(ns) ainda sem linha oficial` : 'Todos os itens classificados nas cinco linhas'}</span>
      </div>
    </PanelCard>
  </div>;
}

function StockOverview({ m1, m3, m4 }: { m1: CanonicalList; m3: CanonicalList; m4: CanonicalList }) {
  const model = useMemo(() => buildStockOverviewModel({ m1, m3, m4 }), [m1, m3, m4]);
  const coverageLabel = model.totals.coverageDays === null ? 'Sem giro mapeado suficiente' : `${decimal.format(model.totals.coverageDays)} dias · ref. ${model.analysis.lowCoverageThresholdDays}d`;
  const inboundMappingLabel = model.progress.inboundMapping === null ? 'Sem Carteira na fotografia' : `${percent.format(model.progress.inboundMapping)} da Carteira mapeada`;
  const period = model.analysis.startDate && model.analysis.endDate ? `${new Date(`${model.analysis.startDate}T12:00:00`).toLocaleDateString('pt-BR')} — ${new Date(`${model.analysis.endDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'sem período histórico válido';

  return <PanelPage title="Estoque"><div className="panel-stack stock-page-stack">
    <div className="stock-metric-grid">
      <MetricCard label="Cobertura estimada" value={model.totals.coverageDays === null ? '—' : `${decimal.format(model.totals.coverageDays)} dias`} progress={model.progress.coverageVsReference} progressLabel={coverageLabel} info={`Cobertura agregada dos itens com giro mapeado entre ${period}. Itens sem saída histórica não recebem cobertura artificial nem falso risco imediato.`} />
      <MetricCard label="Estoque a custo" value={currency.format(model.totals.purchaseValue)} progress={model.progress.purchaseVsSale} progressLabel={model.progress.purchaseVsSale === null ? 'Sem valor de venda comparável' : `${percent.format(model.progress.purchaseVsSale)} do valor a venda`} info="Saldo físico do M1 × custo unitário do 105. A tela não reabre o relatório 105." />
      <MetricCard label="Estoque a venda" value={currency.format(model.totals.saleValue)} progress={model.progress.pricedCoverage} progressLabel={model.progress.pricedCoverage === null ? 'Sem SKUs com saldo' : `${percent.format(model.progress.pricedCoverage)} dos SKUs com saldo têm PVENDA1`} info="Saldo físico do M1 × PVENDA1 da região 11 materializado no M1. Não usa preço alternativo." />
      <MetricCard label="Estoque físico" value={number.format(model.totals.physicalUnits)} progress={model.progress.stockSkuShare} progressLabel={model.progress.stockSkuShare === null ? 'Sem itens' : `${number.format(model.totals.itemsWithStock)} de ${number.format(model.totals.items)} SKUs com saldo`} info="Posição física materializada a partir do relatório 105 no M1." />
      <MetricCard label="Reservado" value={number.format(model.totals.reservedUnits)} progress={model.progress.reservedShare} progressLabel={model.progress.reservedShare === null ? 'Sem estoque físico' : `${percent.format(model.progress.reservedShare)} do físico`} info="Pedidos SALE do M3 com status A FATURAR, somados por item. Essa reserva é descontada do físico para formar o disponível." />
      <MetricCard label="Disponível" value={number.format(model.totals.availableUnits)} progress={model.progress.availableShare} progressLabel={model.progress.availableShare === null ? 'Sem estoque físico' : `${percent.format(model.progress.availableShare)} do físico`} info="Estoque físico menos a reserva dos pedidos a faturar. Se a reserva superar o físico, a diferença permanece visível nos alertas." />
      <MetricCard label="Carteira Colgate" value={decimal.format(model.totals.inboundQty)} progress={model.progress.inboundMapping} progressLabel={inboundMappingLabel} info="Regra aprovada da Carteira: Order Qty + Bill Qty. Só a parcela ligada com segurança ao item do M1 entra na projeção; materiais não mapeados aparecem nos avisos." />
      <MetricCard label="Projetado" value={decimal.format(model.totals.projectedUnits)} progress={model.progress.projectedInboundShare} progressLabel={model.progress.projectedInboundShare === null ? 'Sem projeção positiva' : `${percent.format(model.progress.projectedInboundShare)} do projetado vem da Carteira`} info="Disponível + quantidade mapeada da Carteira Colgate. Nenhuma fonte original é lida nesta tela." />
    </div>

    <HealthPanel model={model} />

    <PanelCard>
      <PanelSectionHeader eyebrow="LEITURA" title="Base da análise" description="Esta visão é um resumo operacional. A análise detalhada por produto será fechada na próxima aba sem duplicar regras aqui." />
      <div className="stock-analysis-note">
        <span>Janela de giro: {period}</span>
        <span>{number.format(model.totals.mappedDemandItems)} SKUs com giro mapeado</span>
        <span>{number.format(model.analysis.mappedHistoricalRows)} movimentos históricos vinculados</span>
        <span>{number.format(model.analysis.unmappedHistoricalRows)} movimentos históricos preservados sem vínculo</span>
        <span>{number.format(model.totals.launchItems)} lançamentos reconhecidos no M1</span>
      </div>
    </PanelCard>
  </div></PanelPage>;
}

export function EstoquePage({ view = 'overview' }: { view?: EstoqueView }) {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m3: CanonicalList; m4: CanonicalList } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (view !== 'overview' || !activeCanonical) { setLists(null); return; }
    let live = true;
    setLists(null);
    setError('');
    Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M3_MOVIMENTO_VENDAS'), loadCandidateList('M4_HISTORICO_TRANSICAO')])
      .then(([m1, m3, m4]) => { if (live) setLists({ m1, m3, m4 }); })
      .catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [activeCanonical, view]);

  if (view === 'overview') {
    if (!activeCanonical) return <PanelPage title="Estoque"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="A Visão Geral não usa fallback legado. Atualize as bases para ativar M1, M3 e M4." /></PanelPage>;
    if (error) return <PanelPage title="Estoque"><PanelAlert tone="error">Erro ao carregar as listas de Estoque: {error}</PanelAlert></PanelPage>;
    if (!lists) return <PanelPage title="Estoque"><PanelEmptyState variant="page" title="Carregando Estoque" description="Leitura passiva de M1, M3 e M4. Nenhum parser, motor ou arquivo original é acionado pela tela." /></PanelPage>;
    return <StockOverview {...lists} />;
  }

  const configuration = view === 'products'
    ? { heading: 'Produtos', columns: ['Código Winthor', 'Produto', 'EAN', 'Físico', 'Reservado', 'Disponível', 'Carteira', 'Projetado', 'Valor', 'Cobertura', 'Alertas'] }
    : view === 'movements'
      ? { heading: 'Entradas e Saídas', columns: ['Data', 'Tipo', 'Situação', 'Documento', 'Produto', 'Quantidade', 'Origem'] }
      : { heading: 'Auxiliar de Pedidos', columns: ['Produto', 'Giro', 'Cobertura', 'Disponível', 'Carteira', 'Projetado', 'Sugestão', 'Motivo'] };
  return <MigrationPage title="Estoque" heading={configuration.heading} columns={configuration.columns} kpis={['Estrutura preservada']} description="Esta aba será fechada na próxima etapa. Nenhuma regra provisória de compra ou movimento foi ativada." />;
}
