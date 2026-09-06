import { useMemo, useState } from 'react';
import { setRegistryRecordActive, upsertManualTopRetail, type TopRetailRegistryRecord } from '../../../canonical/adminRegistry';
import { adminRegistryRepository } from '../../../canonical/adminRegistryIndexedDb';
import { PanelAlert, PanelCard, PanelSectionHeader } from '../../../ui/pattern/PanelVisual';
import { RegistryMessages, RegistryStatus, SeedPreviewCard, useRegistryPanel } from './RegistryPanelShared';

type FormState = {
  competence: string;
  customerCnpj: string;
  network: string;
  banner: string;
  managerCnpj: string;
  groupCode: string;
  category: string;
  topTarget: string;
  note: string;
};

const EMPTY_FORM: FormState = { competence: '', customerCnpj: '', network: '', banner: '', managerCnpj: '', groupCode: '', category: '', topTarget: '', note: '' };

export function TopRetailRegistryPanel() {
  const panel = useRegistryPanel('topRetailers');
  const records = panel.state?.topRetailers ?? [];
  const [search, setSearch] = useState('');
  const [competenceFilter, setCompetenceFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mutationError, setMutationError] = useState('');

  const competences = useMemo(() => [...new Set(records.map(record => record.competence))].sort().reverse(), [records]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(record => {
      if (activeFilter === 'ACTIVE' && !record.active) return false;
      if (activeFilter === 'INACTIVE' && record.active) return false;
      if (competenceFilter && record.competence !== competenceFilter) return false;
      if (!query) return true;
      return [record.customerCnpj, record.network, record.banner, record.managerCnpj, record.groupCode, record.category].some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }, [records, search, competenceFilter, activeFilter]);

  const edit = (record: TopRetailRegistryRecord) => {
    setEditingId(record.id);
    setForm({
      competence: record.competence,
      customerCnpj: record.customerCnpj,
      network: record.network,
      banner: record.banner ?? '',
      managerCnpj: record.managerCnpj ?? '',
      groupCode: record.groupCode ?? '',
      category: record.category ?? '',
      topTarget: record.topTarget === null ? '' : String(record.topTarget),
      note: record.note ?? '',
    });
    setMutationError('');
  };

  const save = async () => {
    setMutationError('');
    try {
      const topTarget = form.topTarget.trim() === '' ? null : Number(form.topTarget.replace(',', '.'));
      await upsertManualTopRetail(adminRegistryRepository, {
        competence: form.competence,
        customerCnpj: form.customerCnpj,
        network: form.network,
        banner: form.banner || null,
        managerCnpj: form.managerCnpj || null,
        groupCode: form.groupCode || null,
        category: form.category || null,
        topTarget,
        note: form.note || null,
      }, editingId ?? undefined);
      setEditingId(null); setForm(EMPTY_FORM);
      await panel.mutationSaved();
    } catch (reason) { setMutationError(String(reason)); }
  };

  const toggleActive = async (record: TopRetailRegistryRecord) => {
    setMutationError('');
    try {
      await setRegistryRecordActive(adminRegistryRepository, 'topRetailers', record.id, !record.active);
      await panel.mutationSaved();
    } catch (reason) { setMutationError(String(reason)); }
  };

  return <>
    <RegistryStatus kind="topRetailers" records={records} lastSeed={panel.lastSeed} conflicts={panel.diagnostics.length} />
    <RegistryMessages notice={panel.notice} error={panel.error || mutationError} />
    <SeedPreviewCard preview={panel.preview} busy={panel.busy} onPreview={() => void panel.previewSeed()} onApply={() => void panel.applySeed()} />

    <PanelCard>
      <PanelSectionHeader eyebrow="CADASTRO MENSAL" title={editingId ? 'Editar Top Varejista' : 'Criar Top Varejista'} description="A chave administrativa é competência + CNPJ do cliente. Rede é descritiva; gestor e agrupamento são preservados separadamente." />
      <div className="panel-form-grid">
        <input className="panel-input" type="month" value={form.competence} onChange={event => setForm({ ...form, competence: event.target.value })} aria-label="Competência" />
        <input className="panel-input" placeholder="CNPJ cliente" value={form.customerCnpj} onChange={event => setForm({ ...form, customerCnpj: event.target.value })} />
        <input className="panel-input" placeholder="Rede" value={form.network} onChange={event => setForm({ ...form, network: event.target.value })} />
        <input className="panel-input" placeholder="Bandeira" value={form.banner} onChange={event => setForm({ ...form, banner: event.target.value })} />
        <input className="panel-input" placeholder="CNPJ gestor" value={form.managerCnpj} onChange={event => setForm({ ...form, managerCnpj: event.target.value })} />
        <input className="panel-input" placeholder="Código agrupamento" value={form.groupCode} onChange={event => setForm({ ...form, groupCode: event.target.value })} />
        <input className="panel-input" placeholder="Categoria" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} />
        <input className="panel-input" inputMode="decimal" placeholder="Top Target" value={form.topTarget} onChange={event => setForm({ ...form, topTarget: event.target.value })} />
        <input className="panel-input" placeholder="Observação" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
      </div>
      <button className="panel-button" onClick={() => void save()}>{editingId ? 'Salvar edição' : 'Criar Top Varejista'}</button>{' '}
      {editingId ? <button className="panel-button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancelar</button> : null}
    </PanelCard>

    <PanelCard>
      <PanelSectionHeader eyebrow="CONSULTA" title="Top Varejistas registrados" />
      <div className="panel-form-grid">
        <input className="panel-input" placeholder="Buscar CNPJ, rede, bandeira, gestor ou agrupamento" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="panel-input" value={competenceFilter} onChange={event => setCompetenceFilter(event.target.value)}><option value="">Todas as competências</option>{competences.map(competence => <option key={competence} value={competence}>{competence}</option>)}</select>
        <select className="panel-input" value={activeFilter} onChange={event => setActiveFilter(event.target.value as typeof activeFilter)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select>
      </div>
      {panel.diagnostics.length ? <PanelAlert tone="warning">{panel.diagnostics.map(item => item.message).join(' • ')}</PanelAlert> : null}
      <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Competência</th><th>CNPJ</th><th>Rede</th><th>Gestor</th><th>Agrupamento</th><th>Top Target</th><th>Origem</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {filtered.map(record => <tr key={record.id}><td>{record.competence}</td><td>{record.customerCnpj}</td><td>{record.network}</td><td>{record.managerCnpj ?? '—'}</td><td>{record.groupCode ?? '—'}</td><td>{record.topTarget === null ? '—' : record.topTarget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>{record.origin}</td><td>{record.active ? 'ATIVO' : 'INATIVO'}</td><td><button className="panel-button" onClick={() => edit(record)}>Editar</button>{' '}<button className="panel-button" onClick={() => void toggleActive(record)}>{record.active ? 'Inativar' : 'Reativar'}</button></td></tr>)}
      </tbody></table></div>
    </PanelCard>
  </>;
}
