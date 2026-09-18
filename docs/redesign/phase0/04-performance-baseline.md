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
| Administração → Bases | 29.027 ms¹ | 26.412 ms¹ | 28.734 ms¹ | 28.734 ms¹ | 400¹ | 19 fontes | — | timeout | INVÁLIDO — sem bundle |
| Administração → Auditoria | 45.901 ms¹ | 44.113 ms¹ | 78.212 ms¹ | 45.901 ms¹ | 68¹ | conjunto completo | — | loading permanente | INVÁLIDO — sem bundle |

¹ Medições coletadas em 2026-09-17 por Puppeteer/Chromium sem bundle canônico ativo. Os tempos refletem timeout da automação (12 s) mais overhead de navegação, não o tempo de carga real do conteúdo. DOM=400 representa o shell da aplicação sem conteúdo carregado (Bases); DOM=68 representa o estado de loading travado inicial (Auditoria). Não são valores de referência válidos para a baseline de performance.

## Tentativas administrativas

Bases e Auditoria foram tentadas em sessão anterior (com bundle ativo): Bases abriu e exibiu o inventário completo, mas a alternância repetida deixou de responder. Auditoria permaneceu em `Carregando os inputs atuais sem reprocessar M1–M4…` e não atingiu o conteúdo de referência dentro do limite operacional. Nenhum tempo foi estimado nessa sessão.

Em 2026-09-17, três medições foram coletadas por automação Puppeteer/Chromium, mas sem bundle ativo. Os valores registrados são timeouts (12 s) somados a overhead de navegação e não representam o tempo real de renderização. O resultado permanece PENDENTE: nenhum conjunto de três execuções válidas com bundle ativo foi obtido para estas telas.

## Cobertura

Quatro das seis telas têm três execuções válidas com bundle ativo. As duas telas administrativas exigem nova sessão estável com bundle materializado para completar três execuções, mediana, DOM real e teste de expansão. Essa pendência mantém o requisito de performance da Fase 0 parcialmente atendido.
