/**
 * The one place anything writes to localStorage.
 *
 * `setItem` throws once the origin's quota is exhausted, and some browsers
 * throw on the first write of a private-browsing session. Every store is
 * persisted from an effect in App, so a throw lands in React's commit phase:
 * with no boundary above it React unmounts the root, and the teacher's reward
 * for marking a student is a blank screen with the mark gone. Writes therefore
 * report failure as a message instead of raising it.
 */
export function writeStore(key: string, value: unknown): string | undefined {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return undefined
  } catch {
    // Full and blocked are not worth telling apart: both mean this device will
    // not keep what is being entered, and the next move is the same either way.
    return 'Changes are not being saved — storage is full or unavailable in this browser. Export anything you need to keep; reloading would lose everything marked since the last save.'
  }
}
