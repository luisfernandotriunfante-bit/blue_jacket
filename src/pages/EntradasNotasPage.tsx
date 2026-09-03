import { Fragment, useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel, type StockOverviewModel } from '../canonical/stockOverviewModel';
import { clearInboundForecast, inboundForecasts, setInboundForecast } from '../canonical/reportSettings';
import { uploadCurrentDeviceSnapshot, deviceSyncIdentity } from '../canonical/cloudSync';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import type { CanonicalList } from '../canonical/types';
import './EntradasNotasPage.css';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

export function EntradasNotasPage() {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m3: CanonicalList; m4: CanonicalList } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
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

  if (!activeCanonical) return <PanelPage title="Entradas e Saídas"><PanelEmptyState variant="page" title="Sem Carteira carregada" description="Atualize as bases para materializar as notas de entrada da Carteira Colgate." /></PanelPage>;
  if (!model) return <PanelPage title="Entradas e Saídas"><PanelEmptyState variant="page" title="Carregando notas" description="Leitura das notas da Carteira e dos vínculos internos." /></PanelPage>;

  return <PanelPage title="Entradas e Saídas">
    <div className="panel-stack inbound-notes-page">
      <PanelCard>
        <PanelSectionHeader eyebrow="CARTEIRA COLGATE" title="Entradas de notas" description="Cada linha representa uma NF da Carteira. Clique na NF para ver os itens vinculados; a previsão é preenchida manualmente nesta própria tela." />
        {status ? <PanelAlert tone="success">{status}</PanelAlert> : null}
        {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
        {model.inboundNotes.length ? <div className="panel-table-wrap inbound-notes-table-wrap"><table className="panel-table inbound-notes-table"><thead><tr><th>NF</th><th>Emitida em</th><th>Previsão de entrada</th><th>Valor da NF</th><th>Em aberto</th><th>Itens</th><th>Situação</th></tr></thead><tbody>{model.inboundNotes.map(note => {
          const forecast = inboundForecasts()[note.invoice] ?? '';
          const isOpen = !note.received && note.outstandingValue > 0;
          return <Fragment key={note.invoice}><tr className="inbound-note-row">
            <td><button type="button" className="inbound-note-toggle" onClick={() => setExpanded(expanded === note.invoice ? null : note.invoice)} aria-expanded={expanded === note.invoice}>{expanded === note.invoice ? '−' : '+'} NF {note.invoice}</button></td>
            <td>{date(note.billingDate)}</td>
            <td><input className="panel-input inbound-note-date" type="date" value={forecast} disabled={!isOpen || saving === note.invoice} onChange={event => void saveDate(note.invoice, event.target.value)} aria-label={`Previsão da NF ${note.invoice}`} /></td>
            <td>{currency.format(note.totalValue)}</td>
            <td>{currency.format(note.outstandingValue)}</td>
            <td>{number.format(note.items.length)}</td>
            <td><span className={`inbound-note-status ${isOpen ? 'is-open' : 'is-received'}`}>{isOpen ? 'EM ABERTO' : 'RECEBIDA'}</span></td>
          </tr>{expanded === note.invoice ? <tr className="inbound-note-details"><td colSpan={7}><div className="inbound-note-details-grid"><span>Pedido: <strong>{note.orderQty ? number.format(note.orderQty) : '—'} cx.</strong></span><span>Faturado: <strong>{note.billQty ? number.format(note.billQty) : '—'} cx.</strong></span><span>Saldo: <strong>{note.outstandingQty ? number.format(note.outstandingQty) : '—'} cx.</strong></span></div><ul>{note.items.length ? note.items.map(item => <li key={item.label}><span>{item.label}</span><strong>{number.format(item.quantity)} cx{item.units === null ? '' : ` · ${number.format(item.units)} un.`}</strong></li>) : <li>Não foi possível vincular itens internos a esta NF.</li>}</ul></td></tr> : null}</Fragment>;
          })}</tbody></table></div> : <PanelEmptyState title="Nenhuma NF encontrada" description="A Carteira atual não possui notas com número identificável." />}
      </PanelCard>
    </div>
  </PanelPage>;
}
