# Présence Mobile-First Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Présence attendance webapp to be mobile-first, retire the QR badge flow behind a flag, and make the student roster editable per speciality.

**Architecture:** The stylesheet's cascade is inverted — phone styles become the base and three ascending `min-width` queries add tablet/desktop/wide layouts. `App.tsx` is reduced to shell state and composition, with presentation moved into focused components. The data layer gains a localStorage-backed roster (seeded from `students.json`) and a per-session membership snapshot so that editing a roster cannot retroactively alter closed sessions.

**Tech Stack:** React 18.3, TypeScript 5.9, Vite 5.4, Vitest + jsdom, lucide-react. `qrcode.react` and `html5-qrcode` remain installed but lazy-loaded and flag-gated.

**Spec:** `docs/superpowers/specs/2026-10-16-mobile-first-redesign-design.md`

## Global Constraints

- Specialities are exactly three: `1MAUT`, `1MESE`, `4IGEI`. Do not add more.
- Attendance is recorded by the teacher tapping the roster. No scanning in the active UI.
- `AttendanceEntry.method` keeps `'scan'` in its union for historical entries; nothing in the active UI produces it.
- `BADGES_ENABLED` is `false`. Badge components must be `React.lazy` so `qrcode.react` stays out of the entry chunk.
- Supplied roster columns are exactly: Student ID, Name, Email. Names are formatted `LASTNAME Firstname`.
- A re-import never deletes a student. Dropped students get `active: false` and keep their attendance entries.
- Minimum touch target for any interactive control: 44×44 CSS px.
- Breakpoints are `min-width` only, at `48rem`, `64rem`, `90rem`. No `max-width` queries except `print` and `prefers-reduced-motion`.
- Do not modify `web/`, `server/`, `scripts/`, `send.py`, `students.csv`, `generated/`, or `Listes 2627/`.

## File Structure

### Data layer

| File | Responsibility | Task |
|---|---|---|
| `src/roster.ts` | `Speciality`, `Student`, `specialities`, `parseStudentName`, roster storage | 2, 3 |
| `src/sessions.ts` | `AttendanceSession`, `AttendanceEntry`, create/close/reopen, stats, storage, backfill | 4 |
| `src/csv.ts` | `buildSessionCsv` (pure), `exportSessionCsv` (download) | 5 |
| `src/classroomImport.ts` | Delimited parsing (kept) + `previewRosterImport` / `applyRosterImport` | 6 |
| `src/migrate.ts` | One-time `oldId → newId` entry-key remap | 7 |
| `src/config.ts` | `BADGES_ENABLED` | 8 |
| `src/data/students.json` | Seed roster only — no longer source of truth | 3, 7 |
| ~~`src/model.ts`~~ | **Deleted** in Task 8; superseded by the three modules above | 8 |

`model.ts` currently mixes roster access, session lifecycle, and CSV serialisation. §4 and §5 add roster storage, the membership snapshot, migration, and new import semantics to it, which would push one file past 250 lines across three unrelated responsibilities. Splitting it keeps each file small enough to hold in context and lets `buildSessionCsv` be tested without a DOM.

### Styles

| File | Responsibility | Task |
|---|---|---|
| `src/styles/tokens.css` | Custom properties: colour, spacing, radii, shadow, type scale, `--tap` | 9 |
| `src/styles/base.css` | Reset, element defaults, focus rings, reduced-motion, print | 9 |
| `src/styles/shell.css` | Tab bar, sidebar, topbar, speciality strip | 10 |
| `src/styles/session.css` | Session summary, stat grid, history list, empty states | 12 |
| `src/styles/roster.css` | Roster cards → table, status pills, mark buttons | 11 |
| `src/styles/modals.css` | Backdrop, sheet/dialog variants, form fields, toast | 13 |
| `src/styles/badges.css` | Badge grid and `@media print`. Dormant. | 9 |
| `src/styles/index.css` | Imports the above in cascade order | 9 |
| ~~`src/styles.css`~~ | **Deleted** in Task 9 | 9 |

### Components

| File | Responsibility | Task |
|---|---|---|
| `src/App.tsx` | Shell state and composition only | 8–13 |
| `src/components/AppShell.tsx` | Nav chrome: tab bar, sidebar, topbar | 10 |
| `src/components/SpecialityPicker.tsx` | Three-class selector | 10 |
| `src/components/SessionSummary.tsx` | Live/closed session header and actions | 12 |
| `src/components/StatGrid.tsx` | Present / absent / unchecked / class size | 12 |
| `src/components/RosterList.tsx` | Cards on phone, table at `48rem`; the only check-in surface | 11 |
| `src/components/SessionHistory.tsx` | Past sessions | 12 |
| `src/components/modals/CreateSessionModal.tsx` | New session form | 13 |
| `src/components/modals/ImportRosterModal.tsx` | Per-speciality roster import; replaces `ImportEmailsModal` | 13 |
| `src/components/badges/BadgePage.tsx` | Dormant, `React.lazy` | 8 |
| `src/components/badges/ScannerModal.tsx` | Dormant, `React.lazy`; owns `normalizeBadge` / `findStudentByBadge` | 8 |

### Tests

`src/roster.test.ts`, `src/sessions.test.ts`, `src/csv.test.ts`, `src/classroomImport.test.ts`, `src/migrate.test.ts` — colocated beside the module each covers.

---

### Task 1: Tooling foundation

Gets version control, React Fast Refresh, and a test runner in place. Everything downstream depends on this.

**Files:**
- Create: `.git/` (via `git init`)
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/smoke.test.ts` (deleted in Task 2)

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` command; Vite dev server with HMR.

- [ ] **Step 1: Initialize the repository**

```bash
cd /home/mtamali/Documents/abscence
git init
git add -A
git commit -m "chore: baseline before mobile-first restructure"
```

`.gitignore` already exists and covers `node_modules` and `dist`. Verify with `git status` that neither is staged.

- [ ] **Step 2: Add the React plugin and test deps**

```bash
npm install -D @vitejs/plugin-react vitest jsdom
```

- [ ] **Step 3: Wire up Vite and Vitest**

Replace `vite.config.ts` entirely:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
```

Two things here are easy to get wrong. `defineConfig` must come from **`vitest/config`**, not `vite` — the one exported by `vite` has no `test` property in its type, so `tsc -b` fails. And `globals` is deliberately left off: every test file in this plan imports `describe`/`it`/`expect` explicitly, which avoids needing `"types": ["vitest/globals"]` in `tsconfig.json`.

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Confirm JSON imports are allowed**

Task 3 imports `src/data/students.json` from TypeScript. Check `tsconfig.json` for `"resolveJsonModule": true` and add it to `compilerOptions` if absent. The current `model.ts` already imports that file, so it is probably present — confirm rather than assume.

- [ ] **Step 5: Write a smoke test**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('harness', () => {
  it('runs and can reach localStorage', () => {
    localStorage.setItem('probe', 'ok')
    expect(localStorage.getItem('probe')).toBe('ok')
  })
})
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: PASS, 1 test. If `localStorage` is undefined, `environment: 'jsdom'` did not take effect.

- [ ] **Step 7: Verify HMR**

Run `./start.sh`, open `http://127.0.0.1:5173/`, edit a string in `src/App.tsx`, and confirm the browser updates **without** a full page reload. Before this task it always full-reloaded.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts package.json package-lock.json tsconfig.json src/smoke.test.ts
git commit -m "chore: add react plugin, vitest harness"
```

---

### Task 2: Name parsing

**Files:**
- Create: `src/roster.ts`
- Create: `src/roster.test.ts`
- Delete: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseStudentName(value: string): { lastName: string; firstName: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/roster.test.ts` and delete `src/smoke.test.ts` — the harness it proved is now exercised by real tests:

