import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  BACKUP_KEYS, BACKUP_VERSION, applyBackup, backupFilename, buildBackup, decodeBackup,
} from './backup'
import { COURSE_STORAGE_KEY } from './courses'
import { ROSTER_STORAGE_KEY } from './roster'
import { SESSION_STORAGE_KEY } from './sessions'
import { TIMETABLE_STORAGE_KEY } from './timetable'

const course = { code: 'F122', name: 'Automation', specialities: ['1MAUT'] }
const entry = { day: 3, slot: 1, courseCode: 'F122', type: 'TP', specialities: ['1MAUT'], room: 'Lab 04' }
const session = { id: 's1', courseCode: 'F122', course: 'Automation', type: 'TP', specialities: ['1MAUT'], date: '2026-10-20', time: '08:00', room: 'Lab 04', teacher: 'T', state: 'open', createdAt: '2026-10-20T07:00:00.000Z', entries: {}, rosterIds: ['A1', 'A2'] }
const student = { id: 'A1', lastName: 'L', firstName: 'F', speciality: '1MAUT', active: true }

/** The state of a device that has been used for a term. */
function seedDevice() {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([session]))
  localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify([course]))
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify([entry]))
  localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ '1MAUT': [student] }))
}

/** Every store exactly as it sits on disk, for comparing before against after. */
function snapshot() {
  return BACKUP_KEYS.map(key => [key, localStorage.getItem(key)] as const)
}

describe('buildBackup', () => {
  beforeEach(() => localStorage.clear())

  it('captures all four stores', () => {
    seedDevice()
    const decoded = decodeBackup(buildBackup(new Date('2026-10-20T09:00:00Z')))

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(Object.keys(decoded.backup.stores).sort()).toEqual([...BACKUP_KEYS].sort())
    expect(decoded.counts).toEqual({ sessions: 1, courses: 1, timetable: 1, rosters: 1, students: 1 })
  })

  it('records a store that has never been written as null rather than omitting it', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify([course]))
    const decoded = decodeBackup(buildBackup())

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    // Self-describing: "this device had no roster override" is a fact worth
    // restoring, and is not the same as "this file predates roster backups".
    expect(decoded.backup.stores[ROSTER_STORAGE_KEY]).toBeNull()
    expect(decoded.missing).toEqual([])
  })

  it('survives a store that was corrupted by hand', () => {
    seedDevice()
    localStorage.setItem(TIMETABLE_STORAGE_KEY, '{not json')

    // The unreadable store is lost either way; refusing to back up the other
    // three because of it would turn one damaged store into four.
    const decoded = decodeBackup(buildBackup())
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.backup.stores[TIMETABLE_STORAGE_KEY]).toBeNull()
    expect(decoded.counts.sessions).toBe(1)
  })
})

describe('decodeBackup', () => {
  it('rejects malformed JSON with a message naming the file, not the parser', () => {
    const result = decodeBackup('{not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/not a Présence backup|could not be read/i)
  })

  it('rejects JSON that is valid but is not a backup', () => {
    expect(decodeBackup('[1,2,3]').ok).toBe(false)
    expect(decodeBackup('{"hello":"world"}').ok).toBe(false)
    // A session CSV renamed to .json, or the wrong export entirely.
    expect(decodeBackup(JSON.stringify({ format: 'something-else', version: 1, stores: {} })).ok).toBe(false)
  })

  it('rejects a backup written by a newer version of the app', () => {
    const future = JSON.stringify({
      format: 'presence-backup', version: BACKUP_VERSION + 1, createdAt: '', stores: {},
    })
    const result = decodeBackup(future)

    expect(result.ok).toBe(false)
    if (result.ok) return
    // The teacher's move is to update the app, so the message has to say so —
    // silently restoring a shape we do not understand is how data gets eaten.
    expect(result.error).toMatch(/newer version/i)
  })

  it('reports which stores a partial backup is missing', () => {
    const partial = JSON.stringify({
      format: 'presence-backup', version: BACKUP_VERSION, createdAt: '',
      stores: { [COURSE_STORAGE_KEY]: [course] },
    })
    const result = decodeBackup(partial)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.missing.sort()).toEqual(
      [SESSION_STORAGE_KEY, TIMETABLE_STORAGE_KEY, ROSTER_STORAGE_KEY].sort(),
    )
  })

  it('rejects a well-formed envelope that mentions no store at all', () => {
    // Distinct from a backup of an empty device, which records four nulls and
    // restores faithfully. This file would pass every other check, show four
    // zeroes, promise to replace nothing, and change nothing.
    const hollow = JSON.stringify({
      format: 'presence-backup', version: BACKUP_VERSION, createdAt: '', stores: {},
    })
    const result = decodeBackup(hollow)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/nothing to restore/i)
  })
})

describe('applyBackup', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a device through backup and restore', () => {
    seedDevice()
    const before = snapshot()
    const file = buildBackup()

    localStorage.clear()
    const result = applyBackup(file)

    expect(result.ok).toBe(true)
    expect(snapshot()).toEqual(before)
  })

  it('removes a store the backup recorded as empty', () => {
    const file = buildBackup()          // nothing stored: all four are null
    seedDevice()                        // now the device has a term on it

    expect(applyBackup(file).ok).toBe(true)
    // A faithful restore makes the device match the file. Leaving the roster
    // behind would silently merge two terms.
    for (const key of BACKUP_KEYS) expect(localStorage.getItem(key)).toBeNull()
  })

  it('leaves a store the backup does not mention alone', () => {
    seedDevice()
    const partial = JSON.stringify({
      format: 'presence-backup', version: BACKUP_VERSION, createdAt: '',
      stores: { [COURSE_STORAGE_KEY]: [] },
    })

    expect(applyBackup(partial).ok).toBe(true)
    expect(localStorage.getItem(COURSE_STORAGE_KEY)).toBe('[]')
    // Absent is not the same as null: this file has nothing to say about the
    // roster, so the roster is not its business.
    expect(JSON.parse(localStorage.getItem(ROSTER_STORAGE_KEY)!)).toEqual({ '1MAUT': [student] })
  })

  it('leaves every store untouched when the file is rejected', () => {
    seedDevice()
    const before = snapshot()

    for (const bad of ['{not json', '[1,2,3]', JSON.stringify({ format: 'x', version: 1, stores: {} })]) {
      expect(applyBackup(bad).ok).toBe(false)
    }
    expect(snapshot()).toEqual(before)
  })

  it('rolls back completely when a write fails part-way through', () => {
    seedDevice()
    const before = snapshot()

    // A device with just enough room for the first stores and not the last.
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === ROSTER_STORAGE_KEY) throw new DOMException('exceeded the quota', 'QuotaExceededError')
      real.call(this, key, value)
    })

    const other = { ...session, id: 's2', courseCode: 'M115' }
    const result = applyBackup(JSON.stringify({
      format: 'presence-backup', version: BACKUP_VERSION, createdAt: '',
      stores: {
        [SESSION_STORAGE_KEY]: [other],
        [COURSE_STORAGE_KEY]: [],
        [TIMETABLE_STORAGE_KEY]: [],
        [ROSTER_STORAGE_KEY]: { '1MESE': [student] },
      },
    }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/storage/i)
    // The half-written state is the dangerous one: this term's sessions against
    // last term's roster, with nothing on screen to say so.
    expect(snapshot()).toEqual(before)
  })
})

describe('backupFilename', () => {
  it('is dated, so a term of backups sorts by name', () => {
    expect(backupFilename(new Date('2026-10-20T09:00:00'))).toBe('presence-backup-2026-10-20.json')
  })
})
