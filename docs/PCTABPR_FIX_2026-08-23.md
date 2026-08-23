# Correção PCTABPR · 23/08/2026

- O parser de preços passa a aceitar somente linhas com `NUMREGIAO=11`.
- `CODFILIAL=11` e nome da região não substituem mais `NUMREGIAO`.
- `PVENDA1` permanece a única referência de preço.
- Arquivos da mesma fonte substituem a seleção anterior na fila.
- A tela de Configurações passa a ter ação explícita `Limpar fila`.
- O erro da PCTABPR passa a incluir o nome do arquivo que falhou.

Caso de regressão protegido: `CODPROD 5924` com preços distintos em `NUMREGIAO=11` e outra região com `CODFILIAL=11` deve manter exclusivamente o valor da `NUMREGIAO=11`.