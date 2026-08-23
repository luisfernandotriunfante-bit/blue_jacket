import * as XLSX from 'xlsx';
import { normalizeCnpj, normalizeText, parseNumber } from './canonical/utils';
import type { AssortmentCompetence, CustomerCommercialProfile, CustomerIntelligenceSupport, OfficialAssortmentSku, PurchaseHistory310, SkuLineageRecord } from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';

const cleanDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const text = (value: unknown) => String(value ?? '').trim();

export function channelFromTier(value: string): string {
  const tier = normalizeText(value).replace(/\s+/g, ' ');
  if (tier.includes('FAIXA 1') || tier === '1') return 'Hiper';
  if (tier.includes('FAIXA 2') || tier === '2') return 'Super G';
  if (tier.includes('FAIXA 3') || tier === '3') return 'Super P';
  if (tier.includes('FAIXA 4') || tier === '4') return 'Vizinhança GDE';
  if (tier.includes('FAIXA 5') || tier === '5') return 'Vizinhança PEQ';
  if (tier.includes('FAIXA 6') || tier === '6') return 'Tradicional Independente';
  return '';
}

function sheetRows(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true }) : [];
}

function findHeader(rows: unknown[][], required: string[]) {
  return rows.findIndex(row => {
    const normalized = row.map(normalizeText);
    return required.every(item => normalized.some(value => value.includes(item)));
  });
}

function parseControls(rows: unknown[][], headerIndex: number, channels: string[]) {
  const result:Record<string,{total:number;mandatory:number;important:number}> = {};
  const header = rows[headerIndex] || [];
  channels.forEach(channel => result[channel] = { total: 0, mandatory: 0, important: 0 });
  rows.slice(0, headerIndex).forEach(row => {
    const label = normalizeText(row.find(value => normalizeText(value).includes('TOTAL SKUS')) || '');
    if (!label) return;
    channels.forEach(channel => {
      const column = header.findIndex(value => normalizeText(value) === normalizeText(channel));
      if (column < 0) return;
      const value = Math.max(parseNumber(row[column]), 0);
      if (label.includes('MANDATOR')) result[channel].mandatory = value;
      else if (label.includes('IMPORTANTE')) result[channel].important = value;
      else result[channel].total = value;
    });
  });
  return result;
}

function parseStandardAssortmentSheet(workbook:XLSX.WorkBook, sheetName:string, key:string, label:string, validFrom:string, validTo:string):AssortmentCompetence|null {
  const rows=sheetRows(workbook,sheetName); const headerIndex=findHeader(rows,['EAN','DESCR']);
  if(headerIndex<0)return null;
  const header=rows[headerIndex].map(normalizeText);
  const col=(...names:string[])=>header.findIndex(value=>names.some(name=>value===normalizeText(name)||value.includes(normalizeText(name))));
  const eanCol=col('EAN'); const skuCol=col('COD'); const descriptionCol=col('DESCRIÇÃO','DESCRICAO'); const statusCol=col('STATUS'); const launchCol=col('LANÇAMENTO','LANCAMENTO');
  const fixed=new Set([statusCol,skuCol,eanCol,descriptionCol,launchCol,col('CATEGORIA MASTER'),col('CATEGORIA'),col('SUBCATEGORIA'),col('MARCA'),col('SUBMARCA'),col('SEGMENTO'),col('SUBSEGMENTO'),col('CONTENTS'),col('AMOUNT'),col('PROMO')].filter(index=>index>=0));
  const channels=header.map((value,index)=>({value:String(rows[headerIndex][index]??'').trim(),index})).filter(item=>item.value&&!fixed.has(item.index)&&item.index>descriptionCol).map(item=>item.value);
  const expectedTotalsByChannel=parseControls(rows,headerIndex,channels);
  const products:OfficialAssortmentSku[]=[];
  for(let r=headerIndex+1;r<rows.length;r++){
    const row=rows[r]; const ean=cleanDigits(row[eanCol]); if(!ean)continue;
    const recommendations=channels.map(channel=>({channel,value:parseNumber(row[header.findIndex(value=>normalizeText(value)===normalizeText(channel))])}));
    products.push({ean,colgateSku:cleanCode(row[skuCol]),winthorCode:'',description:text(row[descriptionCol]),categoryMaster:text(row[col('CATEGORIA MASTER')]),category:text(row[col('CATEGORIA')]),subcategory:text(row[col('SUBCATEGORIA')]),brand:text(row[col('MARCA')]),subbrand:text(row[col('SUBMARCA')]),segment:text(row[col('SEGMENTO')]),subsegment:text(row[col('SUBSEGMENTO')]),contents:text(row[col('CONTENTS')]),amount:text(row[col('AMOUNT')]),promoPack:text(row[col('PROMO')]),launchLabel:text(row[launchCol]),lifecycleStatus:text(row[statusCol])||'ATIVO',recommendations,sourceSheet:sheetName});
  }
  return{key,label,validFrom,validTo,sourceSheet:sheetName,products,expectedTotalsByChannel};
}

