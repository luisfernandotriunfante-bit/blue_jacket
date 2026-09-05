import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel, type StockOverviewModel } from '../canonical/stockOverviewModel';
import type { CanonicalList } from '../canonical/types';
import { inboundForecasts } from '../canonical/reportSettings';
import { useData } from '../store/DataContext';
import { MigrationPage } from '../ui/pattern/MigrationEmptyState';
import { ProductCatalogPage } from './ProductCatalogPage';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { buildHierarchicalTreemap } from '../ui/charts/hierarchicalTreemapLayout';
import './EstoquePage.css';

export type EstoqueView = 'overview' | 'products' | 'movements' | 'purchase-helper';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
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

const LINE_HUES = [351, 207, 148, 272, 38];
const LINE_HUE_NAMES = ['rosa', 'azul', 'verde', 'violeta', 'dourado'];

function tileColor(lineIndex: number, tileIndex: number, aggregate: boolean, classified: boolean) {
  if (!classified) return 'linear-gradient(145deg, rgba(86, 96, 112, .94), rgba(43, 50, 61, .96))';
  const hue = LINE_HUES[lineIndex % LINE_HUES.length]!;
  const shift = (tileIndex % 4) * 4;
  if (aggregate) return `linear-gradient(145deg, hsl(${hue} 23% ${29 + shift}% / .96), hsl(${hue} 19% ${20 + shift}% / .98))`;
  return `linear-gradient(145deg, hsl(${hue} ${58 - shift}% ${32 + shift}% / .98), hsl(${hue + 10} ${48 - shift}% ${22 + shift}% / .99))`;
}

function StockTreemap({ model }: { model: StockOverviewModel }) {
  const totalValue = model.treemap.reduce((sum, group) => sum + group.totalValue, 0);
  const emptyLines = model.treemap.filter(group => group.totalValue <= 0).map(group => group.line);
  const missingSubbrandItems = model.treemap.reduce((sum, group) => sum + group.itemsWithoutSubbrand, 0);

  return <PanelCard>
    <PanelSectionHeader
      eyebrow="ESTOQUE POR LINHA"
      title="Composição por sub-brand"
      description="Cada painel é um treemap: a área de cada bloco é proporcional ao valor da sub-brand no estoque físico a PVENDA1."
    />
    {model.treemap.some(group => group.totalValue > 0) ? <>
      <div className="stock-line-composition-list" aria-label="Composição de estoque por linha comercial e sub-brand">
        {model.treemap.map((group, lineIndex) => {
          const rectangles = buildHierarchicalTreemap(group.tiles.map(tile => ({ id: tile.key, value: tile.saleValue, data: tile })), { x: 0, y: 0, width: 100, height: 100 });
          return <section className="stock-line-composition" key={group.line} data-hue={LINE_HUE_NAMES[lineIndex]} aria-label={`${group.line}: ${currency.format(group.totalValue)}`}>
          <header className="stock-line-composition-head">
            <strong>{group.line}</strong>
            <span>{currency.format(group.totalValue)}</span>
            <small>{number.format(group.subbrands)} sub-brands · {percent.format(totalValue ? group.totalValue / totalValue : 0)} do estoque</small>
          </header>
          {group.tiles.length ? <div className="stock-line-composition-body">
            <div className="stock-subbrand-treemap" aria-label={`Treemap proporcional das sub-brands de ${group.line}`}>
          {group.tiles.map((tile, tileIndex) => {
            const rect = rectangles.get(tile.key);
            if (!rect) return null;
            const share = group.totalValue > 0 ? tile.saleValue / group.totalValue : 0;
            const label = `${group.line}, ${tile.label}: ${currency.format(tile.saleValue)}; ${number.format(tile.items)} SKU(s); ${percent.format(share)} da linha.`;
            return <div
              key={tile.key}
              className="stock-subbrand-tile"
              data-classified={tile.classified ? 'true' : 'false'}
              tabIndex={0}
              aria-label={label}
              title={label}
              style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, background: tileColor(lineIndex, tileIndex, tile.aggregate, tile.classified) }}
            >
              <strong>{tile.label}</strong>
              <span>{currency.format(tile.saleValue)}</span>
              <small>{percent.format(share)}</small>
            </div>;
          })}</div></div> : <div className="stock-line-composition-empty">Sem estoque valorizado nesta linha.</div>}
        </section>;
        })}
      </div>
      <div className="stock-treemap-legend">
        <span>Área maior = maior valor de estoque. Não há corte em “Outras sub-brands”.</span>
        <span>Produtos, fragrâncias e SKUs não viram blocos: cada bloco é uma sub-brand oficial do 8013.</span>
        {missingSubbrandItems ? <span>Bloco cinza: {number.format(missingSubbrandItems)} SKU(s) sem sub-brand informada no 8013.</span> : null}
        {emptyLines.length ? <span>Sem estoque valorizado: {emptyLines.join(' · ')}.</span> : null}
      </div>
    </> : <PanelEmptyState title="Sem estoque valorizado nas linhas comerciais" description="Carregue o estoque e a PCTABPR com PVENDA1 para materializar o gráfico proporcional." />}
  </PanelCard>;
}

