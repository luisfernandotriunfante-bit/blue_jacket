import type { ProdutoEstoque } from '../../store/DataContext';
import type { Row, StockProduct } from './runtime';
import { applyPortfolio } from './operations';
import { cleanCode, cleanDigits, parseNumber } from './utils';
import { parseCadastro286, parsePriceList } from './support';

export type PortfolioMatchMethod='CODIGO_INTERNO'|'CODIGO_FABRICANTE'|'EAN'|'SEM_286'|'SEM_MATERIAL';
export type PortfolioCaseSource='ORDER_QTY'|'BILL_QTY'|'ZERO';

export interface PortfolioLineReconciliation {
  sourceRow:number;
  material:string;
  ean:string;
  internalCode:string;
  matchMethod:PortfolioMatchMethod;
  matchReason:string;
  orderedCases:number;
  billedCases:number;
  selectedCases:number;
  selectedCaseSource:PortfolioCaseSource;
  unitsPerCase:number;
  expectedUnits:number;
  calculatedUnits:number;
  difference:number;
  cost:number;
  calculatedSale:number;
  hasWinthor:boolean;
  missingUnitsPerCase:boolean;
}

export interface PortfolioReconciliationSummary {
  lines:PortfolioLineReconciliation[];
  sourceLines:number;
  expectedUnits:number;
  calculatedUnits:number;
  unitDifference:number;
  missingUnitsPerCase:number;
  noWinthor:number;
  cost:number;
  calculatedSale:number;
}

function cloneProducts(products:Map<string,StockProduct>):Map<string,ProdutoEstoque>{
  return new Map(Array.from(products.entries()).map(([key,value])=>[key,{...value,saldoPedido:0,saldoPedidoCaixas:0,saldoPedidoValorCusto:0,saldoPedidoValorVenda:0}]));
}

function resolveReference(
  rawMaterial:string,
  cadastro:ReturnType<typeof parseCadastro286>,
  priceList:ReturnType<typeof parsePriceList>,
):{internalCode:string;ean:string;matchMethod:PortfolioMatchMethod;matchReason:string;unitsPerCase:number}{
  if(!rawMaterial)return{internalCode:'',ean:'',matchMethod:'SEM_MATERIAL',matchReason:'Linha sem material identificável na carteira.',unitsPerCase:0};

  const directInternal=cadastro.byInternal.has(rawMaterial)?rawMaterial:'';
  if(directInternal){
    const cad=cadastro.byInternal.get(directInternal)!;
    const ean=cleanDigits(cad.ean);
    const master=priceList.bySku.get(rawMaterial)||(ean?priceList.byEan.get(ean):undefined);
    return{internalCode:directInternal,ean,matchMethod:'CODIGO_INTERNO',matchReason:`Material ${rawMaterial} localizado diretamente no Cadastro 286.`,unitsPerCase:Math.max(master?.unitsPerCase||0,0)};
  }

  const factoryInternal=cadastro.factoryToInternal.get(rawMaterial)||'';
  if(factoryInternal){
    const cad=cadastro.byInternal.get(factoryInternal);
    const ean=cleanDigits(cad?.ean);
    const master=priceList.bySku.get(rawMaterial)||(ean?priceList.byEan.get(ean):undefined);
    return{internalCode:factoryInternal,ean,matchMethod:'CODIGO_FABRICANTE',matchReason:`Material ${rawMaterial} conciliado pelo código fabricante do Cadastro 286.`,unitsPerCase:Math.max(master?.unitsPerCase||0,0)};
  }

  const master=priceList.bySku.get(rawMaterial);
  const ean=cleanDigits(master?.ean);
  if(ean){
    const byEan=Array.from(cadastro.byInternal.entries()).find(([,item])=>cleanDigits(item.ean)===ean);
    if(byEan)return{internalCode:byEan[0],ean,matchMethod:'EAN',matchReason:`Material ${rawMaterial} conciliado pelo EAN ${ean} entre Lista de Preços e Cadastro 286.`,unitsPerCase:Math.max(master?.unitsPerCase||0,0)};
  }

  return{internalCode:'',ean,matchMethod:'SEM_286',matchReason:`Material ${rawMaterial} não encontrou código interno, código fabricante ou EAN correspondente no Cadastro 286.`,unitsPerCase:Math.max(master?.unitsPerCase||0,0)};
}

