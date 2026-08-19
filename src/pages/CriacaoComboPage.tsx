import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { comboDiscount, parseComboPrice, selectComboProducts } from '../domain/comboPricing';
import { useData } from '../store/DataContext';
import { StockCodeListFilter } from '../ui/stock/StockCodeListFilter';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function CriacaoComboPage() {
  const { produtos } = useData();
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());
  const [practicedPrices, setPracticedPrices] = useState<Record<string, string>>({});

  // Para criação de combo, "encontrado" significa item efetivamente disponível no 105:
  // código Winthor confirmado + preço de venda/tabela válido.
  const tableProducts = useMemo(
    () => produtos.filter(product => product.hasWinthor === true && Number.isFinite(product.vendaUnitario) && product.vendaUnitario > 0),
    [produtos],
  );

  const comboProducts = useMemo(
    () => selectComboProducts(tableProducts, importedCodes),
    [tableProducts, importedCodes],
  );

  const filledCount = useMemo(
    () => comboProducts.filter(product => parseComboPrice(practicedPrices[product.codigo] || '') !== null).length,
    [comboProducts, practicedPrices],
  );

  const canExport = comboProducts.length > 0 && filledCount === comboProducts.length;

  const changeImportedCodes = (codes: Set<string>) => {
    setImportedCodes(codes);
    setPracticedPrices({});
  };

  const updatePracticedPrice = (code: string, value: string) => {
    setPracticedPrices(current => ({ ...current, [code]: value }));
  };

  const clearPrices = () => setPracticedPrices({});

  const downloadExcel = () => {
    if (!canExport) return;

    const rows: Array<Array<string | number>> = [
      ['Código do Item Winthor', 'Descrição Produto', 'Preço de Tabela', 'Preço Praticado', '% de Desconto'],
      ...comboProducts.map(product => {
        const practiced = parseComboPrice(practicedPrices[product.codigo] || '') as number;
        const discount = comboDiscount(product.vendaUnitario, practiced) as number;
        return [product.codigo, product.descricao, product.vendaUnitario, practiced, discount];
      }),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 52 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
    ];
    worksheet['!autofilter'] = { ref: `A1:E${rows.length}` };

    for (let row = 2; row <= rows.length; row += 1) {
      const tableCell = worksheet[`C${row}`];
      const practicedCell = worksheet[`D${row}`];
      const discountCell = worksheet[`E${row}`];
      if (tableCell) tableCell.z = 'R$ #,##0.00';
      if (practicedCell) practicedCell.z = 'R$ #,##0.00';
      if (discountCell) discountCell.z = '0.00%';
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Criação de Combo');
    XLSX.writeFile(workbook, 'criacao-de-combo.xlsx');
  };

  if (!tableProducts.length) {
    return (
      <PanelPage title="Criação de Combo">
        <PanelEmptyState
          icon="◆"
          title="Preço de tabela indisponível"
          description="Carregue a Posição 105 e o Cadastro 286 em Configurações. Esta tela usa exclusivamente o preço de venda do 105 como preço de tabela."
        />
      </PanelPage>
    );
  }

  return (
    <PanelPage title="Criação de Combo">
      <div className="panel-stack">
        <PanelCard>
          <PanelSectionHeader
            eyebrow="ATIVIDADES"
            title="Criação de Combo"
            description="Importe uma lista de EANs, códigos Winthor ou códigos de fábrica. O preço de tabela vem exclusivamente da Posição 105."
            action={<span className="panel-badge">PREÇO TABELA · 105</span>}
          />

          <div className="panel-toolbar" style={{ marginBottom: '14px', alignItems: 'center' }}>
            <StockCodeListFilter products={tableProducts} codes={importedCodes} onChange={changeImportedCodes} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {comboProducts.length > 0 ? <span className="panel-badge">PREÇOS · {filledCount}/{comboProducts.length}</span> : null}
              <button type="button" className="panel-secondary-button" onClick={clearPrices} disabled={filledCount === 0}>Limpar preços</button>
              <button type="button" className="panel-secondary-button" onClick={downloadExcel} disabled={!canExport}>Gerar Excel</button>
            </div>
          </div>

          <div style={{ color: 'var(--panel-muted)', fontSize: '0.74rem', marginBottom: '16px' }}>
            Para entrar no combo, o item precisa ter código Winthor e preço de tabela válido no 105. O desconto é calculado por item como (Preço de Tabela − Preço Praticado) ÷ Preço de Tabela.
          </div>

          {!importedCodes.size ? (
            <PanelEmptyState
              icon="◆"
              title="Importe os itens do combo"
              description="Use o mesmo formato de lista do Estoque: TXT, CSV, XLS ou XLSX com EANs ou códigos dos produtos."
            />
          ) : comboProducts.length === 0 ? (
            <PanelEmptyState
              icon="◆"
              title="Nenhum item com preço no 105"
              description="Os códigos importados não encontraram itens com código Winthor e preço de tabela disponível na Posição 105."
            />
          ) : (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Código Winthor</th>
                    <th>Produto</th>
                    <th className="is-right">Preço de Tabela</th>
                    <th className="is-right">Preço Praticado</th>
                    <th className="is-right">% de Desconto</th>
                  </tr>
                </thead>
                <tbody>
                  {comboProducts.map(product => {
                    const practicedRaw = practicedPrices[product.codigo] || '';
                    const practiced = parseComboPrice(practicedRaw);
                    const discount = comboDiscount(product.vendaUnitario, practiced);
                    return (
                      <tr key={product.codigo}>
                        <td className="is-strong">{product.codigo}</td>
                        <td>
                          <div className="is-strong">{product.descricao}</div>
                          {product.ean ? <div className="is-muted" style={{ marginTop: '3px', fontSize: '0.7rem' }}>EAN {product.ean}</div> : null}
                        </td>
                        <td className="is-right is-strong">{formatCurrency(product.vendaUnitario)}</td>
                        <td className="is-right">
                          <input
                            className="panel-input"
                            aria-label={`Preço praticado ${product.codigo}`}
                            inputMode="decimal"
                            value={practicedRaw}
                            placeholder="0,00"
                            onChange={event => updatePracticedPrice(product.codigo, event.target.value)}
                            style={{ width: '132px', minHeight: '34px', textAlign: 'right', padding: '6px 8px' }}
                          />
                        </td>
                        <td className="is-right">
                          {discount === null ? (
                            <span className="is-muted">—</span>
                          ) : (
                            <span className="is-strong" style={{ color: discount >= 0 ? 'var(--panel-text)' : '#fca5a5' }}>{formatPercent(discount)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      </div>
    </PanelPage>
  );
}
