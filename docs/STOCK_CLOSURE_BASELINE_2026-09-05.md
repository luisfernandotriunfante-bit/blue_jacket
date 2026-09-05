# Blue Jacket — baseline técnico do fechamento de Estoque

Data da auditoria: 2026-09-05  
Branch de trabalho: `audit/estoque-fechamento-definitivo`  
Ponto de restauração: `e56773bcdd0cf4b46b45aff8be763c9ff0617517` (`origin/main` antes do fechamento)

## Superfícies operacionais inventariadas

| Aba | Componente | Estado no baseline |
| --- | --- | --- |
| Visão Geral | `EstoquePage.tsx` | Ativa; usa `buildStockOverviewModel` |
| Produtos | `ProductCatalogPage.tsx` via `EstoquePage.tsx` | Ativa; recalcula produto, giro e cobertura dentro da página |
| Lançamentos | `LancamentosPage.tsx` + `ProductCatalogPage.tsx` | Ativa; mesma tela de Produtos filtrada por `isLaunch` |
| Entradas e Saídas | `EntradasNotasPage.tsx` | Ativa; deriva notas e pedidos de M1/M3/M4 |
| Auxiliar de Pedidos | `EstoquePage.tsx` + `MigrationPage` | Placeholder visível, sem regra homologada de sugestão |

## Fluxo e listas canônicas

O fluxo operacional vigente é `fonte → parser → staging → M1/M3/M4 → view model → interface`.

- `M1_ITEM_ESTOQUE`: cadastro, identificadores, estoque, embalagem, preço, custo, lançamento e sortimento.
- `M3_MOVIMENTO_VENDAS`: vendas/saídas 8022, Carteira Colgate, recebimentos 218 e metas (as metas não são usadas no Estoque).
- `M4_HISTORICO_TRANSICAO`: movimentos históricos 379, agregado 310 e recebimentos históricos 12.322.
- `stockOverviewModel.ts`: conciliação de Carteira/recebimentos, demanda, estoque, alertas, treemap e previsões.

## Fontes usadas pelo Estoque

| Fonte | Uso |
| --- | --- |
| 105 | físico e custo unitário |
| 286 | cadastro, códigos/EAN, físico/reservado/disponível do relatório |
| 8013 | sub-brand, atributos logísticos e conferência de estoque |
| PCTABPR região 11 | `PVENDA`, `VLST` e `PVENDA1` |
| Lista de Preço | SKU Colgate, EAN, Un/CX, preço-base e vínculo industrial |
| Carteira Colgate | entrada em aberto, NF, caixas, valor e itens |
| 218 | chegada efetiva e itens recebidos |
| 12.322 | chegada histórica no grão da NF |
| 8022 | vendas faturadas, devoluções, pedidos a faturar e reserva operacional |
| 379 (M4) | histórico diário de venda/devolução para giro e cobertura |
| Lista de Lançamentos | marcador `is_launch` e itens ainda sem cadastro |
| Sortimento Q3 | marca, classificação e faixas 1 a 6 |

## Regras encontradas antes das mudanças

- Físico da Visão Geral: `physical_stock_units`, limitado a zero ou mais.
- Reservado da Visão Geral: soma do 8022 com status `A FATURAR`.
- Disponível da Visão Geral: físico menos reservado; podia ficar negativo.
- Disponível em Produtos: `stock_286_available || (físico - reservado_286)`, portanto perdia zero explícito.
- Carteira financeira: NF é retirada integralmente primeiro pelo 12.322 e, se ausente, pelo 218; sobreposição não baixa duas vezes.
- Projetado: disponível mais Carteira vinculada e convertida por Un/CX.
- Giro da Visão Geral: M3 + M4 dentro de 90 dias fixos.
- Giro em Produtos/Lançamentos: venda do M3 dividida por 3, sem usar M4 e sem medir os dias reais.
- Cobertura da Visão Geral: disponível dividido por demanda diária calculada com divisor fixo de 90 dias.
- Cobertura em Produtos/Lançamentos: cálculo independente com o mesmo divisor fixo.
- Treemap: físico × `PVENDA1`, agrupado por linha comercial → sub-brand.
- Previsões manuais: persistidas por NF em configurações locais e incluídas na sincronização cifrada entre aparelhos.

## Dívidas objetivas detectadas no baseline

1. Giro/cobertura e estoque disponível divergiam entre Visão Geral e Produtos/Lançamentos.
2. A janela histórica sempre informava 90 dias, mesmo quando havia menos dias efetivamente carregados.
3. M3 e M4 não possuíam deduplicação explícita por movimento.
4. O resolvedor não tentava EAN nos fatos atuais e permitia sobrescrita silenciosa em índices exatos.
5. Zero explícito de disponível podia acionar fallback indevido em Produtos.
6. Entradas e Saídas podia permanecer em “Carregando notas” após erro.
7. O estado vazio da Carteira consultava a busca dos recebimentos, não a busca da própria seção.
8. Os resumos de Entradas e Saídas não conciliavam visualmente quantidade e valor.
9. A Visão Geral só tinha três buckets de previsão.
10. O Auxiliar de Pedidos era placeholder e não existe fórmula homologada de sugestão no código, testes ou documentação.

Este documento é o inventário de restauração e comparação usado pelo fechamento definitivo.
