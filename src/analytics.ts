import { isoDate } from './format'
import { specialities as allSpecialities, type Speciality, type Student } from './roster'
import type { AttendanceSession } from './sessions'
import { SESSION_TYPES, type SessionType } from './timetable'

/**
 * Attendance aggregated across sessions, four ways.
 *
 * Everything here is pure: sessions and students come in as arguments, nothing
 * is read from localStorage, and nothing is cached. That keeps the arithmetic
 * testable without a DOM and lets the screen stay a thin renderer.
 */

/* ---- Period ---------------------------------------------------------------
   Narrowing happens before any aggregation, so a chosen period moves the
   headline figures and the breakdown together. Filtering only the list would
   leave the tiles reading all-time beside a week's worth of rows. */

export type Period = 'today' | 'week' | 'month' | 'all'

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
]

/**
 * The inclusive `YYYY-MM-DD` bounds of a period, or undefined for 'all'.
 *
 * The week runs Sunday to Saturday because the teaching week does — DAYS in
 * timetable.ts starts at Sunday — so "this week" means on this screen what it
 * means on the timetable.
 *
 * Both ends are bounded, so a session dated later this month sits inside "This
 * month" rather than being silently dropped by an open upper bound. `now` is a
 * parameter so the tests do not depend on when they run.
 */
export function periodRange(period: Period, now = new Date()): { from: string; to: string } | undefined {
  if (period === 'all') return undefined
  if (period === 'today') return { from: isoDate(now), to: isoDate(now) }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - start.getDay())  // getDay(): 0 is Sunday
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { from: isoDate(start), to: isoDate(end) }
  }
  // Day 0 of the next month is the last day of this one, leap years included.
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

/**
 * The sessions inside a period.
 *
 * `YYYY-MM-DD` sorts lexicographically, so the comparison is on strings and no
 * Date is constructed per session — which is also what keeps a timezone from
 * shifting a session across a boundary, the same reason `isoDate` exists.
 */
export function withinPeriod(sessions: AttendanceSession[], period: Period, now = new Date()): AttendanceSession[] {
  const range = periodRange(period, now)
  if (!range) return sessions
  return sessions.filter(session => session.date >= range.from && session.date <= range.to)
}

export type Tally = {
  present: number
  absent: number
  /** present + absent — the students actually observed. */
  recorded: number
  /** present / recorded, 0 to 1. Zero when nothing was recorded. */
  rate: number
}

type Counter = { present: number; absent: number }

function counter(): Counter {
  return { present: 0, absent: 0 }
}

function add(into: Counter, status: 'present' | 'absent') {
  if (status === 'present') into.present++
  else into.absent++
}

/** Get-or-create, so grouping stays one line at each call site. */
function bucket<K>(map: Map<K, Counter>, key: K): Counter {
  let found = map.get(key)
  if (!found) map.set(key, found = counter())
  return found
}

function tally(from: Counter): Tally {
  const recorded = from.present + from.absent
  return { ...from, recorded, rate: recorded ? from.present / recorded : 0 }
}

/**
 * The module's one rule: a student counts where an entry exists.
 *
 * Unchecked members are in neither the numerator nor the denominator, so a
 * closed session contributes its whole roster — closing is what fills in the
 * absences — while a half-marked live one contributes exactly who was tapped.
 * Entries for students outside `rosterIds` are ignored, as in `sessionStats`.
 */
function recordedEntries(session: AttendanceSession) {
  const members = new Set(session.rosterIds)
  const rows: { id: string; status: 'present' | 'absent' }[] = []
  for (const [id, entry] of Object.entries(session.entries)) {
    if (entry && members.has(id)) rows.push({ id, status: entry.status })
  }
  return rows
}

/**
 * Worst attendance first: the reason to open this screen is to find what is
 * going wrong. Anything with nothing recorded sorts last whatever its rate
 * says — 0% over no observations is not a bad result, it is no result. Ties
 * fall back to the label, so the order never shuffles between renders.
 */
function worstFirst<T>(of: (item: T) => Tally, named: (item: T) => string) {
  return (a: T, b: T) => {
    const left = of(a)
    const right = of(b)
    const leftHas = left.recorded > 0
    const rightHas = right.recorded > 0
    if (leftHas !== rightHas) return leftHas ? -1 : 1
    if (leftHas && left.rate !== right.rate) return left.rate - right.rate
    return named(a).localeCompare(named(b))
  }
}

