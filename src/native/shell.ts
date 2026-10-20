import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { Page } from '../components/AppShell'

/** Where the back button lands before the next press leaves the app. */
const HOME: Page = 'timetable'

/**
 * Android shell behaviour: status bar appearance and the hardware back button.
 *
 * Everything here is inert on the web — `isNativePlatform()` is false in a
 * browser and in jsdom, so `npm run dev` and the test suite never reach the
 * bridge. That is deliberate: the web build stays the development surface, so
 * this hook must not be able to change how it behaves.
 */
export function useNativeShell(page: Page, goHome: () => void) {
  /**
   * Both values are read inside a listener registered once on mount, so they
   * are held in a ref rather than listed as dependencies. Re-registering on
   * every page change would mean removing and adding a bridge listener — an
   * async pair — on each navigation, and two of those overlapping is how you
   * end up with a back press handled twice or not at all.
   */
  const latest = useRef({ page, goHome })
  latest.current = { page, goHome }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    /**
     * Light icons, over navy.
     *
     * `Style.Dark` is the confusing half of this API: it means *light text for
     * dark backgrounds*, which is what a navy bar needs.
     *
     * The navy arrives by two different routes depending on the Android
     * version, and both are needed. Before 15, `setBackgroundColor` paints a
     * real status bar band and the WebView starts below it. From 15 edge-to-
     * edge is enforced, that call is ignored, and the band is instead the
     * `body::before` scrim in base.css sized to `env(safe-area-inset-top)`.
     * Same colour either way, so the icon style is correct on both.
     *
     * Fire-and-forget: a status bar that failed to restyle is a cosmetic
     * problem, and throwing here would take the first paint down with it.
     */
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    // Keep in step with --espresso in tokens.css, the theme-color in index.html
    // and the scrim in base.css: four copies of one colour, and a status bar
    // that disagrees with the scrim below it is visible as a seam.
    StatusBar.setBackgroundColor({ color: '#2a2218' }).catch(() => {})

    const listener = NativeApp.addListener('backButton', () => {
      /**
       * A modal takes the press first. Rather than lifting each modal's open
       * state up to App just to close it from here, this re-uses the Escape
       * key the dialogs already handle: `useDialog` listens on document, and
       * picks the last `[role="dialog"]` when more than one is open, so the
       * newest closes and the gesture matches what Escape does on a keyboard.
       * One code path for both dismissal routes.
       */
      if (document.querySelector('[role="dialog"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        return
      }
      if (latest.current.page !== HOME) {
        latest.current.goHome()
        return
      }
      // Already home with nothing open: the press means leave.
      NativeApp.exitApp()
    })

    return () => { listener.then(handle => handle.remove()) }
    // Mount and unmount only; `latest` is a ref for exactly this reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
