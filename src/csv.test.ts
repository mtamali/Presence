import { beforeEach, describe, it, expect } from 'vitest'
import { saveRoster, type Student } from './roster'
import { createSession } from './sessions'
import { buildSessionCsv } from './csv'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}

const details = {
  speciality: '1MAUT' as const,
  course: 'Automation', date: '2026-10-16', time: '09:00', room: 'Lab 04', teacher: 'T',
}

describe('buildSessionCsv', () => {
  beforeEach(() => localStorage.clear())

  it('writes a BOM and the expected header', () => {
    saveRoster('1MAUT', [student('A1')])
    const csv = buildSessionCsv(createSession(details))
    expect(csv.startsWith('\uFEFF')).toBe(true)
    // The BOM has to be the first character of the file, so it sits in front of
    // the header line — slice it off before comparing the header itself.
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      '"Speciality","Course","Date","Time","Room","Teacher","Student ID","Last name","First name","Email","Status","Checked at","Method"'
    )
  })

  it('emits one row per snapshot member', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    expect(buildSessionCsv(createSession(details)).trim().split('\r\n').length).toBe(3)
  })

  it('includes deactivated students who are in the snapshot', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    saveRoster('1MAUT', [student('A1', { active: false })])
    expect(buildSessionCsv(session)).toContain('"LA1"')
  })

  it('reports unchecked students', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(buildSessionCsv(createSession(details))).toContain('"unchecked"')
  })

  it('escapes embedded quotes by doubling them', () => {
    saveRoster('1MAUT', [student('A1', { lastName: 'O"BRIEN' })])
    expect(buildSessionCsv(createSession(details))).toContain('"O""BRIEN"')
  })

  it('neutralises formula injection', () => {
    saveRoster('1MAUT', [student('A1', { lastName: '=cmd|calc' })])
    expect(buildSessionCsv(createSession(details))).toContain(`"'=cmd|calc"`)
  })

  it('still names a student who vanished from the roster entirely', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    saveRoster('1MAUT', [])
    expect(buildSessionCsv(session)).toContain('"A1"')
  })
})
