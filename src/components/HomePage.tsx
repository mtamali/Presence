import { ArrowRight, BarChart3, CalendarClock, CheckCheck, LayoutGrid, PlayCircle } from 'lucide-react'
import { ClassTags, TypeBadge } from './Tags'
import type { Page } from './AppShell'
import type { Course } from '../courses'
import { lastTeacherName, type AttendanceSession, type SessionDetails } from '../sessions'
import { formatToday, todayAgenda, type TodayRow } from '../today'
import type { TimetableEntry } from '../timetable'

/**
 * The screen the app opens on, on both platforms: what day it is, what is
 * scheduled for it, and one tap into each of those.
 *
 * It starts sessions without the timetable's confirm sheet, and that is the
 * point rather than an omission. The sheet exists to collect a date, a time and
 * a teacher; for a row that is on today, at a fixed slot, with the name carried
 * from the last session, all three are already known. A landing page whose job
 * is one-tap entry should not interpose a dialog asking what it already has.
 *
 * A mis-tap is cheap because `sessionForCell` makes the gesture idempotent: the
 * second tap on a row opens the session the first one created rather than
 * creating a second for the same hour. The deliberate path — another day, a
 * different date or teacher, editing the cell itself — stays on the timetable.
 */
export function HomePage({ entries, courses, sessions, onStart, onOpenSession, onGo }: {
  entries: TimetableEntry[]
  courses: Course[]
  sessions: AttendanceSession[]
  onStart: (details: SessionDetails) => void
  onOpenSession: (session: AttendanceSession) => void
  onGo: (page: Page) => void
}) {
  const agenda = todayAgenda(entries, courses, sessions)
  const teacher = lastTeacherName(sessions)
  const waiting = agenda.rows.filter(row => row.state === 'idle').length

  function enter(row: TodayRow) {
    // An existing session is opened, never replaced — the marks already in it
    // are the reason this is a lookup and not a create.
    if (row.session) { onOpenSession(row.session); return }
    onStart({
      specialities: row.entry.specialities,
      courseCode: row.entry.courseCode,
      // Snapshotted here for the same reason the confirm sheet snapshots it:
      // renaming the course later must not rewrite this session's history.
      course: row.course?.name || row.entry.courseCode,
      type: row.entry.type,
      origin: { day: row.entry.day, slot: row.entry.slot },
      date: agenda.date,
      time: row.slot.start,
      room: row.entry.room,
      teacher,
    })
  }

  return <section className="home">
    <div className="home-hero">
      <img className="home-logo" src="/brand/logo.svg" width="56" height="56" alt="" />
      <div className="home-hero-text">
        <p className="eyebrow small">Présence</p>
        {/* The h1 for this screen. App suppresses the shared title row here, so
            this is the page's only top-level heading, not a second one. */}
        <h1 className="home-date">{formatToday()}</h1>
        <p className="home-lede">{summary(agenda.rows.length, waiting, agenda.dayLabel, agenda.nextDayLabel)}</p>
      </div>
    </div>

    {agenda.rows.length > 0 && <>
      <div className="section-heading">
        <div><p className="eyebrow small">From your timetable</p><h2>Today’s sessions</h2></div>
        <span className="section-meta">{agenda.rows.length} scheduled</span>
      </div>

      <ul className="home-list">
        {agenda.rows.map(row => (
          <li key={`${row.entry.day}-${row.entry.slot}`}>
            <button
              className="home-row"
              data-state={row.state}
              onClick={() => enter(row)}
              aria-label={`${row.slot.start} ${row.entry.courseCode} ${row.entry.type} — ${
                row.state === 'idle' ? 'start this session' : 'open this session'}`}
            >
              <span className="home-row-time">
                <strong>{row.slot.start}</strong>
                <small>{row.slot.end}</small>
              </span>
              <span className="home-row-body">
                <span className="home-row-head">
                  <span className="home-row-code">{row.entry.courseCode}</span>
                  <TypeBadge type={row.entry.type} />
                </span>
                <span className="home-row-name">{row.course?.name || row.entry.courseCode}</span>
                <span className="home-row-meta">
                  <ClassTags specialities={row.entry.specialities} />
                  {row.entry.room && <span className="home-row-room">{row.entry.room}</span>}
                </span>
              </span>
              <span className="home-row-state">{stateLabel(row)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>}

    {agenda.rows.length === 0 && <div className="home-empty">
      <CalendarClock size={27} />
      <p className="home-empty-title">{agenda.dayLabel
        ? `Nothing scheduled for ${agenda.dayLabel}.`
        : 'No teaching today.'}</p>
      <p className="home-empty-note">{agenda.dayLabel
        ? 'Assign a course to a slot and it repeats every week.'
        : `The teaching week runs Sunday to Thursday, and resumes ${agenda.nextDayLabel}.`}</p>
      <button className="button button-primary" onClick={() => onGo('timetable')}>
        Open the timetable<ArrowRight size={17} />
      </button>
    </div>}

    {/* The rest of the app, one tap from the front door. Attendance and
        Analytics are here rather than only in the nav because on a phone the
        nav is a tab bar that the hero has just scrolled past. */}
    <div className="home-links">
      <button className="home-link" onClick={() => onGo('timetable')}>
        <CalendarClock size={19} /><span>Timetable</span>
      </button>
      <button className="home-link" onClick={() => onGo('attendance')}>
        <LayoutGrid size={19} /><span>Attendance</span>
      </button>
      <button className="home-link" onClick={() => onGo('analytics')}>
        <BarChart3 size={19} /><span>Analytics</span>
      </button>
    </div>
  </section>
}

/** The one line under the date: how much of today is left to do. */
function summary(total: number, waiting: number, dayLabel?: string, nextDayLabel?: string) {
  if (!dayLabel) return `The teaching week resumes ${nextDayLabel}.`
  if (total === 0) return 'Your timetable has nothing in it for today.'
  const sessions = `${total} session${total === 1 ? '' : 's'}`
  if (waiting === 0) return `${sessions} today, all taken.`
  if (waiting === total) return `${sessions} today, none taken yet.`
  return `${sessions} today, ${waiting} still to take.`
}

function stateLabel(row: TodayRow) {
  if (row.state === 'idle') return <><PlayCircle size={16} />Start</>
  if (row.state === 'closed') return <><CheckCheck size={16} />Closed</>
  return <><LayoutGrid size={16} />{row.marked} of {row.total}</>
}
