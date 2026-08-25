import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export type ClientesSortimentoView = 'overview' | 'assortment' | 'launches' | 'promotions';

export function ClientesSortimentoPage({ view = 'overview' }: { view?: ClientesSortimentoView }) {
  const details = view === 'assortment'
    ? { heading: 'Sortimento por CNPJ', columns: ['Produto', 'Classificação', 'Comprou / histórico', 'Disponível', 'Carteira', 'Oportunidade', 'Ação', 'Preço'] }
    : view === 'launches'
      ? { heading: 'Adoção de lançamentos', columns: ['Produto', 'Classificação', 'Adotado', 'Disponibilidade', 'Carteira', 'Status'] }
      : view === 'promotions'
        ? { heading: 'Promoções elegíveis', columns: ['Promoção', 'Produto', 'Elegibilidade', 'Vigência', 'Benefício'] }
        : { heading: 'Inteligência Comercial por CNPJ', columns: ['Indicador', 'Valor', 'Situação'] };
  return <MigrationPage title="Clientes & Sortimento" heading={details.heading} columns={details.columns} kpis={['Clientes conhecidos', 'Assortment oficial', 'Assortment executável', 'Oportunidades']} description="Os filtros e a ficha visual permanecem reservados; não há cliente, sortimento, preço, promoção ou histórico ativo." />;
}
