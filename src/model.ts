import roster from './data/students.json'

export type Speciality = '1MAUT' | '1MESE' | '4IGEI'
export type Student = {
  id: string
  registration: string
  matricule: string
  lastName: string
  firstName: string
  email?: string
  speciality: Speciality
  section: string
  group: string
  badgeCode: string
}
export type AttendanceEntry = {
  status: 'present' | 'absent'
  at: string
  method: 'scan' | 'manual' | 'session-close'
}
export type AttendanceSession = {
  id: string
  speciality: Speciality
  course: string
  date: string
  time: string
  room: string
  teacher: string
  state: 'open' | 'closed'
  createdAt: string
  closedAt?: string
  entries: Partial<Record<string, AttendanceEntry>>
}

export const students = roster as Student[]
export const specialities: { id: Speciality; name: string; shortName: string }[] = [
  { id: '1MAUT', name: 'Automation & industrial computing', shortName: 'Automation' },
  { id: '1MESE', name: 'Embedded electronic systems', shortName: 'Embedded systems' },
  { id: '4IGEI', name: 'Industrial electronic engineering', shortName: 'Industrial electronics' },
]

const STORAGE_KEY = 'presence-attendance-v1'
const EMAIL_STORAGE_KEY = 'presence-student-emails-v1'

export function loadStudentEmails(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(EMAIL_STORAGE_KEY) || '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

export function saveStudentEmails(emails: Record<string, string>) {
  localStorage.setItem(EMAIL_STORAGE_KEY, JSON.stringify(emails))
}

export function getStudents(speciality: Speciality) {
  const emails = loadStudentEmails()
  return students.filter(student => student.speciality === speciality)
    .map(student => ({ ...student, email: emails[student.id] || student.email }))
}

export function loadSessions(): AttendanceSession[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: AttendanceSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function createSession(details: Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries'>): AttendanceSession {
  return {
    ...details,
    id: crypto.randomUUID(),
    state: 'open',
    createdAt: new Date().toISOString(),
    entries: {},
  }
}

export function closeSession(session: AttendanceSession): AttendanceSession {
  const now = new Date().toISOString()
  const entries = { ...session.entries }
  for (const student of getStudents(session.speciality)) {
    if (!entries[student.id]) entries[student.id] = { status: 'absent', at: now, method: 'session-close' }
  }
  return { ...session, state: 'closed', closedAt: now, entries }
}

export function reopenSession(session: AttendanceSession): AttendanceSession {
  const entries = { ...session.entries }
  for (const [studentId, entry] of Object.entries(entries)) {
    if (entry?.method === 'session-close') delete entries[studentId]
  }
  return { ...session, state: 'open', closedAt: undefined, entries }
}

export function normalizeBadge(value: string) {
  return value.trim().toUpperCase().replace(/\s/g, '')
}

export function findStudentByBadge(value: string) {
  return students.find(student => student.badgeCode === normalizeBadge(value))
}

export function sessionStats(session: AttendanceSession) {
  const total = getStudents(session.speciality).length
  const present = Object.values(session.entries).filter(entry => entry?.status === 'present').length
  const absent = Object.values(session.entries).filter(entry => entry?.status === 'absent').length
  return { total, present, absent, unchecked: total - present - absent }
}

function csvCell(value: string) {
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function exportSessionCsv(session: AttendanceSession) {
  const header = ['Speciality', 'Course', 'Date', 'Time', 'Room', 'Teacher', 'Matricule', 'Last name', 'First name', 'Email', 'Status', 'Checked at', 'Method']
  const rows = getStudents(session.speciality).map(student => {
    const entry = session.entries[student.id]
    return [session.speciality, session.course, session.date, session.time, session.room, session.teacher,
      student.matricule, student.lastName, student.firstName, student.email || '', entry?.status || 'unchecked', entry?.at || '', entry?.method || '']
  })
  const csv = '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${session.speciality}-${session.date}-${session.course.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
