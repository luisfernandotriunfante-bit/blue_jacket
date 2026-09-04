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
  const openNotes = useMemo(() => model?.inboundNotes.filter(note => {
    if (note.received || note.outstandingValue <= 0) return false;
    if (!inboundMatches(note, openQuery)) return false;
    const forecast = inboundForecasts()[note.invoice] ?? '';
    if (forecastFilter === 'WITH_FORECAST' && !forecast) return false;
    if (forecastFilter === 'WITHOUT_FORECAST' && forecast) return false;
    if (forecastFrom && (!forecast || forecast < forecastFrom)) return false;
    if (forecastTo && (!forecast || forecast > forecastTo)) return false;
    return true;
  }) ?? [], [model, version, openQuery, forecastFilter, forecastFrom, forecastTo]);

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
      <PanelCard>
        <PanelSectionHeader eyebrow="RECEBIMENTOS CONFIRMADOS" title="Chegada efetiva de notas" description="Notas encontradas no 218 e no 12.322. Abra uma NF para consultar os itens realmente registrados no recebimento." />
        <div className="inbound-note-filters">
          <label className="inbound-filter-search"><span>Buscar</span><input className="panel-input panel-input-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="NF, EAN, código ou produto" /></label>
          <label><span>Fonte</span><select className="panel-select" value={source} onChange={event => setSource(event.target.value as 'ALL' | '218' | '12.322')}><option value="ALL">Todas as fontes</option><option value="218">218 — com itens</option><option value="12.322">12.322 — histórico</option></select></label>
          <label><span>Recebida de</span><input className="panel-input" type="date" value={receivedFrom} onChange={event => setReceivedFrom(event.target.value)} /></label>
          <label><span>até</span><input className="panel-input" type="date" value={receivedTo} onChange={event => setReceivedTo(event.target.value)} /></label>
        </div>
        <div className="inbound-note-result"><strong>{number.format(receivedNotes.length)} NF(s) recebida(s)</strong><span>{query ? `Resultado para “${query}”` : 'Busque por NF, EAN, código Winthor ou nome do produto.'}</span></div>
        {receivedNotes.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table inbound-receipts-table"><thead><tr><th>NF</th><th>Recebida em</th><th>Emitida em</th><th>Fonte</th><th>Valor da NF</th><th>Itens</th></tr></thead><tbody>{receivedNotes.map(note => {
          const expandKey = `receipt:${note.invoice}`;
          return <Fragment key={expandKey}><tr className="inbound-note-row">
            <td><button type="button" className="inbound-note-toggle" onClick={() => setExpanded(expanded === expandKey ? null : expandKey)} aria-expanded={expanded === expandKey}>{expanded === expandKey ? '−' : '+'} NF {note.invoice}</button></td>
            <td>{date(note.receiptDate)}</td>
            <td>{date(note.invoiceIssueDate)}</td>
            <td><span className="inbound-note-source">{note.sources.join(' + ')}</span></td>
            <td>{note.totalValue === null ? '—' : currency.format(note.totalValue)}</td>
            <td>{note.items.length ? number.format(note.items.length) : '—'}</td>
          </tr>{expanded === expandKey ? <tr className="inbound-note-details"><td colSpan={6}>{note.items.length ? <ul className="inbound-receipt-items">{note.items.map(item => <li key={`${item.winthorCode ?? ''}:${item.ean ?? ''}:${item.label}`}><div><strong>{item.label}</strong><span>{item.winthorCode ? `Cód. ${item.winthorCode}` : 'Código não vinculado'}{item.ean ? ` · EAN ${item.ean}` : ''}</span></div><div><strong>{number.format(item.quantity)} un.</strong><span>{item.unitPrice === null ? 'Preço não informado' : `${currency.format(item.unitPrice)} un. · ${item.totalValue === null ? '—' : currency.format(item.totalValue)}`}</span></div></li>)}</ul> : <div className="inbound-note-no-items">O 12.322 confirma a chegada desta NF, mas é um relatório histórico sem detalhamento por item.</div>}</td></tr> : null}</Fragment>;
        })}</tbody></table></div> : <PanelEmptyState title="Nenhuma chegada encontrada" description="Ajuste os filtros ou busque por outra NF, EAN, código ou produto." />}
      </PanelCard>

      <PanelCard>
        <PanelSectionHeader eyebrow="CARTEIRA COLGATE" title="Notas ainda em aberto" description="Aqui ficam somente as NFs que aguardam chegada. Informe a previsão nesta tabela; notas recebidas permanecem acima, na consulta de chegada efetiva." />
        <div className="inbound-note-filters">
          <label className="inbound-filter-search"><span>Buscar na Carteira</span><input className="panel-input panel-input-search" value={openQuery} onChange={event => setOpenQuery(event.target.value)} placeholder="NF, código ou produto" /></label>
          <label><span>Previsão</span><select className="panel-select" value={forecastFilter} onChange={event => setForecastFilter(event.target.value as 'ALL' | 'WITH_FORECAST' | 'WITHOUT_FORECAST')}><option value="ALL">Todas em aberto</option><option value="WITH_FORECAST">Com previsão</option><option value="WITHOUT_FORECAST">Sem previsão</option></select></label>
          <label><span>Previsão de</span><input className="panel-input" type="date" value={forecastFrom} onChange={event => setForecastFrom(event.target.value)} /></label>
          <label><span>até</span><input className="panel-input" type="date" value={forecastTo} onChange={event => setForecastTo(event.target.value)} /></label>
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
      </PanelCard>
    </div>
  </PanelPage>;
}