export function HealthPanel({ model }: { model: StockOverviewModel }) {
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

function InboundForecastPanel({ model }: { model: StockOverviewModel }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [
    { key: '0-7', label: 'Até 7 dias', match: (days: number | null) => days !== null && days >= 0 && days <= 7 },
    { key: '8-15', label: '8 a 15 dias', match: (days: number | null) => days !== null && days >= 8 && days <= 15 },
    { key: 'none', label: 'Sem previsão', match: (days: number | null) => days === null },
  ];
  const grouped = buckets.map(bucket => {
    const entries = model.inboundForecasts.filter(forecast => bucket.match(forecast.date ? Math.ceil((new Date(`${forecast.date}T12:00:00`).getTime() - today.getTime()) / 86400000) : null));
    return { ...bucket, invoices: entries.flatMap(forecast => forecast.invoices), totalValue: entries.reduce((sum, forecast) => sum + forecast.totalValue, 0) };
  });
  return <PanelCard>
    <PanelSectionHeader eyebrow="ENTRADAS PREVISTAS" title="Próximas entradas previstas" description="Resumo da Carteira em aberto. A previsão é preenchida e o detalhamento de cada NF ficam em Entradas e Saídas." />
    <div className="stock-forecast-grid">
      {grouped.map(group => <article className="stock-forecast-card" data-empty={!group.invoices.length} key={group.key}>
          <header><strong>{group.label}</strong><span>{number.format(group.invoices.length)} NF(s)</span></header>
          <div className="stock-forecast-total">{group.invoices.length ? currency.format(group.totalValue) : '—'}</div>
          <small>{group.invoices.length ? 'Notas aguardando entrada' : 'Nenhuma nota neste período'}</small>
        </article>)}
    </div>
  </PanelCard>;
}

function StockOverview({ m1, m3, m4 }: { m1: CanonicalList; m3: CanonicalList; m4: CanonicalList }) {
  const [forecastVersion, setForecastVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setForecastVersion(version => version + 1);
    window.addEventListener('blue-jacket-report-settings-changed', refresh);
    return () => window.removeEventListener('blue-jacket-report-settings-changed', refresh);
  }, []);
  const model = useMemo(() => buildStockOverviewModel({ m1, m3, m4, forecasts: inboundForecasts() }), [m1, m3, m4, forecastVersion]);
  const inboundMapping = model.progress.inboundMapping;
  const inboundCopy = model.totals.totalInboundQty > 0
    ? `${number.format(model.totals.totalInboundQty)} cx. em aberto · ${inboundMapping === null ? 'sem vínculo' : `${percent.format(inboundMapping)} com item + Un/CX`}`
    : 'Sem Carteira em aberto';

  return <PanelPage title="Estoque"><div className="panel-stack stock-page-stack">
    <section className="stock-metric-section">
      <div className="stock-metric-section-head"><span>Indicadores de decisão</span></div>
      <div className="stock-metric-grid">
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
          label="Carteira em trânsito"
          value={currency.format(model.totals.inboundValue)}
          progress={model.progress.inboundMapping}
          progressLabel={inboundCopy}
          info={`Carteira ainda em aberto. Para cada NF faturada, o sistema procura primeiro no 12.322; se encontrar, retira todo o valor da NF. Se não encontrar no 12.322, procura no 218 e, se encontrar, também retira todo o valor. Uma mesma NF nunca é abatida duas vezes. A Carteira bruta desta fotografia é ${currency.format(model.totals.grossInboundValue)} e já foram baixados ${currency.format(model.totals.receivedInboundValue)}. Quantidades da Carteira são caixas; a projeção física converte para unidades por Un/CX.`}
        />
        <MetricCard
          label="Projetado a custo"
          value={currency.format(model.totals.projectedPurchaseValue)}
          progress={model.totals.projectedPurchaseValue > 0 ? model.totals.inboundValue / model.totals.projectedPurchaseValue : null}
          progressLabel={`${currency.format(model.totals.inboundValue)} vêm da Carteira em aberto`}
          info="Valor do estoque disponível a custo somado somente ao valor ainda em aberto da Carteira Colgate, depois da conciliação das NFs recebidas no 12.322 e, quando não encontradas nele, no 218."
        />
        <MetricCard
          label="Projetado a venda"
          value={currency.format(model.totals.projectedSaleValue)}
          progress={model.totals.projectedSaleValue > 0 ? (model.totals.projectedSaleValue - model.totals.availableSaleValue) / model.totals.projectedSaleValue : null}
          progressLabel={`${currency.format(Math.max(0, model.totals.projectedSaleValue - model.totals.availableSaleValue))} em entradas vinculadas`}
          info="Estoque disponível mais as entradas abertas da Carteira que têm item, conversão Un/CX e PVENDA1. Toda a projeção é valorizada por PVENDA1; o valor bruto da nota não é usado como preço de venda."
        />
      </div>
    </section>

    <StockTreemap model={model} />

    <InboundForecastPanel model={model} />
  </div></PanelPage>;
}

