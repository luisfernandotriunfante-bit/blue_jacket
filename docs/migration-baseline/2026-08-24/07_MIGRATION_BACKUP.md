# Backup técnico de migração

## Referência imutável

- Commit anterior ao reset: `fc8399dc531c5924b03642ada852f089c5395c4c`
- Branch de origem: `fix/auditoria-fechamento`
- Publicação observada: `https://luisfernandotriunfante-bit.github.io/blue_jacket/`
- Data da fotografia: 24/08/2026

O commit acima é a cópia técnica canônica do código, do formato anterior do estado, dos parsers, dos motores, dos geradores e dos testes legados. Os seis artefatos deste diretório preservam o contrato de tela e a fotografia observada.

## Estado persistido observado

Não havia snapshot canônico, carga operacional, configuração por competência, fontes ou valores ativos no runtime publicado auditado. Por isso não existe JSON de dados transacionais anexado: criar um arquivo vazio com aparência de backup seria enganoso.

## Isolamento

Este diretório é exclusivamente documental. O aplicativo não o importa, não o lê e não usa qualquer conteúdo dele como fallback, mock ou fonte de dados.

## Limpeza ativa aplicada pela etapa 1

Na inicialização, o aplicativo remove somente chaves Blue Jacket de `localStorage` e `sessionStorage` e solicita a exclusão dos bancos IndexedDB `blue-jacket-data` e `blue-jacket-customer-intelligence`. O reset não consulta os bancos antes de apagá-los e, portanto, não pode reintroduzir valores antigos.
