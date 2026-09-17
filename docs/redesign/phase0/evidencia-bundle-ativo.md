# Evidência sanitizada do bundle ativo — Fase 0

## Materialização

- Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`.
- Instalação, typecheck, testes e build: aprovados.
- Sync: protocolo v2, snapshot oficial já existente e histórico oficial disponível.
- Restore: concluído pelo fluxo oficial **PAREAR E RESTAURAR**, sem bypass, alteração de parser, schema, regra ou dado.
- Resultado: **BASELINE_MATERIALIZADA = SIM**.

## Identidade

- M1, M2, M3 e M4: VALID.
- Fontes: contrato completo e disponível.
- Substituições: duas certificadas nos respectivos escopos.
- 08/2026: FECHADA.
- 09/2026: ABERTA.
- Auditoria: sem blockers e com as validações de identidade, fontes, cadastros, metas, input canônico e proof aprovadas.

As contagens técnicas e os hashes de identidade estão preservados em `identidade-baseline.md`, integrante do pacote privado. SHA-256 do artefato: `15da58d41b616fd31bfd3e4a51ebfc5161c05fe5fe17308964598ba6f466f4cf`. SHA-256 de `MANIFEST.sha256`: `626d8ee5f4640a497e3c62f825778a86549840684a334498be60b6589657045c`.

## Privacidade

Valores comerciais, clientes, identificadores fiscais, responsáveis individualizados, documentos, pedidos e detalhes de estoque permanecem somente no pacote privado. Segredos de pareamento, credenciais de espaço de trabalho, chaves de acesso e payload cifrado não foram persistidos nem no pacote privado nem no Git.

## Pendências

- 42 capturas brutas privadas e 42 versões públicas sanitizadas.
- Três medições reproduzíveis de Administração → Bases.
- Três medições reproduzíveis de Administração → Auditoria.
- Reconciliação final das 21 visões no inventário.
