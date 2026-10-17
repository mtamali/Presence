import { beforeEach, describe, it, expect } from 'vitest'
import type { Course } from './courses'
import {
  SLOTS, DAYS, SESSION_TYPES, TIMETABLE_STORAGE_KEY,
  loadTimetable, saveTimetable, entryAt, entriesForDay, cellsUsingCourse,
  setEntry, clearEntry, validateEntry, dateForDayInCurrentWeek, todayDayIndex,
  type TimetableEntry,
} from './timetable'

const courses: Course[] = [{ code: 'AUT01', name: 'Automation', specialities: ['1MAUT'] }]

function entry(over: Partial<TimetableEntry> = {}): TimetableEntry {
  return { day: 0, slot: 1, courseCode: 'AUT01', type: 'CR', specialities: ['1MAUT'], room: 'A12', ...over }
}

describe('the frozen schedule', () => {
  it('has exactly six slots with the specified times', () => {
    expect(SLOTS).toEqual([
      { index: 1, start: '08:00', end: '09:30' },
      { index: 2, start: '09:40', end: '11:10' },
      { index: 3, start: '11:20', end: '12:50' },
      { index: 4, start: '13:00', end: '14:30' },
      { index: 5, start: '14:40', end: '16:10' },
      { index: 6, start: '16:20', end: '17:50' },
    ])
  })

  it('covers Sunday to Thursday with getDay()-compatible indices', () => {
    expect(DAYS.map(day => day.index)).toEqual([0, 1, 2, 3, 4])
    expect(DAYS[0].label).toBe('Sunday')
    expect(DAYS[4].label).toBe('Thursday')
  })

  it('offers the three session types', () => {
    expect(SESSION_TYPES.map(type => type.id)).toEqual(['CR', 'TD', 'TP'])
  })
})

describe('cell mutation', () => {
  it('replaces rather than appends when the cell is occupied', () => {
    const result = setEntry(entry({ courseCode: 'ESE01' }), [entry(), entry({ slot: 2 })])
    expect(result).toHaveLength(2)
    expect(entryAt(0, 1, result)?.courseCode).toBe('ESE01')
    expect(entryAt(0, 2, result)?.courseCode).toBe('AUT01')
  })

  it('appends when the cell is empty', () => {
    expect(setEntry(entry({ day: 3 }), [entry()])).toHaveLength(2)
  })

  it('clears only the targeted cell', () => {
    const result = clearEntry(0, 1, [entry(), entry({ slot: 2 }), entry({ day: 1 })])
    expect(entryAt(0, 1, result)).toBeUndefined()
    expect(result).toHaveLength(2)
  })

  it('returns undefined from entryAt for an empty cell', () => {
    expect(entryAt(4, 6, [entry()])).toBeUndefined()
  })
})

describe('entriesForDay', () => {
  it('returns that day ordered by slot', () => {
    const all = [entry({ slot: 5 }), entry({ day: 1, slot: 1 }), entry({ slot: 2 })]
    expect(entriesForDay(0, all).map(item => item.slot)).toEqual([2, 5])
  })
})

describe('cellsUsingCourse', () => {
  it('finds every referencing cell, comparing normalised codes', () => {
    const all = [entry(), entry({ slot: 4, courseCode: 'aut01' }), entry({ day: 2, courseCode: 'ESE01' })]
    expect(cellsUsingCourse('AUT01', all).map(item => item.slot)).toEqual([1, 4])
  })

  it('returns an empty list for an unused course', () => {
    expect(cellsUsingCourse('NOPE', [entry()])).toEqual([])
  })
})

describe('validateEntry', () => {
  it('accepts a valid draft', () => {
    expect(validateEntry(entry(), courses)).toBeUndefined()
  })

  it('rejects an out-of-range day', () => {
    expect(validateEntry(entry({ day: 5 as TimetableEntry['day'] }), courses)).toMatch(/day/i)
  })

  it('rejects an out-of-range slot', () => {
    expect(validateEntry(entry({ slot: 7 as TimetableEntry['slot'] }), courses)).toMatch(/slot/i)
  })

  it('rejects an unknown course code', () => {
    expect(validateEntry(entry({ courseCode: 'NOPE' }), courses)).toMatch(/course/i)
  })

  it('rejects an invalid type', () => {
    expect(validateEntry(entry({ type: 'XX' as TimetableEntry['type'] }), courses)).toMatch(/type/i)
  })

  it('rejects an empty speciality list', () => {
    expect(validateEntry(entry({ specialities: [] }), courses)).toMatch(/class/i)
  })
})

describe('dateForDayInCurrentWeek', () => {
  // 2026-10-18 is a Sunday, so that week runs 18 - 22 October.
  it('returns the day itself when today is that Sunday', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 18))).toBe('2026-10-18')
    expect(dateForDayInCurrentWeek(4, new Date(2026, 9, 18))).toBe('2026-10-22')
  })

  it('works back to Sunday from a mid-week day', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 21))).toBe('2026-10-18')
    expect(dateForDayInCurrentWeek(3, new Date(2026, 9, 21))).toBe('2026-10-21')
  })

  it('treats Saturday as the end of the week that just ran', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 24))).toBe('2026-10-18')
  })

  it('crosses a month boundary', () => {
    // Tuesday 1 December 2026; its week started Sunday 29 November.
    expect(dateForDayInCurrentWeek(0, new Date(2026, 11, 1))).toBe('2026-11-29')
    expect(dateForDayInCurrentWeek(4, new Date(2026, 11, 1))).toBe('2026-12-03')
  })
})

describe('todayDayIndex', () => {
  it('returns the index on a day the grid shows', () => {
    expect(todayDayIndex(new Date(2026, 9, 21))).toBe(3)
  })

  it('returns undefined on Friday and Saturday', () => {
    expect(todayDayIndex(new Date(2026, 9, 23))).toBeUndefined()
    expect(todayDayIndex(new Date(2026, 9, 24))).toBeUndefined()
  })
})

describe('loadTimetable', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(loadTimetable()).toEqual([])
  })

  it('returns an empty list for malformed JSON', () => {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, 'not json at all')
    expect(loadTimetable()).toEqual([])
  })

  it('returns an empty list for a stored non-array', () => {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, '{"day":0}')
    expect(loadTimetable()).toEqual([])
  })

  it('round-trips through storage', () => {
    saveTimetable([entry()])
    expect(loadTimetable()).toEqual([entry()])
  })
})
