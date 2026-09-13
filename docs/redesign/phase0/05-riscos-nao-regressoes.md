# 05 — Riscos e não regressões

Baseline histórica: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Main aprovada observada na abertura da Fase 0: `d634b5e231b54c83847fe99c85c2213a2c302327`

## Não regressões obrigatórias

O redesign não pode alterar silenciosamente:

- fórmulas;
- regras de Sell Out;
- regras de faturamento;
- regras de positivação;
- regras de estoque;
- regras de giro;
- regras de cobertura;
- contagens homologadas;
- fontes;
- identidade das fontes;
- escopo;
- competência;
- fechamento mensal;
- histórico;
- dados canônicos;
- autoridade de fonte;
- sincronização;
- backup;
- recuperação;
- hashes;
- provas técnicas;
- exportações homologadas.

## Competências mensais

- **08/2026 NÃO PODE SER REABERTA OU REESCRITA pelo redesign.**
- **09/2026 deve permanecer como competência operacional aberta conforme o requisito da baseline.**

Nesta execução, esses dois estados são tratados como guardrails obrigatórios do plano. O estado persistido real não foi reproduzido porque `CompetenceState` e `MonthlyClosingState` residem no armazenamento local da aplicação, não no Git.

## Evidência e simplificação visual

- Simplificar a interface não autoriza apagar evidência.
- Warnings não podem ser escondidos somente para deixar a tela mais limpa.
- Problemas técnicos podem futuramente mudar de lugar na interface, mas sua evidência deve permanecer disponível.
- A Auditoria Global deve continuar exibindo PASS/BLOCKER/WARNING/INFO e preservar detalhes técnicos necessários à rastreabilidade.
- Dados Canônicos devem continuar preservando identidade de build, hashes, row counts, exportações e histórico de fechamentos.

## Baseline histórica versus aparência atual

A baseline `a6a05a0` é a referência histórica de comparação “antes”. A main `d634b5e` é o estado atual visualmente aprovado no momento da emissão do plano. São referências diferentes:

- não substituir a baseline histórica pela main atual;
- não redesenhar novamente a aparência já aprovada em `d634b5e` durante esta Fase 0;
- não desfazer alterações visuais posteriores à baseline;
- não usar capturas da main atual como se fossem capturas da baseline.

## Fontes e autoridade

O contrato da baseline contém 19 fontes suportadas: 15 hard-required e 4 replaceable. Qualquer fase futura deve preservar a identidade e o contrato de autoridade dessas fontes, incluindo certificados de substituição, escopo global/mensal e bloqueios quando a evidência não for suficiente.

Em particular:

- fonte ausente não pode ser inventada;
- substituição administrativa não pode virar fallback silencioso;
- escopo MIXED/UNRESOLVED não pode ser adivinhado;
- nova versão física de fonte substituída deve exigir revisão/recertificação conforme contrato;
- build anterior deve permanecer protegido quando a atualização falha;
- M1–M4, manifests e hashes não podem ser trocados por dados de outra fotografia mensal sem evidência.

## Sincronização, backup e recuperação

Não alterar silenciosamente:

- pareamento entre aparelhos;
- conflito de revisão remota;
- snapshot remoto;
- histórico canônico sincronizado;
- validação de integridade de payload;
- recuperação de bundle;
- identidade local de Registry/Targets/substituições;
- prevenção de sobrescrita quando remoto é mais novo;
- bloqueios por mismatch de staging/bundle.

## Riscos principais para o redesign

| Risco | Consequência | Não regressão exigida |
|---|---|---|
| Mudar fórmula ao reorganizar UI | KPIs deixam de bater com a baseline | UI deve consumir os mesmos view-models/autoridades homologados |
| Misturar competências | Agosto/Setembro contaminados | Toda visão mensal deve manter competência explícita e gates existentes |
| Esconder warning/blocker | Estado parece saudável sem estar | Evidência deve continuar visível e auditável |
| Trocar identidade de fonte | Build não reproduzível | Preservar source id, hash, escopo e lineage |
| Reabrir histórico fechado | Perda de imutabilidade | Eventos de fechamento/histórico devem permanecer protegidos |
| Redesenhar sobre estado atual sem comparar baseline | Perda da prova “antes/depois” | Manter baseline histórica separada da main aprovada |
| Simplificar tabelas removendo exportação/proveniência | Perda de rastreabilidade | Exportações e detalhes técnicos homologados permanecem disponíveis |
| Alterar sync/recovery durante mudança visual | Risco de sobrescrita/perda de dados | Fluxos técnicos devem ficar fora do escopo visual até fase específica |

## Integridade desta branch

### Verificação da tentativa de reprodução

O commit histórico `a6a05a00738585cab2fdeb4596dfdad1e84d02d1` compilou e foi servido em `http://127.0.0.1:4180/` com `npm run dev -- --host 127.0.0.1 --port 4180`. Em `2026-09-12T23:31:42.5873878-04:00`, a interface informou que não havia bundle canônico ativo. Portanto, não houve promoção de números, estados mensais, fontes ou auditoria de outra sessão. A limitação permanece documentada como **NÃO REPRODUZIDO**.

### Verificação da tentativa de materialização

As fontes recebidas em `C:\setembro` foram usadas somente no navegador local da baseline. A operação aceitou 12 stagings, rejeitou `8013.xls` e `8022.xls` por divergência de aba e não ativou build. As cinco fontes ausentes e as duas rejeitadas continuam bloqueios explícitos; nenhum dado operacional foi promovido para baseline pública.

A branch `redesign/phase0-baseline-inventory` deve conter exclusivamente documentação e evidências em `docs/redesign/phase0/**`.

Resultado esperado antes do PR:

- `src/**`: NENHUMA alteração;
- `tests/**`: NENHUMA alteração;
- `package.json` / `package-lock.json`: NENHUMA alteração;
- configuração funcional: NENHUMA alteração;
- aplicação/engine/parsers/stores/view-models/sync: NENHUMA alteração.
