# Présence on Android — design

**Date:** 2026-10-20
**Status:** approved
**Branch:** `timetable-sessions`

## Goal

Ship Présence as an APK the teacher installs on their own phone, working fully
offline, without rewriting any of the existing UI.

## Why Capacitor

The app is React DOM: 19 components, 1,558 lines of CSS. React Native has no
DOM, so an Expo/RN port rewrites all ~3,400 lines of UI. Capacitor rewrites
none of it — it bundles the existing Vite output into a WebView shell.

What a native port *would* have preserved is the domain layer, and that is worth
recording because it is the measure of how portable this codebase is: `roster`,
`sessions`, `courses`, `timetable`, `analytics`, `format` and `classroomImport`
contain **zero** DOM references, and all 153 tests are platform-agnostic. Only
four browser APIs are touched anywhere in `src`:

| Where | API | In an Android WebView |
|---|---|---|
| `csv.ts:71-75` | `createObjectURL` + `<a download>.click()` | **silently does nothing** |
| `storage.ts` + 4 loaders | `localStorage` | works; same quota ceiling |
| `sessions.ts:65` | `crypto.randomUUID` | works — `https://localhost` is a secure context |
| `App.tsx:163` | `window.print` | unreachable; badges are flag-dormant |

Capacitor was chosen over an Expo + `react-native-webview` shell (which would
have used the already-installed Expo Orbit) because Capacitor's core job *is*
bundling and serving local web assets, where react-native-webview needs
`file:///android_asset/` juggling. Orbit's value — installing on the device — is
covered by `adb install`, and `adb` is already present.

## Toolchain (verified present, 2026-10-20)

- JDK 21.0.12 — Capacitor 8 requires 21
- Android SDK at `~/Android/Sdk`: platforms 31–36, build-tools 34/35/36,
  `cmdline-tools`, `platform-tools/adb`, `android-sdk-license` accepted
- npm registry reachable; Capacitor 8.5.3 current

`ANDROID_HOME` is unset — the Gradle build needs it exported, or
`android/local.properties` pointing at the SDK.

## Architecture

```
dist/ (existing Vite build, unchanged)
  └── bundled into android/app/src/main/assets/public/
        └── served at https://localhost in the WebView
```

Every native call sits behind `Capacitor.isNativePlatform()`. `npm run dev`, the
browser verification workflow and all 153 tests keep working unchanged. The web
build is not a legacy path to be dropped — it stays the development surface.

### Three decisions that are not reversible cheaply

**1. The localStorage origin is load-bearing.** WebView storage is keyed to the
serving origin. Changing `androidScheme` after the teacher has recorded sessions
orphans all of them, presenting as total data loss with no error. `androidScheme:
'https'` is pinned explicitly in config — not left to the default — with a
comment saying so.

**2. `android:allowBackup="false"`.** The default `true` lets Android sync app
data to Drive. For WebView localStorage this is unreliable *and* can restore
stale data over fresh records. **Ruling:** an absent safety net beats a silent,
untrustworthy one; durability comes from the explicit backup below instead.
Cost if wrong: a teacher who factory-resets without having run a backup loses
the term, where auto-backup might have saved them.

**3. Debug signing.** `assembleDebug` produces an `adb install`-able APK with no
keystore. Sufficient for a personal device; a release keystore is a separate step
if this is ever distributed.

## Changes to existing files

| File | Change | Why |
|---|---|---|
| `index.html:5` | add `viewport-fit=cover` | **the CSS already uses `env(safe-area-inset-*)` in 5 places and it is currently inert** — without this, the bottom nav sits under the gesture bar |
| `index.html:9-14` | remove Google Fonts `<link>` + 2 preconnects | an offline app must not fetch fonts from a CDN |
| `src/index.css` | `@fontsource/manrope`, `@fontsource/dm-sans` imports | replaces the CDN; OFL, versioned via npm |
| `src/csv.ts:70-77` | branch `exportSessionCsv` on platform | fixes the one silent break |
| `src/App.tsx` | back-button handler, StatusBar, backup/restore entry points | Android conventions |
| `.gitignore` | Gradle build outputs | `android/build`, `android/app/build`, `.gradle` |

`buildSessionCsv` and `csvFilename` are untouched and stay pure — only the
side-effecting `exportSessionCsv` learns about platforms.

### Android back button

The handler checks for an open `[role="dialog"]` and dispatches `Escape`, which
the existing `useDialog` hook already handles. This deliberately avoids lifting
`AssignCellModal`/`StartSessionModal` state out of `TimetablePage`, and gives
both dismissal gestures one code path. Otherwise: not on Timetable → navigate to
Timetable; on Timetable → exit the app.

### Backup and restore

Chosen as the answer to data durability over a SQLite migration, because SQLite
would rewrite every loader, saver and the storage tests while *still* not
surviving an uninstall.

- `src/backup.ts` — pure: `buildBackup()` returns a versioned envelope of all
  four stores; `applyBackup()` validates and writes. Unit-tested: round-trip,
  version mismatch, malformed JSON, missing stores, and that a rejected restore
  leaves existing data intact.
- `src/native/share.ts` — the single Filesystem + Share wrapper, also used by the
  CSV fix. The only device-verified code.
- UI on the Analytics page: "Back up everything" → share sheet;
  "Restore from backup" → pick, preview counts, confirm.

This also discharges the quota recommendation from the previous review: archiving
a finished term becomes routine instead of a crash.

## Identity

- package `com.mtamali.presence` · name **Présence** · portrait-locked
- Portrait is safe because the timetable is already mobile-first: narrow screens
  show one day at a time via a scrollable `.day-strip`, with the 5-column grid
  only at `min-width: 48rem`.
- Status bar `#112c3b`, matching the existing `theme-color`.
- Icon generated from an SVG via `@capacitor/assets`.

## Phasing

1. **Installable APK** — Capacitor, icon, manifest, safe-area, fonts, status bar,
   back button. Ends with a verified APK on the phone.
2. **CSV export fix** — share sheet.
3. **Backup/restore** — pure logic + tests, then UI.

Phase 1 ends in something installable so the wrapper is proven before feature
work builds on it.

## Testing

- Pure logic stays in Vitest: existing 153 tests must stay green, plus new
  `backup.test.ts`. The native bridge is not unit-tested — jsdom cannot model it.
- Browser regression after every phase: the web app must still run under
  `npm run dev`, since that is the verification surface.
- On device: offline launch with aeroplane mode, safe-area insets against the
  notch and gesture bar, back button through each modal, CSV export reaching the
  share sheet, a full backup→wipe→restore cycle.

## Scope fence

Untouched: `web/`, `server/`, `scripts/`, `send.py`, `students.csv`,
`generated/`, `Listes 2627/`, `src/data/students.json`,
`src/components/badges/`. Badges stay dormant behind `BADGES_ENABLED === false`;
`window.print` is therefore not a problem to solve here.

## Known costs

- The repo gains a `~/Android/Sdk`-dependent build step where it previously
  needed only Node.
- `android/` adds ~50 generated files to git.

Both are normal for Capacitor and were accepted explicitly.
