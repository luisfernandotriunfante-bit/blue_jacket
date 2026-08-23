import type * as XLSX from 'xlsx';
import type { DataQualityIssue, ItemMasterRecord } from '../../domain/unified';
import { cleanCode, cleanDigits, normalizeText, parseNumber, sheetRows } from '../canonical/utils';
import type { Row } from '../canonical/runtime';

const validBarcode=(value:unknown)=>{const raw=String(value??'').replace(/\D/g,'');return [8,12,13,14].includes(raw.length)?raw:''};
const itemId=(winthor:string,ean:string,sku:string)=>winthor?`WINTHOR:${winthor}`:ean?`EAN:${ean}`:sku?`SKU:${sku}`:'';
const positive=(value:unknown)=>Math.max(parseNumber(value),0);
const headerToken=(value:unknown)=>normalizeText(value).replace(/[^A-Z0-9]/g,'');

interface Detailed286 { code:string; description:string; ean:string; factoryCode:string; physical:number; blocked:number; reserved:number; available:number; }
interface Stock105Record { code:string; description:string; quantity:number; costUnit:number; saleUnit:number; }
interface IndustryProduct { sku:string; description:string; ean:string; dun14:string; unitsPerCase:number|null; casesPerPallet:number|null; }
interface InternalLogistics { factor:number|null; units:number; cases:number; grossKg:number; }
interface PriceRecord { pVenda1:number; pVenda:number; vlSt:number; }

export interface ItemMotorInput {
  normalized286Rows:Row[];
  stock105Rows:Row[];
  stock8013Rows:Row[];
  priceListRows:Row[];
  launchRows:Row[];
  pctabprWorkbook:XLSX.WorkBook|null;
  previousItems:ItemMasterRecord[];
}
export interface ItemMotorResult { items:ItemMasterRecord[]; qualityIssues:DataQualityIssue[]; }

const blankItem=(winthor='',ean='',sku=''):ItemMasterRecord=>({
  itemCanonicalId:itemId(winthor,ean,sku),winthorCode:winthor,internalDescription:'',internalEan:ean,manufacturerCode:'',industrySku:sku,industryDescription:'',industryEan:'',industryDun14:'',internalUnitsPerCase:null,industryUnitsPerCase:null,casesPerPallet:null,physicalStockUnits:0,blockedStockUnits:0,reservedStockUnits:0,availableStockUnits:0,costUnit105:0,physicalCases8013:0,physicalUnits8013:0,grossKg8013:0,salePricePvenDa1:null,pVenda:null,vlSt:null,isLaunch:false,hasWinthor:Boolean(winthor),sourceKeys:{},
});

