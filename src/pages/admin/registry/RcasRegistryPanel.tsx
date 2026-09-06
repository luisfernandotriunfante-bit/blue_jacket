import { useMemo, useState } from 'react';
import { type RcaRegistryRecord, type RcaRole } from '../../../canonical/adminRegistry';
import { PanelAlert, PanelCard, PanelSectionHeader } from '../../../ui/pattern/PanelVisual';
import { RegistryMessages, RegistryStatus, SeedPreviewCard, useRegistryPanel } from './RegistryPanelShared';

type FormState = {
  currentCode: string;
  legacyCode: string;
  name: string;
  coordinatorCode: string;
  coordinatorName: string;
  role: RcaRole;
  validFromCompetence: string;
  validToCompetence: string;
  note: string;
};

const EMPTY_FORM: FormState = { currentCode: '', legacyCode: '', name: '', coordinatorCode: '', coordinatorName: '', role: 'PRINCIPAL', validFromCompetence: '', validToCompetence: '', note: '' };

export function RcasRegistryPanel() {
  const panel = useRegistryPanel('rcas');
  const records = panel.state?.rcas ?? [];
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | RcaRole>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mutationError, setMutationError] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(record => {
      if (activeFilter === 'ACTIVE' && !record.active) return false;
      if (activeFilter === 'INACTIVE' && record.active) return false;
      if (roleFilter !== 'ALL' && record.role !== roleFilter) return false;
      if (!query) return true;
      return [record.currentCode, record.legacyCode, record.name, record.coordinatorCode, record.coordinatorName].some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }, [records, search, activeFilter, roleFilter]);

  const edit = (record: RcaRegistryRecord) => {
    setEditingId(record.id);
    setForm({
      currentCode: record.currentCode,
      legacyCode: record.legacyCode ?? '',
      name: record.name ?? '',
      coordinatorCode: record.coordinatorCode ?? '',
      coordinatorName: record.coordinatorName ?? '',
      role: record.role,
      validFromCompetence: record.validFromCompetence ?? '',
      validToCompetence: record.validToCompetence ?? '',
      note: record.note ?? '',
    });
    setMutationError('');
  };

  const save = async () => {
    setMutationError('');
    try {
      const ok = await panel.execute(() => panel.actions.upsertRca({
        currentCode: form.currentCode,
        legacyCode: form.legacyCode || null,
        name: form.name || null,
        coordinatorCode: form.coordinatorCode || null,
        coordinatorName: form.coordinatorName || null,
        role: form.role,
        validFromCompetence: form.validFromCompetence || null,
        validToCompetence: form.validToCompetence || null,
        note: form.note || null,
      }, editingId ?? undefined));
      if (ok) { setEditingId(null); setForm(EMPTY_FORM); }
    } catch (reason) { setMutationError(String(reason)); }
  };

  const toggleActive = async (record: RcaRegistryRecord) => {
    setMutationError('');
    try { await panel.execute(() => panel.actions.setActive('rcas', record.id, !record.active)); }
    catch (reason) { setMutationError(String(reason)); }
  };

  return <>
    <RegistryStatus kind="rcas" records={records} lastSeed={panel.lastSeed} conflicts={panel.diagnostics.length} />
    <RegistryMessages notice={panel.notice} error={panel.error || mutationError} />
    <SeedPreviewCard preview={panel.preview} previewBusy={panel.previewBusy} mutationBusy={panel.mutationBusy} onPreview={() => void panel.previewSeed()} onApply={() => void panel.applySeed()} />

    <PanelCard>
      <PanelSectionHeader eyebrow="CADASTRO CANÔNICO" title={editingId ? 'Editar RCA' : 'Criar RCA'} description="Salvar executa Registry → full rebuild v19 → ativação → sincronização. Códigos permanecem texto; editar um seed transforma a origem em MANUAL." />
      <div className="panel-form-grid">
        <input className="panel-input" placeholder="Código atual" value={form.currentCode} onChange={event => setForm({ ...form, currentCode: event.target.value })} />
        <input className="panel-input" placeholder="Código legado" value={form.legacyCode} onChange={event => setForm({ ...form, legacyCode: event.target.value })} />
        <input className="panel-input" placeholder="Nome" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        <input className="panel-input" placeholder="Código coordenador" value={form.coordinatorCode} onChange={event => setForm({ ...form, coordinatorCode: event.target.value })} />
        <input className="panel-input" placeholder="Nome coordenador" value={form.coordinatorName} onChange={event => setForm({ ...form, coordinatorName: event.target.value })} />
        <select className="panel-input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as RcaRole })}><option value="PRINCIPAL">PRINCIPAL</option><option value="AUXILIAR">AUXILIAR</option></select>
        <input className="panel-input" type="month" value={form.validFromCompetence} onChange={event => setForm({ ...form, validFromCompetence: event.target.value })} aria-label="Válido desde" />
        <input className="panel-input" type="month" value={form.validToCompetence} onChange={event => setForm({ ...form, validToCompetence: event.target.value })} aria-label="Válido até" />
        <input className="panel-input" placeholder="Observação" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
      </div>
      <button className="panel-button" disabled={panel.mutationBusy} onClick={() => void save()}>{panel.mutationBusy ? 'Operação em andamento…' : editingId ? 'Salvar edição' : 'Criar RCA'}</button>{' '}
      {editingId ? <button className="panel-button" disabled={panel.mutationBusy} onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancelar</button> : null}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="CONSULTA" title="RCAs registrados" />
      <div className="panel-form-grid">
        <input className="panel-input" placeholder="Pesquisar código, nome ou coordenador" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="panel-input" value={activeFilter} onChange={event => setActiveFilter(event.target.value as typeof activeFilter)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select>
        <select className="panel-input" value={roleFilter} onChange={event => setRoleFilter(event.target.value as typeof roleFilter)}><option value="ALL">Principal + Auxiliar</option><option value="PRINCIPAL">Principal</option><option value="AUXILIAR">Auxiliar</option></select>
      </div>
      {panel.diagnostics.length ? <PanelAlert tone="warning">{panel.diagnostics.map(item => item.message).join(' • ')}</PanelAlert> : null}
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Atual</th><th>Legado</th><th>Nome</th><th>Coord.</th><th>Papel</th><th>Origem</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {filtered.map(record => <tr key={record.id}><td>{record.currentCode}</td><td>{record.legacyCode ?? '—'}</td><td>{record.name ?? '—'}</td><td>{record.coordinatorCode ?? '—'} {record.coordinatorName ?? ''}</td><td>{record.role}</td><td>{record.origin}</td><td>{record.active ? 'ATIVO' : 'INATIVO'}</td><td><button className="panel-button" disabled={panel.mutationBusy} onClick={() => edit(record)}>Editar</button>{' '}<button className="panel-button" disabled={panel.mutationBusy} onClick={() => void toggleActive(record)}>{record.active ? 'Inativar' : 'Reativar'}</button></td></tr>)}
      </tbody></table></div>
    </PanelCard>
  </>;
}
