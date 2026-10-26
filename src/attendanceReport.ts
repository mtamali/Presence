import type { Speciality, Student } from './roster'
import type { AttendanceSession } from './sessions'
import { localToday } from './format'

const HEADER = [
  'Session ID', 'Date', 'Time', 'Course code', 'Course', 'Type', 'Speciality',
  'Session state', 'Students', 'Present', 'Absent', 'Unchecked',
]

function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

type Counts = { students: number; present: number; absent: number; unchecked: number }

function emptyCounts(): Counts {
  return { students: 0, present: 0, absent: 0, unchecked: 0 }
}

/** One row per session and speciality, including the classes of a shared session. */
export function buildAttendanceReportCsv(sessions: AttendanceSession[], students: Student[]): string {
  const classOf = new Map(students.map(student => [student.id, student.speciality]))
  const rows: (string | number)[][] = []

  for (const session of [...sessions].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id))) {
    const byClass = new Map<string, Counts>(session.specialities.map(id => [id, emptyCounts()]))
    for (const id of new Set(session.rosterIds)) {
      const currentClass = classOf.get(id)
      // A student removed from a shared roster has no recoverable historical
      // speciality. Keep their count visible instead of assigning a guess.
      const assignedClass: Speciality | 'Unknown' = currentClass && session.specialities.includes(currentClass)
        ? currentClass
        : session.specialities.length === 1 ? session.specialities[0] : 'Unknown'
      let counts = byClass.get(assignedClass)
      if (!counts) byClass.set(assignedClass, counts = emptyCounts())
      counts.students++
      const status = session.entries[id]?.status
      if (status === 'present') counts.present++
      else if (status === 'absent') counts.absent++
      else counts.unchecked++
    }

    for (const [classId, counts] of byClass) {
      rows.push([
        session.id, session.date, session.time, session.courseCode, session.course,
        session.type || '', classId, session.state,
        counts.students, counts.present, counts.absent, counts.unchecked,
      ])
    }
  }

  // UTF-8 BOM lets spreadsheet apps display accented course names correctly.
  return '\uFEFF' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function attendanceReportFilename(date = localToday()) {
  return `attendance-by-speciality-${date}.csv`
}