/**
 * Reconciliação independente da carteira. Cada linha é reaplicada isoladamente no
 * motor real de carteira e confrontada com caixas × Un/CX. A escolha Order Qty /
 * Bill Qty é apenas registrada como comportamento atual; sua precedência continua
 * BLOQUEADA POR REGRA NÃO CONFIRMADA até ser demonstrada na planilha com fórmulas.
 */
export function reconcilePortfolioRows(
  rows:Row[],
  baseProducts:Map<string,StockProduct>,
  cadastro:ReturnType<typeof parseCadastro286>,
  priceList:ReturnType<typeof parsePriceList>,
  saleMarkup:number,
):PortfolioReconciliationSummary{
  const lines:PortfolioLineReconciliation[]=[];

  for(let index=1;index<rows.length;index+=1){
    const row=rows[index];
    const orderedCases=Math.max(parseNumber(row[6]),0);
    const billedCases=Math.max(parseNumber(row[7]),0);
    const cost=Math.max(parseNumber(row[8]),0);
    const material=cleanCode(row[4]);
    if(orderedCases<=0&&billedCases<=0&&cost<=0)continue;

    const selectedCases=orderedCases>0?orderedCases:billedCases;
    const selectedCaseSource:PortfolioCaseSource=orderedCases>0?'ORDER_QTY':billedCases>0?'BILL_QTY':'ZERO';
    const reference=resolveReference(material,cadastro,priceList);
    const expectedUnits=reference.unitsPerCase>0?selectedCases*reference.unitsPerCase:0;

    const isolated=cloneProducts(baseProducts) as Map<string,StockProduct>;
    const result=applyPortfolio([[],row],isolated,cadastro,priceList,saleMarkup);
    const calculatedUnits=Array.from(isolated.values()).reduce((sum,product)=>sum+(product.saldoPedido||0),0);
    const applied=Array.from(isolated.values()).find(product=>(product.saldoPedidoCaixas||0)>0||(product.saldoPedidoValorCusto||0)>0);
    const hasWinthor=Boolean(applied?.hasWinthor);

    lines.push({
      sourceRow:index+1,
      material,
      ean:reference.ean||cleanDigits(applied?.ean),
      internalCode:reference.internalCode||(hasWinthor&&!String(applied?.codigo||'').startsWith('PORTFOLIO-')?String(applied?.codigo||''):''),
      matchMethod:reference.matchMethod,
      matchReason:reference.matchReason,
      orderedCases,
      billedCases,
      selectedCases,
      selectedCaseSource,
      unitsPerCase:reference.unitsPerCase,
      expectedUnits,
      calculatedUnits,
      difference:calculatedUnits-expectedUnits,
      cost,
      calculatedSale:result.sale,
      hasWinthor,
      missingUnitsPerCase:selectedCases>0&&reference.unitsPerCase<=0,
    });
  }

  const expectedUnits=lines.reduce((sum,line)=>sum+line.expectedUnits,0);
  const calculatedUnits=lines.reduce((sum,line)=>sum+line.calculatedUnits,0);
  return{
    lines,
    sourceLines:lines.length,
    expectedUnits,
    calculatedUnits,
    unitDifference:calculatedUnits-expectedUnits,
    missingUnitsPerCase:lines.filter(line=>line.missingUnitsPerCase).length,
    noWinthor:lines.filter(line=>!line.hasWinthor).length,
    cost:lines.reduce((sum,line)=>sum+line.cost,0),
    calculatedSale:lines.reduce((sum,line)=>sum+line.calculatedSale,0),
  };
}
