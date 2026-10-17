import { Check, ChevronDown, LockKeyhole, Search, X } from 'lucide-react'
import type { Student } from '../roster'
import type { AttendanceSession } from '../sessions'

export type StatusFilter = 'all' | 'present' | 'absent' | 'unchecked'

const statusLabels = { unchecked: 'Not checked', present: 'Present', absent: 'Absent' } as const

function initials(student: Student) {
  return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase()
}

function statusFor(session: AttendanceSession, student: Student) {
  return session.entries[student.id]?.status || 'unchecked'
}

/**
 * The roster panel — now the only way attendance is recorded.
 *
 * One <ul> serves both layouts: a card per student on phone, a table from
 * 48rem. The four <li> children are plain cells with no layout of their own,
 * because `display: table-cell` at 48rem would clobber it; anything that needs
 * to be a flex row lives one level further in. See roster.css.
 */
export function RosterList({ session, students, search, filter, onSearch, onFilter, onMark, onCloseSession }: {
  session: AttendanceSession
  /** The whole class. Search and filter are applied here, not by the caller. */
  students: Student[]
  search: string
  filter: StatusFilter
  onSearch: (next: string) => void
  onFilter: (next: StatusFilter) => void
  onMark: (student: Student, status: 'present' | 'absent') => void
  onCloseSession: () => void
}) {
  const open = session.state === 'open'
  const query = search.trim().toLowerCase()
  const visible = students.filter(student => {
    const haystack = `${student.firstName} ${student.lastName} ${student.id} ${student.email || ''}`.toLowerCase()
    return (!query || haystack.includes(query))
      && (filter === 'all' || statusFor(session, student) === filter)
  })

  return (
    <section className="roster-panel">
      <div className="roster-head">
        <div>
          <h3>Student roster</h3>
          <p>{open ? 'Tap a student to mark them present or absent.' : 'This session is closed — its attendance is final.'}</p>
        </div>
        <div className="roster-tools">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search students"
              placeholder="Search name or student ID"
              value={search}
              onChange={event => onSearch(event.target.value)}
            />
          </div>
          <div className="select-wrap">
            <select aria-label="Filter by attendance" value={filter} onChange={event => onFilter(event.target.value as StatusFilter)}>
              <option value="all">All students</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="unchecked">Not checked</option>
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {visible.length === 0
        ? <div className="empty-table">No students match this search or filter.</div>
        : <ul className="roster-list">
          {visible.map(student => {
            const entry = session.entries[student.id]
            const status = statusFor(session, student)
            const name = `${student.lastName} ${student.firstName}`
            return (
              <li className="roster-row" key={student.id}>
                <span className="roster-row-student">
                  <span className="student-cell">
                    <span className="avatar">{initials(student)}</span>
                    <span className="student-text">
                      <strong>{name}</strong>
                      {/* No fallback to the Student ID: the row already carries
                          it in its own cell, and printing it twice in a 315px
                          card wastes the line. */}
                      {student.email && <small>{student.email}</small>}
                    </span>
                  </span>
                </span>
                <span className="roster-row-id">{student.id}</span>
                <span className="roster-row-status">
                  <span className={`status-pill ${status}`}><span />{statusLabels[status]}</span>
                  {entry?.status === 'present' && <small className="check-time">
                    {new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {entry.method === 'scan' ? 'QR scan' : 'Manual'}
                  </small>}
                </span>
                <span className="roster-row-action">
                  {open
                    ? <span className="roster-mark">
                      {/* aria-pressed, not colour alone, carries the state. Pressing
                          an already-pressed button re-marks rather than clearing:
                          "unchecked" is the state a session starts in, not one the
                          teacher sets. */}
                      <button
                        aria-pressed={status === 'present'}
                        aria-label={`Mark ${name} present`}
                        onClick={() => onMark(student, 'present')}
                      ><Check size={17} /></button>
                      <button
                        aria-pressed={status === 'absent'}
                        aria-label={`Mark ${name} absent`}
                        onClick={() => onMark(student, 'absent')}
                      ><X size={17} /></button>
                    </span>
                    : <span className="locked-cell"><LockKeyhole size={15} /> Final</span>}
                </span>
              </li>
            )
          })}
        </ul>}

      <div className="roster-footer">
        <span>Showing {visible.length} of {students.length} students</span>
        {open && <button className="text-button" onClick={onCloseSession}>
          <LockKeyhole size={16} /> Close session &amp; mark unchecked absent
        </button>}
      </div>
    </section>
  )
}
