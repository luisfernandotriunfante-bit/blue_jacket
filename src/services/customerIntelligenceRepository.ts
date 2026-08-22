import type { CustomerIntelligenceSupport } from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';
import { enrichAssortmentWith322 } from './customerIntelligence322';
import { filterCustomerProfilesByDeclaredCnpj } from './customerIntelligenceCustomers';
import {
  classifyExternalCustomerSource,
  externalCustomerSourceNote,
  isPurchase310Text,
  parsePurchase310Text,
} from './customerIntelligence310Text';
import { hasStandaloneCustomerProfile, parseStandaloneCustomerProfiles } from './customerIntelligenceProfiles';
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro desconhecido de persistência';
    return {
      ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
      warnings: [`Persistência Clientes & Sortimento: falha ao restaurar a base anterior (${detail}). O sistema não tratou silenciosamente essa falha como se nunca houvesse dados; recarregue as fontes antes de usar resultados comerciais.`],
    };
  }
}

export async function saveCustomerIntelligenceSupport(support: CustomerIntelligenceSupport): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(support, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar Clientes & Sortimento no IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Persistência de Clientes & Sortimento foi abortada.'));
  });
  db.close();
}

export function removeCustomerIntelligenceSource(support: CustomerIntelligenceSupport, sourceKind: string): CustomerIntelligenceSupport {
  const source = support.sources.find(item => item.kind === sourceKind);
  if (!source) return support;

  const matchesSource = (value: string) => value === source.kind || value === source.fileName;
  const next: CustomerIntelligenceSupport = {
    ...support,
    updatedAt: new Date().toISOString(),
    sources: support.sources.filter(item => item.kind !== sourceKind),
    warnings: support.warnings.filter(warning => !warning.includes(source.fileName)),
    promotions: support.promotions.filter(rule => !matchesSource(rule.source)),
    pricingRules: support.pricingRules.filter(rule => !matchesSource(rule.source)),
  };

  if (sourceKind === 'OFFICIAL_ASSORTMENT') {
    next.assortmentCompetences = [];
    next.lineage = [];
  }
  if (sourceKind === 'PURCHASE_310') next.purchases = [];
  if (sourceKind === 'CUSTOMER_PROFILE') next.customers = [];

  return next;
}

export async function deleteCustomerIntelligenceSource(support: CustomerIntelligenceSupport, sourceKind: string): Promise<CustomerIntelligenceSupport> {
  const next = removeCustomerIntelligenceSource(support, sourceKind);
  if (next === support) return support;
  await saveCustomerIntelligenceSupport(next);
  return next;
}

function isTextLikeFile(file: File): boolean {
  return /\.(txt|csv)$/i.test(file.name) || String(file.type || '').toLowerCase().startsWith('text/');
}

function externalSourceKind(fileName: string, kind: string): string {
  return `GLOBAL:${kind}:${fileName}`;
}

function appendUnknown(result: CustomerIntelligenceSupport, fileName: string): CustomerIntelligenceSupport {
  return mergeCustomerIntelligenceSupport(result, {
    source: { kind: `UNKNOWN:${fileName}`, fileName, note: 'Arquivo não reconhecido pelo módulo Clientes & Sortimento; nenhum dado foi aplicado.' },
    warnings: [`${fileName}: fonte não reconhecida; nenhum dado foi aplicado.`],
  });
}

function appendProcessingError(result: CustomerIntelligenceSupport, fileName: string, error: unknown): CustomerIntelligenceSupport {
  const detail = error instanceof Error ? error.message : 'erro desconhecido';
  return mergeCustomerIntelligenceSupport(result, {
    source: { kind: `ERROR:${fileName}`, fileName, note: `Falha ao processar: ${detail}` },
    warnings: [`${fileName}: falha ao processar (${detail}). As demais fontes selecionadas continuaram sendo processadas.`],
  });
}

