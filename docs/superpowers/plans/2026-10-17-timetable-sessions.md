# Timetable Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every attendance session a course code and a CR/TD/TP type, and let the teacher fill a recurring weekly grid of 5 days × 6 time slots that turns into today's session with one tap.

**Architecture:** Two new pure modules (`src/courses.ts`, `src/timetable.ts`) own storage, validation and mutation for the global course list and the one shared timetable, following the existing `roster.ts` / `sessions.ts` pattern: validation is a function returning an error string, mutation never throws, and nothing touches React. `AttendanceSession` gains `specialities: Speciality[]`, `courseCode`, `type?` and `origin?`, so a lecture shared by three classes is one session with a combined roster rather than three. Two new screens (Timetable, Courses) join Attendance behind the existing `AppShell` nav; the grid is a vertical day list on phone and a 5 × 6 grid from 48rem, driven by CSS alone.

**Tech Stack:** Vite 5.4.21, React 18.3.1, TypeScript 5.9.3 (strict, `noUnusedLocals`, `noUnusedParameters`), Vitest 2.1.9 + jsdom 25, lucide-react icons, plain CSS modules under `src/styles/`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-timetable-sessions-design.md`

## Global Constraints

- **Branch:** this work does not belong on `mobile-first-restructure`. Before Task 1, cut `timetable-sessions` from the current HEAD. Do not merge or push anything.
- **Slot schedule is frozen** (spec §3): 6 slots per day — `1: 08:00–09:30`, `2: 09:40–11:10`, `3: 11:20–12:50`, `4: 13:00–14:30`, `5: 14:40–16:10`, `6: 16:20–17:50`.
- **Days are Sunday–Thursday**, `DayIndex` 0–4, deliberately matching `Date.prototype.getDay()`. Friday (5) and Saturday (6) highlight nothing; the grid opens on Sunday.
- **Storage keys:** `presence-courses-v1`, `presence-timetable-v1`. `presence-attendance-v1` is **not** bumped — it migrates in place via the existing `backfill()`.
- **Migration (spec §5.2):** `specialities` missing → `[session.speciality]`, and the legacy `speciality` key is dropped; `courseCode` missing → `''`; `type` missing → left **absent** ("inventing one would be fabricating data").
- **Course codes are globally unique** and normalised (trimmed, uppercased). Charset `/^[A-Z0-9][A-Z0-9_-]*$/`, at most 16 characters, so a code goes straight into an export filename without further sanitising.
- **One entry per cell.** `setEntry` replaces; double-booking is structurally impossible. One cell is one course.
- **Validation is separate from mutation and nothing throws.** `validateCourse` / `validateEntry` return an error message string or `undefined`. Forms call them on change, show the message inline, and disable submit while one is present. The mutation functions do not re-validate.
- **Course and course-name snapshots:** `session.course` is the course **name** at creation time; a later rename never rewrites a past session.
- **CSV header is exactly fifteen columns in this order:** `Speciality, Course code, Course, Type, Date, Time, Room, Teacher, Student ID, Last name, First name, Email, Status, Checked at, Method`. `Speciality` is **the student's** class. BOM, formula-injection guard, doubled-quote escaping and CRLF line endings are unchanged.
- **Export filename:** `<code>-<type>-<date>.csv` (e.g. `AUT01-CR-2026-10-18.csv`); empty `courseCode` falls back to the sanitised course name, absent `type` to the literal `session`.
- **Mobile-first CSS, inherited from the previous plan and still binding:** every media query is `min-width` (the only exemptions are `prefers-reduced-motion` and `print`); no interactive control smaller than 44 × 44 px (`var(--tap)`); never hide text with `font-size: 0` — use the clip technique; no remote `@import`.
- **Badges stay dormant** behind `BADGES_ENABLED === false`. Do not re-enable them and do not touch `src/components/badges/`.
- **Scope fence (spec §12) — do not modify:** `web/`, `server/`, `scripts/`, `send.py`, `students.csv`, `generated/`, `Listes 2627/`, `src/data/students.json`, `src/components/badges/`.
- **Never `git add .claude/`** — `.claude/launch.json` is deliberately untracked. Every commit uses an explicit file list.
- **Out of scope (spec §11):** student groups/sub-groups, multiple courses per cell, semester dates / holidays / odd-even weeks, teacher accounts, auto-generated sessions for unattended weeks, room conflict checking beyond one-entry-per-cell.

## Rulings carried into this plan

The spec's export lists are a floor, not a cap. Four additions, each recorded here so a reviewer does not read them as drift:

1. **`validateCourse` takes an optional third parameter `previousCode`.** Spec §9 requires "re-saving a course under its own code is **not** a duplicate", which the two-argument signature cannot express — it cannot tell editing `AUT01` from adding a second `AUT01`. The alternative is making every caller pre-filter the list, which is the kind of thing a screen gets wrong once. Cost if wrong: one extra optional parameter.
2. **`activeRosterIds(specialities)` is exported from `sessions.ts`.** Both `createSession` and the roster-import re-snapshot in `App.tsx` need the union across a session's classes; without a shared helper the import path shrinks a combined session's roster to one class, which is a live defect.
3. **`todayDayIndex(today?)` is exported from `timetable.ts`.** Keeps the Friday/Saturday rule in one tested place instead of inline in JSX.
4. **`isoDate(date)` is added to `format.ts`** and `localToday()` is rewritten on top of it, because `dateForDayInCurrentWeek` needs the same local-date formatting.

Two UI rulings where the spec describes an outcome rather than a mechanism:

5. **A filled cell is one button opening the start-attendance sheet; *Edit cell* lives inside that sheet.** Spec §6.3 says the assign sheet is reachable via "Edit on a filled one"; it does not say the cell carries a second button. A 5-column grid cell at 768 px is ~98 px wide and cannot hold two 44 px targets beside its text, and the alternative — different affordances per width — would fork the component. Cost if wrong: clearing a cell is two taps deeper.
6. **The per-speciality filter on a combined session is a native `<select>`, not a chip row.** Spec §6.6 says "the status filter chips gain one chip per speciality", but the roster has no chips today — status filtering is a `<select>` inside `.select-wrap`. A second select of the same kind matches the screen; a chip row would be the only one on it.

Three more, surfaced while writing the later tasks:

7. **The start-attendance sheet's teacher field is editable.** Spec §8 says that for a session created from a cell "only date and time [are] user-editable", and §6.4 says the sheet *shows* a teacher defaulted from the most recent session. Read literally together, a teacher who has never created a session could never record a name, and §7's `Teacher` column would be permanently empty for every cell-created session. So the field is an editable, optional input pre-filled from the last session. Cost if wrong: one more field on a sheet that is otherwise confirm-only.
8. **`csvFilename(session)` is exported from `csv.ts`.** Spec §7 specifies the filename but names no function. Exporting the builder is what lets Task 3 test the rule — including the legacy fallback — without driving a download in jsdom.
9. **Task 4 deletes the `onScan` prop and the `ScannerModal` branch from `App.tsx`/`SessionSummary.tsx`.** This is pruning a dead call site, not re-opening the badge decision: `BADGES_ENABLED` is `false`, so the scan button never renders, and threading a dead callback through the new page boundary would have been inventing work. `src/components/badges/` is **not** touched — the scanner component stays on disk, intact, behind the flag, exactly as the scope fence requires. Cost if wrong: flipping `BADGES_ENABLED` would need the prop re-threaded, which is the same edit either way.

---

## File Structure

**New pure modules**

| File | Responsibility |
|------|----------------|
| `src/courses.ts` | The global course list: `Course` type, storage, normalisation, lookup, validation, upsert/remove. Knows nothing about the timetable. |
| `src/timetable.ts` | The one shared grid: `SessionType`, `DayIndex`, `SlotIndex`, the frozen `SLOTS`/`DAYS` constants, `TimetableEntry`, storage, cell lookup/mutation, validation, and the current-week date helper. Depends on `courses.ts` only to validate that a `courseCode` resolves. |

**New components**

| File | Responsibility |
|------|----------------|
| `src/components/Tags.tsx` | The two shared chips: `ClassTags` (one `1MAUT`-style tag per speciality) and `TypeBadge` (CR/TD/TP). Used by the grid, the courses list, the session header and the roster. |
| `src/components/AttendancePage.tsx` | The whole attendance screen, extracted from `App.tsx` so `App` can route between three pages without nesting ternaries. |
| `src/components/TimetablePage.tsx` | Day chips + the slot list / 5 × 6 grid, and the cell button. |
| `src/components/CoursesPage.tsx` | The per-speciality course list with add / edit / delete, and the delete guard that names the cells still using a course. |
| `src/components/modals/AssignCellModal.tsx` | The assign sheet: course picker, CR/TD/TP control, speciality chips, room. Save / Clear cell / Cancel. |
| `src/components/modals/StartSessionModal.tsx` | The start-attendance sheet for a filled cell, including the "a session already exists" branch and *Edit cell*. |
| `src/components/modals/CourseModal.tsx` | Add / edit one course: code, name, speciality chips, inline validation. |
| `src/styles/timetable.css` | The two shared chips, the day strip, the grid, the cell, the courses list, and the chip/segmented form controls the three new modals share. |

**Modified**

| File | Change |
|------|--------|
| `src/sessions.ts` | `specialities: Speciality[]` replaces `speciality`; `courseCode`, `type?`, `origin?` added; `SessionDetails` exported; `activeRosterIds` added; `createSession` snapshots the union; `backfill` migrates in place; `sessionForCell` added. |
| `src/csv.ts` | Fifteen columns, the student's own speciality per row, an id map built across every speciality in the session, and the new filename. |
| `src/format.ts` | `isoDate(date)` extracted; `localToday()` built on it. |
| `src/components/AppShell.tsx` | `Page` gains `'timetable'` and `'courses'`; two nav destinations; the topbar title map. |
| `src/App.tsx` | Course and timetable state, the three-way router, the cell → session flow, and the import re-snapshot fix. |
| `src/components/modals/CreateSessionModal.tsx` | Course picker + CR/TD/TP + speciality chips replace the free-text course name. |
| `src/components/SessionSummary.tsx` | Header shows `CODE · Name`, the type badge and class tags. |
| `src/components/SessionHistory.tsx` | Row title shows `CODE · Name`; the type joins the second line's text. The row's five-cell table shape at 48rem is deliberately left alone. |
| `src/components/RosterList.tsx` | Class tag per row and the speciality select, both only when the session spans more than one class. |
| `src/styles/index.css` | One `@import './timetable.css'`. |
| `src/styles/base.css` | A `.visually-hidden` utility (third occurrence of the clip technique). |
| `src/styles/modals.css` | A `.modal-error` rule for the three new sheets' inline validation. |
| `src/styles/session.css` | An `.empty-actions` rule — the empty state gains a second button when the title-row actions move. |
| `src/styles/roster.css` | One rule giving a row's class tag its own line box. |
| `src/sessions.test.ts`, `src/csv.test.ts` | Extended per spec §9. |
| `src/courses.test.ts`, `src/timetable.test.ts` | New, per spec §9. |

---

### Task 1: The course list

**Files:**
- Create: `src/courses.ts`
- Test: `src/courses.test.ts`

**Interfaces:**
- Consumes: `Speciality` from `src/roster.ts` (`'1MAUT' | '1MESE' | '4IGEI'`).
- Produces:
  - `type Course = { code: string; name: string; specialities: Speciality[] }`
  - `const COURSE_STORAGE_KEY = 'presence-courses-v1'`
  - `normalizeCode(value: string): string`
  - `loadCourses(): Course[]`
  - `saveCourses(courses: Course[]): void`
  - `findCourse(code: string, courses: Course[]): Course | undefined`
  - `coursesFor(speciality: Speciality, courses: Course[]): Course[]`
  - `validateCourse(draft: Course, courses: Course[], previousCode?: string): string | undefined`
  - `upsertCourse(course: Course, courses: Course[]): Course[]`
  - `removeCourse(code: string, courses: Course[]): Course[]`

- [ ] **Step 1: Write the failing test**

Create `src/courses.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import {
  normalizeCode, validateCourse, upsertCourse, removeCourse, coursesFor, findCourse,
  loadCourses, saveCourses, COURSE_STORAGE_KEY, type Course,
} from './courses'

function course(code: string, over: Partial<Course> = {}): Course {
  return { code, name: 'Automation', specialities: ['1MAUT'], ...over }
}

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  aut01 ')).toBe('AUT01')
  })
})

describe('validateCourse', () => {
  it('accepts a valid draft', () => {
    expect(validateCourse(course('AUT01'), [])).toBeUndefined()
  })

  it('rejects an empty code', () => {
    expect(validateCourse(course('   '), [])).toMatch(/code/i)
  })

  it('rejects a code longer than 16 characters', () => {
    expect(validateCourse(course('A'.repeat(17)), [])).toMatch(/16/)
  })

  it('rejects illegal characters in a code', () => {
    expect(validateCourse(course('AUT 01'), [])).toMatch(/letters/i)
    expect(validateCourse(course('-AUT01'), [])).toMatch(/letters/i)
  })

  it('rejects an empty name', () => {
    expect(validateCourse(course('AUT01', { name: '  ' }), [])).toMatch(/name/i)
  })

  it('rejects an empty speciality list', () => {
    expect(validateCourse(course('AUT01', { specialities: [] }), [])).toMatch(/class/i)
  })

  it('rejects a duplicate code, comparing normalised', () => {
    expect(validateCourse(course('aut01'), [course('AUT01')])).toMatch(/already/i)
  })

  // Editing a course and saving it under its own code is not a clash with
  // itself — the screen passes the code it is replacing.
  it('allows re-saving a course under its own code', () => {
    expect(validateCourse(course('AUT01', { name: 'Renamed' }), [course('AUT01')], 'AUT01')).toBeUndefined()
  })

  it('still rejects renaming onto another course code', () => {
    expect(validateCourse(course('ESE01'), [course('AUT01'), course('ESE01')], 'AUT01')).toMatch(/already/i)
  })
})

describe('upsertCourse', () => {
  it('appends a course that is not in the list', () => {
    expect(upsertCourse(course('ESE01'), [course('AUT01')]).map(item => item.code)).toEqual(['AUT01', 'ESE01'])
  })

  it('replaces in place when the normalised code matches', () => {
    const result = upsertCourse(course('aut01', { name: 'Renamed' }), [course('AUT01'), course('ESE01')])
    expect(result.map(item => item.code)).toEqual(['AUT01', 'ESE01'])
    expect(result[0].name).toBe('Renamed')
  })

  it('stores the code normalised and the name trimmed', () => {
    const [stored] = upsertCourse(course(' aut01 ', { name: ' Automation ' }), [])
    expect(stored).toMatchObject({ code: 'AUT01', name: 'Automation' })
  })
})

describe('coursesFor', () => {
  it('filters by speciality', () => {
    const all = [
      course('AUT01'),
      course('SHARED', { specialities: ['1MAUT', '1MESE', '4IGEI'] }),
      course('ESE01', { specialities: ['1MESE'] }),
    ]
    expect(coursesFor('1MESE', all).map(item => item.code)).toEqual(['SHARED', 'ESE01'])
  })
})

describe('findCourse', () => {
  it('looks up by normalised code', () => {
    expect(findCourse(' aut01 ', [course('AUT01')])?.name).toBe('Automation')
  })

  it('returns undefined for an unknown code', () => {
    expect(findCourse('NOPE', [course('AUT01')])).toBeUndefined()
  })
})

describe('removeCourse', () => {
  it('removes by normalised code', () => {
    expect(removeCourse('aut01', [course('AUT01'), course('ESE01')]).map(item => item.code)).toEqual(['ESE01'])
  })
})

