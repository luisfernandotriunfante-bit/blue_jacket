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
  applyCurrentAdminRegistrySeed,
  previewCurrentAdminRegistrySeed,
} from '../../../canonical/adminRegistrySeed';
import { PanelAlert, PanelCard, PanelInfoRow, PanelSectionHeader, PanelStat } from '../../../ui/pattern/PanelVisual';

export const LOCAL_SAVE_NOTICE = 'Alteração salva neste aparelho. Envie a cópia atual em Administração → Sincronização para atualizar o aparelho pareado.';

export function useRegistryPanel(kind: AdminRegistryKind) {
  const [state, setState] = useState<AdminRegistryState | null>(null);
  const [preview, setPreview] = useState<RegistrySeedPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const loaded = await adminRegistryRepository.load();
    setState(loaded);
    return loaded;
  }, []);

  useEffect(() => { void reload().catch(reason => setError(String(reason))); }, [reload]);

  const previewSeed = useCallback(async () => {
    setBusy(true); setError(''); setNotice('');
    try { setPreview(await previewCurrentAdminRegistrySeed(kind)); }
    catch (reason) { setPreview(null); setError(String(reason)); }
    finally { setBusy(false); }
  }, [kind]);

  const applySeed = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const result = await applyCurrentAdminRegistrySeed(kind);
      setState(result.state);
      setPreview(result.preview);
      setNotice(`Importação administrativa aplicada. ${LOCAL_SAVE_NOTICE}`);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }, [kind]);

  const mutationSaved = useCallback(async () => {
    await reload();
    setPreview(null);
    setError('');
    setNotice(LOCAL_SAVE_NOTICE);
  }, [reload]);

  const diagnostics = useMemo(() => diagnoseAdminRegistry(state)[kind], [state, kind]);
  const records = kind === 'rcas' ? state?.rcas ?? [] : kind === 'launches' ? state?.launches ?? [] : state?.topRetailers ?? [];
  const lastSeed = state?.lastSeed[kind] ?? null;

  return { state, records, lastSeed, diagnostics, preview, notice, error, busy, previewSeed, applySeed, mutationSaved, reload };
}

export function RegistryStatus({ kind, records, lastSeed, conflicts }: {
  kind: AdminRegistryKind;
  records: Array<{ active: boolean; origin: 'SOURCE_SEED' | 'MANUAL' }>;
  lastSeed: { fileName: string; appliedAt: string } | null;
  conflicts: number;
}) {
  return <PanelCard compact>
    <PanelSectionHeader eyebrow="STATUS ADMINISTRATIVO" title="Registry local" description="Estes dados ainda não participam de nenhum motor canônico." />
    <div className="panel-stat-grid">
      <PanelStat label="Registros" value={records.length} />
      <PanelStat label="Ativos" value={records.filter(record => record.active).length} />
      <PanelStat label="Manuais" value={records.filter(record => record.origin === 'MANUAL').length} />
      <PanelStat label="Conflitos" value={conflicts} tone={conflicts ? 'amber' : 'green'} />
    </div>
    <PanelInfoRow label="Fonte atual" value={ADMIN_REGISTRY_SEED_SOURCE[kind]} />
    <PanelInfoRow label="Último seed" value={lastSeed ? `${lastSeed.fileName} — ${new Date(lastSeed.appliedAt).toLocaleString('pt-BR')}` : 'Nunca aplicado'} />
    <PanelInfoRow label="USO NOS MOTORES" value="AINDA NÃO ATIVO — FASE 3B" />
  </PanelCard>;
}

export function SeedPreviewCard({ preview, busy, onPreview, onApply }: {
  preview: RegistrySeedPreview | null;
  busy: boolean;
  onPreview: () => void;
  onApply: () => void;
}) {
  return <PanelCard>
    <PanelSectionHeader
      eyebrow="SEED CONTROLADO"
      title="Importar da fonte atual"
      description="A pré-visualização usa somente o ParsedSource já persistido. Alterações MANUAL nunca são sobrescritas; registros ausentes na fonte não são apagados nem inativados."
      action={<button className="panel-button" disabled={busy} onClick={onPreview}>{busy ? 'Processando…' : 'Pré-visualizar importação'}</button>}
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
      <button className="panel-button" disabled={busy} onClick={onApply}>Aplicar itens seguros do preview</button>
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
