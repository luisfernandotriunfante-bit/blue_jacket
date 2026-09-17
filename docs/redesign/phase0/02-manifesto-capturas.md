# 02 — Manifesto público de capturas

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Estado: **PENDENTE DE MATERIALIZAÇÃO BINÁRIA**.

O runtime histórico foi restaurado e inspecionado com identidade comprovada. A interface de automação permitiu a inspeção visual e semântica, mas não forneceu um caminho de arquivo verificável para persistir os bytes das capturas no diretório versionado. Nenhuma imagem artificial ou proveniente de outra revisão foi adicionada.

## Matriz esperada

Cada uma das 21 visões do inventário exige duas capturas correspondentes:

- desktop: 1440×900;
- reduzida: 1024×768.

Total esperado: 42 capturas brutas privadas e 42 cópias públicas sanitizadas. Total produzido nesta execução: 0.

## Evidência privada

O artefato `manifesto-capturas-privado.md` registra a nomenclatura, a correspondência 1:1 e a limitação técnica. O pacote privado e o hash do manifesto estão identificados em `00-README.md`. O diretório bruto permanece fora do Git.

## Regra de conclusão

O requisito só poderá ser marcado como atendido quando cada visão tiver uma captura bruta privada em cada viewport, o hash privado correspondente e uma cópia pública sanitizada da mesma captura. A sanitização deve ocultar somente conteúdo comercial identificável e preservar layout, dimensões, componentes, densidade, menus, cabeçalhos, tabelas, scroll, mensagens e estados visuais.
