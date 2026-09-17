# 04 — Performance da baseline

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Estado: **PARCIALMENTE REPRODUZIDO EM RUNTIME** no build histórico restaurado pelo fluxo oficial de sincronização.

Os tempos foram medidos do clique na aba até o conteúdo de referência ficar visível. A contagem DOM usa `document.querySelectorAll('*').length`. O pacote privado `performance-completa-privada.md`, protegido pelo manifesto SHA-256 registrado em `00-README.md`, preserva o relatório completo.

| Tela | Execução 1 | Execução 2 | Execução 3 | Mediana | DOM | Volume técnico | Scroll | Travamento | Estado |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Estoque → Produtos | 3.198 ms | 4.686 ms | 4.769 ms | 4.686 ms | 23.281 | 748 itens | sim | não | REPRODUZIDO |
| Estoque → Entradas e Saídas | 1.890 ms | 4.001 ms | 4.588 ms | 4.001 ms | 4.496 | 441 linhas | sim | não | REPRODUZIDO |
| Sell Out → Gerencial | 287 ms | 283 ms | 282 ms | 283 ms | 540 | 28 linhas | sim | não | REPRODUZIDO |
| Clientes e Sortimento → Visão Geral | 1.415 ms | 1.302 ms | 1.555 ms | 1.415 ms | 61.342 | 8.749 linhas | sim | não | REPRODUZIDO |
| Administração → Bases | — | — | — | — | — | 19 fontes | sim | sim, na repetição | PENDENTE |
| Administração → Auditoria | — | — | — | — | — | conjunto completo de findings | sim | sim, durante a carga | PENDENTE |

## Tentativas administrativas

Bases e Auditoria foram tentadas novamente em sessão limpa da baseline. Bases abriu e exibiu o inventário completo, mas a alternância repetida deixou de responder. Auditoria permaneceu em `Carregando os inputs atuais sem reprocessar M1–M4…` e não atingiu o conteúdo de referência dentro do limite operacional. Nenhum tempo foi estimado.

## Cobertura

Quatro das seis telas têm três execuções válidas. As duas telas administrativas exigem nova sessão estável para completar três execuções, mediana, DOM e teste de expansão. Essa pendência mantém o requisito de performance da Fase 0 parcialmente atendido.
