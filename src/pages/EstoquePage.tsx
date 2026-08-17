import React, { useMemo, useState } from 'react';
import { useData, ProdutoEstoque } from '../store/DataContext';
import {
  PanelCard,
  PanelEmptyState,
  PanelPage,
  PanelSectionHeader,
} from '../ui/pattern/PanelVisual';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

const digits = (value: string | undefined) => String(value || '').replace(/\D/g, '');

type CatalogItem = ProdutoEstoque & {
  soldUnits: number;
  averageDailyUnits: number;
  coverageDays: number | null;
  requiredRemainingUnits: number;
  isRisk: boolean;
  isRupture: boolean;
  isNoWinthor: boolean;
  isNew: boolean;
};

type SortKey = keyof ProdutoEstoque | 'totalCusto' | 'totalVenda' | 'soldUnits' | 'coverageDays';
type CatalogFilter = 'todos' | 'lancamento' | 'novo' | 'risco' | 'ruptura' | 'sem-winthor';

export function EstoquePage() {
  const { isLoaded, produtos, metricas, canonical } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>('todos');

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
    const remaining = canonical?.sellOut.businessDaysRemaining || 0;

    return produtos.map(product => {
      const soldUnits = soldByInternal.get(product.codigo)
        ?? (product.factoryCode ? soldByFactory.get(product.factoryCode) : undefined)
        ?? (product.ean ? soldByEan.get(digits(product.ean)) : undefined)
        ?? 0;
      const averageDailyUnits = elapsed > 0 ? soldUnits / elapsed : 0;
      const coverageDays = averageDailyUnits > 0 ? product.quantidade / averageDailyUnits : null;
      const requiredRemainingUnits = averageDailyUnits * remaining;
      const isNoWinthor = product.hasWinthor === false;
      const isNew = isNoWinthor && product.saldoPedido > 0 && !product.isLancamento;
      const isRupture = !isNoWinthor && product.quantidade <= 0;
      const isRisk = !isNoWinthor && product.quantidade > 0 && soldUnits > 0 && remaining > 0 && product.quantidade < requiredRemainingUnits;

      return {
        ...product,
        soldUnits,
        averageDailyUnits,
        coverageDays,
        requiredRemainingUnits,
        isRisk,
        isRupture,
        isNoWinthor,
        isNew,
      };
    });
  }, [produtos, canonical]);

  const counts = useMemo(() => ({
    todos: catalog.length,
    lancamento: catalog.filter(p => p.isLancamento).length,
    novo: catalog.filter(p => p.isNew).length,
    risco: catalog.filter(p => p.isRisk).length,
    ruptura: catalog.filter(p => p.isRupture).length,
    semWinthor: catalog.filter(p => p.isNoWinthor).length,
  }), [catalog]);

  const sortedProdutos = useMemo(() => {
    let sortableItems = [...catalog];
    const search = searchTerm.trim().toLowerCase();

    if (search) {
      sortableItems = sortableItems.filter(p =>
        p.codigo.toLowerCase().includes(search) ||
        p.descricao.toLowerCase().includes(search) ||
        p.ean.includes(search) ||
        (p.factoryCode || '').toLowerCase().includes(search)
      );
    }

    if (activeFilter === 'lancamento') sortableItems = sortableItems.filter(p => p.isLancamento);
    else if (activeFilter === 'novo') sortableItems = sortableItems.filter(p => p.isNew);
    else if (activeFilter === 'risco') sortableItems = sortableItems.filter(p => p.isRisk);
    else if (activeFilter === 'ruptura') sortableItems = sortableItems.filter(p => p.isRupture);
    else if (activeFilter === 'sem-winthor') sortableItems = sortableItems.filter(p => p.isNoWinthor);

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
  }, [catalog, searchTerm, sortConfig, activeFilter]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  if (!isLoaded) {
    return (
      <PanelEmptyState
        icon="◆"
        title="Nenhum dado carregado"
        description={<>Vá até <strong>Configurações</strong> e faça o upload das planilhas de estoque, itens e carteira.</>}
      />
    );
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
    portfolioNote: string
  ) => {
    const variacao = coberturaEstoque - meta;
    const isNegative = variacao < 0;

    return (
      <PanelCard style={{ borderLeft: '4px solid var(--panel-red)' }}>
        <PanelSectionHeader
          eyebrow={title}
          title={estoqueAtualLabel}
          action={<span className="panel-badge">META COBERTURA · {meta} DIAS</span>}
        />

        <div style={{ color: 'var(--panel-text)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '20px' }}>
          {formatCurrency(estoqueAtualVal)}
        </div>

        <div className="panel-subgrid">
          <div className="panel-mini-stat">
            <div className="panel-mini-label">Cobertura Atual</div>
            <div className="panel-mini-value">{coberturaEstoque} dias</div>
            <div className="panel-mini-note" style={{ color: isNegative ? '#f87171' : 'var(--panel-red)' }}>
              {isNegative ? '↓' : '↑'} {Math.abs(variacao)} dias {isNegative ? 'abaixo' : 'acima'} da meta
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
            <div className="panel-mini-note">Cobertura projetada: <strong style={{ color: 'var(--panel-text)' }}>{cobEstoqueMaisSaldo} dias</strong></div>
          </div>
        </div>
      </PanelCard>
    );
  };

  return (
    <PanelPage
      title="Estoque"
      metricLabel="Valor potencial de venda"
      metricValue={formatCurrency(metricas.valorEstoqueVenda)}
    >
      <div className="panel-stack">
        <div className="panel-grid panel-grid-2">
          {renderKpiSection(
            'VLR VENDA',
            'Faturamento Potencial do Estoque Atual',
            metricas.valorEstoqueVenda,
            metricas.coberturaDiasAtual,
            metricas.saldoPedidoVenda,
            metricas.valorEstoqueVenda + metricas.saldoPedidoVenda,
            metricas.coberturaEstoqueMaisSaldo,
            metricas.metaCobertura,
            'Somente itens da carteira com preço de venda registrado no sistema.'
          )}

          {renderKpiSection(
            'VLR CUSTO',
            'Custo de Aquisição do Estoque Atual',
            metricas.valorEstoqueCompra,
            metricas.coberturaDiasAtual,
            metricas.saldoPedidoCusto,
            metricas.valorEstoqueCompra + metricas.saldoPedidoCusto,
            metricas.coberturaEstoqueMaisSaldo,
            metricas.metaCobertura,
            'Valor integral informado na carteira.'
          )}
        </div>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CATÁLOGO"
            title={`Produtos (${sortedProdutos.length})`}
            description="Lançamento vem da lista oficial; Novo identifica item ainda sem Winthor, já presente na carteira e que não é lançamento; risco de ruptura usa estoque real × ritmo faturado no 8022 até o fim do mês. Sem preço registrado, o painel não estima valor."
          />

          <div className="panel-toolbar" style={{ marginBottom: '18px' }}>
            <div className="panel-chips">
              <button className={`panel-chip${activeFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setActiveFilter('todos')}>Todos · {counts.todos}</button>
              <button className={`panel-chip${activeFilter === 'lancamento' ? ' is-active' : ''}`} onClick={() => setActiveFilter('lancamento')}>Lançamentos · {counts.lancamento}</button>
              <button className={`panel-chip${activeFilter === 'novo' ? ' is-active' : ''}`} onClick={() => setActiveFilter('novo')}>Novos · {counts.novo}</button>
              <button className={`panel-chip is-danger${activeFilter === 'risco' ? ' is-active' : ''}`} onClick={() => setActiveFilter('risco')}>Risco de ruptura · {counts.risco}</button>
              <button className={`panel-chip is-danger${activeFilter === 'ruptura' ? ' is-active' : ''}`} onClick={() => setActiveFilter('ruptura')}>Rupturas · {counts.ruptura}</button>
              <button className={`panel-chip is-warning${activeFilter === 'sem-winthor' ? ' is-active' : ''}`} onClick={() => setActiveFilter('sem-winthor')}>Sem Winthor · {counts.semWinthor}</button>
            </div>
            <input
              id="searchInput"
              className="panel-input"
              type="text"
              placeholder="Buscar por código, EAN ou descrição..."
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
                  <th className="is-sortable is-right" onClick={() => requestSort('saldoPedido')}>Carteira (Un){getSortIcon('saldoPedido')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('custoUnitario')}>Custo Un.{getSortIcon('custoUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('vendaUnitario')}>Venda Un.{getSortIcon('vendaUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalCusto')}>Total Custo{getSortIcon('totalCusto')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalVenda')}>Total Venda{getSortIcon('totalVenda')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedProdutos.map((p) => (
                  <tr key={p.codigo}>
                    <td className="is-strong">{p.codigo}</td>
                    <td className="is-muted">{p.ean || '—'}</td>
                    <td>
                      <div className="panel-badges">
                        <span className="is-strong">{p.descricao}</span>
                        {p.isLancamento && <span className="panel-badge panel-badge-red">LANÇAMENTO</span>}
                        {p.isNew && <span className="panel-badge">NOVO</span>}
                        {p.isRisk && <span className="panel-badge panel-badge-red">RISCO DE RUPTURA</span>}
                        {p.isRupture && <span className="panel-badge panel-badge-red">RUPTURA</span>}
                        {p.isNoWinthor && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}
                      </div>
                    </td>
                    <td className="is-right is-strong">{p.quantidade.toLocaleString('pt-BR')}</td>
                    <td className="is-right">{Math.round(p.soldUnits).toLocaleString('pt-BR')}</td>
                    <td className="is-right">
                      {p.coverageDays === null ? '—' : (
                        <span style={{ color: p.isRisk || p.isRupture ? 'var(--panel-red)' : 'var(--panel-text-dim)', fontWeight: p.isRisk ? 800 : 500 }}>
                          {p.coverageDays.toFixed(1)} dias
                        </span>
                      )}
                    </td>
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