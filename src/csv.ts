import { getRoster } from './roster'
import type { AttendanceSession } from './sessions'

function csvCell(value: string) {
  // Leading =, +, @ or - make spreadsheets treat the cell as a formula.
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const HEADER = [
  'Speciality', 'Course', 'Date', 'Time', 'Room', 'Teacher',
  'Student ID', 'Last name', 'First name', 'Email', 'Status', 'Checked at', 'Method',
]

export function buildSessionCsv(session: AttendanceSession): string {
  const byId = new Map(getRoster(session.speciality).map(student => [student.id, student]))
  const rows = session.rosterIds.map(id => {
    const student = byId.get(id)
    const entry = session.entries[id]
    return [
      session.speciality, session.course, session.date, session.time, session.room, session.teacher,
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
  return '\uFEFF' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function exportSessionCsv(session: AttendanceSession) {
  const url = URL.createObjectURL(new Blob([buildSessionCsv(session)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${session.speciality}-${session.date}-${session.course.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