export function parseOfficialAssortmentWorkbook(workbook:XLSX.WorkBook):{competences:AssortmentCompetence[];lineage:SkuLineageRecord[];warnings:string[]} {
  const competences:AssortmentCompetence[]=[];const lineage:SkuLineageRecord[]=[];const warnings:string[]=[];
  const july=workbook.SheetNames.find(name=>{const n=normalizeText(name);return n.includes('JUL26')&&n.includes('SORTIMENTO')});
  const aug=workbook.SheetNames.find(name=>{const n=normalizeText(name);return n.includes('AGO')&&n.includes('SET26')&&n.includes('SORTIMENTO')&&!n.includes('HAIR')});
  if(july){const parsed=parseStandardAssortmentSheet(workbook,july,'2026-07','Julho/26','2026-07-01','2026-07-31');if(parsed)competences.push(parsed)}
  if(aug){const parsed=parseStandardAssortmentSheet(workbook,aug,'2026-08_09','Agosto/Setembro/26','2026-08-01','2026-09-30');if(parsed)competences.push(parsed)}
  const hair=workbook.SheetNames.find(name=>{const n=normalizeText(name);return n.includes('HAIR')&&n.includes('AGO')});
  if(hair){
    const rows=sheetRows(workbook,hair);const hi=findHeader(rows,['COD ANTIGO','EAN ANTIGO','COD NOVO','EAN NOVO']);
    if(hi>=0){const h=rows[hi].map(normalizeText);const c=(v:string)=>h.findIndex(x=>x.includes(normalizeText(v)));
      for(let r=hi+1;r<rows.length;r++){const row=rows[r];const oldSku=cleanCode(row[c('COD ANTIGO')]);const oldEan=cleanDigits(row[c('EAN ANTIGO')]);const newSku=cleanCode(row[c('COD NOVO')]);const newEan=cleanDigits(row[c('EAN NOVO')]);if(!oldSku&&!oldEan&&!newSku&&!newEan)continue;
        lineage.push({oldSku,oldEan,newSku,newEan,description:text(row[c('DESCRIÇÃO')]),status:'MIGRACAO_VIGENTE',effectiveFrom:'2026-08-01',sourceSheet:hair});
        const target=competences.find(item=>item.key==='2026-08_09');
        if(target&&newEan){const product:OfficialAssortmentSku={ean:newEan,colgateSku:newSku,winthorCode:'',description:text(row[c('DESCRIÇÃO')]),categoryMaster:text(row[c('CATEGORIA MASTER')]),category:text(row[c('CATEGORIA')]),subcategory:text(row[c('SUBCATEGORIA')]),brand:text(row[c('MARCA')]),subbrand:text(row[c('SUBMARCA')]),segment:text(row[c('SEGMENTO')]),subsegment:text(row[c('SUBSEGMENTO')]),contents:text(row[c('CONTENTS')]),amount:text(row[c('AMOUNT')]),promoPack:text(row[c('PROMO')]),launchLabel:text(row[c('LANÇAMENTO')]),lifecycleStatus:text(row[c('STATUS')])||'ATIVO',recommendations:Object.keys(target.expectedTotalsByChannel).map(channel=>({channel,value:parseNumber(row[h.findIndex(x=>normalizeText(x)===normalizeText(channel))])})),sourceSheet:hair}; const index=target.products.findIndex(item=>item.ean===newEan);if(index>=0)target.products[index]=product;else target.products.push(product)}
      }
    }
  }
  const discontinued=workbook.SheetNames.find(name=>normalizeText(name).includes('DESCONTINUADOS'));
  if(discontinued){const rows=sheetRows(workbook,discontinued);const hi=findHeader(rows,['STATUS','EAN','DESCR']);if(hi>=0){const h=rows[hi].map(normalizeText);const c=(v:string)=>h.findIndex(x=>x.includes(normalizeText(v)));for(let r=hi+1;r<rows.length;r++){const row=rows[r];if(!normalizeText(row[c('STATUS')]).includes('DESCONTINU'))continue;const oldEan=cleanDigits(row[c('EAN')]);const oldSku=cleanCode(row[c('COD')]);if(oldEan||oldSku)lineage.push({oldSku,oldEan,newSku:'',newEan:'',description:text(row[c('DESCRIÇÃO')]),status:'DESCONTINUADO',effectiveFrom:'2026-08-01',sourceSheet:discontinued})}}}
  if(!competences.length)warnings.push('Nenhuma competência oficial de sortimento reconhecida no arquivo.');
  return{competences,lineage,warnings};
}

