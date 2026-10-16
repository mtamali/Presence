import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight, BookOpen, CalendarDays, Camera, Check, CheckCircle2,
  ChevronDown, Clock3, Download, FileText, GraduationCap, Hash, LayoutGrid,
  LockKeyhole, MapPin, MoreHorizontal, Plus, Printer, QrCode, RotateCcw,
  ScanLine, Search, ShieldCheck, Upload, Users, X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  closeSession, createSession, exportSessionCsv, findStudentByBadge, getStudents, reopenSession,
  loadSessions, loadStudentEmails, saveSessions, saveStudentEmails, sessionStats, specialities,
  type AttendanceSession, type Speciality, type Student,
} from './model'
import { previewClassroomImport, type ImportedEmail, type ImportPreview } from './classroomImport'

type Page = 'attendance' | 'badges'
type StatusFilter = 'all' | 'present' | 'absent' | 'unchecked'

function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function localToday() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

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
  const [importOpen, setImportOpen] = useState(false)
  const [emailRevision, setEmailRevision] = useState(0)
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

  const classStudents = useMemo(() => getStudents(speciality), [speciality, emailRevision])
  const classSessions = useMemo(() => sessions.filter(item => item.speciality === speciality)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sessions, speciality])
  const selectedSession = classSessions.find(item => item.id === selectedId) || null
  const counts = selectedSession ? sessionStats(selectedSession) : null
  const visibleStudents = classStudents.filter(student => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${student.firstName} ${student.lastName} ${student.matricule} ${student.email || ''}`.toLowerCase().includes(query)
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

  function handleCreate(details: Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries'>) {
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

  function handleImportEmails(matches: ImportedEmail[]) {
    const emails = loadStudentEmails()
    for (const match of matches) emails[match.studentId] = match.email
    saveStudentEmails(emails)
    setEmailRevision(current => current + 1)
    setImportOpen(false)
    setToast(`${matches.length} student email${matches.length === 1 ? '' : 's'} imported.`)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ScanLine size={22} strokeWidth={2.4} /></div><div><strong>Présence</strong><span>Attendance manager</span></div></div>
        <div className="sidebar-caption">Workspace</div>
        <nav aria-label="Main navigation" className="main-nav">
          <button className={page === 'attendance' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('attendance')}><LayoutGrid size={19} /> Attendance</button>
          <button className={page === 'badges' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('badges')}><QrCode size={19} /> Student badges</button>
        </nav>
        <div className="sidebar-caption class-caption">Specialities <span>{specialities.length}</span></div>
        <nav aria-label="Specialities" className="class-nav">
          {specialities.map(item => <button key={item.id} className={speciality === item.id ? 'class-item selected' : 'class-item'} onClick={() => setSpeciality(item.id)}>
            <span className="class-code">{item.id}</span><span className="class-label">{item.shortName}</span><span className="class-count">{getStudents(item.id).length}</span>
          </button>)}
        </nav>
        <div className="sidebar-bottom"><div className="saved-icon"><ShieldCheck size={19} /></div><div><strong>Saved on this device</strong><span>Academic year 2026/27</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="crumb"><GraduationCap size={18} /><span>Academic year 2026/27</span><span className="crumb-slash">/</span><strong>{page === 'attendance' ? 'Attendance' : 'Student badges'}</strong></div><div className="topbar-date"><CalendarDays size={17} /> {formatDate(localToday())}</div></header>
        <div className="content-wrap">
          <div className="page-title-row">
            <div><p className="eyebrow">{page === 'attendance' ? 'Classroom attendance' : 'Identity cards'}</p><h1>{page === 'attendance' ? 'Every student, accounted for.' : 'Student QR badges'}</h1><p className="page-subtitle">{page === 'attendance' ? 'Create a course session, scan badges, and review your class in real time.' : 'Print a unique badge for each student. Scan it during any course session.'}</p></div>
            {page === 'attendance' ? <button className="button button-primary page-action" onClick={() => setCreateOpen(true)}><Plus size={19} /> New session</button> : <button className="button button-primary page-action" onClick={() => window.print()}><Printer size={18} /> Print badges</button>}
          </div>

          <section className="speciality-strip" aria-label="Choose a speciality">
            {specialities.map((item, index) => {
              const latest = sessions.filter(session => session.speciality === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
              const stat = latest && sessionStats(latest)
              return <button key={item.id} className={speciality === item.id ? 'speciality-card current' : 'speciality-card'} onClick={() => setSpeciality(item.id)}>
                <span className={`speciality-symbol symbol-${index}`}><BookOpen size={20} /></span><span className="speciality-card-text"><strong>{item.id}</strong><span>{item.name}</span></span><span className="speciality-tail"><strong>{getStudents(item.id).length}</strong><span>students</span></span>
                {latest && page === 'attendance' && <span className="card-progress"><span style={{ width: `${Math.round((stat!.present / stat!.total) * 100)}%` }} /></span>}
              </button>
            })}
          </section>

          {page === 'attendance' ? <>
            <div className="section-heading"><div><p className="eyebrow small">{speciality} · {specialityName}</p><h2>Course sessions</h2></div><span className="section-meta">{classSessions.length} {classSessions.length === 1 ? 'session' : 'sessions'}</span></div>
            {selectedSession ? <>
              <section className="session-summary">
                <div className="session-summary-main"><span className={selectedSession.state === 'open' ? 'session-state open' : 'session-state closed'}><span />{selectedSession.state === 'open' ? 'Live session' : 'Closed session'}</span><h3>{selectedSession.course}</h3><div className="session-detail-line"><span><CalendarDays size={16} />{formatDate(selectedSession.date)}</span><span><Clock3 size={16} />{selectedSession.time}</span>{selectedSession.room && <span><MapPin size={16} />{selectedSession.room}</span>}{selectedSession.teacher && <span><Users size={16} />{selectedSession.teacher}</span>}</div></div>
                <div className="session-summary-actions">{selectedSession.state === 'open' ? <button className="button button-primary scan-button" onClick={() => setScannerOpen(true)}><ScanLine size={21} /> Scan a badge</button> : <button className="button button-light" onClick={handleReopen}><RotateCcw size={17} /> Reopen</button>}<button className="button button-light" onClick={() => exportSessionCsv(selectedSession)}><Download size={17} /> Export CSV</button></div>
              </section>
              <div className="stat-grid"><Stat label="Present" value={counts!.present} icon={<CheckCircle2 size={19} />} tone="green" /><Stat label="Absent" value={counts!.absent} icon={<X size={19} />} tone="red" /><Stat label="Not checked" value={counts!.unchecked} icon={<MoreHorizontal size={19} />} tone="amber" /><Stat label="Class size" value={counts!.total} icon={<Users size={19} />} tone="blue" /></div>
              <section className="roster-panel"><div className="roster-head"><div><h3>Student roster</h3><p>Check every student against their badge.</p></div><div className="roster-tools"><div className="search-field"><Search size={17} /><input aria-label="Search students" placeholder="Search name or number" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="select-wrap"><select aria-label="Filter by attendance" value={filter} onChange={event => setFilter(event.target.value as StatusFilter)}><option value="all">All students</option><option value="present">Present</option><option value="absent">Absent</option><option value="unchecked">Not checked</option></select><ChevronDown size={16} /></div></div></div>
                <div className="table-scroll"><table className="roster-table"><thead><tr><th>Student</th><th>Matricule</th><th>Group</th><th>Attendance</th><th className="action-column">Action</th></tr></thead><tbody>{visibleStudents.map(student => {
                  const entry = selectedSession.entries[student.id]
                  const status = statusFor(selectedSession, student)
                  return <tr key={student.id}><td><div className="student-cell"><span className="avatar">{initials(student)}</span><span><strong>{student.lastName} {student.firstName}</strong><small>{student.email || student.section}</small></span></div></td><td className="muted-cell">{student.matricule}</td><td className="muted-cell">{student.group}</td><td><span className={`status-pill ${status}`}><span />{status === 'unchecked' ? 'Not checked' : status === 'present' ? 'Present' : 'Absent'}</span>{entry?.status === 'present' && <small className="check-time">{new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {entry.method === 'scan' ? 'QR scan' : 'Manual'}</small>}</td><td className="action-column">{selectedSession.state === 'open' ? <div className="row-actions"><button className={status === 'present' ? 'mini-button selected-present' : 'mini-button'} onClick={() => markStudent(student, 'present', 'manual')} title="Mark present" aria-label={`Mark ${student.firstName} ${student.lastName} present`}><Check size={16} /></button><button className={status === 'absent' ? 'mini-button selected-absent' : 'mini-button'} onClick={() => markStudent(student, 'absent', 'manual')} title="Mark absent" aria-label={`Mark ${student.firstName} ${student.lastName} absent`}><X size={16} /></button></div> : <span className="locked-cell"><LockKeyhole size={15} /> Final</span>}</td></tr>
                })}</tbody></table>{visibleStudents.length === 0 && <div className="empty-table">No students match this search or filter.</div>}</div>
                <div className="roster-footer"><span>Showing {visibleStudents.length} of {classStudents.length} students</span>{selectedSession.state === 'open' && <button className="text-button" onClick={handleClose}><LockKeyhole size={16} /> Close session & mark unchecked absent</button>}</div>
              </section>
            </> : <div className="empty-session"><div className="empty-illustration"><QrCode size={46} /><span><ScanLine size={25} /></span></div><h3>No course session yet</h3><p>Start a session for {speciality}. You can then scan badges and track each student as they arrive.</p><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Create first session</button></div>}
            {classSessions.length > 0 && <section className="history-panel"><div className="history-heading"><div><h3>Session history</h3><p>Open a previous session to review or export its attendance.</p></div><FileText size={21} /></div><div className="history-list">{classSessions.map(item => {
              const stat = sessionStats(item)
              return <button key={item.id} className={item.id === selectedId ? 'history-item selected' : 'history-item'} onClick={() => { setSelectedId(item.id); setSearch(''); setFilter('all') }}><span className="history-date"><strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong><small>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${item.date}T12:00:00`))}</small></span><span className="history-title"><strong>{item.course}</strong><small>{item.time}{item.room ? ` · ${item.room}` : ''}</small></span><span className="history-count"><CheckCircle2 size={16} /> {stat.present}/{stat.total} present</span><span className={item.state === 'open' ? 'history-open' : 'history-closed'}>{item.state === 'open' ? 'Open' : 'Closed'}</span><ArrowRight size={17} className="history-arrow" /></button>
            })}</div></section>}
          </> : <BadgePage speciality={speciality} students={classStudents} onImport={() => setImportOpen(true)} />}
          <footer className="page-footer"><span>Présence · 2026/27</span><span>Attendance stays in this browser</span></footer>
        </div>
      </main>
      {createOpen && <CreateSessionModal speciality={speciality} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />}
      {scannerOpen && selectedSession && <ScannerModal session={selectedSession} onClose={() => setScannerOpen(false)} onConfirm={student => markStudent(student, 'present', 'scan')} />}
      {importOpen && <ImportEmailsModal onClose={() => setImportOpen(false)} onImport={handleImportEmails} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </div>
  )
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>
}

