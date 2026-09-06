import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  diagnoseAdminRegistry,
  type AdminRegistryKind,
  type AdminRegistryState,
  type RegistrySeedPreview,
} from '../../../canonical/adminRegistry';
import { adminRegistryRepository } from '../../../canonical/adminRegistryIndexedDb';
import {
  ADMIN_REGISTRY_SEED_SOURCE,
  previewCurrentAdminRegistrySeed,
} from '../../../canonical/adminRegistrySeed';
import {
  systemDataOperationBusyMessage,
  systemDataOperationCoordinator,
} from '../../../canonical/systemDataOperationCoordinator';
import { useData } from '../../../store/DataContext';
import { PanelAlert, PanelCard, PanelInfoRow, PanelSectionHeader, PanelStat } from '../../../ui/pattern/PanelVisual';
import { canonicalRegistryActions, registryUpdateCoordinator } from '../registryUpdateFlow';

const shortHash = (value: string | null | undefined) => value ? `${value.slice(0, 12)}…` : '—';

export function useRegistryPanel(kind: AdminRegistryKind) {
  const { activeCanonical, activateCanonical, deactivateCanonical } = useData();
  const [state, setState] = useState<AdminRegistryState | null>(null);
  const [preview, setPreview] = useState<RegistrySeedPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [lifecycle, setLifecycle] = useState(() => registryUpdateCoordinator.getState());
  const [globalOperation, setGlobalOperation] = useState(() => systemDataOperationCoordinator.getState());

  const reload = useCallback(async () => {
    const loaded = await adminRegistryRepository.load();
    setState(loaded);
    return loaded;
  }, []);

  useEffect(() => { void reload().catch(reason => setError(String(reason))); }, [reload]);
  useEffect(() => registryUpdateCoordinator.subscribe(setLifecycle), []);
  useEffect(() => systemDataOperationCoordinator.subscribe(setGlobalOperation), []);
  useEffect(() => {
    if (!lifecycle.busy && lifecycle.phase !== 'IDLE') void reload();
  }, [lifecycle.busy, lifecycle.phase, reload]);

  const runtime = useMemo(() => ({
    getActive: () => activeCanonical,
    activate: activateCanonical,
    deactivate: deactivateCanonical,
  }), [activeCanonical, activateCanonical, deactivateCanonical]);
  const actions = useMemo(() => canonicalRegistryActions(runtime), [runtime]);

  const previewSeed = useCallback(async () => {
    setPreviewBusy(true); setError(''); setNotice('');
    try { setPreview(await previewCurrentAdminRegistrySeed(kind)); }
    catch (reason) { setPreview(null); setError(String(reason)); }
    finally { setPreviewBusy(false); }
  }, [kind]);

  const execute = useCallback(async (action: () => Promise<any>) => {
    setError(''); setNotice('');
    const result = await action();
    if (result.status === 'BUSY') {
      setError(systemDataOperationBusyMessage(result.owner));
      return false;
    }
    const lifecycleResult = result.value;
    if (lifecycleResult.status === 'BUSY') {
      setError('Já existe uma atualização de Cadastros em andamento.');
      return false;
    }
    await reload();
    setPreview(null);
    const completion = lifecycleResult.value;
    if (completion.phase === 'FAILED') {
      setError(completion.error);
      return false;
    }
    setNotice(completion.status);
    if (completion.phase === 'LOCAL_SUCCESS_SYNC_FAILED') setError(completion.error);
    return true;
  }, [reload]);

  const applySeed = useCallback(() => execute(() => actions.applySeed(kind)), [actions, execute, kind]);

  const diagnostics = useMemo(() => diagnoseAdminRegistry(state)[kind], [state, kind]);
  const records = kind === 'rcas' ? state?.rcas ?? [] : kind === 'launches' ? state?.launches ?? [] : state?.topRetailers ?? [];
  const lastSeed = state?.lastSeed[kind] ?? null;
  const mutationBusy = lifecycle.busy || globalOperation.busy;

  return {
    state, records, lastSeed, diagnostics, preview, notice, error, previewBusy, mutationBusy,
    lifecycle, globalOperation, activeCanonical, actions, previewSeed, applySeed, execute, reload,
  };
}

