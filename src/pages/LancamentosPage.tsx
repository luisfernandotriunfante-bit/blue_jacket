import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildStockPresentation } from '../domain/stockModel';
import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import '../ui/stock/stock-layout.css';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0);
}

export function LancamentosPage() {
  const { canonical } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  if (!canonical) {
    return (
      <PanelPage title="Lançamentos">
        <PanelEmptyState variant="page" title="Nenhum dado carregado" description={<>Vá até <strong>Configurações</strong> e carregue a Lista Oficial de Lançamentos junto das bases operacionais.</>} />
      </PanelPage>
    );
  }

  const inventory = canonical.inventory;
  const hasStock105 = canonical.sources.some(source => source.kind === 'stock105' && source.loaded);
  const presentation = useMemo(() => buildStockPresentation({
    inventory,
    productSupport: canonical.support.products,
    itemCodeSupport: canonical.support.itemCodes,
    transactions: canonical.transactions,
    businessDaysElapsed: canonical.sellOut.businessDaysElapsed,
    stockCostValue: canonical.stock.costValue,
    stockSaleValue: canonical.stock.saleValue,
    hasStock105,
  }), [canonical, inventory, hasStock105]);

  const launches = useMemo(() => presentation.products.filter(product => product.isLaunch), [presentation.products]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return launches;
    return launches.filter(product => [product.code, product.factoryCode, product.ean, product.description, product.brand]
      .some(value => String(value || '').toLowerCase().includes(term)));
  }, [launches, searchTerm]);

  const inventoryByCode = useMemo(() => new Map(inventory.map(item => [item.code, item])), [inventory]);
  const inventoryByEan = useMemo(() => new Map(inventory.filter(item => item.ean).map(item => [String(item.ean).replace(/\D/g, ''), item])), [inventory]);
  const totals = useMemo(() => launches.reduce((acc, product) => {
    const source = inventoryByCode.get(product.code) || inventoryByEan.get(String(product.ean || '').replace(/\D/g, ''));
    const pendingCost = Number(source?.pendingCost) || 0;
    const pendingSale = Number(source?.pendingSale) || (product.saleUnit > 0 ? product.pendingUnits * product.saleUnit : 0);
    acc.currentCost += product.positionCostValue;
    acc.currentSale += product.positionSaleValue;
    acc.projectedCost += product.availableUnits * product.costUnit + pendingCost;
    acc.projectedSale += product.availableUnits * product.saleUnit + pendingSale;
    return acc;
  }, { currentCost: 0, currentSale: 0, projectedCost: 0, projectedSale: 0 }), [launches, inventoryByCode, inventoryByEan]);

  const withStock = launches.filter(product => product.physicalTotalUnits > 0).length;
  const inPortfolio = launches.filter(product => product.pendingUnits > 0 || product.pendingCases > 0).length;
  const withSales = launches.filter(product => product.soldUnits > 0).length;

  return (
    <PanelPage title="Lançamentos" metricLabel="Potencial projetado" metricValue={formatCurrency(totals.projectedSale)}>
      <div className="panel-stack">
        <div className="panel-grid panel-grid-4">
          <PanelKpi label="Lançamentos" value={formatNumber(launches.length)} detail={`${formatNumber(withStock)} com estoque · ${formatNumber(withSales)} com faturamento`} tone="purple" />
          <PanelKpi label="Com estoque" value={formatNumber(withStock)} detail={`${formatNumber(Math.max(launches.length - withStock, 0))} sem estoque físico`} tone="green" />
          <PanelKpi label="Na Carteira" value={formatNumber(inPortfolio)} detail="Entrada prevista ainda pendente" tone="blue" />
          <PanelKpi label="Potencial projetado" value={formatCurrency(totals.projectedSale)} detail={`Após reserva + Carteira · Custo proj.: ${formatCurrency(totals.projectedCost)}`} tone="red" />
        </div>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="PORTFÓLIO"
            title={`Catálogo oficial · ${filtered.length} de ${launches.length}`}
            description="Lançamento é definido exclusivamente pela Lista Oficial por EAN. A classificação permanece na base canônica entre cargas parciais."
            action={<input className="panel-input panel-input-search" type="text" value={searchTerm} placeholder="Buscar código, EAN, fabricante, produto..." onChange={event => setSearchTerm(event.target.value)} />}
          />
          <div className="panel-table-wrap stock-table-compact"><table className="panel-table">
            <thead><tr><th>Código</th><th>Produto</th><th className="is-right">Un/CX interno</th><th className="is-right">Cx físicas</th><th className="is-right">Avulsas</th><th className="is-right">Físico un.</th><th className="is-right">Carteira cx</th><th className="is-right">Carteira un.</th><th className="is-right">Projetado</th><th className="is-right">Faturado mês (un.)</th><th className="is-right">Cobertura</th><th className="is-right">Custo un.</th><th className="is-right">PVENDA1</th><th className="is-right">Valor físico a venda</th><th>Status</th></tr></thead>
            <tbody>{filtered.length ? filtered.map(product => <tr key={`${product.ean}-${product.code}`}>
              <td className="is-strong">{product.code.startsWith('EAN-') ? '—' : product.code}</td>
              <td className="stock-product-cell"><div className="stock-product-name">{product.description}</div><div className="stock-product-meta">EAN: {product.ean || '—'} · Fab: {product.factoryCode || '—'}{product.brand ? ` · ${product.brand}` : ''}</div></td>
              <td className="is-right">{product.unitsPerCase > 0 ? formatNumber(product.unitsPerCase, 2) : '—'}</td><td className="is-right">{formatNumber(product.physicalCases, 2)}</td><td className="is-right">{formatNumber(product.looseUnits)}</td><td className="is-right is-strong">{formatNumber(product.physicalTotalUnits)}</td><td className="is-right">{formatNumber(product.pendingCases, 2)}</td><td className="is-right is-blue">{formatNumber(product.pendingUnits)}</td><td className="is-right is-strong">{formatNumber(product.projectedUnits)}</td><td className="is-right">{formatNumber(product.soldUnits)}</td><td className="is-right">{product.coverageDays === null ? '—' : `${formatNumber(product.coverageDays, 1)} dias`}</td><td className="is-right is-muted">{product.costUnit > 0 ? formatCurrency(product.costUnit) : '—'}</td><td className="is-right">{product.saleUnit > 0 ? formatCurrency(product.saleUnit) : '—'}</td><td className="is-right is-strong">{formatCurrency(product.positionSaleValue)}</td>
              <td><div className="panel-badges"><span className="panel-badge panel-badge-purple">LANÇAMENTO</span>{product.physicalTotalUnits > 0 ? <span className="panel-badge panel-badge-green">COM ESTOQUE</span> : <span className="panel-badge panel-badge-red">SEM ESTOQUE</span>}{product.pendingUnits > 0 && <span className="panel-badge panel-badge-blue">EM CARTEIRA</span>}{!product.hasWinthor && product.pendingUnits > 0 && <span className="panel-badge panel-badge-amber">SEM WINTHOR</span>}</div></td>
            </tr>) : <tr><td colSpan={15}><PanelEmptyState variant="compact" title="Nenhum lançamento encontrado" description="Revise o termo de busca ou a Lista Oficial de Lançamentos carregada em Configurações." /></td></tr>}</tbody>
          </table></div>
        </PanelCard>
      </div>
    </PanelPage>
  );
}
