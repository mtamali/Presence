import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mtamali.presence',
  appName: 'Présence',
  // The existing Vite output, bundled as-is. Nothing about the web build changes
  // for Android: `npm run dev` stays the development and verification surface.
  webDir: 'dist',
  server: {
    /**
     * Pinned deliberately, and must never change.
     *
     * WebView localStorage is keyed to the serving origin, and every session,
     * course, roster and timetable entry the teacher has recorded lives there.
     * Changing this scheme — or letting a Capacitor upgrade change the default
     * under us — silently orphans all of it: the app opens to an empty roster
     * with no error to explain where a term of attendance went. `https` also
     * keeps the origin a secure context, which `crypto.randomUUID` in
     * sessions.ts requires.
     */
    androidScheme: 'https',
  },
  android: {
    // Debug builds only, for installing on a personal device over adb. A release
    // keystore is a separate exercise if this is ever distributed.
    buildOptions: {},
  },
}

export default config
