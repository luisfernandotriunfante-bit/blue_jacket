import type * as XLSX from 'xlsx';
import type { CanonicalInventoryProduct, CanonicalSupportData } from '../../domain/canonical';
import type { DataQualityIssue, ItemMasterRecord } from '../../domain/unified';
import { cleanCode, cleanDigits, normalizeText, parseNumber, sheetRows } from '../canonical/utils';
import type { Row } from '../canonical/runtime';

const validBarcode=(value:unknown)=>{const raw=String(value??'').replace(/\D/g,'');return [8,12,13,14].includes(raw.length)?raw:''};
const itemId=(winthor:string,ean:string,sku:string)=>winthor?`WINTHOR:${winthor}`:ean?`EAN:${ean}`:sku?`SKU:${sku}`:'';

interface Detailed286 { code:string; description:string; ean:string; factoryCode:string; physical:number; blocked:number; reserved:number; available:number; }
interface IndustryProduct { sku:string; description:string; ean:string; dun14:string; unitsPerCase:number|null; casesPerPallet:number|null; }
interface InternalLogistics { factor:number|null; units:number; cases:number; grossKg:number; }
interface PriceRecord { pVenda1:number; pVenda:number; vlSt:number; }

export interface ItemMotorInput {
  normalized286Rows:Row[];
  stock8013Rows:Row[];
  priceListRows:Row[];
  pctabprWorkbook:XLSX.WorkBook|null;
  inventory:CanonicalInventoryProduct[];
  support:CanonicalSupportData;
}
export interface ItemMotorResult { items:ItemMasterRecord[]; qualityIssues:DataQualityIssue[]; }

function parse286(rows:Row[]):Detailed286[]{
  const result:Detailed286[]=[];
  const headerIndex=rows.findIndex(row=>{const n=row.map(normalizeText);return n.includes('CODIGO')&&n.includes('DESCRICAO')&&n.includes('BARRAS')&&n.includes('FABRICA')});
  if(headerIndex>=0){
    const h=rows[headerIndex].map(normalizeText);const col=(...names:string[])=>{for(const name of names){const found=h.indexOf(normalizeText(name));if(found>=0)return found}return-1};
    const cCode=col('Código'),cDesc=col('Descrição'),cEan=col('Barras'),cFactory=col('Fábrica'),cPhysical=col('Físico'),cBlocked=col('Bloq.'),cReserved=col('Reserv.'),cAvailable=col('Disp.');
    for(let i=headerIndex+1;i<rows.length;i++){const row=rows[i];const code=cleanCode(row[cCode]);if(!/^\d+$/.test(code))continue;result.push({code,description:String(row[cDesc]??'').trim(),ean:validBarcode(row[cEan]),factoryCode:cleanCode(row[cFactory]),physical:cPhysical>=0?parseNumber(row[cPhysical]):0,blocked:cBlocked>=0?parseNumber(row[cBlocked]):0,reserved:cReserved>=0?parseNumber(row[cReserved]):0,available:cAvailable>=0?parseNumber(row[cAvailable]):0})}
    return result;
  }
  for(const row of rows){if(String(row[0]??'').trim()!=='11')continue;const code=cleanCode(row[1]);if(!/^\d+$/.test(code))continue;result.push({code,description:String(row[2]??'').trim(),ean:validBarcode(row[20]||row[17]),factoryCode:cleanCode(row[23]||row[18]),physical:parseNumber(row[10]||row[7]),blocked:parseNumber(row[11]||row[8]),reserved:parseNumber(row[12]||row[9]),available:parseNumber(row[13]||row[10])})}
  return result;
}

function parseIndustry(rows:Row[]):IndustryProduct[]{
  const result:IndustryProduct[]=[];
  for(let i=1;i<rows.length;i++){const row=rows[i];const sku=cleanCode(row[8]);const ean=validBarcode(row[10]);if(!sku&&!ean)continue;result.push({sku,description:String(row[9]??'').trim(),ean,dun14:validBarcode(row[11]),unitsPerCase:parseNumber(row[17])>0?parseNumber(row[17]):null,casesPerPallet:parseNumber(row[18])>0?parseNumber(row[18]):null})}
  return result;
}