```ts
import { describe, it, expect } from 'vitest'
import { parseStudentName } from './roster'

describe('parseStudentName', () => {
  it('splits a simple LASTNAME Firstname', () => {
    expect(parseStudentName('KERBEL Seddik')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('keeps a compound uppercase surname together', () => {
    expect(parseStudentName('BEN AMAR Youcef')).toEqual({ lastName: 'BEN AMAR', firstName: 'Youcef' })
  })

  it('falls back to first-token surname when nothing is uppercase', () => {
    expect(parseStudentName('Kerbel Seddik')).toEqual({ lastName: 'Kerbel', firstName: 'Seddik' })
  })

  it('treats the last token as given name when everything is uppercase', () => {
    expect(parseStudentName('KERBEL SEDDIK')).toEqual({ lastName: 'KERBEL', firstName: 'SEDDIK' })
  })

  it('handles a single token', () => {
    expect(parseStudentName('KERBEL')).toEqual({ lastName: 'KERBEL', firstName: '' })
  })

  it('does not mistake digits for an uppercase surname', () => {
    expect(parseStudentName('38000789 Seddik')).toEqual({ lastName: '38000789', firstName: 'Seddik' })
  })

  it('collapses irregular whitespace', () => {
    expect(parseStudentName('  KERBEL   Seddik  ')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('preserves accented uppercase surnames', () => {
    expect(parseStudentName('BENALÎ Chaïma')).toEqual({ lastName: 'BENALÎ', firstName: 'Chaïma' })
  })

  it('returns empty strings for empty input', () => {
    expect(parseStudentName('   ')).toEqual({ lastName: '', firstName: '' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `parseStudentName` is not exported from `./roster` (module does not exist yet).

- [ ] **Step 3: Implement**

Create `src/roster.ts`:

```ts
function isUpperToken(token: string) {
  // A token counts as uppercase only if it contains at least one cased
  // character and none of them are lowercase. This keeps digit-only tokens
  // (matricules) from being read as surnames.
  return token === token.toLocaleUpperCase() && token !== token.toLocaleLowerCase()
}

