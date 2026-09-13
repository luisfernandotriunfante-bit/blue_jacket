# GERAÇÃO DE EVIDÊNCIA — FASE 0

## 1. AMBIENTE

- Commit de partida confirmado: `8f76cf8ac2e619a4e839e3dc7c069e3c8a570259` na branch `redesign/phase0-baseline-inventory`.
- Baseline histórica tentada: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`.
- Foi possível rodar a baseline exata? **Parcialmente.** O checkout exato foi possível, `npm run build` terminou com sucesso e o servidor iniciou em `http://127.0.0.1:4180/`. A execução funcional não materializou o bundle canônico nem o estado persistido histórico.
- Processo exato: `git -c advice.detachedHead=false checkout --detach a6a05a00738585cab2fdeb4596dfdad1e84d02d1`; `npm run build`; `npm run dev -- --host 127.0.0.1 --port 4180`.
- Data/hora da observação: `2026-09-12T23:31:42.5873878-04:00`.
- Resultado: a tela exibiu **“Sem bundle canônico ativo”** e solicitou atualizar as bases para materializar a lista.

## 2. CAPTURAS

As 42 capturas esperadas (21 desktop e 21 em largura reduzida) permanecem **NÃO REPRODUZIDAS**. O processo exato, commit e URL foram registrados acima, mas a aplicação não tinha bundle canônico ativo; portanto nenhuma tela de dados foi capturada. Nenhum PNG foi gerado nesta execução e, consequentemente, nenhum SHA-256 de captura existe para registrar. Capturas de sessões locais antigas não foram usadas.

## 3. NÚMEROS DE REFERÊNCIA

Todos os números de Sell Out, Redes, Estoque, Metas e Auditoria permanecem **NÃO REPRODUZIDOS**. A interface sem bundle não forneceu os dados persistidos necessários. Não foram inventados valores nem calculados substitutos. Não há artefato de números ou SHA-256 a registrar.

## 4. COMPETÊNCIAS

Os estados de `CompetenceState` e `MonthlyClosingState` permanecem **NÃO REPRODUZIDOS**. Sem bundle canônico e sem o armazenamento local histórico, não foi possível comprovar 08/2026 fechada nem 09/2026 aberta. Não há artefato de estado ou SHA-256 a registrar.

## 5. DESEMPENHO

As três aberturas por tela pesada e as medianas permanecem **NÃO REPRODUZIDAS**. A ausência do bundle impediu uma abertura funcional com dataset. Não há artefato de medição ou SHA-256 a registrar. O build técnico foi concluído; sua saída ignorada `dist/index.html` apresentou SHA-256 `54A789A7A373D7DFF48098D2E48738C406A9C94A6388A56888D1551819AC40A4`, usado somente para identificar o diagnóstico do build, não como evidência de performance.

## 6. NOVO ESTADO DO PR

- Novo número de commits: **5** em relação à `origin/main`, confirmado após o push.
- Novo SHA de tip: `6dec2c5f0d049194868d404a5bcf2a204c242696`.

## 7. CONFIRMAÇÃO DE INTEGRIDADE

- Nenhum arquivo versionado fora de `docs/redesign/phase0/**` foi alterado ou incluído no commit.
- Nenhum dado de pasta local antiga foi incorporado.
- Nenhum merge foi feito.
- A branch oficial foi restaurada ao tip publicado após o commit desta documentação.