function parseInternalLogistics(rows:Row[]):Map<string,InternalLogistics>{
  const map=new Map<string,InternalLogistics>();
  for(let i=1;i<rows.length;i++){const ean=validBarcode(rows[i][4]);const caseWeight=parseNumber(rows[i][8]);const unitWeight=parseNumber(rows[i][9]);if(!ean)continue;const rawFactor=caseWeight>0&&unitWeight>0?caseWeight/unitWeight:0;map.set(ean,{factor:Number.isFinite(rawFactor)&&rawFactor>0?Math.round(rawFactor*1000)/1000:null,units:parseNumber(rows[i][11]),cases:parseNumber(rows[i][12]),grossKg:parseNumber(rows[i][13])})}
  return map;
}

export function parsePctabprRegion11(workbook:XLSX.WorkBook|null):Map<string,PriceRecord>{
  const map=new Map<string,PriceRecord>();if(!workbook)return map;const sheet=workbook.Sheets['pctabpr'];if(!sheet)throw new Error('PCTABPR: a aba bruta "pctabpr" é obrigatória; Planilha1 filtrada não é fonte canônica.');
  const rows=sheetRows({SheetNames:['pctabpr'],Sheets:{pctabpr:sheet}} as XLSX.WorkBook,'pctabpr');const headerIndex=rows.findIndex(row=>{const n=row.map(normalizeText);return n.includes('CODPROD')&&n.includes('NUMREGIAO')&&n.includes('PVENDA1')});if(headerIndex<0)throw new Error('PCTABPR: cabeçalho bruto CODPROD/NUMREGIAO/PVENDA1 não encontrado.');
  const h=rows[headerIndex].map(normalizeText);const col=(name:string)=>h.indexOf(name);const cCode=col('CODPROD'),cRegion=col('NUMREGIAO'),cPv1=col('PVENDA1'),cPv=col('PVENDA'),cSt=col('VLST'),cBranch=col('CODFILIAL'),cName=col('REGIAO');
  for(let i=headerIndex+1;i<rows.length;i++){const row=rows[i];if(cleanCode(row[cRegion])!=='11')continue;const code=cleanCode(row[cCode]);if(!/^\d+$/.test(code))continue;const record={pVenda1:parseNumber(row[cPv1]),pVenda:parseNumber(row[cPv]),vlSt:parseNumber(row[cSt])};const prior=map.get(code);if(prior&&Math.abs(prior.pVenda1-record.pVenda1)>.005)throw new Error(`PCTABPR região 11: conflito de PVENDA1 para CODPROD ${code}.`);map.set(code,record);const branch=cleanCode(row[cBranch]);const regionName=normalizeText(row[cName]);if(branch&&branch!=='11'&&!regionName.includes('CAMPO GRANDE')){/* somente auditoria contextual; NUMREGIAO=11 continua sendo o filtro */}}
  return map;
}

