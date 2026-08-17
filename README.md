# Blue Jacket

Painel executivo de Sell Out com uma única base canônica para telas, cálculos e arquivos de entrega.

## Fluxo operacional

1. Carregue os relatórios em **Configurações**.
2. Confira a auditoria automática de fontes e totais.
3. Ajuste Meta T&C, Meta Redes, cobertura, acréscimo da carteira, feriados e participação das linhas em **Metas**.
4. Acompanhe Sell Out, estoque, redes, equipes e lançamentos.
5. Gere em **Documentos** o Painel Sell Out e o TOP REDES já preenchidos nos modelos oficiais.

Os arquivos gerados são estáticos, sem fórmulas, e preservam o layout, as imagens, as abas e a formatação dos modelos oficiais em `public/templates`.

## Regras estruturais

- telas e documentos usam o mesmo `CanonicalState`;
- Sell Out total = faturado + a faturar;
- positivação a faturar conta somente CNPJs ainda não positivados no faturado;
- dias trabalhados nunca ultrapassam a competência;
- a Meta T&C manual prevalece; quando não informada, a meta global assume a Meta PNA Colgate da Bússola;
- Meta Redes e Meta Tops continuam independentes quando existe um TOP REDES anterior; sem essa referência, Meta Redes recebe provisoriamente Meta Tops e a auditoria sinaliza o fallback;
- as cinco maiores redes alimentam o resumo, mas o arquivo TOP REDES recebe todas as redes apuradas;
- alterações manuais de Meta Redes preservam o total e redistribuem o saldo proporcionalmente.
- a Carteira é integralmente estoque em trânsito até a entrada no CD, mesmo quando a Colgate já faturou a linha;
- a Lista de Preços representa Colgate → Milênio, fornece o fator Un/CX e não é usada como preço de venda Milênio → cliente;
- a carteira mantém caixas e unidades separadas; seu valor de venda é o custo integral acrescido da taxa configurada conforme a planilha-modelo;
- lançamento vem da lista oficial por EAN; Sem Winthor vem da carteira quando o item não possui código no Cadastro 286;
- Claudio é consolidado em Flavio, e “Thiago da Silva Conegundes” é consolidado em “Thiago”.

Detalhes da auditoria funcional ficam em `docs/AUDITORIA_FUNCIONAL.md`. O padrão visual fica em `docs/VISUAL_STANDARD.md`.
