export interface NetworkTargetInput { key:string; target:number; }

export function resolveSellOutTarget(manualTarget:number):number {
  const value=Number(manualTarget);
  return Number.isFinite(value)?Math.max(value,0):0;
}

function exactDistribution(entries:Array<{key:string;weight:number}>,total:number):Record<string,number>{
  const requested=Math.max(Number(total)||0,0);
  if(!entries.length)return{};
  const weights=entries.map(entry=>Math.max(Number(entry.weight)||0,0));
  const weightTotal=weights.reduce((sum,value)=>sum+value,0);
  const values:Record<string,number>={};
  let assigned=0;
  entries.forEach((entry,index)=>{
    const value=index===entries.length-1
      ? requested-assigned
      : requested*(weightTotal>0?weights[index]/weightTotal:1/entries.length);
    values[entry.key]=Math.max(value,0);
    assigned+=values[entry.key];
  });
  return values;
}

export function redistributeNetworkTotal(rows:NetworkTargetInput[],requestedTotal:number):Record<string,number>{
  return exactDistribution(rows.map(row=>({key:row.key,weight:row.target})),requestedTotal);
}

export function redistributeSingleNetwork(rows:NetworkTargetInput[],key:string,requestedValue:number):Record<string,number>{
  const current=Object.fromEntries(rows.map(row=>[row.key,Math.max(Number(row.target)||0,0)]));
  const total=rows.reduce((sum,row)=>sum+Math.max(Number(row.target)||0,0),0);
  if(!rows.some(row=>row.key===key))return current;
  // A edição individual nunca cria nem altera a Meta Redes Geral. Quando o total
  // ainda é zero, ele precisa ser inicializado pelo campo geral antes da edição por rede.
  if(total<=0)return current;

  const edited=Math.min(Math.max(Number(requestedValue)||0,0),total);
  const others=rows.filter(row=>row.key!==key);
  const residual=Math.max(total-edited,0);
  const redistributed=exactDistribution(others.map(row=>({key:row.key,weight:row.target})),residual);
  return{...redistributed,[key]:edited};
}

export function sumNetworkTargets(targets:Record<string,number>,keys?:string[]):number{
  const selected=keys||Object.keys(targets);
  return selected.reduce((sum,key)=>sum+Math.max(Number(targets[key])||0,0),0);
}
