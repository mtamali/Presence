import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Printer, Upload, X } from 'lucide-react'
import { AppShell, pageCopy, type Page } from './components/AppShell'
import { AnalyticsPage } from './components/AnalyticsPage'
import { AttendancePage } from './components/AttendancePage'
import { CoursesPage } from './components/CoursesPage'
import { HomePage } from './components/HomePage'
import { ManageStudentsPage } from './components/ManageStudentsPage'
import { TimetablePage } from './components/TimetablePage'
import { SpecialityPicker } from './components/SpecialityPicker'
import { CreateSessionModal } from './components/modals/CreateSessionModal'
import { ImportRosterModal } from './components/modals/ImportRosterModal'
import { getRoster, ROSTER_STORAGE_KEY, saveRoster, specialities, type Speciality, type Student } from './roster'
import {
  activeRosterIds, createSession, loadSessions, saveSessions, SESSION_STORAGE_KEY, sessionStats,
  type AttendanceSession, type SessionDetails,
} from './sessions'
import { COURSE_STORAGE_KEY, loadCourses, saveCourses, type Course } from './courses'
import { loadTimetable, saveTimetable, TIMETABLE_STORAGE_KEY, type TimetableEntry } from './timetable'
import { BADGES_ENABLED } from './config'
import { useNativeShell } from './native/shell'

// Badge screens are dormant behind BADGES_ENABLED. Importing them lazily keeps
// qrcode.react and html5-qrcode out of the entry chunk entirely.
const BadgePage = lazy(() => import('./components/badges/BadgePage'))

