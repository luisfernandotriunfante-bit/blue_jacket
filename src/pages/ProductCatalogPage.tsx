import { useMemo, useState, type ReactNode } from 'react';
import type { CanonicalList } from '../canonical/types';
import { inboundForecasts } from '../canonical/reportSettings';
import { PanelCard, PanelEmptyState, PanelInfoRow, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import './ProductCatalogPage.css';

type Row = Record<string, unknown>;
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const str = (v: unknown) => v === null || v === undefined ? '' : String(v).trim();
const num = (v: unknown) => Number(v ?? 0) || 0;
const norm = (v: unknown) => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const date = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v).split('-').reverse().join('/') : '—';
const first = (row: Row, keys: string[]) => keys.map(k => str(row[k])).find(Boolean) ?? '';
const key = (v: unknown) => norm(v).replace(/^0+(?=\d)/, '');

export type ProductCatalogItem = {
  id: string; description: string; winthor: string; distributor: string; ean: string; available: number; physical: number; reserved: number;
  price: number | null; inboundValue: number; inboundQty: number; invoices: string[]; arrival: string | null; lastReceipt: string | null;
  sold: number; salesValue: number; averageMonthlySales: number; lastSale: string | null; coverage: number | null; isLaunch: boolean; unregistered: boolean;
  line: string; brand: string; subbrand: string; category: string; contents: string; unitsPerCase: number | null; cost: number | null;
};

export function buildProductCatalog(m1: CanonicalList, m3: CanonicalList): ProductCatalogItem[] {
  const items = new Map<string, ProductCatalogItem>();
  const add = (base: ProductCatalogItem) => { items.set(base.id, base); return base; };
  for (const raw of m1.records as Row[]) {
    const winthor = first(raw, ['winthor_code']); const distributor = first(raw, ['manufacturer_code', 'industry_sku']);
    const id = `M1:${winthor || distributor || first(raw, ['internal_ean', 'industry_ean'])}`;
    add({ id, description: first(raw, ['description_internal', 'description_industry']) || 'Produto sem descrição', winthor, distributor, ean: first(raw, ['internal_ean', 'industry_ean']), physical: num(raw.physical_stock_units), reserved: num(raw.stock_286_reserved), available: num(raw.stock_286_available) || Math.max(0, num(raw.physical_stock_units) - num(raw.stock_286_reserved)), price: Number.isFinite(Number(raw.pVenda1_region11)) && Number(raw.pVenda1_region11) > 0 ? Number(raw.pVenda1_region11) : null, inboundValue: 0, inboundQty: 0, invoices: [], arrival: null, lastReceipt: null, sold: 0, salesValue: 0, averageMonthlySales: 0, lastSale: null, coverage: null, isLaunch: raw.is_launch === true, unregistered: false, line: first(raw, ['commercial_line', 'product_line']), brand: first(raw, ['brand']), subbrand: first(raw, ['subbrand']), category: first(raw, ['category', 'segment']), contents: first(raw, ['contents', 'amount']), unitsPerCase: num(raw.units_per_case_industry) || null, cost: num(raw.cost_unit_105) || null });
  }
  const find = (r: Row) => [...items.values()].find(item => [item.winthor, item.distributor, item.ean].filter(Boolean).some(v => key(v) === key(first(r, ['winthor_product_code', 'industry_material', 'industry_sku', 'ean_product'])))) ?? null;
  const forecasts = inboundForecasts();
  for (const raw of m3.records as Row[]) {
    const type = str(raw.fact_type); let item = find(raw);
    if (!item && type === 'INBOUND_ORDER') {
      const distributor = first(raw, ['industry_material']); const id = `CARTEIRA:${key(distributor)}`;
      item = items.get(id) ?? add({ id, description: `Item da Carteira — ${distributor || 'sem código'}`, winthor: '', distributor, ean: '', physical: 0, reserved: 0, available: 0, price: null, inboundValue: 0, inboundQty: 0, invoices: [], arrival: null, lastReceipt: null, sold: 0, salesValue: 0, averageMonthlySales: 0, lastSale: null, coverage: null, isLaunch: false, unregistered: true, line: '', brand: '', subbrand: '', category: '', contents: '', unitsPerCase: null, cost: null });
    }
    if (!item) continue;
    if (type === 'INBOUND_ORDER') { item.inboundValue += num(raw.inbound_net_value); item.inboundQty += num(raw.bill_qty || raw.order_qty); const invoice = str(raw.invoice_number); if (invoice && !item.invoices.includes(invoice)) item.invoices.push(invoice); const planned = forecasts[key(invoice)] ?? null; if (planned && (!item.arrival || planned < item.arrival)) item.arrival = planned; }
    if (type === 'RECEIPT') { const d = str(raw.receipt_date); if (d && (!item.lastReceipt || d > item.lastReceipt)) item.lastReceipt = d; }
    if (type === 'SALE' && !/DEVOLU/.test(norm(raw.sale_type)) && num(raw.value) > 0) { item.sold += num(raw.units); item.salesValue += num(raw.value); const d = str(raw.event_date); if (d && (!item.lastSale || d > item.lastSale)) item.lastSale = d; }
  }
  const days = 90;
  return [...items.values()].map(item => ({ ...item, averageMonthlySales: item.sold / 3, coverage: item.sold > 0 ? item.available / (item.sold / days) : null })).sort((a,b) => a.description.localeCompare(b.description));
}

