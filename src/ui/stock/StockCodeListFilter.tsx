import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { extractStockCodes, matchedStockCodes } from '../../domain/stockCodeFilter';

type StockProductRef = { codigo?: string; factoryCode?: string; ean?: string };

type Props = {
  products: StockProductRef[];
  codes: Set<string>;
  onChange: (codes: Set<string>) => void;
};

export function StockCodeListFilter({ products, codes, onChange }: Props) {
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const matchedCount = useMemo(() => matchedStockCodes(products, codes).size, [products, codes]);
  const missingCount = Math.max(codes.size - matchedCount, 0);

  const importFile = async (file: File) => {
    try {
      setError('');
      const lowerName = file.name.toLowerCase();
      let values: unknown[] = [];

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        const rows = firstSheet
          ? XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' }) as unknown[][]
          : [];
        values = rows.flat();
      } else {
        values = [(await file.text())];
      }

      const imported = extractStockCodes(values);
      if (!imported.size) {
        setFileName('');
        onChange(new Set());
        setError('Nenhum código válido foi encontrado no arquivo.');
        return;
      }

      setFileName(file.name);
      onChange(imported);
    } catch {
      setFileName('');
      onChange(new Set());
      setError('Não foi possível ler a lista de códigos.');
    }
  };

  const clearList = () => {
    setFileName('');
    setError('');
    onChange(new Set());
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <label className="panel-secondary-button" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
        Importar lista de códigos
        <input
          aria-label="Importar lista de códigos do estoque"
          type="file"
          accept=".txt,.csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </label>

      {codes.size > 0 ? (
        <>
          <span className="panel-badge" title={fileName || 'Lista importada'}>
            LISTA · {matchedCount}/{codes.size} ENCONTRADOS
          </span>
          {missingCount > 0 ? <span style={{ color: '#fca5a5', fontSize: '0.7rem' }}>{missingCount} não encontrado{missingCount === 1 ? '' : 's'}</span> : null}
          <button type="button" className="panel-secondary-button" onClick={clearList}>Remover lista</button>
        </>
      ) : null}

      {error ? <span style={{ color: '#fca5a5', fontSize: '0.7rem' }}>{error}</span> : null}
    </div>
  );
}
