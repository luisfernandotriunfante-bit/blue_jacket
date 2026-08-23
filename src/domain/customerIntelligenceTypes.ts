export type AssortmentClassification = 'MANDATORIO' | 'IMPORTANTE' | 'RECOMENDADO' | 'FORA_DO_SORTIMENTO' | 'PENDENCIA_CORRESPONDENCIA';
export type OpportunityPriority = 'MAXIMA' | 'MUITO_ALTA' | 'ALTA' | 'MEDIA' | 'MIGRACAO' | 'DIAGNOSTICO' | 'BLOQUEIO_CADASTRO' | 'BLOQUEIO_DISPONIBILIDADE' | 'SEM_ACAO';
export type AvailabilityStatus = 'DISPONIVEL' | 'SOMENTE_CARTEIRA' | 'SEM_ESTOQUE' | 'SEM_WINTHOR' | 'DESCONTINUADO' | 'MIGRACAO';
export type LineageStatus = 'MIGRACAO_VIGENTE' | 'MIGRACAO_FUTURA' | 'DESCONTINUADO';
export type PromotionStatus = 'ATIVA' | 'FUTURA' | 'EXPIRADA' | 'SEM_FONTE_ESTRUTURADA';
export type CommercialPackagingSource = '8013' | '105_DERIVED' | 'PRICE_LIST' | 'TABELA_OFICIAL' | 'UNKNOWN' | 'CONFLICT';
export interface AssortmentRecommendation { channel:string; value:number; }
export interface OfficialAssortmentSku { ean:string; colgateSku:string; winthorCode:string; description:string; categoryMaster:string; category:string; subcategory:string; brand:string; subbrand:string; segment:string; subsegment:string; contents:string; amount:string; promoPack:string; launchLabel:string; lifecycleStatus:string; recommendations:AssortmentRecommendation[]; sourceSheet:string; }
export interface AssortmentCompetence { key:string; label:string; validFrom:string; validTo:string; sourceSheet:string; products:OfficialAssortmentSku[]; expectedTotalsByChannel:Record<string,{total:number;mandatory:number;important:number}>; }
export interface SkuLineageRecord { oldSku:string; oldEan:string; newSku:string; newEan:string; description:string; status:LineageStatus; effectiveFrom:string; sourceSheet:string; }
export interface CustomerCommercialProfile { cnpj:string; cnpjRaw:string; name:string; clientCode:string; network:string; environment:string; profile:string; tier:string; assortmentChannel:string; city:string; state:string; vendorCode:string; coordinatorCode:string; coordinatorName:string; source:string; }

/**
 * Linha agregada do relatório 310. Ela existe somente para reconciliação do Motor Histórico.
 * Não deve alimentar compra, adoção, vendedor ou valor comercial na tela ativa.
 */
export interface PurchaseHistory310 {
  cnpj:string; cnpjRaw:string;
  legacyProductCode?:string;
  /** @deprecated No 310 este campo representa o código legado do sistema anterior, nunca Código Winthor atual. */
  winthorCode:string;
  description:string; volumes:number; quantity:number; purchaseValue:number; returnVolume:number; returnValue:number; netValue:number; vendorCode:string; groupingCode:string; groupingDescription:string;
}

/**
 * Histórico comercial consumível pelo módulo, materializado exclusivamente do 379 canônico.
 * Identidades atuais só aparecem quando o Motor de Itens conseguiu resolvê-las.
 */
export interface HistoricalPurchaseRecord {
  cnpj:string;
  cnpjRaw:string;
  period:string;
  itemCanonicalId:string;
  legacyProductCode:string;
  ean:string;
  winthorCode:string;
  industrySku:string;
  description:string;
  grossSaleUnits:number;
  returnUnits:number;
  netSignedUnits:number;
  grossSalesValue:number;
  returnValue:number;
  netValue:number;
  purchaseInvoiceCount:number;
  legacyRcaCodes:string[];
  rcaCanonicalIds:string[];
  currentRcaCodes:string[];
  source:'379';
}