function CreateSessionModal({ speciality, onClose, onCreate }: { speciality: Speciality; onClose: () => void; onCreate: (details: Omit<AttendanceSession, 'id' | 'state' | 'createdAt' | 'entries'>) => void }) {
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
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-header"><div className="modal-icon"><CalendarDays size={23} /></div><button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button></div><h2 id="create-title">New course session</h2><p className="modal-subtitle">Set up attendance for {speciality}. Each student starts as not checked.</p><form onSubmit={submit}><label className="field"><span>Course name <b>*</b></span><input autoFocus required placeholder="e.g. Industrial automation" value={course} onChange={event => setCourse(event.target.value)} /></label><div className="field-row"><label className="field"><span>Date <b>*</b></span><input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label className="field"><span>Start time <b>*</b></span><input type="time" required value={time} onChange={event => setTime(event.target.value)} /></label></div><div className="field-row"><label className="field"><span>Room</span><input placeholder="e.g. Lab 04" value={room} onChange={event => setRoom(event.target.value)} /></label><label className="field"><span>Teacher</span><input placeholder="Your name" value={teacher} onChange={event => setTeacher(event.target.value)} /></label></div><div className="modal-note"><Users size={18} /><span>{getStudents(speciality).length} students from the {speciality} roster will be included.</span></div><div className="modal-actions"><button type="button" className="button button-light" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Start session <ArrowRight size={17} /></button></div></form></div></div>
}

