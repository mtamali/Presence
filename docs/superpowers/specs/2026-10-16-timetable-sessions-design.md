# Course Identity, Session Types, and the Weekly Timetable — Design

**Date:** 2026-10-16
**Status:** Approved
**Supersedes:** nothing. **Depends on:** `docs/superpowers/specs/2026-10-16-mobile-first-redesign-design.md` (this work lands after that plan's Tasks 9–14 complete).

## 1. Goal

A course session must say *which course* (by code and name) and *which kind of
teaching* it is — CR, TD, or TP. The teacher's week repeats identically, so the
recurring pattern is entered once as a grid of weekday × time-slot, and tapping a
filled cell opens that session's attendance in one confirmation.

## 2. Vocabulary

| Code | French | English |
|------|--------|---------|
| `CR` | Cours | Lecture / theory session |
| `TD` | Travaux Dirigés | Guided works |
| `TP` | Travaux Pratiques | Practical session |

A **course** is a unit of teaching with a stable CODE and a name. The same course
produces CR, TD and TP sessions. A **timetable entry** (a filled grid cell) is a
recurring weekly commitment: one course, one type, one or more specialities, one
room. An **attendance session** is a single dated occurrence.

## 3. The slot schedule

Six slots per day, starting at 08:00, each 1h30 long, separated by a 10-minute
break. This is a frozen constant, computed nowhere else:

| Slot | Start | End |
|------|-------|-----|
| 1 | 08:00 | 09:30 |
| 2 | 09:40 | 11:10 |
| 3 | 11:20 | 12:50 |
| 4 | 13:00 | 14:30 |
| 5 | 14:40 | 16:10 |
| 6 | 16:20 | 17:50 |

Teaching days are **Sunday through Thursday**. `DayIndex` is `0`–`4` and is
deliberately identical to JavaScript's `Date.prototype.getDay()` for those days,
so "today" is `new Date().getDay()` whenever that value is `≤ 4`. On Friday
(`5`) and Saturday (`6`) no day is highlighted and the grid opens on Sunday.

There are no semester dates and no odd/even-week variants: the user's
requirement is "each week it's the same".

## 4. Data model

### 4.1 `src/courses.ts` (new)

```ts
export type Course = {
  code: string                 // normalised: trimmed, uppercased
  name: string
  specialities: Speciality[]   // which classes study this course; at least one
}
```

The course list is **global**, not per-speciality; `specialities` is what lets the
Courses screen filter by the active speciality picker while a single course still
serves all three classes. A code is **globally unique** — `AUT01` is `AUT01`
whichever class takes it.

Exports: `COURSE_STORAGE_KEY = 'presence-courses-v1'`, `loadCourses()`,
`saveCourses(courses)`, `normalizeCode(value)`, `coursesFor(speciality, courses)`,
`findCourse(code, courses)`, `validateCourse(draft, courses)`,
`upsertCourse(course, courses)`, `removeCourse(code, courses)`.

**Validation is separate from mutation, and nothing throws.**
`validateCourse(draft, courses)` returns an error message string, or `undefined`
when the draft is valid. `upsertCourse` and `removeCourse` are pure list
transforms that assume a validated input: `upsertCourse` replaces the course
whose normalised code matches, or appends; `removeCourse` removes by normalised
code and performs **no** reference check of its own (§6.5 owns that guard).

There is no seed file — the list starts empty and the teacher fills it.

### 4.2 `src/timetable.ts` (new)

```ts
export type SessionType = 'CR' | 'TD' | 'TP'
export type DayIndex = 0 | 1 | 2 | 3 | 4
export type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6

export type Slot = { index: SlotIndex; start: string; end: string }

export type TimetableEntry = {
  day: DayIndex
  slot: SlotIndex
  courseCode: string
  type: SessionType
  specialities: Speciality[]   // one or more — the shared-lecture case
  room: string                 // may be empty
}
```

Exports: `DAYS` (`['Sunday', …, 'Thursday']`), `SLOTS` (the six rows of §3),
`SESSION_TYPES` (`['CR', 'TD', 'TP']`), `TIMETABLE_STORAGE_KEY =
'presence-timetable-v1'`, `loadTimetable()`, `saveTimetable(entries)`,
`entryAt(day, slot, entries)`, `validateEntry(draft, courses)`,
`setEntry(entry, entries)`, `clearEntry(day, slot, entries)`,
`entriesForDay(day, entries)`, `cellsUsingCourse(code, entries)`,
`dateForDayInCurrentWeek(day, today)`.

As in `courses.ts`, `validateEntry` returns an error message or `undefined`, and
`setEntry` / `clearEntry` are pure transforms that never throw.

**One entry per cell.** `setEntry` replaces whatever occupies `day`/`slot`. The
store is an array persisted as JSON; `entryAt` is the single lookup path. This
makes double-booking the teacher structurally impossible, which matches reality:
one person cannot be in two rooms at 08:00.

`dateForDayInCurrentWeek(day, today)` returns a `YYYY-MM-DD` string. The week
starts on Sunday, so the current week's Sunday is `today` minus `today.getDay()`
days, and the result is that Sunday plus `day` days. Tapping Tuesday's cell on a
Saturday therefore yields the Tuesday that has just passed; the confirmation
sheet lets the teacher change it.

### 4.3 `src/sessions.ts` (modified)

```ts
export type AttendanceSession = {
  id: string
  specialities: Speciality[]          // CHANGED from `speciality: Speciality`
  courseCode: string                  // NEW — snapshot; '' for legacy sessions
  course: string                      // course NAME, snapshot (was free text)
  type?: SessionType                  // NEW — see §5.2 on why it is optional
  origin?: { day: DayIndex; slot: SlotIndex }  // NEW — absent for ad-hoc sessions
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
```

A shared lecture is **one session with a combined roster**, not three parallel
sessions. The teacher marks every class in a single list, and it exports as one
file. The alternative — three sessions linked by a group id — delivers identical
UX for strictly more plumbing, and was rejected.

`createSession` builds `rosterIds` as the union of `getActiveRoster()` across the
session's specialities, ordered by the canonical `specialities` order of the
session and, within each, by existing roster order. The ordering is deterministic
so the CSV is stable.

Course **code and name are snapshotted into the session**, exactly as `rosterIds`
already snapshots membership. Renaming or deleting a course cannot retroactively
rewrite a closed session.

New export: `sessionForCell(day, slot, date, sessions)` returns the existing
session whose `origin` matches that cell on that date, or `undefined`. This is
what makes cell-tapping idempotent.

## 5. Storage and migration

### 5.1 Keys

| Key | Owner | Change |
|-----|-------|--------|
| `presence-roster-v1` | `roster.ts` | untouched |
| `presence-attendance-v1` | `sessions.ts` | **kept** — migrated in place |
| `presence-courses-v1` | `courses.ts` | new |
| `presence-timetable-v1` | `timetable.ts` | new |

### 5.2 Migrating existing sessions

No storage-key bump and no data loss. The existing `backfill()` function in
`sessions.ts` — already responsible for reconstructing `rosterIds` on sessions
written before that field existed — gains the same duty for the new fields:

- `specialities` missing → `[session.speciality]`, and the legacy `speciality`
  property is dropped from the returned object.
- `courseCode` missing → `''`.
- `type` missing → left **absent**.

`type` is optional on the stored shape even though every form requires it.
Sessions recorded before this feature never had a teaching type, and inventing
one would be fabricating data. They render as `—` and export an empty `Type`
cell. This is the same reasoning that retained `method: 'scan'` in the
`AttendanceEntry` union for historical entries.

`courseCode` is a required `string` rather than optional because `''` is a
truthful value — "no code was recorded" — and it keeps every consumer free of a
second undefined check.

## 6. Screens and flows

### 6.1 Navigation

The nav gains **Timetable** and **Courses**. The phone bottom tab bar is
Attendance · Timetable · Courses; the desktop sidebar is the same three. Badges
remains dormant behind `BADGES_ENABLED` and is unaffected.

The speciality picker is **hidden on the Timetable screen** — the grid is global
and spans all three classes — and **active on Courses and Attendance**, which are
both scoped to one class at a time.

Throughout this document a **class tag** is the speciality's short name rendered
as a chip: `1MAUT`, `1MESE`, `4IGEI`.

### 6.2 Timetable screen

Opens on today's day (§3). This supplies the one-tap "what am I teaching now"
path without a separate Today screen.

| Viewport | Layout |
|----------|--------|
| Base (phone) | Day chips `Sun Mon Tue Wed Thu`, then a **vertical list of that day's six slots**. Each row is full-width, so the 44 px minimum touch target is met without special sizing. |
| ≥ 48rem | The **5 × 6 grid** — days as columns, slots as rows — with today's column highlighted. |

What a filled cell shows depends on the room it has:

- **Phone list row** (full width): course code, course name, CR/TD/TP badge,
  class tags, room.
- **Grid cell** (≥ 48rem, narrow column): course code, CR/TD/TP badge, class
  tags. The name and room are omitted and revealed on tap — a 5-column cell
  cannot carry five pieces of text legibly.

An empty cell or row shows its time range and an *Assign* affordance.

### 6.3 Assign sheet — empty cell, or Edit on a filled one

Fields: course picker, CR/TD/TP segmented control, speciality chips, room.

The course picker is a native `<select>` listing **every** course as
`CODE — Name` — not filtered by the speciality picker, which is hidden here
(§6.1). A native select gives the platform's own wheel on a phone for free. When
no courses exist yet, the sheet replaces the picker with a short message and a
button that navigates to the Courses screen; there is no inline course creation.

Choosing a course **pre-fills the speciality chips from that course's own
`specialities`**, which the teacher may then narrow — so a lecture shared by all
three classes is one tap, not three. The pre-fill is guidance only: an entry's
specialities are not constrained to be a subset of the course's, because a class
may join a course mid-year.

Actions: *Save*, *Clear cell* (only on a filled cell), *Cancel*.

### 6.4 Start-attendance sheet — filled cell

Shows course code · name, the type badge, class tags, room, date (defaulting per
§4.2), start time (defaulting to the slot's start), teacher, and the **combined**
active-student count across the cell's specialities.

The teacher field defaults to the `teacher` value of the most recently created
session, or empty when there is none.

If `sessionForCell` finds a session for that cell and date, the sheet says so and
the primary button becomes *Open existing session*. A mis-tap on a phone can
therefore never create a duplicate session.

Confirming creates the session and navigates to Attendance with it selected.

### 6.5 Courses screen

Lists the courses whose `specialities` include the active speciality: code, name,
class tags. Add, edit, delete.

Deleting a course still referenced by a timetable cell is **blocked**. The screen
composes the guard itself — it calls `cellsUsingCourse(code, entries)` and, when
the result is non-empty, shows a message naming those cells (day and slot) and
does not call `removeCourse`. Orphaning a cell would leave a grid entry pointing
at nothing. Closed sessions are never at risk, because code and name are
snapshotted (§4.3).

### 6.6 Attendance screen

The session header shows `CODE · Name`, a CR/TD/TP badge, and class tags.

When a session spans more than one speciality, every student row carries a class
tag and the status filter chips gain one chip per speciality in the session.

A combined session appears under **all** of its specialities in the speciality
picker — the filter becomes `session.specialities.includes(speciality)` — and
always renders its **whole** roster. Showing only the picked class would make the
present/absent/total counts disagree with the header.

### 6.7 The "New course session" modal

Keeps date, start time, room and teacher. "Course name" becomes the course picker
plus the CR/TD/TP control plus speciality chips. A session created here has no
`origin`, which is precisely what marks it ad-hoc — a make-up class, a catch-up,
or an exam outside the weekly pattern.

## 7. CSV export

Fifteen columns:

```
Speciality, Course code, Course, Type, Date, Time, Room, Teacher,
Student ID, Last name, First name, Email, Status, Checked at, Method
```

`Speciality` is now **the student's** class, not the session's. For a shared
lecture that distinction is the whole value of a combined export.

`buildSessionCsv` builds its id → student map from the union of
`getRoster(speciality)` across `session.specialities`, so every row resolves.
The BOM, the formula-injection guard, the doubled-quote escaping and the CRLF
line endings are unchanged.

Filenames become `<code>-<type>-<date>.csv`, e.g. `AUT01-CR-2026-10-18.csv`.
When `courseCode` is empty the sanitised course name is used in its place, and
when `type` is absent the literal `session` is used — so a legacy session still
exports under a usable filename.

## 8. Validation rules

**Course**
- `code`: non-empty after trim and uppercase; at most 16 characters; matching
  `/^[A-Z0-9][A-Z0-9_-]*$/`; unique across the list (comparing normalised
  codes). A duplicate is rejected. The charset is restricted so a code can go
  straight into an export filename (§7) without further sanitising.
- `name`: non-empty after trim.
- `specialities`: at least one.

**Timetable entry**
- `day` in `0..4`; `slot` in `1..6`.
- `courseCode` must resolve to an existing course.
- `type` must be one of `CR`, `TD`, `TP`.
- `specialities`: at least one.

**Session creation**
- From a cell: all fields derive from the entry, so only date and time are
  user-editable and both are required.
- From the modal: course, type, at least one speciality, date and time required;
  room and teacher optional.

`validateCourse` and `validateEntry` return an error message string, or
`undefined` when valid. Forms call them on change, show the message inline, and
disable submit while one is present. Nothing throws into the render path, and the
mutation functions do not re-validate (§4.1).

## 9. Testing

Vitest, following the existing pure-function pattern. No new dependencies.

**`src/timetable.test.ts` (new)**
- `SLOTS` has exactly six entries with the exact start/end strings of §3.
- `setEntry` on an occupied cell replaces rather than appends.
- `clearEntry` removes only the targeted cell.
- `entryAt` returns `undefined` for an empty cell.
- `entriesForDay` returns that day's entries ordered by slot.
- `cellsUsingCourse` finds every referencing cell.
- `validateEntry` returns a message for an out-of-range day, an out-of-range
  slot, an unknown course code, an empty speciality list, and an invalid type;
  and `undefined` for a valid draft.
- `dateForDayInCurrentWeek` returns the right date from a Sunday, a mid-week day,
  and a Saturday, including across a month boundary.
- `loadTimetable` returns `[]` for absent, malformed, and non-array stored values.

**`src/courses.test.ts` (new)**
- `normalizeCode` trims and uppercases.
- `validateCourse` returns a message for an empty code, an over-long code, a code
  with illegal characters, an empty name, an empty speciality list, and a
  duplicate code; and `undefined` for a valid draft. Re-saving a course under its
  own code is **not** a duplicate.
- `upsertCourse` appends a new course and updates in place when the normalised
  code matches an existing one.
- `coursesFor` filters by speciality.
- `removeCourse` removes by normalised code.
- `loadCourses` returns `[]` for absent, malformed, and non-array stored values.

**`src/sessions.test.ts` (extended)**
- `createSession` with three specialities snapshots the union of their active
  rosters, in deterministic order.
- `sessionStats` counts across the combined roster.
- `backfill` converts a legacy `speciality` session to `specialities`, defaults
  `courseCode` to `''`, and leaves `type` absent.
- `sessionForCell` matches on day, slot and date, and ignores ad-hoc sessions.

**`src/csv.test.ts` (extended)**
- The header is the fifteen columns of §7 in that order.
- Each row carries the **student's** speciality.
- A three-speciality session resolves every student.
- A legacy session exports an empty `Type` cell and still produces a filename.

## 10. Sequencing

This work begins **after** Tasks 9–14 of the mobile-first plan are complete. The
grid is a dense new screen that depends on the `src/styles/*.css` modules and the
`AppShell` those tasks produce; building it against today's desktop-first
stylesheet would mean building it twice.

One accepted cost: Task 13 extracts `CreateSessionModal` as it stands today, and
this work then rewrites its body per §6.7. That is recorded in the SDD ledger so
it is not later mistaken for churn.

Task 7 of the mobile-first plan — the roster import, still blocked on the
teacher's Student ID / name / email list — is independent of this design.

## 11. Out of scope

- Groups or sub-groups within a class. The `Student` model has no group field,
  so a TP cannot be split across half the class; every session uses the full
  active roster of its specialities.
- Multiple courses in one cell. One cell is one course, per the requirement "A
  Course can be given to the 3 specialties in the same Cell".
- Semester start/end dates, holidays, odd/even weeks, or any exception to the
  repeating pattern.
- Teacher accounts or multi-teacher timetables. The app remains single-user
  localStorage; `teacher` stays a free-text field on the session.
- Auto-generating sessions for unattended weeks. Sessions exist only where the
  teacher confirmed one.
- Room availability or conflict checking beyond one-entry-per-cell.

## 12. Scope fence

Unchanged by this work: `web/`, `server/`, `scripts/`, `send.py`,
`students.csv`, `generated/`, `Listes 2627/`, `src/data/students.json`, and the
dormant badge components under `src/components/badges/`.
