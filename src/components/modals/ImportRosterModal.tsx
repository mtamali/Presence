import { useState } from 'react'
import { FileSpreadsheet, Upload, UserPlus, X } from 'lucide-react'
import { applyRosterImport, previewRosterImport, type RosterImportPreview } from '../../classroomImport'
import type { Speciality, Student } from '../../roster'

/** How many rows of each list to show before collapsing into a count. */
const PREVIEW_LIMIT = 8

function fullName(student: Student) {
  return `${student.lastName} ${student.firstName}`.trim()
}

/**
 * Replaces one speciality's roster from a CSV/TSV file.
 *
 * Nothing is written until the teacher confirms: the file is parsed into a
 * preview first, so the three counts and the issue list are visible while the
 * current roster is still intact.
 */
export function ImportRosterModal({ speciality, currentRoster, onClose, onApply }: {
  speciality: Speciality
  /** The full stored roster, inactive students included — they must survive the merge. */
  currentRoster: Student[]
  onClose: () => void
  onApply: (students: Student[]) => void
}) {
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<RosterImportPreview | null>(null)
  const [error, setError] = useState('')

  async function readFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    setError('')
    try {
      setPreview(previewRosterImport(await file.text(), speciality, currentRoster))
    } catch (problem) {
      // previewRosterImport throws only for a missing or unreadable header row.
      setError(problem instanceof Error ? problem.message : 'The file could not be read.')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-header">
          <div className="modal-icon"><UserPlus size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="import-title">Update the {speciality} roster</h2>
        <p className="modal-subtitle">
          Upload the class list for {speciality}. It needs a Student ID column and a Name column;
          an Email column is used when present.
        </p>

        <label className="upload-field">
          <Upload size={23} />
          <strong>{fileName || 'Choose a CSV or TSV file'}</strong>
          <span>Headers may be English or French — Student ID / Matricule, Name / Nom, Email / Courriel.</span>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={event => readFile(event.target.files?.[0])} />
        </label>

        {error && <p className="import-error" role="alert">{error}</p>}

        {preview && <>
          <div className="import-preview">
            <div className="import-preview-counts">
              <span><strong>{preview.added.length}</strong>Added</span>
              <span><strong>{preview.updated.length}</strong>Updated</span>
              <span><strong>{preview.deactivated.length}</strong>Deactivated</span>
            </div>

            {preview.added.length > 0 && <div className="import-preview-list">
              <h3>New students</h3>
              {preview.added.slice(0, PREVIEW_LIMIT).map(student => (
                <div key={student.id}>
                  <span>{fullName(student)}<small>{student.id}</small></span>
                  <span>{student.email || '—'}</span>
                </div>
              ))}
              {preview.added.length > PREVIEW_LIMIT && <p>…and {preview.added.length - PREVIEW_LIMIT} more.</p>}
            </div>}

            {preview.deactivated.length > 0 && <div className="import-preview-list">
              <h3>Missing from the file</h3>
              {preview.deactivated.slice(0, PREVIEW_LIMIT).map(student => (
                <div key={student.id}>
                  <span>{fullName(student)}<small>{student.id}</small></span>
                  <span>Marked inactive</span>
                </div>
              ))}
              {preview.deactivated.length > PREVIEW_LIMIT && <p>…and {preview.deactivated.length - PREVIEW_LIMIT} more.</p>}
            </div>}

            {preview.issues.length > 0 && <div className="import-issues">
              <h3>{preview.issues.length} {preview.issues.length === 1 ? 'row needs' : 'rows need'} attention</h3>
              {preview.issues.slice(0, PREVIEW_LIMIT).map((issue, index) => (
                <p key={`${issue.name}-${index}`}><strong>{issue.name}</strong> — {issue.reason}</p>
              ))}
              {preview.issues.length > PREVIEW_LIMIT && <p>…and {preview.issues.length - PREVIEW_LIMIT} more.</p>}
            </div>}
          </div>

          <div className="modal-note">
            <FileSpreadsheet size={18} />
            <span>
              {preview.totalRows} {preview.totalRows === 1 ? 'row' : 'rows'} read. Students missing from the
              file are kept and marked inactive, never deleted, so their past attendance stays intact.
            </span>
          </div>
        </>}

        <div className="modal-actions">
          <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="button button-primary"
            disabled={!preview}
            onClick={() => preview && onApply(applyRosterImport(preview))}
          >
            Update roster
          </button>
        </div>
      </div>
    </div>
  )
}
