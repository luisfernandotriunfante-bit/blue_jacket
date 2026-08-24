import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { productMatchesStockCodeList } from '../domain/stockCodeFilter';
import { classifyStockRisk, stockRiskLabel, StockRiskStatus } from '../domain/stockRisk';
import {
  buildStockPresentation,
  DEFAULT_STOCK_ALERT_CONFIGURATION,
  isOperationalNoWinthor,
  prioritizeStockAlerts,
  StockAlert,
  StockAlertConfiguration,
  StockMovementDirection,
  StockPortfolioMovement,
  StockProductView,
} from '../domain/stockModel';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
import { loadStockAlertConfiguration, saveStockAlertConfiguration } from '../store/stockPreferences';
import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { StockCodeListFilter } from '../ui/stock/StockCodeListFilter';
import '../ui/stock/stock-layout.css';

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

function alertBadge(alert: StockAlert) {
  const className = alert.severity === 'critical' ? 'panel-badge panel-badge-red' : alert.severity === 'warning' ? 'panel-badge panel-badge-amber' : 'panel-badge';
  return <span className={className}>{severityLabel(alert)}</span>;
}

function riskBadge(status: StockRiskStatus) {
  if (status === 'ruptura') return <span className="panel-badge panel-badge-red">{stockRiskLabel(status)}</span>;
  if (status === 'risco') return <span className="panel-badge panel-badge-amber">{stockRiskLabel(status)}</span>;
  if (status === 'ok') return <span className="panel-badge panel-badge-green">{stockRiskLabel(status)}</span>;
  return <span className="panel-badge">{stockRiskLabel(status)}</span>;
}

export type EstoqueView = 'overview' | 'products' | 'movements';
type CatalogFilter = 'todos' | 'lancamento' | 'sem-winthor';
type RiskFilter = 'todos' | 'ruptura' | 'risco' | 'sem-giro' | 'ok';

