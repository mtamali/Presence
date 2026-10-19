import { describe, it, expect } from 'vitest'
import type { Student } from './roster'
import type { AttendanceEntry, AttendanceSession } from './sessions'
import { byCourse, bySpeciality, byStudent, overview, periodRange, withinPeriod } from './analytics'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}

function session(over: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: 'S1', specialities: ['1MAUT'], courseCode: 'AUT01', course: 'Automation', type: 'CR',
    date: '2026-10-11', time: '08:00', room: '', teacher: '',
    state: 'closed', createdAt: '2026-10-11T08:00:00.000Z',
    rosterIds: [], entries: {}, ...over,
  }
}

/** `{ A1: 'present' }` → the entry shape, so the tests read as attendance. */
function marks(list: Record<string, 'present' | 'absent'>): Record<string, AttendanceEntry> {
  return Object.fromEntries(Object.entries(list)
    .map(([id, status]) => [id, { status, at: 'now', method: 'manual' as const }]))
}

describe('attendance analytics', () => {
  it('reports zeros rather than NaN when nothing has been recorded', () => {
    expect(overview([])).toEqual({ present: 0, absent: 0, recorded: 0, rate: 0, sessions: 0, students: 0 })
  })

  it('counts a closed session across its whole roster', () => {
    const closed = session({ rosterIds: ['A1', 'A2', 'A3'], entries: marks({ A1: 'present', A2: 'present', A3: 'absent' }) })
    expect(overview([closed])).toEqual({ present: 2, absent: 1, recorded: 3, rate: 2 / 3, sessions: 1, students: 3 })
  })

  it('counts only the marked students of an open session', () => {
    // The rule for the whole module: a student counts where an entry exists.
    // Unchecked rows are in neither the numerator nor the denominator, so a
    // half-marked live session reads as what was actually observed.
    const open = session({ state: 'open', rosterIds: ['A1', 'A2', 'A3'], entries: marks({ A1: 'present', A2: 'absent' }) })
    expect(overview([open])).toMatchObject({ present: 1, absent: 1, recorded: 2, rate: 0.5, students: 2 })
  })

  it('ignores entries for students outside the session roster', () => {
    const stray = session({ rosterIds: ['A1'], entries: marks({ A1: 'present', GHOST: 'absent' }) })
    expect(overview([stray])).toMatchObject({ present: 1, absent: 0, recorded: 1, students: 1 })
  })

  it('counts a student once across several sessions', () => {
    const first = session({ id: 'S1', rosterIds: ['A1'], entries: marks({ A1: 'present' }) })
    const second = session({ id: 'S2', rosterIds: ['A1'], entries: marks({ A1: 'absent' }) })
    expect(overview([first, second])).toMatchObject({ recorded: 2, sessions: 2, students: 1 })
  })

  it('leaves a session with no marks out of the session count', () => {
    const untouched = session({ state: 'open', rosterIds: ['A1', 'A2'] })
    expect(overview([untouched])).toMatchObject({ recorded: 0, sessions: 0, students: 0 })
  })
})

describe('by speciality', () => {
  const roster = [
    student('M1'), student('M2'),
    student('E1', { speciality: '1MESE' }),
  ]

  it('attributes each student of a shared lecture to their own class', () => {
    // The session spans both classes, so attributing it whole to either one
    // would mix 1MESE attendance into the 1MAUT row.
    const shared = session({
      specialities: ['1MAUT', '1MESE'],
      rosterIds: ['M1', 'M2', 'E1'],
      entries: marks({ M1: 'present', M2: 'absent', E1: 'present' }),
    })
    const rows = bySpeciality([shared], roster)

    expect(rows.map(row => row.id)).toEqual(['1MAUT', '1MESE', '4IGEI'])
    expect(rows[0].tally).toMatchObject({ present: 1, absent: 1, recorded: 2, rate: 0.5 })
    expect(rows[1].tally).toMatchObject({ present: 1, absent: 0, recorded: 1, rate: 1 })
  })

  it('keeps a class with no sessions in the list, with nothing recorded', () => {
    // Dropping it would read as "this class does not exist" rather than
    // "this class has no data yet"; the page renders recorded: 0 as "No data".
    const rows = bySpeciality([], roster)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({ id: '4IGEI', tally: { recorded: 0, rate: 0 } })
  })

  it('ignores a marked student who belongs to no known roster', () => {
    const orphan = session({ rosterIds: ['ZZ'], entries: marks({ ZZ: 'present' }) })
    expect(bySpeciality([orphan], roster).every(row => row.tally.recorded === 0)).toBe(true)
  })
})

