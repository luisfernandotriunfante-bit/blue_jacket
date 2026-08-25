import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export type EstoqueView = 'overview' | 'products' | 'movements';

export function EstoquePage({ view = 'overview' }: { view?: EstoqueView }) {
  const configuration = view === 'products'
    ? { heading: 'Produtos', columns: ['Código Winthor', 'Produto', 'EAN', 'Físico', 'Reservado', 'Disponível', 'Carteira', 'Projetado', 'Valor', 'Cobertura', 'Alertas'] }
    : view === 'movements'
      ? { heading: 'Entradas e Saídas', columns: ['Data', 'Tipo', 'Situação', 'Documento', 'Produto', 'Quantidade', 'Origem'] }
      : { heading: 'Visão Geral', columns: ['Indicador', 'Valor', 'Situação'] };
  return <MigrationPage title="Estoque" heading={configuration.heading} columns={configuration.columns} kpis={['Estoque físico', 'Reservado', 'Disponível', 'Carteira']} description="Estrutura preservada. Não há saldo, reserva, Carteira, alerta ou movimento ativo nesta etapa." />;
}
