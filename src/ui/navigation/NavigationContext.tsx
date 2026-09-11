import { createContext, useContext } from 'react'
import type { AdminTabId } from '../../navigation'
export const NavigationContext = createContext<(tab: AdminTabId) => void>(() => {})
export const useAdminNavigation = () => useContext(NavigationContext)
