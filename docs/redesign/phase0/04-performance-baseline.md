# 04 — Performance baseline

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

## Estado

**NÃO REPRODUZIDO EM RUNTIME**.

## Tentativa registrada no checkout oficial

- Commit: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`.
- Processo exato: `npm run build` (sucesso) e `npm run dev -- --host 127.0.0.1 --port 4180`.
- URL: `http://127.0.0.1:4180/`.
- Estado observado em `2026-09-12T23:31:42.5873878-04:00`: **“Sem bundle canônico ativo”**.
- Não foram realizadas as três aberturas por tela nem gerados arquivos de medição. Sem dataset materializado não há tempos, mediana, DOM ou hash de artefato de performance a registrar.

O ambiente desta execução permitiu compilar e abrir a baseline, mas não disponibilizou o bundle canônico nem o estado operacional/IndexedDB original. Consequentemente, não existe base confiável para atribuir tempos de abertura, contagem DOM, quantidade visual de linhas, comportamento de scroll ou travamentos. Valores artificiais não foram preenchidos.

## Metodologia exigida para completar a medição

Para cada tela pesada, executar a baseline histórica em navegador identificado e com o conjunto de dados correspondente ao estado congelado. Fazer pelo menos três aberturas completas por tela, registrar as três durações e a mediana. Para DOM usar uma métrica reproduzível como `document.querySelectorAll('*').length`. Registrar também quantidade de linhas/cards/list items relevantes, tamanho real do dataset, observações de scroll, travamentos percebidos e custo de expansão/detalhe.

## Matriz de performance

| Tela | Execução 1 | Execução 2 | Execução 3 | Mediana | Elementos DOM | Linhas/cards principais | Tamanho da lista de dados | Rolagem | Travamentos percebidos | Expansão/detalhe | Estado |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| Estoque → Produtos | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |
| Estoque → Entradas e Saídas | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |
| Sell Out → Gerencial | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |
| Clientes e Sortimento → tela com maior lista | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |
| Administração → Bases | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |
| Administração → Auditoria | — | — | — | — | — | — | — | — | — | — | NÃO REPRODUZIDO |

## Evidência estrutural relevante

Mesmo sem medição, o código permite identificar por que essas telas merecem ser medidas:

- **Estoque → Produtos:** catálogo derivado das listas canônicas e potencialmente com muitos SKUs.
- **Entradas e Saídas:** múltiplas coleções, filtros, notas expansíveis e documentos de venda.
- **Sell Out → Gerencial:** agrupamento por supervisor, tabelas de vendedores e conciliação RCA.
- **Clientes e Sortimento:** tabelas de clientes/produtos materializadas de M1/M2/M3.
- **Administração → Bases:** inventário das 19 fontes, diagnósticos, readiness e estados de substituição.
- **Administração → Auditoria:** renderização de todos os findings, filtros e detalhes expansíveis.

## Ambiente

- Inspeção desta Fase 0: GitHub conectado, sem browser/worktree interativo da baseline.
- Navegador da medição: **NÃO DISPONÍVEL**.
- Viewport da medição: **NÃO DISPONÍVEL**.
- Dataset operacional congelado: **NÃO DISPONÍVEL**.

Não apresentar precisão falsa até que essas condições estejam disponíveis.