export interface PromotionRule { id:string; name:string; validFrom:string; validTo:string; environments:string[]; tiers:string[]; profiles:string[]; networks:string[]; cnpjs:string[]; eans:string[]; winthorCodes:string[]; minimumQuantity:number|null; minimumValue:number|null; requiredFamilies:string[]; discountPercent:number|null; benefit:string; note:string; source:string; status:PromotionStatus; }
export interface PricingRule { id:string; scope:'CNPJ'|'REDE'|'GERAL'; scopeKey:string; kind:'ACRESCIMO'|'RAPPEL'|'OUTRO'; value:number; validFrom:string; validTo:string; source:string; }
export interface CustomerIntelligenceSupport {
  schemaVersion:1; updatedAt:string; sources:Array<{kind:string;fileName:string;loadedAt:string;note:string}>;
  assortmentCompetences:AssortmentCompetence[]; lineage:SkuLineageRecord[]; customers:CustomerCommercialProfile[];
  /** 310: somente reconciliação. */
  purchases:PurchaseHistory310[];
  /** 379: única origem de histórico comercial para a tela ativa. */
  historicalPurchases:HistoricalPurchaseRecord[];
  promotions:PromotionRule[]; pricingRules:PricingRule[]; warnings:string[];
}
export interface CustomerSourceTrace { field:string; chosen:string; precedence:string; values:Array<{source:string;value:string}>; divergent:boolean; }
export interface CustomerResolvedProfile extends CustomerCommercialProfile { traces:CustomerSourceTrace[]; }
export interface ProductCommercialView { ean:string; winthorCode:string; colgateSku:string; description:string; category:string; subcategory:string; brand:string; assortmentValue:number|null; classification:AssortmentClassification; isRecommended:boolean; isLaunch:boolean; launchLabel:string; lineageStatus:LineageStatus|''; predecessorEan:string; successorEan:string; isDiscontinued:boolean; bought:boolean; purchaseQuantity:number; purchaseValue:number; returnValue:number; netValue:number; currentPeriodValue:number; physicalUnits:number; reservedUnits:number; availableUnits:number; portfolioCases:number; portfolioUnits:number; projectedUnits:number; unitsPerCase:number; unitsPerCaseSource:CommercialPackagingSource; availability:AvailabilityStatus; hasWinthor:boolean; promotionIds:string[]; basePrice:number|null; finalPrice:number|null; priceStatus:'BASE_DISPONIVEL'|'COMPOSICAO_FINAL_PENDENTE'|'SEM_PRECO'; opportunityPriority:OpportunityPriority; opportunityReason:string; recommendedAction:string; auditNotes:string[]; }
export interface LaunchAdoptionSummary { totalRecommended:number; adopted:number; missing:number; availableNow:number; portfolioOnly:number; withoutWinthor:number; withoutStockAndPortfolio:number; }
export interface CustomerIntelligenceAuditCheck { id:string; label:string; expected:number|string|null; calculated:number|string|null; status:'OK'|'DIVERGENT'|'BLOCKED'; note:string; }
export interface CustomerIntelligenceResult {
  referenceDate:string; competenceKey:string; competenceLabel:string; customer:CustomerResolvedProfile; officialAssortment:number; executableAssortment:number; assortmentBought:number; assortmentPercent:number; mandatoryRecommended:number; mandatoryBought:number; importantRecommended:number; importantBought:number; recommendedMissing:number; boughtOutside:number; boughtUnresolved:number; ytdNetValue:number; opportunitiesAvailableNow:number; opportunitiesPortfolioOnly:number; blockedByStock:number; blockedByRegistration:number; launches:LaunchAdoptionSummary; products:ProductCommercialView[]; opportunities:ProductCommercialView[]; launchesProducts:ProductCommercialView[]; boughtOutsideProducts:ProductCommercialView[]; promotions:PromotionRule[]; audit:CustomerIntelligenceAuditCheck[]; limitations:string[];
  missingRecommended?:number; launchAdoption?:LaunchAdoptionSummary; audits?:CustomerIntelligenceAuditCheck[]; warnings?:string[];
}
export const EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT:CustomerIntelligenceSupport={schemaVersion:1,updatedAt:'',sources:[],assortmentCompetences:[],lineage:[],customers:[],purchases:[],historicalPurchases:[],promotions:[],pricingRules:[],warnings:[]};