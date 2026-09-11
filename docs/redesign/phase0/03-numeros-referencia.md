# 03 — Números de referência

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

## Regra de evidência

Nenhum valor operacional foi inventado ou recalculado manualmente. Esta execução consegue provar estruturas, fórmulas/rotas de origem e contratos pelo código da baseline, mas não possui o armazenamento local original que contém build canônico ativo, CompetenceState, TargetState, staging das fontes, forecasts, histórico de fechamento e outros estados persistidos. Por isso, valores dependentes desse estado estão marcados como **NÃO REPRODUZIDO**.

## Sell Out

| Número exigido | Valor | Estado | Origem/procedimento de reprodução |
|---|---:|---|---|
| Competência | — | NÃO REPRODUZIDO | Abrir Sell Out → Resumo com o build histórico ativo; competência deriva de M3/SALE e é comparada com a competência oficial. Código: `src/pages/SellOutPage.tsx`, `src/canonical/sellOutRules.ts`. |
| Sell Out realizado | — | NÃO REPRODUZIDO | `buildSellOutViewModel`/`buildSellOutDashboardModel`; exibir KPI Sell Out. |
| Faturado | — | NÃO REPRODUZIDO | Mesmos view-models; KPI Faturado. |
| A faturar | — | NÃO REPRODUZIDO | Disponível no detalhamento por linha/gerencial e derivado do mesmo modelo operacional. |
| Meta T&C | — | NÃO REPRODUZIDO | TargetState/report settings da competência ativa. |
| Positivados | — | NÃO REPRODUZIDO | Clientes distintos positivados no período ativo. |
| Meta de positivação | — | NÃO REPRODUZIDO | TargetState/report settings da competência ativa. |
| Positivação faturada | — | NÃO REPRODUZIDO | Clientes distintos com venda faturada. |
| Último movimento | — | NÃO REPRODUZIDO | Última data válida materializada pelo dashboard. |
| Totais por linha | — | NÃO REPRODUZIDO | Cinco linhas comerciais do dashboard. |

Código principal de prova: `src/pages/SellOutPage.tsx`, `src/canonical/operationalViewModels.ts`, `src/canonical/sellOutDashboardModel.ts` e `src/canonical/sellOutRules.ts`.

## Redes

| Número exigido | Valor | Estado | Origem/procedimento de reprodução |
|---|---:|---|---|
| Meta Redes | — | NÃO REPRODUZIDO | Sell Out → Redes; `networkTargetFor` + view-model. |
| Realizado | — | NÃO REPRODUZIDO | SALE de M3 limitada aos CNPJs do Roteiro Top. |
| Clientes no roteiro | — | NÃO REPRODUZIDO | M2/Roteiro Top materializado. |
| Clientes com venda | — | NÃO REPRODUZIDO | Interseção Roteiro Top × SALE. |
| Gap | — | NÃO REPRODUZIDO | Meta Redes menos realizado. |
| Contagem de redes | — | NÃO REPRODUZIDO | Linhas do `buildTopRetailNetworksViewModel`. |

Código principal: `src/pages/TopRetailNetworksPage.tsx`, `src/canonical/topRetailNetworksModel.ts`.

## Estoque

| Número exigido | Valor | Estado | Origem/procedimento de reprodução |
|---|---:|---|---|
| Estoque a custo / valor físico | — | NÃO REPRODUZIDO | Estoque → Visão Geral; `buildStockOverviewModel`. |
| Estoque a venda | — | NÃO REPRODUZIDO | Saldo físico × PVENDA1 materializado. |
| Disponível | — | NÃO REPRODUZIDO | M1/stock view-model. |
| Reservado | — | NÃO REPRODUZIDO | Quando aplicável no contrato canônico. |
| Carteira em trânsito | — | NÃO REPRODUZIDO | Carteira aberta conciliada com 12.322 e 218. |
| Projetado a custo | — | NÃO REPRODUZIDO | Disponível + Carteira em aberto conforme modelo. |
| Projetado a venda | — | NÃO REPRODUZIDO | Entradas vinculadas com Un/CX + PVENDA1. |
| Giro/cobertura | — | NÃO REPRODUZIDO | Modelo de saúde do estoque. |
| Quantidade total de produtos | — | NÃO REPRODUZIDO | M1 ativo / catálogo. |
| Quantidade relevante de entradas/saídas | — | NÃO REPRODUZIDO | `EntradasNotasPage` + stock movement model. |

Código principal: `src/pages/EstoquePage.tsx`, `src/pages/EntradasNotasPage.tsx`, `src/canonical/stockOverviewModel.ts`, `src/canonical/stockMovementModel.ts`.

