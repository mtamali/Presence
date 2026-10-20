import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { BACKUP_KEYS, type BackupCounts, type BackupKey } from '../../backup'
import { COURSE_STORAGE_KEY } from '../../courses'
import { ROSTER_STORAGE_KEY } from '../../roster'
import { SESSION_STORAGE_KEY } from '../../sessions'
import { TIMETABLE_STORAGE_KEY } from '../../timetable'
import { formatDate } from '../../format'
import { useDialog } from './useDialog'

const STORE_LABELS: Record<BackupKey, string> = {
  [SESSION_STORAGE_KEY]: 'attendance sessions',
  [COURSE_STORAGE_KEY]: 'courses',
  [TIMETABLE_STORAGE_KEY]: 'the timetable',
  [ROSTER_STORAGE_KEY]: 'class rosters',
}

/** "a", "a and b", "a, b and c" — no serial comma, matching the rest of the copy. */
function list(keys: readonly BackupKey[]) {
  return keys.map(key => STORE_LABELS[key]).join(', ').replace(/, ([^,]*)$/, ' and $1')
}

/**
 * The confirmation step of a restore.
 *
 * Restoring is the most destructive thing this app can do to itself, and the
 * file is opaque until it is opened — so the counts are shown *before* anything
 * is written. They come from the file being offered, not from the device.
 */
export function RestoreBackupModal({ counts, missing, createdAt, filename, onClose, onConfirm }: {
  counts: BackupCounts
  /** Stores this file says nothing about; they survive the restore untouched. */
  missing: BackupKey[]
  createdAt: string
  filename: string
  onClose: () => void
  onConfirm: () => void
}) {
  const dialog = useDialog(onClose)
  const replaced = BACKUP_KEYS.filter(key => !missing.includes(key))
  const day = createdAt.slice(0, 10)

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <div className="modal-header">
          <div className="modal-icon"><RotateCcw size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="restore-title">Restore this backup?</h2>
        <p className="modal-subtitle">
          {filename}{day && <> · taken {formatDate(day)}</>}
        </p>

        <ul className="backup-counts">
          <li><b>{counts.sessions}</b> {counts.sessions === 1 ? 'session' : 'sessions'}</li>
          <li><b>{counts.courses}</b> {counts.courses === 1 ? 'course' : 'courses'}</li>
          <li><b>{counts.timetable}</b> timetable {counts.timetable === 1 ? 'slot' : 'slots'}</li>
          <li><b>{counts.rosters}</b> {counts.rosters === 1 ? 'class roster' : 'class rosters'}{counts.students > 0 && <> · {counts.students} {counts.students === 1 ? 'student' : 'students'}</>}</li>
        </ul>

        <p className="modal-note modal-note-warn" role="status">
          <AlertTriangle size={18} />
          <span>
            This replaces {list(replaced)} on this device. Anything recorded
            since the backup was taken is lost.
            {/* The labels are prose, and some are plural while naming one store
                ("attendance sessions"), so nothing here may agree with a label:
                "attendance sessions is not in this file" was the first attempt.
                Keeping them in object position puts the agreement on "part",
                which `missing.length` does know about. */}
            {missing.length > 0 && <> This file does not include {list(missing)} — {missing.length === 1
              ? 'that part of this device is'
              : 'those parts of this device are'} left untouched.</>}
          </span>
        </p>

        <div className="modal-actions">
          <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
          {/* The app reloads on success, so this is the last thing the teacher
              sees before the restored term appears. */}
          <button type="button" className="button button-danger" onClick={onConfirm}>
            <RotateCcw size={16} /> Replace my data
          </button>
        </div>
      </div>
    </div>
  )
}