type ScanResult = { kind: 'ready' | 'unknown' | 'wrong-class' | 'already-present'; student?: Student; code: string }

function ScannerModal({ session, onClose, onConfirm }: { session: AttendanceSession; onClose: () => void; onConfirm: (student: Student) => void }) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [cameraError, setCameraError] = useState('')

  function resolveCode(code: string): ScanResult {
    const student = findStudentByBadge(code)
    if (!student) return { kind: 'unknown', code }
    if (student.speciality !== session.speciality) return { kind: 'wrong-class', code, student }
    if (session.entries[student.id]?.status === 'present') return { kind: 'already-present', code, student }
    return { kind: 'ready', code, student }
  }

  useEffect(() => {
    if (result) return
    let disposed = false
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (disposed) return
        scanner = new Html5Qrcode('qr-reader', { verbose: false })
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, code => {
          if (!disposed) setResult(resolveCode(code))
        }, undefined)
        if (disposed && scanner.isScanning) await scanner.stop()
      } catch {
        if (!disposed) setCameraError('Camera unavailable. Allow camera access or enter the badge code below.')
      }
    })()
    return () => {
      disposed = true
      void (async () => {
        try { if (scanner?.isScanning) await scanner.stop(); scanner?.clear() } catch { /* camera may already have stopped */ }
      })()
    }
    // A result stops the camera before the teacher confirms the student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  function confirm() {
    if (!result?.student || result.kind !== 'ready') return
    onConfirm(result.student)
    setResult(null)
    setManualCode('')
  }
  function manualSubmit(event: FormEvent) {
    event.preventDefault()
    if (!manualCode.trim()) return
    setResult(resolveCode(manualCode))
  }

  return <div className="modal-backdrop scanner-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="scanner-title-row"><div><p className="eyebrow small">Live check-in · {session.speciality}</p><h2 id="scanner-title">Scan student badge</h2><p>{session.course} · {formatDate(session.date)}</p></div><button className="icon-close" onClick={onClose} aria-label="Close scanner"><X size={22} /></button></div><div className="scanner-content"><div className="camera-area">{!result ? <><div className="camera-frame"><div id="qr-reader" /></div><div className="camera-caption"><Camera size={18} /> Hold a student badge inside the frame</div>{cameraError && <p className="camera-error">{cameraError}</p>}</> : <div className="scan-result">{result.student ? <><div className={result.kind === 'ready' ? 'scan-result-icon success' : 'scan-result-icon warning'}>{result.kind === 'ready' ? <Check size={33} /> : <Users size={31} />}</div><span className="result-label">{result.kind === 'ready' ? 'Badge found' : result.kind === 'wrong-class' ? 'Different speciality' : 'Already marked present'}</span><h3>{result.student.lastName} {result.student.firstName}</h3><p>{result.student.speciality} · Matricule {result.student.matricule}</p>{result.kind === 'wrong-class' && <div className="result-message">This badge belongs to {result.student.speciality}. Open a session for that speciality to record attendance.</div>}{result.kind === 'already-present' && <div className="result-message">This student is already present in this session.</div>}</> : <><div className="scan-result-icon danger"><X size={32} /></div><span className="result-label">Badge not recognized</span><h3>No student found</h3><p>Check the badge code and try again.</p></>}{result.kind === 'ready' ? <button className="button button-primary result-button" onClick={confirm}><Check size={18} /> Confirm presence</button> : <button className="button button-light result-button" onClick={() => { setResult(null); setManualCode('') }}><RotateCcw size={17} /> Scan another badge</button>}</div>}</div><div className="scanner-side"><div className="scan-step"><span>1</span><p>Ask the student to show their assigned QR badge.</p></div><div className="scan-step"><span>2</span><p>Scan the code and verify the name on screen.</p></div><div className="scan-step"><span>3</span><p>Confirm presence before scanning the next student.</p></div><div className="manual-entry"><div className="manual-entry-title"><Hash size={17} /> Enter code manually</div><p>Use this if the camera cannot read a badge.</p><form onSubmit={manualSubmit}><input aria-label="Badge code" placeholder="ATD26-..." value={manualCode} onChange={event => setManualCode(event.target.value)} /><button type="submit" aria-label="Check badge code"><ArrowRight size={19} /></button></form></div></div></div></div></div>
}

