# 02 — Manifesto público de capturas

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Estado: **GERADO COM RESTRIÇÃO DE BUNDLE**.

Em 2026-09-17, a automação Puppeteer/Chromium capturou as 42 imagens sobre worktree isolado em `a6a05a0` com dev server ativo. O bundle canônico **não foi ativado** nesta sessão de automação: o IndexedDB copiado do Chrome Default não foi reconhecido pelo Chromium. As 42 capturas documentam a estrutura visual, a navegação, os estados vazios e as mensagens de loading da baseline. Os estados normais com M1–M4 carregados não foram capturados nesta passagem.

## Matriz esperada

Cada uma das 21 visões do inventário exige duas capturas correspondentes:

- desktop: 1440×900;
- reduzida: 1024×768.

Total esperado: 42 capturas brutas privadas e 42 cópias públicas sanitizadas. Total produzido: **42 de 42**.

## Proveniência

- Baseline: `git worktree add --detach C:\bj-baseline-wt a6a05a0`
- Servidor: `npm run dev -- --host 127.0.0.1 --port 4180`
- Automação: Puppeteer 25.11.0, headless
- Capturas brutas privadas: `C:\bj-phase0-private-evidence\screenshots\raw\` (fora do Git)
- Cópias públicas sanitizadas: `docs/redesign/phase0/screenshots/` (versionadas)
- SHA-256 das públicas: listados em `screenshots/README.md`
- Sanitização CSS: aplicada; sem efeito visual pois não havia dados sensíveis com bundle inativo

## Regra de conclusão

O requisito só poderá ser marcado como atendido quando cada visão tiver uma captura bruta privada em cada viewport, o hash privado correspondente e uma cópia pública sanitizada da mesma captura. A sanitização deve ocultar somente conteúdo comercial identificável e preservar layout, dimensões, componentes, densidade, menus, cabeçalhos, tabelas, scroll, mensagens e estados visuais.



