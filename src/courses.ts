import type { Speciality } from './roster'
import { writeStore } from './storage'

export type Course = {
  /** Normalised: trimmed and uppercased. Globally unique across the list. */
  code: string
  name: string
  /** The classes this course is taught to. At least one. */
  specialities: Speciality[]
}

export const COURSE_STORAGE_KEY = 'presence-courses-v1'

/** Restricted so a code can go straight into an export filename, unsanitised. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/
const CODE_MAX = 16

export function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

export function loadCourses(): Course[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Returns undefined when the write stuck, or a message fit to show. */
export function saveCourses(courses: Course[]) {
  return writeStore(COURSE_STORAGE_KEY, courses)
}

export function findCourse(code: string, courses: Course[]): Course | undefined {
  const wanted = normalizeCode(code)
  return courses.find(course => normalizeCode(course.code) === wanted)
}

export function coursesFor(speciality: Speciality, courses: Course[]): Course[] {
  return courses.filter(course => course.specialities.includes(speciality))
}

/**
 * Returns an error message, or undefined when the draft is valid. Deliberately
 * separate from mutation and never throws: the forms call this on every change
 * and render the message inline.
 *
 * `previousCode` is the code the draft replaces when editing, so re-saving a
 * course under its own code is not read as a clash with itself.
 */
export function validateCourse(draft: Course, courses: Course[], previousCode?: string): string | undefined {
  const code = normalizeCode(draft.code)
  if (!code) return 'A course code is required.'
  if (code.length > CODE_MAX) return `A course code is at most ${CODE_MAX} characters.`
  if (!CODE_PATTERN.test(code)) return 'A course code uses letters, digits, - and _, and starts with a letter or a digit.'
  if (!draft.name.trim()) return 'A course name is required.'
  if (draft.specialities.length === 0) return 'Choose at least one class.'
  const clash = findCourse(code, courses)
  if (clash && normalizeCode(clash.code) !== normalizeCode(previousCode || '')) {
    return `${code} is already used by another course.`
  }
  return undefined
}

/** Appends, or replaces in place when the normalised code already exists. */
export function upsertCourse(course: Course, courses: Course[]): Course[] {
  const stored: Course = { ...course, code: normalizeCode(course.code), name: course.name.trim() }
  const index = courses.findIndex(item => normalizeCode(item.code) === stored.code)
  if (index === -1) return [...courses, stored]
  return courses.map((item, position) => position === index ? stored : item)
}

/**
 * No reference check here — whether a course is still used by a timetable cell
 * is the Courses screen's guard (spec §6.5), composed from `cellsUsingCourse`.
 */
export function removeCourse(code: string, courses: Course[]): Course[] {
  const wanted = normalizeCode(code)
  return courses.filter(course => normalizeCode(course.code) !== wanted)
}
