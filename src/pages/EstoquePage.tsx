import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { productMatchesStockCodeList } from '../domain/stockCodeFilter';
import {
  buildStockPresentation,
  DEFAULT_STOCK_ALERT_CONFIGURATION,
  StockAlert,
  StockAlertConfiguration,
  StockMovementDirection,
  StockProductView,
  StockReconciliationStatus,
} from '../domain/stockModel';
import { loadStockAlertConfiguration, saveStockAlertConfiguration } from '../store/stockPreferences';
import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { StockCodeListFilter } from '../ui/stock/StockCodeListFilter';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0);
}

function formatDays(value: number | null) {
  return value === null ? '—' : `${formatNumber(value, 1)} dias`;
}

function severityLabel(alert: StockAlert) {
  if (alert.severity === 'critical') return 'CRÍTICO';
  if (alert.severity === 'warning') return 'ATENÇÃO';
  return 'INFO';
}

function statusBadge(status: StockReconciliationStatus) {
  const className = status === 'DIVERGENT' ? 'panel-badge panel-badge-red' : status === 'BLOCKED' ? 'panel-badge panel-badge-amber' : 'panel-badge';
  return <span className={className}>{status}</span>;
}

function alertBadge(alert: StockAlert) {
  const className = alert.severity === 'critical' ? 'panel-badge panel-badge-red' : alert.severity === 'warning' ? 'panel-badge panel-badge-amber' : 'panel-badge';
  return <span className={className}>{severityLabel(alert)}</span>;
}

type PageTab = 'overview' | 'products' | 'movements';
type ProductFilter = 'todos' | 'lancamento' | 'sem-winthor' | 'com-alerta';

