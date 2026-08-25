import React,{createContext,useContext,useState,type ReactNode} from 'react';
import { activateApprovedCanonicalBundle,deactivateCanonicalBundle,resolveActiveCanonicalBundle,type ActiveCanonicalBundle } from '../canonical/runtime';
import { RESET_NOTICE } from './migrationReset';

interface DataContextType { activeCanonical:ActiveCanonicalBundle|null; activateCanonical:()=>void; deactivateCanonical:()=>void; dataNotice:string }
const DataContext=createContext<DataContextType>({activeCanonical:null,activateCanonical:()=>undefined,deactivateCanonical:()=>undefined,dataNotice:RESET_NOTICE});
export function DataProvider({children}:{children:ReactNode}){const [activeCanonical,setActiveCanonical]=useState<ActiveCanonicalBundle|null>(()=>resolveActiveCanonicalBundle());const activateCanonical=()=>setActiveCanonical(activateApprovedCanonicalBundle());const rollback=()=>{deactivateCanonicalBundle();setActiveCanonical(null)};return <DataContext.Provider value={{activeCanonical,activateCanonical,deactivateCanonical:rollback,dataNotice:activeCanonical?`Build canônico ativo: ${activeCanonical.motorBuildId}.`:RESET_NOTICE}}>{children}</DataContext.Provider>}
export const useData=()=>useContext(DataContext);
