import React, { useMemo, useState } from 'react';
import { useData, ProdutoEstoque } from '../store/DataContext';
import { productMatchesStockCodeList } from '../domain/stockCodeFilter';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { StockCodeListFilter } from '../ui/stock/StockCodeListFilter';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

const digits = (value: string | undefined) => String(value || '').replace(/\D/g, '');

function parseLocaleNumber(raw: string): number {
  let value = raw.trim().replace(/r\$/gi, '').replace(/\s/g, '');
  if (!value) return Number.NaN;
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  return Number(value);
}

function matchesNumericFilter(value: number | null | undefined, expression: string): boolean {
  const filter = expression.trim();
  if (!filter) return true;
  if (value === null || value === undefined || !Number.isFinite(value)) return false;

  const match = filter.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (!match) return true;
  const operator = match[1] || '=';
  const target = parseLocaleNumber(match[2]);
  if (!Number.isFinite(target)) return true;

  if (operator === '>') return value > target;
  if (operator === '<') return value < target;
  if (operator === '>=') return value >= target;
  if (operator === '<=') return value <= target;
  return Math.abs(value - target) < 0.000001;
}

type CatalogItem = ProdutoEstoque & {
  soldUnits: number;
  averageDailyUnits: number;
  coverageDays: number | null;
  isNoWinthor: boolean;
};

type SortKey = keyof ProdutoEstoque | 'totalCusto' | 'totalVenda' | 'soldUnits' | 'coverageDays';
type CatalogFilter = 'todos' | 'lancamento' | 'sem-winthor';

type ColumnFilters = {
  codigo: string;
  ean: string;
  descricao: string;
  quantidade: string;
  soldUnits: string;
  coverageDays: string;
  saldoPedidoCaixas: string;
  saldoPedido: string;
  custoUnitario: string;
  vendaUnitario: string;
  totalCusto: string;
  totalVenda: string;
};

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  codigo: '',
  ean: '',
  descricao: '',
  quantidade: '',
  soldUnits: '',
  coverageDays: '',
  saldoPedidoCaixas: '',
  saldoPedido: '',
  custoUnitario: '',
  vendaUnitario: '',
  totalCusto: '',
  totalVenda: '',
};

