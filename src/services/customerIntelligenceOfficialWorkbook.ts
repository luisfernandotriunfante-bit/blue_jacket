import * as XLSX from 'xlsx';
import { normalizeText } from './canonical/utils';

function julySheetName(workbook: XLSX.WorkBook): string | undefined {
  return workbook.SheetNames.find(name => {
    const normalized = normalizeText(name);
    return normalized.includes('JUL26') && (normalized.includes('SORTIMENTO') || normalized.includes('BASE'));
  });
}

function augSepSheetName(workbook: XLSX.WorkBook): string | undefined {
  return workbook.SheetNames.find(name => {
    const normalized = normalizeText(name);
    return normalized.includes('AGO')
      && (normalized.includes('SET26') || normalized.includes('SET 26') || normalized.includes('SETEMBRO'))
      && (normalized.includes('SORTIMENTO') || normalized.includes('BASE'));
  });
}

export function officialAssortmentCoverage(workbook: XLSX.WorkBook): {
  hasJuly: boolean;
  hasAugSep: boolean;
  julySheet: string;
  augSepSheet: string;
} {
  const julySheet = julySheetName(workbook) || '';
  const augSepSheet = augSepSheetName(workbook) || '';
  return { hasJuly: Boolean(julySheet), hasAugSep: Boolean(augSepSheet), julySheet, augSepSheet };
}

/**
 * O parser oficial já valida o conteúdo das abas. Esta função apenas cria
 * aliases em memória para variações legítimas de nomes de aba encontradas nos
 * arquivos reais, sem mudar valores nem inventar competência.
 */
export function normalizeOfficialAssortmentWorkbook(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const coverage = officialAssortmentCoverage(workbook);
  if (!coverage.hasJuly || !coverage.hasAugSep) return workbook;

  const canonicalJuly = 'Jul26 - Base_Sortimento_Nacional';
  const canonicalAugSep = 'Ago & Set26 - Base_Sortimento_Nacional';
  const sheets = { ...workbook.Sheets };
  const sheetNames = [...workbook.SheetNames];

  if (!sheets[canonicalJuly]) {
    sheets[canonicalJuly] = sheets[coverage.julySheet];
    sheetNames.push(canonicalJuly);
  }
  if (!sheets[canonicalAugSep]) {
    sheets[canonicalAugSep] = sheets[coverage.augSepSheet];
    sheetNames.push(canonicalAugSep);
  }

  return { ...workbook, SheetNames: sheetNames, Sheets: sheets };
}