export function parseStudentName(value: string): { lastName: string; firstName: string } {
  const tokens = value.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { lastName: '', firstName: '' }
  if (tokens.length === 1) return { lastName: tokens[0], firstName: '' }

  let split = 0
  while (split < tokens.length && isUpperToken(tokens[split])) split++

  if (split === 0) split = 1                          // no uppercase lead
  if (split === tokens.length) split = tokens.length - 1  // all uppercase

  return {
    lastName: tokens.slice(0, split).join(' '),
    firstName: tokens.slice(split).join(' '),
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git rm src/smoke.test.ts
git add src/roster.ts src/roster.test.ts
git commit -m "feat: parse LASTNAME Firstname student names"
```

---

### Task 3: Roster storage

**Files:**
- Modify: `src/roster.ts`
- Modify: `src/roster.test.ts`
- Read only: `src/data/students.json`

**Interfaces:**
- Consumes: `parseStudentName` (Task 2).
- Produces:
  - `type Speciality = '1MAUT' | '1MESE' | '4IGEI'`
  - `type Student = { id, lastName, firstName, email?, speciality, active, badgeCode? }`
  - `specialities: { id: Speciality; name: string; shortName: string }[]`
  - `getRoster(speciality: Speciality): Student[]`
  - `getActiveRoster(speciality: Speciality): Student[]`
  - `saveRoster(speciality: Speciality, students: Student[]): void`
  - `ROSTER_STORAGE_KEY = 'presence-roster-v1'`

- [ ] **Step 1: Write the failing tests**

Append to `src/roster.test.ts`. **Merge the imports** — do not add a second `from 'vitest'` line, which is a redeclaration error. The file's two import lines should end up as:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import { parseStudentName, getRoster, getActiveRoster, saveRoster, ROSTER_STORAGE_KEY, type Student } from './roster'
```

Then append this block:

```ts
function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'X', firstName: 'Y', speciality: '1MAUT', active: true, ...over }
}

describe('roster storage', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to the seed JSON when no override exists', () => {
    const seeded = getRoster('1MAUT')
    expect(seeded.length).toBe(21)
    expect(seeded.every(s => s.speciality === '1MAUT')).toBe(true)
    expect(seeded.every(s => s.active === true)).toBe(true)
  })

  it('reads the stored override in preference to the seed', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(getRoster('1MAUT').map(s => s.id)).toEqual(['A1'])
  })

  it('isolates specialities from one another', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(getRoster('1MESE').length).toBe(19)
  })

  it('excludes inactive students from the active roster but keeps them in the full roster', () => {
    saveRoster('1MAUT', [student('A1'), student('A2', { active: false })])
    expect(getActiveRoster('1MAUT').map(s => s.id)).toEqual(['A1'])
    expect(getRoster('1MAUT').map(s => s.id)).toEqual(['A1', 'A2'])
  })

  it('survives corrupt stored JSON by returning the seed', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, '{not json')
    expect(getRoster('1MAUT').length).toBe(21)
  })

  it('ignores a stored value of the wrong shape', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ '1MAUT': 'nope' }))
    expect(getRoster('1MAUT').length).toBe(21)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `getRoster` is not exported.

- [ ] **Step 3: Implement**

Append to `src/roster.ts`:

```ts
import seed from './data/students.json'

export type Speciality = '1MAUT' | '1MESE' | '4IGEI'

export type Student = {
  id: string
  lastName: string
  firstName: string
  email?: string
  speciality: Speciality
  active: boolean
  badgeCode?: string
}

export const specialities: { id: Speciality; name: string; shortName: string }[] = [
  { id: '1MAUT', name: 'Automation & industrial computing', shortName: 'Automation' },
  { id: '1MESE', name: 'Embedded electronic systems', shortName: 'Embedded systems' },
  { id: '4IGEI', name: 'Industrial electronic engineering', shortName: 'Industrial electronics' },
]

export const ROSTER_STORAGE_KEY = 'presence-roster-v1'

// The seed file still carries the pre-restructure shape (registration,
// matricule, section, group, badgeCode). Normalise it to the Student type and
// drop the fields that the supplied roster cannot populate.
type SeedRecord = { id: string; matricule: string; lastName: string; firstName: string; speciality: string; badgeCode?: string }

function seedRoster(speciality: Speciality): Student[] {
  return (seed as SeedRecord[])
    .filter(record => record.speciality === speciality)
    .map(record => ({
      id: record.id,
      lastName: record.lastName,
      firstName: record.firstName,
      speciality,
      active: true,
      badgeCode: record.badgeCode,
    }))
}

function loadOverrides(): Partial<Record<Speciality, Student[]>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROSTER_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

export function getRoster(speciality: Speciality): Student[] {
  const stored = loadOverrides()[speciality]
  return Array.isArray(stored) ? stored : seedRoster(speciality)
}

export function getActiveRoster(speciality: Speciality): Student[] {
  return getRoster(speciality).filter(student => student.active)
}

export function saveRoster(speciality: Speciality, students: Student[]) {
  const all = loadOverrides()
  all[speciality] = students
  localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(all))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/roster.ts src/roster.test.ts
git commit -m "feat: localStorage roster with students.json as seed"
```

---

### Task 4: Session membership snapshot

Fixes the defect where `sessionStats` derives `total` from the live roster, letting a re-import rewrite the totals of closed sessions.

**Files:**
- Create: `src/sessions.ts`
- Create: `src/sessions.test.ts`

**Interfaces:**
- Consumes: `getActiveRoster`, `getRoster`, `Speciality`, `Student` (Task 3).
- Produces:
  - `type AttendanceEntry = { status: 'present' | 'absent'; at: string; method: 'scan' | 'manual' | 'session-close' }`
  - `type AttendanceSession = { id, speciality, course, date, time, room, teacher, state, createdAt, closedAt?, rosterIds: string[], entries }`
  - `createSession(details): AttendanceSession`
  - `closeSession(session): AttendanceSession`
  - `reopenSession(session): AttendanceSession`
  - `sessionStats(session): { total, present, absent, unchecked }`
  - `loadSessions(): AttendanceSession[]`
  - `saveSessions(sessions: AttendanceSession[]): void`
  - `SESSION_STORAGE_KEY = 'presence-attendance-v1'`

- [ ] **Step 1: Write the failing tests**

Create `src/sessions.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import { saveRoster, type Student } from './roster'
import {
  createSession, closeSession, reopenSession, sessionStats,
  loadSessions, saveSessions, SESSION_STORAGE_KEY, type AttendanceSession,
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `./sessions` does not exist.

- [ ] **Step 3: Implement**

Create `src/sessions.ts`:

```ts
import { getActiveRoster, type Speciality } from './roster'

export type AttendanceEntry = {
  status: 'present' | 'absent'
  at: string
  // 'scan' is retained for entries recorded before badges were retired.
  method: 'scan' | 'manual' | 'session-close'
}

export type AttendanceSession = {
  id: string
  speciality: Speciality
  course: string
  date: string
  time: string
  room: string
  teacher: string
  state: 'open' | 'closed'
  createdAt: string
  closedAt?: string
  rosterIds: string[]
  entries: Partial<Record<string, AttendanceEntry>>
}

export const SESSION_STORAGE_KEY = 'presence-attendance-v1'

type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

export function createSession(details: SessionDetails): AttendanceSession {
  return {
    ...details,
    id: crypto.randomUUID(),
    state: 'open',
    createdAt: new Date().toISOString(),
    rosterIds: getActiveRoster(details.speciality).map(student => student.id),
    entries: {},
  }
}

export function closeSession(session: AttendanceSession): AttendanceSession {
  const now = new Date().toISOString()
  const entries = { ...session.entries }
  for (const id of session.rosterIds) {
    if (!entries[id]) entries[id] = { status: 'absent', at: now, method: 'session-close' }
  }
  return { ...session, state: 'closed', closedAt: now, entries }
}

export function reopenSession(session: AttendanceSession): AttendanceSession {
  const entries = { ...session.entries }
  for (const [id, entry] of Object.entries(entries)) {
    if (entry?.method === 'session-close') delete entries[id]
  }
  return { ...session, state: 'open', closedAt: undefined, entries }
}

export function sessionStats(session: AttendanceSession) {
  const members = new Set(session.rosterIds)
  let present = 0
  let absent = 0
  for (const [id, entry] of Object.entries(session.entries)) {
    if (!members.has(id)) continue
    if (entry?.status === 'present') present++
    else if (entry?.status === 'absent') absent++
  }
  const total = members.size
  return { total, present, absent, unchecked: total - present - absent }
}

// Sessions written before rosterIds existed are reconstructed from the union of
// whoever has an entry and whoever is currently active in that speciality.
// This is the closest honest reconstruction available.
function backfill(session: AttendanceSession): AttendanceSession {
  if (Array.isArray(session.rosterIds)) return session
  const ids = new Set(Object.keys(session.entries || {}))
  for (const student of getActiveRoster(session.speciality)) ids.add(student.id)
  return { ...session, rosterIds: [...ids] }
}

export function loadSessions(): AttendanceSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(backfill) : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: AttendanceSession[]) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sessions.ts src/sessions.test.ts
git commit -m "fix: snapshot session membership so roster edits cannot alter closed sessions"
```

---

### Task 5: CSV export

**Files:**
- Create: `src/csv.ts`
- Create: `src/csv.test.ts`

**Interfaces:**
- Consumes: `getRoster` (Task 3), `AttendanceSession`, `sessionStats` (Task 4).
- Produces:
  - `buildSessionCsv(session: AttendanceSession): string`
  - `exportSessionCsv(session: AttendanceSession): void`

Splitting the string building from the download lets the format be tested without a DOM anchor.

- [ ] **Step 1: Write the failing tests**

Create `src/csv.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import { saveRoster, type Student } from './roster'
import { createSession } from './sessions'
import { buildSessionCsv } from './csv'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}

const details = {
  speciality: '1MAUT' as const,
  course: 'Automation', date: '2026-10-16', time: '09:00', room: 'Lab 04', teacher: 'T',
}

describe('buildSessionCsv', () => {
  beforeEach(() => localStorage.clear())

  it('writes a BOM and the expected header', () => {
    saveRoster('1MAUT', [student('A1')])
    const csv = buildSessionCsv(createSession(details))
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.split('\r\n')[0]).toBe(
      '"Speciality","Course","Date","Time","Room","Teacher","Student ID","Last name","First name","Email","Status","Checked at","Method"'
    )
  })

  it('emits one row per snapshot member', () => {
    saveRoster('1MAUT', [student('A1'), student('A2')])
    expect(buildSessionCsv(createSession(details)).trim().split('\r\n').length).toBe(3)
  })

  it('includes deactivated students who are in the snapshot', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    saveRoster('1MAUT', [student('A1', { active: false })])
    expect(buildSessionCsv(session)).toContain('"LA1"')
  })

  it('reports unchecked students', () => {
    saveRoster('1MAUT', [student('A1')])
    expect(buildSessionCsv(createSession(details))).toContain('"unchecked"')
  })

  it('escapes embedded quotes by doubling them', () => {
    saveRoster('1MAUT', [student('A1', { lastName: 'O"BRIEN' })])
    expect(buildSessionCsv(createSession(details))).toContain('"O""BRIEN"')
  })

  it('neutralises formula injection', () => {
    saveRoster('1MAUT', [student('A1', { lastName: '=cmd|calc' })])
    expect(buildSessionCsv(createSession(details))).toContain(`"'=cmd|calc"`)
  })

  it('still names a student who vanished from the roster entirely', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    saveRoster('1MAUT', [])
    expect(buildSessionCsv(session)).toContain('"A1"')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `./csv` does not exist.

- [ ] **Step 3: Implement**

Create `src/csv.ts`:

```ts
import { getRoster } from './roster'
import type { AttendanceSession } from './sessions'

function csvCell(value: string) {
  // Leading =, +, @ or - make spreadsheets treat the cell as a formula.
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const HEADER = [
  'Speciality', 'Course', 'Date', 'Time', 'Room', 'Teacher',
  'Student ID', 'Last name', 'First name', 'Email', 'Status', 'Checked at', 'Method',
]

export function buildSessionCsv(session: AttendanceSession): string {
  const byId = new Map(getRoster(session.speciality).map(student => [student.id, student]))
  const rows = session.rosterIds.map(id => {
    const student = byId.get(id)
    const entry = session.entries[id]
    return [
      session.speciality, session.course, session.date, session.time, session.room, session.teacher,
      id,
      student?.lastName || '',
      student?.firstName || '',
      student?.email || '',
      entry?.status || 'unchecked',
      entry?.at || '',
      entry?.method || '',
    ]
  })
  return '\uFEFF' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function exportSessionCsv(session: AttendanceSession) {
  const url = URL.createObjectURL(new Blob([buildSessionCsv(session)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${session.speciality}-${session.date}-${session.course.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, 31 tests.

- [ ] **Step 5: Commit**

```bash
git add src/csv.ts src/csv.test.ts
git commit -m "feat: export session csv from the membership snapshot"
```

---

### Task 6: Roster import preview

**Files:**
- Modify: `src/classroomImport.ts`
- Create: `src/classroomImport.test.ts`

**Interfaces:**
- Consumes: `parseStudentName`, `Student`, `Speciality` (Tasks 2–3).
- Produces:
  - `type RosterImportPreview = { added: Student[]; updated: Student[]; deactivated: Student[]; unchanged: Student[]; issues: { name: string; reason: string }[]; totalRows: number }`
  - `previewRosterImport(text: string, speciality: Speciality, currentRoster: Student[]): RosterImportPreview`
  - `applyRosterImport(preview: RosterImportPreview): Student[]`

Keep the existing `parseDelimited`, `headerIndex`, and `normalized` helpers unchanged — they already handle quoted cells, doubled quotes, CRLF, delimiter sniffing and BOM stripping. Delete `previewClassroomImport`, `ImportedEmail`, and `ImportPreview`.

- [ ] **Step 1: Write the failing tests**

Create `src/classroomImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { previewRosterImport, applyRosterImport } from './classroomImport'
import type { Student } from './roster'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'OLD', firstName: 'Name', speciality: '1MAUT', active: true, ...over }
}

const header = 'Student ID,Name,Email'

describe('previewRosterImport', () => {
  it('classifies a new student as added', () => {
    const preview = previewRosterImport(`${header}\n1,KERBEL Seddik,k@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([
      { id: '1', lastName: 'KERBEL', firstName: 'Seddik', email: 'k@x.dz', speciality: '1MAUT', active: true },
    ])
    expect(preview.updated).toEqual([])
    expect(preview.deactivated).toEqual([])
  })

  it('classifies a known id as updated and overwrites name and email', () => {
    const preview = previewRosterImport(`${header}\n1,NEW Name,n@x.dz`, '1MAUT', [student('1')])
    expect(preview.updated[0]).toMatchObject({ id: '1', lastName: 'NEW', firstName: 'Name', email: 'n@x.dz' })
    expect(preview.added).toEqual([])
  })

  it('reactivates a deactivated student present in the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1', { active: false })])
    expect(preview.updated[0].active).toBe(true)
  })

  it('preserves an existing badgeCode on update', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1', { badgeCode: 'ATD26-X' })])
    expect(preview.updated[0].badgeCode).toBe('ATD26-X')
  })

  it('deactivates a student missing from the file rather than deleting', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1'), student('2')])
    expect(preview.deactivated.map(s => s.id)).toEqual(['2'])
    expect(preview.deactivated[0].active).toBe(false)
  })

  it('does not re-report an already inactive absent student', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1'), student('2', { active: false })])
    expect(preview.deactivated).toEqual([])
  })

  it('adds the student but reports a missing email as an issue', () => {
    const preview = previewRosterImport(`${header}\n1,KERBEL Seddik,`, '1MAUT', [])
    expect(preview.added[0].email).toBeUndefined()
    expect(preview.issues[0].reason).toMatch(/email/i)
  })

  it('rejects a duplicate student id within the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz\n1,C D,c@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /duplicate/i.test(i.reason))).toBe(true)
  })

  it('rejects a duplicate email within the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,same@x.dz\n2,C D,same@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /duplicate/i.test(i.reason))).toBe(true)
  })

  it('rejects a row with no student id', () => {
    const preview = previewRosterImport(`${header}\n,A B,a@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /id/i.test(i.reason))).toBe(true)
  })

  it('stamps every imported student with the target speciality', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '4IGEI', [])
    expect(preview.added[0].speciality).toBe('4IGEI')
  })

  it('accepts semicolon delimiters and a BOM', () => {
    const preview = previewRosterImport(`\uFEFFStudent ID;Name;Email\n1;A B;a@x.dz`, '1MAUT', [])
    expect(preview.added.length).toBe(1)
  })

  it('accepts Matricule and Nom as column aliases', () => {
    const preview = previewRosterImport(`Matricule,Nom,Email\n1,A B,a@x.dz`, '1MAUT', [])
    expect(preview.added.length).toBe(1)
  })

  it('throws when the Student ID column is absent', () => {
    expect(() => previewRosterImport('Name,Email\nA B,a@x.dz', '1MAUT', [])).toThrow(/student id/i)
  })

  it('throws when the Name column is absent', () => {
    expect(() => previewRosterImport('Student ID,Email\n1,a@x.dz', '1MAUT', [])).toThrow(/name/i)
  })

  it('throws on an empty file', () => {
    expect(() => previewRosterImport('', '1MAUT', [])).toThrow(/empty/i)
  })

  it('counts data rows excluding the header', () => {
    expect(previewRosterImport(`${header}\n1,A B,a@x.dz\n2,C D,c@x.dz`, '1MAUT', []).totalRows).toBe(2)
  })
})

describe('applyRosterImport', () => {
  it('merges added, updated and deactivated into one roster', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz\n3,E F,e@x.dz`, '1MAUT', [student('1'), student('2')])
    const result = applyRosterImport(preview)
    expect(result.map(s => s.id).sort()).toEqual(['1', '2', '3'])
    expect(result.find(s => s.id === '2')!.active).toBe(false)
    expect(result.find(s => s.id === '3')!.active).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `previewRosterImport` is not exported.

- [ ] **Step 3: Implement**

In `src/classroomImport.ts`, keep `normalized`, `headerIndex`, `detectDelimiter`, and `parseDelimited` exactly as they are. Replace everything else:

```ts
import { parseStudentName, type Speciality, type Student } from './roster'

export type RosterImportPreview = {
  added: Student[]
  updated: Student[]
  deactivated: Student[]
  issues: { name: string; reason: string }[]
  totalRows: number
  unchanged: Student[]
}

const ID_ALIASES = ['studentid', 'matricule', 'studentnumber', 'numeroinscription', 'id']
const NAME_ALIASES = ['name', 'fullname', 'studentname', 'nom', 'nomcomplet', 'nomdeleleve']
const EMAIL_ALIASES = ['email', 'emailaddress', 'studentemail', 'courriel', 'adresseemail', 'adressemail']

export function previewRosterImport(text: string, speciality: Speciality, currentRoster: Student[]): RosterImportPreview {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''))
  if (!rows.length) throw new Error('The file is empty.')

  const headers = rows[0]
  const idIndex = headerIndex(headers, ID_ALIASES)
  const nameIndex = headerIndex(headers, NAME_ALIASES)
  const emailIndex = headerIndex(headers, EMAIL_ALIASES)
  if (idIndex < 0) throw new Error('The file needs a Student ID column.')
  if (nameIndex < 0) throw new Error('The file needs a Name column.')

  const existing = new Map(currentRoster.map(student => [student.id, student]))
  const dataRows = rows.slice(1)
  const issues: RosterImportPreview['issues'] = []

  type Candidate = { id: string; lastName: string; firstName: string; email?: string }
  const candidates: Candidate[] = []

  for (const row of dataRows) {
    const id = (row[idIndex] || '').trim()
    const rawName = (row[nameIndex] || '').trim()
    const email = emailIndex >= 0 ? (row[emailIndex] || '').trim().toLowerCase() : ''
    const label = rawName || id || 'Unnamed row'

    if (!id) { issues.push({ name: label, reason: 'Missing Student ID' }); continue }
    if (!rawName) { issues.push({ name: id, reason: 'Missing name' }); continue }

    const { lastName, firstName } = parseStudentName(rawName)
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!validEmail) issues.push({ name: label, reason: 'Missing or invalid email' })

    candidates.push({ id, lastName, firstName, email: validEmail ? email : undefined })
  }

  // Reject duplicates within the file outright rather than guessing.
  const idCounts = new Map<string, number>()
  const emailCounts = new Map<string, number>()
  for (const candidate of candidates) {
    idCounts.set(candidate.id, (idCounts.get(candidate.id) || 0) + 1)
    if (candidate.email) emailCounts.set(candidate.email, (emailCounts.get(candidate.email) || 0) + 1)
  }

  const added: Student[] = []
  const updated: Student[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (idCounts.get(candidate.id)! > 1) {
      issues.push({ name: candidate.id, reason: 'Duplicate Student ID in the file' })
      continue
    }
    if (candidate.email && emailCounts.get(candidate.email)! > 1) {
      issues.push({ name: candidate.id, reason: 'Duplicate email in the file' })
      continue
    }
    seen.add(candidate.id)
    const previous = existing.get(candidate.id)
    const next: Student = {
      id: candidate.id,
      lastName: candidate.lastName,
      firstName: candidate.firstName,
      email: candidate.email,
      speciality,
      active: true,
      badgeCode: previous?.badgeCode,
    }
    if (previous) updated.push(next)
    else added.push(next)
  }

  // Active students missing from the file are deactivated, never deleted.
  const deactivated = currentRoster
    .filter(student => student.active && !seen.has(student.id))
    .map(student => ({ ...student, active: false }))

  // Students already inactive and absent from the file are reported in neither
  // bucket, but must still survive the merge or their history is lost.
  const unchanged = currentRoster.filter(student => !student.active && !seen.has(student.id))

  return { added, updated, deactivated, unchanged, issues, totalRows: dataRows.length }
}

export function applyRosterImport(preview: RosterImportPreview): Student[] {
  const merged = new Map<string, Student>()
  for (const student of [
    ...preview.unchanged,
    ...preview.deactivated,
    ...preview.updated,
    ...preview.added,
  ]) {
    merged.set(student.id, student)
  }
  return [...merged.values()]
}
```

`unchanged` is not in the spec's §5.1 signature — it is an addition, recorded in the Deviations section at the end of this plan. It is deliberately excluded from the counts the import modal shows, because nothing about those students changed.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, 49 tests.

- [ ] **Step 5: Commit**

```bash
git add src/classroomImport.ts src/classroomImport.test.ts
git commit -m "feat: per-speciality roster import with deactivation"
```

---

### Task 7: Load the supplied roster

**BLOCKED:** needs the roster file (Student ID, name, email). Do not start this task until it is supplied and its path is known.

**Files:**
- Create: `scripts/seed-roster.mjs`
- Modify: `src/data/students.json`
- Create: `src/migrate.ts`
- Create: `src/migrate.test.ts`

**Interfaces:**
- Consumes: `previewRosterImport`, `applyRosterImport` (Task 6), `saveRoster` (Task 3).
- Produces: `migrateLegacyEntryKeys(): { migrated: boolean; reason: string }`

- [ ] **Step 1: Inspect the supplied file**

Read the first three lines and confirm the columns and the ID scheme. Compare the IDs against the `matricule` values in the current `src/data/students.json`.

- [ ] **Step 2: Decide the migration branch**

Per spec §5.4: if every supplied Student ID matches a seed `matricule`, build the `oldId → newId` map and remap entry keys in place, keeping `presence-attendance-v1`. Otherwise bump to `presence-attendance-v2` and start clean.

- [ ] **Step 3: Write the failing test for the chosen branch**

For the remap branch:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import { migrateLegacyEntryKeys } from './migrate'
import { SESSION_STORAGE_KEY } from './sessions'

describe('migrateLegacyEntryKeys', () => {
  beforeEach(() => localStorage.clear())

  it('remaps entry keys from the old id to the matricule', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([{
      id: 's1', speciality: '1MAUT', course: 'C', date: '2026-01-01', time: '08:00',
      room: '', teacher: '', state: 'open', createdAt: '2026-01-01T08:00:00.000Z',
      rosterIds: ['UN08012026181838000789'],
      entries: { UN08012026181838000789: { status: 'present', at: 'then', method: 'manual' } },
    }]))

    expect(migrateLegacyEntryKeys().migrated).toBe(true)

    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)
    expect(Object.keys(stored[0].entries)).toEqual(['38000789'])
    expect(stored[0].rosterIds).toEqual(['38000789'])
  })

  it('is idempotent', () => {
    migrateLegacyEntryKeys()
    expect(migrateLegacyEntryKeys().migrated).toBe(false)
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test`
Expected: FAIL — `./migrate` does not exist.

- [ ] **Step 5: Implement the chosen branch, then run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Seed the roster from the supplied file**

Write `scripts/seed-roster.mjs` to read the supplied file and emit the three speciality rosters into `src/data/students.json` in the new `Student` shape. Run it and confirm the counts per speciality against the file.

- [ ] **Step 7: Update the seed counts in the roster tests**

Task 3's tests assert the seed sizes literally — `toBe(21)` for 1MAUT and `toBe(19)` for 1MESE, which were the pre-restructure counts. Replacing `students.json` in Step 6 breaks them. Update those three assertions in `src/roster.test.ts` to the new per-speciality counts, then:

Run: `npm test`
Expected: PASS. A failure here means the seed file did not come out as intended — fix the script, not the assertion.

- [ ] **Step 8: Commit**

```bash
git add src/data/students.json src/migrate.ts src/migrate.test.ts src/roster.test.ts scripts/seed-roster.mjs
git commit -m "feat: seed roster from supplied list and migrate entry keys"
```

---

### Task 8: Data-layer cutover, badge flag and lazy loading

**Files:**
- Create: `src/config.ts`
- Create: `src/components/badges/BadgePage.tsx` (moved from `App.tsx`)
- Create: `src/components/badges/ScannerModal.tsx` (moved from `App.tsx`)
- Modify: `src/App.tsx`
- Delete: `src/model.ts`

**Interfaces:**
- Consumes: `getRoster`, `getActiveRoster`, `specialities`, `Student`, `Speciality` (Task 3); `createSession`, `closeSession`, `reopenSession`, `sessionStats`, `loadSessions`, `saveSessions` (Task 4); `exportSessionCsv` (Task 5).
- Produces: `BADGES_ENABLED: boolean`; default-exported lazy-loadable `BadgePage` and `ScannerModal`.

- [ ] **Step 1: Retire `model.ts`**

Tasks 3–5 superseded `model.ts` but nothing has repointed its consumers, so the old data layer is still live. Do that now, because the badge components being extracted in Step 3 import from it.

Repoint every import in `src/App.tsx` from `./model` to its new home, then delete `src/model.ts`. The full symbol mapping:

| Was imported from `./model` | Now |
|---|---|
| `Speciality`, `Student`, `specialities`, `students` | `./roster` — but `students` has no replacement; use `getRoster` / `getActiveRoster` |
| `getStudents` | `./roster` as `getActiveRoster` (live roster) or `getRoster` (historical session) |
| `AttendanceSession`, `AttendanceEntry` | `./sessions` |
| `createSession`, `closeSession`, `reopenSession`, `sessionStats`, `loadSessions`, `saveSessions` | `./sessions` |
| `exportSessionCsv` | `./csv` |
| `normalizeBadge`, `findStudentByBadge` | move into `src/components/badges/ScannerModal.tsx` as module-private helpers — that is now their only consumer |
| `loadStudentEmails`, `saveStudentEmails` | **deleted** — email now arrives in the roster itself (spec §4.1), so the separate `presence-student-emails-v1` key is obsolete |

Two render sites also change shape: the roster table's `Group` column and the `section` subtitle fallback are removed, because neither field exists on the new `Student` (spec §4.1). The subtitle becomes `student.email ?? student.id`.

Run: `npm run build`
Expected: no TypeScript errors, and no file imports `./model`. Confirm with `grep -rn "from './model'" src/` returning nothing.

- [ ] **Step 2: Create the flag**

```ts
// src/config.ts
// Badges are retired. The code is retained but unreachable; both badge
// components are React.lazy so neither QR library enters the entry chunk.
export const BADGES_ENABLED = false
```

- [ ] **Step 3: Move the components**

Move `BadgePage` and `ScannerModal` out of `App.tsx` into the paths above, each as a `default` export. Keep their JSX unchanged for now — Task 11 and Task 13 restyle what survives.

- [ ] **Step 4: Lazy-import them in `App.tsx`**

```tsx
import { lazy, Suspense } from 'react'
import { BADGES_ENABLED } from './config'

const BadgePage = lazy(() => import('./components/badges/BadgePage'))
const ScannerModal = lazy(() => import('./components/badges/ScannerModal'))
```

Gate every badge entry point on `BADGES_ENABLED`: the `page === 'badges'` nav item, the badges branch of the page switch, and the scanner button in `SessionSummary`. Wrap rendered lazy components in `<Suspense fallback={null}>`.

- [ ] **Step 5: Verify the chunk split**

```bash
npm run build
grep -o 'assets/[^"]*\.js' dist/index.html          # names the entry chunk
for f in dist/assets/*.js; do
  printf '%s\t%s\tqrcode-hits=%s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)" "$(grep -c 'QRCodeSVG' "$f" || true)"
done
```

Expected: the entry chunk named by `dist/index.html` reports `qrcode-hits=0`, and is measurably smaller than the 212 KB baseline. Record the new size in the commit message.

Match on `QRCodeSVG` specifically, not a loose `qrcode` pattern — the looser pattern matches import paths and comments in unrelated chunks and will report false positives.

- [ ] **Step 6: Verify the UI**

Run `./start.sh`. Expected: no "Student badges" nav item, no scan button on a live session, and the roster's present/absent buttons still work.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/components/badges/ src/App.tsx
git rm src/model.ts
git commit -m "refactor: retire model.ts, gate badges behind a flag, lazy-load QR libraries"
```

---

### Task 9: Mobile-first style foundation

**Files:**
- Create: `src/styles/tokens.css`, `base.css`, `shell.css`, `session.css`, `roster.css`, `modals.css`, `badges.css`, `index.css`
- Delete: `src/styles.css`
- Modify: `src/main.tsx` (import `./styles/index.css`)
- Modify: `index.html` (fonts)

**Interfaces:**
- Consumes: nothing.
- Produces: the custom properties and breakpoint conventions every later CSS task builds on.

- [ ] **Step 1: Move the fonts out of CSS**

Delete the `@import url('https://fonts.googleapis.com/...')` from line 1 of the old stylesheet. Add to `index.html` `<head>`, before the stylesheet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" />
```

A remote `@import` inside CSS serialises a second round trip after the stylesheet parses, blocking first paint. `display=swap` renders fallback text immediately.

- [ ] **Step 2: Write the tokens**

`src/styles/tokens.css` — lift the existing palette from the old `:root` block and add spacing, radii and a type scale:

```css
:root {
  --ink: #142b39;
  --muted: #6d7d87;
  --teal: #067d82;
  --teal-strong: #087f83;
  --line: #e3e9ec;
  --surface: #fff;
  --canvas: #f5f7f8;
  --navy: #112c3b;
  --shadow: 0 12px 35px rgba(19, 44, 59, .055);

  --ok-fg: #14836a;   --ok-bg: #e7f6ee;
  --no-fg: #c7746a;   --no-bg: #fff0ed;
  --idle-fg: #84949b; --idle-bg: #f4f6f7;

  --space-1: .25rem; --space-2: .5rem;  --space-3: .75rem;
  --space-4: 1rem;   --space-5: 1.5rem; --space-6: 2rem;

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px;

  --tap: 2.75rem;            /* 44px minimum touch target */
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-display: 'Manrope', 'DM Sans', system-ui, sans-serif;

  --bp-tablet: 48rem; --bp-desktop: 64rem; --bp-wide: 90rem;
}
```

Custom properties cannot be used in media queries, so `--bp-*` are documentation only — write the literal `48rem` / `64rem` / `90rem` in `@media` rules.

- [ ] **Step 3: Write the base layer**

`src/styles/base.css` — reset, element defaults, focus rings, and the two retained non-`min-width` queries:

```css
*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-width: 320px;
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--canvas);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, strong { font-family: var(--font-display); }
h1, h2, h3, p { margin-top: 0; }

button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; }