function parse286(rows:Row[]):Detailed286[]{
  const result:Detailed286[]=[];if(!rows.length)return result;

  // Layouts Winthor 286 aprovados: filial na coluna 0 e Código do produto na coluna 1.
  // Esta assinatura estrutural tem precedência sobre cabeçalhos genéricos, porque alguns relatórios
  // exibem um cabeçalho "Código" sobre a coluna da filial e poderiam transformar a filial 11 em SKU.
  const positionalRows=rows.filter(row=>String(row[0]??'').trim()==='11'&&/^\d+$/.test(cleanCode(row[1])));
  if(positionalRows.length){
    for(const row of positionalRows){
      const code=cleanCode(row[1]);
      const compact=row.length<=22;
      const ean=validBarcode(compact?row[17]:row[20])||validBarcode(row[17])||validBarcode(row[20]);
      const factoryCode=cleanCode(compact?row[18]:row[23])||cleanCode(row[18])||cleanCode(row[23]);
      result.push({code,description:String(row[2]??'').trim(),ean,factoryCode,physical:parseNumber(compact?row[7]:row[10]),blocked:parseNumber(compact?row[8]:row[11]),reserved:parseNumber(compact?row[9]:row[12]),available:parseNumber(compact?row[10]:row[13])});
    }
    return result;
  }

  const headerIndex=rows.findIndex(row=>{const n=row.map(headerToken);return n.includes('CODIGO')&&n.includes('DESCRICAO')&&n.includes('BARRAS')&&n.includes('FABRICA')});
  if(headerIndex>=0){
    const h=rows[headerIndex].map(headerToken);const col=(...names:string[])=>{for(const name of names){const found=h.indexOf(headerToken(name));if(found>=0)return found}return-1};
    const cCode=col('Código'),cDesc=col('Descrição'),cEan=col('Barras'),cFactory=col('Fábrica'),cPhysical=col('Físico'),cBlocked=col('Bloq.'),cReserved=col('Reserv.'),cAvailable=col('Disp.');
    if(cCode>=0){for(let i=headerIndex+1;i<rows.length;i++){
      const row=rows[i];const code=cleanCode(row[cCode]);if(!/^\d+$/.test(code))continue;
      result.push({code,description:cDesc>=0?String(row[cDesc]??'').trim():'',ean:cEan>=0?validBarcode(row[cEan]):'',factoryCode:cFactory>=0?cleanCode(row[cFactory]):'',physical:cPhysical>=0?parseNumber(row[cPhysical]):0,blocked:cBlocked>=0?parseNumber(row[cBlocked]):0,reserved:cReserved>=0?parseNumber(row[cReserved]):0,available:cAvailable>=0?parseNumber(row[cAvailable]):0});
    }}
  }
  if(!result.length)throw new Error('Cadastro 286: nenhum produto válido foi reconhecido nos layouts aprovado compacto ou expandido.');
  return result;
}

function parse105(rows:Row[]):Stock105Record[]{
  if(!rows.length)return[];
  const headerIndex=rows.findIndex(row=>{const n=row.map(headerToken);return n.some(v=>v==='CODIGO'||v==='COD')&&n.some(v=>v.includes('DESCR'))&&n.some(v=>v.includes('QT')&&v.includes('EST'))});
  const result:Stock105Record[]=[];
  if(headerIndex>=0){
    const h=rows[headerIndex].map(headerToken);const find=(predicate:(value:string)=>boolean,fallback:number)=>{const index=h.findIndex(predicate);return index>=0?index:fallback};
    const cCode=find(v=>v==='CODIGO'||v==='COD',0),cDesc=find(v=>v.includes('DESCR'),1),cQty=find(v=>v.includes('QT')&&v.includes('EST'),8);
    const cCost=find(v=>v.includes('REAL')&&v.includes('ICMS'),10);
    const cSale=find(v=>v.includes('PVENDA'),14);
    for(let i=headerIndex+1;i<rows.length;i++){
      const row=rows[i];const code=cleanCode(row[cCode]);if(!/^\d+$/.test(code))continue;
      result.push({code,description:String(row[cDesc]??'').trim(),quantity:parseNumber(row[cQty]),costUnit:parseNumber(row[cCost]),saleUnit:parseNumber(row[cSale])});
    }
  } else {
    // Layout compacto aprovado: código 0, descrição 1, estoque 4, custo 6, venda 9.
    for(const row of rows){
      const code=cleanCode(row[0]);const description=String(row[1]??'').trim();if(!/^\d+$/.test(code)||!description||row.length<10)continue;
      result.push({code,description,quantity:parseNumber(row[4]),costUnit:parseNumber(row[6]),saleUnit:parseNumber(row[9])});
    }
  }
  if(!result.length)throw new Error('Posição 105: nenhum produto válido foi reconhecido nos layouts aprovado compacto ou expandido.');
  return result;
}

