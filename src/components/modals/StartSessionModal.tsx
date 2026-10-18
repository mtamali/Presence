import { useState, type FormEvent } from 'react'
import { ArrowRight, Pencil, PlayCircle, Users, X } from 'lucide-react'
import { ClassTags, TypeBadge } from '../Tags'
import { activeRosterIds, type AttendanceSession, type SessionDetails } from '../../sessions'
import { DAYS, SLOTS, dateForDayInCurrentWeek, type TimetableEntry } from '../../timetable'
import { formatDate, localToday } from '../../format'
import type { Course } from '../../courses'

/**
 * Turns a timetable cell into a live attendance session.
 *
 * Course, type and classes come from the cell and are not editable here — the
 * cell is the authority, and this sheet exists to confirm a date, not to redesign
 * the week. `onEdit` goes back to the assign sheet for that.
 */
export function StartSessionModal({ entry, course, existing, defaultTeacher, onClose, onStart, onOpen, onEdit }: {
  entry: TimetableEntry
  course: Course | undefined
  /** A session already recorded for this cell on this date, if any. */
  existing: AttendanceSession | undefined
  defaultTeacher: string
  onClose: () => void
  onStart: (details: SessionDetails) => void
  onOpen: (session: AttendanceSession) => void
  onEdit: () => void
}) {
  const slot = SLOTS.find(item => item.index === entry.slot)!
  const dayLabel = DAYS.find(item => item.index === entry.day)!.label
  const [date, setDate] = useState(dateForDayInCurrentWeek(entry.day))
  const [time, setTime] = useState(slot.start)
  const [teacher, setTeacher] = useState(defaultTeacher)

  // Across every class on the cell: a shared lecture's roster is the sum of them.
  const headcount = activeRosterIds(entry.specialities).length

  function submit(event: FormEvent) {
    event.preventDefault()
    if (existing) { onOpen(existing); return }
    if (!date || !time) return
    onStart({
      specialities: entry.specialities,
      courseCode: entry.courseCode,
      // The name is snapshotted now, so renaming the course later never rewrites
      // this session's history.
      course: course?.name || entry.courseCode,
      type: entry.type,
      origin: { day: entry.day, slot: entry.slot },
      date, time, room: entry.room, teacher: teacher.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <div className="modal-header">
          <div className="modal-icon"><PlayCircle size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="start-title">{entry.courseCode} · {course?.name || 'Course'}</h2>
        <div className="start-identity">
          <TypeBadge type={entry.type} />
          <ClassTags specialities={entry.specialities} />
          {entry.room && <span className="start-room">{entry.room}</span>}
        </div>
        <p className="modal-subtitle">{dayLabel}, slot {entry.slot} · {slot.start}–{slot.end}</p>

        <form onSubmit={submit}>
          {existing
            // A mis-tap on a phone can therefore never create a duplicate session
            // for the same cell on the same day.
            ? <p className="modal-note" role="status">
              <Users size={18} />
              <span>A session for this slot already exists on {formatDate(existing.date)} — {existing.state === 'open' ? 'still open' : 'closed'}. Open it instead of starting a second one.</span>
            </p>
            : <>
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
              <label className="field">
                <span>Teacher</span>
                <input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} />
              </label>
              <div className="modal-note">
                <Users size={18} />
                <span>{headcount} active {headcount === 1 ? 'student' : 'students'} from {entry.specialities.join(' + ')} will be included.</span>
              </div>
            </>}

          <div className="modal-actions">
            <button type="button" className="button button-light" onClick={onEdit}><Pencil size={16} /> Edit cell</button>
            <button type="submit" className="button button-primary">
              {existing ? 'Open existing session' : <>Start session <ArrowRight size={17} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
