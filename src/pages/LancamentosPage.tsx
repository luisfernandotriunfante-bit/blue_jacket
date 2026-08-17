import React, { useState, useMemo } from 'react';
import { useData, ProdutoEstoque } from '../store/DataContext';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

type SortKey = keyof ProdutoEstoque | 'totalCusto' | 'totalVenda';

export function LancamentosPage() {
  const { isLoaded, produtos } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  const sortedProdutos = useMemo(() => {
    // Apenas produtos marcados como lançamento
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
      <div style={{ padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ color: 'white' }}>Nenhum dado carregado</h2>
        <p style={{ color: 'var(--bj-muted)' }}>Vá até as Configurações e faça o upload das planilhas.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', margin: 0 }}>Lançamentos</h1>
        <p style={{ color: 'var(--bj-muted)', fontSize: '1.1rem', marginTop: '8px' }}>
          Monitoramento exclusivo do portfólio de lançamentos.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="bj-glass-card" style={{ padding: '32px' }}>
          <h3 style={{ color: 'var(--bj-muted)', fontSize: '1rem', fontWeight: 600, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Vlr Venda Lançamentos
          </h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
            {formatCurrency(totais.venda)}
          </div>
        </div>

        <div className="bj-glass-card" style={{ padding: '32px' }}>
          <h3 style={{ color: 'var(--bj-muted)', fontSize: '1rem', fontWeight: 600, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Vlr Custo Lançamentos
          </h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
            {formatCurrency(totais.custo)}
          </div>
        </div>
      </div>

      <div className="bj-glass-card" style={{ flex: 1, padding: '32px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Catálogo de Lançamentos ({sortedProdutos.length})</h2>
          </div>
          <input 
            type="text" 
            placeholder="Buscar por código ou descrição..." 
            style={{ 
              padding: '10px 16px', 
              borderRadius: '8px', 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: 'white',
              width: '300px',
              outline: 'none'
            }}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(30,30,40,0.95)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <tr style={{ color: 'var(--bj-muted)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                <th onClick={() => requestSort('codigo')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Código{getSortIcon('codigo')}</th>
                <th onClick={() => requestSort('ean')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>EAN{getSortIcon('ean')}</th>
                <th onClick={() => requestSort('descricao')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Descrição{getSortIcon('descricao')}</th>
                <th onClick={() => requestSort('quantidade')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Estoque (Un){getSortIcon('quantidade')}</th>
                <th onClick={() => requestSort('saldoPedido')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Pedido (Un){getSortIcon('saldoPedido')}</th>
                <th onClick={() => requestSort('custoUnitario')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Custo Un.{getSortIcon('custoUnitario')}</th>
                <th onClick={() => requestSort('vendaUnitario')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Venda Un.{getSortIcon('vendaUnitario')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedProdutos.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--bj-muted)' }}>
                    Nenhum item marcado como lançamento encontrado.
                  </td>
                </tr>
              ) : (
                sortedProdutos.map((p, idx) => (
                  <tr key={p.codigo} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '16px', color: 'white' }}>{p.codigo}</td>
                    <td style={{ padding: '16px', color: 'var(--bj-muted)' }}>{p.ean}</td>
                    <td style={{ padding: '16px', color: 'white', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {p.descricao}
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                          LANÇAMENTO
                        </span>

                        {p.quantidade === 0 && p.custoUnitario === 0 && p.saldoPedido > 0 && (
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            NOVO
                          </span>
                        )}
                        
                        {p.quantidade === 0 && (p.custoUnitario > 0 || (p.custoUnitario === 0 && p.saldoPedido === 0)) && (
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            RUPTURA
                          </span>
                        )}

                        {p.hasWinthor === false && (
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            SEM CADASTRO WINTHOR
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px', color: 'white', textAlign: 'right' }}>{p.quantidade.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '16px', color: '#f59e0b', textAlign: 'right' }}>{p.saldoPedido.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '16px', color: 'var(--bj-muted)', textAlign: 'right' }}>{formatCurrency(p.custoUnitario)}</td>
                    <td style={{ padding: '16px', color: 'var(--bj-muted)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ color: 'white' }}>{formatCurrency(p.vendaUnitario)}</span>
                        {p.vendaUnitario > 0 && p.custoUnitario > 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>
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
      </div>
    </div>
  );
}