describe('by course', () => {
  it('groups by course code and sorts the worst attended first', () => {
    const good = session({ id: 'S1', courseCode: 'AUT01', course: 'Automation', rosterIds: ['A1', 'A2'], entries: marks({ A1: 'present', A2: 'present' }) })
    const bad = session({ id: 'S2', courseCode: 'ESE02', course: 'Power electronics', rosterIds: ['A1', 'A2'], entries: marks({ A1: 'absent', A2: 'present' }) })
    const rows = byCourse([good, bad])

    expect(rows.map(row => row.code)).toEqual(['ESE02', 'AUT01'])
    expect(rows[0].label).toBe('ESE02 · Power electronics')
    expect(rows[0].tally).toMatchObject({ rate: 0.5 })
  })

  it('merges every session of one course and splits them by type', () => {
    const lecture = session({ id: 'S1', type: 'CR', rosterIds: ['A1', 'A2'], entries: marks({ A1: 'present', A2: 'present' }) })
    const lab = session({ id: 'S2', type: 'TP', rosterIds: ['A1', 'A2'], entries: marks({ A1: 'absent', A2: 'absent' }) })
    const [row] = byCourse([lecture, lab])

    expect(row.tally).toMatchObject({ present: 2, absent: 2, recorded: 4, rate: 0.5 })
    // CR, TD, TP in that order regardless of which was taught first.
    expect(row.types).toEqual([
      { type: 'CR', tally: { present: 2, absent: 0, recorded: 2, rate: 1 } },
      { type: 'TP', tally: { present: 0, absent: 2, recorded: 2, rate: 0 } },
    ])
  })

  it('omits the type split when every session of a course is the same type', () => {
    const only = session({ rosterIds: ['A1'], entries: marks({ A1: 'present' }) })
    expect(byCourse([only])[0].types).toEqual([])
  })

  it('labels a legacy session by name alone and keys it by name', () => {
    // A session recorded before courses had codes has courseCode ''. Grouping
    // every such session under one empty key would merge unrelated courses.
    const legacy = session({ courseCode: '', course: 'Automatique avancée', type: undefined, rosterIds: ['A1'], entries: marks({ A1: 'present' }) })
    const other = session({ id: 'S2', courseCode: '', course: 'Traitement du signal', type: undefined, rosterIds: ['A1'], entries: marks({ A1: 'absent' }) })
    const rows = byCourse([legacy, other])

    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.label)).toEqual(['Traitement du signal', 'Automatique avancée'])
    expect(rows[1].code).toBe('')
  })

  it('sinks a course with nothing recorded below one with a zero rate', () => {
    const empty = session({ id: 'S1', courseCode: 'AAA01', course: 'Untouched', state: 'open', rosterIds: ['A1'] })
    const zero = session({ id: 'S2', courseCode: 'ZZZ99', course: 'All absent', rosterIds: ['A1'], entries: marks({ A1: 'absent' }) })
    expect(byCourse([empty, zero]).map(row => row.code)).toEqual(['ZZZ99', 'AAA01'])
  })
})

