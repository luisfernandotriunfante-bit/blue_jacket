import type { PropsWithChildren, ReactNode } from 'react'
import { ScrollTriunfanteBackdrop } from './animation/ScrollTriunfanteBackdrop'

type BlueJacketShellProps = PropsWithChildren<{
  sidebar?: ReactNode
  topNavigation?: ReactNode
  animateBackdrop?: boolean
}>

export function BlueJacketShell({
  sidebar,
  topNavigation,
  animateBackdrop = true,
  children,
}: BlueJacketShellProps) {
  return (
    <div className="blue-jacket-shell">
      {animateBackdrop ? <ScrollTriunfanteBackdrop /> : null}
      {sidebar}
      <div className="bj-content">
        {topNavigation}
        {children}
      </div>
    </div>
  )
}
