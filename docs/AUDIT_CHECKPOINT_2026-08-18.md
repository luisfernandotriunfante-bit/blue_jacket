# Checkpoint de Auditoria — Blue Jacket

Data do ciclo: 18/08/2026 (continuação da conversa **Limpeza e padronização**)

## Critério deste checkpoint

Este documento não declara o sistema inteiro como 100% validado. Ele separa:

- **CONCLUÍDA**: regra demonstrada, implementada, testada e integrada à `main`;
- **PARCIAL / BLOQUEADA**: existem correções comprovadas, mas ao menos uma regra necessária ainda não pode ser demonstrada pela fonte lógica disponível;
- **BLOQUEADA POR FONTE AUSENTE**: a referência necessária não está disponível para provar equivalência.

Build ou abertura do Excel, isoladamente, não são evidência suficiente de regra de negócio.

## Baseline anterior

### Etapa 2 — Redes e CNPJ
**Status: CONCLUÍDA**

Checkpoint já fechado antes deste ciclo:

- Premissas, Roteiro e referência TOP REDES separados e rastreáveis;
- CNPJ original/normalizado preservado;
- conflitos e duplicidades auditáveis;
- 89 identificadores de venda no checkpoint;
- Sell Out total preservado em R$ 161.480,09;
- 27 testes aprovados no fechamento daquela etapa.

## Continuação executada

### Etapa 3 — Persistência por competência
**Status: CONCLUÍDA**

- configuração manual passou de chave global para `bj_manual_config:YYYY-MM`;
- Meta T&C, metas de redes, participações de linha, cobertura, markup e feriados ficam isolados por competência;
- mês novo não herda silenciosamente o mês anterior;
- migração da chave antiga é controlada e vinculada a uma competência conhecida;
- testes cobrem agosto x setembro, migração e remoção de feriados.

Integração: PR #9 / commit de merge `b1b1b028108c39fa69ee5a811bd88f79b17cfce2`.

### Etapa 4 — Estoque, carteira e caixas → unidades
**Status: PARCIAL / BLOQUEADA**

Correções e provas existentes no PR #10:

- reconciliação de carteira linha a linha;
- registro de material, EAN, código 286, método de conciliação, Order Qty, Bill Qty, Un/CX, unidades esperadas/calculadas e diferença;
- item ausente da Posição 105, mas presente no Cadastro 286, não é tratado como Sem Winthor;
- fator Un/CX ausente permanece explícito e não fabrica unidade;
- nomenclatura do catálogo corrigida para `Faturado mês (Un)` e `Cobertura ritmo faturado`.

Bloqueios:

1. **BLOQUEADA POR REGRA NÃO CONFIRMADA** — precedência Order Qty × Bill Qty;
2. **BLOQUEADA POR REGRA NÃO CONFIRMADA** — origem lógica do markup da carteira;
3. **BLOQUEADA POR REGRA NÃO CONFIRMADA** — fórmula original da cobertura por produto;
4. **BLOQUEADA POR REGRA NÃO CONFIRMADA** — Ruptura/Risco de Ruptura e origem do estoque mínimo.

O arquivo de painel versionado contém valores estáticos, mas não preserva as fórmulas necessárias para provar essas regras. O PR #10 permanece draft e não foi integrado à `main`.

### Etapa 5 — Sell Out, positivação, vendedores e coordenações
**Status: PARCIAL / BLOQUEADA**

Correções e provas existentes no PR #11:

- auditoria independente da matriz 8022 para Faturado, A Faturar, Sell Out, caixas, unidades, cardinalidades e motivos de descarte;
- CNPJ inválido/CPF não gera positivação, mas o valor da venda não desaparece;
- CNPJ já faturado não é contado novamente como positivação adicional A Faturar;
- venda sem vendedor permanece em `NÃO CLASSIFICADO`;
- soma vendedor → coordenação permanece reconciliável;
- consolidações CLAUDIO → FLAVIO e Thiago da Silva Conegundes → THIAGO são testadas.

Bloqueio:

- **BLOQUEADA POR REGRA NÃO CONFIRMADA** — equivalência formal da positivação mensal com a fórmula original da planilha.

O PR #11 permanece draft e não foi integrado à `main`.

### Etapa 6 — Metas
**Status: CONCLUÍDA**

