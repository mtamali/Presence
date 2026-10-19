import { useState, type FormEvent } from 'react'
import { BookMarked, X } from 'lucide-react'
import { normalizeCode, validateCourse, type Course } from '../../courses'
import { specialities as allSpecialities, type Speciality } from '../../roster'
import { useDialog } from './useDialog'

/**
 * Add or edit one course. `editing` is the course being replaced, or null when
 * adding; it is also what lets the validator tell "re-saving AUT01" apart from
 * "adding a second AUT01".
 */
export function CourseModal({ courses, speciality, editing, onClose, onSave }: {
  courses: Course[]
  /** The active class, pre-ticked when adding — it is the one we know is wanted. */
  speciality: Speciality
  editing: Course | null
  onClose: () => void
  onSave: (course: Course) => void
}) {
  const [code, setCode] = useState(editing?.code || '')
  const [name, setName] = useState(editing?.name || '')
  const [classes, setClasses] = useState<Speciality[]>(editing?.specialities || [speciality])
  const [submitted, setSubmitted] = useState(false)
  const dialog = useDialog(onClose)

  const draft: Course = { code, name, specialities: classes }
  const error = validateCourse(draft, courses, editing?.code)

  function toggle(id: Speciality) {
    // Rebuilt from the canonical list rather than appended to, so the stored
    // order never depends on the order the chips were tapped.
    setClasses(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      return allSpecialities.filter(item => next.includes(item.id)).map(item => item.id)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    onSave({ ...draft, code: normalizeCode(code), name: name.trim() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="course-title">
        <div className="modal-header">
          <div className="modal-icon"><BookMarked size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="course-title">{editing ? `Edit ${editing.code}` : 'New course'}</h2>
        <p className="modal-subtitle">
          The code identifies this course everywhere — on the timetable, in the session header and in every export.
        </p>
        <form onSubmit={submit}>
          <div className="field-row">
            <label className="field">
              <span>Code <b>*</b></span>
              {/* Uppercased as it is typed so what is stored is what is seen. */}
              <input
                autoFocus
                maxLength={16}
                placeholder="e.g. AUT01"
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              <span>Name <b>*</b></span>
              <input placeholder="e.g. Industrial automation" value={name} onChange={event => setName(event.target.value)} />
            </label>
          </div>

          <div className="field">
            <span>Classes <b>*</b></span>
            <div className="chip-row">
              {allSpecialities.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className="chip-toggle"
                  aria-pressed={classes.includes(item.id)}
                  onClick={() => toggle(item.id)}
                >
                  {item.shortName}
                </button>
              ))}
            </div>
          </div>

          {/* Shown only after a submit attempt: flagging an empty code while the
              teacher is still typing it would be nagging, not helping. */}
          {submitted && error && <p className="modal-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary">{editing ? 'Save course' : 'Add course'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