describe('loadCourses', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(loadCourses()).toEqual([])
  })

  it('returns an empty list for malformed JSON', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, '{not json')
    expect(loadCourses()).toEqual([])
  })

  it('returns an empty list for a stored non-array', () => {
    localStorage.setItem(COURSE_STORAGE_KEY, '{"code":"AUT01"}')
    expect(loadCourses()).toEqual([])
  })

  it('round-trips through storage', () => {
    saveCourses([course('AUT01')])
    expect(loadCourses()).toEqual([course('AUT01')])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/courses.test.ts`
Expected: FAIL — `Failed to resolve import "./courses"`.

- [ ] **Step 3: Write the implementation**

Create `src/courses.ts`:

```ts
import type { Speciality } from './roster'

export type Course = {
  /** Normalised: trimmed and uppercased. Globally unique across the list. */
  code: string
  name: string
  /** The classes this course is taught to. At least one. */
  specialities: Speciality[]
}

export const COURSE_STORAGE_KEY = 'presence-courses-v1'

/** Restricted so a code can go straight into an export filename, unsanitised. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/
const CODE_MAX = 16

export function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

export function loadCourses(): Course[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCourses(courses: Course[]) {
  localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(courses))
}

export function findCourse(code: string, courses: Course[]): Course | undefined {
  const wanted = normalizeCode(code)
  return courses.find(course => normalizeCode(course.code) === wanted)
}

export function coursesFor(speciality: Speciality, courses: Course[]): Course[] {
  return courses.filter(course => course.specialities.includes(speciality))
}

/**
 * Returns an error message, or undefined when the draft is valid. Deliberately
 * separate from mutation and never throws: the forms call this on every change
 * and render the message inline.
 *
 * `previousCode` is the code the draft replaces when editing, so re-saving a
 * course under its own code is not read as a clash with itself.
 */
export function validateCourse(draft: Course, courses: Course[], previousCode?: string): string | undefined {
  const code = normalizeCode(draft.code)
  if (!code) return 'A course code is required.'
  if (code.length > CODE_MAX) return `A course code is at most ${CODE_MAX} characters.`
  if (!CODE_PATTERN.test(code)) return 'A course code uses letters, digits, - and _, and starts with a letter or a digit.'
  if (!draft.name.trim()) return 'A course name is required.'
  if (draft.specialities.length === 0) return 'Choose at least one class.'
  const clash = findCourse(code, courses)
  if (clash && normalizeCode(clash.code) !== normalizeCode(previousCode || '')) {
    return `${code} is already used by another course.`
  }
  return undefined
}

/** Appends, or replaces in place when the normalised code already exists. */
export function upsertCourse(course: Course, courses: Course[]): Course[] {
  const stored: Course = { ...course, code: normalizeCode(course.code), name: course.name.trim() }
  const index = courses.findIndex(item => normalizeCode(item.code) === stored.code)
  if (index === -1) return [...courses, stored]
  return courses.map((item, position) => position === index ? stored : item)
}

/**
 * No reference check here — whether a course is still used by a timetable cell
 * is the Courses screen's guard (spec §6.5), composed from `cellsUsingCourse`.
 */
export function removeCourse(code: string, courses: Course[]): Course[] {
  const wanted = normalizeCode(code)
  return courses.filter(course => normalizeCode(course.code) !== wanted)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/courses.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Verify the whole suite and the build are still green**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/courses.ts src/courses.test.ts
git commit -m "feat: add the global course list with codes and validation"
```

---

### Task 2: The timetable module

**Files:**
- Create: `src/timetable.ts`
- Test: `src/timetable.test.ts`
- Modify: `src/format.ts`

**Interfaces:**
- Consumes: `findCourse(code, courses)` and `type Course` from `src/courses.ts`; `Speciality` from `src/roster.ts`.
- Produces:
  - `type SessionType = 'CR' | 'TD' | 'TP'`
  - `type DayIndex = 0 | 1 | 2 | 3 | 4`, `type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6`
  - `type Slot = { index: SlotIndex; start: string; end: string }`
  - `type TimetableEntry = { day: DayIndex; slot: SlotIndex; courseCode: string; type: SessionType; specialities: Speciality[]; room: string }`
  - `const SESSION_TYPES: { id: SessionType; label: string }[]`
  - `const DAYS: { index: DayIndex; label: string; short: string }[]`
  - `const SLOTS: Slot[]`
  - `const TIMETABLE_STORAGE_KEY = 'presence-timetable-v1'`
  - `loadTimetable(): TimetableEntry[]`, `saveTimetable(entries): void`
  - `entryAt(day, slot, entries): TimetableEntry | undefined`
  - `entriesForDay(day, entries): TimetableEntry[]`
  - `cellsUsingCourse(code: string, entries): TimetableEntry[]`
  - `setEntry(entry, entries): TimetableEntry[]`, `clearEntry(day, slot, entries): TimetableEntry[]`
  - `validateEntry(draft: TimetableEntry, courses: Course[]): string | undefined`
  - `dateForDayInCurrentWeek(day: DayIndex, today?: Date): string`
  - `todayDayIndex(today?: Date): DayIndex | undefined`
  - From `src/format.ts`: `isoDate(value: Date): string`

- [ ] **Step 1: Write the failing test**

Create `src/timetable.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest'
import type { Course } from './courses'
import {
  SLOTS, DAYS, SESSION_TYPES, TIMETABLE_STORAGE_KEY,
  loadTimetable, saveTimetable, entryAt, entriesForDay, cellsUsingCourse,
  setEntry, clearEntry, validateEntry, dateForDayInCurrentWeek, todayDayIndex,
  type TimetableEntry,
} from './timetable'

const courses: Course[] = [{ code: 'AUT01', name: 'Automation', specialities: ['1MAUT'] }]

function entry(over: Partial<TimetableEntry> = {}): TimetableEntry {
  return { day: 0, slot: 1, courseCode: 'AUT01', type: 'CR', specialities: ['1MAUT'], room: 'A12', ...over }
}

describe('the frozen schedule', () => {
  it('has exactly six slots with the specified times', () => {
    expect(SLOTS).toEqual([
      { index: 1, start: '08:00', end: '09:30' },
      { index: 2, start: '09:40', end: '11:10' },
      { index: 3, start: '11:20', end: '12:50' },
      { index: 4, start: '13:00', end: '14:30' },
      { index: 5, start: '14:40', end: '16:10' },
      { index: 6, start: '16:20', end: '17:50' },
    ])
  })

  it('covers Sunday to Thursday with getDay()-compatible indices', () => {
    expect(DAYS.map(day => day.index)).toEqual([0, 1, 2, 3, 4])
    expect(DAYS[0].label).toBe('Sunday')
    expect(DAYS[4].label).toBe('Thursday')
  })

  it('offers the three session types', () => {
    expect(SESSION_TYPES.map(type => type.id)).toEqual(['CR', 'TD', 'TP'])
  })
})

describe('cell mutation', () => {
  it('replaces rather than appends when the cell is occupied', () => {
    const result = setEntry(entry({ courseCode: 'ESE01' }), [entry(), entry({ slot: 2 })])
    expect(result).toHaveLength(2)
    expect(entryAt(0, 1, result)?.courseCode).toBe('ESE01')
    expect(entryAt(0, 2, result)?.courseCode).toBe('AUT01')
  })

  it('appends when the cell is empty', () => {
    expect(setEntry(entry({ day: 3 }), [entry()])).toHaveLength(2)
  })

  it('clears only the targeted cell', () => {
    const result = clearEntry(0, 1, [entry(), entry({ slot: 2 }), entry({ day: 1 })])
    expect(entryAt(0, 1, result)).toBeUndefined()
    expect(result).toHaveLength(2)
  })

  it('returns undefined from entryAt for an empty cell', () => {
    expect(entryAt(4, 6, [entry()])).toBeUndefined()
  })
})

describe('entriesForDay', () => {
  it('returns that day ordered by slot', () => {
    const all = [entry({ slot: 5 }), entry({ day: 1, slot: 1 }), entry({ slot: 2 })]
    expect(entriesForDay(0, all).map(item => item.slot)).toEqual([2, 5])
  })
})

describe('cellsUsingCourse', () => {
  it('finds every referencing cell, comparing normalised codes', () => {
    const all = [entry(), entry({ slot: 4, courseCode: 'aut01' }), entry({ day: 2, courseCode: 'ESE01' })]
    expect(cellsUsingCourse('AUT01', all).map(item => item.slot)).toEqual([1, 4])
  })

  it('returns an empty list for an unused course', () => {
    expect(cellsUsingCourse('NOPE', [entry()])).toEqual([])
  })
})

describe('validateEntry', () => {
  it('accepts a valid draft', () => {
    expect(validateEntry(entry(), courses)).toBeUndefined()
  })

  it('rejects an out-of-range day', () => {
    expect(validateEntry(entry({ day: 5 as TimetableEntry['day'] }), courses)).toMatch(/day/i)
  })

  it('rejects an out-of-range slot', () => {
    expect(validateEntry(entry({ slot: 7 as TimetableEntry['slot'] }), courses)).toMatch(/slot/i)
  })

  it('rejects an unknown course code', () => {
    expect(validateEntry(entry({ courseCode: 'NOPE' }), courses)).toMatch(/course/i)
  })

  it('rejects an invalid type', () => {
    expect(validateEntry(entry({ type: 'XX' as TimetableEntry['type'] }), courses)).toMatch(/type/i)
  })

  it('rejects an empty speciality list', () => {
    expect(validateEntry(entry({ specialities: [] }), courses)).toMatch(/class/i)
  })
})

describe('dateForDayInCurrentWeek', () => {
  // 2026-10-18 is a Sunday, so that week runs 18 - 22 October.
  it('returns the day itself when today is that Sunday', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 18))).toBe('2026-10-18')
    expect(dateForDayInCurrentWeek(4, new Date(2026, 9, 18))).toBe('2026-10-22')
  })

  it('works back to Sunday from a mid-week day', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 21))).toBe('2026-10-18')
    expect(dateForDayInCurrentWeek(3, new Date(2026, 9, 21))).toBe('2026-10-21')
  })

  it('treats Saturday as the end of the week that just ran', () => {
    expect(dateForDayInCurrentWeek(0, new Date(2026, 9, 24))).toBe('2026-10-18')
  })

  it('crosses a month boundary', () => {
    // Tuesday 1 December 2026; its week started Sunday 29 November.
    expect(dateForDayInCurrentWeek(0, new Date(2026, 11, 1))).toBe('2026-11-29')
    expect(dateForDayInCurrentWeek(4, new Date(2026, 11, 1))).toBe('2026-12-03')
  })
})

describe('todayDayIndex', () => {
  it('returns the index on a day the grid shows', () => {
    expect(todayDayIndex(new Date(2026, 9, 21))).toBe(3)
  })

  it('returns undefined on Friday and Saturday', () => {
    expect(todayDayIndex(new Date(2026, 9, 23))).toBeUndefined()
    expect(todayDayIndex(new Date(2026, 9, 24))).toBeUndefined()
  })
})

describe('loadTimetable', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(loadTimetable()).toEqual([])
  })

  it('returns an empty list for malformed JSON', () => {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, 'not json at all')
    expect(loadTimetable()).toEqual([])
  })

  it('returns an empty list for a stored non-array', () => {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, '{"day":0}')
    expect(loadTimetable()).toEqual([])
  })

  it('round-trips through storage', () => {
    saveTimetable([entry()])
    expect(loadTimetable()).toEqual([entry()])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/timetable.test.ts`
Expected: FAIL — `Failed to resolve import "./timetable"`.

- [ ] **Step 3: Extract the date formatter**

Replace the body of `src/format.ts` with:

```ts
// Date helpers shared by the shell and the session views. They lived inside
// App.tsx until the component split gave them more than one consumer.

export function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

/**
 * A Date as `YYYY-MM-DD` in the browser's own timezone. `toISOString` is wrong
 * here: it converts to UTC first, which shifts the date either side of midnight.
 */
export function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function localToday() {
  return isoDate(new Date())
}
```

- [ ] **Step 4: Write the timetable module**

Create `src/timetable.ts`:

```ts
import { findCourse, normalizeCode, type Course } from './courses'
import { isoDate } from './format'
import type { Speciality } from './roster'

/** Cours (lecture), Travaux dirigés (guided work), Travaux pratiques (practical). */
export type SessionType = 'CR' | 'TD' | 'TP'

/**
 * Sunday to Thursday — the teaching week. The indices deliberately match
 * `Date.prototype.getDay()` so no mapping is needed anywhere.
 */
export type DayIndex = 0 | 1 | 2 | 3 | 4
export type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6

export type Slot = { index: SlotIndex; start: string; end: string }

export type TimetableEntry = {
  day: DayIndex
  slot: SlotIndex
  courseCode: string
  type: SessionType
  /** One or more — a lecture shared by several classes is one entry, not three. */
  specialities: Speciality[]
  /** May be empty. */
  room: string
}

export const SESSION_TYPES: { id: SessionType; label: string }[] = [
  { id: 'CR', label: 'Lecture' },
  { id: 'TD', label: 'Guided work' },
  { id: 'TP', label: 'Practical' },
]

export const DAYS: { index: DayIndex; label: string; short: string }[] = [
  { index: 0, label: 'Sunday', short: 'Sun' },
  { index: 1, label: 'Monday', short: 'Mon' },
  { index: 2, label: 'Tuesday', short: 'Tue' },
  { index: 3, label: 'Wednesday', short: 'Wed' },
  { index: 4, label: 'Thursday', short: 'Thu' },
]

/** Frozen: 1 h 30 of teaching with 10 minutes between, 08:00 to 17:50. */
export const SLOTS: Slot[] = [
  { index: 1, start: '08:00', end: '09:30' },
  { index: 2, start: '09:40', end: '11:10' },
  { index: 3, start: '11:20', end: '12:50' },
  { index: 4, start: '13:00', end: '14:30' },
  { index: 5, start: '14:40', end: '16:10' },
  { index: 6, start: '16:20', end: '17:50' },
]

export const TIMETABLE_STORAGE_KEY = 'presence-timetable-v1'

export function loadTimetable(): TimetableEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTimetable(entries: TimetableEntry[]) {
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(entries))
}

export function entryAt(day: DayIndex, slot: SlotIndex, entries: TimetableEntry[]): TimetableEntry | undefined {
  return entries.find(entry => entry.day === day && entry.slot === slot)
}

export function entriesForDay(day: DayIndex, entries: TimetableEntry[]): TimetableEntry[] {
  return entries.filter(entry => entry.day === day).sort((a, b) => a.slot - b.slot)
}

export function cellsUsingCourse(code: string, entries: TimetableEntry[]): TimetableEntry[] {
  const wanted = normalizeCode(code)
  return entries.filter(entry => normalizeCode(entry.courseCode) === wanted)
}

/**
 * One entry per cell: this replaces whatever was there, which is what makes
 * double-booking structurally impossible rather than merely validated against.
 */
export function setEntry(entry: TimetableEntry, entries: TimetableEntry[]): TimetableEntry[] {
  return [...entries.filter(item => !(item.day === entry.day && item.slot === entry.slot)), entry]
}

export function clearEntry(day: DayIndex, slot: SlotIndex, entries: TimetableEntry[]): TimetableEntry[] {
  return entries.filter(entry => !(entry.day === day && entry.slot === slot))
}

/** Returns an error message, or undefined when the draft is valid. Never throws. */
export function validateEntry(draft: TimetableEntry, courses: Course[]): string | undefined {
  if (!DAYS.some(day => day.index === draft.day)) return 'Choose a day between Sunday and Thursday.'
  if (!SLOTS.some(slot => slot.index === draft.slot)) return 'Choose a slot between 1 and 6.'
  if (!findCourse(draft.courseCode, courses)) return 'Choose a course from the list.'
  // Names the field, like the five messages above it — and the test asserts /type/i.
  if (!SESSION_TYPES.some(type => type.id === draft.type)) return 'Choose a session type: CR, TD or TP.'
  if (draft.specialities.length === 0) return 'Choose at least one class.'
  return undefined
}

/**
 * The date this day falls on in the week containing `today`, as `YYYY-MM-DD`.
 * Weeks start on Sunday, matching `getDay()`, so a Friday or Saturday still
 * resolves back into the teaching week that just ran.
 */
export function dateForDayInCurrentWeek(day: DayIndex, today = new Date()): string {
  // Date's constructor normalises out-of-range days, so this crosses month and
  // year boundaries without any arithmetic of our own.
  return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + day))
}

