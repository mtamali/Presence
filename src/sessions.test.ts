import { beforeEach, describe, it, expect } from 'vitest'
import { saveRoster, type Student } from './roster'
import {
  createSession, closeSession, reopenSession, sessionStats,
  loadSessions, saveSessions, SESSION_STORAGE_KEY,
} from './sessions'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}

const details = {
  speciality: '1MAUT' as const,
  course: 'Automation', date: '2026-10-16', time: '09:00', room: 'Lab 04', teacher: 'T',
}

describe('session snapshot', () => {
  beforeEach(() => localStorage.clear())

  it('snapshots only active students at creation', () => {
    saveRoster('1MAUT', [student('A1'), student('A2'), student('A3', { active: false })])
    expect(createSession(details).rosterIds).toEqual(['A1', 'A2'])
  })

  it('keeps totals stable when the roster changes afterwards', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    const session = createSession(details)
    expect(sessionStats(session).total).toBe(2)

    saveRoster('1MAUT', [student('A1')])   // A2 dropped by a re-import
    expect(sessionStats(session).total).toBe(2)
  })

  it('counts present, absent and unchecked against the snapshot', () => {
    saveRoster('1MAUT', [student('A1'), student('A2'), student('A3')])
    const session = createSession(details)
    session.entries['A1'] = { status: 'present', at: 'now', method: 'manual' }
    session.entries['A2'] = { status: 'absent', at: 'now', method: 'manual' }
    expect(sessionStats(session)).toEqual({ total: 3, present: 1, absent: 1, unchecked: 1 })
  })

  it('ignores entries for students outside the snapshot', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    session.entries['GHOST'] = { status: 'present', at: 'now', method: 'manual' }
    expect(sessionStats(session)).toEqual({ total: 1, present: 0, absent: 0, unchecked: 1 })
  })

  it('marks only snapshot members absent on close', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    const session = createSession(details)
    session.entries['A1'] = { status: 'present', at: 'now', method: 'manual' }

    saveRoster('1MAUT', [student('A1'), student('A2'), student('A9')])  // added later
    const closed = closeSession(session)

    expect(closed.state).toBe('closed')
    expect(closed.entries['A2']).toMatchObject({ status: 'absent', method: 'session-close' })
    expect(closed.entries['A9']).toBeUndefined()
  })

  it('round-trips close and reopen without leaving auto-absences', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    const session = createSession(details)
    session.entries['A1'] = { status: 'present', at: 'now', method: 'manual' }
    const reopened = reopenSession(closeSession(session))

    expect(reopened.state).toBe('open')
    expect(reopened.closedAt).toBeUndefined()
    expect(Object.keys(reopened.entries)).toEqual(['A1'])
  })

  it('backfills rosterIds for sessions saved before the snapshot existed', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    const legacy = {
      id: 'old', speciality: '1MAUT', course: 'C', date: '2026-01-01', time: '08:00',
      room: '', teacher: '', state: 'closed', createdAt: '2026-01-01T08:00:00.000Z',
      entries: { LEGACY: { status: 'present', at: 'then', method: 'manual' } },
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([legacy]))

    const [loaded] = loadSessions()
    expect(loaded.rosterIds.sort()).toEqual(['A1', 'A2', 'LEGACY'])
  })

  it('returns an empty list for corrupt stored sessions', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json')
    expect(loadSessions()).toEqual([])
  })

  it('round-trips through storage', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    saveSessions([session])
    expect(loadSessions()[0].id).toBe(session.id)
  })
})
