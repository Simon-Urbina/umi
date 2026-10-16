import { useEffect, useRef, type ReactNode } from 'react'

/** Native <dialog>: focus trap, Esc to close and backdrop come from the browser. */
export default function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (open && !d?.open) d?.showModal()
    if (!open && d?.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-card p-6 text-foreground shadow-[0_24px_64px_-24px_#173a4280] backdrop:bg-[#173a42]/30"
    >
      <h2 id="modal-title" className="mb-2 font-serif text-xl font-medium">{title}</h2>
      {children}
    </dialog>
  )
}