/** Today's column, or undefined on Friday and Saturday, which the grid omits. */
export function todayDayIndex(today = new Date()): DayIndex | undefined {
  const day = today.getDay()
  return day <= 4 ? day as DayIndex : undefined
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/timetable.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 6: Verify the whole suite and the build**

Run: `npm test && npm run build`
Expected: all tests pass (`format.ts` has no direct test, but `csv.test.ts` and the session suite exercise `localToday` indirectly); `tsc` reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/timetable.ts src/timetable.test.ts src/format.ts
git commit -m "feat: add the weekly timetable module with the frozen slot schedule"
```

---

### Task 3: Multi-speciality sessions, course identity, and the CSV export

This is the one task that changes a stored shape, so it carries the migration and
the export together: spec §7's every change follows from spec §4.3's, and a
reviewer judging the model needs the export to see it land.

**Files:**
- Modify: `src/sessions.ts`
- Modify: `src/csv.ts`
- Modify: `src/App.tsx` (the four `session.speciality` filters, the roster memo, the import re-snapshot, the `SessionDetails` import)
- Modify: `src/components/modals/CreateSessionModal.tsx` (emit the new fields; the course picker itself is Task 8)
- Test: `src/sessions.test.ts`, `src/csv.test.ts`

**Interfaces:**
- Consumes: `DayIndex`, `SlotIndex`, `SessionType` from `src/timetable.ts`; `specialities` (the canonical class list), `getActiveRoster`, `getRoster`, `Student` from `src/roster.ts`.
- Produces:
  - `type AttendanceSession` with `specialities: Speciality[]`, `courseCode: string`, `course: string` (the **name** snapshot), `type?: SessionType`, `origin?: { day: DayIndex; slot: SlotIndex }`, and the unchanged `id`/`date`/`time`/`room`/`teacher`/`state`/`createdAt`/`closedAt?`/`rosterIds`/`entries`.
  - `type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>` — **now exported from `sessions.ts`**, not from the modal.
  - `activeRosterIds(list: Speciality[]): string[]`
  - `sessionForCell(day: DayIndex, slot: SlotIndex, date: string, sessions: AttendanceSession[]): AttendanceSession | undefined`
  - `buildSessionCsv(session)` / `exportSessionCsv(session)` unchanged in signature.

- [ ] **Step 1: Write the failing tests**

In `src/sessions.test.ts`, replace the `details` constant and append four tests. The
new constant (every existing test reuses it):

```ts
const details = {
  specialities: ['1MAUT' as const],
  courseCode: 'AUT01', course: 'Automation', type: 'CR' as const,
  date: '2026-10-16', time: '09:00', room: 'Lab 04', teacher: 'T',
}
```

Also widen the `student` helper so it can build other classes:

```ts
function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'L' + id, firstName: 'F', speciality: '1MAUT', active: true, ...over }
}
```

(unchanged — it already takes an override). Then append inside the existing
`describe('session snapshot')` block:

```ts
  it('snapshots the union of every speciality in canonical order', () => {
    saveRoster('1MAUT', [student('M2'), student('M1')])
    saveRoster('1MESE', [student('E1', { speciality: '1MESE' })])
    saveRoster('4IGEI', [student('G1', { speciality: '4IGEI' }), student('G2', { speciality: '4IGEI', active: false })])

    const session = createSession({ ...details, specialities: ['4IGEI', '1MAUT', '1MESE'] })

    // Canonical order is the order of `specialities` in roster.ts, not the order
    // the chips were ticked, so the same three classes always snapshot alike.
    expect(session.rosterIds).toEqual(['M2', 'M1', 'E1', 'G1'])
  })

  it('counts present, absent and unchecked across a combined roster', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('1MESE', [student('E1', { speciality: '1MESE' })])
    const session = createSession({ ...details, specialities: ['1MAUT', '1MESE'] })
    session.entries['E1'] = { status: 'present', at: 'now', method: 'manual' }
    expect(sessionStats(session)).toEqual({ total: 2, present: 1, absent: 0, unchecked: 1 })
  })

  it('migrates a legacy single-speciality session in place', () => {
    saveRoster('1MAUT', [student('A1')])
    const legacy = {
      id: 'old', speciality: '1MAUT', course: 'Old course', date: '2026-01-01', time: '08:00',
      room: '', teacher: '', state: 'closed', createdAt: '2026-01-01T08:00:00.000Z',
      rosterIds: ['A1'], entries: {},
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([legacy]))

    const [loaded] = loadSessions()
    expect(loaded.specialities).toEqual(['1MAUT'])
    expect(loaded.courseCode).toBe('')
    // Absent, not guessed: a session recorded before types existed has no type,
    // and inventing one would be fabricating data.
    expect(loaded.type).toBeUndefined()
    expect('speciality' in loaded).toBe(false)
  })

  it('finds the session already created for a cell and date, ignoring ad-hoc ones', () => {
    saveRoster('1MAUT', [student('A1')])
    const fromCell = createSession({ ...details, origin: { day: 0, slot: 1 } })
    const adHoc = createSession(details)
    const otherDate = createSession({ ...details, origin: { day: 0, slot: 1 }, date: '2026-10-23' })
    const all = [fromCell, adHoc, otherDate]

    expect(sessionForCell(0, 1, '2026-10-16', all)?.id).toBe(fromCell.id)
    expect(sessionForCell(0, 2, '2026-10-16', all)).toBeUndefined()
    expect(sessionForCell(0, 1, '2026-10-30', all)).toBeUndefined()
  })

  it('lists active ids across classes in canonical order', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('1MESE', [student('E1', { speciality: '1MESE' })])
    expect(activeRosterIds(['1MESE', '1MAUT'])).toEqual(['M1', 'E1'])
  })
```

Extend the import at the top of the file:

```ts
import {
  createSession, closeSession, reopenSession, sessionStats, activeRosterIds, sessionForCell,
  loadSessions, saveSessions, SESSION_STORAGE_KEY,
} from './sessions'
```

In `src/csv.test.ts`, replace the `details` constant with the same new one, then
replace the header assertion and append three tests:

```ts
  it('writes a BOM and the fifteen-column header', () => {
    saveRoster('1MAUT', [student('A1')])
    const csv = buildSessionCsv(createSession(details))
    expect(csv.startsWith('﻿')).toBe(true)
    // The BOM has to be the first character of the file, so it sits in front of
    // the header line — slice it off before comparing the header itself.
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      '"Speciality","Course code","Course","Type","Date","Time","Room","Teacher",'
      + '"Student ID","Last name","First name","Email","Status","Checked at","Method"'
    )
  })

  it('carries each student own class, not the session list', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('4IGEI', [student('G1', { speciality: '4IGEI' })])
    const csv = buildSessionCsv(createSession({ ...details, specialities: ['1MAUT', '4IGEI'] }))
    const [, mautRow, igeiRow] = csv.slice(1).split('\r\n')
    expect(mautRow.startsWith('"1MAUT","AUT01","Automation","CR"')).toBe(true)
    expect(igeiRow.startsWith('"4IGEI","AUT01","Automation","CR"')).toBe(true)
  })

  it('resolves every student of a three-speciality session', () => {
    saveRoster('1MAUT', [student('M1')])
    saveRoster('1MESE', [student('E1', { speciality: '1MESE' })])
    saveRoster('4IGEI', [student('G1', { speciality: '4IGEI' })])
    const csv = buildSessionCsv(createSession({ ...details, specialities: ['1MAUT', '1MESE', '4IGEI'] }))
    expect(csv.trim().split('\r\n')).toHaveLength(4)
    expect(csv).toContain('"LM1"')
    expect(csv).toContain('"LE1"')
    expect(csv).toContain('"LG1"')
  })

  it('exports an empty Type cell for a legacy session', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    const csv = buildSessionCsv({ ...session, courseCode: '', type: undefined })
    expect(csv.slice(1).split('\r\n')[1].startsWith('"1MAUT","","Automation",""')).toBe(true)
  })
