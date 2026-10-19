import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { writeStore } from './storage'
import { saveCourses, COURSE_STORAGE_KEY } from './courses'
import { saveRoster } from './roster'
import { saveSessions } from './sessions'
import { saveTimetable } from './timetable'

/** Makes the next `setItem` behave like a browser whose quota is exhausted. */
function fillTheDisk() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('exceeded the quota', 'QuotaExceededError')
  })
}

describe('writeStore', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('stores the value as JSON and reports no error', () => {
    expect(writeStore('k', [1, 2])).toBeUndefined()
    expect(localStorage.getItem('k')).toBe('[1,2]')
  })

  it('returns a message instead of throwing when the quota is exhausted', () => {
    fillTheDisk()
    const message = writeStore('k', [1, 2])
    expect(message).toBeTruthy()
    // The teacher has to learn two things: it is not saved, and what to do.
    expect(message).toMatch(/not being saved/)
    expect(message).toMatch(/[Ee]xport/)
  })
})

/**
 * The reason writeStore exists: these four are called from effects in App, so a
 * throw escaping any of them reaches React's commit phase and unmounts the app.
 * Each must come back with the failure in hand instead.
 */
describe('every store reports a failed write rather than throwing', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  const entry = { day: 0 as const, slot: 1 as const, courseCode: 'AUT01', type: 'CR' as const, specialities: ['1MAUT' as const], room: 'Lab 04' }
  const student = { id: 'A1', lastName: 'L', firstName: 'F', speciality: '1MAUT' as const, active: true }

  it.each([
    ['sessions', () => saveSessions([])],
    ['courses', () => saveCourses([{ code: 'AUT01', name: 'Automation', specialities: ['1MAUT'] }])],
    ['timetable', () => saveTimetable([entry])],
    ['roster', () => saveRoster('1MAUT', [student])],
  ])('%s', (_name, save) => {
    expect(save()).toBeUndefined()   // succeeds while there is room

    fillTheDisk()
    expect(save).not.toThrow()
    expect(save()).toBeTruthy()
  })

  it('leaves what was already stored readable after a failed write', () => {
    saveCourses([{ code: 'AUT01', name: 'Automation', specialities: ['1MAUT'] }])
    const stored = localStorage.getItem(COURSE_STORAGE_KEY)

    fillTheDisk()
    saveCourses([{ code: 'AUT02', name: 'Robotics', specialities: ['1MAUT'] }])

    // A refused write is not a destructive one: the last good state survives,
    // which is what the reload offered by the crash screen falls back to.
    expect(localStorage.getItem(COURSE_STORAGE_KEY)).toBe(stored)
  })
})
