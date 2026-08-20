import type { AssortmentClassification, OpportunityPriority } from './customerIntelligenceTypes';

export interface CommercialOpportunityInput {
  classification: AssortmentClassification;
  bought: boolean;
  isLaunch: boolean;
  hasWinthor: boolean;
  availableUnits: number;
  portfolioUnits: number;
  hasPromotion: boolean;
  lineageStatus: string;
  isDiscontinued: boolean;
}

export interface CommercialOpportunityDecision {
  priority: OpportunityPriority;
  reason: string;
  action: string;
}

function recommended(classification: AssortmentClassification) {
  return classification === 'MANDATORIO' || classification === 'IMPORTANTE' || classification === 'RECOMENDADO';
}

export function classifyCommercialOpportunity(input: CommercialOpportunityInput): CommercialOpportunityDecision {
  const { classification, bought, isLaunch, hasWinthor, availableUnits, portfolioUnits, hasPromotion, lineageStatus, isDiscontinued } = input;
  if (lineageStatus === 'MIGRACAO_VIGENTE' && bought) return { priority: 'MIGRACAO', reason: 'Cliente possui compra do SKU anterior e o sucessor já está vigente.', action: 'Migrar a oferta para o SKU atual.' };
  if (isDiscontinued && bought) return { priority: 'DIAGNOSTICO', reason: 'Cliente possui histórico de produto descontinuado.', action: 'Não recomprar automaticamente; avaliar substituto vigente.' };
  if (classification === 'FORA_DO_SORTIMENTO' && bought) return { priority: 'DIAGNOSTICO', reason: 'Produto comprado não pertence ao sortimento vigente do cliente.', action: 'Revisar recorrência e necessidade comercial.' };
  if (!recommended(classification) || bought) return { priority: 'SEM_ACAO', reason: '', action: '' };
  if (!hasWinthor) return { priority: 'BLOQUEIO_CADASTRO', reason: 'Produto recomendado ainda sem cadastro Winthor conciliado.', action: 'Regularizar cadastro antes de cobrar execução do vendedor.' };
  if (availableUnits > 0 && isLaunch) return { priority: 'MAXIMA', reason: 'Lançamento recomendado, nunca comprado e disponível agora.', action: 'Ofertar agora.' };
  if (availableUnits > 0 && classification === 'MANDATORIO') return { priority: 'MAXIMA', reason: 'Mandatório, nunca comprado e disponível agora.', action: 'Fechar lacuna prioritária do sortimento.' };
  if (portfolioUnits > 0 && isLaunch) return { priority: 'MUITO_ALTA', reason: 'Lançamento recomendado e ainda não comprado, com entrada prevista em Carteira.', action: 'Preparar oferta e acompanhar entrada.' };
  if (hasPromotion) return { priority: 'MUITO_ALTA', reason: 'Produto recomendado nunca comprado com promoção estruturada elegível.', action: 'Usar a promoção na abordagem comercial.' };
  if (availableUnits <= 0 && portfolioUnits <= 0) return { priority: 'BLOQUEIO_DISPONIBILIDADE', reason: 'Produto recomendado sem estoque disponível e sem Carteira.', action: 'Aguardar disponibilidade; não tratar como falha do vendedor.' };
  if (classification === 'IMPORTANTE') return { priority: 'ALTA', reason: 'Produto importante ainda não comprado.', action: 'Priorizar inclusão no próximo pedido.' };
  return { priority: 'MEDIA', reason: 'Produto recomendado ainda não comprado.', action: 'Trabalhar expansão de mix.' };
}
