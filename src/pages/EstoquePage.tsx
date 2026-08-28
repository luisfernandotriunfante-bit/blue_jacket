import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel, type StockLineTreemap, type StockOverviewModel, type StockTreemapTile } from '../canonical/stockOverviewModel';
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

function tileSpan(tile: StockTreemapTile, group: StockLineTreemap) {
  const share = group.totalValue > 0 ? tile.saleValue / group.totalValue : 0;
  const area = Math.max(2, Math.min(24, Math.round(share * 42)));
  const col = Math.max(2, Math.min(6, Math.round(Math.sqrt(area * 1.5))));
  const row = Math.max(1, Math.min(4, Math.ceil(area / col)));
  return { col, row };
}

function tileColor(lineIndex: number, tileIndex: number, aggregate: boolean) {
  if (aggregate) return `hsl(${lineIndex * 68 + 18} 18% 27% / .88)`;
  const hue = (lineIndex * 68 + tileIndex * 11 + 8) % 360;
  const saturation = 36 + (tileIndex % 4) * 7;
  const lightness = 24 + (tileIndex % 5) * 3;
  return `hsl(${hue} ${saturation}% ${lightness}% / .92)`;
}

function StockTreemap({ model }: { model: StockOverviewModel }) {
  return <PanelCard>
    <PanelSectionHeader
      eyebrow="ESTOQUE POR LINHA"
      title="Valor do estoque por produto"
      description="As cinco linhas são as mesmas do Sell Out. Dentro de cada linha, cada bloco representa um produto e cresce conforme o valor do estoque físico a PVENDA1. As cores servem apenas para diferenciar visualmente os itens."
    />
    <div className="stock-line-treemap-grid">{model.treemap.map((group, lineIndex) => <section className="stock-line-treemap" key={group.line}>
      <div className="stock-line-treemap-head">
        <div><strong>{group.line}</strong><span>{number.format(group.items)} itens com valor</span></div>
        <strong>{currency.format(group.totalValue)}</strong>
      </div>
      {group.tiles.length ? <div className="stock-item-treemap">{group.tiles.map((tile, tileIndex) => {
        const span = tileSpan(tile, group);
        return <div
          key={tile.key}
          className="stock-item-tile"
          data-aggregate={tile.aggregate ? 'true' : 'false'}
          style={{ gridColumn: `span ${span.col}`, gridRow: `span ${span.row}`, background: tileColor(lineIndex, tileIndex, tile.aggregate) }}
          title={`${tile.label}\n${currency.format(tile.saleValue)}\n${number.format(tile.availableUnits)} disponíveis`}
        >
          <strong>{tile.label}</strong>
          <span>{currency.format(tile.saleValue)}</span>
          <small>{number.format(tile.availableUnits)} disponíveis</small>
        </div>;
      })}</div> : <div className="stock-line-empty">Sem estoque valorizado nesta linha</div>}
    </section>)}</div>
    <div className="stock-analysis-note">
      <span>O mapa usa valor do estoque, não quantidade de SKUs, para definir o tamanho dos blocos.</span>
    </div>
  </PanelCard>;
}

function HealthPanel({ model }: { model: StockOverviewModel }) {
  return <PanelCard>
    <PanelSectionHeader
      eyebrow="SAÚDE DO ESTOQUE"
      title="Avisos operacionais"
      description={`A leitura usa ${model.analysis.days} dias de histórico. Cobertura só gera risco quando existe giro mapeado; item sem venda no período não vira ruptura artificial.`}
    />
    {model.alerts.length ? <div className="stock-alert-list">{model.alerts.map(item => <div key={item.code} className="stock-alert" data-tone={item.tone}>
      <div className="stock-alert-head"><span className="stock-alert-title">{item.title}</span><span className="stock-alert-count">{number.format(item.count)}</span></div>
      <div className="stock-alert-detail">{item.detail}</div>
      {item.examples.length ? <div className="stock-alert-examples">Ex.: {item.examples.join(' · ')}</div> : null}
    </div>)}</div> : <PanelEmptyState title="Sem alertas para esta fotografia" description="Nenhuma condição operacional monitorada foi acionada pelas listas canônicas ativas." />}

    <div className="stock-data-quality">
      <strong>Qualidade dos vínculos</strong>
      <span>{number.format(model.dataQuality.noSalePriceItems)} sem PVENDA1</span>
      <span>{number.format(model.dataQuality.unclassifiedItems)} sem linha comercial</span>
      <span>{number.format(model.dataQuality.inboundUnmappedRows)} linha(s) da Carteira sem item + Un/CX</span>
      <span>{number.format(model.dataQuality.historicalUnmappedRows)} movimento(s) históricos sem vínculo</span>
    </div>
  </PanelCard>;
}