function validCustomerCnpj(value:unknown){const normalized=normalizeCnpj(value,{declaredCnpj:true});return /^\d{14}$/.test(normalized.canonical)?normalized:null}

export function parseCustomerAndPurchaseWorkbook(workbook:XLSX.WorkBook):{purchases:PurchaseHistory310[];customers:CustomerCommercialProfile[]} {
  const purchases:PurchaseHistory310[]=[];const customers:CustomerCommercialProfile[]=[];const aggregate=new Map<string,PurchaseHistory310>();
  const purchaseSheet=workbook.SheetNames.find(name=>normalizeText(name).includes('310 TOTAL 2026'));
  if(purchaseSheet){const rows=sheetRows(workbook,purchaseSheet);const hi=findHeader(rows,['VALOR','DEVOL']);if(hi>=0){const h=rows[hi].map(normalizeText);const c=(...names:string[])=>h.findIndex(x=>names.some(v=>x===normalizeText(v)||x.includes(normalizeText(v))));
    for(let r=hi+1;r<rows.length;r++){const row=rows[r];const normalized=validCustomerCnpj(row[c('CNPJ','CNPJ/CPF')]);if(!normalized)continue;const legacy=cleanCode(row[c('CODIGO','PRODUTO')]);if(!legacy)continue;const purchaseValue=parseNumber(row[c('VALOR COMPRAS','VALORCOMPRAS')]);const returnValue=parseNumber(row[c('VALOR DEVOLUCOES','V.DEVOLUCOES','DEVOLUCOES')]);const item:PurchaseHistory310={cnpj:normalized.canonical,cnpjRaw:normalized.raw,legacyProductCode:legacy,winthorCode:legacy,description:text(row[c('DESCRICAO','DESCRIÇÃO')]),volumes:parseNumber(row[c('VOLUMES')]),quantity:parseNumber(row[c('QTD CPA','QTDCOMPRA','QTD COMPRA')]),purchaseValue,returnVolume:parseNumber(row[c('VOL DEV','VOLUMEDEVOLUCAO')]),returnValue,netValue:purchaseValue,vendorCode:cleanCode(row[c('VEN.','VENDEDOR')]),groupingCode:cleanCode(row[c('AGP.','AGRUPAMENTO')]),groupingDescription:text(row[c('DESCRICAOAGRUPAMENTO','DESCRICAO AGRUPAMENTO')])};const key=`${item.cnpj}:${legacy}`;const current=aggregate.get(key);if(!current)aggregate.set(key,item);else{current.volumes+=item.volumes;current.quantity+=item.quantity;current.purchaseValue+=item.purchaseValue;current.returnVolume+=item.returnVolume;current.returnValue+=item.returnValue;current.netValue+=item.netValue}}
  }}}
  const customerSheet=workbook.SheetNames.find(name=>{const n=normalizeText(name);return n.includes('EXPORTACAO PDVS')||n.includes('PREMISSAS')});
  if(customerSheet){const rows=sheetRows(workbook,customerSheet);const hi=findHeader(rows,['COD CLIENTE','TIPO']);if(hi>=0){const h=rows[hi].map(normalizeText);const ci=(v:string)=>h.findIndex(x=>x===normalizeText(v)||x.includes(normalizeText(v)));for(let r=hi+1;r<rows.length;r++){const row=rows[r];if(normalizeText(row[ci('TIPO')])!=='CNPJ')continue;const normalized=validCustomerCnpj(row[ci('COD CLIENTE')]);if(!normalized)continue;const tier=text(row[ci('FAIXAS')]);customers.push({cnpj:normalized.canonical,cnpjRaw:normalized.raw,name:text(row[ci('NOME_CLIENTE')]),clientCode:'',network:text(row[ci('REDE')]),environment:text(row[ci('AMBIENTE')]),profile:text(row[ci('PERFIL')]),tier,assortmentChannel:channelFromTier(tier),city:text(row[ci('CIDADE')]),state:text(row[ci('ESTADO')]),vendorCode:'',coordinatorCode:'',coordinatorName:'',source:customerSheet})}}}
  return{purchases:Array.from(aggregate.values()),customers};
}

