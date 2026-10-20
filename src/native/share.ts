import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type SaveOutcome = 'downloaded' | 'shared' | 'cancelled'
export type SaveResult = { ok: true; outcome: SaveOutcome } | { ok: false; error: string }

/**
 * Hands a generated file to the teacher, by whichever route the platform has.
 *
 * This exists because the browser route is a *silent* failure on Android:
 * `URL.createObjectURL` plus a synthetic `<a download>.click()` does nothing at
 * all in a WebView — no file, no error, no clue. The teacher taps Export and
 * the app appears to have ignored them.
 *
 * Reading a file back needs no counterpart here: `<input type="file">` works on
 * both, because Capacitor's WebView implements the file chooser.
 */
export async function saveTextFile(filename: string, text: string, mimeType: string): Promise<SaveResult> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      return { ok: true, outcome: 'downloaded' }
    } finally {
      // After the click, and in a finally, so an exception cannot leak the blob.
      URL.revokeObjectURL(url)
    }
  }

  try {
    /**
     * Cache rather than Documents: this is a file on its way to somewhere else,
     * and the share sheet is where it actually lands. Capacitor's FileProvider
     * can serve a cache URI to the receiving app, and Android reclaims the space
     * on its own, so a term of exports cannot quietly fill the device.
     */
    const written = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({ title: filename, url: written.uri })
    return { ok: true, outcome: 'shared' }
  } catch (error) {
    // Dismissing the sheet rejects, but nothing went wrong and there is nothing
    // to tell the teacher — reporting it as a failure would be a lie.
    if (error instanceof Error && /cancel/i.test(error.message)) {
      return { ok: true, outcome: 'cancelled' }
    }
    return { ok: false, error: 'The file could not be shared. Check that this device has storage space free.' }
  }
}
