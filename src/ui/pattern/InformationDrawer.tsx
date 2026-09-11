import { createContext, useContext, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
export function InformationDrawer({ title, triggerLabel = 'Mais informações', children, attention = false }: { title: string; triggerLabel?: string; children: ReactNode; attention?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  return <><button ref={trigger} type="button" className={attention ? 'bj-attention-trigger' : 'bj-info-trigger'} aria-label={triggerLabel} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{attention ? <><span aria-hidden="true">△</span> {triggerLabel} <span aria-hidden="true">↗</span></> : 'i'}</button>{createPortal(<dialog ref={dialog} className="bj-information-drawer" aria-labelledby={id} onClose={() => trigger.current?.focus()} onClick={event => { if(event.target !== event.currentTarget)return; const box=event.currentTarget.getBoundingClientRect(); if(event.clientX < box.left || event.clientX > box.right)event.currentTarget.close() }}><div className="bj-drawer-heading"><span>Informações e orientação</span><button type="button" aria-label="Fechar explicação" onClick={() => dialog.current?.close()}>×</button></div><h2 id={id}>{title}</h2>{children}</dialog>, document.body)}</>
}
export const InformationContext = createContext<ReactNode>(null)
export function InfoHint({ text }: { text: string }) { const context = useContext(InformationContext); return <InformationDrawer title="Origem e interpretação" triggerLabel={text}><p>{text}</p>{context}</InformationDrawer> }
