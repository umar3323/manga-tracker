'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
  /** id of the heading element inside the modal for aria-labelledby */
  labelledBy?: string
  /** Tailwind z-index class, e.g. "z-50" or "z-[80]". Defaults to "z-50". */
  zIndex?: string
  /** Flex alignment + padding classes for the outer container.
   *  Defaults to bottom-sheet on mobile, centred on md+. */
  containerClass?: string
}

export default function Modal({
  onClose,
  children,
  labelledBy,
  zIndex = 'z-50',
  containerClass = 'items-end md:items-center justify-center',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  // Stable ref so the keydown handler doesn't go stale when onClose changes
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // Capture the element that opened the modal so we can restore focus on close
    triggerRef.current = document.activeElement

    // Move focus into the dialog immediately
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      )
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the element that opened the modal
      ;(triggerRef.current as HTMLElement | null)?.focus()
    }
  }, []) // mount-only — onCloseRef keeps the handler stable without re-subscribing

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex ${containerClass}`}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Dialog wrapper — display:contents keeps it layout-transparent so the
          panel remains a direct flex child of the outer container, preserving
          all existing sizing and positioning classes. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="contents"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