describe('by student', () => {
  const roster = [student('A1'), student('A2'), student('A3')]

  it('ranks the worst attendance first and counts expected sessions', () => {
    const first = session({ id: 'S1', rosterIds: ['A1', 'A2', 'A3'], entries: marks({ A1: 'present', A2: 'absent', A3: 'present' }) })
    const second = session({ id: 'S2', rosterIds: ['A1', 'A2'], entries: marks({ A1: 'absent', A2: 'absent' }) })
    const rows = byStudent([first, second], roster)

    expect(rows.map(row => row.student.id)).toEqual(['A2', 'A1', 'A3'])
    expect(rows[0]).toMatchObject({ sessions: 2, tally: { present: 0, absent: 2, rate: 0 } })
    expect(rows[1]).toMatchObject({ sessions: 2, tally: { present: 1, absent: 1, rate: 0.5 } })
    expect(rows[2]).toMatchObject({ sessions: 1, tally: { present: 1, absent: 0, rate: 1 } })
  })

  it('keeps a student who was never in a session, sorted below the rest', () => {
    const only = session({ rosterIds: ['A1'], entries: marks({ A1: 'absent' }) })
    const rows = byStudent([only], roster)

    expect(rows.map(row => row.student.id)).toEqual(['A1', 'A2', 'A3'])
    expect(rows[1]).toMatchObject({ sessions: 0, tally: { recorded: 0, rate: 0 } })
  })

  it('keeps a deactivated student who has history', () => {
    // A re-import that drops someone does not erase the absences they already
    // have; hiding them here would quietly rewrite the record.
    const dropped = [student('A1'), student('A2', { active: false })]
    const past = session({ rosterIds: ['A1', 'A2'], entries: marks({ A1: 'present', A2: 'absent' }) })
    const rows = byStudent([past], dropped)

    expect(rows[0]).toMatchObject({ student: { id: 'A2', active: false }, tally: { rate: 0 } })
  })

  it('breaks a tie by name so the order never shuffles', () => {
    const tied = [student('B', { lastName: 'Zidane' }), student('A', { lastName: 'Amrani' })]
    const both = session({ rosterIds: ['A', 'B'], entries: marks({ A: 'present', B: 'present' }) })
    expect(byStudent([both], tied).map(row => row.student.lastName)).toEqual(['Amrani', 'Zidane'])
  })
})

describe('period filtering', () => {
  // A Wednesday, so the week boundaries sit either side of `now` rather than
  // on it — a bug that clamps to today would still pass a Sunday fixture.
  const wednesday = new Date(2026, 9, 14, 12)

  it('leaves every session alone for all time', () => {
    const list = [session({ date: '2020-01-01' }), session({ date: '2030-12-31' })]
    expect(withinPeriod(list, 'all', wednesday)).toEqual(list)
  })

  it('has no bounds for all time', () => {
    expect(periodRange('all', wednesday)).toBeUndefined()
  })

  it('keeps today to the single day', () => {
    expect(periodRange('today', wednesday)).toEqual({ from: '2026-10-14', to: '2026-10-14' })
  })

  it('runs the week Sunday to Saturday, as the teaching week does', () => {
    expect(periodRange('week', wednesday)).toEqual({ from: '2026-10-11', to: '2026-10-17' })
  })

  it('starts the week on a Sunday that is already Sunday', () => {
    const sunday = new Date(2026, 9, 11, 12)
    expect(periodRange('week', sunday)).toEqual({ from: '2026-10-11', to: '2026-10-17' })
  })

  it('covers the calendar month end to end', () => {
    expect(periodRange('month', wednesday)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('ends February on the 29th in a leap year', () => {
    expect(periodRange('month', new Date(2024, 1, 10, 12))).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('includes both boundary days of the week and excludes the days either side', () => {
    const list = [
      session({ id: 'before', date: '2026-10-10' }),  // the Saturday before
      session({ id: 'start', date: '2026-10-11' }),   // the Sunday it opens on
      session({ id: 'end', date: '2026-10-17' }),     // the Saturday it closes on
      session({ id: 'after', date: '2026-10-18' }),   // the next Sunday
    ]
    expect(withinPeriod(list, 'week', wednesday).map(item => item.id)).toEqual(['start', 'end'])
  })

  it('includes both boundary days of the month', () => {
    const list = [
      session({ id: 'before', date: '2026-09-30' }),
      session({ id: 'first', date: '2026-10-01' }),
      session({ id: 'last', date: '2026-10-31' }),
      session({ id: 'after', date: '2026-11-01' }),
    ]
    expect(withinPeriod(list, 'month', wednesday).map(item => item.id)).toEqual(['first', 'last'])
  })

  it('keeps a session dated later this month, rather than dropping it', () => {
    // Both ends are bounded on purpose: a session booked for Friday is still
    // part of this week, and shows as having nothing recorded yet.
    const ahead = [session({ id: 'friday', date: '2026-10-16' })]
    expect(withinPeriod(ahead, 'week', wednesday).map(item => item.id)).toEqual(['friday'])
  })

  it('does not mutate the date it is given', () => {
    const now = new Date(2026, 9, 14, 12)
    periodRange('week', now)
    periodRange('month', now)
    expect(now.getTime()).toBe(new Date(2026, 9, 14, 12).getTime())
  })
})
