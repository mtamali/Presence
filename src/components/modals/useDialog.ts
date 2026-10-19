import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

function focusable(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    // getClientRects is the dependable "is actually rendered" test here;
    // offsetParent lies about elements inside the fixed-position backdrop.
    // `aria-disabled` is deliberately not filtered: a button refusing to submit
    // still has to be reachable to explain why.
    .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0)
}

/**
 * Makes a `role="dialog" aria-modal="true"` element behave like the thing it
 * claims to be: Escape closes it, Tab cycles inside it, and focus returns to
 * whatever opened it. Declaring aria-modal without these is worse than
 * declaring nothing — it promises a screen reader that the background is inert
 * while Tab walks straight out into it.
 *
 * Put the returned ref on the dialog element itself, not on the backdrop.
 */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  // Held in a ref rather than a dependency: every one of these modals is passed
  // an inline arrow for onClose, so a fresh identity arrives on every render.
  // Depending on it would re-run the effect each time — and so run its cleanup
  // each time, pulling focus back to the opener on every keystroke typed into
  // the form.
  const close = useRef(onClose)
  close.current = onClose
  /**
   * Read during the first render, which is the last moment it is still correct:
   * React applies `autoFocus` in the commit phase, *before* passive effects
   * run, so an effect reading document.activeElement would find the dialog's
   * own first field and restore focus to a node that is about to be unmounted.
   * On this render pass the dialog's DOM does not exist yet, so this is still
   * the control that was clicked. Guarded to run once; body means nothing was
   * focused and there is nothing to give back to.
   */
  const opener = useRef<HTMLElement | null>(null)
  if (!opener.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    // Only when the dialog has not already claimed focus: a field marked
    // autoFocus has picked a better target than the first tabbable element.
    if (!dialog.contains(document.activeElement)) focusable(dialog)[0]?.focus()

    function handle(event: KeyboardEvent) {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      // Should two ever be open at once, only the newest responds.
      const open = document.querySelectorAll('[role="dialog"]')
      if (open[open.length - 1] !== dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }

      const items = focusable(dialog)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      // `outside` also covers focus having escaped already — Tab then pulls it
      // back in rather than continuing through the page behind.
      const outside = !dialog.contains(active)
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handle)
    return () => {
      document.removeEventListener('keydown', handle)
      // The opener is often gone by now — a course row deleted by the dialog's
      // own action, say — so only restore to something still in the document.
      if (opener.current?.isConnected) opener.current.focus()
    }
    // Mount and unmount only; `close` is a ref for exactly this reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