export type Overview = Tally & {
  /** Sessions that recorded at least one student. */
  sessions: number
  /** Distinct students recorded at least once. */
  students: number
}

export function overview(sessions: AttendanceSession[]): Overview {
  const total = counter()
  const students = new Set<string>()
  let counted = 0

  for (const session of sessions) {
    const rows = recordedEntries(session)
    // A session nobody has been marked in yet says nothing about attendance,
    // and counting it would dilute the headline with rooms never taken.
    if (rows.length === 0) continue
    counted++
    for (const row of rows) {
      add(total, row.status)
      students.add(row.id)
    }
  }

  return { ...tally(total), sessions: counted, students: students.size }
}

export type SpecialityStat = { id: Speciality; name: string; tally: Tally }

export function bySpeciality(sessions: AttendanceSession[], students: Student[]): SpecialityStat[] {
  // Attribution follows the student, not the session: a lecture shared by two
  // classes splits into each class's own row rather than landing whole in one.
  const classOf = new Map(students.map(student => [student.id, student.speciality]))
  const counters = new Map<Speciality, Counter>()

  for (const session of sessions) {
    for (const row of recordedEntries(session)) {
      const id = classOf.get(row.id)
      if (id) add(bucket(counters, id), row.status)
    }
  }

  // Every class, in the canonical order of roster.ts. One with no sessions is
  // kept and renders as "no data" — omitting it would read as "no such class".
  return allSpecialities.map(item => ({
    id: item.id,
    name: item.name,
    tally: tally(counters.get(item.id) || counter()),
  }))
}

export type CourseTypeStat = { type: SessionType; tally: Tally }

export type CourseStat = {
  /** '' for a session recorded before courses had codes. */
  code: string
  /** `CODE · Name`, or the name alone when there is no code. */
  label: string
  tally: Tally
  /** CR/TD/TP in canonical order; empty unless the course has more than one. */
  types: CourseTypeStat[]
}

export function byCourse(sessions: AttendanceSession[]): CourseStat[] {
  type Group = { code: string; course: string; total: Counter; types: Map<SessionType, Counter> }
  const groups = new Map<string, Group>()

  for (const session of sessions) {
    // Keyed by code where there is one and by name where there is not: filing
    // every legacy session under the empty code would merge unrelated courses.
    const key = session.courseCode || session.course
    let group = groups.get(key)
    if (!group) groups.set(key, group = { code: session.courseCode, course: session.course, total: counter(), types: new Map() })
    for (const row of recordedEntries(session)) {
      add(group.total, row.status)
      // A session with no type still counts towards its course; it just cannot
      // appear in a split that names a type it never had.
      if (session.type) add(bucket(group.types, session.type), row.status)
    }
  }

  return [...groups.values()]
    .map(group => ({
      code: group.code,
      label: group.code ? `${group.code} · ${group.course}` : group.course,
      tally: tally(group.total),
      // One type is the whole course, so a split would just repeat the row.
      types: group.types.size > 1
        ? SESSION_TYPES.flatMap(type => {
          const found = group.types.get(type.id)
          return found ? [{ type: type.id, tally: tally(found) }] : []
        })
        : [],
    }))
    .sort(worstFirst(row => row.tally, row => row.label))
}

export type StudentStat = {
  student: Student
  /** Sessions whose roster included them, marked or not. */
  sessions: number
  tally: Tally
}

export function byStudent(sessions: AttendanceSession[], students: Student[]): StudentStat[] {
  const counters = new Map<string, Counter>()
  const expected = new Map<string, number>()

  for (const session of sessions) {
    for (const id of session.rosterIds) expected.set(id, (expected.get(id) || 0) + 1)
    for (const row of recordedEntries(session)) add(bucket(counters, row.id), row.status)
  }

  // Every student given, including one a re-import deactivated: the absences
  // they already have are real, and dropping them would rewrite the record.
  return students
    .map(student => ({
      student,
      sessions: expected.get(student.id) || 0,
      tally: tally(counters.get(student.id) || counter()),
    }))
    .sort(worstFirst(row => row.tally, row => `${row.student.lastName} ${row.student.firstName}`))
}
