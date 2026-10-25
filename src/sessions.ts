import { getActiveRoster, specialities as allSpecialities, type Speciality, type Student } from './roster'
import { writeStore } from './storage'
import type { DayIndex, SessionType, SlotIndex } from './timetable'

export type AttendanceEntry = {
  status: 'present' | 'absent'
  at: string
  // New present entries use 'scan'; 'manual' remains for older records and absences.
  method: 'scan' | 'manual' | 'session-close'
}

export type AttendanceSession = {
  id: string
  /**
   * One or more. A lecture shared by several classes is a single session with a
   * combined roster, so its present/absent counts describe the room that sat it.
   */
  specialities: Speciality[]
  /** '' for sessions created before courses had codes. */
  courseCode: string
  /** The course NAME, snapshotted: renaming a course never rewrites history. */
  course: string
  /** Absent on a legacy session — inventing one would be fabricating data. */
  type?: SessionType
  /** The timetable cell this came from. Absent means ad-hoc. */
  origin?: { day: DayIndex; slot: SlotIndex }
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

/** Everything a form supplies; the rest of a session is derived on create. */
export type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

/**
 * Active student ids across these classes, deduplicated, in the canonical
 * speciality order of roster.ts — not the order the teacher ticked the chips,
 * so the same set of classes always produces the same snapshot.
 */
export function activeRosterIds(list: Speciality[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of allSpecialities) {
    if (!list.includes(item.id)) continue
    for (const student of getActiveRoster(item.id)) {
      if (seen.has(student.id)) continue
      seen.add(student.id)
      ids.push(student.id)
    }
  }
  return ids
}

/**
 * The teacher name to prefill, carried from the most recent session that has
 * one. Typed once a term rather than once a slot.
 *
 * Shared because two screens start sessions — the timetable's confirm sheet and
 * the landing page's one-tap rows — and a name that carried over on one but not
 * the other would look like the app had forgotten.
 */
export function lastTeacherName(sessions: AttendanceSession[]): string {
  return sessions.map(item => item.teacher).find(name => Boolean(name)) || ''
}

export function createSession(details: SessionDetails): AttendanceSession {
  return {
    ...details,
    id: crypto.randomUUID(),
    state: 'open',
    createdAt: new Date().toISOString(),
    rosterIds: activeRosterIds(details.specialities),
    entries: {},
  }
}

/** Presence requires a QR scan that resolves to an active session member. */
export function markScannedPresent(session: AttendanceSession, student: Student, scannedCode: string): AttendanceSession | null {
  if (session.state !== 'open' || !student.active || !session.specialities.includes(student.speciality)) return null
  if (!session.rosterIds.includes(student.id) || !student.badgeCode || student.badgeCode !== scannedCode.trim()) return null
  if (session.entries[student.id]?.status === 'present') return null
  return {
    ...session,
    entries: { ...session.entries, [student.id]: { status: 'present', at: new Date().toISOString(), method: 'scan' } },
  }
}

/** Teacher-verified fallback when a student is present without their badge. */
export function markManualPresent(session: AttendanceSession, student: Student): AttendanceSession | null {
  if (session.state !== 'open' || !student.active || !session.specialities.includes(student.speciality)) return null
  if (!session.rosterIds.includes(student.id) || session.entries[student.id]?.status === 'present') return null
  return {
    ...session,
    entries: { ...session.entries, [student.id]: { status: 'present', at: new Date().toISOString(), method: 'manual' } },
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

/** The shape on disk may predate `specialities`, `courseCode` or `rosterIds`. */
type StoredSession = AttendanceSession & { speciality?: Speciality }

/**
 * Migrates a stored session forward without bumping the storage key:
 * `speciality` becomes a one-element `specialities`, `courseCode` defaults to
 * empty, and `type` is left absent rather than guessed. Sessions written before
 * `rosterIds` existed are reconstructed from the union of whoever has an entry
 * and whoever is currently active — the closest honest reconstruction available.
 *
 * It also guarantees every field `AttendanceSession` declares as required is
 * actually present, which is a stronger promise than it sounds: this function
 * is the trust boundary for restored backups (backup.ts), so the JSON reaching
 * it may have been written by an older build or edited by hand. One absent key
 * used to be fatal — `Object.entries(undefined)` in analytics.ts took down the
 * whole Analytics screen, and a missing `createdAt` broke the sort in App. The
 * defaults are conservative: unknown state reads as `closed`, so a record we
 * cannot vouch for is never offered for marking.
 */
function backfill(session: StoredSession): AttendanceSession {
  const list = Array.isArray(session.specialities)
    ? session.specialities
    : session.speciality ? [session.speciality] : []

  const entries = session.entries && typeof session.entries === 'object' ? session.entries : {}

  let rosterIds = session.rosterIds
  if (!Array.isArray(rosterIds)) {
    const ids = new Set(Object.keys(entries))
    for (const id of activeRosterIds(list)) ids.add(id)
    rosterIds = [...ids]
  }

  const migrated: StoredSession = {
    ...session,
    // Without an id a session cannot be selected, updated or deleted, and two
    // of them collide as React keys.
    id: session.id || crypto.randomUUID(),
    specialities: list,
    courseCode: session.courseCode || '',
    course: session.course || '',
    date: session.date || '',
    time: session.time || '',
    room: session.room || '',
    teacher: session.teacher || '',
    state: session.state === 'open' ? 'open' : 'closed',
    createdAt: session.createdAt || '',
    rosterIds,
    entries,
  }
  delete migrated.speciality
  return migrated
}

/**
 * The session already created for a timetable cell on a given date, if any.
 * This is what makes tapping a cell idempotent: a mis-tap on a phone opens the
 * session that exists rather than creating a second one for the same hour.
 * Ad-hoc sessions have no `origin`, so they never match.
 */
export function sessionForCell(day: DayIndex, slot: SlotIndex, date: string, sessions: AttendanceSession[]) {
  return sessions.find(session =>
    session.origin?.day === day && session.origin?.slot === slot && session.date === date)
}

export function loadSessions(): AttendanceSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(backfill) : []
  } catch {
    return []
  }
}

/** Returns undefined when the write stuck, or a message fit to show. */
export function saveSessions(sessions: AttendanceSession[]) {
  return writeStore(SESSION_STORAGE_KEY, sessions)
}
