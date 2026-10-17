import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Printer, QrCode, ScanLine, Upload, X } from 'lucide-react'
import { AppShell, type Page } from './components/AppShell'
import { RosterList, type StatusFilter } from './components/RosterList'
import { SessionHistory } from './components/SessionHistory'
import { SessionSummary } from './components/SessionSummary'
import { SpecialityPicker } from './components/SpecialityPicker'
import { StatGrid } from './components/StatGrid'
import { CreateSessionModal, type SessionDetails } from './components/modals/CreateSessionModal'
import { ImportRosterModal } from './components/modals/ImportRosterModal'
import { getRoster, saveRoster, specialities, type Speciality, type Student } from './roster'
import {
  closeSession, createSession, loadSessions, reopenSession, saveSessions, sessionStats,
  type AttendanceSession,
} from './sessions'
import { exportSessionCsv } from './csv'
import { BADGES_ENABLED } from './config'

// Badge screens are dormant behind BADGES_ENABLED. Importing them lazily keeps
// qrcode.react and html5-qrcode out of the entry chunk entirely.
const BadgePage = lazy(() => import('./components/badges/BadgePage'))
const ScannerModal = lazy(() => import('./components/badges/ScannerModal'))

function App() {
  const [sessions, setSessions] = useState<AttendanceSession[]>(loadSessions)
  const [speciality, setSpeciality] = useState<Speciality>('1MAUT')
  const [page, setPage] = useState<Page>('attendance')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [toast, setToast] = useState('')
  // The roster lives in localStorage, outside React. An import bumps this so
  // the memos below re-read it.
  const [rosterVersion, setRosterVersion] = useState(0)

  useEffect(() => saveSessions(sessions), [sessions])
  useEffect(() => {
    setSelectedId(sessions.filter(item => item.speciality === speciality).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id || null)
    setSearch('')
    setFilter('all')
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
  const classSessions = useMemo(() => sessions.filter(item => item.speciality === speciality)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sessions, speciality])
  const selectedSession = classSessions.find(item => item.id === selectedId) || null
  const counts = selectedSession ? sessionStats(selectedSession) : null
  // Who the roster panel lists. It follows the session's own membership rather
  // than the live class, so the rows, the stat totals and the CSV export all
  // describe the same set of students even after a roster import.
  const sessionRoster = useMemo(() => {
    if (!selectedSession) return []
    const byId = new Map(storedRoster.map(student => [student.id, student]))
    return selectedSession.rosterIds
      .map(id => byId.get(id))
      .filter((student): student is Student => Boolean(student))
  }, [selectedSession, storedRoster])
  const specialityName = specialities.find(item => item.id === speciality)!.name
  // Attendance of each class's latest session, drawn as the bar across the
  // bottom of its card. A class with no session yet gets no bar.
  const progress = useMemo(() => {
    const shares: Partial<Record<Speciality, number>> = {}
    for (const item of specialities) {
      const latest = sessions.filter(session => session.speciality === item.id)
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

  function markStudent(student: Student, status: 'present' | 'absent', method: 'scan' | 'manual') {
    if (!selectedSession || selectedSession.state !== 'open') return
    replaceSession({
      ...selectedSession,
      entries: {
        ...selectedSession.entries,
        [student.id]: { status, at: new Date().toISOString(), method },
      },
    })
    setToast(`${student.firstName} ${student.lastName} marked ${status}.`)
  }

  function handleCreate(details: SessionDetails) {
    const session = createSession(details)
    setSessions(current => [session, ...current])
    setSelectedId(session.id)
    setCreateOpen(false)
    setPage('attendance')
    setToast(`${session.course} session started.`)
  }

  function handleClose() {
    if (!selectedSession || selectedSession.state === 'closed') return
    if (!window.confirm(`Close this session? ${counts?.unchecked || 0} unchecked students will be marked absent.`)) return
    replaceSession(closeSession(selectedSession))
    setToast('Session closed. Unchecked students were marked absent.')
  }

  function handleReopen() {
    if (!selectedSession || selectedSession.state !== 'closed') return
    replaceSession(reopenSession(selectedSession))
    setToast('Session reopened. Automatically marked absences are now unchecked.')
  }

  function handleImport(students: Student[]) {
    saveRoster(speciality, students)
    const activeIds = students.filter(student => student.active).map(student => student.id)
    // Open sessions are still being taken, so they follow the new class list.
    // Closed ones are a record of who was expected that day and never move —
    // their totals and CSV export stay exactly as they were.
    setSessions(current => current.map(item => item.speciality === speciality && item.state === 'open'
      ? { ...item, rosterIds: activeIds }
      : item))
    setRosterVersion(version => version + 1)
    setImportOpen(false)
    setToast(`${speciality} roster updated — ${activeIds.length} active students.`)
  }

  return (
    <AppShell page={page} onPageChange={setPage} speciality={speciality}>
      <div className="page-title-row">
        <div><p className="eyebrow">{showBadges ? 'Identity cards' : 'Classroom attendance'}</p><h1>{showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1><p className="page-subtitle">{showBadges ? 'Print a unique badge for each student. Scan it during any course session.' : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p></div>
        {showBadges
          ? <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /> Print badges</button>
          : <div className="page-actions">
            {/* The roster is per class and must be reachable with no session
                selected, so it lives beside the title, not in the roster panel. */}
            <button className="button button-light page-action" onClick={() => setImportOpen(true)}><Upload size={19} /> Import roster</button>
            <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /> New session</button>
          </div>}
      </div>

      <SpecialityPicker speciality={speciality} onChange={setSpeciality} progress={showBadges ? undefined : progress} />

      {!showBadges ? <>
        <div className="section-heading"><div><p className="eyebrow small">{speciality} · {specialityName}</p><h2>Course sessions</h2></div><span className="section-meta">{classSessions.length} {classSessions.length === 1 ? 'session' : 'sessions'}</span></div>
        {selectedSession ? <>
          <SessionSummary
            session={selectedSession}
            onReopen={handleReopen}
            onExport={() => exportSessionCsv(selectedSession)}
            onScan={() => setScannerOpen(true)}
          />
          <StatGrid stats={counts!} />
          <RosterList
            session={selectedSession}
            students={sessionRoster}
            search={search}
            filter={filter}
            onSearch={setSearch}
            onFilter={setFilter}
            onMark={(student, status) => markStudent(student, status, 'manual')}
            onCloseSession={handleClose}
          />
        </> : <div className="empty-session"><div className="empty-illustration"><QrCode size={46} /><span><ScanLine size={25} /></span></div><h3>No course session yet</h3><p>Start a session for {speciality}. You can then mark each student present or absent as they arrive.</p><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Create first session</button></div>}
        {classSessions.length > 0 && <SessionHistory
          sessions={classSessions}
          selectedId={selectedId}
          onSelect={id => { setSelectedId(id); setSearch(''); setFilter('all') }}
        />}
      </> : <Suspense fallback={null}><BadgePage speciality={speciality} students={classStudents} /></Suspense>}
      {createOpen && <CreateSessionModal speciality={speciality} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {importOpen && <ImportRosterModal speciality={speciality} currentRoster={storedRoster} onClose={() => setImportOpen(false)} onApply={handleImport} />}
      {BADGES_ENABLED && scannerOpen && selectedSession && <Suspense fallback={null}><ScannerModal session={selectedSession} onClose={() => setScannerOpen(false)} onConfirm={student => markStudent(student, 'present', 'scan')} /></Suspense>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </AppShell>
  )
}

export default App
