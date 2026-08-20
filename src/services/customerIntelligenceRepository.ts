import type { CustomerIntelligenceSupport } from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';
import { enrichAssortmentWith322 } from './customerIntelligence322';
import { filterCustomerProfilesByDeclaredCnpj } from './customerIntelligenceCustomers';
import {
  detectCustomerIntelligenceSource,
  mergeCustomerIntelligenceSupport,
  parseCustomerAndPurchaseWorkbook,
  parseOfficialAssortmentWorkbook,
  readCustomerIntelligenceWorkbook,
} from './customerIntelligenceSources';

const DB_NAME = 'blue-jacket-customer-intelligence';
const STORE_NAME = 'support';
const RECORD_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB não disponível neste navegador.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
  });
}

export async function loadCustomerIntelligenceSupport(): Promise<CustomerIntelligenceSupport> {
  try {
    const db = await openDb();
    const value = await new Promise<CustomerIntelligenceSupport | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result as CustomerIntelligenceSupport | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value ? { ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, ...value, schemaVersion: 1 } : EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  } catch {
    return EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  }
}

export async function saveCustomerIntelligenceSupport(support: CustomerIntelligenceSupport): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(support, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function processCustomerIntelligenceFiles(files: File[], previous: CustomerIntelligenceSupport | null): Promise<CustomerIntelligenceSupport> {
  let result = previous || EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  for (const file of files) {
    const workbook = await readCustomerIntelligenceWorkbook(file);
    const kind = detectCustomerIntelligenceSource(workbook);
    if (kind === 'OFFICIAL_ASSORTMENT') {
      const parsed = parseOfficialAssortmentWorkbook(workbook);
      const auxiliary322 = enrichAssortmentWith322(workbook, parsed.competences);
      result = mergeCustomerIntelligenceSupport(result, {
        assortmentCompetences: auxiliary322.competences,
        lineage: parsed.lineage,
        source: { kind, fileName: file.name, note: `${parsed.competences.length} competência(s) oficial(is); ${parsed.lineage.length} vínculo(s) de migração/descontinuação; ${auxiliary322.matchedByEan} correspondência(s) complementada(s) pelo 322 sem alterar recomendação.` },
      });
      continue;
    }
    if (kind === 'PURCHASE_310') {
      const parsed = parseCustomerAndPurchaseWorkbook(workbook);
      const validatedCustomers = filterCustomerProfilesByDeclaredCnpj(workbook, parsed.customers);
      result = mergeCustomerIntelligenceSupport(result, {
        purchases: parsed.purchases,
        customers: validatedCustomers.customers,
        source: { kind, fileName: file.name, note: `${parsed.purchases.length} combinação(ões) CNPJ × SKU consolidadas; ${validatedCustomers.customers.length} perfil(is) CNPJ válido(s); ${validatedCustomers.removedInvalidType} perfil(is) removido(s) por TIPO CPF/código inválido.` },
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