## Metas

| Número exigido | Valor | Estado | Origem/procedimento de reprodução |
|---|---:|---|---|
| Competência | — | NÃO REPRODUZIDO | `CompetenceState` persistido localmente. |
| Meta geral T&C | — | NÃO REPRODUZIDO | `TargetState` da competência. |
| Positivação | — | NÃO REPRODUZIDO | `TargetState` da competência. |
| Meta Redes | — | NÃO REPRODUZIDO | `TargetState` da competência. |
| Metas RCA | — | NÃO REPRODUZIDO | RCA targets no `TargetState`. |
| Quantidade de registros | — | NÃO REPRODUZIDO | Estado persistido do Target Registry. |

Código principal: `src/pages/MetasPage.tsx`, `src/canonical/targetStore.ts`, `src/canonical/targetAuthority.ts`.

## Competências

A especificação da Fase 0 exige registrar separadamente:

| Competência requerida | Estado requerido pelo plano | Estado comprovado nesta execução |
|---|---|---|
| 08/2026 | FECHADA | **NÃO REPRODUZIDO** |
| 09/2026 | ABERTA | **NÃO REPRODUZIDO** |

Motivo: a baseline lê `CompetenceState` e `MonthlyClosingState` de persistência local. O Git prova a lógica e os estados possíveis, mas não contém o snapshot operacional do navegador utilizado para o fechamento mensal.

## Fontes

### Contrato reproduzível pelo código

- Fontes suportadas: **19**.
- Hard-required: **15**.
- Replaceable: **4**.

### Hard-required (15)

1. `379 25.txt`
2. `379 26.txt`
3. `310 total 2026.txt`
4. `12.322.txt`
5. `cadastro-itens-286.xls`
6. `posicao-estoque-105.xls`
7. `estoque-8013.xls`
8. `pctabpr 13.xlsx`
9. `Lista_de_Preco (8).xlsx`
10. `Sortimento Recomendado - Q3'26.xlsx`
11. `Nova Base de Premissas - Q3.xlsx`
12. `relatorio_carteira_clientes.xls`
13. `vendas-8022.xls`
14. `CARTEIRA 24.08.xlsx`
15. `entrada-notas-218.xls`

### Replaceable (4)

1. `NOVOS RCAS.xlsx`
2. `lançamentos.xlsx`
3. `08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx`
4. `Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx`

Código de prova: `src/canonical/sourceContract.ts`.

| Estado operacional da fonte | Valor | Estado |
|---|---:|---|
| Quantidade esperada | 19 | COMPROVADO PELO CÓDIGO |
| Quantidade disponível na sessão histórica | — | NÃO REPRODUZIDO |
| Fontes efetivamente substituídas | — | NÃO REPRODUZIDO |
| Status real de cada fonte | — | NÃO REPRODUZIDO |
| Competência associada às fontes mensais | — | NÃO REPRODUZIDO |

Os status reais dependem de `loadSourceStagingSnapshot`, `SourceReplacementState`, Admin Registry e TargetState locais.

## Auditoria

| Número exigido | Valor | Estado | Origem/procedimento de reprodução |
|---|---:|---|---|
| Total de verificações | — | NÃO REPRODUZIDO | Administração → Auditoria; `loadGlobalAuditReport`. |
| Blockers | — | NÃO REPRODUZIDO | `report.summary.blockers`. |
| Warnings/atenções | — | NÃO REPRODUZIDO | `report.summary.warnings`. |
| Informações | — | NÃO REPRODUZIDO | `report.summary.info`. |
| Verificações aprovadas | — | NÃO REPRODUZIDO | `report.summary.pass`. |
| Status geral | — | NÃO REPRODUZIDO | HEALTHY / ATTENTION / BLOCKED segundo relatório local. |

Código principal: `src/pages/AuditoriaPage.tsx`, `src/canonical/globalAudit.ts`, `src/canonical/globalAuditInputs.ts`.

## Gates técnicos da baseline

Há evidência histórica no GitHub Actions para o SHA exato da baseline:

| Gate | Estado histórico |
|---|---|
| Instalação (`npm ci`) | SUCCESS |
| Dependency audit high | SUCCESS |
| Typecheck | SUCCESS |
| Test suite | SUCCESS |
| Build | SUCCESS |

Workflow run: https://github.com/luisfernandotriunfante-bit/blue_jacket/actions/runs/34402358559

Esses gates comprovam a integridade técnica daquele commit no CI. Eles **não** substituem a reprodução dos dados persistidos e dos números visuais exigidos pela Fase 0.
