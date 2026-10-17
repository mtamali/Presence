import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Users, X } from 'lucide-react'
import { getActiveRoster, type Speciality } from '../../roster'
import { localToday } from '../../format'
import type { AttendanceSession } from '../../sessions'

/** Everything the teacher types; the rest of a session is derived on create. */
export type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

/**
 * Bottom sheet on phone, centred dialog from 48rem — see modals.css. The field
 * pairs stack on phone, so every input gets the full width of the sheet.
 */
export function CreateSessionModal({ speciality, onClose, onCreate }: {
  speciality: Speciality
  onClose: () => void
  onCreate: (details: SessionDetails) => void
}) {
  const [course, setCourse] = useState('')
  const [date, setDate] = useState(localToday())
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [room, setRoom] = useState('')
  const [teacher, setTeacher] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!course.trim() || !date || !time) return
    onCreate({ speciality, course: course.trim(), date, time, room: room.trim(), teacher: teacher.trim() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-header">
          <div className="modal-icon"><CalendarDays size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="create-title">New course session</h2>
        <p className="modal-subtitle">Set up attendance for {speciality}. Each student starts as not checked.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Course name <b>*</b></span>
            <input autoFocus required placeholder="e.g. Industrial automation" value={course} onChange={event => setCourse(event.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Date <b>*</b></span>
              <input type="date" required value={date} onChange={event => setDate(event.target.value)} />
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
            <span>{getActiveRoster(speciality).length} students from the {speciality} roster will be included.</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary">Start session <ArrowRight size={17} /></button>
          </div>
        </form>
      </div>
    </div>
  )
}
