import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Printer, Upload, X } from 'lucide-react'
import { AppShell, type Page } from './components/AppShell'
import { AttendancePage } from './components/AttendancePage'
import { CoursesPage } from './components/CoursesPage'
import { TimetablePage } from './components/TimetablePage'
import { SpecialityPicker } from './components/SpecialityPicker'
import { CreateSessionModal } from './components/modals/CreateSessionModal'
import { ImportRosterModal } from './components/modals/ImportRosterModal'
import { getRoster, saveRoster, specialities, type Speciality, type Student } from './roster'
import {
  activeRosterIds, createSession, loadSessions, saveSessions, sessionStats,
  type AttendanceSession, type SessionDetails,
} from './sessions'
import { loadCourses, saveCourses, type Course } from './courses'
import { loadTimetable, saveTimetable, type TimetableEntry } from './timetable'
import { BADGES_ENABLED } from './config'

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
  // The timetable is where a teaching day starts, and attendance is one tap away.
  const [page, setPage] = useState<Page>('timetable')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState('')
  // The roster lives in localStorage, outside React. An import bumps this so
  // the memos below re-read it.
  const [rosterVersion, setRosterVersion] = useState(0)

  useEffect(() => saveSessions(sessions), [sessions])
  useEffect(() => saveCourses(courses), [courses])
  useEffect(() => saveTimetable(entries), [entries])
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
          <p className="eyebrow">{page === 'timetable' ? 'Weekly schedule' : page === 'courses' ? 'Course catalogue' : showBadges ? 'Identity cards' : 'Classroom attendance'}</p>
          <h1>{page === 'timetable' ? 'Your week, slot by slot.' : page === 'courses' ? 'The courses you teach.' : showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1>
          {/* Four deep and at its limit. A fifth page moves this copy into a
              Record<Page, …> beside `destinations`; with four that would cost
              more indirection than it saves. */}
          <p className="page-subtitle">{page === 'timetable'
            ? 'Six slots a day, Sunday to Thursday. Assign a course to a cell once and it repeats every week.'
            : page === 'courses'
              ? 'Give each course a code and the classes it is taught to. The timetable and every export use that code.'
              : showBadges
                ? 'Print a unique badge for each student. Scan it during any course session.'
                : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p>
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
      </div>

      {/* Hidden on the timetable: that grid is global, so a class filter there
          would promise filtering it does not do. */}
      {page !== 'timetable' && <SpecialityPicker speciality={speciality} onChange={setSpeciality} progress={showBadges ? undefined : progress} />}

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

      {createOpen && <CreateSessionModal speciality={speciality} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {importOpen && <ImportRosterModal speciality={speciality} currentRoster={storedRoster} onClose={() => setImportOpen(false)} onApply={handleImport} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </AppShell>
  )
}

export default App
