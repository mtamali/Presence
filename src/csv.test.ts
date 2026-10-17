import { beforeEach, describe, it, expect } from 'vitest'
import { saveRoster, type Student } from './roster'
import { createSession } from './sessions'
import { buildSessionCsv, csvFilename } from './csv'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}

const details = {
  specialities: ['1MAUT' as const],
  courseCode: 'AUT01', course: 'Automation', type: 'CR' as const,
  date: '2026-10-16', time: '09:00', room: 'Lab 04', teacher: 'T',
}

describe('buildSessionCsv', () => {
  beforeEach(() => localStorage.clear())

  it('writes a BOM and the fifteen-column header', () => {
    saveRoster('1MAUT', [student('A1')])
    const csv = buildSessionCsv(createSession(details))
    expect(csv.startsWith('\uFEFF')).toBe(true)
    // The BOM has to be the first character of the file, so it sits in front of
    // the header line — slice it off before comparing the header itself.
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      '"Speciality","Course code","Course","Type","Date","Time","Room","Teacher",'
      + '"Student ID","Last name","First name","Email","Status","Checked at","Method"'
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

  it('carries each student own class, not the session list', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('4IGEI', [student('G1', { speciality: '4IGEI' })])
    const csv = buildSessionCsv(createSession({ ...details, specialities: ['1MAUT', '4IGEI'] }))
    const [, mautRow, igeiRow] = csv.slice(1).split('\r\n')
    expect(mautRow.startsWith('"1MAUT","AUT01","Automation","CR"')).toBe(true)
    expect(igeiRow.startsWith('"4IGEI","AUT01","Automation","CR"')).toBe(true)
  })

  it('resolves every student of a three-speciality session', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('1MESE', [student('E1', { speciality: '1MESE' })])
    saveRoster('4IGEI', [student('G1', { speciality: '4IGEI' })])
    const csv = buildSessionCsv(createSession({ ...details, specialities: ['1MAUT', '1MESE', '4IGEI'] }))
    expect(csv.trim().split('\r\n')).toHaveLength(4)
    expect(csv).toContain('"LM1"')
    expect(csv).toContain('"LE1"')
    expect(csv).toContain('"LG1"')
  })

  it('exports an empty Type cell for a legacy session', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    const csv = buildSessionCsv({ ...session, courseCode: '', type: undefined })
    expect(csv.slice(1).split('\r\n')[1].startsWith('"1MAUT","","Automation",""')).toBe(true)
  })
})

describe('csvFilename', () => {
  beforeEach(() => localStorage.clear())

  it('names the file from the code, type and date', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    expect(csvFilename(session)).toBe('AUT01-CR-2026-10-16.csv')
  })

  it('falls back to the sanitised course name and the literal session', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    expect(csvFilename({ ...session, courseCode: '', type: undefined, course: 'Commande numérique' }))
      .toBe('commande-num-rique-session-2026-10-16.csv')
  })
})
