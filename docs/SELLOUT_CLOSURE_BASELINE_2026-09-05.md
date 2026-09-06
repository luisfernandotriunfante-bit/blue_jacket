# Sell Out — baseline do fechamento definitivo

- Branch de referência: `main`
- Ponto de restauração: `fa2020a932c861a54cdebdbf36631a8540a12ddf`
- Suíte inicial: 141 testes, 140 aprovados, 0 falhas, 1 integração física previamente ignorada.

## Superfícies operacionais

- Resumo: `src/pages/SellOutPage.tsx` + `sellOutDashboardModel.ts`.
- Redes: `src/pages/TopRetailNetworksPage.tsx` + `topRetailNetworksModel.ts`.
- Gerencial: `src/pages/SellOutPage.tsx` + `operationalViewModels.ts`.
- Metas compartilhadas: `src/pages/MetasPage.tsx` + `reportSettings.ts`.
- Exportações: `operationalExporters.ts` + `reportTemplates.ts`.

## Fontes e motores

- 8022: fatos SALE em M3.
- Bússola: fatos TARGET em M3.
- NOVOS RCAS, Carteira de Clientes, Premissas e Roteiro Ativo Top: identidade/RCA/rede em M2.
- 105, 286, 8013, preço e sortimento: identidade/classificação em M1.
- M4 é histórico de transição e não compõe o Sell Out mensal corrente.

## Regras encontradas antes da correção

- Competência dos motores era o mês do relógio durante o processamento.
- Meta T&C e Meta Positivação eram globais; Meta Redes já era mensal.
- Todo status diferente de `A FATURAR` era classificado como faturado.
- Toda linha SALE com cliente positivava, inclusive valor zero/devolução.
- Resumo recalculava positivação fora do view-model operacional.
- Existia uma implementação antiga de Redes no mesmo componente da oficial.
- Diagnósticos RCA eram calculados pelo React, não pelo motor canônico.

Este arquivo é o inventário e a referência de comparação antes/depois.
