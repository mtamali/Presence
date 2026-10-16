import { beforeEach, describe, it, expect } from 'vitest'
import { parseStudentName, getRoster, getActiveRoster, saveRoster, ROSTER_STORAGE_KEY, type Student } from './roster'

describe('parseStudentName', () => {
  it('splits a simple LASTNAME Firstname', () => {
    expect(parseStudentName('KERBEL Seddik')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('keeps a compound uppercase surname together', () => {
    expect(parseStudentName('BEN AMAR Youcef')).toEqual({ lastName: 'BEN AMAR', firstName: 'Youcef' })
  })

  it('falls back to first-token surname when nothing is uppercase', () => {
    expect(parseStudentName('Kerbel Seddik')).toEqual({ lastName: 'Kerbel', firstName: 'Seddik' })
  })

  it('treats the last token as given name when everything is uppercase', () => {
    expect(parseStudentName('KERBEL SEDDIK')).toEqual({ lastName: 'KERBEL', firstName: 'SEDDIK' })
  })

  it('handles a single token', () => {
    expect(parseStudentName('KERBEL')).toEqual({ lastName: 'KERBEL', firstName: '' })
  })

  it('does not mistake digits for an uppercase surname', () => {
    expect(parseStudentName('38000789 Seddik')).toEqual({ lastName: '38000789', firstName: 'Seddik' })
  })

  it('collapses irregular whitespace', () => {
    expect(parseStudentName('  KERBEL   Seddik  ')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('preserves accented uppercase surnames', () => {
    expect(parseStudentName('BENALÎ Chaïma')).toEqual({ lastName: 'BENALÎ', firstName: 'Chaïma' })
  })

  it('returns empty strings for empty input', () => {
    expect(parseStudentName('   ')).toEqual({ lastName: '', firstName: '' })
  })
})

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'X', firstName: 'Y', speciality: '1MAUT', active: true, ...over }
}

describe('roster storage', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to the seed JSON when no override exists', () => {
    const seeded = getRoster('1MAUT')
    expect(seeded.length).toBe(21)
    expect(seeded.every(s => s.speciality === '1MAUT')).toBe(true)
    expect(seeded.every(s => s.active === true)).toBe(true)
  })

  it('reads the stored override in preference to the seed', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(getRoster('1MAUT').map(s => s.id)).toEqual(['A1'])
  })

  it('isolates specialities from one another', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(getRoster('1MESE').length).toBe(19)
  })

  it('excludes inactive students from the active roster but keeps them in the full roster', () => {
    saveRoster('1MAUT', [student('A1'), student('A2', { active: false })])
    expect(getActiveRoster('1MAUT').map(s => s.id)).toEqual(['A1'])
    expect(getRoster('1MAUT').map(s => s.id)).toEqual(['A1', 'A2'])
  })

  it('survives corrupt stored JSON by returning the seed', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, '{not json')
    expect(getRoster('1MAUT').length).toBe(21)
  })

  it('ignores a stored value of the wrong shape', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ '1MAUT': 'nope' }))
    expect(getRoster('1MAUT').length).toBe(21)
  })
})
