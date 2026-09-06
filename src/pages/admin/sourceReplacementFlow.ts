import { loadAdminRegistryState } from '../../canonical/adminRegistryIndexedDb';
import { deviceSyncIdentity, uploadCurrentDeviceSnapshot } from '../../canonical/cloudSync';
import { resolveActiveCanonicalBundle, activateCanonicalBundleReference, deactivateCanonicalBundle, type ActiveCanonicalBundle } from '../../canonical/runtime';
import { buildCanonicalFromStoredSources, loadGeneratedCanonicalList, loadSourceStaging } from '../../canonical/sourceImport';
import { SUPPORTED_SOURCE_IDS, type SourceReplacementScope } from '../../canonical/sourceContract';
import { proveSourceReplacementEquivalence } from '../../canonical/sourceReplacementAuthority';
import { certifySourceReplacementV21 } from '../../canonical/sourceReplacementCertification';
import {
  loadSourceReplacementState,
  replaceSourceReplacementState,
  withCertificate,
  withoutCertificate,
  certificateFor,
  type SourceReplacementState,
} from '../../canonical/sourceReplacementState';
import { semanticBusinessEquivalent } from '../../canonical/sourceDependencyContract';
import { systemDataOperationCoordinator } from '../../canonical/systemDataOperationCoordinator';
import { loadTargetState } from '../../canonical/targetStore';
import type { CanonicalList } from '../../canonical/types';

export type SourceReplacementLifecyclePhase =
  | 'IDLE'
  | 'CHECKING'
  | 'BUILDING_BASELINE'
  | 'BUILDING_REPLACED'
  | 'VERIFYING'
  | 'PERSISTING'
  | 'ACTIVATING'
  | 'SYNCING'
  | 'SUCCESS'
  | 'LOCAL_SUCCESS_SYNC_FAILED'
  | 'FAILED';

export type SourceReplacementLifecycle = {
  phase: SourceReplacementLifecyclePhase;
  sourceId: string | null;
  scope: SourceReplacementScope | null;
  message: string;
  active: ActiveCanonicalBundle | null;
  error: string | null;
};

type Listener = (state: SourceReplacementLifecycle) => void;
const idle = (): SourceReplacementLifecycle => ({ phase: 'IDLE', sourceId: null, scope: null, message: '', active: null, error: null });
let lifecycle = idle();
const listeners = new Set<Listener>();
function publish(next: SourceReplacementLifecycle) { lifecycle = next; for (const listener of listeners) listener(lifecycle); }

export const sourceReplacementLifecycle = {
  getState: () => lifecycle,
  subscribe(listener: Listener) { listeners.add(listener); listener(lifecycle); return () => { listeners.delete(listener); }; },
  reset() { publish(idle()); },
};

export type SourceReplacementFlowDependencies = {
  loadStages: () => Promise<NonNullable<Awaited<ReturnType<typeof loadSourceStaging>>>[]>;
  loadRegistry: typeof loadAdminRegistryState;
  loadTarget: typeof loadTargetState;
  loadReplacement: typeof loadSourceReplacementState;
  replaceReplacement: typeof replaceSourceReplacementState;
  getActive: typeof resolveActiveCanonicalBundle;
  build: typeof buildCanonicalFromStoredSources;
  loadList: typeof loadGeneratedCanonicalList;
  activate: (bundle: ActiveCanonicalBundle) => void;
  deactivate: () => void;
  isPaired: () => boolean;
  sync: () => Promise<unknown>;
  now: () => string;
};

const defaultDependencies: SourceReplacementFlowDependencies = {
  loadStages: async () => (await Promise.all(SUPPORTED_SOURCE_IDS.map(source => loadSourceStaging(source)))).filter((stage): stage is NonNullable<typeof stage> => Boolean(stage)),
  loadRegistry: loadAdminRegistryState,
  loadTarget: loadTargetState,
  loadReplacement: loadSourceReplacementState,
  replaceReplacement: replaceSourceReplacementState,
  getActive: resolveActiveCanonicalBundle,
  build: buildCanonicalFromStoredSources,
  loadList: loadGeneratedCanonicalList,
  activate: activateCanonicalBundleReference,
  deactivate: deactivateCanonicalBundle,
  isPaired: () => Boolean(deviceSyncIdentity()),
  sync: () => uploadCurrentDeviceSnapshot().then(() => undefined),
  now: () => new Date().toISOString(),
};

