import type { PropsWithChildren, ReactNode } from 'react'

type BlueJacketShellProps = PropsWithChildren<{
  sidebar?: ReactNode
  topNavigation?: ReactNode
}>

export function BlueJacketShell({
  sidebar,
  topNavigation,
  children,
}: BlueJacketShellProps) {
  return (
    <div className="blue-jacket-shell">
      {sidebar}
      <div className="bj-content">
        <header className="bj-app-header"><div className="bj-app-brand"><img className="bj-logo" src={`${import.meta.env.BASE_URL}blue-jacket-logo.png`} alt="" /><strong>BLUE JACKET</strong></div><span>Acompanhamento comercial</span></header>{topNavigation}
        {children}
      </div>
    </div>
  )
}
