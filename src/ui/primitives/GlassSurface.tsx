import type { HTMLAttributes, PropsWithChildren } from 'react'

type GlassSurfaceProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    density?: 'soft' | 'dense'
    interactive?: boolean
  }
>

export function GlassSurface({
  density = 'soft',
  interactive = false,
  className = '',
  children,
  ...props
}: GlassSurfaceProps) {
  const classes = [
    'bj-glass-surface',
    density === 'dense' ? 'bj-glass-dense' : '',
    interactive ? 'bj-glass-interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}
