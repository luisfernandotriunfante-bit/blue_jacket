# Blue Jacket — Visual Standard v1

Este documento registra o padrão visual atualmente preservado no projeto.

## 1. Princípios

1. **Uma única camada de tema.** Não criar arquivos de correção final, sobrescritas sucessivas ou CSS de emergência.
2. **Vidro é um primitive.** Superfícies que precisem do material usam a mesma receita de `GlassSurface` e tokens compartilhados.
3. **Navegação é estrutural.** Sidebar e tabs devem continuar reutilizáveis e independentes das regras de negócio.
4. **Somente peças validadas entram no `main`.** Novos componentes e regras são implementados e validados incrementalmente.
5. **A animação da logo está fora do projeto nesta etapa.** Não manter código, mídia, estilos, tokens ou props reservados para ela.

## 2. Fundo e tema

O shell visual deve continuar centralizando o fundo e os tokens globais. Páginas individuais não devem criar fundos globais paralelos nem camadas decorativas que disputem com o shell.

## 3. Material de vidro

Receita base:

```css
background: rgba(13, 24, 38, .23);
border: 1px solid rgba(191, 211, 234, .12);
backdrop-filter: blur(18px) saturate(116%);
-webkit-backdrop-filter: blur(18px) saturate(116%);
box-shadow: 0 20px 48px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255, 255, 255, .08);
```

Variações podem mudar densidade, raio e espaçamento sem substituir o material por preenchimentos sólidos desnecessários.

Uso previsto:

- KPIs;
- menu lateral;
- menu horizontal;
- tabelas;
- contêineres de gráficos;
- painéis auxiliares.

## 4. Contrato de camadas

A ordem visual atual é:

| Camada | Responsabilidade |
|---|---|
| Fundo | shell e gradiente principal |
| Conteúdo | páginas, superfícies e informações |
| Tabs | navegação horizontal |
| Sidebar | navegação lateral retrátil |

Não existe camada reservada para animação.

## 5. Sidebar

Desktop:

- fixa à esquerda;
- largura aberta de `246px`;
- estado padrão fora da viewport com `translateX(-100%)`;
- abertura por hover/foco;
- usa o material de vidro do projeto.

Mobile:

- mantém comportamento retrátil;
- detalhes podem ser refinados quando necessário, sem duplicar a implementação desktop.

## 6. Navegação horizontal

- centralizada na parte alta da tela;
- `width: max-content`;
- sticky no topo;
- material de vidro compartilhado;
- recebe as tabs por propriedades.

## 7. Regras para páginas

1. usar `BlueJacketShell` como estrutura raiz;
2. manter conteúdo dentro de `.bj-content`;
3. reutilizar `GlassSurface` e classes compartilhadas;
4. não redefinir shell, sidebar ou tabs dentro de páginas específicas;
5. não adicionar CSS global apenas para corrigir um componente isolado;
6. manter regras de dados e cálculos separadas dos primitives de UI.

## 8. Animação

A animação da logo foi removida por decisão de projeto.

Não devem existir no `main`:

- componentes de animação;
- frames ou vídeos da logo;
- listeners de scroll destinados à animação;
- props de habilitação/desabilitação da animação;
- classes CSS específicas;
- tokens de `z-index` reservados para animação.

Caso a animação volte, deverá ser tratada como uma implementação nova e independente.
