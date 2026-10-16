# Présence — Mobile-First Restructure & Badge Retirement

**Date:** 2026-10-16
**Status:** Approved, pending implementation plan

## 1. Purpose

Restructure the Présence attendance webapp so that the phone is the primary
target rather than a degraded desktop view, and retire the printed QR badge
flow in favour of a teacher-driven roster. The student roster becomes editable
data that the teacher can refresh per speciality, instead of JSON baked in at
build time.

## 2. Decisions

| Question | Decision |
|---|---|
| How a student is marked present | Teacher taps present/absent on the roster. No scanning. |
| Classes covered | The existing three: 1MAUT, 1MESE, 4IGEI. |
| Name format in the supplied list | Single field, formatted `LASTNAME Firstname`. |
| Badge/QR code | Kept in the tree but dormant behind a flag and lazy-loaded. |
| Styling approach | Mobile-first rewrite, stylesheet and components split into modules, bottom tab bar on phone. No router. |
| Roster import | A file replaces the whole roster for one speciality. |
| Students dropped by a re-import | Retained and flagged inactive. |
| `web/`, `server/`, Python scripts | Out of scope. Untouched. |

## 3. Starting state

- `src/App.tsx` — 297 lines, the entire UI, one dense line per section.
- `src/model.ts` — 138 lines; types, localStorage access, CSV export.
- `src/classroomImport.ts` — 113 lines; a CSV/TSV parser with name and
  matricule matching plus duplicate detection.
- `src/styles.css` — ~40 KB across 12 unwrapped lines. Strictly desktop-first:
  base rules assume a desktop, and four descending `max-width` queries
  (1160 / 900 / 700 / 420) progressively crush the layout down.
- `src/data/students.json` — 58 students across the three specialities.
- Entry chunk is 212 KB. The 368 KB `html5-qrcode` chunk is already correctly
  code-split behind a dynamic import; `qrcode.react` is **not** — it is
  statically imported at the top of `App.tsx` and sits in the entry.
- `vite.config.ts` is `defineConfig({})`. No React plugin, therefore no Fast
  Refresh, despite `@vitejs/plugin-react` being present in `node_modules`.
- No test framework.

## 4. Data layer

### 4.1 Student shape

`registration`, `section`, and `group` are removed — the supplied list has no
source data for them. They currently surface as the roster `Group` column, as
the subtitle fallback when email is missing, and as two CSV export columns; all
of those go.

```ts
type Student = {
  id: string          // the supplied Student ID; the natural key
  lastName: string    // parsed from the single name field
  firstName: string
  email?: string
  speciality: Speciality
  active: boolean     // false = dropped by a re-import, retained for history
  badgeCode?: string  // dormant; only present on seed records
}
```

### 4.2 Name parsing

`parseStudentName(value)` splits `LASTNAME Firstname` by taking the leading run
of ALL-CAPS whitespace-delimited tokens as the surname and the remainder as the
given name. This resolves compound surnames such as `BEN AMAR Youcef`
correctly. If no leading token is uppercase, it falls back to treating the first
token as the surname and the rest as the given name.

### 4.3 Roster storage

A new localStorage key `presence-roster-v1` holds
`Record<Speciality, Student[]>`.

`src/data/students.json` is demoted from source of truth to **seed**: it is
consulted only for a speciality that has no stored override. A speciality with
an override reads entirely from storage.

Two accessors replace the single `getStudents`:

- `getRoster(speciality)` — every student including inactive. Used to render
  and export historical sessions.
- `getActiveRoster(speciality)` — `active === true` only. Used when creating a
  new session and for the roster list of an open session.

### 4.4 Session membership snapshot

`AttendanceSession` gains `rosterIds: string[]`, captured from
`getActiveRoster()` at creation.

This fixes an existing defect. `sessionStats` currently derives `total` from the
*current* roster, so re-importing a class list retroactively rewrites the
totals of every past session for that class and desynchronises them from
already-exported CSVs. Making the roster editable turns that from a theoretical
problem into a routine one.

After this change:

- `sessionStats` counts against `session.rosterIds`, not the live roster.
- `closeSession` marks absent only the students in `rosterIds`.
- `exportSessionCsv` iterates `rosterIds`, resolving each against
  `getRoster()` so that deactivated students still export with their names.
- A closed session is therefore immutable with respect to later roster edits.

Sessions created before this change have no `rosterIds`. On load, backfill it
from the union of `Object.keys(session.entries)` and the current active roster
for that speciality — the closest honest reconstruction available.

## 5. Per-speciality roster import

### 5.1 Parser reuse

`classroomImport.ts` retains `parseDelimited`, `headerIndex`, `normalized`, and
its duplicate detection. That code is sound: it handles quoted cells, doubled
quotes, CRLF, delimiter sniffing across `,`/`;`/tab, and BOM stripping.

`previewClassroomImport` is replaced by:

```ts
previewRosterImport(text, speciality, currentRoster)
  → { added, updated, deactivated, issues, totalRows }
```

### 5.2 Columns and matching

Required columns, matched case- and accent-insensitively via the existing
alias mechanism: **Student ID**, **Name**, **Email**.

Matching is by Student ID — not by name, which is what the old implementation
had to do. The import is scoped to the passed `speciality`, so a 1MAUT file
cannot reach a 4IGEI record.

### 5.3 Apply semantics

For the target speciality only:

- ID in file, not in roster → **added**, `active: true`, no `badgeCode`.
- ID in both → **updated**: name and email are overwritten, `active` is set to
  `true`, and any existing `badgeCode` is left untouched. This reactivates a
  previously deactivated student and preserves their attendance history.
- ID in roster, not in file → **deactivated** (`active: false`). The record and
  all attendance entries are kept.
- Duplicate ID or duplicate email within the file → row rejected into
  `issues`, consistent with current behaviour.
- Row with a valid ID and name but a missing or malformed email → the student
  **is** added or updated, and the email problem is reported in `issues`.
  Roster membership matters more than contact detail.

Nothing is written until the teacher confirms. The preview shows the
added / updated / deactivated counts and the issue list first.

### 5.4 ID migration

Existing local sessions key their entries by the current `id`
(`UN08012026181838000789`), while `matricule` holds `38000789`.

Note that `matricule` is **not** a field on the new `Student` type in §4.1. The
migration reads it from `src/data/students.json`, whose records still carry the
old shape, and uses it only to build a one-time `oldId → newId` map. The field
does not survive into the runtime model.

On first load after the supplied list is in place:

- If every supplied Student ID matches a `matricule` in the seed JSON, remap
  entry keys through that map and keep all attendance history.
- Otherwise, bump the session storage key to `presence-attendance-v2` and start
  clean, surfacing a one-time notice that previous local sessions could not be
  migrated.

The correct branch is determined once the roster list is supplied.

## 6. Mobile-first styling

### 6.1 Module split

`src/styles.css` becomes `src/styles/`:

| File | Contents |
|---|---|
| `tokens.css` | Custom properties: colour, spacing, radii, shadow, type scale. |
| `base.css` | Reset, element defaults, focus rings, reduced-motion. |
| `shell.css` | Bottom tab bar, sidebar, topbar, speciality picker. |
| `session.css` | Session summary, stat grid, history list, empty states. |
| `roster.css` | Roster cards (phone) and table (desktop), status pills. |
| `modals.css` | Backdrop, sheet and dialog variants, form fields, toast. |
| `badges.css` | Badge grid and `@media print`. Dormant. |
| `index.css` | Imports the above in order. |

### 6.2 Breakpoint inversion

Four descending `max-width` queries become three ascending `min-width` ones.
Base styles target the phone.

| Width | Role |
|---|---|
| base | Phone. Single column, bottom tab bar, roster as cards. |
| `min-width: 48rem` | Tablet. 2-up grids, roster becomes a table. |
| `min-width: 64rem` | Desktop. Sidebar replaces the tab bar. |
| `min-width: 90rem` | Wide. Max content width, 4-up stat grid. |

