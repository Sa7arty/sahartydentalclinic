import { useEffect } from 'react'
import { createRoot, Root } from 'react-dom/client'

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="whitespace-pre-line text-sm text-navy-900">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Promise-based replacement for window.confirm() — renders an in-app modal instead of
 * relying on the browser's native confirm dialog. Some browser/webview contexts suppress
 * native dialogs or handle them unreliably (silently resolving without ever showing
 * anything to the user), which made every "Delete…" confirmation across the app a
 * potential silent no-op. Usage is a drop-in swap: `if (!(await confirmDialog('…'))) return`.
 */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    function cleanup(result: boolean) {
      root.unmount()
      container.remove()
      resolve(result)
    }

    root.render(<ConfirmModal message={message} onConfirm={() => cleanup(true)} onCancel={() => cleanup(false)} />)
  })
}