export function EstoquePage({ view = 'overview' }: { view?: EstoqueView }) {
  const { canonical } = useData();
  const [direction, setDirection] = useState<StockMovementDirection>('ENTRADA');
  const [searchTerm, setSearchTerm] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>('todos');
  const [statusFilter, setStatusFilter] = useState<RiskFilter>('todos');
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());
  const [selectedCode, setSelectedCode] = useState('');
  const competence = canonical?.periodStart?.slice(0, 7) || 'global';
  const [alertConfiguration, setAlertConfiguration] = useState<StockAlertConfiguration>(DEFAULT_STOCK_ALERT_CONFIGURATION);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    setAlertConfiguration(loadStockAlertConfiguration(localStorage, competence));
  }, [competence]);

  const inventory = canonical?.inventory || [];
  const unified = isUnifiedCanonicalState(canonical) ? canonical.unified : null;
  const hasStock105 = Boolean(canonical?.sources.some(source => source.kind === 'stock105' && source.loaded));

  const presentation = useMemo(() => buildStockPresentation({
    inventory,
    productSupport: canonical?.support.products || [],
    itemCodeSupport: canonical?.support.itemCodes || [],
    transactions: canonical?.transactions || [],
    businessDaysElapsed: canonical?.sellOut.businessDaysElapsed || 0,
    stockCostValue: canonical?.stock.costValue || 0,
    stockSaleValue: canonical?.stock.saleValue || 0,
    hasStock105,
    receiptHeaders: unified?.receiptHeaders || [],
    receiptItems: unified?.receiptItems || [],
    inboundOrders: unified?.inboundOrders || [],
    itemMaster: unified?.items || [],
    alertConfiguration,
  }), [inventory, canonical, unified, hasStock105, alertConfiguration]);

  // O filtro usa exatamente o catálogo final exibido. Assim, lançamento restaurado por EAN também pode ser encontrado pela lista importada.
  const stockCodeProducts = useMemo(() => presentation.products.map(product => ({ codigo: product.code, factoryCode: product.factoryCode, ean: product.ean })), [presentation.products]);

  const updateAlertConfiguration = (patch: Partial<StockAlertConfiguration>) => {
    setAlertConfiguration(current => {
      const next = { ...current, ...patch };
      if (typeof localStorage !== 'undefined') saveStockAlertConfiguration(localStorage, competence, next);
      return next;
    });
  };

  const riskStatusByCode = useMemo(() => new Map(presentation.products.map(product => [product.code, classifyStockRisk({
    hasWinthor: product.hasWinthor,
    quantity: product.positionUnits,
    soldUnits: product.soldUnits,
    coverageDays: product.coverageDays,
    pendingQty: product.pendingUnits,
    pendingCases: product.pendingCases,
    coverageTargetDays: canonical?.stock.coverageTargetDays || 0,
  })])), [presentation.products, canonical?.stock.coverageTargetDays]);

  const riskCounts = useMemo(() => ({
    ruptura: presentation.products.filter(product => riskStatusByCode.get(product.code) === 'ruptura').length,
    risco: presentation.products.filter(product => riskStatusByCode.get(product.code) === 'risco').length,
    semGiro: presentation.products.filter(product => riskStatusByCode.get(product.code) === 'sem-giro').length,
    ok: presentation.products.filter(product => riskStatusByCode.get(product.code) === 'ok').length,
  }), [presentation.products, riskStatusByCode]);

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return presentation.products.filter(product => {
      if (search && ![product.code, product.factoryCode, product.ean, product.description, product.brand, product.subcategory]
        .some(value => String(value || '').toLowerCase().includes(search))) return false;
      if (importedCodes.size && !productMatchesStockCodeList({ codigo: product.code, factoryCode: product.factoryCode, ean: product.ean }, importedCodes)) return false;
      if (activeFilter === 'lancamento' && !product.isLaunch) return false;
      if (activeFilter === 'sem-winthor' && !isOperationalNoWinthor(product)) return false;
      if (statusFilter !== 'todos' && riskStatusByCode.get(product.code) !== statusFilter) return false;
      return true;
    });
  }, [presentation.products, searchTerm, importedCodes, activeFilter, statusFilter, riskStatusByCode]);

  const selectedProduct = useMemo(() => presentation.products.find(product => product.code === selectedCode) || null, [presentation.products, selectedCode]);

  const movements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    return presentation.movements.filter(movement => {
      if (movement.direction !== direction) return false;
      if (!search) return true;
      return [movement.date, movement.status, movement.movement, movement.document, movement.order, movement.invoice, movement.sku, movement.ean, movement.product, movement.partner, movement.partnerDocument, movement.origin]
        .some(value => String(value || '').toLowerCase().includes(search));
    });
  }, [presentation.movements, direction, movementSearch]);

  if (!canonical) {
    return <PanelPage title="Estoque"><PanelEmptyState variant="page" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e carregue Posição 105, Cadastro 286, Estoque 8013, Carteira e Vendas 8022.</>} /></PanelPage>;
  }

  const thresholdInput = (label: string, key: 'riskCoverageDays' | 'lowCoverageDays' | 'excessCoverageDays', value: number | null) => (
    <label className="panel-field" style={{ minWidth: '160px' }}>
      <span className="panel-field-label">{label}</span>
      <input className="panel-input" type="number" min="0" step="1" value={value ?? ''} placeholder="Desativado"
        onChange={event => updateAlertConfiguration({ [key]: event.target.value === '' ? null : Math.max(Number(event.target.value) || 0, 0) })} />
    </label>
  );

  const renderOverview = () => {
    const projectedSale = canonical.stock.projectedSaleValue;
    const projectedCost = canonical.stock.projectedCostValue;
    const winthorSkus = inventory.filter(item => item.hasWinthor).length;
    const externalCatalog = Math.max(presentation.summary.skuCount - winthorSkus, 0);
    const quantityDivergences = presentation.products.filter(product => Math.abs(product.quantityDifference) > 0.001).length;
    const reservationConfirmed = presentation.reservation.mode === 'POSICAO_BRUTA';
    const priorityAlerts = prioritizeStockAlerts(presentation.alerts, 30);
    const unvaluedPortfolioSkus = presentation.products.filter(product => (product.pendingCases > 0 || product.pendingUnits > 0) && (product.pendingUnits <= 0 || product.saleUnit <= 0)).length;
    const physicalPackingNote = `${formatNumber(presentation.summary.physicalCases, 2)} cx completas + ${formatNumber(presentation.summary.looseUnits)} avulsas${presentation.summary.unconvertedPhysicalUnits > 0 ? ` · ${formatNumber(presentation.summary.unconvertedPhysicalUnits)} un. sem Un/CX interno` : ''}`;

    return <div className="panel-stack">
      <div className="stock-financial-grid">
        <PanelKpi label="Estoque a venda" value={formatCurrency(canonical.stock.saleValue)} detail="Físico 105 × PVENDA1 Região 11" tone="red" />
        <PanelKpi label="Estoque a custo" value={formatCurrency(canonical.stock.costValue)} detail="Valor de aquisição da posição 105" />
        <PanelKpi label="Carteira a venda" value={formatCurrency(canonical.stock.pendingPurchaseSale)} detail={unvaluedPortfolioSkus ? `${formatNumber(unvaluedPortfolioSkus)} SKU(s) sem valorização completa por falta de Un/CX e/ou PVENDA1` : `${formatNumber(presentation.summary.pendingCases, 2)} cx previstas · valorização completa por PVENDA1`} tone="blue" />
        <PanelKpi label="Carteira a custo" value={formatCurrency(canonical.stock.pendingPurchaseCost)} detail={`Projeção a custo: ${formatCurrency(projectedCost)}`} tone="purple" />
      </div>

      <PanelCard>
        <PanelSectionHeader eyebrow="POSIÇÃO" title="Estoque operacional" description="Físico vem exclusivamente do 105; reserva vem do 8022 A Faturar; Carteira é entrada prevista. O 8013 fornece embalagem interna para decomposição, não saldo físico." />
        <div className="stock-stat-grid">
          <div className="stock-stat"><div className="stock-stat-label">Físico 105</div><div className="stock-stat-value">{formatNumber(presentation.summary.physicalUnits)} un.</div><div className="stock-stat-note">{physicalPackingNote}</div></div>
          <div className="stock-stat stock-stat-amber"><div className="stock-stat-label">Reservado</div><div className="stock-stat-value">{formatNumber(presentation.summary.reservedUnits)} un.</div><div className="stock-stat-note">8022 A Faturar</div></div>
          <div className="stock-stat stock-stat-green"><div className="stock-stat-label">Disponível</div><div className="stock-stat-value">{formatNumber(presentation.summary.availableUnits)} un.</div><div className="stock-stat-note">Físico 105 − reserva, uma única vez</div></div>
          <div className="stock-stat stock-stat-blue"><div className="stock-stat-label">Entradas previstas</div><div className="stock-stat-value">{formatNumber(presentation.summary.pendingUnits)} un.</div><div className="stock-stat-note">{formatNumber(presentation.summary.pendingCases, 2)} cx · Carteira Colgate → Milênio</div></div>
          <div className="stock-stat stock-stat-purple"><div className="stock-stat-label">Projetado</div><div className="stock-stat-value">{formatNumber(presentation.summary.projectedUnits)} un.</div><div className="stock-stat-note">Potencial conhecido: {formatCurrency(projectedSale)}{unvaluedPortfolioSkus ? ' · parcial por pendência de PVENDA1/conversão' : ''}</div></div>
        </div>
        <div className="stock-inline-note">
          <span><strong style={{ color: 'var(--panel-text)' }}>Reserva:</strong> {presentation.reservation.note}</span>
          <span className={`panel-badge ${reservationConfirmed ? 'panel-badge-green' : 'panel-badge-amber'}`}>{presentation.reservation.mode.replaceAll('_', ' ')}</span>
        </div>
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="SAÚDE" title="Situação do estoque" description={`${formatNumber(winthorSkus)} SKUs Winthor · ${formatNumber(externalCatalog)} item(ns) adicionais de catálogo/Carteira.`} />
        <div className="stock-health-grid">
          <div className="stock-stat stock-stat-red"><div className="stock-stat-label">Ruptura</div><div className="stock-stat-value">{formatNumber(riskCounts.ruptura)}</div><div className="stock-stat-note">Somente SKU Winthor com físico zerado</div></div>
          <div className="stock-stat stock-stat-amber"><div className="stock-stat-label">Risco</div><div className="stock-stat-value">{formatNumber(riskCounts.risco)}</div><div className="stock-stat-note">Cobertura abaixo da meta e sem Carteira</div></div>
          <div className="stock-stat"><div className="stock-stat-label">Sem giro</div><div className="stock-stat-value">{formatNumber(riskCounts.semGiro)}</div><div className="stock-stat-note">Sem venda faturada no ritmo atual</div></div>
          <div className="stock-stat stock-stat-amber"><div className="stock-stat-label">Sem Winthor</div><div className="stock-stat-value">{formatNumber(presentation.summary.noWinthorCount)}</div><div className="stock-stat-note">Somente itens presentes na Carteira</div></div>
          <div className="stock-stat stock-stat-purple"><div className="stock-stat-label">Lançamentos</div><div className="stock-stat-value">{formatNumber(presentation.summary.launchCount)}</div><div className="stock-stat-note">Lista oficial por EAN</div></div>
          <div className="stock-stat"><div className="stock-stat-label">Divergências</div><div className="stock-stat-value">{formatNumber(quantityDivergences)}</div><div className="stock-stat-note">Conversão física por SKU</div></div>
        </div>
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="ALERTAS" title={`Central de alertas · ${presentation.alerts.length}`} description="Críticos aparecem primeiro; depois atenção e informação. A auditoria técnica completa permanece na reconciliação do motor." />
        {priorityAlerts.length === 0 ? <div className="panel-mini-note">Nenhum alerta detectado com os dados atuais.</div> : (
          <>
            {presentation.alerts.length > priorityAlerts.length ? <div className="panel-mini-note" style={{ marginBottom: 10 }}>Mostrando os {priorityAlerts.length} alertas de maior prioridade entre {presentation.alerts.length}; nenhum crítico é ocultado por alertas informativos anteriores.</div> : null}
            <div className="panel-table-wrap" style={{ maxHeight: '420px' }}><table className="panel-table">
              <thead><tr><th>Nível</th><th>Alerta</th><th>SKU</th><th>Produto</th><th>Detalhe</th></tr></thead>
              <tbody>{priorityAlerts.map(alert => <tr key={alert.id}><td>{alertBadge(alert)}</td><td className="is-strong">{alert.kind.replaceAll('_', ' ')}</td><td>{alert.sku}</td><td>{alert.product}</td><td className="is-muted">{alert.message}</td></tr>)}</tbody>
            </table></div>
          </>
        )}
        <details className="stock-alert-params">
          <summary>Parâmetros dos alertas de cobertura</summary>
          <div className="panel-toolbar" style={{ marginTop: '14px', alignItems: 'end', justifyContent: 'flex-start' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '42px' }}><input className="panel-checkbox" type="checkbox" checked={alertConfiguration.zeroStockAsRupture} onChange={event => updateAlertConfiguration({ zeroStockAsRupture: event.target.checked })} /><span style={{ color: 'var(--panel-text-dim)', fontSize: '0.78rem' }}>Estoque zero = ruptura</span></label>
            {thresholdInput('Risco · dias', 'riskCoverageDays', alertConfiguration.riskCoverageDays)}
            {thresholdInput('Baixo estoque · dias', 'lowCoverageDays', alertConfiguration.lowCoverageDays)}
            {thresholdInput('Excesso · dias', 'excessCoverageDays', alertConfiguration.excessCoverageDays)}
          </div>
        </details>
      </PanelCard>
    </div>;
  };

  const renderProductDetails = (product: StockProductView) => {
    const timeline = presentation.movements.filter(movement => movement.sku === product.code).slice(0, 50);
    const status = riskStatusByCode.get(product.code) || 'ok';
    return <PanelCard style={{ marginTop: '16px', borderLeft: '4px solid var(--panel-red)' }}>
      <PanelSectionHeader eyebrow="FICHA DO SKU" title={product.description} description={`${product.code} · ${product.ean || 'SEM EAN'}${product.brand ? ` · ${product.brand}` : ''}`} action={<button className="panel-secondary-button" onClick={() => setSelectedCode('')}>Fechar</button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          ['Código Winthor', product.hasWinthor ? product.code : '—'], ['Código fabricante', product.factoryCode || '—'], ['EAN', product.ean || '—'], ['Marca', product.brand || '—'], ['Linha / sublinha', [product.line, product.subcategory].filter(Boolean).join(' · ') || '—'], ['Un/CX interno', product.unitsPerCase > 0 ? formatNumber(product.unitsPerCase, 2) : '—'], ['Un/CX indústria', product.industryUnitsPerCase > 0 ? formatNumber(product.industryUnitsPerCase, 2) : '—'], ['Posição 105', `${formatNumber(product.positionUnits)} un.`], ['Caixas físicas', formatNumber(product.physicalCases, 2)], ['Unidades avulsas', formatNumber(product.looseUnits)], ['Total físico', `${formatNumber(product.physicalTotalUnits)} un.`], ['Caixas equivalentes', product.equivalentCases === null ? '—' : formatNumber(product.equivalentCases, 2)], ['Reservado', `${formatNumber(product.reservedUnits)} un.`], ['Disponível', `${formatNumber(product.availableUnits)} un.`], ['Carteira', `${formatNumber(product.pendingUnits)} un. · ${formatNumber(product.pendingCases, 2)} cx`], ['Projetado', `${formatNumber(product.projectedUnits)} un.`], ['Faturado mês', `${formatNumber(product.soldUnits)} un.`], ['Média diária', `${formatNumber(product.averageDailyUnits, 1)} un./dia`], ['Cobertura', formatDays(product.coverageDays)], ['Cobertura projetada', formatDays(product.projectedCoverageDays)], ['Custo unitário · 105', product.costUnit > 0 ? formatCurrency(product.costUnit) : '—'], ['Total a custo', formatCurrency(product.positionCostValue)], ['PVENDA1 · Região 11', product.saleUnit > 0 ? formatCurrency(product.saleUnit) : '—'], ['Valor físico a venda', formatCurrency(product.positionSaleValue)], ['Peso bruto · auditoria 8013', product.grossKg > 0 ? `${formatNumber(product.grossKg, 2)} kg` : '—'],
        ].map(([label, value]) => <div key={label} className="panel-mini-stat"><div className="panel-mini-label">{label}</div><div className="panel-mini-value" style={{ fontSize: '1rem' }}>{value}</div></div>)}
      </div>
      <div className="panel-badges" style={{ marginBottom: '18px' }}>{riskBadge(status)}{product.isLaunch && <span className="panel-badge panel-badge-purple">LANÇAMENTO</span>}{isOperationalNoWinthor(product) && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}{product.alerts.map(alert => <span key={alert.id} title={alert.message}>{alertBadge(alert)}</span>)}</div>
      <PanelSectionHeader eyebrow="LINHA DO TEMPO" title={`Movimentos comprovados · ${timeline.length}`} description="Carteira, 8022 e recebimentos 218 preservam as identidades documentais disponíveis. Campo vazio significa ausência real na fonte, não documento inventado." />
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Data</th><th>Status</th><th>Movimento</th><th>Pedido</th><th>NF</th><th className="is-right">Caixas</th><th className="is-right">Total un.</th><th className="is-right">Valor</th><th>Origem</th></tr></thead>
        <tbody>{timeline.length ? timeline.map(movement => <tr key={movement.id}><td>{movement.date || '—'}</td><td>{movement.status}</td><td>{movement.movement}</td><td>{movement.order || '—'}</td><td>{movement.invoice || '—'}</td><td className="is-right">{formatNumber(movement.cases, 2)}</td><td className="is-right">{formatNumber(movement.totalUnits)}</td><td className="is-right">{formatCurrency(movement.value)}</td><td>{movement.origin}</td></tr>) : <tr><td colSpan={9} className="is-muted">Nenhum movimento comprovado nas fontes atuais.</td></tr>}</tbody>
      </table></div>
    </PanelCard>;
  };

  const renderProducts = () => <div className="panel-stack">
    <PanelCard>
      <PanelSectionHeader eyebrow="PRODUTOS" title={`Posição por SKU · ${filteredProducts.length} de ${presentation.products.length}`} description="Físico 105, Un/CX interno 8013, reserva 8022, Carteira por Un/CX indústria e PVENDA1 Região 11 permanecem separados por origem." />
      <div className="panel-toolbar" style={{ marginBottom: '12px' }}>
        <div className="panel-chips"><button className={`panel-chip${activeFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setActiveFilter('todos')}>Todos · {presentation.products.length}</button><button className={`panel-chip${activeFilter === 'lancamento' ? ' is-active' : ''}`} onClick={() => setActiveFilter('lancamento')}>Lançamentos · {presentation.summary.launchCount}</button><button className={`panel-chip is-warning${activeFilter === 'sem-winthor' ? ' is-active' : ''}`} onClick={() => setActiveFilter('sem-winthor')}>Sem Winthor · {presentation.summary.noWinthorCount}</button></div>
        <input className="panel-input panel-input-search" value={searchTerm} placeholder="Buscar código, EAN, fabricante, produto..." onChange={event => setSearchTerm(event.target.value)} />
      </div>
      <div className="panel-toolbar" style={{ marginBottom: '12px' }}><div className="panel-chips"><button className={`panel-chip${statusFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setStatusFilter('todos')}>Situação · Todas</button><button className={`panel-chip${statusFilter === 'ruptura' ? ' is-active' : ''}`} onClick={() => setStatusFilter('ruptura')}>Ruptura · {riskCounts.ruptura}</button><button className={`panel-chip${statusFilter === 'risco' ? ' is-active' : ''}`} onClick={() => setStatusFilter('risco')}>Risco · {riskCounts.risco}</button><button className={`panel-chip${statusFilter === 'sem-giro' ? ' is-active' : ''}`} onClick={() => setStatusFilter('sem-giro')}>Sem giro · {riskCounts.semGiro}</button><button className={`panel-chip${statusFilter === 'ok' ? ' is-active' : ''}`} onClick={() => setStatusFilter('ok')}>OK · {riskCounts.ok}</button></div><span style={{ color: 'var(--panel-muted)', fontSize: '0.72rem' }}>Meta de cobertura: <strong style={{ color: 'var(--panel-text)' }}>{canonical.stock.coverageTargetDays} dias</strong></span></div>
      <div className="panel-toolbar" style={{ marginBottom: '18px' }}><StockCodeListFilter products={stockCodeProducts} codes={importedCodes} onChange={setImportedCodes} /><button className="panel-secondary-button" onClick={() => { setSearchTerm(''); setActiveFilter('todos'); setStatusFilter('todos'); setImportedCodes(new Set()); }}>Limpar filtros</button></div>
      <div className="panel-table-wrap stock-table-compact"><table className="panel-table"><thead><tr><th>Código</th><th>Produto</th><th className="is-right">Un/CX int.</th><th className="is-right">Un/CX ind.</th><th className="is-right">Posição 105</th><th className="is-right">Cx físicas</th><th className="is-right">Avulsas</th><th className="is-right">Físico un.</th><th className="is-right">Reservado</th><th className="is-right">Disponível</th><th className="is-right">Carteira cx</th><th className="is-right">Carteira un.</th><th className="is-right">Projetado</th><th className="is-right">Faturado mês</th><th className="is-right">Cobertura</th><th className="is-right">Custo 105</th><th className="is-right">Total custo</th><th className="is-right">PVENDA1</th><th className="is-right">Valor físico a venda</th><th className="is-right">Peso 8013 kg</th><th>Situação</th><th></th></tr></thead>
        <tbody>{filteredProducts.length ? filteredProducts.map(product => { const status = riskStatusByCode.get(product.code) || 'ok'; return <tr key={product.code}>
          <td className="is-strong">{product.hasWinthor && !product.code.startsWith('EAN-') ? product.code : '—'}</td>
          <td className="stock-product-cell"><div className="stock-product-name">{product.description}</div><div className="stock-product-meta">EAN: {product.ean || '—'} · Fab: {product.factoryCode || '—'}{product.brand ? ` · ${product.brand}` : ''}</div><div className="panel-badges" style={{ marginTop: '5px' }}>{product.isLaunch && <span className="panel-badge panel-badge-purple">LANÇAMENTO</span>}{isOperationalNoWinthor(product) && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}</div></td>
          <td className="is-right">{product.unitsPerCase > 0 ? formatNumber(product.unitsPerCase, 2) : '—'}</td><td className="is-right">{product.industryUnitsPerCase > 0 ? formatNumber(product.industryUnitsPerCase, 2) : '—'}</td><td className="is-right">{formatNumber(product.positionUnits)}</td><td className="is-right">{formatNumber(product.physicalCases, 2)}</td><td className="is-right">{formatNumber(product.looseUnits)}</td><td className="is-right is-strong">{formatNumber(product.physicalTotalUnits)}</td><td className="is-right">{formatNumber(product.reservedUnits)}</td><td className="is-right is-green">{formatNumber(product.availableUnits)}</td><td className="is-right">{formatNumber(product.pendingCases, 2)}</td><td className="is-right is-blue">{formatNumber(product.pendingUnits)}</td><td className="is-right is-strong">{formatNumber(product.projectedUnits)}</td><td className="is-right">{formatNumber(product.soldUnits)}</td><td className="is-right">{formatDays(product.coverageDays)}</td><td className="is-right is-muted">{product.costUnit > 0 ? formatCurrency(product.costUnit) : '—'}</td><td className="is-right">{formatCurrency(product.positionCostValue)}</td><td className="is-right">{product.saleUnit > 0 ? formatCurrency(product.saleUnit) : '—'}</td><td className="is-right is-strong">{formatCurrency(product.positionSaleValue)}</td><td className="is-right">{product.grossKg > 0 ? formatNumber(product.grossKg, 2) : '—'}</td><td>{riskBadge(status)}</td><td><button className="panel-secondary-button" onClick={() => setSelectedCode(product.code)}>Detalhes</button></td>
        </tr>; }) : <tr><td colSpan={22} className="is-muted">Nenhum produto corresponde aos filtros atuais. Limpe os filtros ou revise a lista importada.</td></tr>}</tbody>
      </table></div>
      {selectedProduct ? renderProductDetails(selectedProduct) : null}
    </PanelCard>
  </div>;

  const renderMovements = () => {
    const portfolioMovements = presentation.movements.filter(movement => movement.kind === 'ENTRADA_PREVISTA_CARTEIRA');
    const detailedPortfolio = portfolioMovements.some(movement => movement.origin.includes('INBOUND_ORDER_FACT') || Number((movement as StockPortfolioMovement).sourceRow) > 0);
    return <div className="panel-stack"><PanelCard>
      <PanelSectionHeader eyebrow="ENTRADAS E SAÍDAS" title={`${direction === 'ENTRADA' ? 'Entradas' : 'Saídas'} · ${movements.length}`} description="Entradas mostram Carteira prevista e recebimentos 218 realizados; Saídas mostram o 8022 faturado e reservado. Pedido, NF e data aparecem somente quando existem no fato canônico." action={<input className="panel-input panel-input-search" value={movementSearch} placeholder="Filtrar data, pedido, NF, SKU, produto, parceiro, origem..." onChange={event => setMovementSearch(event.target.value)} />} />
      <div className="panel-chips" style={{ marginBottom: '18px' }}><button className={`panel-chip${direction === 'ENTRADA' ? ' is-active' : ''}`} onClick={() => setDirection('ENTRADA')}>Entradas</button><button className={`panel-chip${direction === 'SAIDA' ? ' is-active' : ''}`} onClick={() => setDirection('SAIDA')}>Saídas</button></div>
      {direction === 'ENTRADA' ? <>
        {!detailedPortfolio && portfolioMovements.length > 0 ? <div className="stock-inline-note" style={{ marginTop: 0, marginBottom: '14px' }}><span>A fotografia carregada possui somente o consolidado de Carteira por SKU. Order Qty, Bill Qty, pedido e NF não foram inventados.</span><span className="panel-badge panel-badge-amber">CONSOLIDADO</span></div> : null}
        <div className="panel-table-wrap stock-table-compact"><table className="panel-table"><thead><tr><th>Data</th><th>Status</th><th>Pedido</th><th>NF</th><th>SKU</th><th>Produto</th><th className="is-right">Order Qty</th><th className="is-right">Bill Qty</th><th className="is-right">Saldo cx</th><th className="is-right">Un/CX ind.</th><th className="is-right">Recebido un.</th><th className="is-right">Saldo un.</th><th className="is-right">Custo saldo</th><th className="is-right">Venda saldo PVENDA1</th><th>Origem</th></tr></thead><tbody>
          {movements.length ? movements.map(movement => { const detail = movement as StockPortfolioMovement; const badge = movement.stage === 'REALIZADA' ? 'panel-badge panel-badge-green' : movement.stage === 'RESERVADA' ? 'panel-badge panel-badge-amber' : 'panel-badge panel-badge-blue'; return <tr key={movement.id}><td>{movement.date || '—'}</td><td><span className={badge}>{movement.status}</span></td><td>{movement.order || '—'}</td><td>{movement.invoice || '—'}</td><td className="is-strong">{movement.sku.startsWith('PORTFOLIO-') ? '—' : movement.sku}</td><td className="stock-product-cell"><div className="stock-product-name">{movement.product}</div><div className="stock-product-meta">{movement.ean || 'Sem EAN'} · {movement.partner}</div></td><td className="is-right">{detail.orderQtyCases !== undefined ? formatNumber(detail.orderQtyCases || 0, 2) : '—'}</td><td className="is-right">{detail.billQtyCases !== undefined ? formatNumber(detail.billQtyCases || 0, 2) : '—'}</td><td className="is-right is-strong">{formatNumber(movement.cases, 2)}</td><td className="is-right">{detail.unitsPerCase ? formatNumber(detail.unitsPerCase, 2) : '—'}</td><td className="is-right">{detail.receivedUnits !== undefined ? formatNumber(detail.receivedUnits) : '—'}</td><td className="is-right is-blue">{formatNumber(movement.totalUnits)}</td><td className="is-right">{formatCurrency(movement.value)}</td><td className="is-right">{detail.saleValue === null || detail.saleValue === undefined ? '—' : formatCurrency(detail.saleValue)}</td><td>{movement.origin}</td></tr>; }) : <tr><td colSpan={15} className="is-muted">Nenhuma entrada comprovada com os filtros atuais.</td></tr>}
        </tbody></table></div>
      </> : <div className="panel-table-wrap stock-table-compact"><table className="panel-table"><thead><tr><th>Data</th><th>Status</th><th>Pedido</th><th>NF</th><th>SKU</th><th>Produto</th><th>Cliente</th><th>CNPJ</th><th className="is-right">Caixas</th><th className="is-right">Avulsas</th><th className="is-right">Total un.</th><th className="is-right">Valor</th><th>Origem</th></tr></thead><tbody>
        {movements.length ? movements.map(movement => <tr key={movement.id}><td>{movement.date || '—'}</td><td><span className={`panel-badge ${movement.stage === 'RESERVADA' ? 'panel-badge-amber' : 'panel-badge-green'}`}>{movement.status}</span></td><td>{movement.order || '—'}</td><td>{movement.invoice || '—'}</td><td className="is-strong">{movement.sku}</td><td className="stock-product-cell"><div className="stock-product-name">{movement.product}</div><div className="stock-product-meta">{movement.ean || 'Sem EAN'}</div></td><td>{movement.partner || '—'}</td><td>{movement.partnerDocument || '—'}</td><td className="is-right">{formatNumber(movement.cases, 2)}</td><td className="is-right">{formatNumber(movement.looseUnits)}</td><td className="is-right is-strong">{formatNumber(movement.totalUnits)}</td><td className="is-right">{formatCurrency(movement.value)}</td><td>{movement.origin}</td></tr>) : <tr><td colSpan={13} className="is-muted">Nenhuma saída comprovada com os filtros atuais.</td></tr>}
      </tbody></table></div>}
    </PanelCard></div>;
  };

  const title = view === 'products' ? 'Produtos' : view === 'movements' ? 'Entradas e Saídas' : 'Estoque';
  return <PanelPage title={title} metricLabel="Valor físico a venda · PVENDA1" metricValue={formatCurrency(canonical.stock.saleValue)}>{view === 'products' ? renderProducts() : view === 'movements' ? renderMovements() : renderOverview()}</PanelPage>;
}
