import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const path='src/pages/EstoquePage.tsx';
let s=readFileSync(path,'utf8');
const must=(from,to,label)=>{if(!s.includes(from))throw new Error(`Não encontrado: ${label}`);s=s.replace(from,to)};

must("  const { isLoaded, produtos, metricas, canonical } = useData();","  const { canonical } = useData();",'contexto legado');
must(`  const inventory = useMemo(() => canonical?.inventory || produtos.map(product => ({
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
    || produtos.some(product => product.physicalUnits !== undefined || product.physicalCases !== undefined);`, `  const inventory = canonical?.inventory || [];
  const hasStock8013 = Boolean(canonical?.sources.some(source => source.kind === 'stock8013' && source.loaded));
  const stockCodeProducts = useMemo(() => inventory.map(item => ({ codigo: item.code, factoryCode: item.factoryCode, ean: item.ean })), [inventory]);`, 'fallback inventory');
must(`    productSupport: canonical?.support?.products || [],
    itemCodeSupport: canonical?.support?.itemCodes || [],
    transactions: canonical?.transactions || [],
    businessDaysElapsed: canonical?.sellOut?.businessDaysElapsed || 0,
    stockCostValue: metricas.valorEstoqueCompra,
    stockSaleValue: metricas.valorEstoqueVenda,`, `    productSupport: canonical?.support.products || [],
    itemCodeSupport: canonical?.support.itemCodes || [],
    transactions: canonical?.transactions || [],
    businessDaysElapsed: canonical?.sellOut.businessDaysElapsed || 0,
    stockCostValue: canonical?.stock.costValue || 0,
    stockSaleValue: canonical?.stock.saleValue || 0,`, 'insumos presentation');
must(`  }), [inventory, canonical, metricas.valorEstoqueCompra, metricas.valorEstoqueVenda, hasStock8013, alertConfiguration]);`,`  }), [inventory, canonical, hasStock8013, alertConfiguration]);`,'deps presentation');
must(`    coverageTargetDays: metricas.metaCobertura,
  })])), [presentation.products, metricas.metaCobertura]);`,`    coverageTargetDays: canonical?.stock.coverageTargetDays || 0,
  })])), [presentation.products, canonical?.stock.coverageTargetDays]);`,'meta cobertura');
must(`  if (!isLoaded) {
    return <PanelEmptyState icon="◆" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e carregue Posição 105, Cadastro 286, Estoque 8013, Carteira e Vendas 8022.</>} />;
  }`,`  if (!canonical) {
    return <PanelPage title="Estoque"><PanelEmptyState variant="page" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e carregue Posição 105, Cadastro 286, Estoque 8013, Carteira e Vendas 8022.</>} /></PanelPage>;
  }`,'empty canonical');

s=s.replaceAll('metricas.valorEstoqueVenda','canonical.stock.saleValue');
s=s.replaceAll('metricas.saldoPedidoVenda','canonical.stock.pendingPurchaseSale');
s=s.replaceAll('metricas.valorEstoqueCompra','canonical.stock.costValue');
s=s.replaceAll('metricas.saldoPedidoCusto','canonical.stock.pendingPurchaseCost');
s=s.replaceAll('metricas.metaCobertura','canonical.stock.coverageTargetDays');
s=s.replaceAll('products={produtos}','products={stockCodeProducts}');
s=s.replace('className="panel-input" value={searchTerm}', 'className="panel-input panel-input-search" value={searchTerm}');
s=s.replace('className="panel-input" value={movementSearch}', 'className="panel-input panel-input-search" value={movementSearch}');
s=s.replace('<input type="checkbox" checked={alertConfiguration.zeroStockAsRupture}', '<input className="panel-checkbox" type="checkbox" checked={alertConfiguration.zeroStockAsRupture}');
s=s.replace(`<label style={{ display: 'grid', gap: '6px', minWidth: '160px' }}>
      <span className="panel-mini-label">{label}</span>`, `<label className="panel-field" style={{ minWidth: '160px' }}>
      <span className="panel-field-label">{label}</span>`);

writeFileSync(path,s,'utf8');
rmSync('scripts/migrate-stock-canonical.mjs');
rmSync('.github/workflows/migrate-stock-canonical.yml');
