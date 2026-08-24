# Fechamento profissional — Sell Out

Escopo fechado nas três abas do módulo: **Resumo, Redes e Gerencial**.

## Regras confirmadas
- Sell Out = Faturado + A Faturar do 8022.
- Positivação mensal conta CNPJs canônicos distintos; fatos sem CNPJ permanecem em venda e não são inventados na positivação.
- Meta Sell Out (T&C) é manual e independente da Meta Indústria; zero significa meta não informada.
- Meta da indústria e meta de positivação vêm da Bússola; metas sem RCA oficial permanecem no total e não são redistribuídas.
- Rede operacional vem de Premissas; CNPJ sem rede permanece em SEM REDE.
- Tendência usa acumulado / dias úteis trabalhados × dias úteis do mês.
- Venda sem data válida permanece no total mensal, mas não recebe um dia artificial na série diária.
- Venda sem ITEM/linha resolvida permanece no Sell Out e fica explicitamente fora das cinco linhas.

## Correções do fechamento
- remoção de fallback que reativava Meta T&C antiga quando o usuário zerava a meta;
- calendário manual pode resultar legitimamente em zero dias úteis sem herdar valor antigo;
- necessidade diária passa a zero quando não existem dias úteis restantes e a UI mostra saldo final em vez de tratá-lo como valor por dia;
- métricas Top de rede não são sobrescritas ao editar Meta de Rede;
- 8022 com data de movimento inválida gera pendência explícita e não quebra a janela diária;
- Resumo mostra divergência entre total mensal e série diária quando houver fato sem data;
- Redes explicita A Faturar e identifica a contagem como CNPJs da rede;
- Gerencial não apresenta 0% de meta quando a meta não está informada;
- Gerencial explicita vendas/metas fora de RCA oficial em vez de forçar redistribuição;
- abertura por linha explicita saldo sem classificação em vez de forçar uma das cinco linhas;
- tabelas gerenciais têm estados vazios explícitos;
- ordem de hooks da aba Gerencial deixa de variar conforme a existência da base.
