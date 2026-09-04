import { Fragment, useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel, type StockOverviewModel, type StockReceiptNote } from '../canonical/stockOverviewModel';
import { clearInboundForecast, inboundForecasts, setInboundForecast } from '../canonical/reportSettings';
import { uploadCurrentDeviceSnapshot, deviceSyncIdentity } from '../canonical/cloudSync';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import type { CanonicalList } from '../canonical/types';
import './EntradasNotasPage.css';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const normalized = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const codeKey = (value: unknown) => digits(value).replace(/^0+(?=\d)/, '');

function receiptMatches(note: StockReceiptNote, query: string) {
  const needle = normalized(query).trim();
  if (!needle) return true;
  if (/^\d+$/.test(needle)) {
    return codeKey(note.invoice) === codeKey(needle)
      || note.items.some(item => codeKey(item.winthorCode) === codeKey(needle) || digits(item.ean) === needle);
  }
  return normalized([
    ...note.items.map(item => item.label),
  ].join(' ')).includes(needle);
}

function inboundMatches(note: StockOverviewModel['inboundNotes'][number], query: string) {
  const needle = normalized(query).trim();
  if (!needle) return true;
  if (/^\d+$/.test(needle)) return codeKey(note.invoice) === codeKey(needle) || note.items.some(item => codeKey(item.label.split(' · ')[0]) === codeKey(needle));
  return normalized(note.items.map(item => item.label).join(' ')).includes(needle);
}

type SaleDocument = { key:string; kind:'FATURADO'|'A_FATURAR'; invoice:string|null; order:string|null; customer:string|null; cnpj:string|null; movementDate:string|null; invoiceDate:string|null; status:string|null; block:string|null; seller:string|null; value:number; items:Array<{code:string|null;ean:string|null;label:string;cases:number;units:number;value:number}> };
const amount = (value: unknown) => Number(value ?? 0) || 0;
const saleKind = (row: Record<string, unknown>) => normalized(row.order_status).includes('A FATURAR') ? 'A_FATURAR' : 'FATURADO';
function saleDocuments(records: Array<Record<string, unknown>>) {
  const grouped = new Map<string, SaleDocument>();
  for (const row of records.filter(row => row.fact_type === 'SALE' && row.source === '8022')) {
    const kind=saleKind(row), invoice=String(row.invoice_number ?? '').trim() || null, rawOrder=String(row.order_winthor ?? '').trim(), order=/^\d{4,}$/.test(rawOrder) ? rawOrder : null;
    const key=`${kind}:${kind==='FATURADO' ? invoice ?? order ?? row.fact_id : order ?? invoice ?? row.fact_id}`;
    const doc=grouped.get(key) ?? {key,kind,invoice,order,customer:String(row.customer_name ?? '').trim() || null,cnpj:String(row.cnpj ?? '').trim() || null,movementDate:String(row.event_date ?? '').slice(0,10) || null,invoiceDate:String(row.invoice_issue_date ?? '').slice(0,10) || null,status:String(row.order_status ?? '').trim() || null,block:String(row.block_status ?? '').trim() || null,seller:String(row.seller_name ?? '').trim() || null,value:0,items:[]};
    doc.value+=amount(row.value); doc.items.push({code:String(row.winthor_product_code ?? '').trim()||null,ean:String(row.ean_product ?? '').trim()||null,label:String(row.product_description ?? row.winthor_product_code ?? 'Item sem descrição'),cases:amount(row.cases),units:amount(row.units),value:amount(row.value)}); grouped.set(key,doc);
  }
  return [...grouped.values()].sort((a,b)=>b.value-a.value);
}
function saleMatches(note: SaleDocument, query:string) { const needle=normalized(query).trim(); if(!needle)return true; const all=[note.invoice,note.order,note.customer,note.cnpj,...note.items.flatMap(i=>[i.code,i.ean,i.label])].join(' '); return /^\d+$/.test(needle) ? all.split(/\D+/).some(value=>codeKey(value)===codeKey(needle)||digits(value)===needle) : normalized(all).includes(needle); }

