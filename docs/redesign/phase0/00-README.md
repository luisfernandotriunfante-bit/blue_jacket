# Fase 0 — Baseline e inventário

## Estado

**PARCIAL — baseline histórica materializada pelo Sync/Backup v2.**

Em 2026-09-17, o snapshot remoto oficial existente foi restaurado no checkout isolado `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`. O restore e o rebuild terminaram sem bypass ou alteração dos dados. As quatro listas canônicas ficaram válidas, todas as fontes exigidas ficaram disponíveis, duas substituições certificadas foram reconhecidas e os estados mensais esperados foram reproduzidos.

Os números operacionais foram reproduzidos e preservados fora do repositório público. Quatro das seis telas de performance têm três medições válidas. A Fase 0 continua parcial porque as 42 capturas ainda não foram materializadas e Administração → Bases/Auditoria não completaram três medições estáveis.

## Identidade

- baseline histórica: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`;
- main observada: `d634b5e231b54c83847fe99c85c2213a2c302327`;
- branch: `redesign/phase0-baseline-inventory`;
- protocolo de sincronização: v2;
- restauração: concluída pelo fluxo oficial;
- validação local: typecheck, 937 testes aprovados, 1 ignorado e build concluído.

## Evidência privada

O pacote `phase0-private-evidence` permanece fora do Git e contém:

- `numeros-referencia-privado.md`;
- `performance-completa-privada.md`;
- `manifesto-capturas-privado.md`;
- `identidade-baseline.md`;
- `screenshots/raw/`;
- `MANIFEST.sha256`.

Hash SHA-256 do manifesto final: `626d8ee5f4640a497e3c62f825778a86549840684a334498be60b6589657045c`.

Os documentos públicos registram somente nomes de artefatos, hashes e procedimentos necessários à auditoria. Valores comerciais brutos, identificadores pessoais, documentos comerciais, segredos e credenciais permanecem fora do repositório.

## Cobertura

- 7 áreas principais e 21 visões reconciliadas com código e runtime;
- 12 visões observadas diretamente na baseline restaurada;
- 9 visões comprovadas por código, com inspeção visual individual ainda pendente;
- números de referência reproduzidos;
- 4 de 6 telas de performance concluídas;
- 0 de 42 capturas brutas privadas;
- 0 de 42 cópias públicas sanitizadas;
- nenhuma alteração funcional nesta branch.

## Arquivos

- [01-inventario-visual-funcional.md](./01-inventario-visual-funcional.md)
- [02-manifesto-capturas.md](./02-manifesto-capturas.md)
- [03-numeros-referencia.md](./03-numeros-referencia.md)
- [04-performance-baseline.md](./04-performance-baseline.md)
- [05-riscos-nao-regressoes.md](./05-riscos-nao-regressoes.md)
- [resolucao-bloqueio.md](./resolucao-bloqueio.md)
- [geracao-evidencia.md](./geracao-evidencia.md)
- [evidencia-bundle-ativo.md](./evidencia-bundle-ativo.md)
- [screenshots/README.md](./screenshots/README.md)

## Gate

A Fase 0 não está concluída. Faltam as capturas com correspondência privada/pública e as medições completas das duas telas administrativas. A Fase 1 permanece não iniciada.
