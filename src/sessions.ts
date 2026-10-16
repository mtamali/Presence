import { getActiveRoster, type Speciality } from './roster'

export type AttendanceEntry = {
  status: 'present' | 'absent'
  at: string
  // 'scan' is retained for entries recorded before badges were retired.
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
  rosterIds: string[]
  entries: Partial<Record<string, AttendanceEntry>>
}

export const SESSION_STORAGE_KEY = 'presence-attendance-v1'

type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

export function createSession(details: SessionDetails): AttendanceSession {
  return {
    ...details,
    id: crypto.randomUUID(),
    state: 'open',
    createdAt: new Date().toISOString(),
    rosterIds: getActiveRoster(details.speciality).map(student => student.id),
    entries: {},
  }
}

export function closeSession(session: AttendanceSession): AttendanceSession {
  const now = new Date().toISOString()
  const entries = { ...session.entries }
  for (const id of session.rosterIds) {
    if (!entries[id]) entries[id] = { status: 'absent', at: now, method: 'session-close' }
  }
  return { ...session, state: 'closed', closedAt: now, entries }
}

export function reopenSession(session: AttendanceSession): AttendanceSession {
  const entries = { ...session.entries }
  for (const [id, entry] of Object.entries(entries)) {
    if (entry?.method === 'session-close') delete entries[id]
  }
  return { ...session, state: 'open', closedAt: undefined, entries }
}

export function sessionStats(session: AttendanceSession) {
  const members = new Set(session.rosterIds)
  let present = 0
  let absent = 0
  for (const [id, entry] of Object.entries(session.entries)) {
    if (!members.has(id)) continue
    if (entry?.status === 'present') present++
    else if (entry?.status === 'absent') absent++
  }
  const total = members.size
  return { total, present, absent, unchecked: total - present - absent }
}

// Sessions written before rosterIds existed are reconstructed from the union of
// whoever has an entry and whoever is currently active in that speciality.
// This is the closest honest reconstruction available.
function backfill(session: AttendanceSession): AttendanceSession {
  if (Array.isArray(session.rosterIds)) return session
  const ids = new Set(Object.keys(session.entries || {}))
  for (const student of getActiveRoster(session.speciality)) ids.add(student.id)
  return { ...session, rosterIds: [...ids] }
}

export function loadSessions(): AttendanceSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(backfill) : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: AttendanceSession[]) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
}
