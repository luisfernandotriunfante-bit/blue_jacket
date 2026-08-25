import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export function LancamentosPage() {
  return <MigrationPage title="Lançamentos" heading="Catálogo oficial" kpis={['Lançamentos', 'Com estoque', 'Na Carteira', 'Potencial projetado']} columns={['Código', 'Produto', 'EAN', 'Físico', 'Reservado', 'Disponível', 'Carteira', 'Projetado', 'PVENDA1', 'Status']} description="A lista antiga de lançamentos foi desativada; nenhum item é inferido nesta etapa." />;
}
