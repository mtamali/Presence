import { getRoster, specialities as allSpecialities, type Student } from './roster'
import type { AttendanceSession } from './sessions'
import { saveTextFile } from './native/share'

function csvCell(value: string) {
  // Leading =, +, @ or - make spreadsheets treat the cell as a formula.
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const HEADER = [
  'Speciality', 'Course code', 'Course', 'Type', 'Date', 'Time', 'Room', 'Teacher',
  'Student ID', 'Last name', 'First name', 'Email', 'Status', 'Checked at', 'Method',
]

/**
 * Every student in the session, from any of its classes. Built across the whole
 * speciality list so a shared lecture resolves all of its rows — and so each row
 * can carry the student's own class, which is the entire value of a combined
 * export.
 */
function studentsInSession(session: AttendanceSession) {
  const byId = new Map<string, Student>()
  for (const item of allSpecialities) {
    if (!session.specialities.includes(item.id)) continue
    for (const student of getRoster(item.id)) if (!byId.has(student.id)) byId.set(student.id, student)
  }
  return byId
}

export function buildSessionCsv(session: AttendanceSession): string {
  const byId = studentsInSession(session)
  const rows = session.rosterIds.map(id => {
    const student = byId.get(id)
    const entry = session.entries[id]
    return [
      // The student's class, not the session's. A student who has vanished from
      // every roster leaves this blank unless the session had only one class, in
      // which case it is the one thing we still know for certain.
      student?.speciality || (session.specialities.length === 1 ? session.specialities[0] : ''),
      session.courseCode,
      session.course,
      session.type || '',
      session.date, session.time, session.room, session.teacher,
      id,
      student?.lastName || '',
      student?.firstName || '',
      student?.email || '',
      entry?.status || 'unchecked',
      entry?.at || '',
      entry?.method || '',
    ]
  })
  // Excel needs the BOM to read UTF-8; it must be the first character of the file.
  return '﻿' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * `<code>-<type>-<date>.csv`. A legacy session has neither a code nor a type, so
 * it falls back to its sanitised course name and the literal `session` — still a
 * usable filename rather than a row of dashes.
 */
export function csvFilename(session: AttendanceSession) {
  // The code charset of spec §8 is already filename-safe; a course name is not.
  const name = session.courseCode.trim()
    || session.course.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')
    || 'session'
  return `${name}-${session.type || 'session'}-${session.date}.csv`
}

export function exportSessionCsv(session: AttendanceSession) {
  return saveTextFile(csvFilename(session), buildSessionCsv(session), 'text/csv;charset=utf-8')
}
