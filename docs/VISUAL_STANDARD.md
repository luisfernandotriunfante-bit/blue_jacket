# Blue Jacket — Visual Standard v2

Este documento é o contrato visual vigente do Blue Jacket.

## 1. Princípio central

O projeto possui **uma única fonte de verdade visual**:

- `src/ui/theme/tokens.css` concentra tokens;
- `src/ui/theme/foundation.css` governa shell e navegação;
- `src/ui/theme/panel-visual.css` governa componentes e padrões;
- `src/ui/pattern/PanelVisual.tsx` expõe os primitives/patterns compartilhados.

Páginas não devem criar um segundo design system com cores, sombras, raios, tabs, inputs, alerts ou cards próprios.

## 2. Tokens oficiais

Usar somente os tokens `--panel-*`.

Não criar uma segunda família de variáveis para a mesma função. Valores de cor, espaçamento, tipografia, raio, sombra, foco e camadas devem entrar primeiro em `tokens.css` quando forem reutilizáveis.

## 3. Superfícies

As superfícies oficiais são:

- `.panel-card` / `PanelCard`;
- `.panel-kpi` / `PanelKpi`;
- `.panel-stat` / `PanelStat`;
- `.panel-surface` para composições especiais.

O antigo `GlassSurface` não faz mais parte da arquitetura.

## 4. Tipografia

A família oficial é Inter, carregada nos pesos 400, 500, 600, 700, 800 e 900.

Escala semântica:

- caption: `--panel-font-caption`;
- label: `--panel-font-label`;
- body small: `--panel-font-body-sm`;
- body: `--panel-font-body`;
- subtitle: `--panel-font-subtitle`;
- title: `--panel-font-title`;
- KPI: `--panel-font-kpi`.

Evitar novos tamanhos arbitrários quando um token ou componente existente atende à necessidade.

## 5. Cores

`--panel-red` é a cor principal da marca e de destaque.

Cores semânticas compartilhadas:

- vermelho: erro, ruptura, bloqueio crítico;
- âmbar: atenção, pendência, bloqueio não crítico;
- verde: sucesso, disponível, OK;
- azul: informação operacional;
- roxo: categorias secundárias como lançamentos.

Não usar hexadecimais locais em páginas quando houver token equivalente.

## 6. Navegação

### Sidebar

- retrátil;
- abertura por hover/foco em desktop continua disponível;
- existe sempre um botão explícito de abertura;
- em touch/mobile o botão é a forma principal de acesso;
- foco por teclado deve permanecer visível.

### Tabs principais

- usar `TopTabs`;
- sticky no topo;
- horizontal e rolável quando necessário;
- estado ativo sempre usa `--panel-red`.

### Tabs internas

- usar `PanelTabs`;
- não recriar tabs manualmente em páginas.

## 7. Componentes obrigatórios

Antes de criar CSS local, verificar se o caso pode usar:

- `PanelPage`;
- `PanelCard`;
- `PanelKpi`;
- `PanelStat`;
- `PanelSectionHeader`;
- `PanelTabs`;
- `PanelAlert`;
- `PanelEmptyState`;
- `PanelInfoRow`;
- `.panel-input` / `.panel-select`;
- `.panel-primary-button` / `.panel-secondary-button`;
- `.panel-badge`;
- `.panel-table`.

## 8. Empty states

`PanelEmptyState` tem três variantes:

- `page`: página sem dados;
- `section`: conteúdo vazio dentro de seção;
- `compact`: tabela/bloco pequeno vazio.

Uma página operacional vazia deve continuar exibindo `PanelPage`, preservando contexto e navegação.

## 9. Responsividade

- grids devem empilhar abaixo dos breakpoints compartilhados;
- layouts de dois painéis largos devem usar `.panel-responsive-pair`;
- inputs devem poder ocupar 100% no mobile;
- tabela pode rolar horizontalmente quando a quantidade de colunas exigir, mas a página não deve depender de largura fixa para funcionar;
- navegação principal deve ser utilizável sem hover.

## 10. Acessibilidade mínima

Todos os controles interativos precisam de:

- `:focus-visible` reconhecível;
- estado disabled visual;
- label ou `aria-label` quando não houver texto;
- alvo de toque adequado em controles principais.

## 11. Regra para páginas

A página é responsável por composição e dados, não por inventar primitives visuais.

Inline style é aceitável somente para um valor realmente dinâmico que não possa ser representado por classe/prop. Espaçamento, grid, cor, tipografia, borda, radius, hover, foco e estado devem ficar no design system compartilhado.