function parseIndustry(rows:Row[]):IndustryProduct[]{
  if(!rows.length)return[];
  const headerIndex=rows.findIndex(row=>{const n=row.map(headerToken);return n.includes('SKU')&&n.includes('EAN')&&n.some(v=>v.includes('UN')&&v.includes('CX'))});
  if(headerIndex<0)throw new Error('Lista de Preço Colgate: cabeçalho SKU/EAN/Un-CX não reconhecido.');
  const h=rows[headerIndex].map(headerToken);const find=(predicate:(value:string)=>boolean,fallback:number)=>{const index=h.findIndex(predicate);return index>=0?index:fallback};
  const cSku=find(v=>v==='SKU',8),cDesc=find(v=>v.includes('DESCRICAOPADRAO')||v==='DESCRICAO',9),cEan=find(v=>v==='EAN',10),cDun=find(v=>v.includes('DUN'),11),cUnits=find(v=>v.includes('UN')&&v.includes('CX'),17),cPallet=find(v=>v.includes('CX')&&v.includes('PAL'),18);
  const result:IndustryProduct[]=[];
  for(let i=headerIndex+1;i<rows.length;i++){const row=rows[i];const sku=cleanCode(row[cSku]);const ean=validBarcode(row[cEan]);if(!sku&&!ean)continue;result.push({sku,description:String(row[cDesc]??'').trim(),ean,dun14:validBarcode(row[cDun]),unitsPerCase:positive(row[cUnits])||null,casesPerPallet:positive(row[cPallet])||null})}
  return result;
}

function parseInternalLogistics(rows:Row[]):Map<string,InternalLogistics>{
  const map=new Map<string,InternalLogistics>();if(!rows.length)return map;
  const headerIndex=rows.findIndex(row=>{const n=row.map(headerToken);return n.some(v=>v.includes('CODIGODOPRODUTO')||v.includes('EAN13'))&&n.some(v=>v.includes('ESTOQUEEMUND'))});
  if(headerIndex<0)throw new Error('Estoque 8013: cabeçalho EAN/Estoque em UND não reconhecido.');
  const h=rows[headerIndex].map(headerToken);const find=(predicate:(value:string)=>boolean,fallback:number)=>{const index=h.findIndex(predicate);return index>=0?index:fallback};
  const cEan=find(v=>v.includes('CODIGODOPRODUTO')||v.includes('EAN13'),4),cCaseWeight=find(v=>v.includes('PESOCDA'),8),cUnitWeight=find(v=>v.includes('PESOUNIDADE'),9),cUnits=find(v=>v.includes('ESTOQUEEMUND'),11),cCases=find(v=>v.includes('ESTOQUEEMCX'),12),cGross=find(v=>v==='PESOKG',13);
  for(let i=headerIndex+1;i<rows.length;i++){const row=rows[i];const ean=validBarcode(row[cEan]);if(!ean)continue;const caseWeight=parseNumber(row[cCaseWeight]);const unitWeight=parseNumber(row[cUnitWeight]);const rawFactor=caseWeight>0&&unitWeight>0?caseWeight/unitWeight:0;map.set(ean,{factor:Number.isFinite(rawFactor)&&rawFactor>0?Math.round(rawFactor*1000)/1000:null,units:parseNumber(row[cUnits]),cases:parseNumber(row[cCases]),grossKg:parseNumber(row[cGross])})}
  return map;
}

function parseLaunchEans(rows:Row[]):Set<string>{
  const result=new Set<string>();if(!rows.length)return result;const headerIndex=rows.findIndex(row=>row.map(headerToken).some(v=>v==='EAN'||v.includes('EAN')));if(headerIndex<0)throw new Error('Lista de Lançamentos: coluna EAN não reconhecida.');const h=rows[headerIndex].map(headerToken);const cEan=h.findIndex(v=>v==='EAN'||v.includes('EAN'));for(let i=headerIndex+1;i<rows.length;i++){const ean=validBarcode(rows[i][cEan]);if(ean)result.add(ean)}return result;
}

