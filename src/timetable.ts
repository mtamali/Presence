import { findCourse, normalizeCode, type Course } from './courses'
import { isoDate } from './format'
import type { Speciality } from './roster'

/** Cours (lecture), Travaux dirigés (guided work), Travaux pratiques (practical). */
export type SessionType = 'CR' | 'TD' | 'TP'

/**
 * Sunday to Thursday — the teaching week. The indices deliberately match
 * `Date.prototype.getDay()` so no mapping is needed anywhere.
 */
export type DayIndex = 0 | 1 | 2 | 3 | 4
export type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6

export type Slot = { index: SlotIndex; start: string; end: string }

export type TimetableEntry = {
  day: DayIndex
  slot: SlotIndex
  courseCode: string
  type: SessionType
  /** One or more — a lecture shared by several classes is one entry, not three. */
  specialities: Speciality[]
  /** May be empty. */
  room: string
}

export const SESSION_TYPES: { id: SessionType; label: string }[] = [
  { id: 'CR', label: 'Lecture' },
  { id: 'TD', label: 'Guided work' },
  { id: 'TP', label: 'Practical' },
]

export const DAYS: { index: DayIndex; label: string; short: string }[] = [
  { index: 0, label: 'Sunday', short: 'Sun' },
  { index: 1, label: 'Monday', short: 'Mon' },
  { index: 2, label: 'Tuesday', short: 'Tue' },
  { index: 3, label: 'Wednesday', short: 'Wed' },
  { index: 4, label: 'Thursday', short: 'Thu' },
]

/** Frozen: 1 h 30 of teaching with 10 minutes between, 08:00 to 17:50. */
export const SLOTS: Slot[] = [
  { index: 1, start: '08:00', end: '09:30' },
  { index: 2, start: '09:40', end: '11:10' },
  { index: 3, start: '11:20', end: '12:50' },
  { index: 4, start: '13:00', end: '14:30' },
  { index: 5, start: '14:40', end: '16:10' },
  { index: 6, start: '16:20', end: '17:50' },
]

export const TIMETABLE_STORAGE_KEY = 'presence-timetable-v1'

export function loadTimetable(): TimetableEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTimetable(entries: TimetableEntry[]) {
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(entries))
}

export function entryAt(day: DayIndex, slot: SlotIndex, entries: TimetableEntry[]): TimetableEntry | undefined {
  return entries.find(entry => entry.day === day && entry.slot === slot)
}

export function entriesForDay(day: DayIndex, entries: TimetableEntry[]): TimetableEntry[] {
  return entries.filter(entry => entry.day === day).sort((a, b) => a.slot - b.slot)
}

export function cellsUsingCourse(code: string, entries: TimetableEntry[]): TimetableEntry[] {
  const wanted = normalizeCode(code)
  return entries.filter(entry => normalizeCode(entry.courseCode) === wanted)
}

/**
 * One entry per cell: this replaces whatever was there, which is what makes
 * double-booking structurally impossible rather than merely validated against.
 */
export function setEntry(entry: TimetableEntry, entries: TimetableEntry[]): TimetableEntry[] {
  return [...entries.filter(item => !(item.day === entry.day && item.slot === entry.slot)), entry]
}

export function clearEntry(day: DayIndex, slot: SlotIndex, entries: TimetableEntry[]): TimetableEntry[] {
  return entries.filter(entry => !(entry.day === day && entry.slot === slot))
}

/** Returns an error message, or undefined when the draft is valid. Never throws. */
export function validateEntry(draft: TimetableEntry, courses: Course[]): string | undefined {
  if (!DAYS.some(day => day.index === draft.day)) return 'Choose a day between Sunday and Thursday.'
  if (!SLOTS.some(slot => slot.index === draft.slot)) return 'Choose a slot between 1 and 6.'
  if (!findCourse(draft.courseCode, courses)) return 'Choose a course from the list.'
  if (!SESSION_TYPES.some(type => type.id === draft.type)) return 'Choose a session type: CR, TD or TP.'
  if (draft.specialities.length === 0) return 'Choose at least one class.'
  return undefined
}

/**
 * The date this day falls on in the week containing `today`, as `YYYY-MM-DD`.
 * Weeks start on Sunday, matching `getDay()`, so a Friday or Saturday still
 * resolves back into the teaching week that just ran.
 */
export function dateForDayInCurrentWeek(day: DayIndex, today = new Date()): string {
  // Date's constructor normalises out-of-range days, so this crosses month and
  // year boundaries without any arithmetic of our own.
  return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + day))
}

/** Today's column, or undefined on Friday and Saturday, which the grid omits. */
export function todayDayIndex(today = new Date()): DayIndex | undefined {
  const day = today.getDay()
  return day <= 4 ? day as DayIndex : undefined
}