The specific inversions: `.app-shell` block → flex; `.speciality-strip` 1 → 3
columns; `.stat-grid` 2 → 4 columns; `.roster-table` cards → table.

### 6.3 Fixes that follow from doing this properly

- **Remove the `.nav-item{font-size:0}` collapse hack.** Label text currently
  remains in the DOM and is still announced by screen readers while rendering
  at zero size. A real bottom tab bar replaces it, with
  `padding-bottom: env(safe-area-inset-bottom)` for notched devices.
- **Move the Google Fonts `@import` out of CSS.** A remote `@import` on line 1
  of the stylesheet serialises a second network round trip *after* the
  stylesheet parses, blocking first paint — the worst available pattern for
  mobile. It moves to `index.html` as `preconnect` + `link`, with
  `font-display: swap`.
- **Raise touch targets to 44px.** `.mini-button` is 29×29 and `.icon-close`
  33×33. The present/absent buttons are now the only input method in the app,
  so they must be comfortably thumb-sized.
- **Reshape the roster rather than shrink it.** `.roster-table` currently
  carries `min-width: 700px`, forcing horizontal scroll on a phone. On phone it
  becomes card rows — name and Student ID stacked, present/absent as a trailing
  segmented control positioned in the thumb arc — and returns to a table at
  `48rem`.

## 7. Component split

`App.tsx` retains shell state and composition only.

```
src/components/
  AppShell.tsx          nav chrome: tab bar, sidebar, topbar
  SpecialityPicker.tsx  the three-class selector
  SessionSummary.tsx    live/closed session header and actions
  StatGrid.tsx          present / absent / unchecked / class size
  RosterList.tsx        cards on phone, table on desktop
  SessionHistory.tsx    past sessions
  modals/
    CreateSessionModal.tsx
    ImportRosterModal.tsx
  badges/
    BadgePage.tsx       React.lazy
    ScannerModal.tsx    React.lazy
```

## 8. Badge dormancy

`src/config.ts` exports `BADGES_ENABLED = false`.

The badge nav item and page are hidden behind the flag. Both badge components
load via `React.lazy`, which moves `qrcode.react` out of the entry chunk;
`html5-qrcode` is already split. The flag therefore costs the phone nothing
while leaving the code, `badgeCode` seed values, the print stylesheet, and the
Python scripts intact.

`AttendanceEntry.method` keeps `'scan'` in its union so historical entries
remain valid, but nothing in the active UI produces it.

## 9. Build and tests

Add `@vitejs/plugin-react` to `vite.config.ts` for Fast Refresh. Do this first:
the restructure is heavy CSS and JSX iteration, and full page reloads make that
materially slower.

Add Vitest. Cover the pure logic, which is where the risk concentrates:

- `parseStudentName` — compound surnames, single token, lowercase fallback.
- `previewRosterImport` — added / updated / deactivated classification,
  duplicate ID, duplicate email, missing email, wrong-speciality isolation.
- `sessionStats` — totals read from `rosterIds`, unaffected by a later import.
- `closeSession` / `reopenSession` — round trip leaves no `session-close`
  entries behind.
- `exportSessionCsv` — quote escaping and the existing `=+@-` formula-injection
  guard.
- Session migration — `rosterIds` backfill for sessions lacking the field.

Layout is verified by driving the running app at 375 / 768 / 1280 widths.

## 10. Scope

Touches every file under `src/`, plus `index.html`, `vite.config.ts`, and
`package.json`.

Explicitly untouched: `web/`, `server/`, `scripts/`, `send.py`, `students.csv`,
`generated/`, and `Listes 2627/`.

## 11. Open dependency

The roster list (Student ID, name, email) is required before implementation can
begin. It determines the Section 5.4 migration branch. Design approval does not
depend on it.

## 12. Not doing

- Student self-check-in. Requires a shared backend; the app is localStorage-only.
- Expanding beyond three specialities, despite 22 class files in `Listes 2627/`.
- A router. Two pages are served fine by conditional rendering.
- Removing the badge code outright.
- Touching the dead `web/` and `server/` directories.
