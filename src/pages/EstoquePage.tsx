import React, { useState, useMemo } from 'react';
import { useData, ProdutoEstoque } from '../store/DataContext';

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
      <div style={{ padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ color: 'white' }}>Nenhum dado carregado</h2>
        <p style={{ color: 'var(--bj-muted)' }}>Vá até as Configurações e faça o upload das planilhas de estoque, itens e carteira.</p>
      </div>
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
    meta: number
  ) => {
    const variacao = coberturaEstoque - meta;
    const isNegative = variacao < 0;
    const isVenda = title === 'Vlr Venda';

    return (
      <div className="bj-glass-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', margin: 0 }}>{title}</h2>
            <p style={{ color: 'var(--bj-muted)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>{estoqueAtualLabel}</p>
          </div>
          <div style={{ padding: '8px 16px', background: isVenda ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: isVenda ? '#60a5fa' : '#34d399', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem' }}>
            META COBERTURA: {meta} DIAS
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800, color: 'white', lineHeight: 1 }}>
            {formatCurrency(estoqueAtualVal)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '8px' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: 'var(--bj-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Cobertura Atual</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white' }}>{coberturaEstoque}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--bj-muted)' }}>dias</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: isNegative ? '#ef4444' : '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '1.2rem' }}>{isNegative ? '↓' : '↑'}</span> 
              {Math.abs(variacao)} dias {isNegative ? 'abaixo' : 'acima'} da meta
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: 'var(--bj-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Saldo Pedido (Em Trânsito)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {formatCurrency(saldoPedidoVal)}
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: 'var(--bj-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Projeção (Estoque + Pedido)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
              {formatCurrency(estoqueMaisSaldoVal)}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--bj-muted)', marginTop: '4px' }}>
              Cobertura projetada: <strong style={{ color: 'white' }}>{cobEstoqueMaisSaldo} dias</strong>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', margin: 0 }}>Estoque</h1>
        <p style={{ color: 'var(--bj-muted)', fontSize: '1.1rem', marginTop: '8px' }}>
          Visão gerencial e financeira da operação.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: '32px' }}>
        {renderKpiSection(
          "Vlr Venda",
          "Faturamento Potencial do Estoque Atual",
          metricas.valorEstoqueVenda,
          metricas.coberturaDiasAtual,
          metricas.saldoPedidoVenda,
          metricas.valorEstoqueVenda + metricas.saldoPedidoVenda,
          metricas.coberturaEstoqueMaisSaldo,
          metricas.metaCobertura
        )}

        {renderKpiSection(
          "Vlr Custo",
          "Custo de Aquisição do Estoque Atual",
          metricas.valorEstoqueCompra,
          metricas.coberturaDiasAtual,
          metricas.saldoPedidoCusto,
          metricas.valorEstoqueCompra + metricas.saldoPedidoCusto,
          metricas.coberturaEstoqueMaisSaldo,
          metricas.metaCobertura
        )}
      </div>

      <div className="bj-glass-card" style={{ flex: 1, padding: '32px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Catálogo de Produtos ({sortedProdutos.length})</h2>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setActiveFilter('todos')} style={{ padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: activeFilter === 'todos' ? 'rgba(255,255,255,0.2)' : 'transparent', color: activeFilter === 'todos' ? 'white' : 'var(--bj-muted)' }}>Todos</button>
              <button onClick={() => setActiveFilter('ruptura')} style={{ padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid rgba(239, 68, 68, 0.3)', background: activeFilter === 'ruptura' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: activeFilter === 'ruptura' ? '#fca5a5' : 'var(--bj-muted)' }}>🔴 Rupturas</button>
              <button onClick={() => setActiveFilter('novo')} style={{ padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid rgba(16, 185, 129, 0.3)', background: activeFilter === 'novo' ? 'rgba(16, 185, 129, 0.2)' : 'transparent', color: activeFilter === 'novo' ? '#6ee7b7' : 'var(--bj-muted)' }}>🟢 Novos</button>
              <button onClick={() => setActiveFilter('sem-winthor')} style={{ padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid rgba(245, 158, 11, 0.3)', background: activeFilter === 'sem-winthor' ? 'rgba(245, 158, 11, 0.2)' : 'transparent', color: activeFilter === 'sem-winthor' ? '#fcd34d' : 'var(--bj-muted)' }}>🟠 Sem Winthor</button>
            </div>
          </div>
          <input 
            type="text" 
            placeholder="Buscar por código ou descrição..." 
            style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '300px', outline: 'none' }}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="searchInput"
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
                <th onClick={() => requestSort('totalCusto')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Total Custo{getSortIcon('totalCusto')}</th>
                <th onClick={() => requestSort('totalVenda')} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'right', cursor: 'pointer' }}>Total Venda{getSortIcon('totalVenda')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedProdutos.map((p, idx) => (
                <tr key={p.codigo} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '16px', color: 'white' }}>{p.codigo}</td>
                  <td style={{ padding: '16px', color: 'var(--bj-muted)' }}>{p.ean}</td>
                  <td style={{ padding: '16px', color: 'white', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {p.descricao}
                      {p.isLancamento && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', border: '1px solid rgba(139, 92, 246, 0.3)' }}>LANÇAMENTO</span>}
                      {p.quantidade === 0 && p.custoUnitario === 0 && p.saldoPedido > 0 && !p.isLancamento && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)' }}>NOVO</span>}
                      {p.quantidade === 0 && (p.custoUnitario > 0 || (p.custoUnitario === 0 && p.saldoPedido === 0)) && !p.isLancamento && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>RUPTURA</span>}
                      {p.hasWinthor === false && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)' }}>SEM CADASTRO WINTHOR</span>}
                    </div>
                  </td>
                  <td style={{ padding: '16px', color: 'white', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span>{p.quantidade.toLocaleString('pt-BR')}</span>
                      {(p as any).saidas > 0 && <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, (p.quantidade / Math.max(1, (p as any).saidas)) * 100)}%`, background: p.quantidade < ((p as any).saidas / 30) * 15 ? '#ef4444' : p.quantidade > (p as any).saidas * 3 ? '#eab308' : '#10b981' }} /></div>}
                    </div>
                  </td>
                  <td style={{ padding: '16px', color: '#f59e0b', textAlign: 'right' }}>{p.saldoPedido.toLocaleString('pt-BR')}</td>
                  <td style={{ padding: '16px', color: 'var(--bj-muted)', textAlign: 'right' }}>{formatCurrency(p.custoUnitario)}</td>
                  <td style={{ padding: '16px', color: 'var(--bj-muted)', textAlign: 'right' }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}><span style={{ color: 'white' }}>{formatCurrency(p.vendaUnitario)}</span>{p.vendaUnitario > 0 && p.custoUnitario > 0 && <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>{(((p.vendaUnitario - p.custoUnitario) / p.vendaUnitario) * 100).toFixed(1)}% M</span>}</div></td>
                  <td style={{ padding: '16px', color: '#10b981', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.quantidade * p.custoUnitario)}</td>
                  <td style={{ padding: '16px', color: '#3b82f6', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.quantidade * p.vendaUnitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