export function EstoquePage() {
  const { isLoaded, produtos, metricas, canonical } = useData();
  const [pageTab, setPageTab] = useState<PageTab>('overview');
  const [direction, setDirection] = useState<StockMovementDirection>('ENTRADA');
  const [searchTerm, setSearchTerm] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('todos');
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());
  const [selectedCode, setSelectedCode] = useState('');
  const competence = canonical?.periodStart?.slice(0, 7) || 'global';
  const [alertConfiguration, setAlertConfiguration] = useState<StockAlertConfiguration>(DEFAULT_STOCK_ALERT_CONFIGURATION);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    setAlertConfiguration(loadStockAlertConfiguration(localStorage, competence));
  }, [competence]);

  const inventory = useMemo(() => canonical?.inventory || produtos.map(product => ({
    code: product.codigo,
    description: product.descricao,
    ean: product.ean,
    quantity: product.quantidade,
    costUnit: product.custoUnitario,
    saleUnit: product.vendaUnitario,
    pendingQty: product.saldoPedido,
    pendingCases: product.saldoPedidoCaixas || 0,
    pendingCost: product.saldoPedidoValorCusto || 0,
    pendingSale: product.saldoPedidoValorVenda || 0,
    isLaunch: Boolean(product.isLancamento),
    hasWinthor: product.hasWinthor !== false,
    factoryCode: product.factoryCode || '',
    physicalCases: product.physicalCases || 0,
    physicalUnits: product.physicalUnits || 0,
    grossKg: product.grossKg || 0,
  })), [canonical, produtos]);

  const hasStock8013 = Boolean(canonical?.sources?.some(source => source.kind === 'stock8013' && source.loaded))
    || produtos.some(product => product.physicalUnits !== undefined || product.physicalCases !== undefined);

  const presentation = useMemo(() => buildStockPresentation({
    inventory,
    productSupport: canonical?.support?.products || [],
    transactions: canonical?.transactions || [],
    businessDaysElapsed: canonical?.sellOut?.businessDaysElapsed || 0,
    stockCostValue: metricas.valorEstoqueCompra,
    stockSaleValue: metricas.valorEstoqueVenda,
    hasStock8013,
    alertConfiguration,
  }), [inventory, canonical, metricas.valorEstoqueCompra, metricas.valorEstoqueVenda, hasStock8013, alertConfiguration]);

  const updateAlertConfiguration = (patch: Partial<StockAlertConfiguration>) => {
    setAlertConfiguration(current => {
      const next = { ...current, ...patch };
      if (typeof localStorage !== 'undefined') saveStockAlertConfiguration(localStorage, competence, next);
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return presentation.products.filter(product => {
      if (search && ![product.code, product.factoryCode, product.ean, product.description, product.brand, product.subcategory]
        .some(value => String(value || '').toLowerCase().includes(search))) return false;
      if (importedCodes.size && !productMatchesStockCodeList({ codigo: product.code, factoryCode: product.factoryCode, ean: product.ean }, importedCodes)) return false;
      if (productFilter === 'lancamento' && !product.isLaunch) return false;
      if (productFilter === 'sem-winthor' && product.hasWinthor) return false;
      if (productFilter === 'com-alerta' && product.alerts.length === 0) return false;
      return true;
    });
  }, [presentation.products, searchTerm, importedCodes, productFilter]);

  const selectedProduct = useMemo(() => presentation.products.find(product => product.code === selectedCode) || null, [presentation.products, selectedCode]);

  const movements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    return presentation.movements.filter(movement => {
      if (movement.direction !== direction) return false;
      if (!search) return true;
      return [movement.status, movement.movement, movement.document, movement.order, movement.invoice, movement.sku, movement.ean, movement.product, movement.partner, movement.partnerDocument, movement.origin]
        .some(value => String(value || '').toLowerCase().includes(search));
    });
  }, [presentation.movements, direction, movementSearch]);

  if (!isLoaded) {
    return <PanelEmptyState icon="◆" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e carregue Posição 105, Cadastro 286, Estoque 8013, Carteira e Vendas 8022.</>} />;
  }

  const tabButton = (tab: PageTab, label: string) => (
    <button className={`panel-chip${pageTab === tab ? ' is-active' : ''}`} onClick={() => setPageTab(tab)}>{label}</button>
  );

  const thresholdInput = (label: string, key: 'riskCoverageDays' | 'lowCoverageDays' | 'excessCoverageDays', value: number | null) => (
    <label style={{ display: 'grid', gap: '6px', minWidth: '160px' }}>
      <span className="panel-mini-label">{label}</span>
      <input className="panel-input" type="number" min="0" step="1" value={value ?? ''} placeholder="Desativado"
        onChange={event => updateAlertConfiguration({ [key]: event.target.value === '' ? null : Math.max(Number(event.target.value) || 0, 0) })} />
    </label>
  );

  const renderOverview = () => (
    <div className="panel-stack">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
        <PanelKpi label="Estoque a custo" value={formatCurrency(metricas.valorEstoqueCompra)} detail="Posição 105" />
        <PanelKpi label="Estoque a venda" value={formatCurrency(metricas.valorEstoqueVenda)} detail="Preço de venda de referência do estoque" />
        <PanelKpi label="Estoque físico" value={`${formatNumber(presentation.summary.physicalUnits)} un.`} detail={`${formatNumber(presentation.summary.physicalCases, 2)} cx + ${formatNumber(presentation.summary.looseUnits)} un. avulsas identificadas`} />
        <PanelKpi label="Reservado" value={`${formatNumber(presentation.summary.reservedUnits)} un.`} detail="Pedidos 8022 ainda A Faturar" tone="amber" />
        <PanelKpi label="Disponível" value={`${formatNumber(presentation.summary.availableUnits)} un.`} detail={presentation.reservation.mode === 'POSICAO_BRUTA' ? 'Posição menos reserva, uma única vez' : 'Posição exportada preservada'} tone="green" />
        <PanelKpi label="Entradas previstas" value={`${formatNumber(presentation.summary.pendingUnits)} un.`} detail={`${formatNumber(presentation.summary.pendingCases, 2)} cx em Carteira`} tone="blue" />
        <PanelKpi label="Estoque projetado" value={`${formatNumber(presentation.summary.projectedUnits)} un.`} detail="Disponível + entradas previstas" tone="purple" />
        <PanelKpi label="SKUs" value={formatNumber(presentation.summary.skuCount)} detail={`${formatNumber(presentation.summary.zeroSkuCount)} com físico zerado · ${formatNumber(presentation.summary.launchCount)} lançamentos`} />
      </div>

      <PanelCard>
        <PanelSectionHeader eyebrow="RESERVA" title="Reconciliação da posição do Winthor"
          description="O 8022 A Faturar identifica o comprometimento. A reserva só é subtraída da posição quando 105 × 8013 × 8022 comprovam que a posição é bruta; caso contrário, a posição é preservada para impedir dupla subtração."
          action={statusBadge(presentation.reservation.mode === 'POSICAO_BRUTA' || presentation.reservation.mode === 'POSICAO_LIQUIDA' ? 'OK' : 'BLOCKED')} />
        <div className="panel-subgrid">
          <div className="panel-mini-stat"><div className="panel-mini-label">Modo detectado</div><div className="panel-mini-value">{presentation.reservation.mode.replaceAll('_', ' ')}</div><div className="panel-mini-note">{presentation.reservation.note}</div></div>
          <div className="panel-mini-stat"><div className="panel-mini-label">SKUs com evidência</div><div className="panel-mini-value">{presentation.reservation.evidenceRows}</div><div className="panel-mini-note">Bruta: {presentation.reservation.grossMatches} · Líquida: {presentation.reservation.netMatches}</div></div>
          <div className="panel-mini-stat"><div className="panel-mini-label">Reserva sem SKU</div><div className="panel-mini-value">{formatNumber(presentation.reservation.unresolvedReservedUnits)} un.</div><div className="panel-mini-note">Nunca é descartada silenciosamente.</div></div>
        </div>
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="ALERTAS" title={`Central de alertas · ${presentation.alerts.length}`}
          description="Ruptura, risco, baixo estoque e excesso só recebem classificação oficial quando seus parâmetros forem explicitamente configurados. Os alertas cadastrais e de reconciliação continuam automáticos." />
        <div className="panel-toolbar" style={{ marginBottom: '18px', alignItems: 'end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '42px' }}>
            <input type="checkbox" checked={alertConfiguration.zeroStockAsRupture} onChange={event => updateAlertConfiguration({ zeroStockAsRupture: event.target.checked })} />
            <span style={{ color: 'var(--panel-text-dim)', fontSize: '0.78rem' }}>Classificar estoque zero como ruptura</span>
          </label>
          {thresholdInput('Risco de ruptura · dias', 'riskCoverageDays', alertConfiguration.riskCoverageDays)}
          {thresholdInput('Baixo estoque · dias', 'lowCoverageDays', alertConfiguration.lowCoverageDays)}
          {thresholdInput('Excesso · dias', 'excessCoverageDays', alertConfiguration.excessCoverageDays)}
        </div>
        {presentation.alerts.length === 0 ? <div className="panel-mini-note">Nenhum alerta detectado com os dados e limites atuais.</div> : (
          <div className="panel-table-wrap" style={{ maxHeight: '360px' }}><table className="panel-table">
            <thead><tr><th>Nível</th><th>Alerta</th><th>SKU</th><th>Produto</th><th>Detalhe</th></tr></thead>
            <tbody>{presentation.alerts.map(alert => <tr key={alert.id}><td>{alertBadge(alert)}</td><td className="is-strong">{alert.kind.replaceAll('_', ' ')}</td><td>{alert.sku}</td><td>{alert.product}</td><td className="is-muted">{alert.message}</td></tr>)}</tbody>
          </table></div>
        )}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="AUDITORIA" title="Reconciliações automáticas do Estoque" description="Diferenças e regras ainda não comprovadas permanecem visíveis; um bloqueio não é convertido em OK por consistência interna." />
        <div className="panel-table-wrap"><table className="panel-table">
          <thead><tr><th>Status</th><th>Validação</th><th>Esperado</th><th>Calculado</th><th>Diferença</th><th>Fonte / observação</th></tr></thead>
          <tbody>{presentation.reconciliation.map(check => <tr key={check.id}>
            <td>{statusBadge(check.status)}</td><td className="is-strong">{check.label}</td><td>{typeof check.expected === 'number' ? formatNumber(check.expected, 2) : check.expected ?? '—'}</td><td>{typeof check.calculated === 'number' ? formatNumber(check.calculated, 2) : check.calculated ?? '—'}</td><td>{check.difference === null ? '—' : formatNumber(check.difference, 2)}</td><td className="is-muted">{check.source}{check.note ? ` · ${check.note}` : ''}</td>
          </tr>)}</tbody>
        </table></div>
      </PanelCard>
    </div>
  );

  const renderProductDetails = (product: StockProductView) => {
    const timeline = presentation.movements.filter(movement => movement.sku === product.code).slice(0, 50);
    return <PanelCard style={{ marginTop: '16px', borderLeft: '4px solid var(--panel-red)' }}>
      <PanelSectionHeader eyebrow="FICHA DO SKU" title={product.description} description={`${product.code} · ${product.ean || 'SEM EAN'}${product.brand ? ` · ${product.brand}` : ''}`} action={<button className="panel-secondary-button" onClick={() => setSelectedCode('')}>Fechar</button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          ['Código Winthor', product.code], ['Código fabricante', product.factoryCode || '—'], ['EAN', product.ean || '—'], ['Marca', product.brand || '—'], ['Linha / sublinha', [product.line, product.subcategory].filter(Boolean).join(' · ') || '—'], ['Un/CX', product.unitsPerCase > 0 ? formatNumber(product.unitsPerCase, 2) : '—'], ['Caixas completas', formatNumber(product.physicalCases, 2)], ['Unidades avulsas', formatNumber(product.looseUnits)], ['Total físico', `${formatNumber(product.physicalTotalUnits)} un.`], ['Caixas equivalentes', product.equivalentCases === null ? '—' : formatNumber(product.equivalentCases, 2)], ['Reservado', `${formatNumber(product.reservedUnits)} un.`], ['Disponível', `${formatNumber(product.availableUnits)} un.`], ['Carteira', `${formatNumber(product.pendingUnits)} un. · ${formatNumber(product.pendingCases, 2)} cx`], ['Projetado', `${formatNumber(product.projectedUnits)} un.`], ['Custo unitário', product.costUnit > 0 ? formatCurrency(product.costUnit) : '—'], ['Venda referência', product.saleUnit > 0 ? formatCurrency(product.saleUnit) : '—'], ['Cobertura ritmo faturado', formatDays(product.coverageDays)], ['Cobertura projetada', formatDays(product.projectedCoverageDays)],
        ].map(([label, value]) => <div key={label} className="panel-mini-stat"><div className="panel-mini-label">{label}</div><div className="panel-mini-value" style={{ fontSize: '1rem' }}>{value}</div></div>)}
      </div>
      <div className="panel-badges" style={{ marginBottom: '18px' }}>{product.isLaunch && <span className="panel-badge panel-badge-red">LANÇAMENTO</span>}{!product.hasWinthor && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}{product.alerts.map(alert => <span key={alert.id} title={alert.message}>{alertBadge(alert)}</span>)}</div>
      <PanelSectionHeader eyebrow="LINHA DO TEMPO" title={`Movimentos comprovados · ${timeline.length}`} description="Enquanto o razão detalhado de movimentações não estiver disponível, aparecem somente 8022 e Carteira. NF, transferência, devolução e ajuste não são inventados." />
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Data</th><th>Status</th><th>Movimento</th><th>Caixas</th><th>Total un.</th><th>Valor</th><th>Origem</th></tr></thead>
        <tbody>{timeline.length ? timeline.map(movement => <tr key={movement.id}><td>{movement.date || 'Sem data na fonte'}</td><td>{movement.status}</td><td>{movement.movement}</td><td>{formatNumber(movement.cases, 2)}</td><td>{formatNumber(movement.totalUnits)}</td><td>{formatCurrency(movement.value)}</td><td>{movement.origin}</td></tr>) : <tr><td colSpan={7} className="is-muted">Nenhum movimento comprovado nas fontes atuais.</td></tr>}</tbody>
      </table></div>
    </PanelCard>;
  };

  const renderProducts = () => <div className="panel-stack">
    <PanelCard>
      <PanelSectionHeader eyebrow="PRODUTOS" title={`Posição por SKU · ${filteredProducts.length} de ${presentation.products.length}`} description="Caixas, unidades avulsas, total físico, reserva, disponível, Carteira e projeção são exibidos separadamente. Faturado mês considera somente movimentos FATURADOS do 8022." />
      <div className="panel-toolbar" style={{ marginBottom: '12px' }}>
        <div className="panel-chips"><button className={`panel-chip${productFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setProductFilter('todos')}>Todos · {presentation.products.length}</button><button className={`panel-chip${productFilter === 'lancamento' ? ' is-active' : ''}`} onClick={() => setProductFilter('lancamento')}>Lançamentos · {presentation.summary.launchCount}</button><button className={`panel-chip is-warning${productFilter === 'sem-winthor' ? ' is-active' : ''}`} onClick={() => setProductFilter('sem-winthor')}>Sem Winthor · {presentation.summary.noWinthorCount}</button><button className={`panel-chip${productFilter === 'com-alerta' ? ' is-active' : ''}`} onClick={() => setProductFilter('com-alerta')}>Com alerta</button></div>
        <input className="panel-input" value={searchTerm} placeholder="Buscar código, EAN, produto, marca..." onChange={event => setSearchTerm(event.target.value)} />
      </div>
      <div className="panel-toolbar" style={{ marginBottom: '18px' }}><StockCodeListFilter products={produtos} codes={importedCodes} onChange={setImportedCodes} /><button className="panel-secondary-button" onClick={() => { setSearchTerm(''); setProductFilter('todos'); setImportedCodes(new Set()); }}>Limpar filtros</button></div>
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Código</th><th>EAN</th><th>Produto</th><th className="is-right">Cx</th><th className="is-right">Avulsas</th><th className="is-right">Total físico</th><th className="is-right">Cx equiv.</th><th className="is-right">Reservado</th><th className="is-right">Disponível</th><th className="is-right">Carteira</th><th className="is-right">Projetado</th><th className="is-right">Faturado mês</th><th className="is-right">Cobertura ritmo faturado</th><th className="is-right">Custo un.</th><th className="is-right">Venda ref.</th><th>Alertas</th><th></th></tr></thead>
        <tbody>{filteredProducts.map(product => <tr key={product.code}><td className="is-strong">{product.code}</td><td className="is-muted">{product.ean || '—'}</td><td><div className="panel-badges"><span className="is-strong">{product.description}</span>{product.isLaunch && <span className="panel-badge panel-badge-red">LANÇAMENTO</span>}{!product.hasWinthor && product.pendingUnits > 0 && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}</div></td><td className="is-right">{formatNumber(product.physicalCases, 2)}</td><td className="is-right">{formatNumber(product.looseUnits)}</td><td className="is-right is-strong">{formatNumber(product.physicalTotalUnits)}</td><td className="is-right">{product.equivalentCases === null ? '—' : formatNumber(product.equivalentCases, 2)}</td><td className="is-right">{formatNumber(product.reservedUnits)}</td><td className="is-right is-strong">{formatNumber(product.availableUnits)}</td><td className="is-right">{formatNumber(product.pendingUnits)}</td><td className="is-right is-strong">{formatNumber(product.projectedUnits)}</td><td className="is-right">{formatNumber(product.soldUnits)}</td><td className="is-right">{formatDays(product.coverageDays)}</td><td className="is-right">{product.costUnit > 0 ? formatCurrency(product.costUnit) : '—'}</td><td className="is-right">{product.saleUnit > 0 ? formatCurrency(product.saleUnit) : '—'}</td><td>{product.alerts.length ? <span className="panel-badge panel-badge-amber">{product.alerts.length}</span> : '—'}</td><td><button className="panel-secondary-button" onClick={() => setSelectedCode(product.code)}>Abrir</button></td></tr>)}</tbody>
      </table></div>
    </PanelCard>
    {selectedProduct ? renderProductDetails(selectedProduct) : null}
  </div>;

  const renderMovements = () => <PanelCard>
    <PanelSectionHeader eyebrow="ENTRADAS E SAÍDAS" title={direction === 'ENTRADA' ? `Entradas · ${movements.length}` : `Saídas · ${movements.length}`} description="Uma única área de movimentações com dois módulos internos. A Carteira é Entrada prevista; o 8022 FATURADO é Saída realizada e A FATURAR é Saída reservada. Filtros são preservados ao alternar." />
    <div className="panel-toolbar" style={{ marginBottom: '16px' }}><div className="panel-chips"><button className={`panel-chip${direction === 'ENTRADA' ? ' is-active' : ''}`} onClick={() => setDirection('ENTRADA')}>Entradas</button><button className={`panel-chip${direction === 'SAIDA' ? ' is-active' : ''}`} onClick={() => setDirection('SAIDA')}>Saídas</button></div><input className="panel-input" value={movementSearch} placeholder="Filtrar movimento, SKU, parceiro, origem..." onChange={event => setMovementSearch(event.target.value)} /></div>
    <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Data</th><th>Status</th><th>Movimento</th><th>Documento</th><th>Pedido</th><th>NF</th><th>SKU</th><th>Produto</th><th>Parceiro</th><th className="is-right">Caixas</th><th className="is-right">Un. avulsas</th><th className="is-right">Total unidades</th><th className="is-right">Valor</th><th>Origem</th></tr></thead>
      <tbody>{movements.length ? movements.map(movement => <tr key={movement.id}><td>{movement.date || '—'}</td><td><span className="panel-badge">{movement.status}</span></td><td className="is-strong">{movement.movement}</td><td>{movement.document || '—'}</td><td>{movement.order || '—'}</td><td>{movement.invoice || '—'}</td><td>{movement.sku}</td><td>{movement.product}</td><td>{movement.partner || '—'}</td><td className="is-right">{formatNumber(movement.cases, 2)}</td><td className="is-right">{formatNumber(movement.looseUnits)}</td><td className="is-right is-strong">{formatNumber(movement.totalUnits)}</td><td className="is-right">{formatCurrency(movement.value)}</td><td>{movement.origin}</td></tr>) : <tr><td colSpan={14} className="is-muted">Nenhum movimento comprovado para este módulo com os filtros atuais.</td></tr>}</tbody>
    </table></div>
  </PanelCard>;

  return <PanelPage title="Estoque" metricLabel="Valor potencial de venda" metricValue={formatCurrency(metricas.valorEstoqueVenda)}><div className="panel-stack"><div className="panel-chips" style={{ marginBottom: '4px' }}>{tabButton('overview', 'Visão Geral')}{tabButton('products', 'Produtos')}{tabButton('movements', 'Entradas e Saídas')}</div>{pageTab === 'overview' ? renderOverview() : pageTab === 'products' ? renderProducts() : renderMovements()}</div></PanelPage>;
}