function Cell({ label, children }: { label: string; children: ReactNode }) { return <div className="product-cell"><span>{label}</span><strong>{children}</strong></div>; }
export function ProductCatalogPage({ m1, m3, launchesOnly = false }: { m1: CanonicalList; m3: CanonicalList; launchesOnly?: boolean }) {
  const [query, setQuery] = useState(''); const [stock, setStock] = useState('all'); const [open, setOpen] = useState<string | null>(null);
  const catalog = useMemo(() => buildProductCatalog(m1, m3), [m1, m3]);
  const rows = catalog.filter(item => (!launchesOnly || item.isLaunch) && (stock === 'all' || stock === 'available' && item.available > 0 || stock === 'portfolio' && item.inboundValue > 0 || stock === 'pending' && item.unregistered) && (!query || [item.description,item.winthor,item.distributor,item.ean].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase())));
  const title = launchesOnly ? 'Lançamentos' : 'Produtos';
  return <PanelPage title={title} metricLabel="ITENS ENCONTRADOS" metricValue={qty.format(rows.length)}><div className="panel-stack product-catalog-stack">
    <PanelCard compact><PanelSectionHeader eyebrow="CATÁLOGO OPERACIONAL" title={launchesOnly ? 'Itens da lista oficial de lançamentos' : 'Todos os itens disponíveis e em Carteira'} description="Pesquise por descrição, EAN, código Winthor ou código do distribuidor. Preço é a tabela PVENDA1; promoção só aparece quando existir fonte própria." />
      <div className="product-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto, EAN ou código" aria-label="Buscar produto" /><select value={stock} onChange={e=>setStock(e.target.value)} aria-label="Filtrar situação"><option value="all">Todas as situações</option><option value="available">Com estoque disponível</option><option value="portfolio">Na Carteira</option><option value="pending">Aguarda cadastro</option></select></div>
    </PanelCard>
    {rows.length ? <div className="product-list">{rows.map(item => <article className="product-row" key={item.id}>
      <button className="product-row-main" type="button" onClick={()=>setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
        <div className="product-name"><strong>{item.description}</strong><span className={item.isLaunch ? 'product-launch-badge' : ''}>{item.unregistered ? 'Aguarda cadastro · vindo da Carteira' : item.isLaunch ? 'Lançamento' : 'Item cadastrado'}</span><small>{[item.line, item.brand, item.subbrand].filter(Boolean).join(' · ') || 'Classificação não informada'} · Winthor {item.winthor || '—'} · Distribuidor {item.distributor || '—'} · EAN {item.ean || '—'}</small></div>
        <Cell label="Disponível">{qty.format(item.available)} un.</Cell><Cell label="Carteira">{item.inboundValue ? money.format(item.inboundValue) : '—'}</Cell><Cell label="Próx. chegada">{date(item.arrival)}</Cell><Cell label="Tabela">{item.price === null ? '—' : money.format(item.price)}</Cell><Cell label="Giro mensal">{item.sold ? `${qty.format(item.averageMonthlySales)} un.` : '—'}</Cell><Cell label="Cobertura">{item.coverage === null ? '—' : `${Math.round(item.coverage)} dias`}</Cell><span className="product-chevron">⌄</span>
      </button>
      {open === item.id ? <div className="product-details"><PanelInfoRow label="Estoque físico / reservado" value={`${qty.format(item.physical)} / ${qty.format(item.reserved)} un.`} /><PanelInfoRow label="Giro (últimos 90 dias)" value={item.sold ? `${qty.format(item.sold)} un. · ${money.format(item.salesValue)} · última venda ${date(item.lastSale)}` : 'Sem venda positiva no período'} /><PanelInfoRow label="Última entrada registrada" value={date(item.lastReceipt)} /><PanelInfoRow label="Carteira" value={item.inboundValue ? `${money.format(item.inboundValue)} · ${qty.format(item.inboundQty)} un. · NF ${item.invoices.join(', ')}` : 'Sem pedido aberto'} /><PanelInfoRow label="Linha / marca / sub-brand" value={[item.line, item.brand, item.subbrand].filter(Boolean).join(' · ') || 'Não informado'} /><PanelInfoRow label="Categoria / conteúdo" value={[item.category, item.contents].filter(Boolean).join(' · ') || 'Não informado'} /><PanelInfoRow label="Embalagem" value={item.unitsPerCase ? `${qty.format(item.unitsPerCase)} un. por caixa` : 'Não informada'} /><PanelInfoRow label="Custo unitário (105)" value={item.cost === null ? 'Não informado' : money.format(item.cost)} /><PanelInfoRow label="Atividade" value={item.isLaunch ? 'Lançamento importado' : 'Nenhuma atividade/promoção foi importada'} /></div> : null}
    </article>)}</div> : <PanelEmptyState title={launchesOnly ? 'Lista de lançamentos ainda não materializada' : 'Nenhum item neste filtro'} description={launchesOnly ? 'O build ativo não contém itens da Lista Oficial de Lançamentos. Reprocesse o motor atual; se a fonte não estiver salva, atualize somente a base Lançamentos.' : 'Ajuste a busca ou a situação para ver os itens da fotografia ativa.'} />}
  </div></PanelPage>;
}
