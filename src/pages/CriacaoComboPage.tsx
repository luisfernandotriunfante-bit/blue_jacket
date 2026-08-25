import { MigrationPage } from '../ui/pattern/MigrationEmptyState';

export function CriacaoComboPage() {
  return <MigrationPage title="Criação de Combo" heading="Itens do combo" columns={['Código Winthor', 'Produto', 'PVENDA1', 'Preço praticado', 'Desconto', 'Clientes']} kpis={['Produtos elegíveis', 'Produtos selecionados', 'Clientes', 'Desconto médio']} description="A criação e a exportação de combos estão bloqueadas até existir um novo motor de itens, preços e clientes." />;
}
