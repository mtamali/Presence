import { findCourse, type Course } from './courses'
import { isoDate } from './format'
import { sessionForCell, sessionStats, type AttendanceSession } from './sessions'
import {
  DAYS, SLOTS, entriesForDay, todayDayIndex,
  type DayIndex, type Slot, type TimetableEntry,
} from './timetable'

/**
 * Today's teaching, assembled from the three stores that each hold a third of
 * it: the timetable knows what is scheduled, the catalogue knows what the codes
 * mean, and the sessions know what has already been taken.
 *
 * It lives in its own module rather than inside the component because joining
 * those three is the only interesting thing the landing page does — everything
 * else there is markup. Pure and injectable `now`, so the tests can be Tuesday.
 */

export type TodayRow = {
  entry: TimetableEntry
  slot: Slot
  /** Absent only if storage was hand-edited; the Courses screen blocks deletes. */
  course?: Course
  /** The session already taken for this cell today, if any. */
  session?: AttendanceSession
  /**
   * What the row says about itself. 'idle' has no session yet and is the one
   * state a tap creates something from; the other two open what exists.
   */
  state: 'idle' | 'open' | 'closed'
  /** Zero unless a session exists. */
  marked: number
  total: number
}

export type TodayAgenda = {
  /** Today's `YYYY-MM-DD`, in the browser's timezone. */
  date: string
  /** Undefined on Friday and Saturday, which the teaching week omits. */
  day: DayIndex | undefined
  /** 'Sunday'…'Thursday', or undefined alongside `day`. */
  dayLabel: string | undefined
  rows: TodayRow[]
  /**
   * Where the teaching week resumes, for the two days it is paused. Undefined
   * on a teaching day, because then the answer is "now".
   */
  nextDayLabel: string | undefined
}

/**
 * The next day the grid has a column for. Friday and Saturday both resolve to
 * Sunday; every teaching day resolves to undefined, since asking what comes
 * next is only meaningful when nothing is on now.
 */
function nextTeachingDayLabel(now: Date): string | undefined {
  if (todayDayIndex(now) !== undefined) return undefined
  return DAYS[0].label
}

export function todayAgenda(
  entries: TimetableEntry[],
  courses: Course[],
  sessions: AttendanceSession[],
  now = new Date(),
): TodayAgenda {
  const day = todayDayIndex(now)
  const date = isoDate(now)
  const rows: TodayRow[] = day === undefined ? [] : entriesForDay(day, entries).map(entry => {
    // Already sorted by slot upstream, so the row order is the day's order.
    const slot = SLOTS.find(item => item.index === entry.slot) as Slot
    const session = sessionForCell(entry.day, entry.slot, date, sessions)
    const stats = session ? sessionStats(session) : undefined
    return {
      entry,
      slot,
      course: findCourse(entry.courseCode, courses),
      session,
      // A session that exists is either still being taken or finished; no
      // session at all is the only 'idle'. Reading `state` off the session
      // rather than off the counts keeps a session with nobody marked yet
      // distinct from one never started.
      state: !session ? 'idle' : session.state === 'closed' ? 'closed' : 'open',
      marked: stats ? stats.present + stats.absent : 0,
      total: stats ? stats.total : 0,
    }
  })

  return {
    date,
    day,
    dayLabel: day === undefined ? undefined : DAYS.find(item => item.index === day)?.label,
    rows,
    nextDayLabel: nextTeachingDayLabel(now),
  }
}

/**
 * Today's date as a teacher reads it — "Tuesday 20 October 2026". The shell's
 * `formatDate` is the short form used in dense lists; a landing page has the
 * room to spell it out, and the weekday is the part that orients you.
 */
export function formatToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(now)
}