- Bússola filtra somente MCD + Colgate;
- soma das metas individuais forma a Meta Indústria;
- Meta T&C é manual e separada da Meta Indústria;
- Meta T&C zero permanece não informada, sem fallback silencioso;
- Meta Redes Geral é independente da Meta T&C;
- alteração do total redistribui proporcionalmente;
- alteração de uma rede preserva o total e redistribui o saldo;
- fechamento é exato mesmo em distribuições com dízimas.

Integração: PR #12 / commit de merge `2c7a147c5ecfc15bf6c425a00f859035e9f9efd4`.

### Etapa 7 — Comparação lógica com o Excel fórmula
**Status: BLOQUEADA POR FONTE AUSENTE**

A referência exigida é `Painel Sell Out MILENIO-Julho'26 FORMULA.xlsm`.

Ela não está disponível no repositório nem nas fontes acessíveis deste ciclo. O XLSX estático versionado não substitui a referência lógica, porque usar o valor antigo de uma célula como constante violaria o próprio critério de auditoria.

Nenhuma fórmula foi inventada para fechar esta etapa.

### Etapa 8 — TOP REDES
**Status: PARCIAL / BLOQUEADA**

Correções comprovadas e integradas:

- modelo original demonstra no detalhe: K = (Realizado + A Faturar) / Meta Tops e L = (Realizado + A Faturar) / Meta Redes;
- o gerador tinha K/L invertidos e foi corrigido;
- aba `redes` agora usa a rede canônica resolvida, evitando desfazer o fallback Premissas → Roteiro → referência na exportação;
- testes inspecionam as sete abas do modelo e a aritmética do detalhe.

Integração das correções comprovadas: PR #13 / commit `18195130c5b638df2e5887adffcd8ac4ab3b5a25`.

Bloqueios restantes:

1. **BLOQUEADA POR REGRA NÃO CONFIRMADA** — origem de `Equipe!E`;
2. **BLOQUEADA POR FONTE AUSENTE** — `12.326` exige PEDIDO/SETOR e outros campos que o estado canônico atual não preserva;
3. **BLOQUEADA POR FONTE AUSENTE** — `319` possui peso/caixa e outros atributos ainda sem mapeamento demonstrado;
4. **BLOQUEADA POR FONTE AUSENTE** — `12.326ana` não pode certificar número de pedido porque esse dado não existe no estado canônico atual.

### Etapa 9 — Auditoria automática
**Status: CONCLUÍDA**

- removida a auditoria paralela que exibia apenas OK/ATENÇÃO;
- Configurações usa diretamente `canonical.reconciliation.checks`;
- auditoria mostra três níveis: Consistência Interna, Reconciliação de Fontes e Regressão contra Planilha;
- cada teste apresenta esperado, calculado, diferença, fonte, nota e status;
- status separados: OK, DIVERGENTE e BLOQUEADO;
- BLOQUEADO nunca é exibido como OK;
- bases antigas sem bloco de reconciliação recebem lista vazia até a próxima carga, sem quebrar a aplicação.

Integração: PR #14 / commit `24824ca2465afaa10269a51f199ca7e570ff8489`.

### Etapa 10 — Regressão e checkpoint
**Status: CONCLUÍDA COMO CHECKPOINT DE REGRESSÃO**

O checkpoint adicionou testes que impedem regressão das regras já integradas:

- persistência por competência;
- separação Meta T&C × Meta Indústria;
- redistribuição de redes;
- percentuais comprovados do TOP REDES;
- uso da rede canônica no Excel;
- auditoria canônica em três níveis;
- ordem do CI: typecheck → testes → build → artefato/publicação.

Resultado final do PR #15:

- typecheck aprovado;
- 57 testes registrados;
- 51 testes aprovados;
- 0 falhas;
- 6 TODOs explícitos correspondentes a regras/fonte ainda bloqueadas;
- build aprovado;
- artefato de publicação gerado com sucesso.

Integração: PR #15 / commit `00f4e0d90803de3f12aee65a218ed4d0636ff587`.

A conclusão da etapa 10 confirma a estabilidade do checkpoint da `main`, mas **não transforma regras bloqueadas em regras validadas**.

## Situação de aprovação do projeto após este ciclo

O projeto possui um checkpoint mais seguro e rastreável, mas a aprovação integral de regra de negócio continua condicionada à resolução dos bloqueios das etapas 4, 5, 7 e 8.

Nenhum desses bloqueios deve ser removido apenas porque o build passou ou porque o valor final ficou próximo do esperado.
