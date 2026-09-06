import type { ActiveCanonicalBundle } from '../../canonical/runtime';
import type { AdminTabId } from '../../navigation';
import { PanelEmptyState, PanelPage } from '../../ui/pattern/PanelVisual';
import { AuditoriaPage } from '../AuditoriaPage';
import { ListasCanonicasPage } from '../ListasCanonicasPage';
import { MetasPage } from '../MetasPage';
import { BasesPage } from './BasesPage';
import { CompetenciasPage } from './CompetenciasPage';
import { syncActiveBuildIfPaired } from './baseAutoSync';
import { SincronizacaoPage, syncErrorMessage } from './SincronizacaoPage';

type AdminPageProps = {
  view: AdminTabId;
};

function CadastrosPlaceholder() {
  return <PanelPage title="Cadastros">
    <PanelEmptyState
      variant="page"
      title="Cadastros internos"
      description="Cadastros internos serão habilitados nas próximas etapas da reforma administrativa."
    />
  </PanelPage>;
}

async function preserveAutomaticSyncAfterBaseUpdate(active: ActiveCanonicalBundle) {
  try {
    return await syncActiveBuildIfPaired(active.motorBuildId);
  } catch (reason) {
    console.warn('A atualização local foi concluída, mas a cópia pareada não pôde ser enviada.', reason);
    throw new Error(syncErrorMessage(reason));
  }
}

export function AdminPage({ view }: AdminPageProps) {
  if (view === 'bases') return <BasesPage onCanonicalActivated={preserveAutomaticSyncAfterBaseUpdate} />;
  if (view === 'cadastros') return <CadastrosPlaceholder />;
  if (view === 'metas') return <MetasPage />;
  if (view === 'competencias') return <CompetenciasPage />;
  if (view === 'auditoria') return <AuditoriaPage />;
  if (view === 'canonical') return <ListasCanonicasPage />;
  return <SincronizacaoPage />;
}
