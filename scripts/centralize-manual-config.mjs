import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const path='src/domain/canonical.ts';
let s=readFileSync(path,'utf8');
const pattern=/const ratio=\(value:number,target:number\)=>target>0\?value\/target:0;[\s\S]*?\nexport function applyManualConfiguration\([\s\S]*?\n}\n$/;
if(!pattern.test(s))throw new Error('Bloco applyManualConfiguration não encontrado');
const replacement=`const ratio=(value:number,target:number)=>target>0?value/target:0;
const positiveGap=(target:number,value:number)=>Math.max(target-value,0);

function configuredBusinessDays(start:string,end:string,holidays:string[]){
  if(!start||!end)return 0;
  const holidaySet=new Set(holidays||[]);
  const cursor=new Date(\`${'${start}'}T12:00:00Z\`);
  const limit=new Date(\`${'${end}'}T12:00:00Z\`);
  if(Number.isNaN(cursor.getTime())||Number.isNaN(limit.getTime()))return 0;
  let count=0;
  while(cursor<=limit){
    const day=cursor.getUTCDay();const iso=cursor.toISOString().slice(0,10);
    if(day!==0&&day!==6&&!holidaySet.has(iso))count+=1;
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  return count;
}

export function applyManualConfiguration(base:CanonicalState|null,config:ManualConfiguration):CanonicalState|null{
  if(!base)return null;
  const sellOutTarget=config.sellOutTarget>0?Math.max(config.sellOutTarget,0):Math.max(base.sellOut.sellOutTarget,0);
  const coverageTargetDays=Math.max(config.coverageTargetDays||0,0);
  const portfolioSaleMarkup=Math.max(Number(config.portfolioSaleMarkup)||0,0);
  const elapsedEnd=base.referenceDate<base.periodEnd?base.referenceDate:base.periodEnd;
  const businessDaysTotal=configuredBusinessDays(base.periodStart,base.periodEnd,config.holidays)||base.sellOut.businessDaysTotal;
  const businessDaysElapsed=configuredBusinessDays(base.periodStart,elapsedEnd,config.holidays);
  const businessDaysRemaining=Math.max(businessDaysTotal-businessDaysElapsed,0);
  const invoicedDailyAverage=businessDaysElapsed>0?base.sellOut.invoiced/businessDaysElapsed:0;
  const totalDailyAverage=businessDaysElapsed>0?base.sellOut.total/businessDaysElapsed:0;
  const invoicedTrend=invoicedDailyAverage*businessDaysTotal;
  const totalTrend=totalDailyAverage*businessDaysTotal;
  const neededDailyAverage=businessDaysRemaining>0?positiveGap(sellOutTarget,base.sellOut.total)/businessDaysRemaining:positiveGap(sellOutTarget,base.sellOut.total);

  const networks=base.networks.map(network=>{
    const configured=config.networkTargets[network.key];
    const networkTarget=Number.isFinite(configured)?Math.max(configured,0):Math.max(network.networkTarget,0);
    return{...network,networkTarget,networkAttainment:ratio(network.total,networkTarget),topAttainment:ratio(network.total,network.topTarget),gapToNetworkTarget:positiveGap(networkTarget,network.total),gapToTopTarget:positiveGap(network.topTarget,network.total)};
  });
  const lines=base.lines.map(line=>{const share=config.lineShares[line.name]??line.share;const target=sellOutTarget*share;return{...line,share,target,attainment:ratio(line.total,target)}});
  const inventory=base.inventory.map(item=>{
    const pendingSale=item.saleUnit>0&&item.pendingQty>0?item.pendingQty*item.saleUnit:item.pendingCost*(1+portfolioSaleMarkup);
    return{...item,pendingSale};
  });
  const pendingPurchaseSale=inventory.reduce((sum,item)=>sum+item.pendingSale,0);
  const projectedSaleValue=base.stock.saleValue+pendingPurchaseSale;
  const historyAverage=base.history.average3ClosedMonths||0;
  const coverageProjectedDays=historyAverage>0?Math.round(projectedSaleValue/historyAverage*30):0;

  const vendors=base.vendors.map(vendor=>{
    const idealSalesToday=businessDaysTotal>0?vendor.salesTarget*(businessDaysElapsed/businessDaysTotal):0;
    const idealPositivationToday=businessDaysTotal>0?vendor.positivityTarget*(businessDaysElapsed/businessDaysTotal):0;
    const positivityGapToTarget=positiveGap(vendor.positivityTarget,vendor.totalPositivation);
    return{...vendor,idealSalesToday,salesGapToIdeal:positiveGap(idealSalesToday,vendor.total),salesGapToTarget:positiveGap(vendor.salesTarget,vendor.total),idealPositivationToday,positivityGapToIdeal:positiveGap(idealPositivationToday,vendor.totalPositivation),positivityGapToTarget,positivityDailyTarget:businessDaysRemaining>0?positivityGapToTarget/businessDaysRemaining:positivityGapToTarget};
  });
  const coordinatorGroups=new Map<string,CanonicalVendorResult[]>();
  vendors.forEach(vendor=>{const key=vendor.coordinatorCode||vendor.coordinatorName||'SEM_COORDENADOR';const rows=coordinatorGroups.get(key)||[];rows.push(vendor);coordinatorGroups.set(key,rows)});
  const coordinators=Array.from(coordinatorGroups.entries()).map(([code,members])=>{
    const salesTarget=members.reduce((sum,v)=>sum+v.salesTarget,0);const positivityTarget=members.reduce((sum,v)=>sum+v.positivityTarget,0);const invoiced=members.reduce((sum,v)=>sum+v.invoiced,0);const toInvoice=members.reduce((sum,v)=>sum+v.toInvoice,0);const total=members.reduce((sum,v)=>sum+v.total,0);const invoicedPositivation=members.reduce((sum,v)=>sum+v.invoicedPositivation,0);const futurePositivation=members.reduce((sum,v)=>sum+v.futurePositivation,0);const totalPositivation=members.reduce((sum,v)=>sum+v.totalPositivation,0);
    return{code,name:members[0]?.coordinatorName||code,salesTarget,positivityTarget,invoiced,toInvoice,total,attainment:ratio(total,salesTarget),invoicedPositivation,futurePositivation,totalPositivation,positivityAttainment:ratio(totalPositivation,positivityTarget),vendors:members};
  });

  return{...base,inventory,networks,lines,vendors,coordinators,sellOut:{...base.sellOut,sellOutTarget,attainment:ratio(base.sellOut.total,sellOutTarget),businessDaysTotal,businessDaysElapsed,businessDaysRemaining,invoicedDailyAverage,totalDailyAverage,neededDailyAverage,invoicedTrend,totalTrend},stock:{...base.stock,pendingPurchaseSale,projectedSaleValue,coverageProjectedDays,coverageTargetDays}};
}
`;
s=s.replace(pattern,replacement);
writeFileSync(path,s,'utf8');
rmSync('scripts/centralize-manual-config.mjs');
rmSync('.github/workflows/centralize-manual-config.yml');