export function EstoquePage() {
  const { isLoaded, produtos, metricas, canonical } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>('todos');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());

  const catalog = useMemo<CatalogItem[]>(() => {
    const soldByInternal = new Map<string, number>();
    const soldByFactory = new Map<string, number>();
    const soldByEan = new Map<string, number>();

    (canonical?.transactions || []).forEach(tx => {
      if (tx.status !== 'FATURADO') return;
      const units = Math.max(Number(tx.units) || 0, 0);
      if (units <= 0) return;

      if (tx.internalProductCode) soldByInternal.set(tx.internalProductCode, (soldByInternal.get(tx.internalProductCode) || 0) + units);
      if (tx.manufacturerCode) soldByFactory.set(tx.manufacturerCode, (soldByFactory.get(tx.manufacturerCode) || 0) + units);
      const ean = digits(tx.ean);
      if (ean) soldByEan.set(ean, (soldByEan.get(ean) || 0) + units);
    });

    const elapsed = canonical?.sellOut.businessDaysElapsed || 0;

    return produtos.map(product => {
      const productEan = digits(product.ean);
      const soldUnits = soldByInternal.get(product.codigo)
        ?? (product.factoryCode ? soldByFactory.get(product.factoryCode) : undefined)
        ?? (productEan ? soldByEan.get(productEan) : undefined)
        ?? 0;
      const averageDailyUnits = elapsed > 0 ? soldUnits / elapsed : 0;
      const coverageDays = averageDailyUnits > 0 ? product.quantidade / averageDailyUnits : null;

      // SEM WINTHOR nasce exclusivamente da CARTEIRA Colgate.
      const hasPortfolioPending = product.saldoPedido > 0 || (product.saldoPedidoValorCusto || 0) > 0;
      const isNoWinthor = product.hasWinthor === false && hasPortfolioPending;

      return {
        ...product,
        soldUnits,
        averageDailyUnits,
        coverageDays,
        isNoWinthor,
      };
    });
  }, [produtos, canonical]);

  const counts = useMemo(() => ({
    todos: catalog.length,
    lancamento: catalog.filter(p => p.isLancamento).length,
    semWinthor: catalog.filter(p => p.isNoWinthor).length,
  }), [catalog]);

  const sortedProdutos = useMemo(() => {
    let sortableItems = [...catalog];
    const search = searchTerm.trim().toLowerCase();

    if (search) {
      sortableItems = sortableItems.filter(p => [p.codigo, p.ean, p.descricao, p.factoryCode]
        .some(value => String(value || '').toLowerCase().includes(search)));
    }

    if (importedCodes.size) {
      sortableItems = sortableItems.filter(product => productMatchesStockCodeList(product, importedCodes));
    }

    if (activeFilter === 'lancamento') sortableItems = sortableItems.filter(p => p.isLancamento);
    else if (activeFilter === 'sem-winthor') sortableItems = sortableItems.filter(p => p.isNoWinthor);

    const codeFilter = columnFilters.codigo.trim().toLowerCase();
    const eanFilter = columnFilters.ean.trim().toLowerCase();
    const descriptionFilter = columnFilters.descricao.trim().toLowerCase();

    if (codeFilter) sortableItems = sortableItems.filter(p => String(p.codigo || '').toLowerCase().includes(codeFilter));
    if (eanFilter) sortableItems = sortableItems.filter(p => String(p.ean || '').toLowerCase().includes(eanFilter));
    if (descriptionFilter) sortableItems = sortableItems.filter(p => String(p.descricao || '').toLowerCase().includes(descriptionFilter));

    sortableItems = sortableItems.filter(p => {
      const totalCusto = p.custoUnitario > 0 ? p.quantidade * p.custoUnitario : null;
      const totalVenda = p.vendaUnitario > 0 ? p.quantidade * p.vendaUnitario : null;
      return matchesNumericFilter(p.quantidade, columnFilters.quantidade)
        && matchesNumericFilter(p.soldUnits, columnFilters.soldUnits)
        && matchesNumericFilter(p.coverageDays, columnFilters.coverageDays)
        && matchesNumericFilter(p.saldoPedidoCaixas || 0, columnFilters.saldoPedidoCaixas)
        && matchesNumericFilter(p.saldoPedido, columnFilters.saldoPedido)
        && matchesNumericFilter(p.custoUnitario > 0 ? p.custoUnitario : null, columnFilters.custoUnitario)
        && matchesNumericFilter(p.vendaUnitario > 0 ? p.vendaUnitario : null, columnFilters.vendaUnitario)
        && matchesNumericFilter(totalCusto, columnFilters.totalCusto)
        && matchesNumericFilter(totalVenda, columnFilters.totalVenda);
    });

    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA: any = a[sortConfig.key as keyof CatalogItem];
        let valB: any = b[sortConfig.key as keyof CatalogItem];
        if (sortConfig.key === 'totalCusto') {
          valA = a.quantidade * a.custoUnitario;
          valB = b.quantidade * b.custoUnitario;
        } else if (sortConfig.key === 'totalVenda') {
          valA = a.quantidade * a.vendaUnitario;
          valB = b.quantidade * b.vendaUnitario;
        } else if (sortConfig.key === 'coverageDays') {
          valA = a.coverageDays ?? Number.POSITIVE_INFINITY;
          valB = b.coverageDays ?? Number.POSITIVE_INFINITY;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return sortableItems;
  }, [catalog, searchTerm, sortConfig, activeFilter, columnFilters, importedCodes]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKey) => !sortConfig || sortConfig.key !== key
    ? ' ↕'
    : sortConfig.direction === 'asc' ? ' ↑' : ' ↓';

  const setColumnFilter = (key: keyof ColumnFilters, value: string) => {
    setColumnFilters(current => ({ ...current, [key]: value }));
  };

  const activeColumnFilterCount = Object.values(columnFilters).filter(value => value.trim()).length;
  const hasAnyFilter = searchTerm.trim().length > 0 || activeFilter !== 'todos' || activeColumnFilterCount > 0 || importedCodes.size > 0;

  const clearFilters = () => {
    setSearchTerm('');
    setActiveFilter('todos');
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setImportedCodes(new Set());
  };

  const renderFilterInput = (
    key: keyof ColumnFilters,
    placeholder: string,
    options?: { numeric?: boolean; minWidth?: number },
  ) => (
    <input
      aria-label={`Filtro ${key}`}
      className="panel-input"
      type="text"
      inputMode={options?.numeric ? 'decimal' : 'text'}
      value={columnFilters[key]}
      placeholder={placeholder}
      onChange={event => setColumnFilter(key, event.target.value)}
      style={{
        width: '100%',
        minWidth: `${options?.minWidth || 92}px`,
        minHeight: '32px',
        padding: '6px 8px',
        fontSize: '0.72rem',
        textAlign: options?.numeric ? 'right' : 'left',
      }}
    />
  );

  if (!isLoaded) {
    return <PanelEmptyState icon="◆" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e faça o upload das planilhas de estoque, itens e carteira.</>} />;
  }

  const renderKpiSection = (
    title: string,
    estoqueAtualLabel: string,
    estoqueAtualVal: number,
    coberturaEstoque: number,
    saldoPedidoVal: number,
    estoqueMaisSaldoVal: number,
    cobEstoqueMaisSaldo: number,
    meta: number,
    portfolioNote: string,
  ) => {
    const coverageAvailable = coberturaEstoque > 0 || cobEstoqueMaisSaldo > 0;
    const variacao = coverageAvailable ? coberturaEstoque - meta : 0;
    const isNegative = variacao < 0;

    return (
      <PanelCard style={{ borderLeft: '4px solid var(--panel-red)' }}>
        <PanelSectionHeader eyebrow={title} title={estoqueAtualLabel} action={<span className="panel-badge">META COBERTURA · {meta} DIAS</span>} />
        <div style={{ color: 'var(--panel-text)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '20px' }}>{formatCurrency(estoqueAtualVal)}</div>
        <div className="panel-subgrid">
          <div className="panel-mini-stat">
            <div className="panel-mini-label">Cobertura Atual</div>
            <div className="panel-mini-value">{coverageAvailable ? `${coberturaEstoque} dias` : 'Aguardando histórico'}</div>
            <div className="panel-mini-note" style={{ color: coverageAvailable ? (isNegative ? '#f87171' : 'var(--panel-red)') : 'var(--panel-muted)' }}>
              {coverageAvailable ? `${isNegative ? '↓' : '↑'} ${Math.abs(variacao)} dias ${isNegative ? 'abaixo' : 'acima'} da meta` : 'Requer Sell Out médio dos 3 meses fechados.'}
            </div>
          </div>
          <div className="panel-mini-stat">
            <div className="panel-mini-label">Saldo Pedido · Em Trânsito</div>
            <div className="panel-mini-value" style={{ color: 'var(--panel-red)' }}>{formatCurrency(saldoPedidoVal)}</div>
            <div className="panel-mini-note">{portfolioNote}</div>
          </div>
          <div className="panel-mini-stat">
            <div className="panel-mini-label">Projeção · Estoque + Pedido</div>
            <div className="panel-mini-value">{formatCurrency(estoqueMaisSaldoVal)}</div>
            <div className="panel-mini-note">Cobertura projetada: <strong style={{ color: 'var(--panel-text)' }}>{coverageAvailable ? `${cobEstoqueMaisSaldo} dias` : 'Aguardando histórico'}</strong></div>
          </div>
        </div>
      </PanelCard>
    );
  };

  const costCoverageCurrent = canonical?.stock.coverageCostCurrentDays ?? metricas.coberturaDiasAtualCusto ?? metricas.coberturaDiasAtual;
  const costCoverageProjected = canonical?.stock.coverageCostProjectedDays ?? metricas.coberturaEstoqueMaisSaldoCusto ?? metricas.coberturaEstoqueMaisSaldo;

  return (
    <PanelPage title="Estoque" metricLabel="Valor potencial de venda" metricValue={formatCurrency(metricas.valorEstoqueVenda)}>
      <div className="panel-stack">
        <div className="panel-grid panel-grid-2">
          {renderKpiSection('VLR VENDA', 'Faturamento Potencial do Estoque Atual', metricas.valorEstoqueVenda, metricas.coberturaDiasAtual, metricas.saldoPedidoVenda, metricas.valorEstoqueVenda + metricas.saldoPedidoVenda, metricas.coberturaEstoqueMaisSaldo, metricas.metaCobertura, 'Carteira integral valorizada pelo acréscimo de venda configurado.')}
          {renderKpiSection('VLR CUSTO', 'Custo de Aquisição do Estoque Atual', metricas.valorEstoqueCompra, costCoverageCurrent, metricas.saldoPedidoCusto, metricas.valorEstoqueCompra + metricas.saldoPedidoCusto, costCoverageProjected, metricas.metaCobertura, 'Valor integral informado na carteira.')}
        </div>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CATÁLOGO"
            title={`Produtos (${sortedProdutos.length}${sortedProdutos.length !== catalog.length ? ` de ${catalog.length}` : ''})`}
            description="Lançamento vem da lista oficial por EAN. Sem Winthor aparece somente quando um item da CARTEIRA Colgate não encontra correspondência no Winthor."
          />

          <div className="panel-toolbar" style={{ marginBottom: '12px' }}>
            <div className="panel-chips">
              <button className={`panel-chip${activeFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setActiveFilter('todos')}>Todos · {counts.todos}</button>
              <button className={`panel-chip${activeFilter === 'lancamento' ? ' is-active' : ''}`} onClick={() => setActiveFilter('lancamento')}>Lançamentos · {counts.lancamento}</button>
              <button className={`panel-chip is-warning${activeFilter === 'sem-winthor' ? ' is-active' : ''}`} onClick={() => setActiveFilter('sem-winthor')}>Sem Winthor · {counts.semWinthor}</button>
            </div>
            <input id="searchInput" className="panel-input" type="text" value={searchTerm} placeholder="Buscar por código, EAN ou descrição..." onChange={event => setSearchTerm(event.target.value)} />
          </div>

          <div className="panel-toolbar" style={{ marginBottom: '18px', alignItems: 'center' }}>
            <StockCodeListFilter products={catalog} codes={importedCodes} onChange={setImportedCodes} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', marginLeft: 'auto' }}>
              <span style={{ color: 'var(--panel-muted)', fontSize: '0.72rem' }}>Filtros numéricos: use &gt;, &lt;, &gt;=, &lt;= ou =. Ex.: &gt;1000 ou &lt;R$ 5,00.</span>
              <button className="panel-secondary-button" onClick={clearFilters} disabled={!hasAnyFilter}>Limpar filtros{activeColumnFilterCount > 0 ? ` · ${activeColumnFilterCount}` : ''}</button>
            </div>
          </div>

          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th className="is-sortable" onClick={() => requestSort('codigo')}>Código{getSortIcon('codigo')}</th>
                  <th className="is-sortable" onClick={() => requestSort('ean')}>EAN{getSortIcon('ean')}</th>
                  <th className="is-sortable" onClick={() => requestSort('descricao')}>Produto / Status{getSortIcon('descricao')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('quantidade')}>Estoque (Un){getSortIcon('quantidade')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('soldUnits')}>Venda mês (Un){getSortIcon('soldUnits')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('coverageDays')}>Cobertura ritmo{getSortIcon('coverageDays')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('saldoPedidoCaixas')}>Carteira (Cx){getSortIcon('saldoPedidoCaixas')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('saldoPedido')}>Carteira (Un){getSortIcon('saldoPedido')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('custoUnitario')}>Custo Un.{getSortIcon('custoUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('vendaUnitario')}>Venda Un.{getSortIcon('vendaUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalCusto')}>Total Custo{getSortIcon('totalCusto')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalVenda')}>Total Venda{getSortIcon('totalVenda')}</th>
                </tr>
                <tr>
                  <th>{renderFilterInput('codigo', 'Código')}</th>
                  <th>{renderFilterInput('ean', 'EAN', { minWidth: 128 })}</th>
                  <th>{renderFilterInput('descricao', 'Produto', { minWidth: 190 })}</th>
                  <th>{renderFilterInput('quantidade', '>1000', { numeric: true })}</th>
                  <th>{renderFilterInput('soldUnits', '>100', { numeric: true })}</th>
                  <th>{renderFilterInput('coverageDays', '<5', { numeric: true })}</th>
                  <th>{renderFilterInput('saldoPedidoCaixas', '>0', { numeric: true })}</th>
                  <th>{renderFilterInput('saldoPedido', '>0', { numeric: true })}</th>
                  <th>{renderFilterInput('custoUnitario', '<5,00', { numeric: true })}</th>
                  <th>{renderFilterInput('vendaUnitario', '>10,00', { numeric: true })}</th>
                  <th>{renderFilterInput('totalCusto', '>1000', { numeric: true })}</th>
                  <th>{renderFilterInput('totalVenda', '>1000', { numeric: true })}</th>
                </tr>
              </thead>
              <tbody>
                {sortedProdutos.map(p => (
                  <tr key={p.codigo}>
                    <td className="is-strong">{p.codigo}</td>
                    <td className="is-muted">{p.ean || '—'}</td>
                    <td>
                      <div className="panel-badges">
                        <span className="is-strong">{p.descricao}</span>
                        {p.isLancamento && <span className="panel-badge panel-badge-red">LANÇAMENTO</span>}
                        {p.isNoWinthor && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}
                      </div>
                    </td>
                    <td className="is-right is-strong">{p.quantidade.toLocaleString('pt-BR')}</td>
                    <td className="is-right">{Math.round(p.soldUnits).toLocaleString('pt-BR')}</td>
                    <td className="is-right">
                      {p.coverageDays === null ? '—' : <span style={{ color: 'var(--panel-text-dim)', fontWeight: 500 }}>{p.coverageDays.toFixed(1)} dias</span>}
                    </td>
                    <td className="is-right">{(p.saldoPedidoCaixas || 0).toLocaleString('pt-BR')}</td>
                    <td className="is-right">{p.saldoPedido.toLocaleString('pt-BR')}</td>
                    <td className="is-right is-muted">{p.custoUnitario > 0 ? formatCurrency(p.custoUnitario) : '—'}</td>
                    <td className="is-right">{p.vendaUnitario > 0 ? <span className="is-strong">{formatCurrency(p.vendaUnitario)}</span> : '—'}</td>
                    <td className="is-right" style={{ fontWeight: 700 }}>{p.custoUnitario > 0 ? formatCurrency(p.quantidade * p.custoUnitario) : '—'}</td>
                    <td className="is-right" style={{ fontWeight: 700 }}>{p.vendaUnitario > 0 ? formatCurrency(p.quantidade * p.vendaUnitario) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </PanelPage>
  );
}
