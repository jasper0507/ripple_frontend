import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Native modal boundary: the browser owns focus containment, inertness and Escape. */
export function Modal({ title, description, children, onClose, busy = false, sheet = false }: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  sheet?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const trigger = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus()
      else requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    }
  }, [])

  return (
    <dialog
      ref={ref}
      role={sheet ? undefined : 'alertdialog'}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      className={cn('modal', sheet && 'modal-sheet')}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      onClick={(event) => { if (sheet && event.target === event.currentTarget && !busy) onClose() }}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="section-title">{title}</h2>
        {description ? <p id={descriptionId} className="mt-3 text-sm leading-6 text-muted [overflow-wrap:anywhere]">{description}</p> : null}
        {children}
      </div>
    </dialog>
  )
}