export async function readCustomerIntelligenceWorkbook(file: File): Promise<XLSX.WorkBook> { const data = await file.arrayBuffer(); return XLSX.read(data, { type: 'array', cellDates: false }); }

export function detectCustomerIntelligenceSource(workbook: XLSX.WorkBook): 'OFFICIAL_ASSORTMENT' | 'PURCHASE_310' | 'PROTOTYPE' | 'UNKNOWN' {
  const sheets = workbook.SheetNames.map(normalizeText);
  if (sheets.some(name => name.includes('AGO') && name.includes('SET26') && name.includes('SORTIMENTO')) && sheets.some(name => name.includes('DESCONTINUADOS'))) return 'OFFICIAL_ASSORTMENT';
  if (sheets.some(name => name.includes('310 TOTAL 2026'))) return 'PURCHASE_310';
  if (sheets.some(name => name.includes('RECOM POR CNPJ'))) return 'PROTOTYPE';
  return 'UNKNOWN';
}

export function mergeCustomerIntelligenceSupport(previous: CustomerIntelligenceSupport | null, update: Partial<CustomerIntelligenceSupport> & { source?: { kind: string; fileName: string; note: string } }): CustomerIntelligenceSupport {
  const base = previous || EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  const updatedAt = new Date().toISOString();
  const sources = update.source ? [...base.sources.filter(item => item.kind !== update.source!.kind), { ...update.source, loadedAt: updatedAt }] : base.sources;
  return {
    schemaVersion: 1,
    updatedAt,
    sources,
    assortmentCompetences: update.assortmentCompetences ?? base.assortmentCompetences,
    lineage: update.lineage ?? base.lineage,
    customers: update.customers ?? base.customers,
    purchases: update.purchases ?? base.purchases,
    historicalPurchases: update.historicalPurchases ?? base.historicalPurchases,
    promotions: update.promotions ?? base.promotions,
    pricingRules: update.pricingRules ?? base.pricingRules,
    warnings: Array.from(new Set([...(base.warnings || []), ...(update.warnings || [])])),
  };
}
