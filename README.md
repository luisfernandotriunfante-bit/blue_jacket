# Blue Jacket

Painel executivo para cálculos, apresentação de informações e geração de documentos.

## Estado atual

Este repositório começa deliberadamente apenas pela **fundação visual validada**. Nenhuma regra de negócio, fonte de dados, parser, cálculo, KPI, página funcional ou modelo de documento foi migrado do projeto anterior.

A regra do projeto é simples: **só entra no repositório principal aquilo que já foi validado**.

## Padrão visual v1

A fundação visual inicial é composta por:

- fundo escuro contínuo com iluminação em gradiente azul e vermelho;
- animação Triunfante em alta qualidade, fixa e centralizada, reagindo ao scroll para baixo e para cima;
- menu lateral retrátil por hover/foco;
- navegação horizontal centralizada no topo, preparada para receber abas futuras;
- uma única receita de vidro embaçado para menus e futuras superfícies de KPI, tabela e gráfico;
- contrato explícito de camadas para impedir sobreposição incorreta entre animação, conteúdo e navegação.

A especificação detalhada está em `docs/VISUAL_STANDARD.md`.

## Arquitetura desta etapa

```text
src/
  ui/
    animation/
    navigation/
    primitives/
    theme/
public/
  triunfante-hq-v2/
  triunfante-hq-v4/
  triunfante-fallback/
docs/
```

Não existe `App`, dashboard, página de demonstração ou camada de dados nesta etapa. Os componentes visuais são apenas primitives reutilizáveis para as próximas implementações.
