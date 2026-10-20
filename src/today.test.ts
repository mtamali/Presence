import { beforeEach, describe, expect, it } from 'vitest'
import { todayAgenda, formatToday } from './today'
import type { Course } from './courses'
import type { AttendanceSession } from './sessions'
import type { TimetableEntry } from './timetable'

// 2026-10-20 is a Tuesday — getDay() 2, a teaching day with a grid column.
const TUESDAY = new Date(2026, 9, 20, 9, 0)
// 2026-10-23 is a Friday, which the Sunday–Thursday week omits.
const FRIDAY = new Date(2026, 9, 23, 9, 0)

const courses: Course[] = [
  { code: 'RST100', name: 'Networks', specialities: ['1MAUT'] },
  { code: 'RST200', name: 'Protocols', specialities: ['4IGEI'] },
]

const entries: TimetableEntry[] = [
  // Deliberately out of slot order, to prove the agenda sorts by time.
  { day: 2, slot: 4, courseCode: 'RST200', type: 'TP', specialities: ['4IGEI'], room: 'Lab 2' },
  { day: 2, slot: 1, courseCode: 'RST100', type: 'CR', specialities: ['1MAUT'], room: 'A1' },
  // A Wednesday entry, which Tuesday must not pick up.
  { day: 3, slot: 1, courseCode: 'RST100', type: 'TD', specialities: ['1MAUT'], room: 'A1' },
]

function session(over: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: 's1', specialities: ['1MAUT'], courseCode: 'RST100', course: 'Networks', type: 'CR',
    origin: { day: 2, slot: 1 }, date: '2026-10-20', time: '08:00', room: 'A1', teacher: 'T',
    state: 'open', createdAt: '2026-10-20T08:00:00.000Z',
    rosterIds: ['a', 'b', 'c'], entries: {}, ...over,
  }
}

beforeEach(() => localStorage.clear())

describe('todayAgenda', () => {
  it('lists only today’s entries, in slot order', () => {
    const agenda = todayAgenda(entries, courses, [], TUESDAY)
    expect(agenda.dayLabel).toBe('Tuesday')
    expect(agenda.date).toBe('2026-10-20')
    expect(agenda.rows.map(row => row.entry.courseCode)).toEqual(['RST100', 'RST200'])
    expect(agenda.rows.map(row => row.slot.start)).toEqual(['08:00', '13:00'])
  })

  it('resolves the course name behind each code', () => {
    const agenda = todayAgenda(entries, courses, [], TUESDAY)
    expect(agenda.rows[0].course?.name).toBe('Networks')
  })

  it('leaves a row idle when no session has been taken for it', () => {
    const agenda = todayAgenda(entries, courses, [], TUESDAY)
    expect(agenda.rows.map(row => row.state)).toEqual(['idle', 'idle'])
    expect(agenda.rows[0].total).toBe(0)
  })

  it('counts marks against a session already open for that cell', () => {
    const live = session({
      entries: {
        a: { status: 'present', at: '2026-10-20T08:05:00.000Z', method: 'manual' },
        b: { status: 'absent', at: '2026-10-20T08:06:00.000Z', method: 'manual' },
      },
    })
    const agenda = todayAgenda(entries, courses, [live], TUESDAY)
    expect(agenda.rows[0].state).toBe('open')
    expect(agenda.rows[0].marked).toBe(2)
    expect(agenda.rows[0].total).toBe(3)
    // The other slot is untouched by the first one's session.
    expect(agenda.rows[1].state).toBe('idle')
  })

  it('reports a closed session as closed, not as open-and-fully-marked', () => {
    const agenda = todayAgenda(entries, courses, [session({ state: 'closed' })], TUESDAY)
    expect(agenda.rows[0].state).toBe('closed')
  })

  it('ignores a session for the same cell on another date', () => {
    const agenda = todayAgenda(entries, courses, [session({ date: '2026-10-13' })], TUESDAY)
    expect(agenda.rows[0].state).toBe('idle')
  })

  it('ignores an ad-hoc session, which has no cell of origin', () => {
    const agenda = todayAgenda(entries, courses, [session({ origin: undefined })], TUESDAY)
    expect(agenda.rows[0].state).toBe('idle')
  })

  it('is empty on the two days the teaching week omits', () => {
    const agenda = todayAgenda(entries, courses, [], FRIDAY)
    expect(agenda.day).toBeUndefined()
    expect(agenda.dayLabel).toBeUndefined()
    expect(agenda.rows).toEqual([])
    // The date is still today's — only the teaching day is absent.
    expect(agenda.date).toBe('2026-10-23')
    expect(agenda.nextDayLabel).toBe('Sunday')
  })

  it('offers no next day on a teaching day, where the answer is now', () => {
    expect(todayAgenda(entries, courses, [], TUESDAY).nextDayLabel).toBeUndefined()
  })

  it('survives a code with no course behind it rather than throwing', () => {
    const orphan: TimetableEntry[] = [
      { day: 2, slot: 1, courseCode: 'GONE', type: 'CR', specialities: ['1MAUT'], room: '' },
    ]
    const agenda = todayAgenda(orphan, courses, [], TUESDAY)
    expect(agenda.rows[0].course).toBeUndefined()
    expect(agenda.rows[0].entry.courseCode).toBe('GONE')
  })
})

describe('formatToday', () => {
  /**
   * Asserted part by part rather than against one string, because the parts
   * are the contract and the punctuation between them is not ours. Node and
   * Chrome ship different ICU data: the same `en-GB` options render
   * "Tuesday 20 October 2026" under the test runner and "Tuesday, 20 October
   * 2026" in the browser. Pinning either literal would make this test assert
   * which ICU built the runtime, and pass while the screen said otherwise.
   */
  it('spells out the weekday, so the date orients rather than just informs', () => {
    const formatted = formatToday(TUESDAY)
    expect(formatted).toContain('Tuesday')
    expect(formatted).toContain('20')
    expect(formatted).toContain('October')
    expect(formatted).toContain('2026')
  })

  it('names the weekday first — it is what the heading is for', () => {
    expect(formatToday(TUESDAY).startsWith('Tuesday')).toBe(true)
  })
})