function StockOverview({ m1, m3, m4 }: { m1: CanonicalList; m3: CanonicalList; m4: CanonicalList }) {
  const model = useMemo(() => buildStockOverviewModel({ m1, m3, m4 }), [m1, m3, m4]);
  const period = model.analysis.startDate && model.analysis.endDate ? `${new Date(`${model.analysis.startDate}T12:00:00`).toLocaleDateString('pt-BR')} — ${new Date(`${model.analysis.endDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'sem período histórico válido';
  const inboundMapping = model.progress.inboundMapping;
  const inboundCopy = model.totals.totalInboundQty > 0
    ? `${number.format(model.totals.totalInboundQty)} cx. em aberto · ${inboundMapping === null ? 'sem vínculo' : `${percent.format(inboundMapping)} com item + Un/CX`}`
    : 'Sem Carteira em aberto';

  return <PanelPage title="Estoque"><div className="panel-stack stock-page-stack">
    <section className="stock-metric-section">
      <div className="stock-metric-section-head"><span>Resumo financeiro e cobertura</span></div>
      <div className="stock-metric-grid">
        <MetricCard
          label="Cobertura média"
          value={model.totals.coverageDays === null ? '—' : `${decimal.format(model.totals.coverageDays)} dias`}
          progress={model.progress.coverageVsReference}
          progressLabel={model.totals.coverageDays === null ? 'Sem giro mapeado' : `${number.format(model.totals.mappedDemandItems)} SKUs com giro · ref. ${model.analysis.lowCoverageThresholdDays}d`}
          info={`Média aritmética dos dias de cobertura de cada SKU que teve giro mapeado entre ${period}. Cada produto com giro pesa uma vez. Itens sem venda histórica ficam fora da média e não recebem cobertura artificial.`}
        />
        <MetricCard
          label="Estoque a custo"
          value={currency.format(model.totals.purchaseValue)}
          progress={model.progress.purchaseVsSale}
          progressLabel={model.progress.purchaseVsSale === null ? 'Sem valor de venda comparável' : `${percent.format(model.progress.purchaseVsSale)} do valor a venda`}
          info="Saldo físico do M1 multiplicado pelo custo unitário do 105 já materializado."
        />
        <MetricCard
          label="Estoque a venda"
          value={currency.format(model.totals.saleValue)}
          progress={model.progress.pricedCoverage}
          progressLabel={model.progress.pricedCoverage === null ? 'Sem SKUs com saldo' : `${percent.format(model.progress.pricedCoverage)} dos SKUs com saldo têm PVENDA1`}
          info="Saldo físico do M1 multiplicado exclusivamente pelo PVENDA1 da região 11 materializado no M1."
        />
        <MetricCard
          label="Carteira Colgate"
          value={currency.format(model.totals.inboundValue)}
          progress={model.progress.inboundMapping}
          progressLabel={inboundCopy}
          info={`Carteira ainda em aberto. Para cada NF faturada, o sistema procura primeiro no 12.322; se encontrar, retira todo o valor da NF. Se não encontrar no 12.322, procura no 218 e, se encontrar, também retira todo o valor. Uma mesma NF nunca é abatida duas vezes. A Carteira bruta desta fotografia é ${currency.format(model.totals.grossInboundValue)} e já foram baixados ${currency.format(model.totals.receivedInboundValue)}. Quantidades da Carteira são caixas; a projeção física converte para unidades por Un/CX.`}
        />
      </div>
    </section>

    <section className="stock-metric-section">
      <div className="stock-metric-section-head"><span>Posição física e projeção</span></div>
      <div className="stock-metric-grid">
        <MetricCard
          label="Estoque físico"
          value={`${number.format(model.totals.physicalUnits)} un.`}
          progress={model.progress.stockSkuShare}
          progressLabel={model.progress.stockSkuShare === null ? 'Sem itens' : `${number.format(model.totals.itemsWithStock)} de ${number.format(model.totals.items)} SKUs com saldo`}
          info="Posição física já materializada no M1 a partir do relatório 105."
        />
        <MetricCard
          label="Disponível"
          value={`${number.format(model.totals.availableUnits)} un.`}
          progress={model.totals.physicalUnits > 0 ? Math.max(0, model.totals.availableUnits) / model.totals.physicalUnits : null}
          progressLabel={`${number.format(model.totals.reservedUnits)} un. reservadas em pedidos a faturar`}
          info="Estoque físico menos a reserva dos pedidos SALE com status A FATURAR. A reserva continua visível aqui sem ocupar um card próprio."
        />
        <MetricCard
          label="Projetado"
          value={`${number.format(model.totals.projectedUnits)} un.`}
          progress={model.progress.projectedInboundShare}
          progressLabel={model.progress.projectedInboundShare === null ? 'Sem projeção positiva' : `${percent.format(model.progress.projectedInboundShare)} do projetado vem da Carteira`}
          info={`Disponível + ${number.format(model.totals.inboundQty)} unidades previstas da Carteira em aberto. As caixas só entram nesta projeção quando existe vínculo seguro do material com o item e fator Un/CX válido.`}
        />
        <MetricCard
          label="Projetado a custo"
          value={currency.format(model.totals.projectedPurchaseValue)}
          progress={model.totals.projectedPurchaseValue > 0 ? model.totals.inboundValue / model.totals.projectedPurchaseValue : null}
          progressLabel={`${currency.format(model.totals.inboundValue)} vêm da Carteira em aberto`}
          info="Valor do estoque disponível a custo somado somente ao valor ainda em aberto da Carteira Colgate, depois da conciliação das NFs recebidas no 12.322 e, quando não encontradas nele, no 218."
        />
      </div>
    </section>

    <PanelCard>
      <PanelSectionHeader
        eyebrow="CONCILIAÇÃO DA CARTEIRA"
        title="Da Carteira bruta ao saldo em aberto"
        description="Leitura auditável por NF. Primeiro o sistema procura no 12.322; somente se não encontrar ali, procura no 218. Se encontrar em qualquer um dos dois, todo o valor daquela NF sai da Carteira. Uma mesma NF nunca é abatida duas vezes."
      />
      <div className="stock-analysis-note">
        <span>Carteira bruta: <strong>{currency.format(model.totals.grossInboundValue)}</strong></span>
        <span>12.322: {number.format(model.totals.receiptInvoices12322Read)} NF(s) lidas · <strong>{currency.format(model.totals.deductedBy12322Value)}</strong> baixados em {number.format(model.totals.matchedReceiptInvoices12322)} NF(s)</span>
        <span>218: {number.format(model.totals.receiptInvoices218Read)} NF(s) lidas · <strong>{currency.format(model.totals.deductedBy218Value)}</strong> baixados em {number.format(model.totals.additionalReceiptInvoices218)} NF(s) adicionais</span>
        <span>Sobreposição entre fontes: {number.format(model.totals.receiptOverlapInvoices)} NF(s)</span>
        <span>NF(s) faturada(s) da Carteira sem recebimento encontrado: {number.format(model.totals.unmatchedBilledInvoices)}</span>
        <span>Saldo final: <strong>{currency.format(model.totals.inboundValue)}</strong></span>
      </div>
    </PanelCard>

    <div className="stock-overview-main-grid">
      <HealthPanel model={model} />
      <StockTreemap model={model} />
    </div>

    <PanelCard>
      <PanelSectionHeader eyebrow="LEITURA" title="Base da análise" description="Resumo operacional da fotografia ativa. A futura lista de agrupamentos não foi criada nem presumida nesta alteração; vamos definir o contrato dela na próxima etapa." />
      <div className="stock-analysis-note">
        <span>Janela de giro: {period}</span>
        <span>{number.format(model.totals.mappedDemandItems)} SKUs com giro mapeado</span>
        <span>{number.format(model.totals.mappedInboundRows)} de {number.format(model.totals.totalInboundRows)} linhas abertas da Carteira com item + Un/CX</span>
        <span>{number.format(model.totals.launchItems)} lançamentos reconhecidos</span>
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