export function RegistryStatus({ kind, records, lastSeed, conflicts }: {
  kind: AdminRegistryKind;
  records: Array<{ active: boolean; origin: 'SOURCE_SEED' | 'MANUAL' }>;
  lastSeed: { fileName: string; appliedAt: string } | null;
  conflicts: number;
}) {
  const { activeCanonical } = useData();
  return <PanelCard compact>
    <PanelSectionHeader eyebrow="STATUS CANÔNICO" title="Registry administrativo" description="Os registros ativos participam do build canônico com precedência MANUAL → SOURCE_SEED → fonte física. Inativação MANUAL funciona como supressão administrativa." />
    <div className="panel-stat-grid">
      <PanelStat label="Registros" value={records.length} />
      <PanelStat label="Ativos" value={records.filter(record => record.active).length} />
      <PanelStat label="Manuais" value={records.filter(record => record.origin === 'MANUAL').length} />
      <PanelStat label="Conflitos" value={conflicts} tone={conflicts ? 'amber' : 'green'} />
    </div>
    <PanelInfoRow label="Fonte atual" value={ADMIN_REGISTRY_SEED_SOURCE[kind]} />
    <PanelInfoRow label="Último seed" value={lastSeed ? `${lastSeed.fileName} — ${new Date(lastSeed.appliedAt).toLocaleString('pt-BR')}` : 'Nunca aplicado'} />
    <PanelInfoRow label="USO NOS MOTORES" value="ATIVO" />
    <PanelInfoRow label="Build ativo" value={activeCanonical?.motorBuildId ?? 'Nenhum build ativo'} />
    <PanelInfoRow label="Admin Registry Hash" value={shortHash(activeCanonical?.adminRegistryHash)} />
    <PanelInfoRow label="Canonical Input Hash" value={shortHash(activeCanonical?.canonicalInputHash)} />
  </PanelCard>;
}

export function SeedPreviewCard({ preview, previewBusy, mutationBusy, onPreview, onApply }: {
  preview: RegistrySeedPreview | null;
  previewBusy: boolean;
  mutationBusy: boolean;
  onPreview: () => void;
  onApply: () => void;
}) {
  return <PanelCard>
    <PanelSectionHeader
      eyebrow="SEED CONTROLADO"
      title="Importar da fonte atual"
      description="Pré-visualizar é passivo. Aplicar itens seguros persiste o Registry, executa full rebuild v19, ativa o novo build e sincroniza se houver pareamento. MANUAL nunca é sobrescrito pelo seed."
      action={<button className="panel-button" disabled={previewBusy} onClick={onPreview}>{previewBusy ? 'Processando…' : 'Pré-visualizar importação'}</button>}
    />
    {preview ? <>
      <div className="panel-stat-grid">
        <PanelStat label="Novos" value={preview.counts.new} />
        <PanelStat label="Atualizáveis" value={preview.counts.updatable} />
        <PanelStat label="Iguais" value={preview.counts.equal} />
        <PanelStat label="Conflitos" value={preview.counts.conflicts} tone={preview.counts.conflicts ? 'amber' : 'green'} />
        <PanelStat label="Protegidos MANUAL" value={preview.counts.manualProtected} />
        <PanelStat label="Ausentes na fonte atual" value={preview.counts.missingFromSource} />
      </div>
      {preview.competence ? <PanelInfoRow label="Competência explícita da fonte" value={preview.competence} /> : null}
      {preview.items.some(item => item.status === 'CONFLICT') ? <PanelAlert tone="warning">Há conflitos no preview. Linhas conflitantes não serão aplicadas silenciosamente.</PanelAlert> : null}
      {preview.items.some(item => item.status === 'MISSING_SOURCE') ? <PanelAlert tone="warning">Há registros SOURCE_SEED ausentes na fonte atual. Eles permanecerão intactos.</PanelAlert> : null}
      <button className="panel-button" disabled={mutationBusy} onClick={onApply}>{mutationBusy ? 'Operação em andamento…' : 'Aplicar itens seguros do preview'}</button>
    </> : <PanelAlert tone="info">Nenhum seed é executado ao abrir esta página. Pré-visualize antes de aplicar.</PanelAlert>}
  </PanelCard>;
}

export function RegistryMessages({ notice, error, extra }: { notice: string; error: string; extra?: ReactNode }) {
  return <>
    {notice ? <PanelAlert tone="success">{notice}</PanelAlert> : null}
    {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}
    {extra}
  </>;
}