export function EntradasNotasPage() {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m3: CanonicalList; m4: CanonicalList } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'ALL' | '218' | '12.322'>('ALL');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedTo, setReceivedTo] = useState('');
  const [openQuery, setOpenQuery] = useState('');
  const [forecastFilter, setForecastFilter] = useState<'ALL' | 'WITH_FORECAST' | 'WITHOUT_FORECAST'>('ALL');
  const [forecastFrom, setForecastFrom] = useState('');
  const [forecastTo, setForecastTo] = useState('');
  const [openSort, setOpenSort] = useState<'VALUE_DESC' | 'FORECAST_ASC' | 'ISSUE_ASC'>('VALUE_DESC');
  const [saleQuery, setSaleQuery] = useState('');
  const [saleExpanded, setSaleExpanded] = useState<string | null>(null);
  const [view, setView] = useState<'ENTRADAS' | 'SAIDAS'>('ENTRADAS');
  const [pendingQuery, setPendingQuery] = useState('');
  const [pendingCustomer, setPendingCustomer] = useState('ALL');
  const sync = deviceSyncIdentity();

  useEffect(() => {
    if (!activeCanonical) { setLists(null); return; }
    let live = true;
    Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M3_MOVIMENTO_VENDAS'), loadCandidateList('M4_HISTORICO_TRANSICAO')])
      .then(([m1, m3, m4]) => { if (live) setLists({ m1, m3, m4 }); })
      .catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [activeCanonical]);

  useEffect(() => {
    const refresh = () => setVersion(value => value + 1);
    window.addEventListener('blue-jacket-report-settings-changed', refresh);
    return () => window.removeEventListener('blue-jacket-report-settings-changed', refresh);
  }, []);

  const model = useMemo<StockOverviewModel | null>(() => lists ? buildStockOverviewModel({ ...lists, forecasts: inboundForecasts() }) : null, [lists, version]);
  const receivedNotes = useMemo(() => model?.receivedNotes.filter(note => {
    if (!receiptMatches(note, query)) return false;
    if (source !== 'ALL' && !note.sources.includes(source)) return false;
    if (receivedFrom && (!note.receiptDate || note.receiptDate < receivedFrom)) return false;
    if (receivedTo && (!note.receiptDate || note.receiptDate > receivedTo)) return false;
    return true;
  }) ?? [], [model, query, source, receivedFrom, receivedTo]);
  const openNotes = useMemo(() => (model?.inboundNotes.filter(note => {
    if (note.received || note.outstandingValue <= 0) return false;
    if (!inboundMatches(note, openQuery)) return false;
    const forecast = inboundForecasts()[note.invoice] ?? '';
    if (forecastFilter === 'WITH_FORECAST' && !forecast) return false;
    if (forecastFilter === 'WITHOUT_FORECAST' && forecast) return false;
    if (forecastFrom && (!forecast || forecast < forecastFrom)) return false;
    if (forecastTo && (!forecast || forecast > forecastTo)) return false;
    return true;
  }) ?? []).sort((left, right) => {
    if (openSort === 'VALUE_DESC') return right.outstandingValue - left.outstandingValue || left.invoice.localeCompare(right.invoice);
    if (openSort === 'ISSUE_ASC') return (left.billingDate ?? '9999-12-31').localeCompare(right.billingDate ?? '9999-12-31') || right.outstandingValue - left.outstandingValue;
    const leftForecast = inboundForecasts()[left.invoice] ?? '9999-12-31';
    const rightForecast = inboundForecasts()[right.invoice] ?? '9999-12-31';
    return leftForecast.localeCompare(rightForecast) || right.outstandingValue - left.outstandingValue;
  }), [model, version, openQuery, forecastFilter, forecastFrom, forecastTo, openSort]);

  const receiptForecastStatus = (note: StockReceiptNote) => {
    const forecast = inboundForecasts()[note.invoice] ?? '';
    if (!forecast || !note.receiptDate) return null;
    return note.receiptDate <= forecast ? 'RECEBIDA NO PRAZO' : 'RECEBIDA APÓS PREVISÃO';
  };
  const sales = useMemo(() => saleDocuments((lists?.m3.records ?? []) as Array<Record<string, unknown>>), [lists]);
  const invoicedSales = sales.filter(note => note.kind === 'FATURADO' && saleMatches(note, saleQuery));
  const pendingCustomers = [...new Set(sales.filter(note => note.kind === 'A_FATURAR').map(note => note.customer ?? note.cnpj ?? '').filter(Boolean))].sort();
  const pendingSales = sales.filter(note => note.kind === 'A_FATURAR' && saleMatches(note, pendingQuery) && (pendingCustomer === 'ALL' || (note.customer ?? note.cnpj) === pendingCustomer));

  const saveDate = async (invoice: string, value: string) => {
    setSaving(invoice); setError(''); setStatus('');
    if (value) setInboundForecast(invoice, value); else clearInboundForecast(invoice);
    setStatus(value ? `Previsão da NF ${invoice} salva.` : `Previsão da NF ${invoice} removida.`);
    if (sync) {
      try { await uploadCurrentDeviceSnapshot(sync); }
      catch (reason) { setError(`A data foi salva neste aparelho, mas não foi sincronizada: ${String(reason)}`); }
    }
    setSaving(null);
  };

  if (!activeCanonical) return <PanelPage title="Entradas e Saídas"><PanelEmptyState variant="page" title="Sem bases carregadas" description="Atualize Carteira, 218 e 12.322 para consultar as entradas de notas." /></PanelPage>;
  if (!model) return <PanelPage title="Entradas e Saídas"><PanelEmptyState variant="page" title="Carregando notas" description="Leitura das notas recebidas e dos vínculos internos." /></PanelPage>;

  return <PanelPage title="Entradas e Saídas">
    <div className="panel-stack inbound-notes-page">
      <nav className="inbound-view-tabs" aria-label="Visualização operacional"><button type="button" className={view === 'ENTRADAS' ? 'is-active' : ''} onClick={() => setView('ENTRADAS')}>Entradas <span>Carteira · 218 · 12.322</span></button><button type="button" className={view === 'SAIDAS' ? 'is-active' : ''} onClick={() => setView('SAIDAS')}>Saídas <span>8022 · Faturado · A faturar</span></button></nav>
      {view === 'ENTRADAS' ? <PanelCard>
        <PanelSectionHeader eyebrow="RECEBIMENTOS CONFIRMADOS" title="Chegada efetiva de notas" description="Notas encontradas no 218 e no 12.322. Abra uma NF para consultar os itens realmente registrados no recebimento." />
        <div className="inbound-note-filters">
          <label className="inbound-filter-search"><span>Buscar</span><input className="panel-input panel-input-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="NF, EAN, código ou produto" /></label>
          <label><span>Fonte</span><select className="panel-select" value={source} onChange={event => setSource(event.target.value as 'ALL' | '218' | '12.322')}><option value="ALL">Todas as fontes</option><option value="218">218 — com itens</option><option value="12.322">12.322 — histórico</option></select></label>
          <label><span>Recebida de</span><input className="panel-input" type="date" value={receivedFrom} onChange={event => setReceivedFrom(event.target.value)} /></label>
          <label><span>até</span><input className="panel-input" type="date" value={receivedTo} onChange={event => setReceivedTo(event.target.value)} /></label>
        </div>
        <div className="inbound-note-result"><strong>{number.format(receivedNotes.length)} NF(s) recebida(s)</strong><span>{query ? `Resultado para “${query}”` : 'Busque por NF, EAN, código Winthor ou nome do produto.'}</span></div>
        {receivedNotes.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table inbound-receipts-table"><thead><tr><th>NF</th><th>Recebida em</th><th>Emitida em</th><th>Fonte</th><th>Valor da NF</th><th>Itens</th><th>Previsão</th></tr></thead><tbody>{receivedNotes.map(note => {
          const expandKey = `receipt:${note.invoice}`;
          const forecastStatus = receiptForecastStatus(note);
          return <Fragment key={expandKey}><tr className="inbound-note-row">
            <td><button type="button" className="inbound-note-toggle" onClick={() => setExpanded(expanded === expandKey ? null : expandKey)} aria-expanded={expanded === expandKey}>{expanded === expandKey ? '−' : '+'} NF {note.invoice}</button></td>
            <td>{date(note.receiptDate)}</td>
            <td>{date(note.invoiceIssueDate)}</td>
            <td><span className="inbound-note-source">{note.sources.join(' + ')}</span></td>
            <td>{note.totalValue === null ? '—' : currency.format(note.totalValue)}</td>
            <td>{note.items.length ? number.format(note.items.length) : '—'}</td>
            <td>{forecastStatus ? <span className={`inbound-note-status ${forecastStatus === 'RECEBIDA NO PRAZO' ? 'is-on-time' : 'is-late'}`}>{forecastStatus}</span> : '—'}</td>
          </tr>{expanded === expandKey ? <tr className="inbound-note-details"><td colSpan={7}>{note.items.length ? <ul className="inbound-receipt-items">{note.items.map(item => <li key={`${item.winthorCode ?? ''}:${item.ean ?? ''}:${item.label}`}><div><strong>{item.label}</strong><span>{item.winthorCode ? `Cód. ${item.winthorCode}` : 'Código não vinculado'}{item.ean ? ` · EAN ${item.ean}` : ''}</span></div><div><strong>{number.format(item.quantity)} un.</strong><span>{item.unitPrice === null ? 'Preço não informado' : `${currency.format(item.unitPrice)} un. · ${item.totalValue === null ? '—' : currency.format(item.totalValue)}`}</span></div></li>)}</ul> : <div className="inbound-note-no-items">O 12.322 confirma a chegada desta NF, mas é um relatório histórico sem detalhamento por item.</div>}</td></tr> : null}</Fragment>;
        })}</tbody></table></div> : <PanelEmptyState title="Nenhuma chegada encontrada" description="Ajuste os filtros ou busque por outra NF, EAN, código ou produto." />}
      </PanelCard> : null}

      {view === 'SAIDAS' ? <><PanelCard>
        <PanelSectionHeader eyebrow="SAÍDAS — 8022" title="Notas faturadas para clientes" description="Somente vendas confirmadas no 8022. Abra a NF para consultar pedido Winthor, cliente e itens." />
        <label className="inbound-filter-search outbound-search"><span>Buscar nas saídas</span><input className="panel-input panel-input-search" value={saleQuery} onChange={event => setSaleQuery(event.target.value)} placeholder="NF, pedido, cliente, CNPJ, EAN ou código" /></label>
        <div className="inbound-note-result"><strong>{number.format(invoicedSales.length)} NF(s) faturada(s)</strong><span>Venda confirmada no 8022.</span></div>
        {invoicedSales.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table outbound-notes-table"><thead><tr><th>NF</th><th>Pedido Winthor</th><th>Cliente</th><th>Emitida em</th><th>Valor</th><th>Itens</th></tr></thead><tbody>{invoicedSales.map(note => <Fragment key={note.key}><tr className="inbound-note-row"><td><button type="button" className="inbound-note-toggle" onClick={()=>setSaleExpanded(saleExpanded===note.key?null:note.key)}>{saleExpanded===note.key?'−':'+'} NF {note.invoice ?? '—'}</button></td><td>{note.order ?? '—'}</td><td>{note.customer ?? note.cnpj ?? '—'}</td><td>{date(note.invoiceDate)}</td><td>{currency.format(note.value)}</td><td>{number.format(note.items.length)}</td></tr>{saleExpanded===note.key?<tr className="inbound-note-details"><td colSpan={6}><div className="inbound-note-details-grid"><span>Cliente: <strong>{note.customer ?? '—'}</strong></span><span>CNPJ: <strong>{note.cnpj ?? '—'}</strong></span><span>Pedido Winthor: <strong>{note.order ?? '—'}</strong></span><span>Vendedor: <strong>{note.seller ?? '—'}</strong></span></div><ul>{note.items.map(item=><li key={`${item.code}:${item.ean}:${item.label}`}><span>{item.label}<br />{item.code?`Cód. ${item.code}`:'Código não informado'}{item.ean?` · EAN ${item.ean}`:''}</span><strong>{number.format(item.cases)} cx · {number.format(item.units)} un. · {currency.format(item.value)}</strong></li>)}</ul></td></tr>:null}</Fragment>)}</tbody></table></div>:<PanelEmptyState title="Nenhuma NF faturada" description="Ajuste a busca para consultar outra saída." />}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="SAÍDAS — 8022" title="Pedidos a faturar" description="Carteira de saída da Milênio para clientes. Não há previsão manual nesta etapa; o status vem exclusivamente do 8022." />
        <div className="inbound-note-filters"><label className="inbound-filter-search"><span>Buscar na carteira</span><input className="panel-input panel-input-search" value={pendingQuery} onChange={event => setPendingQuery(event.target.value)} placeholder="Pedido, cliente, CNPJ, EAN ou código" /></label><label><span>Cliente</span><select className="panel-select" value={pendingCustomer} onChange={event => setPendingCustomer(event.target.value)}><option value="ALL">Todos os clientes</option>{pendingCustomers.map(customer => <option key={customer} value={customer}>{customer}</option>)}</select></label></div>
        <div className="inbound-note-result"><strong>{number.format(pendingSales.length)} pedido(s) a faturar</strong><span>Separados das NFs já emitidas.</span></div>
        {pendingSales.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table outbound-notes-table"><thead><tr><th>Pedido Winthor</th><th>Cliente</th><th>Data movimento</th><th>Status</th><th>Valor pendente</th><th>Itens</th></tr></thead><tbody>{pendingSales.map(note => <Fragment key={note.key}><tr className="inbound-note-row"><td><button type="button" className="inbound-note-toggle" onClick={()=>setSaleExpanded(saleExpanded===note.key?null:note.key)}>{saleExpanded===note.key?'−':'+'} {note.order ?? '—'}</button></td><td>{note.customer ?? note.cnpj ?? '—'}</td><td>{date(note.movementDate)}</td><td><span className="inbound-note-status is-open">{note.status ?? 'A FATURAR'}</span></td><td>{currency.format(note.value)}</td><td>{number.format(note.items.length)}</td></tr>{saleExpanded===note.key?<tr className="inbound-note-details"><td colSpan={6}><div className="inbound-note-details-grid"><span>Cliente: <strong>{note.customer ?? '—'}</strong></span><span>CNPJ: <strong>{note.cnpj ?? '—'}</strong></span><span>Bloqueio: <strong>{note.block ?? '—'}</strong></span><span>Vendedor: <strong>{note.seller ?? '—'}</strong></span></div><ul>{note.items.map(item=><li key={`${item.code}:${item.ean}:${item.label}`}><span>{item.label}<br />{item.code?`Cód. ${item.code}`:'Código não informado'}{item.ean?` · EAN ${item.ean}`:''}</span><strong>{number.format(item.cases)} cx · {number.format(item.units)} un. · {currency.format(item.value)}</strong></li>)}</ul></td></tr>:null}</Fragment>)}</tbody></table></div>:<PanelEmptyState title="Nenhum pedido a faturar" description="O 8022 atual não trouxe pedidos com esse status para a busca selecionada." />}
      </PanelCard></> : null}

      {view === 'ENTRADAS' ? <PanelCard>
        <PanelSectionHeader eyebrow="CARTEIRA COLGATE" title="Notas ainda em aberto" description="Aqui ficam somente as NFs que aguardam chegada. Informe a previsão nesta tabela; notas recebidas permanecem acima, na consulta de chegada efetiva." />
        <div className="inbound-note-filters">
          <label className="inbound-filter-search"><span>Buscar na Carteira</span><input className="panel-input panel-input-search" value={openQuery} onChange={event => setOpenQuery(event.target.value)} placeholder="NF, código ou produto" /></label>
          <label><span>Previsão</span><select className="panel-select" value={forecastFilter} onChange={event => setForecastFilter(event.target.value as 'ALL' | 'WITH_FORECAST' | 'WITHOUT_FORECAST')}><option value="ALL">Todas em aberto</option><option value="WITH_FORECAST">Com previsão</option><option value="WITHOUT_FORECAST">Sem previsão</option></select></label>
          <label><span>Previsão de</span><input className="panel-input" type="date" value={forecastFrom} onChange={event => setForecastFrom(event.target.value)} /></label>
          <label><span>até</span><input className="panel-input" type="date" value={forecastTo} onChange={event => setForecastTo(event.target.value)} /></label>
          <label><span>Ordenar</span><select className="panel-select" value={openSort} onChange={event => setOpenSort(event.target.value as typeof openSort)}><option value="VALUE_DESC">Maior valor em aberto</option><option value="FORECAST_ASC">Previsão mais próxima</option><option value="ISSUE_ASC">Emissão mais antiga</option></select></label>
        </div>
        <div className="inbound-note-result"><strong>{number.format(openNotes.length)} NF(s) em aberto</strong><span>{openQuery ? `Resultado para “${openQuery}”` : 'Filtre por previsão ou busque uma NF, código ou produto.'}</span></div>
        {status ? <PanelAlert tone="success">{status}</PanelAlert> : null}
        {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
        {openNotes.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table"><thead><tr><th>NF</th><th>Emitida em</th><th>Previsão de entrada</th><th>Valor da NF</th><th>Em aberto</th><th>Itens</th><th>Situação</th></tr></thead><tbody>{openNotes.map(note => {
          const forecast = inboundForecasts()[note.invoice] ?? '';
          const expandKey = `inbound:${note.invoice}`;
          return <Fragment key={expandKey}><tr className="inbound-note-row">
            <td><button type="button" className="inbound-note-toggle" onClick={() => setExpanded(expanded === expandKey ? null : expandKey)} aria-expanded={expanded === expandKey}>{expanded === expandKey ? '−' : '+'} NF {note.invoice}</button></td>
            <td>{date(note.billingDate)}</td>
            <td><input className="panel-input inbound-note-date" type="date" value={forecast} disabled={saving === note.invoice} onChange={event => void saveDate(note.invoice, event.target.value)} aria-label={`Previsão da NF ${note.invoice}`} /></td>
            <td>{currency.format(note.totalValue)}</td>
            <td>{currency.format(note.outstandingValue)}</td>
            <td>{number.format(note.items.length)}</td>
            <td><span className="inbound-note-status is-open">EM ABERTO</span></td>
          </tr>{expanded === expandKey ? <tr className="inbound-note-details"><td colSpan={7}><div className="inbound-note-details-grid"><span>Pedido: <strong>{note.orderQty ? number.format(note.orderQty) : '—'} cx.</strong></span><span>Faturado: <strong>{note.billQty ? number.format(note.billQty) : '—'} cx.</strong></span><span>Saldo: <strong>{note.outstandingQty ? number.format(note.outstandingQty) : '—'} cx.</strong></span></div><ul>{note.items.length ? note.items.map(item => <li key={item.label}><span>{item.label}</span><strong>{number.format(item.quantity)} cx{item.units === null ? '' : ` · ${number.format(item.units)} un.`}</strong></li>) : <li>Não foi possível vincular itens internos a esta NF.</li>}</ul></td></tr> : null}</Fragment>;
        })}</tbody></table></div> : <PanelEmptyState title="Nenhuma NF em aberto" description={query ? 'Nenhuma NF em aberto corresponde à busca atual.' : 'Todas as NFs identificadas na Carteira já constam como recebidas.'} />}
      </PanelCard> : null}
    </div>
  </PanelPage>;
}
