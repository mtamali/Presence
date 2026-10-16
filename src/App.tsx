import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, Clock3, Download, FileText, GraduationCap, LayoutGrid,
  LockKeyhole, MapPin, MoreHorizontal, Plus, Printer, QrCode, RotateCcw,
  ScanLine, Search, ShieldCheck, Users, X,
} from 'lucide-react'
import { getActiveRoster, specialities, type Speciality, type Student } from './roster'
import {
  closeSession, createSession, loadSessions, reopenSession, saveSessions, sessionStats,
  type AttendanceSession,
} from './sessions'
import { exportSessionCsv } from './csv'
import { BADGES_ENABLED } from './config'
import { formatDate, localToday } from './format'

// Badge screens are dormant behind BADGES_ENABLED. Importing them lazily keeps
// qrcode.react and html5-qrcode out of the entry chunk entirely.
const BadgePage = lazy(() => import('./components/badges/BadgePage'))
const ScannerModal = lazy(() => import('./components/badges/ScannerModal'))

type Page = 'attendance' | 'badges'
type StatusFilter = 'all' | 'present' | 'absent' | 'unchecked'

type SessionDetails = Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries' | 'rosterIds'>

function initials(student: Student) {
  return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase()
}

function statusFor(session: AttendanceSession, student: Student) {
  return session.entries[student.id]?.status || 'unchecked'
}

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
  const visibleStudents = classStudents.filter(student => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${student.firstName} ${student.lastName} ${student.id} ${student.email || ''}`.toLowerCase().includes(query)
    const matchesFilter = filter === 'all' || (selectedSession && statusFor(selectedSession, student) === filter)
    return matchesSearch && matchesFilter
  })
  const specialityName = specialities.find(item => item.id === speciality)!.name

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ScanLine size={22} strokeWidth={2.4} /></div><div><strong>Présence</strong><span>Attendance manager</span></div></div>
        <div className="sidebar-caption">Workspace</div>
        <nav aria-label="Main navigation" className="main-nav">
          <button className={!showBadges ? 'nav-item active' : 'nav-item'} onClick={() => setPage('attendance')}><LayoutGrid size={19} /> Attendance</button>
          {BADGES_ENABLED && <button className={showBadges ? 'nav-item active' : 'nav-item'} onClick={() => setPage('badges')}><QrCode size={19} /> Student badges</button>}
        </nav>
        <div className="sidebar-caption class-caption">Specialities <span>{specialities.length}</span></div>
        <nav aria-label="Specialities" className="class-nav">
          {specialities.map(item => <button key={item.id} className={speciality === item.id ? 'class-item selected' : 'class-item'} onClick={() => setSpeciality(item.id)}>
            <span className="class-code">{item.id}</span><span className="class-label">{item.shortName}</span><span className="class-count">{getActiveRoster(item.id).length}</span>
          </button>)}
        </nav>
        <div className="sidebar-bottom"><div className="saved-icon"><ShieldCheck size={19} /></div><div><strong>Saved on this device</strong><span>Academic year 2026/27</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="crumb"><GraduationCap size={18} /><span>Academic year 2026/27</span><span className="crumb-slash">/</span><strong>{showBadges ? 'Student badges' : 'Attendance'}</strong></div><div className="topbar-date"><CalendarDays size={17} /> {formatDate(localToday())}</div></header>
        <div className="content-wrap">
          <div className="page-title-row">
            <div><p className="eyebrow">{showBadges ? 'Identity cards' : 'Classroom attendance'}</p><h1>{showBadges ? 'Student QR badges' : 'Every student, accounted for.'}</h1><p className="page-subtitle">{showBadges ? 'Print a unique badge for each student. Scan it during any course session.' : 'Create a course session, mark each student present or absent, and review your class in real time.'}</p></div>
            {showBadges ? <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /> Print badges</button> : <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /> New session</button>}
          </div>

          <section className="speciality-strip" aria-label="Choose a speciality">
            {specialities.map((item, index) => {
              const latest = sessions.filter(session => session.speciality === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
              const stat = latest && sessionStats(latest)
              return <button key={item.id} className={speciality === item.id ? 'speciality-card current' : 'speciality-card'} onClick={() => setSpeciality(item.id)}>
                <span className={`speciality-symbol symbol-${index}`}><BookOpen size={20} /></span><span className="speciality-card-text"><strong>{item.id}</strong><span>{item.name}</span></span><span className="speciality-tail"><strong>{getActiveRoster(item.id).length}</strong><span>students</span></span>
                {latest && !showBadges && <span className="card-progress"><span style={{ width: `${Math.round((stat!.present / stat!.total) * 100)}%` }} /></span>}
              </button>
            })}
          </section>

          {!showBadges ? <>
            <div className="section-heading"><div><p className="eyebrow small">{speciality} · {specialityName}</p><h2>Course sessions</h2></div><span className="section-meta">{classSessions.length} {classSessions.length === 1 ? 'session' : 'sessions'}</span></div>
            {selectedSession ? <>
              <section className="session-summary">
                <div className="session-summary-main"><span className={selectedSession.state === 'open' ? 'session-state open' : 'session-state closed'}><span />{selectedSession.state === 'open' ? 'Live session' : 'Closed session'}</span><h3>{selectedSession.course}</h3><div className="session-detail-line"><span><CalendarDays size={16} />{formatDate(selectedSession.date)}</span><span><Clock3 size={16} />{selectedSession.time}</span>{selectedSession.room && <span><MapPin size={16} />{selectedSession.room}</span>}{selectedSession.teacher && <span><Users size={16} />{selectedSession.teacher}</span>}</div></div>
                <div className="session-summary-actions">{selectedSession.state === 'open' ? (BADGES_ENABLED && <button className="button button-primary scan-button" onClick={() => setScannerOpen(true)}><ScanLine size={21} /> Scan a badge</button>) : <button className="button button-light" onClick={handleReopen}><RotateCcw size={17} /> Reopen</button>}<button className="button button-light" onClick={() => exportSessionCsv(selectedSession)}><Download size={17} /> Export CSV</button></div>
              </section>
              <div className="stat-grid"><Stat label="Present" value={counts!.present} icon={<CheckCircle2 size={19} />} tone="green" /><Stat label="Absent" value={counts!.absent} icon={<X size={19} />} tone="red" /><Stat label="Not checked" value={counts!.unchecked} icon={<MoreHorizontal size={19} />} tone="amber" /><Stat label="Class size" value={counts!.total} icon={<Users size={19} />} tone="blue" /></div>
              <section className="roster-panel"><div className="roster-head"><div><h3>Student roster</h3><p>Tap a student to mark them present or absent.</p></div><div className="roster-tools"><div className="search-field"><Search size={17} /><input aria-label="Search students" placeholder="Search name or student ID" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="select-wrap"><select aria-label="Filter by attendance" value={filter} onChange={event => setFilter(event.target.value as StatusFilter)}><option value="all">All students</option><option value="present">Present</option><option value="absent">Absent</option><option value="unchecked">Not checked</option></select><ChevronDown size={16} /></div></div></div>
                <div className="table-scroll"><table className="roster-table"><thead><tr><th>Student</th><th>Student ID</th><th>Attendance</th><th className="action-column">Action</th></tr></thead><tbody>{visibleStudents.map(student => {
                  const entry = selectedSession.entries[student.id]
                  const status = statusFor(selectedSession, student)
                  return <tr key={student.id}><td><div className="student-cell"><span className="avatar">{initials(student)}</span><span><strong>{student.lastName} {student.firstName}</strong><small>{student.email ?? student.id}</small></span></div></td><td className="muted-cell">{student.id}</td><td><span className={`status-pill ${status}`}><span />{status === 'unchecked' ? 'Not checked' : status === 'present' ? 'Present' : 'Absent'}</span>{entry?.status === 'present' && <small className="check-time">{new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {entry.method === 'scan' ? 'QR scan' : 'Manual'}</small>}</td><td className="action-column">{selectedSession.state === 'open' ? <div className="row-actions"><button className={status === 'present' ? 'mini-button selected-present' : 'mini-button'} onClick={() => markStudent(student, 'present', 'manual')} title="Mark present" aria-label={`Mark ${student.firstName} ${student.lastName} present`}><Check size={16} /></button><button className={status === 'absent' ? 'mini-button selected-absent' : 'mini-button'} onClick={() => markStudent(student, 'absent', 'manual')} title="Mark absent" aria-label={`Mark ${student.firstName} ${student.lastName} absent`}><X size={16} /></button></div> : <span className="locked-cell"><LockKeyhole size={15} /> Final</span>}</td></tr>
                })}</tbody></table>{visibleStudents.length === 0 && <div className="empty-table">No students match this search or filter.</div>}</div>
                <div className="roster-footer"><span>Showing {visibleStudents.length} of {classStudents.length} students</span>{selectedSession.state === 'open' && <button className="text-button" onClick={handleClose}><LockKeyhole size={16} /> Close session & mark unchecked absent</button>}</div>
              </section>
            </> : <div className="empty-session"><div className="empty-illustration"><QrCode size={46} /><span><ScanLine size={25} /></span></div><h3>No course session yet</h3><p>Start a session for {speciality}. You can then mark each student present or absent as they arrive.</p><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Create first session</button></div>}
            {classSessions.length > 0 && <section className="history-panel"><div className="history-heading"><div><h3>Session history</h3><p>Open a previous session to review or export its attendance.</p></div><FileText size={21} /></div><div className="history-list">{classSessions.map(item => {
              const stat = sessionStats(item)
              return <button key={item.id} className={item.id === selectedId ? 'history-item selected' : 'history-item'} onClick={() => { setSelectedId(item.id); setSearch(''); setFilter('all') }}><span className="history-date"><strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong><small>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${item.date}T12:00:00`))}</small></span><span className="history-title"><strong>{item.course}</strong><small>{item.time}{item.room ? ` · ${item.room}` : ''}</small></span><span className="history-count"><CheckCircle2 size={16} /> {stat.present}/{stat.total} present</span><span className={item.state === 'open' ? 'history-open' : 'history-closed'}>{item.state === 'open' ? 'Open' : 'Closed'}</span><ArrowRight size={17} className="history-arrow" /></button>
            })}</div></section>}
          </> : <Suspense fallback={null}><BadgePage speciality={speciality} students={classStudents} /></Suspense>}
          <footer className="page-footer"><span>Présence · 2026/27</span><span>Attendance stays in this browser</span></footer>
        </div>
      </main>
      {createOpen && <CreateSessionModal speciality={speciality} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {BADGES_ENABLED && scannerOpen && selectedSession && <Suspense fallback={null}><ScannerModal session={selectedSession} onClose={() => setScannerOpen(false)} onConfirm={student => markStudent(student, 'present', 'scan')} /></Suspense>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </div>
  )
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>
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
