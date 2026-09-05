import { useMemo, useState, type ReactNode } from 'react';
import type { CanonicalList } from '../canonical/types';
import { inboundForecasts } from '../canonical/reportSettings';
import { matchesProductSearch } from '../canonical/productSearch';
import { parseRangeAssortmentPresence, type AssortmentPresence } from '../canonical/assortment';
import { PanelCard, PanelEmptyState, PanelInfoRow, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import './ProductCatalogPage.css';

type Row = Record<string, unknown>;
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const boxes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const str = (v: unknown) => v === null || v === undefined ? '' : String(v).trim();
const num = (v: unknown) => Number(v ?? 0) || 0;
const norm = (v: unknown) => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const date = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v).split('-').reverse().join('/') : '—';
const first = (row: Row, keys: string[]) => keys.map(k => str(row[k])).find(Boolean) ?? '';
const key = (v: unknown) => norm(v).replace(/^0+(?=\d)/, '');
const invoiceKey = (v: unknown) => str(v).match(/\d+/)?.[0]?.replace(/^0+(?=\d)/, '') ?? '';

export type ProductCatalogItem = {
  id: string; description: string; winthor: string; distributor: string; ean: string; available: number; physical: number; reserved: number;
  priceWithoutSt: number | null; stValue: number | null; priceWithSt: number | null; industryTablePrice: number | null; inboundQty: number; invoices: string[]; arrival: string | null; lastReceipt: string | null;
  sold: number; salesValue: number; averageMonthlySales: number; lastSale: string | null; coverage: number | null; isLaunch: boolean; unregistered: boolean;
  line: string; brand: string; subbrand: string; category: string; contents: string; unitsPerCase: number | null; cost: number | null;
  assortment: AssortmentPresence[]; assortmentMaterialized: boolean;
};

const stockVolume = (units: number, unitsPerCase: number | null) => unitsPerCase ? `${boxes.format(Math.floor(units / unitsPerCase))} cx. · ${qty.format(units)} un.` : `${qty.format(units)} un. · Un/CX ausente`;

export function buildProductCatalog(m1: CanonicalList, m3: CanonicalList, m4?: CanonicalList): ProductCatalogItem[] {
  const items = new Map<string, ProductCatalogItem>();
  const add = (base: ProductCatalogItem) => { items.set(base.id, base); return base; };
  for (const raw of m1.records as Row[]) {
    const winthor = first(raw, ['winthor_code']); const distributor = first(raw, ['manufacturer_code', 'industry_sku']);
    const id = `M1:${winthor || distributor || first(raw, ['internal_ean', 'industry_ean'])}`;
    const positivePrice = (field: string) => num(raw[field]) > 0 ? num(raw[field]) : null;
    add({ id, description: first(raw, ['description_internal', 'description_industry']) || 'Produto sem descrição', winthor, distributor, ean: first(raw, ['internal_ean', 'industry_ean']), physical: num(raw.physical_stock_units), reserved: num(raw.stock_286_reserved), available: num(raw.stock_286_available) || Math.max(0, num(raw.physical_stock_units) - num(raw.stock_286_reserved)), priceWithoutSt: positivePrice('pVenda'), stValue: positivePrice('vlSt'), priceWithSt: positivePrice('pVenda1_region11'), industryTablePrice: positivePrice('industry_base_price'), inboundQty: 0, invoices: [], arrival: null, lastReceipt: null, sold: 0, salesValue: 0, averageMonthlySales: 0, lastSale: null, coverage: null, isLaunch: raw.is_launch === true, unregistered: raw.mapping_status === 'LAUNCH_PENDING_CATALOG' || raw.has_winthor === false, line: first(raw, ['commercial_line', 'product_line']), brand: first(raw, ['brand']), subbrand: first(raw, ['subbrand']), category: first(raw, ['category', 'segment']), contents: first(raw, ['contents', 'amount']), unitsPerCase: num(raw.units_per_case_industry) || null, cost: num(raw.cost_unit_105) || null, assortment: parseRangeAssortmentPresence(raw.recommendation_json), assortmentMaterialized: str(raw.recommendation_json) !== '' });
  }
  const find = (r: Row) => [...items.values()].find(item => [item.winthor, item.distributor, item.ean].filter(Boolean).some(v => key(v) === key(first(r, ['winthor_product_code', 'industry_material', 'industry_sku', 'ean_product'])))) ?? null;
  const forecasts = inboundForecasts();
  const receivedInvoices = new Set<string>();
  for (const raw of m3.records as Row[]) if (raw.fact_type === 'RECEIPT' && invoiceKey(raw.invoice_number)) receivedInvoices.add(invoiceKey(raw.invoice_number));
  for (const raw of (m4?.records ?? []) as Row[]) if (raw.row_type === 'RECEIPT_12322' && invoiceKey(raw.invoice_number)) receivedInvoices.add(invoiceKey(raw.invoice_number));
  for (const raw of m3.records as Row[]) {
    const type = str(raw.fact_type); let item = find(raw);
    if (!item && type === 'INBOUND_ORDER') {
      const distributor = first(raw, ['industry_material']); const id = `CARTEIRA:${key(distributor)}`;
      item = items.get(id) ?? add({ id, description: `Item da Carteira — ${distributor || 'sem código'}`, winthor: '', distributor, ean: '', physical: 0, reserved: 0, available: 0, priceWithoutSt: null, stValue: null, priceWithSt: null, industryTablePrice: null, inboundQty: 0, invoices: [], arrival: null, lastReceipt: null, sold: 0, salesValue: 0, averageMonthlySales: 0, lastSale: null, coverage: null, isLaunch: false, unregistered: true, line: '', brand: '', subbrand: '', category: '', contents: '', unitsPerCase: null, cost: null, assortment: [], assortmentMaterialized: false });
    }
    if (!item) continue;
    if (type === 'INBOUND_ORDER') { const invoice = invoiceKey(raw.invoice_number); item.inboundQty += num(raw.order_qty) + (receivedInvoices.has(invoice) ? 0 : num(raw.bill_qty)); if (invoice && !item.invoices.includes(invoice)) item.invoices.push(invoice); const planned = forecasts[invoice] ?? null; if (planned && (!item.arrival || planned < item.arrival)) item.arrival = planned; }
    if (type === 'RECEIPT') { const d = str(raw.receipt_date); if (d && (!item.lastReceipt || d > item.lastReceipt)) item.lastReceipt = d; }
    if (type === 'SALE' && !/DEVOLU/.test(norm(raw.sale_type)) && num(raw.value) > 0) { item.sold += num(raw.units); item.salesValue += num(raw.value); const d = str(raw.event_date); if (d && (!item.lastSale || d > item.lastSale)) item.lastSale = d; }
  }
  const days = 90;
  return [...items.values()].map(item => ({ ...item, averageMonthlySales: item.sold / 3, coverage: item.sold > 0 ? item.available / (item.sold / days) : null })).sort((a,b) => a.description.localeCompare(b.description));
}

