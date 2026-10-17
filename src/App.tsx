import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight, CalendarDays, CheckCircle2, Plus, Printer, QrCode, ScanLine, Users, X,
} from 'lucide-react'
import { AppShell, type Page } from './components/AppShell'
import { RosterList, type StatusFilter } from './components/RosterList'
import { SessionHistory } from './components/SessionHistory'
import { SessionSummary } from './components/SessionSummary'
import { SpecialityPicker } from './components/SpecialityPicker'
import { StatGrid } from './components/StatGrid'
import { getActiveRoster, specialities, type Speciality, type Student } from './roster'
import {
  closeSession, createSession, loadSessions, reopenSession, saveSessions, sessionStats,
  type AttendanceSession,
} from './sessions'
import { exportSessionCsv } from './csv'
import { BADGES_ENABLED } from './config'
import { localToday } from './format'

// Badge screens are dormant behind BADGES_ENABLED. Importing them lazily keeps
// qrcode.react and html5-qrcode out of the entry chunk entirely.
const BadgePage = lazy(() => import('./components/badges/BadgePage'))
const ScannerModal = lazy(() => import('./components/badges/ScannerModal'))

type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

function App() {
  const [sessions, setSessions] = useState<AttendanceSession[]>(loadSessions)
  const [speciality, setSpeciality] = useState<Speciality>('1MAUT')
  const [page, setPage] = useState<Page>('attendance')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [toast, setToast] = useState('')

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
  const classStudents = useMemo(() => getActiveRoster(speciality), [speciality])
  const classSessions = useMemo(() => sessions.filter(item => item.speciality === speciality)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sessions, speciality])
  const selectedSession = classSessions.find(item => item.id === selectedId) || null
  const counts = selectedSession ? sessionStats(selectedSession) : null
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

  return (
    <AppShell page={page} onPageChange={setPage} speciality={speciality}>
      <div className="page-title-row">
        <div><p className="eyebrow">{showBadges ? 'Identity cards' : 'Classroom attendance'}</p><h1>{showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1><p className="page-subtitle">{showBadges ? 'Print a unique badge for each student. Scan it during any course session.' : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p></div>
        {showBadges ? <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /> Print badges</button> : <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /> New session</button>}
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
            students={classStudents}
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
      {BADGES_ENABLED && scannerOpen && selectedSession && <Suspense fallback={null}><ScannerModal session={selectedSession} onClose={() => setScannerOpen(false)} onConfirm={student => markStudent(student, 'present', 'scan')} /></Suspense>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </AppShell>
  )
}

function CreateSessionModal({ speciality, onClose, onCreate }: { speciality: Speciality; onClose: () => void; onCreate: (details: SessionDetails) => void }) {
  const [course, setCourse] = useState('')
  const [date, setDate] = useState(localToday())
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [room, setRoom] = useState('')
  const [teacher, setTeacher] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!course.trim() || !date || !time) return
    onCreate({ speciality, course: course.trim(), date, time, room: room.trim(), teacher: teacher.trim() })
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-header"><div className="modal-icon"><CalendarDays size={23} /></div><button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button></div><h2 id="create-title">New course session</h2><p className="modal-subtitle">Set up attendance for {speciality}. Each student starts as not checked.</p><form onSubmit={submit}><label className="field"><span>Course name <b>*</b></span><input autoFocus required placeholder="e.g. Industrial automation" value={course} onChange={event => setCourse(event.target.value)} /></label><div className="field-row"><label className="field"><span>Date <b>*</b></span><input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label className="field"><span>Start time <b>*</b></span><input type="time" required value={time} onChange={event => setTime(event.target.value)} /></label></div><div className="field-row"><label className="field"><span>Room</span><input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} /></label><label className="field"><span>Teacher</span><input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} /></label></div><div className="modal-note"><Users size={18} /><span>{getActiveRoster(speciality).length} students from the {speciality} roster will be included.</span></div><div className="modal-actions"><button type="button" className="button button-light" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Start session <ArrowRight size={17} /></button></div></form></div></div>
}

export default App
