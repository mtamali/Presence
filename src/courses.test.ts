import { beforeEach, describe, it, expect } from 'vitest'
import {
  normalizeCode, validateCourse, upsertCourse, removeCourse, coursesFor, findCourse,
  loadCourses, saveCourses, COURSE_STORAGE_KEY, type Course,
} from './courses'

function course(code: string, over: Partial<Course> = {}): Course {
  return { code, name: 'Automation', specialities: ['1MAUT'], ...over }
}

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  aut01 ')).toBe('AUT01')
  })
})

describe('validateCourse', () => {
  it('accepts a valid draft', () => {
    expect(validateCourse(course('AUT01'), [])).toBeUndefined()
  })

  it('rejects an empty code', () => {
    expect(validateCourse(course('   '), [])).toMatch(/code/i)
  })

  it('rejects a code longer than 16 characters', () => {
    expect(validateCourse(course('A'.repeat(17)), [])).toMatch(/16/)
  })

  it('rejects illegal characters in a code', () => {
    expect(validateCourse(course('AUT 01'), [])).toMatch(/letters/i)
    expect(validateCourse(course('-AUT01'), [])).toMatch(/letters/i)
  })

  it('rejects an empty name', () => {
    expect(validateCourse(course('AUT01', { name: '  ' }), [])).toMatch(/name/i)
  })

  it('rejects an empty speciality list', () => {
    expect(validateCourse(course('AUT01', { specialities: [] }), [])).toMatch(/class/i)
  })

  it('rejects a duplicate code, comparing normalised', () => {
    expect(validateCourse(course('aut01'), [course('AUT01')])).toMatch(/already/i)
  })

  // Editing a course and saving it under its own code is not a clash with
  // itself — the screen passes the code it is replacing.
  it('allows re-saving a course under its own code', () => {
    expect(validateCourse(course('AUT01', { name: 'Renamed' }), [course('AUT01')], 'AUT01')).toBeUndefined()
  })

  it('still rejects renaming onto another course code', () => {
    expect(validateCourse(course('ESE01'), [course('AUT01'), course('ESE01')], 'AUT01')).toMatch(/already/i)
  })
})

describe('upsertCourse', () => {
  it('appends a course that is not in the list', () => {
    expect(upsertCourse(course('ESE01'), [course('AUT01')]).map(item => item.code)).toEqual(['AUT01', 'ESE01'])
  })

  it('replaces in place when the normalised code matches', () => {
    const result = upsertCourse(course('aut01', { name: 'Renamed' }), [course('AUT01'), course('ESE01')])
    expect(result.map(item => item.code)).toEqual(['AUT01', 'ESE01'])
    expect(result[0].name).toBe('Renamed')
  })

  it('stores the code normalised and the name trimmed', () => {
    const [stored] = upsertCourse(course(' aut01 ', { name: ' Automation ' }), [])
    expect(stored).toMatchObject({ code: 'AUT01', name: 'Automation' })
  })
})

describe('coursesFor', () => {
  it('filters by speciality', () => {
    const all = [
      course('AUT01'),
      course('SHARED', { specialities: ['1MAUT', '1MESE', '4IGEI'] }),
      course('ESE01', { specialities: ['1MESE'] }),
    ]
    expect(coursesFor('1MESE', all).map(item => item.code)).toEqual(['SHARED', 'ESE01'])
  })
})

describe('findCourse', () => {
  it('looks up by normalised code', () => {
    expect(findCourse(' aut01 ', [course('AUT01')])?.name).toBe('Automation')
  })

  it('returns undefined for an unknown code', () => {
    expect(findCourse('NOPE', [course('AUT01')])).toBeUndefined()
  })
})

describe('removeCourse', () => {
  it('removes by normalised code', () => {
    expect(removeCourse('aut01', [course('AUT01'), course('ESE01')]).map(item => item.code)).toEqual(['ESE01'])
  })
})

describe('loadCourses', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(loadCourses()).toEqual([])
  })

  it('returns an empty list for malformed JSON', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, '{not json')
    expect(loadCourses()).toEqual([])
  })

  it('returns an empty list for a stored non-array', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, '{"code":"AUT01"}')
    expect(loadCourses()).toEqual([])
  })

  it('round-trips through storage', () => {
    saveCourses([course('AUT01')])
    expect(loadCourses()).toEqual([course('AUT01')])
  })
})
