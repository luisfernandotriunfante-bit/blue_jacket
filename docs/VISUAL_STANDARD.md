# Blue Jacket — Visual Standard v1

Este documento é o contrato visual da aplicação. O objetivo é preservar o que já foi validado sem carregar a arquitetura acumulada do projeto anterior.

## 1. Princípios

1. **Uma única camada de tema.** Não criar arquivos de “correção final”, sobrescritas sucessivas ou CSS de emergência.
2. **Sem lógica de negócio na UI.** Esta fundação não conhece vendas, metas, estoque, RCA, redes ou documentos.
3. **Vidro é um primitive.** Toda superfície futura que precise do material usa a mesma receita de `GlassSurface`/tokens.
4. **Animação é fundo, nunca conteúdo.** Nenhuma tela pode criar stacking context desnecessário que faça a animação aparecer sobre textos ou tabelas.
5. **Navegação é estrutural.** Sidebar e tabs recebem configuração futura por propriedades; não conhecem módulos reais nesta etapa.
6. **Somente peças validadas entram no `main`.** Novos componentes e regras serão implementados e validados incrementalmente.

## 2. Paleta e fundo

```css
--bj-bg-top: #0b1624;
--bj-bg-mid: #040910;
--bj-bg-bottom: #000205;
--bj-navy: #173a63;
--bj-navy-soft: #285786;
--bj-blood: #8f1029;
--bj-blood-soft: #b51d3a;
--bj-text: #f5f8fc;
--bj-muted: #98a9bd;
```

O fundo deve ser uma única composição CSS fixa, sem elementos decorativos extras no DOM:

- luz azul suave no alto à esquerda;
- luz vermelha suave no alto à direita;
- gradiente vertical do azul-marinho muito escuro para preto.

## 3. Material de vidro

Receita oficial:

```css
background: rgba(13, 24, 38, .23);
border: 1px solid rgba(191, 211, 234, .12);
backdrop-filter: blur(18px) saturate(116%);
-webkit-backdrop-filter: blur(18px) saturate(116%);
box-shadow: 0 20px 48px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255, 255, 255, .08);
```

Variações podem mudar apenas densidade, raio e espaçamento. Não devem trocar o material por preenchimentos sólidos.

Uso futuro previsto:

- KPIs;
- menu lateral;
- menu horizontal;
- tabelas;
- contêineres de gráficos;
- painéis auxiliares.

## 4. Contrato de camadas

A ordem visual é fixa:

| Camada | z-index | Responsabilidade |
|---|---:|---|
| Fundo | 0 | gradientes do shell |
| Triunfante | 1 | animação central fixa |
| Conteúdo | 2 | superfícies de vidro e conteúdo futuro |
| Tabs | 30 | navegação horizontal sticky |
| Sidebar | 1000 | navegação lateral retrátil |

Regras importantes:

- páginas futuras não devem usar `isolation`, `filter`, `transform` ou `z-index` sem necessidade;
- o vidro precisa enxergar a animação atrás dele para produzir o desfoque real;
- a animação usa `pointer-events: none` e nunca bloqueia interação;
- nenhum pseudo-elemento global deve ficar sobre a animação.

## 5. Animação Triunfante

Comportamento validado:

- fixa no centro da viewport;
- largura desktop `clamp(420px, 38vw, 620px)`;
- opacidade desktop `0.68`;
- responde ao scroll para baixo e para cima com rotação 3D no eixo Y;
- movimento suavizado por `requestAnimationFrame`;
- captura scroll da página e de elementos internos;
- wheel fornece resposta imediata;
- vídeo HQ é reconstruído a partir dos assets versionados;
- se o vídeo HQ falhar, usa sprite WebP como fallback;
- não há geração dinâmica de imagem nem substituição por logo genérica.

Constantes da interação:

```text
PIXELS_PER_LOOP = 720
ROTATION_PER_PIXEL = 0.58
MOTION_EASING = 0.22
SCROLL_STOP_DELAY = 520 ms
FALLBACK_FRAME_COUNT = 6
FALLBACK_COLUMNS = 3
```

## 6. Sidebar

Desktop:

- fixa à esquerda;
- largura aberta: `246px`;
- estado padrão fora da viewport: `translateX(-100%)`;
- faixa invisível de 10px na borda esquerda ativa o hover;
- abre em aproximadamente `210ms` com curva `cubic-bezier(.2,.8,.2,1)`;
- usa o mesmo vidro oficial;
- deve aceitar marca, itens e rodapé futuramente por propriedades.

Mobile:

- mantém comportamento retrátil, reposicionado como painel flutuante;
- detalhes serão refinados quando houver primeira tela real.

## 7. Navegação horizontal

- centralizada na parte alta da tela;
- `width: max-content`;
- sticky no topo;
- vidro oficial;
- raio externo de aproximadamente 18px;
- item ativo usa gradiente vermelho escuro;
- itens inativos usam texto azul-acinzentado;
- recebe as tabs futuras por propriedades; não possui abas de negócio nesta etapa.

## 8. Regras para futuras páginas

Quando uma página real for criada:

1. usar `BlueJacketShell`/estrutura equivalente como raiz;
2. posicionar todo conteúdo dentro da camada `.bj-content`;
3. usar `GlassSurface` para material fosco;
4. não redefinir backdrop, sidebar, tabs ou animação dentro da página;
5. não adicionar CSS global para corrigir um componente específico;
6. dados e cálculos ficam fora de `src/ui`.

## 9. Fora do escopo desta etapa

Não fazem parte desta fundação:

- páginas;
- KPIs reais;
- tabelas reais;
- gráficos reais;
- fontes de dados;
- parsers;
- motores de cálculo;
- localStorage de negócio;
- exportação Excel/PDF;
- modelos de documentos;
- regras comerciais.

Essas partes serão adicionadas uma por vez somente depois de suas fontes e resultados serem validados.