function sourceProjection(sourceId: string, lists: Record<CanonicalList['id'], CanonicalList>) {
  if (sourceId === 'NOVOS RCAS.xlsx') return {
    m2: lists.M2_CLIENTE_RCA.records.map(record => ({ customer_canonical_id: record.customer_canonical_id, rca_canonical_id: record.rca_canonical_id, rca_current_code: record.rca_current_code, rca_legacy_code: record.rca_legacy_code, rca_name: record.rca_name, coordinator_code: record.coordinator_code, coordinator_name: record.coordinator_name, audit_flags: record.audit_flags })),
    m3: lists.M3_MOVIMENTO_VENDAS.records.filter(record => record.fact_type === 'SALE' || record.fact_type === 'TARGET').map(record => ({ fact_id: record.fact_id, fact_type: record.fact_type, transaction_rca_code: record.transaction_rca_code, rca_canonical_id: record.rca_canonical_id, target_assignment_status: record.target_assignment_status, audit_flags: record.audit_flags })),
    m4: lists.M4_HISTORICO_TRANSICAO.records.map(record => ({ row_type: record.row_type, movement_date: record.movement_date, legacy_rca_code: record.legacy_rca_code, rca_canonical_id: record.rca_canonical_id, mapping_status: record.mapping_status, audit_flags: record.audit_flags })),
  };
  if (sourceId === 'lançamentos.xlsx') return lists.M1_ITEM_ESTOQUE.records.map(record => ({ item_canonical_id: record.item_canonical_id, winthor_code: record.winthor_code, internal_ean: record.internal_ean, industry_ean: record.industry_ean, physical_stock_units: record.physical_stock_units, available_stock_units: record.available_stock_units, cost_unit_105: record.cost_unit_105, is_launch: record.is_launch, launch_status: record.launch_status, mapping_status: record.mapping_status }));
  if (sourceId.includes('Roteiro Ativo Top')) return lists.M2_CLIENTE_RCA.records.map(record => ({ customer_canonical_id: record.customer_canonical_id, cnpj: record.cnpj, top_network: record.top_network, top_banner: record.top_banner, manager_cnpj: record.manager_cnpj, top_group_code: record.top_group_code, top_category: record.top_category, top_target: record.top_target, top_route_competence: record.top_route_competence, network_resolution_status: record.network_resolution_status }));
  return lists.M3_MOVIMENTO_VENDAS.records.filter(record => record.fact_type === 'TARGET').map(record => ({ fact_id: record.fact_id, competence: record.competence, transaction_rca_code: record.transaction_rca_code, rca_canonical_id: record.rca_canonical_id, sales_target: record.sales_target, positivity_target: record.positivity_target, target_assignment_status: record.target_assignment_status, audit_flags: record.audit_flags }));
}

async function loadBuildLists(buildId: string, deps: SourceReplacementFlowDependencies) {
  const ids: CanonicalList['id'][] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
  const entries = await Promise.all(ids.map(async id => [id, await deps.loadList(buildId, id)] as const));
  return Object.fromEntries(entries) as Record<CanonicalList['id'], CanonicalList>;
}

async function rollback(beforeState: SourceReplacementState | null, beforeActive: ActiveCanonicalBundle | null, deps: SourceReplacementFlowDependencies) {
  deps.replaceReplacement(beforeState);
  if (beforeActive) deps.activate(beforeActive); else deps.deactivate();
}

export async function activateCertifiedSourceReplacement(sourceId: string, scope: SourceReplacementScope, overrides: Partial<SourceReplacementFlowDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  const gate = await systemDataOperationCoordinator.run('SOURCE_REPLACEMENT_UPDATE', async () => {
    const beforeState = deps.loadReplacement();
    const beforeActive = deps.getActive();
    let activated = false;
    try {
      publish({ phase: 'CHECKING', sourceId, scope, message: 'Revalidando staging físico, authority e readiness.', active: null, error: null });
      const [storedStages, registry] = await Promise.all([deps.loadStages(), deps.loadRegistry()]);
      const target = deps.loadTarget();
      const physical = storedStages.find(stage => stage.source === sourceId) ?? null;
      if (!physical) throw new Error('SOURCE_REPLACEMENT_PHYSICAL_STAGE_REQUIRED');
      const allStages = storedStages.map(stage => stage.parsed);

      publish({ phase: 'BUILDING_BASELINE', sourceId, scope, message: 'Construindo baseline v21 com a fonte física em uso.', active: null, error: null });
      const baseline = await deps.build(undefined, registry, target, beforeState);

      publish({ phase: 'VERIFYING', sourceId, scope, message: 'Executando prova de equivalência e cobertura em runtime.', active: null, error: null });
      const independentProof = proveSourceReplacementEquivalence(sourceId, allStages, registry, target);
      if (!independentProof.equivalent) throw new Error('SOURCE_REPLACEMENT_EQUIVALENCE_FAILED');
      const certificate = await certifySourceReplacementV21({ sourceId, scope, physicalStage: physical, allStages, adminRegistryState: registry, targetState: target, now: deps.now() });
      const nextState = withCertificate(beforeState, certificate);

      publish({ phase: 'PERSISTING', sourceId, scope, message: 'Persistindo certificado validado antes do build substituído.', active: null, error: null });
      deps.replaceReplacement(nextState);

      publish({ phase: 'BUILDING_REPLACED', sourceId, scope, message: 'Construindo candidato v21 com a fonte logicamente omitida.', active: null, error: null });
      const candidate = await deps.build(undefined, registry, target, nextState);
      const [baselineLists, candidateLists] = await Promise.all([loadBuildLists(baseline.motorBuildId, deps), loadBuildLists(candidate.motorBuildId, deps)]);
      publish({ phase: 'VERIFYING', sourceId, scope, message: 'Comparando baseline físico e candidato substituído.', active: null, error: null });
      if (!semanticBusinessEquivalent(sourceProjection(sourceId, baselineLists), sourceProjection(sourceId, candidateLists))) throw new Error('SOURCE_REPLACEMENT_RUNTIME_EQUIVALENCE_FAILED');

      publish({ phase: 'ACTIVATING', sourceId, scope, message: 'Ativando build certificado.', active: candidate, error: null });
      deps.activate(candidate); activated = true;
      if (deps.isPaired()) {
        publish({ phase: 'SYNCING', sourceId, scope, message: 'Sincronizando certificado e build ativos.', active: candidate, error: null });
        try { await deps.sync(); }
        catch (reason) {
          publish({ phase: 'LOCAL_SUCCESS_SYNC_FAILED', sourceId, scope, message: 'Substituição e build permanecem ativos localmente; sincronização falhou.', active: candidate, error: String(reason) });
          return { active: candidate, certificate, synced: false };
        }
      }
      publish({ phase: 'SUCCESS', sourceId, scope, message: 'Substituição certificada e build v21 ativos.', active: candidate, error: null });
      return { active: candidate, certificate, synced: true };
    } catch (reason) {
      if (!activated) await rollback(beforeState, beforeActive, deps);
      publish({ phase: 'FAILED', sourceId, scope, message: 'A substituição não foi ativada.', active: beforeActive, error: String(reason) });
      throw reason;
    }
  });
  if (gate.status === 'BUSY') throw new Error(`SYSTEM_DATA_OPERATION_BUSY:${gate.owner ?? 'UNKNOWN'}`);
  return gate.value;
}

