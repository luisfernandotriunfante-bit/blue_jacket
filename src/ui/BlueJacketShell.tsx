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
        {topNavigation}
        {children}
      </div>
    </div>
  )
}
