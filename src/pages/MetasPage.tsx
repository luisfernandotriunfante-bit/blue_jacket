import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export function MetasPage() {
  return <MigrationPage title="Metas" heading="Parâmetros e distribuição" columns={['Parâmetro', 'Valor', 'Origem', 'Situação']} kpis={['Meta Sell Out', 'Meta Redes', 'Meta indústria', 'Meta positivação']} description="Os parâmetros manuais anteriores foram preservados somente no backup de migração e não participam do sistema ativo." />;
}