export async function revokeCertifiedSourceReplacement(sourceId: string, scope: SourceReplacementScope, overrides: Partial<SourceReplacementFlowDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  const gate = await systemDataOperationCoordinator.run('SOURCE_REPLACEMENT_UPDATE', async () => {
    const beforeState = deps.loadReplacement();
    const beforeActive = deps.getActive();
    const existing = certificateFor(beforeState, sourceId, scope);
    if (!existing) throw new Error('SOURCE_REPLACEMENT_CERTIFICATE_NOT_FOUND');
    let activated = false;
    try {
      publish({ phase: 'CHECKING', sourceId, scope, message: 'Verificando fonte física antes da revogação.', active: beforeActive, error: null });
      const storedStages = await deps.loadStages();
      const physical = storedStages.find(stage => stage.source === sourceId);
      if (!physical || physical.manifest.status !== 'VALID') throw new Error('SOURCE_REPLACEMENT_REVOKE_PHYSICAL_REQUIRED:Reenvie a fonte antes de revogar esta substituição.');
      const [registry] = await Promise.all([deps.loadRegistry()]);
      const target = deps.loadTarget();
      const nextState = withoutCertificate(beforeState, sourceId, scope);
      publish({ phase: 'PERSISTING', sourceId, scope, message: 'Revogando certificado e preparando rebuild físico.', active: beforeActive, error: null });
      deps.replaceReplacement(nextState);
      publish({ phase: 'BUILDING_REPLACED', sourceId, scope, message: 'Reconstruindo v21 com a fonte física novamente.', active: beforeActive, error: null });
      const candidate = await deps.build(undefined, registry, target, nextState);
      publish({ phase: 'ACTIVATING', sourceId, scope, message: 'Ativando rebuild físico.', active: candidate, error: null });
      deps.activate(candidate); activated = true;
      if (deps.isPaired()) {
        publish({ phase: 'SYNCING', sourceId, scope, message: 'Sincronizando revogação.', active: candidate, error: null });
        try { await deps.sync(); }
        catch (reason) {
          publish({ phase: 'LOCAL_SUCCESS_SYNC_FAILED', sourceId, scope, message: 'Revogação permanece localmente ativa; sincronização falhou.', active: candidate, error: String(reason) });
          return { active: candidate, synced: false };
        }
      }
      publish({ phase: 'SUCCESS', sourceId, scope, message: 'Substituição revogada e fonte física reativada explicitamente.', active: candidate, error: null });
      return { active: candidate, synced: true };
    } catch (reason) {
      if (!activated) await rollback(beforeState, beforeActive, deps);
      publish({ phase: 'FAILED', sourceId, scope, message: 'A revogação não foi aplicada.', active: beforeActive, error: String(reason) });
      throw reason;
    }
  });
  if (gate.status === 'BUSY') throw new Error(`SYSTEM_DATA_OPERATION_BUSY:${gate.owner ?? 'UNKNOWN'}`);
  return gate.value;
}

export const sourceReplacementFlowTestHelpers = { sourceProjection, loadBuildLists, defaultDependencies };
