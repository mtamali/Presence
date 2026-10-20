import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { RestoreBackupModal } from './modals/RestoreBackupModal'
import { backupFilename, buildBackup, decodeBackup, applyBackup, type BackupCounts, type BackupKey } from '../backup'
import { saveTextFile } from '../native/share'

type Pending = {
  text: string
  filename: string
  createdAt: string
  counts: BackupCounts
  missing: BackupKey[]
}

/**
 * Backup and restore, at the foot of Analytics.
 *
 * It lives on this screen rather than behind a settings gear because Analytics
 * is already the screen about the term as a whole, and because the quota
 * warning that drove this feature points here: archiving a finished term is how
 * a teacher stops the storage filling up.
 */
export function BackupPanel({ onToast }: { onToast: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  async function backUp() {
    setBusy(true)
    try {
      const filename = backupFilename()
      const result = await saveTextFile(filename, buildBackup(), 'application/json')
      if (!result.ok) { onToast(result.error); return }
      if (result.outcome === 'cancelled') return
      onToast(result.outcome === 'shared' ? 'Backup shared.' : `Saved ${filename}.`)
    } finally {
      setBusy(false)
    }
  }

  async function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the value is what lets the same file be chosen twice running: a
    // picker that reports no change fires no event, and the teacher's second
    // attempt would appear to do nothing.
    event.target.value = ''
    if (!file) return

    const text = await file.text()
    const decoded = decodeBackup(text)
    if (!decoded.ok) { onToast(decoded.error); return }
    setPending({
      text,
      filename: file.name,
      createdAt: decoded.backup.createdAt,
      counts: decoded.counts,
      missing: decoded.missing,
    })
  }

  function confirm() {
    if (!pending) return
    const result = applyBackup(pending.text)
    if (!result.ok) { setPending(null); onToast(result.error); return }
    /**
     * A full reload, deliberately, and with no state change before it.
     *
     * App holds sessions, courses and the timetable in React state and persists
     * each from an effect. Writing localStorage underneath them leaves the
     * screen showing the old term, and the next edit would save that stale
     * state straight over everything just restored. Reloading makes storage the
     * source of truth again, which is exactly what a restore means.
     */
    window.location.reload()
  }

  return <>
    <section className="analytics-panel backup-panel">
      <div className="analytics-head">
        <div>
          <h3>Backup</h3>
          <p>
            Everything lives on this device only — nothing is sent anywhere, and
            uninstalling the app takes it with it. A backup is one file holding
            the whole term.
          </p>
        </div>
      </div>

      <div className="backup-actions">
        <button type="button" className="button button-primary" onClick={backUp} disabled={busy}>
          <Download size={17} /> Back up everything
        </button>
        <button type="button" className="button button-light" onClick={() => fileInput.current?.click()}>
          <Upload size={17} /> Restore from backup
        </button>
        {/* Works on both platforms: Capacitor's WebView implements the file
            chooser, so this needs no native counterpart. Out of the tab order
            because the button above opens it, but still named — .visually-hidden
            keeps it in the accessibility tree, and an unnamed file input is a
            worse thing to land on than a redundant one. */}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-label="Choose a backup file"
          onChange={chosen}
          tabIndex={-1}
        />
      </div>
    </section>

    {pending && <RestoreBackupModal
      counts={pending.counts}
      missing={pending.missing}
      createdAt={pending.createdAt}
      filename={pending.filename}
      onClose={() => setPending(null)}
      onConfirm={confirm}
    />}
  </>
}
