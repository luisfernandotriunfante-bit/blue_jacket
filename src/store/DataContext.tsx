import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface ProdutoEstoque {
  codigo: string;
  descricao: string;
  ean: string;
  quantidade: number;
  saldoMinimo: number;
  custoUnitario: number;
  vendaUnitario: number;
  entradas: number;
  saidas: number;
  saldoPedido: number;
  saldoPedidoValorCusto?: number;
  saldoPedidoValorVenda?: number;
  isLancamento?: boolean;
  hasWinthor?: boolean;
}

export interface VendedorSellOut {
  codVendedor: string;
  nomeVendedor: string;
  codCoord: string;
  nomeCoord: string;
  faturado: number;
  aFaturar: number;
  positivacao: number;
}

export interface CoordenadorSellOut {
  codCoord: string;
  nomeCoord: string;
  faturado: number;
  aFaturar: number;
  positivacao: number;
  vendedores: VendedorSellOut[];
}

export interface DiaVenda {
  data: string;
  diaSemana: string;
  venda: number;
  faturado: number;
  positivacao: number;
}

export interface ClienteRanking {
  cnpj: string;
  nome: string;
  cidade: string;
  faturado: number;
  aFaturar: number;
}

export interface SellOutData {
  faturadoTotal: number;
  aFaturarTotal: number;
  vendaTotal: number;
  positivacaoFaturado: number;
  positivacaoTotal: number;
  ticketMedio: number;
  diasDeVenda: DiaVenda[];
  topClientes: ClienteRanking[];
  coordenadores: CoordenadorSellOut[];
}

export interface MetricasEstoque {
  valorEstoqueCompra: number;
  valorEstoqueVenda: number;
  saldoPedidoCusto: number;
  saldoPedidoVenda: number;
  coberturaDiasAtual: number;
  coberturaEstoqueMaisSaldo: number;
  produtosRuptura: number;
  metaCobertura: number;
}

interface DataContextType {
  produtos: ProdutoEstoque[];
  setProdutos: (produtos: ProdutoEstoque[]) => void;
  metricas: MetricasEstoque;
  setMetricas: (metricas: MetricasEstoque) => void;
  sellOut: SellOutData | null;
  setSellOut: (data: SellOutData | null) => void;
  isLoaded: boolean;
}

const defaultMetricas: MetricasEstoque = {
  valorEstoqueCompra: 0,
  valorEstoqueVenda: 0,
  saldoPedidoCusto: 0,
  saldoPedidoVenda: 0,
  coberturaDiasAtual: 0,
  coberturaEstoqueMaisSaldo: 0,
  produtosRuptura: 0,
  metaCobertura: 60
};

const DataContext = createContext<DataContextType>({
  produtos: [],
  setProdutos: () => {},
  metricas: defaultMetricas,
  setMetricas: () => {},
  sellOut: null,
  setSellOut: () => {},
  isLoaded: false
});

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [produtos, setProdutosState] = useState<ProdutoEstoque[]>([]);
  const [metricas, setMetricasState] = useState<MetricasEstoque>(defaultMetricas);
  const [sellOut, setSellOutState] = useState<SellOutData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  React.useEffect(() => {
    const memProdutos = localStorage.getItem('bj_produtos');
    const memMetricas = localStorage.getItem('bj_metricas');
    const memSellOut = localStorage.getItem('bj_sellout');
    
    if (memProdutos && memMetricas) {
      try {
        setProdutosState(JSON.parse(memProdutos));
        setMetricasState(JSON.parse(memMetricas));
        setIsLoaded(true);
      } catch (e) {
        console.error("Erro ao ler da memória:", e);
      }
    }
    if (memSellOut) {
      try { setSellOutState(JSON.parse(memSellOut)); } catch (e) {}
    }
  }, []);

  const setProdutos = (newProdutos: ProdutoEstoque[]) => {
    setProdutosState(newProdutos);
    localStorage.setItem('bj_produtos', JSON.stringify(newProdutos));
    setIsLoaded(newProdutos.length > 0);
  };

  const setMetricas = (newMetricas: MetricasEstoque) => {
    setMetricasState(newMetricas);
    localStorage.setItem('bj_metricas', JSON.stringify(newMetricas));
  };

  const setSellOut = (data: SellOutData | null) => {
    setSellOutState(data);
    if (data) localStorage.setItem('bj_sellout', JSON.stringify(data));
    else localStorage.removeItem('bj_sellout');
  };

  return (
    <DataContext.Provider value={{ 
      produtos, 
      setProdutos, 
      metricas, 
      setMetricas,
      sellOut,
      setSellOut,
      isLoaded
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