export function parsePctabprRegion11(workbook:XLSX.WorkBook|null):Map<string,PriceRecord>{
  const map=new Map<string,PriceRecord>();if(!workbook)return map;const sheet=workbook.Sheets['pctabpr'];if(!sheet)throw new Error('PCTABPR: a aba bruta "pctabpr" é obrigatória; Planilha1 filtrada não é fonte canônica.');
  const rows=sheetRows({SheetNames:['pctabpr'],Sheets:{pctabpr:sheet}} as XLSX.WorkBook,'pctabpr');const headerIndex=rows.findIndex(row=>{const n=row.map(headerToken);return n.includes('CODPROD')&&n.includes('NUMREGIAO')&&n.includes('PVENDA1')});if(headerIndex<0)throw new Error('PCTABPR: cabeçalho bruto CODPROD/NUMREGIAO/PVENDA1 não encontrado.');
  const h=rows[headerIndex].map(headerToken);const col=(name:string)=>h.indexOf(headerToken(name));const cCode=col('CODPROD'),cRegion=col('NUMREGIAO'),cPv1=col('PVENDA1'),cPv=col('PVENDA'),cSt=col('VLST');
  for(let i=headerIndex+1;i<rows.length;i++){const row=rows[i];if(cleanCode(row[cRegion])!=='11')continue;const code=cleanCode(row[cCode]);if(!/^\d+$/.test(code))continue;const record={pVenda1:parseNumber(row[cPv1]),pVenda:parseNumber(row[cPv]),vlSt:parseNumber(row[cSt])};const prior=map.get(code);if(prior&&Math.abs(prior.pVenda1-record.pVenda1)>.005)throw new Error(`PCTABPR região 11: conflito de PVENDA1 para CODPROD ${code}.`);map.set(code,record)}
  return map;
}

function findItem(items:ItemMasterRecord[],winthor='',ean='',sku=''){
  return items.find(item=>(winthor&&item.winthorCode===winthor)||(ean&&(item.internalEan===ean||item.industryEan===ean))||(sku&&(item.industrySku===sku||item.manufacturerCode===sku)));
}
function ensureItem(items:ItemMasterRecord[],winthor='',ean='',sku=''){
  const existing=findItem(items,winthor,ean,sku);if(existing)return existing;const created=blankItem(winthor,ean,sku);items.push(created);return created;
}

