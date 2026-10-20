import { COURSE_STORAGE_KEY } from './courses'
import { isoDate } from './format'
import { ROSTER_STORAGE_KEY } from './roster'
import { SESSION_STORAGE_KEY } from './sessions'
import { TIMETABLE_STORAGE_KEY } from './timetable'

/**
 * A whole device in one file.
 *
 * `android:allowBackup="false"` means Android will never sync this app's data
 * anywhere, which was a deliberate choice: an unreliable safety net that can
 * restore stale records over fresh ones is worse than none. This file is the
 * net that replaces it, and it is also the only way a term moves between the
 * browser and the phone.
 *
 * The envelope stores each key's *raw parsed JSON* rather than typed records.
 * That is what lets a backup survive a schema change: every loader already
 * migrates on read (see `migrate` in sessions.ts), so a file written today
 * still restores into a later shape without this module knowing anything about
 * what a session looks like.
 */

export const BACKUP_FORMAT = 'presence-backup'
export const BACKUP_VERSION = 1

/** Fixed order, so two backups of the same device diff cleanly. */
export const BACKUP_KEYS = [
  SESSION_STORAGE_KEY,
  COURSE_STORAGE_KEY,
  TIMETABLE_STORAGE_KEY,
  ROSTER_STORAGE_KEY,
] as const

export type BackupKey = typeof BACKUP_KEYS[number]

export type Backup = {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  /**
   * `null` means "this device had nothing stored under that key" — a fact worth
   * restoring. A key missing altogether means the file has nothing to say about
   * that store, which is a different thing and is treated differently.
   */
  stores: Partial<Record<BackupKey, unknown>>
}

export type BackupCounts = {
  sessions: number
  courses: number
  timetable: number
  /** Classes whose roster was imported, rather than left on the seed list. */
  rosters: number
  students: number
}

export type DecodeResult =
  | { ok: true; backup: Backup; counts: BackupCounts; missing: BackupKey[] }
  | { ok: false; error: string }

export type ApplyResult =
  | { ok: true; counts: BackupCounts }
  | { ok: false; error: string }

function rows(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Counts for the confirmation sheet. Deliberately shape-tolerant: this runs on
 * a file that may have been written by another version, and a preview that
 * throws is worse than one that reports a zero.
 */
export function countStores(stores: Partial<Record<BackupKey, unknown>>): BackupCounts {
  const roster = stores[ROSTER_STORAGE_KEY]
  const lists = isRecord(roster) ? Object.values(roster).filter(Array.isArray) : []
  return {
    sessions: rows(stores[SESSION_STORAGE_KEY]),
    courses: rows(stores[COURSE_STORAGE_KEY]),
    timetable: rows(stores[TIMETABLE_STORAGE_KEY]),
    rosters: lists.length,
    students: lists.reduce((total, list) => total + list.length, 0),
  }
}

/** Reads localStorage. Indented, because a teacher may well open this file. */
export function buildBackup(now = new Date()): string {
  const stores: Partial<Record<BackupKey, unknown>> = {}
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key)
    try {
      // A store corrupted by hand is lost whatever we do. Refusing to back up
      // the other three because of it would turn one damaged store into four.
      stores[key] = raw === null ? null : JSON.parse(raw)
    } catch {
      stores[key] = null
    }
  }
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    stores,
  }
  return JSON.stringify(backup, null, 2)
}

export function backupFilename(now = new Date()) {
  return `presence-backup-${isoDate(now)}.json`
}

/** Pure: validates and reports. Never touches storage. */
export function decodeBackup(text: string): DecodeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file could not be read. Choose the .json file produced by “Back up everything”.' }
  }

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'That file is not a Présence backup. Choose the .json file produced by “Back up everything”.' }
  }

  const version = parsed.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'That backup has no usable version number, so it cannot be restored safely.' }
  }
  if (version > BACKUP_VERSION) {
    // Restoring a shape we do not understand is how data gets quietly eaten, so
    // the refusal names the fix rather than just the problem.
    return { ok: false, error: `That backup was written by a newer version of Présence (format ${version}, this app reads ${BACKUP_VERSION}). Update the app, then restore it.` }
  }

  if (!isRecord(parsed.stores)) {
    return { ok: false, error: 'That backup is missing its contents and cannot be restored.' }
  }

  const stores = parsed.stores as Partial<Record<BackupKey, unknown>>
  const missing = BACKUP_KEYS.filter(key => !(key in stores))
  // Every store absent is not a backup of an empty device — that file would
  // record four nulls. It is a file that says nothing, and restoring it would
  // change nothing while claiming to have replaced the term.
  if (missing.length === BACKUP_KEYS.length) {
    return { ok: false, error: 'That backup holds none of this app’s data, so there is nothing to restore from it.' }
  }

  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, version, createdAt: String(parsed.createdAt ?? ''), stores },
    counts: countStores(stores),
    missing,
  }
}

/**
 * Validates first, then writes — and unwinds if a write fails part-way.
 *
 * The half-applied state is the one that actually hurts: this term's sessions
 * standing against last term's roster, with nothing on screen to say so. Only
 * the keys that were successfully written are rolled back; the one that threw
 * never changed.
 */
export function applyBackup(text: string): ApplyResult {
  const decoded = decodeBackup(text)
  if (!decoded.ok) return decoded

  const { stores } = decoded.backup
  const previous = new Map<BackupKey, string | null>()
  const applied: BackupKey[] = []

  try {
    for (const key of BACKUP_KEYS) {
      if (!(key in stores)) continue        // the file says nothing about this store
      previous.set(key, localStorage.getItem(key))
      const value = stores[key]
      // Faithful: a device restored from a file with no roster has no roster.
      // Leaving the old one behind would silently merge two terms.
      if (value === null || value === undefined) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
      applied.push(key)
    }
  } catch {
    for (const key of applied) {
      const raw = previous.get(key) ?? null
      try {
        if (raw === null) localStorage.removeItem(key)
        else localStorage.setItem(key, raw)
      } catch {
        // Best effort. If putting back what was already there also fails, the
        // device is out of room in a way this module cannot repair.
      }
    }
    return { ok: false, error: 'The restore was stopped because this browser’s storage is full or unavailable. Nothing was changed.' }
  }

  return { ok: true, counts: decoded.counts }
}
