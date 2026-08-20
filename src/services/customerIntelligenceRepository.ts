import type { CustomerIntelligenceSupport } from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';
import {
  detectCustomerIntelligenceSource,
  mergeCustomerIntelligenceSupport,
  parseCustomerAndPurchaseWorkbook,
  parseOfficialAssortmentWorkbook,
  readCustomerIntelligenceWorkbook,
} from './customerIntelligenceSources';

const STORAGE_KEY = 'bj_customer_intelligence_v1';

export function loadCustomerIntelligenceSupport(storage: Pick<Storage, 'getItem'>): CustomerIntelligenceSupport {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
    const parsed = JSON.parse(raw) as CustomerIntelligenceSupport;
    return { ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, ...parsed, schemaVersion: 1 };
  } catch {
    return EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  }
}

export function saveCustomerIntelligenceSupport(storage: Pick<Storage, 'setItem'>, support: CustomerIntelligenceSupport) {
  storage.setItem(STORAGE_KEY, JSON.stringify(support));
}

export async function processCustomerIntelligenceFiles(files: File[], previous: CustomerIntelligenceSupport | null): Promise<CustomerIntelligenceSupport> {
  let result = previous || EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  for (const file of files) {
    const workbook = await readCustomerIntelligenceWorkbook(file);
    const kind = detectCustomerIntelligenceSource(workbook);
    if (kind === 'OFFICIAL_ASSORTMENT') {
      const parsed = parseOfficialAssortmentWorkbook(workbook);
      result = mergeCustomerIntelligenceSupport(result, {
        assortmentCompetences: parsed.competences,
        lineage: parsed.lineage,
        source: { kind, fileName: file.name, note: `${parsed.competences.length} competência(s) oficial(is); ${parsed.lineage.length} vínculo(s) de migração/descontinuação.` },
      });
      continue;
    }
    if (kind === 'PURCHASE_310') {
      const parsed = parseCustomerAndPurchaseWorkbook(workbook);
      result = mergeCustomerIntelligenceSupport(result, {
        purchases: parsed.purchases,
        customers: parsed.customers,
        source: { kind, fileName: file.name, note: `${parsed.purchases.length} combinação(ões) CNPJ × SKU consolidadas; ${parsed.customers.length} perfil(is) de cliente.` },
      });
      continue;
    }
    if (kind === 'PROTOTYPE') {
      result = mergeCustomerIntelligenceSupport(result, {
        source: { kind, fileName: file.name, note: 'Planilha auxiliar registrada somente como referência funcional. Não substitui o Sortimento Oficial vigente e suas promoções não foram ativadas como fonte oficial.' },
      });
      continue;
    }
    result = mergeCustomerIntelligenceSupport(result, {
      source: { kind: `UNKNOWN:${file.name}`, fileName: file.name, note: 'Arquivo não reconhecido pelo módulo Clientes & Sortimento; nenhum dado foi aplicado.' },
      warnings: [`${file.name}: fonte não reconhecida; nenhum dado foi aplicado.`],
    });
  }
  return result;
}