function mergeCustomerProfileWorkbook(result: CustomerIntelligenceSupport, workbook: Awaited<ReturnType<typeof readCustomerIntelligenceWorkbook>>, fileName: string): CustomerIntelligenceSupport {
  if (!hasStandaloneCustomerProfile(workbook)) return result;
  const parsed = parseStandaloneCustomerProfiles(workbook);
  return mergeCustomerIntelligenceSupport(result, {
    customers: parsed.customers,
    source: {
      kind: 'CUSTOMER_PROFILE',
      fileName,
      note: `${parsed.customers.length} CNPJ(s) com Ambiente, Perfil, Faixa, Rede e canal de sortimento; ${parsed.rejectedIdentifiers} identificador(es) inválido(s) rejeitado(s). Fonte: ${parsed.sourceSheet}.`,
    },
  });
}

export async function processCustomerIntelligenceFiles(files: File[], previous: CustomerIntelligenceSupport | null): Promise<CustomerIntelligenceSupport> {
  let result = previous || EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;

  for (const file of files) {
    try {
      if (isTextLikeFile(file)) {
        const text = await file.text();
        if (isPurchase310Text(text, file.name)) {
          const parsed = parsePurchase310Text(text);
          result = mergeCustomerIntelligenceSupport(result, {
            purchases: parsed.purchases,
            // O 310 TXT não contém Ambiente/Faixa/Rede. Portanto ele nunca pode
            // apagar uma base de clientes válida carregada separadamente.
            source: {
              kind: 'PURCHASE_310',
              fileName: file.name,
              note: `${parsed.parsedLines} linha(s) de produto lida(s); ${parsed.purchases.length} combinação(ões) CNPJ × SKU consolidadas; ${parsed.rejectedIdentifiers} identificador(es) CPF/inválido(s) excluído(s). A segmentação do cliente permanece na fonte CUSTOMER_PROFILE/global.`,
            },
          });
          continue;
        }

        const externalKind = classifyExternalCustomerSource(file.name);
        if (externalKind) {
          result = mergeCustomerIntelligenceSupport(result, {
            source: {
              kind: externalSourceKind(file.name, externalKind),
              fileName: file.name,
              note: externalCustomerSourceNote(externalKind),
            },
          });
          continue;
        }

        result = appendUnknown(result, file.name);
        continue;
      }

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
        result = mergeCustomerProfileWorkbook(result, workbook, file.name);
        continue;
      }

      if (kind === 'PURCHASE_310') {
        const parsed = parseCustomerAndPurchaseWorkbook(workbook);
        result = mergeCustomerIntelligenceSupport(result, {
          purchases: parsed.purchases,
          source: { kind, fileName: file.name, note: `${parsed.purchases.length} combinação(ões) CNPJ × SKU consolidadas.` },
        });
        if (hasStandaloneCustomerProfile(workbook)) {
          const validatedCustomers = filterCustomerProfilesByDeclaredCnpj(workbook, parsed.customers);
          result = mergeCustomerIntelligenceSupport(result, {
            customers: validatedCustomers.customers,
            source: { kind: 'CUSTOMER_PROFILE', fileName: file.name, note: `${validatedCustomers.customers.length} perfil(is) CNPJ válido(s); ${validatedCustomers.removedInvalidType} perfil(is) removido(s) por TIPO CPF/código inválido.` },
          });
        }
        continue;
      }

      if (kind === 'PROTOTYPE') {
        result = mergeCustomerIntelligenceSupport(result, {
          source: { kind, fileName: file.name, note: 'Planilha auxiliar registrada somente como referência funcional. Não substitui o Sortimento Oficial vigente e suas promoções não foram ativadas como fonte oficial.' },
        });
        result = mergeCustomerProfileWorkbook(result, workbook, file.name);
        continue;
      }

      if (hasStandaloneCustomerProfile(workbook)) {
        result = mergeCustomerProfileWorkbook(result, workbook, file.name);
        continue;
      }

      const externalKind = classifyExternalCustomerSource(file.name);
      if (externalKind) {
        result = mergeCustomerIntelligenceSupport(result, {
          source: {
            kind: externalSourceKind(file.name, externalKind),
            fileName: file.name,
            note: externalCustomerSourceNote(externalKind),
          },
        });
        continue;
      }

      result = appendUnknown(result, file.name);
    } catch (error) {
      // Uma fonte ruim não deve bloquear todas as outras selecionadas no mesmo upload.
      result = appendProcessingError(result, file.name, error);
    }
  }

  return result;
}