export function EstoquePage({ view = 'overview' }: { view?: EstoqueView }) {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m3: CanonicalList; m4: CanonicalList } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if ((view !== 'overview' && view !== 'products') || !activeCanonical) { setLists(null); return; }
    let live = true;
    setLists(null);
    setError('');
    Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M3_MOVIMENTO_VENDAS'), loadCandidateList('M4_HISTORICO_TRANSICAO')])
      .then(([m1, m3, m4]) => { if (live) setLists({ m1, m3, m4 }); })
      .catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [activeCanonical, view]);

  if (view === 'overview' || view === 'products') {
    if (!activeCanonical) return <PanelPage title={view === 'products' ? 'Produtos' : 'Estoque'}><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Esta tela usa exclusivamente o bundle canônico ativo. Atualize as bases para materializar a lista." /></PanelPage>;
    if (error) return <PanelPage title={view === 'products' ? 'Produtos' : 'Estoque'}><PanelAlert tone="error">Erro ao carregar as listas canônicas: {error}</PanelAlert></PanelPage>;
    if (!lists) return <PanelPage title={view === 'products' ? 'Produtos' : 'Estoque'}><PanelEmptyState variant="page" title="Carregando dados" description="Leitura passiva das listas canônicas ativas." /></PanelPage>;
    return view === 'products' ? <ProductCatalogPage m1={lists.m1} m3={lists.m3} m4={lists.m4} /> : <StockOverview {...lists} />;
  }

  const configuration = view === 'movements'
      ? { heading: 'Entradas e Saídas', columns: ['Data', 'Tipo', 'Situação', 'Documento', 'Produto', 'Quantidade', 'Origem'] }
      : { heading: 'Auxiliar de Pedidos', columns: ['Produto', 'Giro', 'Cobertura', 'Disponível', 'Carteira', 'Projetado', 'Sugestão', 'Motivo'] };
  return <MigrationPage title="Estoque" heading={configuration.heading} columns={configuration.columns} kpis={['Estrutura preservada']} description="Esta aba será fechada na próxima etapa. Nenhuma regra provisória de compra ou movimento foi ativada." />;
}
