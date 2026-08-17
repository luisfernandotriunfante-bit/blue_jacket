import React, { useMemo, useState } from 'react';
import { useData, ProdutoEstoque } from '../store/DataContext';
import {
  PanelCard,
  PanelEmptyState,
  PanelKpi,
  PanelPage,
  PanelSectionHeader,
} from '../ui/pattern/PanelVisual';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

type SortKey = keyof ProdutoEstoque | 'totalCusto' | 'totalVenda';

export function LancamentosPage() {
  const { isLoaded, produtos } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  const sortedProdutos = useMemo(() => {
    let sortableItems = [...produtos].filter(p => p.isLancamento);

    if (searchTerm) {
      sortableItems = sortableItems.filter(p =>
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.ean.includes(searchTerm)
      );
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
  }, [produtos, searchTerm, sortConfig]);

  const totais = useMemo(() => {
    let custo = 0;
    let venda = 0;
    const todosLancamentos = produtos.filter(p => p.isLancamento);

    for (const p of todosLancamentos) {
      custo += (p.quantidade * p.custoUnitario) + (p.saldoPedidoValorCusto || 0);
      venda += (p.quantidade * p.vendaUnitario) + (p.saldoPedidoValorVenda || 0);
    }

    return { custo, venda };
  }, [produtos]);

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
        description={<>Vá até <strong>Configurações</strong> e faça o upload das planilhas.</>}
      />
    );
  }

  return (
    <PanelPage
      title="Lançamentos"
      metricLabel="Valor potencial de venda"
      metricValue={formatCurrency(totais.venda)}
    >
      <div className="panel-stack">
        <div className="panel-grid panel-grid-2">
          <PanelKpi label="VLR VENDA LANÇAMENTOS" value={formatCurrency(totais.venda)} tone="red" />
          <PanelKpi label="VLR CUSTO LANÇAMENTOS" value={formatCurrency(totais.custo)} tone="blue" />
        </div>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="PORTFÓLIO"
            title={`Catálogo de Lançamentos (${sortedProdutos.length})`}
            description="Monitoramento exclusivo dos itens marcados como lançamento."
            action={(
              <input
                className="panel-input"
                type="text"
                placeholder="Buscar por código, EAN ou descrição..."
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            )}
          />

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
                </tr>
              </thead>
              <tbody>
                {sortedProdutos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px' }} className="is-muted">
                      Nenhum item marcado como lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  sortedProdutos.map((p) => (
                    <tr key={p.codigo}>
                      <td className="is-strong">{p.codigo}</td>
                      <td className="is-muted">{p.ean}</td>
                      <td>
                        <div className="panel-badges">
                          <span className="is-strong">{p.descricao}</span>
                          <span className="panel-badge panel-badge-purple">LANÇAMENTO</span>
                          {p.quantidade === 0 && p.custoUnitario === 0 && p.saldoPedido > 0 && (
                            <span className="panel-badge panel-badge-green">NOVO</span>
                          )}
                          {p.quantidade === 0 && (p.custoUnitario > 0 || (p.custoUnitario === 0 && p.saldoPedido === 0)) && (
                            <span className="panel-badge panel-badge-red">RUPTURA</span>
                          )}
                          {p.hasWinthor === false && (
                            <span className="panel-badge panel-badge-amber">SEM CADASTRO WINTHOR</span>
                          )}
                        </div>
                      </td>
                      <td className="is-right is-strong">{p.quantidade.toLocaleString('pt-BR')}</td>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </PanelPage>
  );
}
