import { describe, it, expect } from 'vitest'
import { formatDate, isoDate, localToday } from './format'

/**
 * These two functions exist only because the obvious implementations are wrong:
 * `toISOString` converts to UTC before taking the date, and `new Date('…')` on a
 * bare `YYYY-MM-DD` parses as UTC midnight. Both shift the calendar day either
 * side of midnight depending on where the browser is. The assertions below are
 * written to hold in every timezone, so a regression fails everywhere rather
 * than only on a machine east or west of the test author's.
 */
describe('isoDate', () => {
  it('zero-pads the month and the day', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(isoDate(new Date(2026, 10, 25))).toBe('2026-11-25')
  })

  it('reads the local calendar day at every hour, which is what toISOString gets wrong', () => {
    // Built from local components, so this is 28 February wherever it runs.
    // Any hour leaking into a neighbouring date is the exact UTC-shift bug.
    for (let hour = 0; hour < 24; hour++) {
      expect(isoDate(new Date(2026, 1, 28, hour))).toBe('2026-02-28')
    }
  })

  it('does not shift across a year boundary at either end of the day', () => {
    expect(isoDate(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31')
    expect(isoDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
  })

  it('handles a leap day', () => {
    expect(isoDate(new Date(2028, 1, 29))).toBe('2028-02-29')
  })

  it('sorts lexicographically in date order, which is what the period filters rely on', () => {
    const days = [new Date(2026, 9, 9), new Date(2026, 8, 30), new Date(2026, 9, 10)]
    expect(days.map(isoDate).sort()).toEqual(['2026-09-30', '2026-10-09', '2026-10-10'])
  })
})

describe('localToday', () => {
  it('is isoDate of now', () => {
    expect(localToday()).toBe(isoDate(new Date()))
  })

  it('is a well-formed date string', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDate', () => {
  it('renders the day it was given, including across both DST switches', () => {
    // Parsed at local noon precisely so an hour of offset either way cannot
    // push the rendered day over midnight. 29 March and 25 October are the
    // European transitions; a UTC-midnight parse would move at least one.
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDate('2026-03-29')).toBe('29 Mar 2026')
    expect(formatDate('2026-10-25')).toBe('25 Oct 2026')
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('round-trips whatever isoDate produced', () => {
    const date = new Date(2026, 9, 19, 23, 45)
    expect(formatDate(isoDate(date))).toBe('19 Oct 2026')
  })

  it('renders nothing for an empty value rather than Invalid Date', () => {
    // A session created before dates were required still has to draw.
    expect(formatDate('')).toBe('')
  })
})
