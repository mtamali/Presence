import { useState, type FormEvent } from 'react'
import { CalendarClock, ChevronDown, X } from 'lucide-react'
import { findCourse, type Course } from '../../courses'
import {
  DAYS, SESSION_TYPES, SLOTS, validateEntry,
  type DayIndex, type SessionType, type SlotIndex, type TimetableEntry,
} from '../../timetable'
import { specialities as allSpecialities, type Speciality } from '../../roster'

/**
 * Fills, edits or clears one timetable cell.
 *
 * The course list is every course, not just the active class's: the timetable is
 * global (one grid for all specialities), so the speciality picker is hidden on
 * this screen and cannot be used to narrow anything.
 */
export function AssignCellModal({ day, slot, entry, courses, onClose, onSave, onClear, onGoToCourses }: {
  day: DayIndex
  slot: SlotIndex
  /** The cell's current entry, or null when empty. */
  entry: TimetableEntry | null
  courses: Course[]
  onClose: () => void
  onSave: (entry: TimetableEntry) => void
  onClear: () => void
  onGoToCourses: () => void
}) {
  const [courseCode, setCourseCode] = useState(entry?.courseCode || '')
  const [type, setType] = useState<SessionType>(entry?.type || 'CR')
  const [classes, setClasses] = useState<Speciality[]>(entry?.specialities || [])
  const [room, setRoom] = useState(entry?.room || '')
  const [submitted, setSubmitted] = useState(false)

  const dayLabel = DAYS.find(item => item.index === day)!.label
  const slotTime = SLOTS.find(item => item.index === slot)!
  const draft: TimetableEntry = { day, slot, courseCode, type, specialities: classes, room }
  const error = validateEntry(draft, courses)

  function pickCourse(code: string) {
    setCourseCode(code)
    // Pre-fill from the course's own classes. Guidance, not a constraint: the
    // chips stay editable because a class can join a course mid-year.
    const course = findCourse(code, courses)
    if (course) setClasses(course.specialities)
  }

  function toggle(id: Speciality) {
    setClasses(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      return allSpecialities.filter(item => next.includes(item.id)).map(item => item.id)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    onSave({ ...draft, room: room.trim() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="assign-title">
        <div className="modal-header">
          <div className="modal-icon"><CalendarClock size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="assign-title">{dayLabel} · {slotTime.start}–{slotTime.end}</h2>
        <p className="modal-subtitle">This repeats every week. Tap the cell on the day itself to take attendance.</p>

        {courses.length === 0
          ? <>
            <p className="modal-empty">No courses yet. A timetable cell holds a course, so add one first.</p>
            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="button" className="button button-primary" onClick={onGoToCourses}>Go to Courses</button>
            </div>
          </>
          : <form onSubmit={submit}>
            <label className="field">
              <span>Course <b>*</b></span>
              {/* A native select: it is the one picker that is already a
                  full-height, scrollable, searchable list on every phone.
                  The chevron is the control's only affordance — `.select-wrap`
                  sets `appearance: none` and reserves the room for it. */}
              <div className="select-wrap">
                <select value={courseCode} onChange={event => pickCourse(event.target.value)}>
                  <option value="">Choose a course…</option>
                  {courses.map(course => (
                    <option key={course.code} value={course.code}>{course.code} — {course.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <div className="field">
              <span>Type <b>*</b></span>
              <div className="segmented" role="group" aria-label="Session type">
                {SESSION_TYPES.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={type === item.id}
                    onClick={() => setType(item.id)}
                  >
                    <strong>{item.id}</strong><span>{item.label}</span>
                  </button>
                ))}
              </div>
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

            <label className="field">
              <span>Room</span>
              <input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} />
            </label>

            {submitted && error && <p className="modal-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              {entry && <button type="button" className="button button-light" onClick={onClear}>Clear cell</button>}
              <button type="submit" className="button button-primary">Save</button>
            </div>
          </form>}
      </div>
    </div>
  )
}
