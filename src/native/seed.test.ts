import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import embeddedState from '../data/embedded-state.json'
import { COURSE_STORAGE_KEY } from '../courses'
import { TIMETABLE_STORAGE_KEY } from '../timetable'
import { seedNativeDataIfEmpty } from './seed'

describe('Android initial data', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('loads the desktop courses and timetable into an empty native install', () => {
    seedNativeDataIfEmpty(true)
    expect(JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY)!)).toEqual(embeddedState.courses)
    expect(JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY)!)).toEqual(embeddedState.timetable)
    expect(embeddedState.timetable.filter(entry => entry.day === 3)).toHaveLength(3)
  })

  it('preserves data already entered on the device', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, '[{"code":"OWN"}]')
    seedNativeDataIfEmpty(true)
    expect(localStorage.getItem(COURSE_STORAGE_KEY)).toBe('[{"code":"OWN"}]')
    expect(localStorage.getItem(TIMETABLE_STORAGE_KEY)).toBeNull()
  })

  it('does not seed the browser', () => {
    seedNativeDataIfEmpty(false)
    expect(localStorage.getItem(COURSE_STORAGE_KEY)).toBeNull()
  })

  it('rolls back a partial seed and retries on the next launch', () => {
    const setItem = Storage.prototype.setItem
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === TIMETABLE_STORAGE_KEY) throw new DOMException('quota exceeded', 'QuotaExceededError')
      setItem.call(this, key, value)
    })

    expect(() => seedNativeDataIfEmpty(true)).not.toThrow()
    expect(localStorage.getItem(COURSE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(TIMETABLE_STORAGE_KEY)).toBeNull()

    failure.mockRestore()
    seedNativeDataIfEmpty(true)
    expect(JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY)!)).toEqual(embeddedState.courses)
    expect(JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY)!)).toEqual(embeddedState.timetable)
  })
})