export function runItemMotor(input:ItemMotorInput):ItemMotorResult{
  const qualityIssues:DataQualityIssue[]=[];const registry=parse286(input.normalized286Rows);const byCode=new Map(registry.map(row=>[row.code,row]));const industry=parseIndustry(input.priceListRows);const industryBySku=new Map(industry.map(row=>[row.sku,row]));const industryByEan=new Map(industry.filter(row=>row.ean).map(row=>[row.ean,row]));const logistics=parseInternalLogistics(input.stock8013Rows);const priceByCode=parsePctabprRegion11(input.pctabprWorkbook);const inventoryByCode=new Map(input.inventory.filter(row=>row.code).map(row=>[cleanCode(row.code),row]));const inventoryByEan=new Map(input.inventory.filter(row=>row.ean).map(row=>[cleanDigits(row.ean),row]));
  const keys=new Set<string>([...registry.map(r=>`C:${r.code}`),...industry.map(r=>r.sku?`S:${r.sku}`:`E:${r.ean}`),...input.inventory.map(r=>r.code?`C:${cleanCode(r.code)}`:`E:${cleanDigits(r.ean)}`)]);const items:ItemMasterRecord[]=[];const seen=new Set<string>();
  for(const key of keys){let reg:Detailed286|undefined;let ind:IndustryProduct|undefined;let inv:CanonicalInventoryProduct|undefined;if(key.startsWith('C:')){reg=byCode.get(key.slice(2));inv=inventoryByCode.get(key.slice(2));if(reg?.factoryCode)ind=industryBySku.get(reg.factoryCode);if(!ind&&reg?.ean)ind=industryByEan.get(reg.ean)}else if(key.startsWith('S:')){ind=industryBySku.get(key.slice(2));if(ind?.ean){reg=registry.find(r=>r.ean===ind!.ean);inv=inventoryByEan.get(ind.ean)}}else{ind=industryByEan.get(key.slice(2));reg=registry.find(r=>r.ean===key.slice(2));inv=inventoryByEan.get(key.slice(2))}
    const winthor=reg?.code||((inv?.hasWinthor!==false&&inv?.code&&!inv.code.startsWith('EAN-')&&!inv.code.startsWith('PORTFOLIO-'))?cleanCode(inv.code):'');const ean=reg?.ean||ind?.ean||validBarcode(inv?.ean);const sku=ind?.sku||reg?.factoryCode||cleanCode(inv?.factoryCode);const id=itemId(winthor,ean,sku);if(!id||seen.has(id))continue;seen.add(id);const price=winthor?priceByCode.get(winthor):undefined;const physical=inv?.quantity??reg?.physical??0;const log=ean?logistics.get(ean):undefined;
    const record:ItemMasterRecord={itemCanonicalId:id,winthorCode:winthor,internalDescription:reg?.description||inv?.description||'',internalEan:reg?.ean||validBarcode(inv?.ean),manufacturerCode:reg?.factoryCode||cleanCode(inv?.factoryCode),industrySku:sku,industryDescription:ind?.description||'',industryEan:ind?.ean||'',industryDun14:ind?.dun14||'',internalUnitsPerCase:log?.factor??null,industryUnitsPerCase:ind?.unitsPerCase??null,casesPerPallet:ind?.casesPerPallet??null,physicalStockUnits:physical,blockedStockUnits:reg?.blocked??0,reservedStockUnits:reg?.reserved??0,availableStockUnits:reg?.available??Math.max(physical,0),costUnit105:inv?.costUnit||0,physicalCases8013:log?.cases||0,physicalUnits8013:log?.units||0,grossKg8013:log?.grossKg||0,salePricePvenDa1:price?.pVenda1??(inv?.saleUnit>0?inv.saleUnit:null),pVenda:price?.pVenda??null,vlSt:price?.vlSt??null,isLaunch:Boolean(inv?.isLaunch),hasWinthor:Boolean(winthor),sourceKeys:{'286':reg?.code||'','LISTA_PRECO':ind?.sku||'','105':inv?.code||'','PCTABPR':winthor&&price?'11':''}};items.push(record);
    if(record.internalUnitsPerCase&&record.industryUnitsPerCase&&Math.abs(record.internalUnitsPerCase-record.industryUnitsPerCase)>.001)qualityIssues.push({id:`PACK_DIFFERENCE:${id}`,domain:'ITEM',severity:'INFO',code:'INTERNAL_INDUSTRIAL_PACK_DIFFERENCE',message:'Un/CX interno e industrial são diferentes e foram preservados separadamente.',source:'8013 × Lista de Preço',entityKey:id,details:{internal:record.internalUnitsPerCase,industry:record.industryUnitsPerCase}});
    if(winthor&&!price)qualityIssues.push({id:`PRICE_MISSING:${id}`,domain:'ITEM',severity:'WARNING',code:'PCTABPR_REGION11_PRICE_MISSING',message:'Item Winthor sem PVENDA1 localizado na região 11 da PCTABPR carregada.',source:'PCTABPR',entityKey:id});
  }
  return{items,qualityIssues};
}