export function runItemMotor(input:ItemMotorInput):ItemMotorResult{
  const qualityIssues:DataQualityIssue[]=[];const items=input.previousItems.map(item=>({...item,sourceKeys:{...item.sourceKeys}}));
  const has286=input.normalized286Rows.length>0,has105=input.stock105Rows.length>0,has8013=input.stock8013Rows.length>0,hasIndustry=input.priceListRows.length>0,hasLaunch=input.launchRows.length>0,hasPrice=Boolean(input.pctabprWorkbook);
  const registry=parse286(input.normalized286Rows);const stock105=parse105(input.stock105Rows);const industry=parseIndustry(input.priceListRows);const logistics=parseInternalLogistics(input.stock8013Rows);const launchEans=parseLaunchEans(input.launchRows);const priceByCode=parsePctabprRegion11(input.pctabprWorkbook);

  if(has286){for(const item of items){if(item.winthorCode&&!registry.some(row=>row.code===item.winthorCode))item.hasWinthor=false}for(const reg of registry){const item=ensureItem(items,reg.code,reg.ean,reg.factoryCode);item.winthorCode=reg.code;item.internalDescription=reg.description;item.internalEan=reg.ean;item.manufacturerCode=reg.factoryCode;item.blockedStockUnits=reg.blocked;item.reservedStockUnits=reg.reserved;item.availableStockUnits=reg.available;item.hasWinthor=true;item.sourceKeys['286']=reg.code;if(!item.itemCanonicalId)item.itemCanonicalId=itemId(reg.code,reg.ean,reg.factoryCode)}}

  if(hasIndustry){for(const ind of industry){const item=ensureItem(items,'',ind.ean,ind.sku);item.industrySku=ind.sku;item.industryDescription=ind.description;item.industryEan=ind.ean;item.industryDun14=ind.dun14;item.industryUnitsPerCase=ind.unitsPerCase;item.casesPerPallet=ind.casesPerPallet;item.sourceKeys['LISTA_PRECO']=ind.sku||ind.ean;if(!item.itemCanonicalId)item.itemCanonicalId=itemId(item.winthorCode,ind.ean,ind.sku)}}

  if(has105){for(const item of items){item.physicalStockUnits=0;item.costUnit105=0;item.sourceKeys['105']=''}for(const row of stock105){const item=findItem(items,row.code);if(!item){qualityIssues.push({id:`105_UNRESOLVED:${row.code}`,domain:'ITEM',severity:'WARNING',code:'STOCK_105_CODE_NOT_IN_ITEM_MASTER',message:'Código da posição 105 não foi localizado no Cadastro 286 atual; estoque não foi atribuído silenciosamente.',source:'105',entityKey:row.code});continue}item.physicalStockUnits=row.quantity;item.costUnit105=row.costUnit;item.sourceKeys['105']=row.code;const reg=registry.find(candidate=>candidate.code===row.code);if(reg&&Math.abs(reg.physical-row.quantity)>.001)qualityIssues.push({id:`105_286_PHYSICAL:${row.code}`,domain:'ITEM',severity:'WARNING',code:'PHYSICAL_STOCK_CONFIRMATION_DIVERGENCE',message:'Físico do 286 diverge de Qt.Est. da posição 105; a posição 105 permanece canônica.',source:'105 × 286',entityKey:item.itemCanonicalId,details:{stock105:row.quantity,physical286:reg.physical}})}}

  if(has8013){for(const item of items){item.internalUnitsPerCase=null;item.physicalCases8013=0;item.physicalUnits8013=0;item.grossKg8013=0;item.sourceKeys['8013']=''}for(const [ean,log] of logistics){const item=ensureItem(items,'',ean,'');item.internalUnitsPerCase=log.factor;item.physicalCases8013=log.cases;item.physicalUnits8013=log.units;item.grossKg8013=log.grossKg;item.sourceKeys['8013']=ean;if(!item.itemCanonicalId)item.itemCanonicalId=itemId(item.winthorCode,ean,item.industrySku)}}

  if(hasPrice){for(const item of items){if(item.winthorCode){item.salePricePvenDa1=null;item.pVenda=null;item.vlSt=null;item.sourceKeys['PCTABPR']=''}}for(const [code,price] of priceByCode){const item=findItem(items,code);if(!item)continue;item.salePricePvenDa1=price.pVenda1;item.pVenda=price.pVenda;item.vlSt=price.vlSt;item.sourceKeys['PCTABPR']='11'}for(const item of items.filter(row=>row.hasWinthor&&row.winthorCode&&!priceByCode.has(row.winthorCode)))qualityIssues.push({id:`PRICE_MISSING:${item.itemCanonicalId}`,domain:'ITEM',severity:'WARNING',code:'PCTABPR_REGION11_PRICE_MISSING',message:'Item Winthor sem PVENDA1 localizado na região 11 da PCTABPR carregada.',source:'PCTABPR',entityKey:item.itemCanonicalId})}

  if(hasLaunch){for(const item of items)item.isLaunch=false;for(const ean of launchEans){const item=ensureItem(items,'',ean,'');item.isLaunch=true;item.sourceKeys['LANCAMENTOS']=ean;if(!item.itemCanonicalId)item.itemCanonicalId=itemId(item.winthorCode,ean,item.industrySku)}}

  for(const item of items){if(item.internalUnitsPerCase&&item.industryUnitsPerCase&&Math.abs(item.internalUnitsPerCase-item.industryUnitsPerCase)>.001)qualityIssues.push({id:`PACK_DIFFERENCE:${item.itemCanonicalId}`,domain:'ITEM',severity:'INFO',code:'INTERNAL_INDUSTRIAL_PACK_DIFFERENCE',message:'Un/CX interno e industrial são diferentes e foram preservados separadamente.',source:'8013 × Lista de Preço',entityKey:item.itemCanonicalId,details:{internal:item.internalUnitsPerCase,industry:item.industryUnitsPerCase}});if(!item.itemCanonicalId)item.itemCanonicalId=itemId(item.winthorCode,item.internalEan||item.industryEan,item.industrySku)}
  return{items:items.filter(item=>Boolean(item.itemCanonicalId)),qualityIssues};
}
