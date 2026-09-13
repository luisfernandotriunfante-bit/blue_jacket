# Fase 0 — Baseline e inventário

## Estado desta execução

**PARCIAL**

A baseline histórica e a main aprovada foram verificadas no GitHub e a arquitetura principal foi inventariada diretamente no código da baseline. Há também evidência histórica de CI concluído com sucesso no SHA da baseline. Entretanto, este ambiente não dispõe de execução interativa da baseline com o armazenamento local/IndexedDB original do usuário, portanto não foi possível produzir capturas visuais da baseline, reproduzir os números operacionais locais, confirmar materialmente os estados 08/2026 FECHADA e 09/2026 ABERTA, nem medir DOM/tempos de abertura. Esses pontos permanecem marcados como **NÃO REPRODUZIDO** e impedem declarar a Fase 0 CONCLUÍDA.

## Identidade

- Projeto: BLUE JACKET
- Baseline histórica: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`
- Main observada antes de qualquer mutação: `d634b5e231b54c83847fe99c85c2213a2c302327`
- Branch de evidências: `redesign/phase0-baseline-inventory`
- Data da análise: 2026-09-11
- Baseline GitHub: https://github.com/luisfernandotriunfante-bit/blue_jacket/commit/a6a05a00738585cab2fdeb4596dfdad1e84d02d1
- Main aprovada: https://github.com/luisfernandotriunfante-bit/blue_jacket/commit/d634b5e231b54c83847fe99c85c2213a2c302327

## Evidência técnica disponível

O workflow histórico associado exatamente ao SHA da baseline foi concluído com `success`:

- workflow run: https://github.com/luisfernandotriunfante-bit/blue_jacket/actions/runs/34402358559
- Install dependencies: success
- Dependency audit: success
- Typecheck: success
- Tests: success
- Build: success
- Deploy histórico daquele SHA: success

O workflow oficial executa `npm ci`, `npm audit --audit-level=high`, `npm run typecheck`, `npm run test:run` e `npm run build`.

## Inventário consolidado

- 7 áreas principais confirmadas no código da baseline.
- 21 visões principais confirmadas pela combinação de `src/main.tsx`, `src/navigation.ts` e `src/pages/admin/AdminPage.tsx`.
- Estados adicionais de vazio, loading, erro, bloqueio, filtros, tabelas, expansões e exportações foram documentados quando explicitamente observáveis no código.
- Capturas visuais produzidas nesta execução: **0**.
- Capturas esperadas no manifesto: **42** (21 desktop + 21 largura reduzida), todas marcadas como NÃO REPRODUZIDO.
- Fontes suportadas pelo contrato da baseline: **19** = 15 hard-required + 4 replaceable.

## Competências

A especificação operacional exige manter separadamente:

- 08/2026 = FECHADA
- 09/2026 = ABERTA

O código da baseline não fixa esses estados no repositório: `CompetenciasPage` lê `CompetenceState` e `MonthlyClosingState` da persistência local. Como o estado local original não está disponível neste ambiente, os dois estados mensais foram registrados como requisito de não regressão, mas **não foram materialmente reproduzidos** nesta execução.

## Limitações que impedem CONCLUÍDA

1. Não houve execução interativa da baseline com o armazenamento local original.
2. Não foram produzidas capturas 1440×900 e 1024×768 da baseline.
3. Não foram reproduzidos os números de Sell Out, Redes, Estoque, Metas e Auditoria.
4. Não foram obtidos os status reais de cada uma das 19 fontes no estado operacional original.
5. Não foi possível medir abertura, DOM e quantidade de linhas em runtime.
6. Agosto fechado e setembro aberto não puderam ser comprovados a partir do Git isoladamente.

## Arquivos desta Fase 0

- [01-inventario-visual-funcional.md](./01-inventario-visual-funcional.md)
- [02-manifesto-capturas.md](./02-manifesto-capturas.md)
- [03-numeros-referencia.md](./03-numeros-referencia.md)
- [04-performance-baseline.md](./04-performance-baseline.md)
- [05-riscos-nao-regressoes.md](./05-riscos-nao-regressoes.md)
- [resolucao-bloqueio.md](./resolucao-bloqueio.md)
- [geracao-evidencia.md](./geracao-evidencia.md)
- [evidencia-bundle-ativo.md](./evidencia-bundle-ativo.md)
- [screenshots/README.md](./screenshots/README.md)

## Regra de integridade

Nenhum arquivo funcional deve ser modificado por esta branch. O diff final deve permanecer exclusivamente em `docs/redesign/phase0/**`.