function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) { return <div className={`product-cell ${className}`}><span>{label}</span><strong>{children}</strong></div>; }
function PriceCell({ item }: { item: ProductCatalogItem }) { return <div className="product-cell product-price-cell"><span>Preços de tabela</span><div><small>Sem ST<strong>{item.priceWithoutSt === null ? '—' : money.format(item.priceWithoutSt)}</strong></small><small>ST<strong>{item.stValue === null ? '—' : money.format(item.stValue)}</strong></small><small>Com ST<strong>{item.priceWithSt === null ? '—' : money.format(item.priceWithSt)}</strong></small></div></div>; }
function ProductAssortment({ item }: { item: ProductCatalogItem }) { return <section className="product-assortment"><div><span>SORTIMENTO POR FAIXA</span><strong>Em quais clientes este item deve aparecer</strong><small>A faixa cadastrada no cliente define a disponibilidade para o vendedor.</small></div>{item.assortment.length ? <div className="product-assortment-chips">{item.assortment.map(channel=><span key={channel.field}><strong>{channel.label}</strong><small>{channel.range}</small><em>{channel.classification}</em></span>)}</div> : <p>{item.assortmentMaterialized ? 'Item não recomendado nas faixas 1 a 6.' : 'Sortimento ainda não materializado para este item.'}</p>}</section>; }
export function ProductCatalogPage({ m1, m3, m4, launchesOnly = false }: { m1: CanonicalList; m3: CanonicalList; m4?: CanonicalList; launchesOnly?: boolean }) {
  const [query, setQuery] = useState(''); const [stock, setStock] = useState('all'); const [open, setOpen] = useState<string | null>(null);
  const catalog = useMemo(() => buildProductCatalog(m1, m3, m4), [m1, m3, m4]);
  const rows = catalog.filter(item => (!launchesOnly || item.isLaunch) && (stock === 'all' || stock === 'available' && item.available > 0 || stock === 'portfolio' && item.inboundQty > 0 || stock === 'pending' && item.unregistered) && matchesProductSearch(item, query));
  const title = launchesOnly ? 'Lançamentos' : 'Produtos';
  return <PanelPage title={title} metricLabel="ITENS ENCONTRADOS" metricValue={qty.format(rows.length)}><div className="panel-stack product-catalog-stack">
    <PanelCard compact><PanelSectionHeader eyebrow="CATÁLOGO OPERACIONAL" title={launchesOnly ? 'Itens da lista oficial de lançamentos' : 'Todos os itens disponíveis e em Carteira'} description="Volumes em caixas e Un/CX. Códigos e EAN exigem correspondência exata; descrição, marca e sub-brand aceitam busca parcial. Preços vêm da PCTABPR região 11." />
      <div className="product-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto, EAN ou código" aria-label="Buscar produto" /><select value={stock} onChange={e=>setStock(e.target.value)} aria-label="Filtrar situação"><option value="all">Todas as situações</option><option value="available">Com estoque disponível</option><option value="portfolio">Na Carteira</option><option value="pending">Aguarda cadastro</option></select></div>
    </PanelCard>
    {rows.length ? <div className="product-list">{rows.map(item => <article className="product-row" key={item.id}>
      <button className="product-row-main" type="button" onClick={()=>setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
        <div className="product-name"><strong>{item.description}</strong><span className={item.isLaunch ? 'product-launch-badge' : ''}>{item.unregistered ? 'Aguarda cadastro · vindo da Carteira' : item.isLaunch ? 'Lançamento' : 'Item cadastrado'}</span><small>{[item.line, item.brand, item.subbrand].filter(Boolean).join(' · ') || 'Classificação não informada'} · Winthor {item.winthor || '—'} · Distribuidor {item.distributor || '—'} · EAN {item.ean || '—'}</small></div>
        <Cell label="Estoque disponível">{stockVolume(item.available, item.unitsPerCase)}</Cell><Cell label="Carteira">{item.inboundQty ? `${boxes.format(item.inboundQty)} cx.` : '—'}</Cell><Cell label="Un/CX">{item.unitsPerCase ? qty.format(item.unitsPerCase) : '—'}</Cell><PriceCell item={item} /><Cell label="Giro mensal">{item.sold && item.unitsPerCase ? `${boxes.format(item.averageMonthlySales / item.unitsPerCase)} cx.` : '—'}</Cell><Cell label="Cobertura">{item.coverage === null ? '—' : `${Math.round(item.coverage)} dias`}</Cell><span className="product-chevron">⌄</span>
      </button>
      {open === item.id ? <div className="product-details"><ProductAssortment item={item} /><PanelInfoRow label="Estoque físico" value={stockVolume(item.physical, item.unitsPerCase)} /><PanelInfoRow label="Estoque reservado" value={stockVolume(item.reserved, item.unitsPerCase)} /><PanelInfoRow label="Estoque disponível" value={stockVolume(item.available, item.unitsPerCase)} /><PanelInfoRow label="Giro (últimos 90 dias)" value={item.sold && item.unitsPerCase ? `${boxes.format(item.sold / item.unitsPerCase)} cx. · ${qty.format(item.sold)} un. · última venda ${date(item.lastSale)}` : 'Sem venda positiva ou Un/CX no período'} /><PanelInfoRow label="Última entrada registrada" value={date(item.lastReceipt)} /><PanelInfoRow label="Carteira em aberto" value={item.inboundQty ? `${boxes.format(item.inboundQty)} cx. · NF ${item.invoices.join(', ')}` : 'Sem caixas em aberto'} /><PanelInfoRow label="Linha / marca / sub-brand" value={[item.line, item.brand, item.subbrand].filter(Boolean).join(' · ') || 'Não informado'} /><PanelInfoRow label="Categoria / conteúdo" value={[item.category, item.contents].filter(Boolean).join(' · ') || 'Não informado'} /><PanelInfoRow label="Embalagem" value={item.unitsPerCase ? `${qty.format(item.unitsPerCase)} unidades por caixa` : 'Não informada'} /><PanelInfoRow label="Tabela Colgate (base)" value={item.industryTablePrice === null ? 'Não informado' : money.format(item.industryTablePrice)} /><PanelInfoRow label="Preços PCTABPR região 11" value={`Sem ST ${item.priceWithoutSt === null ? '—' : money.format(item.priceWithoutSt)} · ST ${item.stValue === null ? '—' : money.format(item.stValue)} · Com ST ${item.priceWithSt === null ? '—' : money.format(item.priceWithSt)}`} /><PanelInfoRow label="Atividade" value={item.isLaunch ? 'Lançamento importado' : 'Nenhuma atividade/promoção foi importada'} /></div> : null}
    </article>)}</div> : <PanelEmptyState title={launchesOnly ? 'Lista de lançamentos ainda não materializada' : 'Nenhum item neste filtro'} description={launchesOnly ? 'O build ativo não contém itens da Lista Oficial de Lançamentos. Reprocesse o motor atual; se a fonte não estiver salva, atualize somente a base Lançamentos.' : 'Ajuste a busca ou a situação para ver os itens da fotografia ativa.'} />}
  </div></PanelPage>;
}