function ImportEmailsModal({ onClose, onImport }: { onClose: () => void; onImport: (matches: ImportedEmail[]) => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    try {
      setPreview(previewClassroomImport(await file.text()))
    } catch (problem) {
      setPreview(null)
      setError(problem instanceof Error ? problem.message : 'The file could not be read.')
    }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><div className="modal-icon"><Upload size={22} /></div><button className="icon-close" onClick={onClose} aria-label="Close"><X size={21} /></button></div><h2 id="import-title">Import student emails</h2><p className="modal-subtitle">Choose a CSV roster from Python Avancé. The app matches names or matricules to the three speciality lists before adding any email.</p><label className="upload-field"><Upload size={23} /><strong>{fileName || 'Choose a CSV file'}</strong><span>Expected columns: Name and Email, or First name, Last name and Email. A Matricule column also works.</span><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={readFile} /></label>{error && <p className="import-error" role="alert">{error}</p>}{preview && <div className="import-preview"><div className="import-preview-counts"><span><strong>{preview.matches.length}</strong> matched</span><span><strong>{preview.issues.length}</strong> need review</span><span><strong>{preview.totalRows}</strong> rows</span></div>{preview.matches.length > 0 && <div className="import-preview-list"><h3>Matched students</h3>{preview.matches.slice(0, 6).map(match => <div key={match.studentId}><span>{match.studentName} <small>{match.speciality}</small></span><span>{match.email}</span></div>)}{preview.matches.length > 6 && <p>and {preview.matches.length - 6} more matched students</p>}</div>}{preview.issues.length > 0 && <div className="import-issues"><h3>Not imported</h3>{preview.issues.slice(0, 5).map((issue, index) => <p key={`${issue.name}-${index}`}><strong>{issue.name}</strong> — {issue.reason}</p>)}{preview.issues.length > 5 && <p>and {preview.issues.length - 5} more rows needing review</p>}</div>}</div>}<div className="modal-actions"><button className="button button-light" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!preview?.matches.length} onClick={() => preview && onImport(preview.matches)}>Import matched emails</button></div></div></div>
}

