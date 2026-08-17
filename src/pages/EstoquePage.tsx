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

type SortKey = keyof ProdutoEstoque | 'totalCusto' | 'totalVenda';

export function EstoquePage() {
  const { isLoaded, produtos, metricas } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<'todos' | 'ruptura' | 'novo' | 'sem-winthor'>('todos');

  const sortedProdutos = useMemo(() => {
    let sortableItems = [...produtos];

    if (searchTerm) {
      sortableItems = sortableItems.filter(p =>
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.ean.includes(searchTerm)
      );
    }

    if (activeFilter === 'ruptura') {
      sortableItems = sortableItems.filter(p => p.quantidade === 0 && (p.custoUnitario > 0 || (p.custoUnitario === 0 && p.saldoPedido === 0)) && !p.isLancamento);
    } else if (activeFilter === 'novo') {
      sortableItems = sortableItems.filter(p => p.quantidade === 0 && p.custoUnitario === 0 && p.saldoPedido > 0 && !p.isLancamento);
    } else if (activeFilter === 'sem-winthor') {
      sortableItems = sortableItems.filter(p => p.hasWinthor === false);
    }

    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA: any = a[sortConfig.key as keyof ProdutoEstoque];
        let valB: any = b[sortConfig.key as keyof ProdutoEstoque];

        if (sortConfig.key === 'totalCusto') {
          valA = a.quantidade * a.custoUnitario;
          valB = b.quantidade * b.custoUnitario;
        } else if (sortConfig.key === 'totalVenda') {
          valA = a.quantidade * a.vendaUnitario;
          valB = b.quantidade * b.vendaUnitario;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return sortableItems;
  }, [produtos, searchTerm, sortConfig, activeFilter]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
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
    tone: 'red' | 'blue'
  ) => {
    const variacao = coberturaEstoque - meta;
    const isNegative = variacao < 0;
    const accent = tone === 'red' ? 'var(--panel-red)' : 'var(--panel-blue)';

    return (
      <PanelCard style={{ borderLeft: `4px solid ${accent}` }}>
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
            <div className="panel-mini-note" style={{ color: isNegative ? '#f87171' : '#22c55e' }}>
              {isNegative ? '↓' : '↑'} {Math.abs(variacao)} dias {isNegative ? 'abaixo' : 'acima'} da meta
            </div>
          </div>

          <div className="panel-mini-stat">
            <div className="panel-mini-label">Saldo Pedido · Em Trânsito</div>
            <div className="panel-mini-value" style={{ color: 'var(--panel-amber)' }}>{formatCurrency(saldoPedidoVal)}</div>
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
            'red'
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
            'blue'
          )}
        </div>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CATÁLOGO"
            title={`Produtos em Estoque (${sortedProdutos.length})`}
            description="Consulta, filtros e ordenação da posição atual."
          />

          <div className="panel-toolbar" style={{ marginBottom: '18px' }}>
            <div className="panel-chips">
              <button className={`panel-chip${activeFilter === 'todos' ? ' is-active' : ''}`} onClick={() => setActiveFilter('todos')}>Todos</button>
              <button className={`panel-chip is-danger${activeFilter === 'ruptura' ? ' is-active' : ''}`} onClick={() => setActiveFilter('ruptura')}>Rupturas</button>
              <button className={`panel-chip is-success${activeFilter === 'novo' ? ' is-active' : ''}`} onClick={() => setActiveFilter('novo')}>Novos</button>
              <button className={`panel-chip is-warning${activeFilter === 'sem-winthor' ? ' is-active' : ''}`} onClick={() => setActiveFilter('sem-winthor')}>Sem Winthor</button>
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
                  <th className="is-sortable" onClick={() => requestSort('descricao')}>Descrição{getSortIcon('descricao')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('quantidade')}>Estoque (Un){getSortIcon('quantidade')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('saldoPedido')}>Pedido (Un){getSortIcon('saldoPedido')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('custoUnitario')}>Custo Un.{getSortIcon('custoUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('vendaUnitario')}>Venda Un.{getSortIcon('vendaUnitario')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalCusto')}>Total Custo{getSortIcon('totalCusto')}</th>
                  <th className="is-sortable is-right" onClick={() => requestSort('totalVenda')}>Total Venda{getSortIcon('totalVenda')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedProdutos.map((p) => {
                  const saidas = (p as any).saidas as number | undefined;
                  const barColor = p.quantidade < ((saidas || 0) / 30) * 15 ? '#ef4444' : p.quantidade > (saidas || 0) * 3 ? '#eab308' : '#10b981';
                  const barWidth = saidas && saidas > 0 ? Math.min(100, (p.quantidade / Math.max(1, saidas)) * 100) : 0;

                  return (
                    <tr key={p.codigo}>
                      <td className="is-strong">{p.codigo}</td>
                      <td className="is-muted">{p.ean}</td>
                      <td>
                        <div className="panel-badges">
                          <span className="is-strong">{p.descricao}</span>
                          {p.isLancamento && <span className="panel-badge panel-badge-purple">LANÇAMENTO</span>}
                          {p.quantidade === 0 && p.custoUnitario === 0 && p.saldoPedido > 0 && !p.isLancamento && <span className="panel-badge panel-badge-green">NOVO</span>}
                          {p.quantidade === 0 && (p.custoUnitario > 0 || (p.custoUnitario === 0 && p.saldoPedido === 0)) && !p.isLancamento && <span className="panel-badge panel-badge-red">RUPTURA</span>}
                          {p.hasWinthor === false && <span className="panel-badge panel-badge-amber">SEM CADASTRO WINTHOR</span>}
                        </div>
                      </td>
                      <td className="is-right is-strong">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                          <span>{p.quantidade.toLocaleString('pt-BR')}</span>
                          {saidas && saidas > 0 ? (
                            <div style={{ width: '58px', height: '3px', background: 'rgba(255,255,255,0.09)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${barWidth}%`, height: '100%', background: barColor }} />
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="is-right is-amber">{p.saldoPedido.toLocaleString('pt-BR')}</td>
                      <td className="is-right is-muted">{formatCurrency(p.custoUnitario)}</td>
                      <td className="is-right">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span className="is-strong">{formatCurrency(p.vendaUnitario)}</span>
                          {p.vendaUnitario > 0 && p.custoUnitario > 0 && (
                            <span className="is-green" style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                              {(((p.vendaUnitario - p.custoUnitario) / p.vendaUnitario) * 100).toFixed(1)}% M
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="is-right is-green" style={{ fontWeight: 700 }}>{formatCurrency(p.quantidade * p.custoUnitario)}</td>
                      <td className="is-right is-blue" style={{ fontWeight: 700 }}>{formatCurrency(p.quantidade * p.vendaUnitario)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </PanelPage>
  );
}