function App() {
  const [sessions, setSessions] = useState<AttendanceSession[]>(loadSessions)
  const [courses, setCourses] = useState<Course[]>(loadCourses)
  // Held here, not in TimetablePage, because the Courses screen reads it too —
  // it refuses to delete a course a cell still points at.
  const [entries, setEntries] = useState<TimetableEntry[]>(loadTimetable)
  const [speciality, setSpeciality] = useState<Speciality>('1MAUT')
  // Every launch lands on Today: the teaching day, and one tap into each of its
  // sessions. The timetable is a week at a time and stays one tap away.
  const [page, setPage] = useState<Page>('home')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState('')
  // The roster lives in localStorage, outside React. An import bumps this so
  // the memos below re-read it.
  const [rosterVersion, setRosterVersion] = useState(0)
  /**
   * The store that last refused a write, and what to tell the teacher. Tracked
   * per key because the quota is per origin while the payloads are not: a
   * multi-megabyte sessions write can fail in the same breath that a
   * two-hundred-byte courses write succeeds, and clearing on the small one
   * would hide the failure that matters. Unlike a toast this does not expire —
   * it stays until that same store writes cleanly again, because for as long
   * as it is true, everything on screen is unsaved.
   */
  const [storageError, setStorageError] = useState<{ key: string; message: string } | null>(null)

  function trackWrite(key: string, message: string | undefined) {
    setStorageError(current => message ? { key, message } : current?.key === key ? null : current)
  }

  // Persistence stays a side effect of state so that every mutation path, present
  // and future, is covered without having to remember to save. What changed is
  // that these writes report failure rather than throwing it into the commit
  // phase, where it used to unmount the app.
  useEffect(() => trackWrite(SESSION_STORAGE_KEY, saveSessions(sessions)), [sessions])
  useEffect(() => trackWrite(COURSE_STORAGE_KEY, saveCourses(courses)), [courses])
  useEffect(() => trackWrite(TIMETABLE_STORAGE_KEY, saveTimetable(entries)), [entries])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Status bar and the Android back button. No-op outside the APK.
  useNativeShell(page, () => setPage('home'))

  // With badges retired the flag pins this to false, but the branch is kept so
  // flipping BADGES_ENABLED restores the screen without further edits.
  const showBadges = BADGES_ENABLED && page === 'badges'
  // Home has no shared title row — it carries its own hero — so it has no entry
  // in pageCopy, and this ternary is what narrows `page` past that.
  const copy = page === 'home' ? undefined : pageCopy[page]
  // Inactive students are kept for the import merge and for past sessions, but
  // never offered for marking.
  const storedRoster = useMemo(() => getRoster(speciality), [speciality, rosterVersion])
  const allStudents = useMemo(() => specialities.flatMap(item => getRoster(item.id)), [rosterVersion])
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

  // Declared after classSessions because it reads it.
  useEffect(() => {
    // Keep the selection when it belongs to the class being switched to; this
    // also means switching away and back returns you to where you were.
    setSelectedId(current => classSessions.some(item => item.id === current)
      ? current
      : classSessions[0]?.id || null)
    // The class switch otherwise chooses that class's most recent session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciality])

  function replaceSession(updated: AttendanceSession) {
    setSessions(current => current.map(item => item.id === updated.id ? updated : item))
  }

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

  function handleCreate(details: SessionDetails) {
    const session = createSession(details)
    setSessions(current => [session, ...current])
    setCreateOpen(false)
    // Via openSession, so an ad-hoc 4IGEI session created while the picker
    // sits on 1MAUT lands on a screen that actually lists it.
    openSession(session)
    setToast(`${session.course} session started.`)
  }

  function handleRosterChange(students: Student[], message: string) {
    // Called straight from the handler rather than an effect, because the roster
    // lives outside React state — so this is the one write that has to report
    // itself here.
    trackWrite(ROSTER_STORAGE_KEY, saveRoster(speciality, students))
    // Open sessions are still being taken, so they follow the new class list.
    // Closed ones are a record of who was expected that day and never move.
    // Each one re-snapshots across *its own* classes: using only the imported
    // speciality's ids would silently shrink a shared lecture to one class.
    setSessions(current => current.map(item => item.specialities.includes(speciality) && item.state === 'open'
      ? { ...item, rosterIds: activeRosterIds(item.specialities) }
      : item))
    setRosterVersion(version => version + 1)
    setToast(message)
  }

  function handleImport(students: Student[]) {
    handleRosterChange(students, `${speciality} roster updated — ${students.filter(student => student.active).length} active students.`)
    setImportOpen(false)
  }

  return (
    <AppShell page={page} onPageChange={setPage} speciality={speciality}>
      {copy && <div className="page-title-row">
        <div>
          {/* The fifth page is what tipped these three from ternaries into the
              Record beside `destinations`, as the note here used to predict. */}
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="page-subtitle">{copy.subtitle}</p>
        </div>
        {showBadges && <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /><span className="page-action-label">Print badges</span></button>}
        {page === 'attendance' && <div className="page-actions">
            {/* The roster is per class and must be reachable with no session
                selected, so it lives beside the title, not in the roster panel.
                The labels are clipped on phone, not dropped — they are each
                button's only accessible name. */}
            <button className="button button-light page-action" onClick={() => setImportOpen(true)}><Upload size={19} /><span className="page-action-label">Import roster</span></button>
            <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /><span className="page-action-label">New session</span></button>
          </div>}
      </div>}

      {/* Hidden on the timetable, analytics and home: all three show every class
          at once, so a class filter there would promise filtering it does not
          do. Analytics carries its own filter, inside the one list that needs
          it, and home is scoped to the day rather than to a class. */}
      {page !== 'home' && page !== 'timetable' && page !== 'analytics' && <SpecialityPicker speciality={speciality} onChange={setSpeciality} progress={showBadges ? undefined : progress} />}

      {page === 'home' && <HomePage
        entries={entries}
        courses={courses}
        sessions={sessions}
        onStart={startFromCell}
        onOpenSession={openSession}
        onGo={setPage}
      />}

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

      {showBadges && <Suspense fallback={null}><BadgePage speciality={speciality} students={classStudents} /></Suspense>}

      {/* Every session, not `classSessions`: this screen compares the classes
          against each other, so narrowing it to one would empty three of its
          four views. */}
      {page === 'analytics' && <AnalyticsPage sessions={sessions} rosterVersion={rosterVersion} onToast={setToast} />}

      {page === 'courses' && <CoursesPage
        speciality={speciality}
        courses={courses}
        entries={entries}
        onChange={setCourses}
        onToast={setToast}
      />}

      {page === 'students' && <ManageStudentsPage
        speciality={speciality}
        students={storedRoster}
        allStudents={allStudents}
        onChange={handleRosterChange}
        onImportOpen={() => setImportOpen(true)}
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

      {createOpen && <CreateSessionModal
        speciality={speciality}
        courses={courses}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onGoToCourses={() => { setCreateOpen(false); setPage('courses') }}
      />}
      {importOpen && <ImportRosterModal speciality={speciality} currentRoster={storedRoster} onClose={() => setImportOpen(false)} onApply={handleImport} />}
      {/* Sits above the toast and outlives it. A success toast fades after four
          seconds; "nothing is being saved" stays true until it is dealt with, and
          it has to contradict the toast that just said the mark was recorded.
          Dismissing it is safe — the next failed write puts it straight back. */}
      {storageError && <div className="storage-alert" role="alert">
        <AlertTriangle size={19} />
        <p>{storageError.message}</p>
        <button onClick={() => setStorageError(null)} aria-label="Dismiss storage warning"><X size={16} /></button>
      </div>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </AppShell>
  )
}

export default App
