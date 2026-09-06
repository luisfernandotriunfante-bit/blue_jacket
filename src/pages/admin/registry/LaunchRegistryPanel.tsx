import { useMemo, useState } from 'react';
import { setRegistryRecordActive, upsertManualLaunch, type LaunchRegistryRecord } from '../../../canonical/adminRegistry';
import { adminRegistryRepository } from '../../../canonical/adminRegistryIndexedDb';
import { PanelAlert, PanelCard, PanelSectionHeader } from '../../../ui/pattern/PanelVisual';
import { RegistryMessages, RegistryStatus, SeedPreviewCard, useRegistryPanel } from './RegistryPanelShared';

type FormState = {
  winthorCode: string;
  ean: string;
  description: string;
  type: string;
  status: string;
  validFromCompetence: string;
  validToCompetence: string;
  note: string;
};

const EMPTY_FORM: FormState = { winthorCode: '', ean: '', description: '', type: '', status: '', validFromCompetence: '', validToCompetence: '', note: '' };

export function LaunchRegistryPanel() {
  const panel = useRegistryPanel('launches');
  const records = panel.state?.launches ?? [];
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mutationError, setMutationError] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const wantedStatus = statusFilter.trim().toLowerCase();
    return records.filter(record => {
      if (activeFilter === 'ACTIVE' && !record.active) return false;
      if (activeFilter === 'INACTIVE' && record.active) return false;
      if (wantedStatus && String(record.status ?? '').toLowerCase() !== wantedStatus) return false;
      if (!query) return true;
      return [record.ean, record.winthorCode, record.description, record.status].some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }, [records, search, activeFilter, statusFilter]);

  const statuses = useMemo(() => [...new Set(records.map(record => record.status).filter((value): value is string => Boolean(value)))].sort(), [records]);

  const edit = (record: LaunchRegistryRecord) => {
    setEditingId(record.id);
    setForm({
      winthorCode: record.winthorCode ?? '',
      ean: record.ean ?? '',
      description: record.description ?? '',
      type: record.type ?? '',
      status: record.status ?? '',
      validFromCompetence: record.validFromCompetence ?? '',
      validToCompetence: record.validToCompetence ?? '',
      note: record.note ?? '',
    });
    setMutationError('');
  };

  const save = async () => {
    setMutationError('');
    try {
      await upsertManualLaunch(adminRegistryRepository, {
        winthorCode: form.winthorCode || null,
        ean: form.ean || null,
        description: form.description || null,
        type: form.type || null,
        status: form.status || null,
        validFromCompetence: form.validFromCompetence || null,
        validToCompetence: form.validToCompetence || null,
        note: form.note || null,
      }, editingId ?? undefined);
      setEditingId(null); setForm(EMPTY_FORM);
      await panel.mutationSaved();
    } catch (reason) { setMutationError(String(reason)); }
  };

  const toggleActive = async (record: LaunchRegistryRecord) => {
    setMutationError('');
    try {
      await setRegistryRecordActive(adminRegistryRepository, 'launches', record.id, !record.active);
      await panel.mutationSaved();
    } catch (reason) { setMutationError(String(reason)); }
  };

  return <>
    <RegistryStatus kind="launches" records={records} lastSeed={panel.lastSeed} conflicts={panel.diagnostics.length} />
    <RegistryMessages notice={panel.notice} error={panel.error || mutationError} />
    <SeedPreviewCard preview={panel.preview} busy={panel.busy} onPreview={() => void panel.previewSeed()} onApply={() => void panel.applySeed()} />

    <PanelCard>
      <PanelSectionHeader eyebrow="CADASTRO" title={editingId ? 'Editar lançamento' : 'Criar lançamento'} description="Exige EAN ou código Winthor. EAN é armazenado como texto GTIN; notação científica é rejeitada e zeros não são inventados." />
      <div className="panel-form-grid">
        <input className="panel-input" placeholder="Código Winthor" value={form.winthorCode} onChange={event => setForm({ ...form, winthorCode: event.target.value })} />
        <input className="panel-input" placeholder="EAN" value={form.ean} onChange={event => setForm({ ...form, ean: event.target.value })} />
        <input className="panel-input" placeholder="Descrição" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
        <input className="panel-input" placeholder="Tipo" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })} />
        <input className="panel-input" placeholder="Status" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} />
        <input className="panel-input" type="month" value={form.validFromCompetence} onChange={event => setForm({ ...form, validFromCompetence: event.target.value })} aria-label="Válido desde" />
        <input className="panel-input" type="month" value={form.validToCompetence} onChange={event => setForm({ ...form, validToCompetence: event.target.value })} aria-label="Válido até" />
        <input className="panel-input" placeholder="Observação" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
      </div>
      <button className="panel-button" onClick={() => void save()}>{editingId ? 'Salvar edição' : 'Criar lançamento'}</button>{' '}
      {editingId ? <button className="panel-button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancelar</button> : null}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="CONSULTA" title="Lançamentos registrados" />
      <div className="panel-form-grid">
        <input className="panel-input" placeholder="Buscar EAN, código, descrição ou status" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="panel-input" value={activeFilter} onChange={event => setActiveFilter(event.target.value as typeof activeFilter)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select>
        <select className="panel-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os status</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select>
      </div>
      {panel.diagnostics.length ? <PanelAlert tone="warning">{panel.diagnostics.map(item => item.message).join(' • ')}</PanelAlert> : null}
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Winthor</th><th>EAN</th><th>Descrição</th><th>Tipo</th><th>Status</th><th>Origem</th><th>Ativo</th><th>Ações</th></tr></thead><tbody>
        {filtered.map(record => <tr key={record.id}><td>{record.winthorCode ?? '—'}</td><td>{record.ean ?? '—'}</td><td>{record.description ?? '—'}</td><td>{record.type ?? '—'}</td><td>{record.status ?? '—'}</td><td>{record.origin}</td><td>{record.active ? 'SIM' : 'NÃO'}</td><td><button className="panel-button" onClick={() => edit(record)}>Editar</button>{' '}<button className="panel-button" onClick={() => void toggleActive(record)}>{record.active ? 'Inativar' : 'Reativar'}</button></td></tr>)}
      </tbody></table></div>
    </PanelCard>
  </>;
}