:where(button, input, select, a):focus-visible {
  outline: 3px solid #8adad8;
  outline-offset: 2px;
}

/* Every interactive control clears the thumb threshold. */
:where(button, select, input[type="date"], input[type="time"]) { min-height: var(--tap); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Create the remaining module files and the barrel**

Create `shell.css`, `session.css`, `roster.css`, `modals.css`, and `badges.css` as empty files with a one-line comment naming their responsibility — Tasks 10–13 fill them. Then:

```css
/* src/styles/index.css */
@import './tokens.css';
@import './base.css';
@import './shell.css';
@import './session.css';
@import './roster.css';
@import './modals.css';
@import './badges.css';
```

These are local `@import`s, which Vite inlines at build time — unlike the remote font import removed in Step 1, they cost no extra request.

- [ ] **Step 5: Port the remaining rules**

Move every rule from the old `src/styles.css` into the module matching its responsibility, **base rules first in phone form**. For each of the four old `max-width` blocks, invert: what the 420/700 blocks did becomes the base, and what the unprefixed rules did becomes the `min-width: 64rem` block. Delete `src/styles.css` and point `src/main.tsx` at `./styles/index.css`.

Do not port `.nav-item{font-size:0}` — Task 10 replaces it.

- [ ] **Step 6: Verify**

```bash
npm run build
grep -c 'max-width' dist/assets/*.css
```

Expected: matches only inside `@media print`. Then run `./start.sh` and confirm at 375px width that nothing overflows horizontally.

- [ ] **Step 7: Commit**

```bash
git add src/styles/ src/main.tsx index.html
git rm src/styles.css
git commit -m "refactor: split stylesheet into mobile-first modules"
```

---

### Task 10: App shell and bottom tab bar

**Files:**
- Create: `src/components/AppShell.tsx`
- Create: `src/components/SpecialityPicker.tsx`
- Modify: `src/styles/shell.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `specialities`, `getActiveRoster`, `Speciality` (Task 3); `BADGES_ENABLED` (Task 8).
- Produces:
  - `AppShell({ page, onPageChange, speciality, children })`
  - `SpecialityPicker({ speciality, onChange })`

- [ ] **Step 1: Build the shell**

`AppShell` renders the topbar, a `<nav class="tabbar">` on phone, and a `<aside class="sidebar">` at desktop. Render the navigation markup **once** and let CSS decide which presentation applies — do not duplicate it, and do not hide labels with `font-size: 0`. Labels stay as real text; where the visual design needs icon-only, use a visually-hidden span:

```css
.tabbar-label {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
@media (min-width: 64rem) {
  .tabbar-label { position: static; width: auto; height: auto; margin: 0; clip-path: none; }
}
```

- [ ] **Step 2: Style the tab bar**

In `src/styles/shell.css`:

```css
.tabbar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 10;
  display: flex;
  background: var(--navy);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.tabbar button {
  flex: 1;
  min-height: var(--tap);
  display: grid;
  place-items: center;
  gap: var(--space-1);
  border: 0;
  background: none;
  color: #a9bec8;
}

.tabbar button[aria-current="page"] { color: #68cfca; }

/* Keep the last roster row clear of the fixed bar. */
.content-wrap { padding-bottom: calc(var(--tap) + env(safe-area-inset-bottom, 0) + var(--space-5)); }

@media (min-width: 64rem) {
  .tabbar { position: static; flex-direction: column; }
  .content-wrap { padding-bottom: var(--space-6); }
}
```

Mark the active tab with `aria-current="page"`, not a class alone.

- [ ] **Step 3: Verify**

Run `./start.sh`. At 375px: tab bar pinned to the bottom, every target ≥44px, no horizontal scroll, last roster row reachable above the bar. At 1280px: sidebar with visible labels. Tab through the nav and confirm focus rings are visible in both layouts.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx src/components/SpecialityPicker.tsx src/styles/shell.css src/App.tsx
git commit -m "feat: bottom tab bar on phone, sidebar on desktop"
```

---

### Task 11: Roster list

The highest-value screen: it is now the only way attendance is recorded.

**Files:**
- Create: `src/components/RosterList.tsx`
- Modify: `src/styles/roster.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Student` (Task 3); `AttendanceSession` (Task 4).
- Produces: `RosterList({ session, students, search, filter, onSearch, onFilter, onMark })` where `onMark(student: Student, status: 'present' | 'absent')`.

- [ ] **Step 1: Build one markup tree for both layouts**

Render a `<ul>` of rows. Each row carries the student's name, Student ID, email, status pill, and a two-button present/absent group. Do not render a `<table>` on phone and a list on desktop — one tree, restyled. The old `Group` column and `section` subtitle are gone; the subtitle is the email, falling back to the Student ID.

- [ ] **Step 2: Style phone-first**

```css
.roster-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }

.roster-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.roster-row-id { color: var(--muted); font-size: .75rem; }

.roster-mark { display: flex; gap: var(--space-2); }

.roster-mark button {
  width: var(--tap);
  height: var(--tap);
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
}

.roster-mark button[aria-pressed="true"]:first-child { background: var(--ok-bg); color: var(--ok-fg); }
.roster-mark button[aria-pressed="true"]:last-child  { background: var(--no-bg); color: var(--no-fg); }

@media (min-width: 48rem) {
  .roster-list { display: table; width: 100%; border-collapse: collapse; gap: 0; }
  .roster-row  { display: table-row; }
  .roster-row > * { display: table-cell; vertical-align: middle; padding: var(--space-3); border-bottom: 1px solid var(--line); }
}
```

The buttons are `aria-pressed` toggles, so state is exposed to screen readers rather than carried by colour alone.

- [ ] **Step 3: Verify**

Run `./start.sh`, create a session. At 375px: rows are cards, no horizontal scroll, both mark buttons ≥44px and reachable one-handed; tapping updates the stat grid. At 1280px: a table. With a screen reader or the accessibility inspector, confirm each button announces its pressed state.

- [ ] **Step 4: Commit**

```bash
git add src/components/RosterList.tsx src/styles/roster.css src/App.tsx
git commit -m "feat: roster as cards on phone, table on desktop"
```

---

### Task 12: Session surface components

**Files:**
- Create: `src/components/SessionSummary.tsx`, `StatGrid.tsx`, `SessionHistory.tsx`
- Modify: `src/styles/session.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AttendanceSession`, `sessionStats` (Task 4); `exportSessionCsv` (Task 5); `BADGES_ENABLED` (Task 8).
- Produces:
  - `SessionSummary({ session, onClose, onReopen, onExport })`
  - `StatGrid({ stats })`
  - `SessionHistory({ sessions, selectedId, onSelect })`

- [ ] **Step 1: Extract the three components from `App.tsx`**

Move the existing JSX out verbatim first, confirm the app still renders, then restyle. The scan button in `SessionSummary` is removed — gate it on `BADGES_ENABLED`.

- [ ] **Step 2: Style phone-first**

```css
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
.session-summary { display: grid; gap: var(--space-4); padding: var(--space-4); border-radius: var(--radius-lg); background: #163949; color: #fff; }
.session-summary-actions { display: grid; gap: var(--space-2); }

@media (min-width: 48rem) {
  .session-summary { grid-template-columns: 1fr auto; align-items: center; }
  .session-summary-actions { grid-auto-flow: column; }
}
@media (min-width: 90rem) {
  .stat-grid { grid-template-columns: repeat(4, 1fr); }
}
```

The decorative `.session-summary:after` ring is pure ornament at 240px wide — drop it below `48rem` rather than letting it overflow a phone.

The history list drops the per-row count and state badges on phone (they were `display:none` at 700px before); keep the date, course, and time.

- [ ] **Step 3: Verify**

Run `./start.sh`. At 375px: stats are 2×2, summary stacks, action buttons are full-width and ≥44px, no overflow from the decorative ring. At 1440px: stats are 4-up.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionSummary.tsx src/components/StatGrid.tsx src/components/SessionHistory.tsx src/styles/session.css src/App.tsx
git commit -m "feat: mobile-first session summary, stats and history"
```

---

### Task 13: Modals as sheets

**Files:**
- Create: `src/components/modals/CreateSessionModal.tsx`
- Create: `src/components/modals/ImportRosterModal.tsx`
- Modify: `src/styles/modals.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `previewRosterImport`, `applyRosterImport`, `RosterImportPreview` (Task 6); `saveRoster` (Task 3).
- Produces:
  - `CreateSessionModal({ speciality, onClose, onCreate })`
  - `ImportRosterModal({ speciality, currentRoster, onClose, onApply })`

- [ ] **Step 1: Move `CreateSessionModal` out of `App.tsx`**

Unchanged behaviour. Its `.field-row` must stack on phone — that is now the base, with `grid-auto-flow: column` added at `48rem`.

- [ ] **Step 2: Build `ImportRosterModal`**

Replaces the deleted `ImportEmailsModal`. It must:

- State the target speciality in the heading, so it is obvious which class is being replaced.
- Accept `.csv`/`.tsv` via a file input, call `previewRosterImport(text, speciality, currentRoster)`, and catch the thrown column errors into an inline `role="alert"`.
- Show the three counts — added, updated, deactivated — plus the issue list, **before** anything is written.
- Explain the deactivation rule in one line: students missing from the file are kept and marked inactive, not deleted.
- Only on confirm, call `onApply(applyRosterImport(preview))`, which writes via `saveRoster`.

- [ ] **Step 3: Style as a bottom sheet on phone**

```css
.modal-backdrop {
  position: fixed; inset: 0; z-index: 20;
  background: rgba(9, 29, 39, .56);
  display: grid; align-items: end;
}

.modal {
  width: 100%;
  max-height: 92vh;
  overflow: auto;
  padding: var(--space-5);
  padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0));
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.modal-actions { display: grid; gap: var(--space-2); }

@media (min-width: 48rem) {
  .modal-backdrop { place-items: center; padding: var(--space-5); }
  .modal { width: min(100%, 33rem); border-radius: var(--radius-lg); }
  .modal-actions { grid-auto-flow: column; justify-content: flex-end; }
}
```

A sheet anchored to the bottom puts the confirm button in the thumb arc instead of centring it mid-screen.

- [ ] **Step 4: Verify end to end**

Write a 4-row test CSV where one row repeats an existing Student ID, one is new, one has a malformed email, and one existing student is omitted. Import it against 1MAUT. Expected: counts read 1 added / 1 updated / 1 deactivated, the bad email appears in issues, and after confirming, the deactivated student disappears from the open session's roster but still appears in a previously closed session and its CSV export.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/ src/styles/modals.css src/App.tsx
git commit -m "feat: sheet modals and per-speciality roster import UI"
```

---

### Task 14: Final verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: all tests pass, no skips.

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: no TypeScript errors. `tsconfig.json` sets `noUnusedLocals` and `noUnusedParameters`, so every icon import left over from the old `App.tsx` must be removed — expect this step to catch several.

- [ ] **Step 3: Confirm the bundle improved**

```bash
ls -lh dist/assets/
grep -o 'src="[^"]*"' dist/index.html
```

Expected: the entry chunk is smaller than the 212 KB baseline and contains no `qrcode.react`.

- [ ] **Step 4: Drive the app at three widths**

Run `./start.sh` and exercise create session → mark present → mark absent → close → reopen → export CSV → import roster at 375px, 768px, and 1280px. At 375px specifically: no horizontal scroll anywhere, no control under 44px, the tab bar clears the home indicator, and the last roster row is reachable.

- [ ] **Step 5: Confirm the spec's invariants hold**

- No `max-width` media query outside `@media print`.
- No `font-size: 0` anywhere.
- No remote `@import` in any CSS file.
- Badge nav item and scan button absent from the UI.
- A closed session's totals unchanged after re-importing that speciality.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: mobile-first restructure verification pass"
```

---

## Deviations from the spec

1. **`model.ts` is split** into `roster.ts`, `sessions.ts`, and `csv.ts`. The spec's §7 only called for splitting `App.tsx`, but §4 and §5 push `model.ts` past 250 lines across three unrelated responsibilities. Flagged for the reviewer.
2. **`buildSessionCsv` is separated from `exportSessionCsv`** so the format is testable without a DOM anchor. The spec named only `exportSessionCsv`.
3. **`RosterImportPreview` carries an `unchanged` field** not named in the spec, to preserve already-inactive students across a merge.
