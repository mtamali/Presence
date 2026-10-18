import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Users, X } from 'lucide-react'
import { findCourse, type Course } from '../../courses'
import { SESSION_TYPES, type SessionType } from '../../timetable'
import { activeRosterIds, type SessionDetails } from '../../sessions'
import { specialities as allSpecialities, type Speciality } from '../../roster'
import { localToday } from '../../format'

/**
 * A session that is not on the timetable: a catch-up, a swapped room, an exam.
 *
 * It carries no `origin`, which is precisely what marks it ad-hoc — and what
 * keeps `sessionForCell` from ever matching it.
 *
 * Bottom sheet on phone, centred dialog from 48rem — see modals.css.
 */
export function CreateSessionModal({ speciality, courses, onClose, onCreate, onGoToCourses }: {
  speciality: Speciality
  courses: Course[]
  onClose: () => void
  onCreate: (details: SessionDetails) => void
  onGoToCourses: () => void
}) {
  const [courseCode, setCourseCode] = useState('')
  const [type, setType] = useState<SessionType>('CR')
  const [classes, setClasses] = useState<Speciality[]>([speciality])
  const [date, setDate] = useState(localToday())
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [room, setRoom] = useState('')
  const [teacher, setTeacher] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const course = findCourse(courseCode, courses)
  const error = !course ? 'Choose a course from the list.'
    : classes.length === 0 ? 'Choose at least one class.'
    : !date || !time ? 'A date and a start time are required.'
    : undefined
  const headcount = activeRosterIds(classes).length

  function pickCourse(code: string) {
    setCourseCode(code)
    const picked = findCourse(code, courses)
    if (picked) setClasses(picked.specialities)
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
    if (error || !course) return
    onCreate({
      specialities: classes,
      courseCode: course.code,
      course: course.name,
      type,
      date, time, room: room.trim(), teacher: teacher.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-header">
          <div className="modal-icon"><CalendarDays size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="create-title">New course session</h2>
        <p className="modal-subtitle">
          For a session that is not on the timetable. Each student starts as not checked.
        </p>

        {courses.length === 0
          ? <>
            <p className="modal-empty">No courses yet. A session needs a course, so add one first.</p>
            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="button" className="button button-primary" onClick={onGoToCourses}>Go to Courses</button>
            </div>
          </>
          : <form onSubmit={submit}>
            <label className="field">
              <span>Course <b>*</b></span>
              <div className="select-wrap">
                <select autoFocus value={courseCode} onChange={event => pickCourse(event.target.value)}>
                  <option value="">Choose a course…</option>
                  {courses.map(item => (
                    <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                  ))}
                </select>
              </div>
            </label>

            <div className="field">
              <span>Type <b>*</b></span>
              <div className="segmented" role="group" aria-label="Session type">
                {SESSION_TYPES.map(item => (
                  <button type="button" key={item.id} aria-pressed={type === item.id} onClick={() => setType(item.id)}>
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

            <div className="field-row">
              <label className="field">
                <span>Date <b>*</b></span>
                <div className="field-date">
                  <input type="date" required value={date} onChange={event => setDate(event.target.value)} />
                  <button type="button" className="today-button" onClick={() => setDate(localToday())}>Today</button>
                </div>
              </label>
              <label className="field">
                <span>Start time <b>*</b></span>
                <input type="time" required value={time} onChange={event => setTime(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Room</span>
                <input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} />
              </label>
              <label className="field">
                <span>Teacher</span>
                <input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} />
              </label>
            </div>

            <div className="modal-note">
              <Users size={18} />
              <span>{headcount} active {headcount === 1 ? 'student' : 'students'} from {classes.join(' + ') || 'no class yet'} will be included.</span>
            </div>

            {submitted && error && <p className="modal-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="submit" className="button button-primary" aria-disabled={!!error}>Start session <ArrowRight size={17} /></button>
            </div>
          </form>}
      </div>
    </div>
  )
}
