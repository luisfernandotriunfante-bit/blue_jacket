import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import { activateApprovedCanonicalBundle,activateCanonicalBundleReference,deactivateCanonicalBundle,resolveActiveCanonicalBundle,type ActiveCanonicalBundle } from '../canonical/runtime';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../canonical/sourceImport';
import { RESET_NOTICE } from './migrationReset';

interface DataContextType { activeCanonical:ActiveCanonicalBundle|null; activateCanonical:(bundle?:ActiveCanonicalBundle)=>void; deactivateCanonical:()=>void; dataNotice:string }
const DataContext=createContext<DataContextType>({activeCanonical:null,activateCanonical:()=>undefined,deactivateCanonical:()=>undefined,dataNotice:RESET_NOTICE});
export function DataProvider({children}:{children:ReactNode}){
  const [activeCanonical,setActiveCanonical]=useState<ActiveCanonicalBundle|null>(()=>resolveActiveCanonicalBundle());
  useEffect(()=>{
    if(!activeCanonical||activeCanonical.engineVersion===CANONICAL_ENGINE_VERSION)return;
    let cancelled=false;
    // A mudança é de regra canônica, não de arquivo. Remontamos o M1–M4 a
    // partir do staging local para que campos novos (como Vl. Total do 218)
    // não dependam de o usuário reenviar uma fonte que já está válida.
    void buildCanonicalFromStoredSources().then(bundle=>{
      if(!cancelled)setActiveCanonical(activateCanonicalBundleReference(bundle));
    }).catch(()=>undefined);
    return()=>{cancelled=true};
  },[activeCanonical]);
  const activateCanonical=(bundle?:ActiveCanonicalBundle)=>setActiveCanonical(bundle?activateCanonicalBundleReference(bundle):activateApprovedCanonicalBundle());
  const rollback=()=>{deactivateCanonicalBundle();setActiveCanonical(null)};
  return <DataContext.Provider value={{activeCanonical,activateCanonical,deactivateCanonical:rollback,dataNotice:activeCanonical?`Build canônico ativo: ${activeCanonical.motorBuildId}.`:RESET_NOTICE}}>{children}</DataContext.Provider>
}
export const useData=()=>useContext(DataContext);
