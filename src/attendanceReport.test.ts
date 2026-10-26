import { describe, expect, it } from 'vitest'
import { buildAttendanceReportCsv, attendanceReportFilename } from './attendanceReport'
import type { Student } from './roster'
import type { AttendanceSession } from './sessions'

const students: Student[] = [
  { id: 'A', lastName: 'A', firstName: 'A', speciality: '1MAUT', active: true },
  { id: 'B', lastName: 'B', firstName: 'B', speciality: '1MAUT', active: true },
  { id: 'C', lastName: 'C', firstName: 'C', speciality: '4IGEI', active: true },
]

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: 'session-1', specialities: ['1MAUT', '4IGEI'], courseCode: 'M115',
    course: 'Advanced Python', type: 'CR', date: '2026-10-25', time: '11:20',
    room: 'K', teacher: 'Teacher', state: 'open', createdAt: '2026-10-25T11:20:00Z',
    rosterIds: ['A', 'B', 'C'], entries: {
      A: { status: 'present', at: '2026-10-25T11:30:00Z', method: 'scan' },
      B: { status: 'absent', at: '2026-10-25T11:30:00Z', method: 'manual' },
    },
    ...overrides,
  }
}

function reportRows(sessions: AttendanceSession[], roster = students) {
  return buildAttendanceReportCsv(sessions, roster).slice(1).split('\r\n').map(row => row.replace(/"/g, '').split(','))
}

describe('attendance report', () => {
  it('counts a shared CR session separately by speciality and keeps unchecked distinct from absent', () => {
    const [header, maut, igei] = reportRows([session()])
    expect(header).toEqual([
      'Session ID', 'Date', 'Time', 'Course code', 'Course', 'Type', 'Speciality',
      'Session state', 'Students', 'Present', 'Absent', 'Unchecked',
    ])
    expect(maut.slice(5)).toEqual(['CR', '1MAUT', 'open', '2', '1', '1', '0'])
    expect(igei.slice(5)).toEqual(['CR', '4IGEI', 'open', '1', '0', '0', '1'])
  })

  it('labels TD and TP sessions and counts closed absences', () => {
    const td = session({ id: 'td', type: 'TD', date: '2026-10-26', specialities: ['1MAUT'], rosterIds: ['A'] })
    const tp = session({ id: 'tp', type: 'TP', date: '2026-10-27', specialities: ['4IGEI'],
      rosterIds: ['C'], state: 'closed', entries: { C: { status: 'absent', at: '2026-10-27T12:00:00Z', method: 'session-close' } } })
    const rows = reportRows([tp, td])
    expect(rows[1].slice(5)).toEqual(['TD', '1MAUT', 'open', '1', '1', '0', '0'])
    expect(rows[2].slice(5)).toEqual(['TP', '4IGEI', 'closed', '1', '0', '1', '0'])
  })

  it('keeps unresolvable students in an Unknown row and ignores entries outside the session', () => {
    const csv = buildAttendanceReportCsv([session({ rosterIds: ['A', 'missing'], entries: {
      A: { status: 'present', at: '', method: 'manual' },
      outsider: { status: 'present', at: '', method: 'scan' },
    } })], students)
    const rows = csv.slice(1).split('\r\n')
    expect(rows.some(row => row.includes('"Unknown","open","1","0","0","1"'))).toBe(true)
    expect(rows.some(row => row.includes('"1MAUT","open","1","1","0","0"'))).toBe(true)
  })

  it('neutralises spreadsheet formulas in course labels', () => {
    const csv = buildAttendanceReportCsv([session({ course: '=unsafe' })], students)
    expect(csv).toContain('"\'=unsafe"')
  })

  it('uses a dated filename', () => {
    expect(attendanceReportFilename('2026-10-26')).toBe('attendance-by-speciality-2026-10-26.csv')
  })
})
