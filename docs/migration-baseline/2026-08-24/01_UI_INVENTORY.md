# Blue Jacket — inventário visual antes do reset

Base técnica fotografada: `fc8399dc531c5924b03642ada852f089c5395c4c` (`fix/auditoria-fechamento`).

Estado observado na publicação em 24/08/2026: nenhuma fonte carregada (`0/19`). Logo, não existiam valores operacionais a preservar na fotografia publicada; este inventário registra a estrutura que receberá os novos motores.

| Área | Abas / filtros | Cards e indicadores esperados | Tabela / conteúdo esperado |
|---|---|---|---|
| Estoque | Visão Geral, Produtos, Lançamentos, Entradas e Saídas; busca, tipo, risco e lista de códigos | físico, reservado, disponível, Carteira, projetado, cobertura e alertas | SKU, Winthor, fabricante, EAN, Un/CX, físico, reservado, disponível, Carteira, projetado, valores e risco; movimentos de entrada/saída |
| Sell Out | Resumo, Redes, Gerencial | faturado, a faturar, total, meta, positivação, ritmo e dias úteis | indicadores do período; redes; RCA/coordenador; gráficos diários |
| Clientes & Sortimento | Visão Geral, Sortimento, Lançamentos, Promoções; busca e seleção de CNPJ | assortment oficial/executável, coberturas, oportunidades, lançamentos e valor histórico | produto, classificação, compra, disponibilidade, Carteira, oportunidade, ação e preço |
| Atividades | Criação de Combo; seleção de produtos/clientes e opções de exportação | produtos elegíveis/selecionados, clientes e desconto | código, produto, PVENDA1, preço praticado, desconto e clientes |
| Documentos | ações de geração | cobertura de documentos, redes, arquivo comercial e dossiê | Painel Sell Out, Redes, Estoque, Arquivo Comercial e Dossiê Interno |
| Metas | Visão geral/parâmetros, distribuição comercial e calendário | metas indústria, positivação, Tops, Sell Out e Redes | parâmetros, linhas, redes, feriados e distribuição |
| Configurações | Atualizar lote, Continuidade, Auditoria | fontes registradas/carregadas e pendências | 19 fontes organizadas por rotina, competência, apoio e histórico |
| PEX | — | — | módulo marcado como em construção |

Menus preservados: Estoque, Sell Out, PEX, Clientes & Sortimento, Atividades, Documentos, Metas e Configurações.

Na publicação, cada área operacional já apresentava uma mensagem de ausência de dados. A configuração, porém, ainda permitia reprocessar arquivos pelo pipeline legado; esse era o caminho removido nesta etapa.
