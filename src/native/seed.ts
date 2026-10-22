import { Capacitor } from '@capacitor/core'
import embeddedState from '../data/embedded-state.json'
import { COURSE_STORAGE_KEY } from '../courses'
import { TIMETABLE_STORAGE_KEY } from '../timetable'

const SEED_KEY = 'presence-android-seed-2026-10-21'

/** Copy the desktop's saved courses and timetable into an empty Android install once. */
export function seedNativeDataIfEmpty(isNative = Capacitor.isNativePlatform()) {
  if (!isNative) return

  try {
    if (localStorage.getItem(SEED_KEY) !== null) return
    const courses = localStorage.getItem(COURSE_STORAGE_KEY)
    const timetable = localStorage.getItem(TIMETABLE_STORAGE_KEY)
    const empty = (value: string | null) => value === null || value === '[]'

    // Keep any records already created on this device. A missing counterpart is
    // intentional too: merging two different timetables would create duplicates.
    if (!empty(courses) || !empty(timetable)) {
      localStorage.setItem(SEED_KEY, 'skipped-existing-data')
      return
    }

    let coursesWritten = false
    let timetableWritten = false
    try {
      localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(embeddedState.courses))
      coursesWritten = true
      localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(embeddedState.timetable))
      timetableWritten = true
      localStorage.setItem(SEED_KEY, 'seeded')
    } catch {
      // A partial seed would be mistaken for user data on the next launch.
      // Restore both keys so a later launch can retry the complete seed.
      const restore = (key: string, value: string | null) => {
        try {
          if (value === null) localStorage.removeItem(key)
          else localStorage.setItem(key, value)
        } catch { /* Storage is unavailable; leave the existing data untouched. */ }
      }
      if (timetableWritten) restore(TIMETABLE_STORAGE_KEY, timetable)
      if (coursesWritten) restore(COURSE_STORAGE_KEY, courses)
    }
  } catch {
    // Storage access can fail before the app renders. The normal loaders will
    // still open the app with empty state and report failed writes in the UI.
  }
}
