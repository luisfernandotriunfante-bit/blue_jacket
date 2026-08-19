import { CanonicalState, DEFAULT_MANUAL_CONFIGURATION, LINE_NAMES, ManualConfiguration } from '../domain/canonical';

export interface StorageLike {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem?(key:string):void;
}

export type ManualConfigLoadSource = 'COMPETENCE' | 'LEGACY_MIGRATED' | 'DEFAULT';
export interface ManualConfigLoadResult { config:ManualConfiguration; source:ManualConfigLoadSource; key:string|null; }

export const LEGACY_MANUAL_CONFIG_KEY='bj_manual_config';
export const MANUAL_CONFIG_PREFIX='bj_manual_config:';

const parseJson=<T>(raw:string|null):T|null=>{
  if(!raw)return null;
  try{return JSON.parse(raw) as T}catch{return null}
};

const nonNegative=(value:unknown,fallback=0)=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)?Math.max(parsed,0):fallback;
};

export function competenceFromPeriod(periodStart:string|undefined|null):string{
  const match=String(periodStart||'').match(/^(\d{4})-(\d{2})(?:-|$)/);
  if(!match)return'';
  const month=Number(match[2]);
  return month>=1&&month<=12?`${match[1]}-${match[2]}`:'';
}

export function competenceFromCanonical(state:Pick<CanonicalState,'periodStart'>|null|undefined):string{
  return competenceFromPeriod(state?.periodStart);
}

export function manualConfigStorageKey(competence:string):string|null{
  return competenceFromPeriod(`${competence}-01`)?`${MANUAL_CONFIG_PREFIX}${competence}`:null;
}

export function normalizeManualConfiguration(value:Partial<ManualConfiguration>|null|undefined):ManualConfiguration{
  const input=value||{};
  const lineShares={...DEFAULT_MANUAL_CONFIGURATION.lineShares};
  const suppliedShares=input.lineShares||{} as ManualConfiguration['lineShares'];
  LINE_NAMES.forEach(name=>{if(Object.prototype.hasOwnProperty.call(suppliedShares,name))lineShares[name]=nonNegative(suppliedShares[name],lineShares[name])});

  const networkTargets:Record<string,number>={};
  Object.entries(input.networkTargets||{}).forEach(([key,target])=>{networkTargets[key]=nonNegative(target,0)});

  const hasOwnHolidays=Object.prototype.hasOwnProperty.call(input,'holidays');
  const holidays=Array.from(new Set((hasOwnHolidays?(input.holidays||[]):DEFAULT_MANUAL_CONFIGURATION.holidays).filter(Boolean))).sort();

  return{
    sellOutTarget:nonNegative(input.sellOutTarget,DEFAULT_MANUAL_CONFIGURATION.sellOutTarget),
    coverageTargetDays:nonNegative(input.coverageTargetDays,DEFAULT_MANUAL_CONFIGURATION.coverageTargetDays),
    portfolioSaleMarkup:nonNegative(input.portfolioSaleMarkup,DEFAULT_MANUAL_CONFIGURATION.portfolioSaleMarkup),
    networkTargets,
    holidays,
    lineShares,
  };
}

export function loadManualConfiguration(storage:StorageLike,competence:string,{migrateLegacy=false}:{migrateLegacy?:boolean}={}):ManualConfigLoadResult{
  const key=manualConfigStorageKey(competence);
  if(!key)return{config:normalizeManualConfiguration(null),source:'DEFAULT',key:null};

  const scoped=parseJson<Partial<ManualConfiguration>>(storage.getItem(key));
  if(scoped)return{config:normalizeManualConfiguration(scoped),source:'COMPETENCE',key};

  if(migrateLegacy){
    const legacy=parseJson<Partial<ManualConfiguration>>(storage.getItem(LEGACY_MANUAL_CONFIG_KEY));
    if(legacy){
      const config=normalizeManualConfiguration(legacy);
      storage.setItem(key,JSON.stringify(config));
      storage.removeItem?.(LEGACY_MANUAL_CONFIG_KEY);
      return{config,source:'LEGACY_MIGRATED',key};
    }
  }

  return{config:normalizeManualConfiguration(null),source:'DEFAULT',key};
}

export function saveManualConfiguration(storage:StorageLike,competence:string,config:ManualConfiguration):string|null{
  const key=manualConfigStorageKey(competence);
  if(!key)return null;
  storage.setItem(key,JSON.stringify(normalizeManualConfiguration(config)));
  return key;
}
