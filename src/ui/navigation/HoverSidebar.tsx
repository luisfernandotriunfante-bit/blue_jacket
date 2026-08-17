import type { ReactNode } from 'react'

export type SidebarItem = {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  active?: boolean
  onSelect?: () => void
}

type HoverSidebarProps = {
  brand?: ReactNode
  items?: SidebarItem[]
  footer?: ReactNode
  forceOpen?: boolean
  ariaLabel?: string
}

export function HoverSidebar({
  brand,
  items = [],
  footer,
  forceOpen = false,
  ariaLabel = 'Navegação principal',
}: HoverSidebarProps) {
  return (
    <aside className="bj-sidebar" data-open={forceOpen ? 'true' : 'false'} aria-label={ariaLabel}>
      {brand ? <div className="bj-sidebar-brand">{brand}</div> : null}

      <nav className="bj-sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="bj-sidebar-item"
            aria-current={item.active ? 'page' : undefined}
            onClick={(e) => {
              item.onSelect?.()
              e.currentTarget.blur()
            }}
          >
            {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
            <span>
              <strong>{item.label}</strong>
              {item.description ? <small>{item.description}</small> : null}
            </span>
          </button>
        ))}
      </nav>

      {footer ? <div className="bj-sidebar-footer">{footer}</div> : null}
    </aside>
  )
}
