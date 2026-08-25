import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export function DocumentosPage() {
  return <MigrationPage title="Documentos" heading="Exportações" columns={['Documento', 'Cobertura', 'Fonte', 'Situação']} kpis={['Painéis disponíveis', 'Relatórios de redes', 'Arquivos comerciais', 'Dossiês internos']} description="Nenhum Excel ou documento pode ser gerado a partir da arquitetura removida." />;
}