function BadgePage({ speciality, students: classStudents, onImport }: { speciality: Speciality; students: Student[]; onImport: () => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => setQuery(''), [speciality])
  const visible = classStudents.filter(student => `${student.firstName} ${student.lastName} ${student.matricule} ${student.email || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <><section className="badge-intro"><div className="badge-intro-icon"><QrCode size={30} /></div><div><h2>{speciality} badge collection</h2><p>Each badge has a unique random code. Print and give the correct badge to each student.</p></div><span>{classStudents.length} badges</span></section><div className="badge-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search badges" placeholder="Find a student" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="badge-toolbar-right"><span>{classStudents.filter(student => student.email).length}/{classStudents.length} emails</span><button className="button button-light" onClick={onImport}><Upload size={16} /> Import emails</button></div></div><div className="badge-grid" id="print-area">{visible.map(student => <article className="student-badge" key={student.id}><div className="badge-top"><div className="badge-brand"><ScanLine size={18} /><strong>Présence</strong></div><span>{student.speciality}</span></div><div className="badge-body"><div className="badge-identity"><span>Student badge</span><h3>{student.lastName}<br />{student.firstName}</h3><p>Matricule {student.matricule}</p></div><div className="qr-box"><QRCodeSVG value={student.badgeCode} size={105} level="M" marginSize={0} /></div></div><div className="badge-bottom"><span>Academic year 2026/27</span><code>{student.badgeCode}</code></div></article>)}</div>{visible.length === 0 && <div className="empty-table">No badges match that student.</div>}<div className="badge-tip"><div><ShieldCheck size={20} /><strong>Email matching is checked before import</strong></div><p>Only exact matches to the existing student lists are imported. Badge QR codes contain no student names or numbers.</p></div></>
}

export default App