```

And a filename test, which needs the builder exposed — add `csvFilename` to the
import and to `csv.ts`'s exports:

```ts
  it('names the file from the code, type and date', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    expect(csvFilename(session)).toBe('AUT01-CR-2026-10-16.csv')
  })

  it('falls back to the sanitised course name and the literal session', () => {
    saveRoster('1MAUT', [student('A1')])
    const session = createSession(details)
    expect(csvFilename({ ...session, courseCode: '', type: undefined, course: 'Commande numérique' }))
      .toBe('commande-num-rique-session-2026-10-16.csv')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/sessions.test.ts src/csv.test.ts`
Expected: FAIL — `activeRosterIds`, `sessionForCell` and `csvFilename` are not exported, and the header assertion mismatches.

- [ ] **Step 3: Change the session model**

In `src/sessions.ts`, replace the imports, the `AttendanceSession` type, the
private `SessionDetails`, `createSession` and `backfill`, and append
`sessionForCell`. The unchanged functions (`closeSession`, `reopenSession`,
`sessionStats`, `loadSessions`, `saveSessions`) keep their current bodies.

```ts
import { getActiveRoster, specialities as allSpecialities, type Speciality } from './roster'
import type { DayIndex, SessionType, SlotIndex } from './timetable'

export type AttendanceEntry = {
  status: 'present' | 'absent'
  at: string
  // 'scan' is retained for entries recorded before badges were retired.
  method: 'scan' | 'manual' | 'session-close'
}

export type AttendanceSession = {
  id: string
  /**
   * One or more. A lecture shared by several classes is a single session with a
   * combined roster, so its present/absent counts describe the room that sat it.
   */
  specialities: Speciality[]
  /** '' for sessions created before courses had codes. */
  courseCode: string
  /** The course NAME, snapshotted: renaming a course never rewrites history. */
  course: string
  /** Absent on a legacy session — inventing one would be fabricating data. */
  type?: SessionType
  /** The timetable cell this came from. Absent means ad-hoc. */
  origin?: { day: DayIndex; slot: SlotIndex }
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

/** Everything a form supplies; the rest of a session is derived on create. */
export type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

/**
 * Active student ids across these classes, deduplicated, in the canonical
 * speciality order of roster.ts — not the order the teacher ticked the chips,
 * so the same set of classes always produces the same snapshot.
 */
export function activeRosterIds(list: Speciality[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of allSpecialities) {
    if (!list.includes(item.id)) continue
    for (const student of getActiveRoster(item.id)) {
      if (seen.has(student.id)) continue
      seen.add(student.id)
      ids.push(student.id)
    }
  }
  return ids
}

export function createSession(details: SessionDetails): AttendanceSession {
  return {
    ...details,
    id: crypto.randomUUID(),
    state: 'open',
    createdAt: new Date().toISOString(),
    rosterIds: activeRosterIds(details.specialities),
    entries: {},
  }
}
```

Replace `backfill` with the in-place migration:

```ts
/** The shape on disk may predate `specialities`, `courseCode` or `rosterIds`. */
type StoredSession = AttendanceSession & { speciality?: Speciality }

/**
 * Migrates a stored session forward without bumping the storage key:
 * `speciality` becomes a one-element `specialities`, `courseCode` defaults to
 * empty, and `type` is left absent rather than guessed. Sessions written before
 * `rosterIds` existed are reconstructed from the union of whoever has an entry
 * and whoever is currently active — the closest honest reconstruction available.
 */
function backfill(session: StoredSession): AttendanceSession {
  const list = Array.isArray(session.specialities)
    ? session.specialities
    : session.speciality ? [session.speciality] : []

  let rosterIds = session.rosterIds
  if (!Array.isArray(rosterIds)) {
    const ids = new Set(Object.keys(session.entries || {}))
    for (const id of activeRosterIds(list)) ids.add(id)
    rosterIds = [...ids]
  }

  const migrated: StoredSession = { ...session, specialities: list, courseCode: session.courseCode || '', rosterIds }
  delete migrated.speciality
  return migrated
}
```

Append `sessionForCell`:

```ts
/**
 * The session already created for a timetable cell on a given date, if any.
 * This is what makes tapping a cell idempotent: a mis-tap on a phone opens the
 * session that exists rather than creating a second one for the same hour.
 * Ad-hoc sessions have no `origin`, so they never match.
 */
export function sessionForCell(day: DayIndex, slot: SlotIndex, date: string, sessions: AttendanceSession[]) {
  return sessions.find(session =>
    session.origin?.day === day && session.origin?.slot === slot && session.date === date)
}
```

- [ ] **Step 4: Rewrite the CSV export**

Replace `src/csv.ts` entirely:

```ts
import { getRoster, specialities as allSpecialities, type Student } from './roster'
import type { AttendanceSession } from './sessions'

function csvCell(value: string) {
  // Leading =, +, @ or - make spreadsheets treat the cell as a formula.
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const HEADER = [
  'Speciality', 'Course code', 'Course', 'Type', 'Date', 'Time', 'Room', 'Teacher',
  'Student ID', 'Last name', 'First name', 'Email', 'Status', 'Checked at', 'Method',
]

/**
 * Every student in the session, from any of its classes. Built across the whole
 * speciality list so a shared lecture resolves all of its rows — and so each row
 * can carry the student's own class, which is the entire value of a combined
 * export.
 */
function studentsInSession(session: AttendanceSession) {
  const byId = new Map<string, Student>()
  for (const item of allSpecialities) {
    if (!session.specialities.includes(item.id)) continue
    for (const student of getRoster(item.id)) if (!byId.has(student.id)) byId.set(student.id, student)
  }
  return byId
}

export function buildSessionCsv(session: AttendanceSession): string {
  const byId = studentsInSession(session)
  const rows = session.rosterIds.map(id => {
    const student = byId.get(id)
    const entry = session.entries[id]
    return [
      // The student's class, not the session's. A student who has vanished from
      // every roster leaves this blank unless the session had only one class, in
      // which case it is the one thing we still know for certain.
      student?.speciality || (session.specialities.length === 1 ? session.specialities[0] : ''),
      session.courseCode,
      session.course,
      session.type || '',
      session.date, session.time, session.room, session.teacher,
      id,
      student?.lastName || '',
      student?.firstName || '',
      student?.email || '',
      entry?.status || 'unchecked',
      entry?.at || '',
      entry?.method || '',
    ]
  })
  // Excel needs the BOM to read UTF-8; it must be the first character of the file.
  return '﻿' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * `<code>-<type>-<date>.csv`. A legacy session has neither a code nor a type, so
 * it falls back to its sanitised course name and the literal `session` — still a
 * usable filename rather than a row of dashes.
 */
export function csvFilename(session: AttendanceSession) {
  // The code charset of spec §8 is already filename-safe; a course name is not.
  const name = session.courseCode.trim()
    || session.course.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')
    || 'session'
  return `${name}-${session.type || 'session'}-${session.date}.csv`
}

export function exportSessionCsv(session: AttendanceSession) {
  const url = URL.createObjectURL(new Blob([buildSessionCsv(session)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = csvFilename(session)
  link.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 5: Update the consumers so the build is green**

In `src/components/modals/CreateSessionModal.tsx`: delete the local
`SessionDetails` type, import it from `../../sessions`, and emit the new fields.
The course picker itself is Task 8; this step only keeps the modal compiling and
honest — a session created here is ad-hoc, so it carries no code, no type and no
origin.

```ts
import type { SessionDetails } from '../../sessions'
```

```ts
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!course.trim() || !date || !time) return
    onCreate({
      specialities: [speciality],
      courseCode: '',
      course: course.trim(),
      date, time, room: room.trim(), teacher: teacher.trim(),
    })
  }
```

In `src/App.tsx`, four filters change from equality to membership, the roster memo
widens to the session's classes, and the import re-snapshot is fixed:

```ts
import { CreateSessionModal } from './components/modals/CreateSessionModal'
import {
  activeRosterIds, closeSession, createSession, loadSessions, reopenSession, saveSessions, sessionStats,
  type AttendanceSession, type SessionDetails,
} from './sessions'
```

```ts
    setSelectedId(sessions.filter(item => item.specialities.includes(speciality)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id || null)
```

```ts
  const classSessions = useMemo(() => sessions.filter(item => item.specialities.includes(speciality))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sessions, speciality])
```

```ts
  const sessionRoster = useMemo(() => {
    if (!selectedSession) return []
    // Across every class in the session, not just the one being viewed: a shared
    // lecture must render its whole roster or the rows would disagree with the
    // stat totals and the export.
    const byId = new Map<string, Student>()
    for (const item of specialities) {
      if (!selectedSession.specialities.includes(item.id)) continue
      for (const student of getRoster(item.id)) if (!byId.has(student.id)) byId.set(student.id, student)
    }
    return selectedSession.rosterIds
      .map(id => byId.get(id))
      .filter((student): student is Student => Boolean(student))
    // rosterVersion is the signal that localStorage changed under us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, rosterVersion])
```

```ts
      const latest = sessions.filter(session => session.specialities.includes(item.id))
```

```ts
  function handleImport(students: Student[]) {
    saveRoster(speciality, students)
    // Open sessions are still being taken, so they follow the new class list.
    // Closed ones are a record of who was expected that day and never move.
    // Each one re-snapshots across *its own* classes: using only the imported
    // speciality's ids would silently shrink a shared lecture to one class.
    setSessions(current => current.map(item => item.specialities.includes(speciality) && item.state === 'open'
      ? { ...item, rosterIds: activeRosterIds(item.specialities) }
      : item))
    setRosterVersion(version => version + 1)
    setImportOpen(false)
    setToast(`${speciality} roster updated — ${students.filter(student => student.active).length} active students.`)
  }
```

`storedRoster` is still needed by `ImportRosterModal` and `classStudents`; leave
both as they are.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The session suite gains 5 tests and the CSV suite 5; the existing
tests pass unchanged because the shared `details` constant carries the new fields.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: `tsc` reports no errors. If it reports `Property 'speciality' does not
exist`, a consumer was missed — `grep -rn "\.speciality\b" src --include=*.tsx
--include=*.ts` and check each hit: `student.speciality` is correct and stays,
`session.speciality` is not.

- [ ] **Step 8: Commit**

```bash
git add src/sessions.ts src/sessions.test.ts src/csv.ts src/csv.test.ts src/App.tsx src/components/modals/CreateSessionModal.tsx
git commit -m "feat: sessions span several classes and carry a course code and type"
```

---

### Task 4: Extract the attendance screen so App can route

A pure refactor with no behaviour change. It exists because `App.tsx` is about to
gain two more screens, and nesting them into the existing `showBadges` ternary
would leave the render unreadable by Task 9.

**Files:**
- Create: `src/components/AttendancePage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/SessionSummary.tsx` (drop the dead `onScan` prop)
- Modify: `src/styles/session.css` (add `.empty-actions`)

**Interfaces:**
- Consumes: everything already in `App.tsx`.
- Produces: `AttendancePage` with this exact prop list, which Tasks 7 and 9 extend:

```ts
export function AttendancePage({
  speciality, sessions, selectedId, rosterVersion, onSelect, onCreateOpen, onImportOpen, onReplace, onToast,
}: {
  speciality: Speciality
  /** This class's sessions, newest first. */
  sessions: AttendanceSession[]
  selectedId: string | null
  /**
   * Bumped by App whenever the roster in localStorage changes. It is the only
   * signal this component gets: a closed session's object identity never
   * changes on import, so without it the roster memo would keep serving the
   * names from before the import.
   */
  rosterVersion: number
  onSelect: (id: string | null) => void
  onCreateOpen: () => void
  onImportOpen: () => void
  onReplace: (updated: AttendanceSession) => void
  onToast: (message: string) => void
})
```

- [ ] **Step 1: Create the component**

Create `src/components/AttendancePage.tsx` holding the search/filter state and the
whole attendance body — the section heading, the summary, the stat grid, the roster,
the empty state and the history — moved verbatim from `App.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Plus, QrCode, ScanLine } from 'lucide-react'
import { RosterList, type StatusFilter } from './RosterList'
import { SessionHistory } from './SessionHistory'
import { SessionSummary } from './SessionSummary'
import { StatGrid } from './StatGrid'
import { getRoster, specialities, type Speciality, type Student } from '../roster'
import { closeSession, reopenSession, sessionStats, type AttendanceSession } from '../sessions'
import { exportSessionCsv } from '../csv'

/**
 * The attendance screen: pick a session, mark the roster, close and export.
 *
 * Search and filter state lives here rather than in App, because it is reset by
 * a change of session or class and nothing outside this screen reads it.
 */
export function AttendancePage({
  speciality, sessions, selectedId, rosterVersion, onSelect, onCreateOpen, onImportOpen, onReplace, onToast,
}: {
  speciality: Speciality
  sessions: AttendanceSession[]
  selectedId: string | null
  rosterVersion: number
  onSelect: (id: string | null) => void
  onCreateOpen: () => void
  onImportOpen: () => void
  onReplace: (updated: AttendanceSession) => void
  onToast: (message: string) => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const selectedSession = sessions.find(item => item.id === selectedId) || null
  const counts = selectedSession ? sessionStats(selectedSession) : null
  const specialityName = specialities.find(item => item.id === speciality)!.name

  // A different session or class means the old query describes nothing.
  useEffect(() => { setSearch(''); setFilter('all') }, [selectedId, speciality])

  const sessionRoster = useMemo(() => {
    if (!selectedSession) return []
    const byId = new Map<string, Student>()
    for (const item of specialities) {
      if (!selectedSession.specialities.includes(item.id)) continue
      for (const student of getRoster(item.id)) if (!byId.has(student.id)) byId.set(student.id, student)
    }
    return selectedSession.rosterIds
      .map(id => byId.get(id))
      .filter((student): student is Student => Boolean(student))
    // rosterVersion is the signal that localStorage changed under us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, rosterVersion])

  function markStudent(student: Student, status: 'present' | 'absent') {
    if (!selectedSession || selectedSession.state !== 'open') return
    onReplace({
      ...selectedSession,
      entries: { ...selectedSession.entries, [student.id]: { status, at: new Date().toISOString(), method: 'manual' } },
    })
    onToast(`${student.firstName} ${student.lastName} marked ${status}.`)
  }

  function handleClose() {
    if (!selectedSession || selectedSession.state === 'closed') return
    if (!window.confirm(`Close this session? ${counts?.unchecked || 0} unchecked students will be marked absent.`)) return
    onReplace(closeSession(selectedSession))
    onToast('Session closed. Unchecked students were marked absent.')
  }

  function handleReopen() {
    if (!selectedSession || selectedSession.state !== 'closed') return
    onReplace(reopenSession(selectedSession))
    onToast('Session reopened. Automatically marked absences are now unchecked.')
  }

  return <>
    <div className="section-heading">
      <div><p className="eyebrow small">{speciality} · {specialityName}</p><h2>Course sessions</h2></div>
      <span className="section-meta">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span>
    </div>

    {selectedSession ? <>
      <SessionSummary
        session={selectedSession}
        onReopen={handleReopen}
        onExport={() => exportSessionCsv(selectedSession)}
      />
      <StatGrid stats={counts!} />
      <RosterList
        session={selectedSession}
        students={sessionRoster}
        search={search}
        filter={filter}
        onSearch={setSearch}
        onFilter={setFilter}
        onMark={markStudent}
        onCloseSession={handleClose}
      />
    </> : <div className="empty-session">
      <div className="empty-illustration"><QrCode size={46} /><span><ScanLine size={25} /></span></div>
      <h3>No course session yet</h3>
      <p>Start a session for {speciality}. You can then mark each student present or absent as they arrive.</p>
      <div className="empty-actions">
        <button className="button button-primary" onClick={onCreateOpen}><Plus size={18} /> Create first session</button>
        <button className="button button-light" onClick={onImportOpen}>Import the {speciality} roster</button>
      </div>
    </div>}

    {sessions.length > 0 && <SessionHistory sessions={sessions} selectedId={selectedId} onSelect={onSelect} />}
  </>
}
```

Note three deliberate changes while moving:

1. `onScan` and the `scannerOpen` state go away. `SessionSummary` renders the scan
   button only when `BADGES_ENABLED`, which is `false`, so the prop is dead weight
   that would have to be threaded through the new page boundary. Task 4 therefore
   drops `onScan` from `SessionSummary`'s props and the `ScannerModal` branch from
   `App.tsx`; `src/components/badges/ScannerModal.tsx` itself is untouched, as the
   scope fence requires.
2. `markStudent`'s `method` argument is gone — with scanning unreachable, every
   caller passed `'manual'`.
3. The empty state gains the roster-import button in `.empty-actions`, because the
   title-row import action stays in `App.tsx` and a teacher with no sessions still
   needs to reach it. Add to `src/styles/session.css`, inside the existing
   `.empty-session` block's neighbourhood:

```css
/* Stacked on phone so each button keeps the full sheet width. */
.empty-actions { display: grid; gap: var(--space-2); justify-items: stretch; width: 100%; max-width: 320px; margin: 0 auto; }
```

and in that file's existing `@media (min-width: 48rem)` tier:

```css
  .empty-actions { grid-auto-flow: column; justify-content: center; max-width: none; }
```

- [ ] **Step 2: Reduce App to state and routing**

Replace `src/App.tsx` with:

```tsx
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Printer, Upload, X } from 'lucide-react'
import { AppShell, type Page } from './components/AppShell'
import { AttendancePage } from './components/AttendancePage'
import { SpecialityPicker } from './components/SpecialityPicker'
import { CreateSessionModal } from './components/modals/CreateSessionModal'
import { ImportRosterModal } from './components/modals/ImportRosterModal'
import { getRoster, saveRoster, specialities, type Speciality, type Student } from './roster'
import {
  activeRosterIds, createSession, loadSessions, saveSessions, sessionStats,
  type AttendanceSession, type SessionDetails,
} from './sessions'
import { BADGES_ENABLED } from './config'

// Badge screens are dormant behind BADGES_ENABLED. Importing them lazily keeps
// qrcode.react and html5-qrcode out of the entry chunk entirely.
const BadgePage = lazy(() => import('./components/badges/BadgePage'))

function App() {
  const [sessions, setSessions] = useState<AttendanceSession[]>(loadSessions)
  const [speciality, setSpeciality] = useState<Speciality>('1MAUT')
  const [page, setPage] = useState<Page>('attendance')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState('')
  // The roster lives in localStorage, outside React. An import bumps this so
  // the memos below re-read it.
  const [rosterVersion, setRosterVersion] = useState(0)

  useEffect(() => saveSessions(sessions), [sessions])
  useEffect(() => {
    setSelectedId(classSessions[0]?.id || null)
    // The class switch intentionally chooses its most recent session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciality])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  // With badges retired the flag pins this to false, but the branch is kept so
  // flipping BADGES_ENABLED restores the screen without further edits.
  const showBadges = BADGES_ENABLED && page === 'badges'
  // Inactive students are kept for the import merge and for past sessions, but
  // never offered for marking.
  const storedRoster = useMemo(() => getRoster(speciality), [speciality, rosterVersion])
  const classStudents = useMemo(() => storedRoster.filter(student => student.active), [storedRoster])
  const classSessions = useMemo(() => sessions.filter(item => item.specialities.includes(speciality))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sessions, speciality])
  // Attendance of each class's latest session, drawn as the bar across the
  // bottom of its card. A class with no session yet gets no bar.
  const progress = useMemo(() => {
    const shares: Partial<Record<Speciality, number>> = {}
    for (const item of specialities) {
      const latest = sessions.filter(session => session.specialities.includes(item.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (!latest) continue
      const stat = sessionStats(latest)
      shares[item.id] = stat.total ? Math.round((stat.present / stat.total) * 100) : 0
    }
    return shares
  }, [sessions])

  function replaceSession(updated: AttendanceSession) {
    setSessions(current => current.map(item => item.id === updated.id ? updated : item))
  }

  function handleCreate(details: SessionDetails) {
    const session = createSession(details)
    setSessions(current => [session, ...current])
    setSelectedId(session.id)
    setCreateOpen(false)
    setPage('attendance')
    setToast(`${session.course} session started.`)
  }

  function handleImport(students: Student[]) {
    saveRoster(speciality, students)
    // Open sessions are still being taken, so they follow the new class list.
    // Closed ones are a record of who was expected that day and never move.
    // Each one re-snapshots across *its own* classes: using only the imported
    // speciality's ids would silently shrink a shared lecture to one class.
    setSessions(current => current.map(item => item.specialities.includes(speciality) && item.state === 'open'
      ? { ...item, rosterIds: activeRosterIds(item.specialities) }
      : item))
    setRosterVersion(version => version + 1)
    setImportOpen(false)
    setToast(`${speciality} roster updated — ${students.filter(student => student.active).length} active students.`)
  }

  return (
    <AppShell page={page} onPageChange={setPage} speciality={speciality}>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">{showBadges ? 'Identity cards' : 'Classroom attendance'}</p>
          <h1>{showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1>
          <p className="page-subtitle">{showBadges
            ? 'Print a unique badge for each student. Scan it during any course session.'
            : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p>
        </div>
        {showBadges
          ? <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /><span className="page-action-label">Print badges</span></button>
          : <div className="page-actions">
            {/* The roster is per class and must be reachable with no session
                selected, so it lives beside the title, not in the roster panel.
                The labels are clipped on phone, not dropped — they are each
                button's only accessible name. */}
            <button className="button button-light page-action" onClick={() => setImportOpen(true)}><Upload size={19} /><span className="page-action-label">Import roster</span></button>
            <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /><span className="page-action-label">New session</span></button>
          </div>}
      </div>

      <SpecialityPicker speciality={speciality} onChange={setSpeciality} progress={showBadges ? undefined : progress} />

      {showBadges
        ? <Suspense fallback={null}><BadgePage speciality={speciality} students={classStudents} /></Suspense>
        : <AttendancePage
          speciality={speciality}
          sessions={classSessions}
          selectedId={selectedId}
          rosterVersion={rosterVersion}
          onSelect={setSelectedId}
          onCreateOpen={() => setCreateOpen(true)}
          onImportOpen={() => setImportOpen(true)}
          onReplace={replaceSession}
          onToast={setToast}
        />}

      {createOpen && <CreateSessionModal speciality={speciality} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {importOpen && <ImportRosterModal speciality={speciality} currentRoster={storedRoster} onClose={() => setImportOpen(false)} onApply={handleImport} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </AppShell>
  )
}

export default App
```

The `classSessions` reference inside the `useEffect` above its own declaration is
a hoisting error waiting to happen — move the `useEffect` that resets
`selectedId` to sit **after** the `classSessions` memo. Order in the final file:
the `saveSessions` effect, the toast effect, the memos, then the class-switch
effect.

- [ ] **Step 3: Drop the dead scan prop**

In `src/components/SessionSummary.tsx`, remove `onScan` from the props type and
the destructuring, and replace the open-session branch with the reopen/export pair
only — the `BADGES_ENABLED && <button … onScan>` expression goes with it, as does
the now-unused `ScanLine` import:

```tsx
      <div className="session-summary-actions">
        {!open && <button className="button button-light" onClick={onReopen}><RotateCcw size={17} /> Reopen</button>}
        <button className="button button-light" onClick={onExport}><Download size={17} /> Export CSV</button>
      </div>
```

- [ ] **Step 4: Verify nothing changed behaviourally**

Run: `npm test && npm run build`
Expected: all tests pass unchanged (no test touches these components); `tsc` clean.

- [ ] **Step 5: Verify in the browser**

Start the dev server, then at a 375 × 812 viewport confirm: the attendance screen
renders as before, creating a session still works, marking a student still toasts,
and the empty state (select a class with no sessions) shows both buttons at full
width with no horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/AttendancePage.tsx src/components/SessionSummary.tsx src/styles/session.css
git commit -m "refactor: extract the attendance screen so App can route between pages"
```

---

### Task 5: The Courses screen

The first screen built on Task 1's module, and the only place a course code is
ever typed. It also introduces the two shared pieces the timetable needs: the
class-tag component and the `timetable.css` module.

**Files:**
- Create: `src/components/Tags.tsx`
- Create: `src/components/CoursesPage.tsx`
- Create: `src/components/modals/CourseModal.tsx`
- Create: `src/styles/timetable.css`
- Modify: `src/styles/index.css` (one `@import`)
- Modify: `src/styles/modals.css` (add `.modal-error`)
- Modify: `src/components/AppShell.tsx` (`Page` gains `'courses'`)
- Modify: `src/App.tsx` (course + timetable state, the new route)

**Interfaces:**
- Consumes: `Course`, `coursesFor`, `loadCourses`, `saveCourses`, `upsertCourse`, `removeCourse`, `validateCourse`, `normalizeCode` from `src/courses.ts`; `cellsUsingCourse`, `loadTimetable`, `saveTimetable`, `DAYS`, `SLOTS`, `type TimetableEntry` from `src/timetable.ts`.
- Produces:
  - `ClassTags({ specialities }: { specialities: Speciality[] })` — Tasks 6 and 9 reuse it.
  - `CoursesPage({ speciality, courses, entries, onChange, onToast })`
  - `CourseModal({ courses, speciality, editing, onClose, onSave })` where `editing: Course | null`.
  - `Page` includes `'courses'`.
  - `App` holds `courses`/`setCourses` and `entries`/`setEntries`, both persisted. Task 6 is the first writer of `entries`.

- [ ] **Step 1: The shared class-tag component**

Create `src/components/Tags.tsx`:

```tsx
import type { Speciality } from '../roster'

/**
 * The classes something applies to, as short chips: 1MAUT, 1MESE, 4IGEI.
 *
 * The speciality id *is* the short name, so there is nothing to look up — and
 * nothing to fall out of step with roster.ts if a class is ever renamed.
 */
export function ClassTags({ specialities }: { specialities: Speciality[] }) {
  return <span className="class-tags">
    {specialities.map(item => <span className="class-tag" key={item}>{item}</span>)}
  </span>
}
```

- [ ] **Step 2: The course modal**

Create `src/components/modals/CourseModal.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { BookMarked, X } from 'lucide-react'
import { normalizeCode, validateCourse, type Course } from '../../courses'
import { specialities as allSpecialities, type Speciality } from '../../roster'

/**
 * Add or edit one course. `editing` is the course being replaced, or null when
 * adding; it is also what lets the validator tell "re-saving AUT01" apart from
 * "adding a second AUT01".
 */
export function CourseModal({ courses, speciality, editing, onClose, onSave }: {
  courses: Course[]
  /** The active class, pre-ticked when adding — it is the one we know is wanted. */
  speciality: Speciality
  editing: Course | null
  onClose: () => void
  onSave: (course: Course) => void
}) {
  const [code, setCode] = useState(editing?.code || '')
  const [name, setName] = useState(editing?.name || '')
  const [classes, setClasses] = useState<Speciality[]>(editing?.specialities || [speciality])
  const [submitted, setSubmitted] = useState(false)

  const draft: Course = { code, name, specialities: classes }
  const error = validateCourse(draft, courses, editing?.code)

  function toggle(id: Speciality) {
    // Rebuilt from the canonical list rather than appended to, so the stored
    // order never depends on the order the chips were tapped.
    setClasses(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      return allSpecialities.filter(item => next.includes(item.id)).map(item => item.id)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    onSave({ ...draft, code: normalizeCode(code), name: name.trim() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="course-title">
        <div className="modal-header">
          <div className="modal-icon"><BookMarked size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="course-title">{editing ? `Edit ${editing.code}` : 'New course'}</h2>
        <p className="modal-subtitle">
          The code identifies this course everywhere — on the timetable, in the session header and in every export.
        </p>
        <form onSubmit={submit}>
          <div className="field-row">
            <label className="field">
              <span>Code <b>*</b></span>
              {/* Uppercased as it is typed so what is stored is what is seen. */}
              <input
                autoFocus
                maxLength={16}
                placeholder="e.g. AUT01"
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              <span>Name <b>*</b></span>
              <input placeholder="e.g. Industrial automation" value={name} onChange={event => setName(event.target.value)} />
            </label>
          </div>

          <div className="field">
            <span>Classes <b>*</b></span>
            <div className="chip-row">
              {allSpecialities.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className="chip-toggle"
                  aria-pressed={classes.includes(item.id)}
                  onClick={() => toggle(item.id)}
                >
                  {item.shortName}
                </button>
              ))}
            </div>
          </div>

          {/* Shown only after a submit attempt: flagging an empty code while the
              teacher is still typing it would be nagging, not helping. */}
          {submitted && error && <p className="modal-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary">{editing ? 'Save course' : 'Add course'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: The Courses screen**

Create `src/components/CoursesPage.tsx`:

```tsx
import { useState } from 'react'
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react'
import { CourseModal } from './modals/CourseModal'
import { ClassTags } from './Tags'
import { coursesFor, removeCourse, upsertCourse, type Course } from '../courses'
import { cellsUsingCourse, DAYS, SLOTS, type TimetableEntry } from '../timetable'
import type { Speciality } from '../roster'

/**
 * The courses taught to the active class, with add, edit and delete.
 *
 * Filtered by the active speciality (spec §6.1): a teacher managing 1MAUT has no
 * use for the 4IGEI list, and the speciality picker is the control that switches.
 */
export function CoursesPage({ speciality, courses, entries, onChange, onToast }: {
  speciality: Speciality
  /** The whole list — filtered here, so the modal can still check global uniqueness. */
  courses: Course[]
  entries: TimetableEntry[]
  onChange: (next: Course[]) => void
  onToast: (message: string) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const visible = coursesFor(speciality, courses)

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(course: Course) { setEditing(course); setModalOpen(true) }

  function save(course: Course) {
    // upsert keys on the normalised code, so an edit that changes the code would
    // add rather than replace. Drop the old entry first when the code moved.
    const base = editing && editing.code !== course.code ? removeCourse(editing.code, courses) : courses
    onChange(upsertCourse(course, base))
    setModalOpen(false)
    onToast(`${course.code} saved.`)
  }

  function remove(course: Course) {
    // A course still on the timetable cannot be deleted: the cell would point at
    // nothing. Naming the cells is the difference between a dead end and an
    // instruction — the teacher knows exactly which ones to clear.
    const used = cellsUsingCourse(course.code, entries)
    if (used.length > 0) {
      const where = used.map(entry => {
        const day = DAYS.find(item => item.index === entry.day)
        const slot = SLOTS.find(item => item.index === entry.slot)
        return `${day?.short || '?'} ${slot?.start || '?'}`
      }).join(', ')
      onToast(`${course.code} is still on the timetable (${where}). Clear those cells first.`)
      return
    }
    if (!window.confirm(`Delete ${course.code}? Past sessions keep their own copy of the name.`)) return
    onChange(removeCourse(course.code, courses))
    onToast(`${course.code} deleted.`)
  }

  return <>
    <div className="section-heading">
      <div><p className="eyebrow small">{speciality}</p><h2>Courses</h2></div>
      <span className="section-meta">{visible.length} {visible.length === 1 ? 'course' : 'courses'}</span>
    </div>

    {visible.length === 0
      ? <div className="empty-session">
        <div className="empty-illustration"><BookMarked size={46} /></div>
        <h3>No courses for {speciality}</h3>
        <p>Add a course with its code. You can then place it on the weekly timetable.</p>
        <div className="empty-actions">
          <button className="button button-primary" onClick={openAdd}><Plus size={18} /> Add a course</button>
        </div>
      </div>
      : <ul className="course-list">
        {visible.map(course => (
          <li className="course-row" key={course.code}>
            <div className="course-row-main">
              <strong>{course.code}</strong>
              <span>{course.name}</span>
              <ClassTags specialities={course.specialities} />
            </div>
            <div className="course-row-actions">
              <button className="icon-button" onClick={() => openEdit(course)} aria-label={`Edit ${course.code}`}><Pencil size={17} /></button>
              <button className="icon-button" onClick={() => remove(course)} aria-label={`Delete ${course.code}`}><Trash2 size={17} /></button>
            </div>
          </li>
        ))}
      </ul>}

    {visible.length > 0 && <div className="page-footer-action">
      <button className="button button-light" onClick={openAdd}><Plus size={18} /> Add a course</button>
    </div>}

    {modalOpen && <CourseModal
      courses={courses}
      speciality={speciality}
      editing={editing}
      onClose={() => setModalOpen(false)}
      onSave={save}
    />}
  </>
}
```

- [ ] **Step 4: Add the destination**

In `src/components/AppShell.tsx`, extend the union, the destination list and the
crumb title. The new import is `BookMarked`:

```ts
export type Page = 'attendance' | 'courses' | 'badges'

const destinations: { page: Page; label: string; icon: ReactNode }[] = [
  { page: 'attendance', label: 'Attendance', icon: <LayoutGrid size={19} /> },
  { page: 'courses', label: 'Courses', icon: <BookMarked size={19} /> },
]
```

```ts
  const title = destinations.find(item => item.page === page)?.label || 'Attendance'
```

The literal ternary is replaced by a lookup because a third page would have made
it a chain, and the label a destination already carries is the same string the
crumb wants.

- [ ] **Step 5: Wire the route**

In `src/App.tsx`: import the course and timetable modules, hold both lists in
state, persist each, and add the route.

```ts
import { CoursesPage } from './components/CoursesPage'
import { loadCourses, saveCourses, type Course } from './courses'
import { loadTimetable, saveTimetable, type TimetableEntry } from './timetable'
```

```ts
  const [courses, setCourses] = useState<Course[]>(loadCourses)
  // Held here from this task so the Courses screen can refuse to delete a course
  // a cell still points at. Task 6's grid is the first thing that writes it.
  const [entries, setEntries] = useState<TimetableEntry[]>(loadTimetable)
```

```ts
  useEffect(() => saveCourses(courses), [courses])
  useEffect(() => saveTimetable(entries), [entries])
```

Replace the single `showBadges` ternary in the body with a small chain, keeping
the badge branch lazy:

```tsx
      {showBadges && <Suspense fallback={null}><BadgePage speciality={speciality} students={classStudents} /></Suspense>}

      {page === 'courses' && <CoursesPage
        speciality={speciality}
        courses={courses}
        entries={entries}
        onChange={setCourses}
        onToast={setToast}
      />}

      {page === 'attendance' && <AttendancePage
        speciality={speciality}
        sessions={classSessions}
        selectedId={selectedId}
        rosterVersion={rosterVersion}
        onSelect={setSelectedId}
        onCreateOpen={() => setCreateOpen(true)}
        onImportOpen={() => setImportOpen(true)}
        onReplace={replaceSession}
        onToast={setToast}
      />}
```

The title row's two action buttons belong to Attendance only, so guard them:
wrap the `.page-actions` div in `{page === 'attendance' && …}` and give the other
pages their own heading copy:

```tsx
        <div>
          <p className="eyebrow">{page === 'courses' ? 'Course catalogue' : showBadges ? 'Identity cards' : 'Classroom attendance'}</p>
          <h1>{page === 'courses' ? 'The courses you teach.' : showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1>
          <p className="page-subtitle">{page === 'courses'
            ? 'Give each course a code and the classes it is taught to. The timetable and every export use that code.'
            : showBadges
              ? 'Print a unique badge for each student. Scan it during any course session.'
              : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p>
        </div>
```

- [ ] **Step 6: The stylesheet module**

Create `src/styles/timetable.css` with the course list, the tags and the chip row.
Mobile-first: no `max-width`, every tap target at least `var(--tap)`.

```css
/* Courses, class tags, and the weekly timetable grid. */

/* ---- Class tags ---------------------------------------------------------- */

.class-tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.class-tag {
  height: 19px;
  padding: 0 6px;
  border-radius: 5px;
  background: #eef3f5;
  color: #4f6975;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .02em;
  display: inline-flex;
  align-items: center;
}

/* ---- Speciality chips in a form ------------------------------------------ */

.chip-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip-toggle {
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--muted);
  font: 700 12px var(--font-body);
  letter-spacing: -.01em;
}
.chip-toggle[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }

/* ---- Course list --------------------------------------------------------- */

.course-list { list-style: none; display: grid; gap: var(--space-2); margin: 0; padding: 0; }
.course-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  min-height: var(--tap);
}
.course-row-main { display: grid; gap: 3px; min-width: 0; flex: 1; }
.course-row-main strong { font: 800 13px var(--font-display); color: var(--ink); letter-spacing: -.02em; }
.course-row-main > span { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.course-row-actions { display: flex; gap: var(--space-1); flex: none; }

.icon-button {
  width: var(--tap);
  height: var(--tap);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--muted);
  display: grid;
  place-items: center;
}
.icon-button:hover { color: var(--teal); border-color: #cfe3e4; }

.page-footer-action { margin-top: var(--space-3); display: grid; }

/* ========================================================================
   48rem — the course row can afford one line, and the add button stops
   spanning the full width.
   ===================================================================== */
@media (min-width: 48rem) {
  .course-row { padding: var(--space-3) var(--space-4); }
  .course-row-main { grid-auto-flow: column; align-items: center; gap: var(--space-4); grid-template-columns: 90px minmax(0, 1fr) auto; }
  .course-row-main > span { font-size: 13px; }
  .page-footer-action { justify-content: start; }
}
```

In `src/styles/index.css`, add the import after `roster` and before `modals` —
the grid's cells are content, and modal rules must still win over them:

```css
@import './timetable.css';
```

In `src/styles/modals.css`, add the inline error used by every form sheet from
here on:

```css
.modal-error { margin: var(--space-2) 0 0; font-size: 12px; line-height: 1.5; color: #a4423c; }
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: PASS and a clean `tsc`. No test covers these components; Task 1's module
tests already cover the logic they call.

- [ ] **Step 8: Verify in the browser**

At 375 × 812: the tab bar now has two destinations and both labels are legible;
Courses opens empty; add `AUT01` / `Automation` with 1MAUT ticked; the row shows
code, name and one tag; editing to add 1MESE shows two tags; adding a second
course with code `AUT01` shows "AUT01 is already used by another course." and does
not save; deleting a course asks and then removes it.

Then seed a timetable entry to prove the delete guard, and reload:

```js
localStorage.setItem('presence-timetable-v1', JSON.stringify([
  { day: 0, slot: 1, courseCode: 'AUT01', type: 'CR', specialities: ['1MAUT'], room: 'Lab 04' },
]))
```

Expected: deleting `AUT01` now toasts "still on the timetable (Sun 08:00)" and the
course remains. Clear the key afterwards.

At 1280 × 800: the course rows are single-line, and the sidebar lists both pages.

- [ ] **Step 9: Commit**

```bash
git add src/components/CoursesPage.tsx src/components/Tags.tsx src/components/modals/CourseModal.tsx src/components/AppShell.tsx src/App.tsx src/styles/timetable.css src/styles/index.css src/styles/modals.css
git commit -m "feat: add the Courses screen with codes, classes and a delete guard"
```

---

### Task 6: The weekly timetable grid and the assign sheet

The dense screen the whole design exists for. The assign sheet ships with it
because a grid with no way to fill a cell delivers nothing.

**Recorded so it is not later mistaken for churn:** in this task, tapping a
*filled* cell opens the assign sheet. Task 7 changes that tap to open the
start-attendance sheet (spec §6.4) and moves editing behind an "Edit cell" button
inside it. That is the spec's intent — §6.2 says a filled cell's name and room are
"revealed on tap", and §6.4's sheet is what reveals them — but the start sheet
does not exist yet, and shipping a grid that cannot be filled would not be
testable.

**Files:**
- Create: `src/components/TimetablePage.tsx`
- Create: `src/components/modals/AssignCellModal.tsx`
- Modify: `src/components/Tags.tsx` (add `TypeBadge`)
- Modify: `src/styles/base.css` (add `.visually-hidden`)
- Modify: `src/styles/timetable.css` (the grid)
- Modify: `src/components/AppShell.tsx` (`Page` gains `'timetable'`, first in the bar)
- Modify: `src/App.tsx` (the route; hide the speciality picker here)

**Interfaces:**
- Consumes: `DAYS`, `SLOTS`, `SESSION_TYPES`, `entryAt`, `entriesForDay`, `setEntry`, `clearEntry`, `validateEntry`, `todayDayIndex`, `type DayIndex`, `type SlotIndex`, `type TimetableEntry` from `src/timetable.ts`; `findCourse`, `type Course` from `src/courses.ts`; `ClassTags` from `./Tags`.
- Produces:
  - `TypeBadge({ type }: { type: SessionType })` — Task 9 reuses it.
  - `TimetablePage({ entries, courses, onChange, onToast, onGoToCourses })`
  - `AssignCellModal({ day, slot, entry, courses, onClose, onSave, onClear, onGoToCourses })`
  - `Page` includes `'timetable'`.

- [ ] **Step 1: The type badge**

Append to `src/components/Tags.tsx`:

```tsx
import { SESSION_TYPES, type SessionType } from '../timetable'

/**
 * CR / TD / TP. The two letters are the whole point — they fit a grid cell five
 * columns wide — so the full word rides along for screen readers.
 *
 * It is a clipped span rather than a `title` or a bare `aria-label`: `title`
 * never reaches a screen reader reliably, and `aria-label` on a span with no
 * role is ignored by some of them.
 */
export function TypeBadge({ type }: { type: SessionType }) {
  const label = SESSION_TYPES.find(item => item.id === type)?.label || type
  return <span className={`type-badge type-${type.toLowerCase()}`}>
    {type}<span className="visually-hidden"> — {label}</span>
  </span>
}
```

- [ ] **Step 2: The assign sheet**

Create `src/components/modals/AssignCellModal.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { findCourse, type Course } from '../../courses'
import {
  DAYS, SESSION_TYPES, SLOTS, validateEntry,
  type DayIndex, type SessionType, type SlotIndex, type TimetableEntry,
} from '../../timetable'
import { specialities as allSpecialities, type Speciality } from '../../roster'

/**
 * Fills, edits or clears one timetable cell.
 *
 * The course list is every course, not just the active class's: the timetable is
 * global (one grid for all specialities), so the speciality picker is hidden on
 * this screen and cannot be used to narrow anything.
 */
export function AssignCellModal({ day, slot, entry, courses, onClose, onSave, onClear, onGoToCourses }: {
  day: DayIndex
  slot: SlotIndex
  /** The cell's current entry, or null when empty. */
  entry: TimetableEntry | null
  courses: Course[]
  onClose: () => void
  onSave: (entry: TimetableEntry) => void
  onClear: () => void
  onGoToCourses: () => void
}) {
  const [courseCode, setCourseCode] = useState(entry?.courseCode || '')
  const [type, setType] = useState<SessionType>(entry?.type || 'CR')
  const [classes, setClasses] = useState<Speciality[]>(entry?.specialities || [])
  const [room, setRoom] = useState(entry?.room || '')
  const [submitted, setSubmitted] = useState(false)

  const dayLabel = DAYS.find(item => item.index === day)!.label
  const slotTime = SLOTS.find(item => item.index === slot)!
  const draft: TimetableEntry = { day, slot, courseCode, type, specialities: classes, room }
  const error = validateEntry(draft, courses)

  function pickCourse(code: string) {
    setCourseCode(code)
    // Pre-fill from the course's own classes. Guidance, not a constraint: the
    // chips stay editable because a class can join a course mid-year.
    const course = findCourse(code, courses)
    if (course) setClasses(course.specialities)
  }

  function toggle(id: Speciality) {
    setClasses(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      return allSpecialities.filter(item => next.includes(item.id)).map(item => item.id)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    onSave({ ...draft, room: room.trim() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="assign-title">
        <div className="modal-header">
          <div className="modal-icon"><CalendarClock size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="assign-title">{dayLabel} · {slotTime.start}–{slotTime.end}</h2>
        <p className="modal-subtitle">This repeats every week. Tap the cell on the day itself to take attendance.</p>

        {courses.length === 0
          ? <>
            <p className="modal-empty">No courses yet. A timetable cell holds a course, so add one first.</p>
            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="button" className="button button-primary" onClick={onGoToCourses}>Go to Courses</button>
            </div>
          </>
          : <form onSubmit={submit}>
            <label className="field">
              <span>Course <b>*</b></span>
              {/* A native select: it is the one picker that is already a
                  full-height, scrollable, searchable list on every phone. */}
              <div className="select-wrap">
                <select value={courseCode} onChange={event => pickCourse(event.target.value)}>
                  <option value="">Choose a course…</option>
                  {courses.map(course => (
                    <option key={course.code} value={course.code}>{course.code} — {course.name}</option>
                  ))}
                </select>
              </div>
            </label>

            <div className="field">
              <span>Type <b>*</b></span>
              <div className="segmented" role="group" aria-label="Session type">
                {SESSION_TYPES.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={type === item.id}
                    onClick={() => setType(item.id)}
                  >
                    <strong>{item.id}</strong><span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Classes <b>*</b></span>
              <div className="chip-row">
                {allSpecialities.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className="chip-toggle"
                    aria-pressed={classes.includes(item.id)}
                    onClick={() => toggle(item.id)}
                  >
                    {item.shortName}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Room</span>
              <input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} />
            </label>

            {submitted && error && <p className="modal-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              {entry && <button type="button" className="button button-light" onClick={onClear}>Clear cell</button>}
              <button type="submit" className="button button-primary">Save</button>
            </div>
          </form>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: The grid**

Create `src/components/TimetablePage.tsx`:

```tsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AssignCellModal } from './modals/AssignCellModal'
import { ClassTags, TypeBadge } from './Tags'
import { findCourse, type Course } from '../courses'
import {
  DAYS, SLOTS, clearEntry, entryAt, setEntry, todayDayIndex,
  type DayIndex, type SlotIndex, type TimetableEntry,
} from '../timetable'

/**
 * The weekly timetable: five days of six slots, one entry per cell.
 *
 * One DOM tree serves both layouts. On phone the day strip picks a day and only
 * that day's column is displayed; from 48rem every column is displayed at once
 * as the grid. The switch is pure CSS (see timetable.css) — nothing here reads
 * the viewport width, so there is no resize listener and no layout flash.
 */
export function TimetablePage({ entries, courses, onChange, onToast, onGoToCourses }: {
  entries: TimetableEntry[]
  courses: Course[]
  onChange: (next: TimetableEntry[]) => void
  onToast: (message: string) => void
  onGoToCourses: () => void
}) {
  const today = todayDayIndex()
  // Opens on today, or Sunday at the weekend — the grid has no Friday column.
  const [day, setDay] = useState<DayIndex>(today ?? 0)
  const [cell, setCell] = useState<{ day: DayIndex; slot: SlotIndex } | null>(null)

  const open = cell ? entryAt(cell.day, cell.slot, entries) : undefined

  function save(entry: TimetableEntry) {
    onChange(setEntry(entry, entries))
    setCell(null)
    onToast(`${entry.courseCode} ${entry.type} saved to the timetable.`)
  }

  function clear() {
    if (!cell) return
    onChange(clearEntry(cell.day, cell.slot, entries))
    setCell(null)
    onToast('Cell cleared.')
  }

  return <>
    <div className="section-heading">
      <div><p className="eyebrow small">All classes</p><h2>Weekly timetable</h2></div>
      <span className="section-meta">{entries.length} of 30 slots</span>
    </div>

    {/* Phone only: the grid replaces it from 48rem. */}
    <div className="day-strip" role="tablist" aria-label="Day">
      {DAYS.map(item => (
        <button
          key={item.index}
          className="day-chip"
          role="tab"
          aria-selected={day === item.index}
          aria-current={day === item.index ? 'true' : undefined}
          onClick={() => setDay(item.index)}
        >
          {item.short}
        </button>
      ))}
    </div>

    <div className="timetable">
      {/* The shared time column of the grid; hidden on phone, where each row
          carries its own time. */}
      <div className="timetable-times" aria-hidden="true">
        <span className="timetable-day-head" />
        {SLOTS.map(slot => <span key={slot.index}>{slot.start}<small>{slot.end}</small></span>)}
      </div>

      {DAYS.map(item => (
        <div
          className="timetable-day"
          key={item.index}
          data-active={day === item.index ? 'true' : 'false'}
          data-today={today === item.index ? 'true' : undefined}
        >
          <div className="timetable-day-head">{item.short}</div>
          {SLOTS.map(slot => {
            const entry = entryAt(item.index, slot.index, entries)
            const course = entry ? findCourse(entry.courseCode, courses) : undefined
            return (
              <button
                className="timetable-cell"
                key={slot.index}
                data-filled={entry ? 'true' : 'false'}
                onClick={() => setCell({ day: item.index, slot: slot.index })}
                aria-label={`${item.label} slot ${slot.index}, ${slot.start} to ${slot.end} — ${
                  entry ? `${entry.courseCode} ${entry.type}` : 'empty, assign a course'}`}
              >
                <span className="cell-time">{slot.start}–{slot.end}</span>
                {entry ? <>
                  <span className="cell-head">
                    <span className="cell-code">{entry.courseCode}</span>
                    <TypeBadge type={entry.type} />
                  </span>
                  {/* The name falls back to the code when the course is gone —
                      possible only if storage was edited by hand, since the
                      Courses screen refuses to delete a referenced course. */}
                  <span className="cell-name">{course?.name || entry.courseCode}</span>
                  <ClassTags specialities={entry.specialities} />
                  {entry.room && <span className="cell-room">{entry.room}</span>}
                </> : <span className="cell-assign"><Plus size={15} /> Assign</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>

    {cell && <AssignCellModal
      day={cell.day}
      slot={cell.slot}
      entry={open || null}
      courses={courses}
      onClose={() => setCell(null)}
      onSave={save}
      onClear={clear}
      onGoToCourses={onGoToCourses}
    />}
  </>
}
```

- [ ] **Step 4: The clipped-text utility**

Add to `src/styles/base.css`. This is the third copy of the technique
(`.tabbar-label` and `.page-action-label` both inline it at their breakpoints), so
it earns a name:

```css
/* Removed from the page but kept in the accessibility tree. Not `font-size: 0`,
   which is inherited by children, and not `display: none`, which is not read. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- [ ] **Step 5: The grid stylesheet**

Append to `src/styles/timetable.css`. Read the three `display` rules on
`.timetable-day` together — they are the whole one-DOM-two-layouts trick:

```css
/* ---- Type badge ---------------------------------------------------------- */

.type-badge {
  min-width: 30px;
  height: 20px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .02em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.type-cr { background: #e9f1fb; color: #3f6aa8; }
.type-td { background: #eaf4ef; color: #2f7c5f; }
.type-tp { background: #fdf1e6; color: #a4702f; }

/* ---- Segmented control --------------------------------------------------- */

.segmented { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.segmented button {
  min-height: var(--tap);
  padding: var(--space-2) var(--space-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  display: grid;
  gap: 1px;
  text-align: center;
}
.segmented strong { font: 800 13px var(--font-display); color: var(--ink); letter-spacing: -.02em; }
.segmented span { font-size: 9px; color: var(--muted); }
.segmented button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); }
.segmented button[aria-pressed="true"] strong,
.segmented button[aria-pressed="true"] span { color: #fff; }

.modal-empty { font-size: 13px; line-height: 1.6; color: var(--muted); margin: var(--space-3) 0 0; }

/* ---- Day strip (phone) --------------------------------------------------- */

.day-strip { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); margin-bottom: var(--space-3); }
.day-chip {
  min-height: var(--tap);
  padding: 0 var(--space-4);
  flex: 1 0 auto;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: 700 12px var(--font-body);
}
.day-chip[aria-current="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }

/* ---- The table ----------------------------------------------------------- */

.timetable { display: grid; gap: 6px; }
.timetable-times { display: none; }

/* One day at a time on phone: every column is hidden, and the strip's choice
   adds itself back. */
.timetable-day { display: none; }
.timetable-day[data-active="true"] { display: grid; gap: var(--space-2); }
.timetable-day-head { display: none; }

.timetable-cell {
  display: grid;
  gap: 5px;
  justify-items: start;
  text-align: left;
  min-height: var(--tap);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.timetable-cell[data-filled="false"] { background: var(--idle-bg); border-style: dashed; }
.cell-time { font-size: 10px; font-weight: 700; color: var(--idle-fg); letter-spacing: .02em; }
.cell-head { display: flex; align-items: center; gap: var(--space-2); }
.cell-code { font: 800 13px var(--font-display); color: var(--ink); letter-spacing: -.02em; }
.cell-name { font-size: 12px; color: var(--ink); overflow-wrap: anywhere; }
.cell-room { font-size: 11px; color: var(--muted); }
.cell-assign { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--teal); }

/* ========================================================================
   48rem — the whole week at once. Days become columns; the time column is
   shared. The `display: grid` here has the same specificity as the
   `display: none` above and simply comes later, so it wins; the
   `[data-active]` rule only ever adds a column, never removes one.
   ===================================================================== */
@media (min-width: 48rem) {
  .day-strip { display: none; }

  .timetable { grid-template-columns: 58px repeat(5, minmax(0, 1fr)); align-items: start; }
  /* Both column types repeat the same row sizing, which is what keeps slot 3 of
     Tuesday level with slot 3 of the time column — they are sibling grids, not
     one grid, because `display: contents` would break the rules above. */
  .timetable-times,
  .timetable-day { display: grid; gap: 6px; grid-auto-rows: 72px; }
  .timetable-times { text-align: right; }
  .timetable-times > span { display: grid; align-content: center; font-size: 10px; font-weight: 700; color: var(--muted); padding-right: 4px; }
  .timetable-times small { font-size: 9px; color: var(--idle-fg); font-weight: 600; }

  .timetable-day-head,
  .timetable-times .timetable-day-head {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    grid-row: auto;
    font: 800 11px var(--font-display);
    color: var(--muted);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .timetable-day[data-today="true"] .timetable-day-head { color: var(--teal-strong); }
  .timetable-day[data-today="true"] .timetable-cell { border-color: #cce4e3; }

  .timetable-times,
  .timetable-day { grid-template-rows: 30px repeat(6, 72px); grid-auto-rows: 72px; }

  .timetable-cell { padding: var(--space-2); gap: 4px; align-content: start; }
  /* A five-column cell cannot carry five pieces of text legibly, so the name,
     room and time drop out here. Tapping the cell shows them. */
  .cell-time, .cell-name, .cell-room { display: none; }
  .cell-code { font-size: 12px; }
  .cell-assign { font-size: 10px; }
}

/* ========================================================================
   64rem — the grid has room to breathe.
   ===================================================================== */
@media (min-width: 64rem) {
  .timetable { grid-template-columns: 64px repeat(5, minmax(0, 1fr)); gap: 8px; }
  .timetable-times,
  .timetable-day { gap: 8px; }
  .timetable-cell { padding: var(--space-3); }
}
```

- [ ] **Step 6: Add the destination and the route**

In `src/components/AppShell.tsx`, `Page` gains `'timetable'` and the destination
goes **first** — the week is the screen a teacher opens on, and the bar reads
left to right in the order the day runs. New import: `CalendarClock`.

```ts
export type Page = 'timetable' | 'attendance' | 'courses' | 'badges'

const destinations: { page: Page; label: string; icon: ReactNode }[] = [
  { page: 'timetable', label: 'Timetable', icon: <CalendarClock size={19} /> },
  { page: 'attendance', label: 'Attendance', icon: <LayoutGrid size={19} /> },
  { page: 'courses', label: 'Courses', icon: <BookMarked size={19} /> },
]
```

In `src/App.tsx`: import `TimetablePage`, add the route, and hide the speciality
picker on this screen — the timetable is global, so a class filter there would
promise filtering it does not do.

```tsx
      {page !== 'timetable' && <SpecialityPicker speciality={speciality} onChange={setSpeciality} progress={showBadges ? undefined : progress} />}

      {page === 'timetable' && <TimetablePage
        entries={entries}
        courses={courses}
        onChange={setEntries}
        onToast={setToast}
        onGoToCourses={() => setPage('courses')}
      />}
```

And its heading copy, extending the chain from Task 5:

```tsx
        <div>
          <p className="eyebrow">{page === 'timetable' ? 'Weekly schedule' : page === 'courses' ? 'Course catalogue' : showBadges ? 'Identity cards' : 'Classroom attendance'}</p>
          <h1>{page === 'timetable' ? 'Your week, slot by slot.' : page === 'courses' ? 'The courses you teach.' : showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1>
          <p className="page-subtitle">{page === 'timetable'
            ? 'Six slots a day, Sunday to Thursday. Assign a course to a cell once and it repeats every week.'
            : page === 'courses'
              ? 'Give each course a code and the classes it is taught to. The timetable and every export use that code.'
              : showBadges
                ? 'Print a unique badge for each student. Scan it during any course session.'
                : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p>
        </div>
```

The chain is now four deep and at its limit. If a fifth page ever arrives, move
this copy into a `Record<Page, …>` table beside `destinations`; with four it would
cost more indirection than it saves.

- [ ] **Step 7: Set the landing page**

`useState<Page>('timetable')` — the timetable is where a teaching day starts, and
it is one tap from there to attendance.

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: PASS and a clean `tsc`.

- [ ] **Step 9: Verify in the browser**

The CSS trick above is the one thing here that a type check cannot catch, so
check it at both widths.

At 375 × 812:
- The app opens on Timetable with today's chip filled. (Today is a Saturday in the
  test data's week — expect Sunday selected, since the grid has no Saturday.)
- Exactly **six** cells are visible: one day's slots, each showing its time range
  and *Assign*.
- Tapping another day chip swaps the six cells; still six, never twelve.
- Assign `AUT01` / CR / 1MAUT + 1MESE / `Lab 04` to Sunday slot 1. The row now
  shows the time, `AUT01`, a blue `CR`, two tags and `Lab 04`.
- Re-tapping that cell reopens the sheet pre-filled; *Clear cell* empties it.
- Choosing a course flips the class chips to that course's own classes.
- With no courses at all the sheet shows the message and the *Go to Courses*
  button, and that button lands on Courses.
- `document.body.scrollWidth` equals `window.innerWidth` — no horizontal overflow.

At 1280 × 800:
- All five day columns are visible at once with one shared time column.
- `preview_inspect` the time column's slot-3 span and Tuesday's third cell: their
  `y` must match. If they do not, the two `grid-template-rows` declarations have
  drifted apart.
- Today's column header is teal.
- Filled cells show only the code, the badge and the tags — no name, no room, no
  time.

- [ ] **Step 10: Commit**

```bash
git add src/components/TimetablePage.tsx src/components/modals/AssignCellModal.tsx src/components/Tags.tsx src/components/AppShell.tsx src/App.tsx src/styles/timetable.css src/styles/base.css
git commit -m "feat: add the weekly timetable grid and the assign-cell sheet"
```

---

### Task 7: One tap from a cell to today's attendance

The payoff: a filled cell becomes a live session. Tapping a filled cell now opens
this sheet instead of the assign sheet (the switch Task 6 recorded), and editing
the cell moves to a button inside it.

**Files:**
- Create: `src/components/modals/StartSessionModal.tsx`
- Modify: `src/components/TimetablePage.tsx` (two modes for a tapped cell)
- Modify: `src/App.tsx` (start from a cell, open an existing one, the selection fix)

**Interfaces:**
- Consumes: `sessionForCell`, `activeRosterIds`, `createSession`, `type SessionDetails`, `type AttendanceSession` from `src/sessions.ts`; `dateForDayInCurrentWeek`, `DAYS`, `SLOTS` from `src/timetable.ts`; `formatDate` from `src/format.ts`.
- Produces:
  - `StartSessionModal({ entry, course, existing, defaultTeacher, onClose, onStart, onOpen, onEdit })`
  - `TimetablePage` gains `sessions`, `onStart`, `onOpenSession`.
  - `App` gains `startFromCell(details)` and `openSession(session)`.

- [ ] **Step 1: The start sheet**

Create `src/components/modals/StartSessionModal.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { ArrowRight, Pencil, PlayCircle, Users, X } from 'lucide-react'
import { ClassTags, TypeBadge } from '../Tags'
import { activeRosterIds, type AttendanceSession, type SessionDetails } from '../../sessions'
import { DAYS, SLOTS, dateForDayInCurrentWeek, type TimetableEntry } from '../../timetable'
import { formatDate } from '../../format'
import type { Course } from '../../courses'

/**
 * Turns a timetable cell into a live attendance session.
 *
 * Course, type and classes come from the cell and are not editable here — the
 * cell is the authority, and this sheet exists to confirm a date, not to redesign
 * the week. `onEdit` goes back to the assign sheet for that.
 */
export function StartSessionModal({ entry, course, existing, defaultTeacher, onClose, onStart, onOpen, onEdit }: {
  entry: TimetableEntry
  course: Course | undefined
  /** A session already recorded for this cell on this date, if any. */
  existing: AttendanceSession | undefined
  defaultTeacher: string
  onClose: () => void
  onStart: (details: SessionDetails) => void
  onOpen: (session: AttendanceSession) => void
  onEdit: () => void
}) {
  const slot = SLOTS.find(item => item.index === entry.slot)!
  const dayLabel = DAYS.find(item => item.index === entry.day)!.label
  const [date, setDate] = useState(dateForDayInCurrentWeek(entry.day))
  const [time, setTime] = useState(slot.start)
  const [teacher, setTeacher] = useState(defaultTeacher)

  // Across every class on the cell: a shared lecture's roster is the sum of them.
  const headcount = activeRosterIds(entry.specialities).length

  function submit(event: FormEvent) {
    event.preventDefault()
    if (existing) { onOpen(existing); return }
    if (!date || !time) return
    onStart({
      specialities: entry.specialities,
      courseCode: entry.courseCode,
      // The name is snapshotted now, so renaming the course later never rewrites
      // this session's history.
      course: course?.name || entry.courseCode,
      type: entry.type,
      origin: { day: entry.day, slot: entry.slot },
      date, time, room: entry.room, teacher: teacher.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <div className="modal-header">
          <div className="modal-icon"><PlayCircle size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="start-title">{entry.courseCode} · {course?.name || 'Course'}</h2>
        <div className="start-identity">
          <TypeBadge type={entry.type} />
          <ClassTags specialities={entry.specialities} />
          {entry.room && <span className="start-room">{entry.room}</span>}
        </div>
        <p className="modal-subtitle">{dayLabel}, slot {entry.slot} · {slot.start}–{slot.end}</p>

        <form onSubmit={submit}>
          {existing
            // A mis-tap on a phone can therefore never create a duplicate session
            // for the same cell on the same day.
            ? <p className="modal-note" role="status">
              <Users size={18} />
              <span>A session for this slot already exists on {formatDate(existing.date)} — {existing.state === 'open' ? 'still open' : 'closed'}. Open it instead of starting a second one.</span>
            </p>
            : <>
              <div className="field-row">
                <label className="field">
                  <span>Date <b>*</b></span>
                  <input type="date" required value={date} onChange={event => setDate(event.target.value)} />
                </label>
                <label className="field">
                  <span>Start time <b>*</b></span>
                  <input type="time" required value={time} onChange={event => setTime(event.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>Teacher</span>
                <input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} />
              </label>
              <div className="modal-note">
                <Users size={18} />
                <span>{headcount} active {headcount === 1 ? 'student' : 'students'} from {entry.specialities.join(' + ')} will be included.</span>
              </div>
            </>}

          <div className="modal-actions">
            <button type="button" className="button button-light" onClick={onEdit}><Pencil size={16} /> Edit cell</button>
            <button type="submit" className="button button-primary">
              {existing ? 'Open existing session' : <>Start session <ArrowRight size={17} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

Add to `src/styles/timetable.css`:

```css
.start-identity { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0; }
.start-room { font-size: 11px; font-weight: 700; color: var(--muted); }
```

- [ ] **Step 2: Two modes for a tapped cell**

In `src/components/TimetablePage.tsx`, the tapped-cell state gains a mode, the
props gain the session list, and an empty cell still goes straight to assign.

```tsx
export function TimetablePage({ entries, courses, sessions, onChange, onToast, onGoToCourses, onStart, onOpenSession }: {
  entries: TimetableEntry[]
  courses: Course[]
  sessions: AttendanceSession[]
  onChange: (next: TimetableEntry[]) => void
  onToast: (message: string) => void
  onGoToCourses: () => void
  onStart: (details: SessionDetails) => void
  onOpenSession: (session: AttendanceSession) => void
}) {
  const today = todayDayIndex()
  const [day, setDay] = useState<DayIndex>(today ?? 0)
  const [cell, setCell] = useState<{ day: DayIndex; slot: SlotIndex; mode: 'start' | 'assign' } | null>(null)

  const open = cell ? entryAt(cell.day, cell.slot, entries) : undefined
  const openCourse = open ? findCourse(open.courseCode, courses) : undefined
  // The teacher name carries over from the last session created, so it is typed
  // once a term rather than once a slot.
  const lastTeacher = sessions.map(item => item.teacher).find(name => Boolean(name)) || ''
```

The cell's click handler chooses the sheet:

```tsx
                onClick={() => setCell({ day: item.index, slot: slot.index, mode: entry ? 'start' : 'assign' })}
```

And the two sheets replace the single one at the end of the component:

```tsx
    {cell && open && cell.mode === 'start' && <StartSessionModal
      entry={open}
      course={openCourse}
      existing={sessionForCell(cell.day, cell.slot, dateForDayInCurrentWeek(cell.day), sessions)}
      defaultTeacher={lastTeacher}
      onClose={() => setCell(null)}
      onStart={onStart}
      onOpen={onOpenSession}
      onEdit={() => setCell({ ...cell, mode: 'assign' })}
    />}

    {cell && cell.mode === 'assign' && <AssignCellModal
      day={cell.day}
      slot={cell.slot}
      entry={open || null}
      courses={courses}
      onClose={() => setCell(null)}
      onSave={save}
      onClear={clear}
      onGoToCourses={onGoToCourses}
    />}
```

New imports: `StartSessionModal`, `sessionForCell`, `dateForDayInCurrentWeek`,
`type AttendanceSession`, `type SessionDetails`.

Note the `cell && open &&` guard on the start sheet: a cell cleared from inside
the assign sheet sets `cell` to null anyway, but the guard is what makes `open`
a `TimetableEntry` rather than `TimetableEntry | undefined` for the prop.

- [ ] **Step 3: Wire it in App**

Add two handlers to `src/App.tsx`:

```tsx
  /**
   * Both paths out of the timetable land on Attendance with the session selected.
   * Switching the speciality picker is not cosmetic: the attendance screen lists
   * `classSessions`, so without it a 1MESE session would be selected and then
   * filtered out of the very list it was selected from.
   */
  function openSession(session: AttendanceSession) {
    setSpeciality(session.specialities[0])
    setSelectedId(session.id)
    setPage('attendance')
  }

  function startFromCell(details: SessionDetails) {
    const session = createSession(details)
    setSessions(current => [session, ...current])
    openSession(session)
    setToast(`${session.courseCode} ${session.type} session started.`)
  }
```

Route the new props:

```tsx
      {page === 'timetable' && <TimetablePage
        entries={entries}
        courses={courses}
        sessions={sessions}
        onChange={setEntries}
        onToast={setToast}
        onGoToCourses={() => setPage('courses')}
        onStart={startFromCell}
        onOpenSession={openSession}
      />}
```

- [ ] **Step 4: Stop the class switch from clobbering the selection**

`openSession` sets the speciality and the id together, and the existing
class-switch effect then overwrites the id with that class's newest session. Today
that lands on the right one by luck — the session was just created, so it sorts
first. Make it deliberate:

```tsx
  useEffect(() => {
    // Keep the selection when it belongs to the class being switched to; this
    // also means switching away and back returns you to where you were.
    setSelectedId(current => classSessions.some(item => item.id === current)
      ? current
      : classSessions[0]?.id || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciality])
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS and a clean `tsc`. `sessionForCell` is already covered by Task 3's
tests; this task is wiring.

- [ ] **Step 6: Verify in the browser**

At 375 × 812, with `AUT01 CR` on Sunday slot 1 for 1MAUT + 1MESE:
- Tap the filled cell: the start sheet shows `AUT01 · Automation`, a `CR` badge,
  both tags, the room, this week's Sunday date, `08:00`, and a combined count
  equal to 1MAUT's active students plus 1MESE's.
- *Start session* lands on Attendance with the new session selected, the picker on
  1MAUT, and the roster showing both classes' students.
- Go back to Timetable and tap the same cell again: the sheet now says a session
  already exists and the primary button reads *Open existing session*; tapping it
  selects that same session rather than creating a second one. Confirm
  `JSON.parse(localStorage['presence-attendance-v1']).length` is still 1.
- *Edit cell* swaps the start sheet for the assign sheet, pre-filled.
- An empty cell still opens the assign sheet directly.

- [ ] **Step 7: Commit**

```bash
git add src/components/modals/StartSessionModal.tsx src/components/TimetablePage.tsx src/App.tsx src/styles/timetable.css
git commit -m "feat: start an attendance session from a timetable cell"
```

---

### Task 8: Make the ad-hoc session form course-aware

The free-text "Course name" box is the last place a course can enter the app
without a code. Spec §6.7 replaces it with the same three controls the assign
sheet uses, while keeping the form's reason to exist: a session that is *not* on
the timetable.

**Files:**
- Modify: `src/components/modals/CreateSessionModal.tsx`
- Modify: `src/App.tsx` (pass the course list through)

**Interfaces:**
- Consumes: `coursesFor`, `findCourse`, `type Course`; `SESSION_TYPES`, `type SessionType`.
- Produces: `CreateSessionModal({ speciality, courses, onClose, onCreate, onGoToCourses })`.

- [ ] **Step 1: Rewrite the modal body**

Replace `src/components/modals/CreateSessionModal.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Users, X } from 'lucide-react'
import { findCourse, type Course } from '../../courses'
import { SESSION_TYPES, type SessionType } from '../../timetable'
import { activeRosterIds, type SessionDetails } from '../../sessions'
import { specialities as allSpecialities, type Speciality } from '../../roster'
import { localToday } from '../../format'

/**
 * A session that is not on the timetable: a catch-up, a swapped room, an exam.
 *
 * It carries no `origin`, which is precisely what marks it ad-hoc — and what
 * keeps `sessionForCell` from ever matching it.
 *
 * Bottom sheet on phone, centred dialog from 48rem — see modals.css.
 */
export function CreateSessionModal({ speciality, courses, onClose, onCreate, onGoToCourses }: {
  speciality: Speciality
  courses: Course[]
  onClose: () => void
  onCreate: (details: SessionDetails) => void
  onGoToCourses: () => void
}) {
  const [courseCode, setCourseCode] = useState('')
  const [type, setType] = useState<SessionType>('CR')
  const [classes, setClasses] = useState<Speciality[]>([speciality])
  const [date, setDate] = useState(localToday())
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [room, setRoom] = useState('')
  const [teacher, setTeacher] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const course = findCourse(courseCode, courses)
  const error = !course ? 'Choose a course from the list.'
    : classes.length === 0 ? 'Choose at least one class.'
    : !date || !time ? 'A date and a start time are required.'
    : undefined
  const headcount = activeRosterIds(classes).length

  function pickCourse(code: string) {
    setCourseCode(code)
    const picked = findCourse(code, courses)
    if (picked) setClasses(picked.specialities)
  }

  function toggle(id: Speciality) {
    setClasses(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      return allSpecialities.filter(item => next.includes(item.id)).map(item => item.id)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error || !course) return
    onCreate({
      specialities: classes,
      courseCode: course.code,
      course: course.name,
      type,
      date, time, room: room.trim(), teacher: teacher.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-header">
          <div className="modal-icon"><CalendarDays size={23} /></div>
          <button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <h2 id="create-title">New course session</h2>
        <p className="modal-subtitle">
          For a session that is not on the timetable. Each student starts as not checked.
        </p>

        {courses.length === 0
          ? <>
            <p className="modal-empty">No courses yet. A session needs a course, so add one first.</p>
            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="button" className="button button-primary" onClick={onGoToCourses}>Go to Courses</button>
            </div>
          </>
          : <form onSubmit={submit}>
            <label className="field">
              <span>Course <b>*</b></span>
              <div className="select-wrap">
                <select autoFocus value={courseCode} onChange={event => pickCourse(event.target.value)}>
                  <option value="">Choose a course…</option>
                  {courses.map(item => (
                    <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                  ))}
                </select>
              </div>
            </label>

            <div className="field">
              <span>Type <b>*</b></span>
              <div className="segmented" role="group" aria-label="Session type">
                {SESSION_TYPES.map(item => (
                  <button type="button" key={item.id} aria-pressed={type === item.id} onClick={() => setType(item.id)}>
                    <strong>{item.id}</strong><span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Classes <b>*</b></span>
              <div className="chip-row">
                {allSpecialities.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className="chip-toggle"
                    aria-pressed={classes.includes(item.id)}
                    onClick={() => toggle(item.id)}
                  >
                    {item.shortName}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Date <b>*</b></span>
                <input type="date" required value={date} onChange={event => setDate(event.target.value)} />
              </label>
              <label className="field">
                <span>Start time <b>*</b></span>
                <input type="time" required value={time} onChange={event => setTime(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Room</span>
                <input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} />
              </label>
              <label className="field">
                <span>Teacher</span>
                <input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} />
              </label>
            </div>

            <div className="modal-note">
              <Users size={18} />
              <span>{headcount} active {headcount === 1 ? 'student' : 'students'} from {classes.join(' + ') || 'no class yet'} will be included.</span>
            </div>

            {submitted && error && <p className="modal-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
              <button type="submit" className="button button-primary">Start session <ArrowRight size={17} /></button>
            </div>
          </form>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Pass the list through**

In `src/App.tsx`:

```tsx
      {createOpen && <CreateSessionModal
        speciality={speciality}
        courses={courses}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onGoToCourses={() => { setCreateOpen(false); setPage('courses') }}
      />}
```

`handleCreate` already calls `openSession`-equivalent work inline from Task 4;
change its body to reuse the Task 7 helper so an ad-hoc 4IGEI session created
while the picker sits on 1MAUT still lands on a screen that lists it:

```tsx
  function handleCreate(details: SessionDetails) {
    const session = createSession(details)
    setSessions(current => [session, ...current])
    setCreateOpen(false)
    openSession(session)
    setToast(`${session.course} session started.`)
  }
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`
Expected: PASS and clean. No test imports this component.

- [ ] **Step 4: Verify in the browser**

At 375 × 812, on Attendance, *New session*: the course picker lists every course
as `CODE — Name`; choosing one pre-fills its classes; the CR/TD/TP control is
three full-height buttons; submitting with no course picked shows "Choose a course
from the list." and does not create anything; a created session appears in the
history with its code. With the course list emptied, the sheet offers *Go to
Courses* instead of a form.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/CreateSessionModal.tsx src/App.tsx
git commit -m "feat: the ad-hoc session form picks a course, a type and its classes"
```

---

### Task 9: Course identity on the attendance screen

Sessions now carry a code, a type and several classes, but the screen where
attendance is actually taken still shows only a course name. Spec §6.6 closes
that gap.

**Files:**
- Modify: `src/components/SessionSummary.tsx`
- Modify: `src/components/SessionHistory.tsx`
- Modify: `src/components/RosterList.tsx`
- Modify: `src/components/AttendancePage.tsx` (the class filter's state)
- Modify: `src/styles/roster.css` (one rule)

**Interfaces:**
- Consumes: `ClassTags`, `TypeBadge` from `./Tags`.
- Produces: `RosterList` gains `classFilter: Speciality | 'all'` and `onClassFilter: (next: Speciality | 'all') => void`.

- [ ] **Step 1: The session banner**

In `src/components/SessionSummary.tsx`, replace the `<h3>` with the code-and-name
pair and add the identity row beneath it. New imports: `ClassTags`, `TypeBadge`.

```tsx
        {/* `CODE · Name` when there is a code. Legacy sessions have none and show
            just the name — padding them with a separator would imply a code. */}
        <h3>{session.courseCode ? `${session.courseCode} · ${session.course}` : session.course}</h3>
        <div className="start-identity">
          {session.type && <TypeBadge type={session.type} />}
          <ClassTags specialities={session.specialities} />
        </div>
```

`.start-identity` is Task 7's rule and already does exactly this job; reusing it
beats a second name for the same row.

- [ ] **Step 2: The history rows**

In `src/components/SessionHistory.tsx`, fold the new identity into the two lines
the row already has. The DOM shape is unchanged on purpose — the row is a
five-cell table from 48rem (see session.css), so a new element inside
`.history-title` would land in a cell that was not sized for it.

```tsx
              <span className="history-title">
                <strong>{item.courseCode ? `${item.courseCode} · ${item.course}` : item.course}</strong>
                <small>{[item.type, item.time, item.room, item.specialities.join(' + ')].filter(Boolean).join(' · ')}</small>
              </span>
```

- [ ] **Step 3: The roster rows and the class filter**

In `src/components/RosterList.tsx`: add the two props, the class filter, and a tag
on each row when the session spans more than one class.

```tsx
import type { Speciality, Student } from '../roster'
import { ClassTags } from './Tags'
```

```tsx
export function RosterList({
  session, students, search, filter, classFilter, onSearch, onFilter, onClassFilter, onMark, onCloseSession,
}: {
  session: AttendanceSession
  students: Student[]
  search: string
  filter: StatusFilter
  /** Only meaningful for a session spanning several classes; 'all' otherwise. */
  classFilter: Speciality | 'all'
  onSearch: (next: string) => void
  onFilter: (next: StatusFilter) => void
  onClassFilter: (next: Speciality | 'all') => void
  onMark: (student: Student, status: 'present' | 'absent') => void
  onCloseSession: () => void
}) {
  const open = session.state === 'open'
  // A single-class session needs no tags and no class filter: every row would
  // carry the same chip, which is noise on a 375px card.
  const multi = session.specialities.length > 1
  const query = search.trim().toLowerCase()
  const visible = students.filter(student => {
    const haystack = `${student.firstName} ${student.lastName} ${student.id} ${student.email || ''}`.toLowerCase()
    return (!query || haystack.includes(query))
      && (filter === 'all' || statusFor(session, student) === filter)
      && (classFilter === 'all' || student.speciality === classFilter)
  })
```

Add the second select inside `.roster-tools`, after the status one:

```tsx
          {multi && <div className="select-wrap">
            <select aria-label="Filter by class" value={classFilter} onChange={event => onClassFilter(event.target.value as Speciality | 'all')}>
              <option value="all">All classes</option>
              {session.specialities.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>}
```

A select rather than a row of chips: the restructure already replaced the status
chips with one, and a phone gets a full-height native list out of it for free.

And the row tag, inside `.student-text`:

```tsx
                    <span className="student-text">
                      <strong>{name}</strong>
                      {multi && <ClassTags specialities={[student.speciality]} />}
                      {student.email && <small>{student.email}</small>}
                    </span>
```

Add to `src/styles/roster.css`:

```css
/* The tag sits between the name and the email on a card, so it needs its own
   line box rather than the inline-flex default's baseline alignment. */
.student-text .class-tags { margin: 2px 0; }
```

- [ ] **Step 4: Hold the filter's state**

In `src/components/AttendancePage.tsx`:

```tsx
  const [classFilter, setClassFilter] = useState<Speciality | 'all'>('all')
```

```tsx
  useEffect(() => { setSearch(''); setFilter('all'); setClassFilter('all') }, [selectedId, speciality])
```

```tsx
        classFilter={classFilter}
        onClassFilter={setClassFilter}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS and clean.

- [ ] **Step 6: Verify in the browser**

With the combined `AUT01 CR` 1MAUT + 1MESE session from Task 7 selected, at
375 × 812:
- The banner reads `AUT01 · Automation` with a `CR` badge and both tags.
- Every roster row carries its own class tag, and the two classes' students are
  both listed.
- The class select appears and filtering to `1MESE` leaves only that class's rows,
  while the footer count still reads "of N students" for the whole session.
- The stat grid totals do **not** change when the class filter changes — they
  describe the session, not the view.
- Select an older single-class session: no row tags, no class select.
- The history rows read `AUT01 · Automation` with `CR · 08:00 · Lab 04 · 1MAUT +
  1MESE` beneath.

At 1280 × 800 the history row is still a five-column table with nothing wrapping.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionSummary.tsx src/components/SessionHistory.tsx src/components/RosterList.tsx src/components/AttendancePage.tsx src/styles/roster.css
git commit -m "feat: show course code, type and class on the attendance screen"
```

---

### Task 10: Verification pass

No new behaviour. This task proves the nine before it, end to end, and is the one
place the whole feature is exercised as a teacher would use it.

**Files:** none modified unless a defect is found. A fix here gets its own commit
naming the defect.

- [ ] **Step 1: The suites and the build**

```bash
npm test
npm run build
```

Expected: every test passes — 50 from the mobile-first work, plus 21 from Task 1,
26 from Task 2 and 10 from Task 3 — and `tsc` is clean. Record the actual count;
a number lower than 107 means a file was not added.

- [ ] **Step 2: The entry chunk did not regress**

The mobile-first work left the entry chunk at 193.51 kB (59.67 kB gzipped) with
`html5-qrcode` isolated in a lazy chunk. Three screens and five components have
been added since.

```bash
npm run build 2>&1 | grep -E "dist/assets|gzip"
```

Expected: the entry chunk has grown by the new components only — well under
220 kB raw. Confirm no badge or scanner code has crept in:

```bash
grep -c "html5-qrcode\|qrcode.react" dist/assets/index-*.js
```

Expected: `0`.

- [ ] **Step 3: The five CSS invariants**

Each is a grep, and each exists because the restructure established it:

```bash
# 1. Mobile-first only: no max-width query outside the print block.
grep -rn "max-width" src/styles/*.css | grep -v "@media print"
# 2. No inherited-font-size hack; the clip utility replaced it.
grep -rn "font-size: 0" src/styles/
# 3. No remote stylesheet or font fetch.
grep -rn "@import url\|https://" src/styles/
# 4. Breakpoint literals only — the --bp-* tokens are documentation.
grep -rn "min-width: var(" src/styles/
# 5. No new dependency.
git diff main --stat -- package.json package-lock.json
```

Expected: 1, 2, 3 and 4 print nothing; 5 prints nothing. A `max-width` inside a
`.foo { max-width: … }` declaration is fine — only `@media (max-width: …)` is the
violation, so read any hit from 1 before acting on it.

- [ ] **Step 4: The whole flow on a phone**

At 375 × 812, from empty storage (`localStorage.clear()`, then reload), do the
thing the spec was written for:

1. Courses → add `AUT01` / `Industrial automation` / 1MAUT + 1MESE.
2. Courses → add `ESE02` / `Power electronics` / 1MESE.
3. Timetable → Sunday slot 1 → `AUT01`, CR, both classes, `Lab 04` → Save.
4. Timetable → Sunday slot 2 → `ESE02`, TP, 1MESE, `Lab 11` → Save.
5. Import a roster for 1MAUT and one for 1MESE (the modal's own CSV shape).
6. Timetable → tap Sunday slot 1 → *Start session* → mark three students, one
   absent.
7. Export the CSV. Open it: fifteen columns, every row carrying the student's own
   class, and the filename `AUT01-CR-<that Sunday>.csv`.
8. Back to Timetable → tap Sunday slot 1 again → *Open existing session*, not a
   second one.
9. Close the session; confirm the unchecked students become absent and the export
   shows `session-close` in the Method column.
10. Re-import 1MAUT with one student removed; confirm the open session's roster
    still contains both classes (the Task 3 defect fix) and the removed student is
    gone from the live list but kept in the stored roster as inactive.

- [ ] **Step 5: The grid at three widths**

375 × 812 → one day, six rows, day strip visible.
768 × 1024 → five columns, one time column, day strip gone, today's column teal.
1280 × 800 → same with more padding; sidebar lists Timetable, Attendance, Courses.

At each width: `document.body.scrollWidth === window.innerWidth`.

- [ ] **Step 6: Tap targets**

At 375 × 812, on the timetable and the assign sheet:

```js
[...document.querySelectorAll('button, select, input, a')]
  .map(el => ({ el: el.className || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
  .filter(item => item.h > 0 && item.h < 44)
```

Expected: `[]`. The known exceptions from the restructure — none remain on these
screens — would otherwise be listed here by name.

- [ ] **Step 7: The migration, on real legacy data**

The one path no test can fully stand in for, because it is about data written by
the previous version of the app. Seed a pre-timetable session and reload:

```js
localStorage.setItem('presence-attendance-v1', JSON.stringify([{
  id: 'legacy-1', speciality: '1MAUT', course: 'Automatique avancée',
  date: '2026-09-20', time: '08:00', room: '', teacher: '', state: 'closed',
  createdAt: '2026-09-20T08:00:00.000Z', rosterIds: [], entries: {},
}]))
```

Expected: the app loads, the session appears under 1MAUT, its banner shows only
the name with no badge, its history line has no code, and exporting it produces a
fifteen-column CSV with an empty `Course code` and `Type` and the filename
`automatique-avanc-e-session-2026-09-20.csv`. Nothing throws.

- [ ] **Step 8: Commit anything the pass fixed**

If every step passed, there is nothing to commit and the task is complete. If a
step failed, fix it, name the defect in the commit message, and re-run Steps 1–7
from the top rather than only the step that failed.

---

## Out of Scope

Carried from spec §11 so an executor does not add them helpfully:

- **Groups and sub-groups.** A TP cannot be split into halves — `Student` has no
  group field. The whole class is the session's roster.
- **More than one course in a cell.** `setEntry` replaces; that is the design.
- **Semester dates, holidays, odd/even weeks.** The timetable is one repeating
  week with no calendar behind it.
- **Teacher accounts.** `teacher` is a text field on a session, nothing more.
- **Auto-generated sessions.** A session exists only because someone tapped a cell
  or filled the ad-hoc form.
- **Room conflict checking.** Two cells may name the same room.

## Scope Fence

Spec §12. These paths are not touched by any task in this plan, and a diff that
includes them is wrong:

`web/`, `server/`, `scripts/`, `send.py`, `students.csv`, `generated/`,
`Listes 2627/`, `src/data/students.json`, `src/components/badges/`.

`.claude/` is untracked on purpose. Every commit above uses an explicit file
list — never `git add .` or `git add -A`.
