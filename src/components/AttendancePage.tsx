import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, QrCode, ScanLine } from 'lucide-react'
import { RosterList, type StatusFilter } from './RosterList'
import { SessionHistory } from './SessionHistory'
import { SessionSummary } from './SessionSummary'
import { StatGrid } from './StatGrid'
import { getRoster, specialities, type Speciality, type Student } from '../roster'
import { closeSession, markManualPresent, markScannedPresent, reopenSession, sessionStats, type AttendanceSession } from '../sessions'
import { exportSessionCsv } from '../csv'

const ScannerModal = lazy(() => import('./badges/ScannerModal'))

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
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [classFilter, setClassFilter] = useState<Speciality | 'all'>('all')
  const [scanOpen, setScanOpen] = useState(false)

  const selectedSession = sessions.find(item => item.id === selectedId) || null
  const latestSession = useRef<AttendanceSession | null>(selectedSession)
  latestSession.current = selectedSession
  const counts = selectedSession ? sessionStats(selectedSession) : null
  const specialityName = specialities.find(item => item.id === speciality)!.name

  // A different session or class means the old query describes nothing.
  useEffect(() => { setSearch(''); setFilter('all'); setClassFilter('all'); setScanOpen(false) }, [selectedId, speciality])

  // Who the roster panel lists. It follows the session's own membership rather
  // than the live class, so the rows, the stat totals and the CSV export all
  // describe the same set of students even after a roster import.
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

  function markAbsent(student: Student) {
    if (!selectedSession || selectedSession.state !== 'open' || selectedSession.entries[student.id]?.status === 'present') return
    onReplace({
      ...selectedSession,
      entries: { ...selectedSession.entries, [student.id]: { status: 'absent', at: new Date().toISOString(), method: 'manual' } },
    })
    onToast(`${student.firstName} ${student.lastName} marked absent.`)
  }

  function markPresentManually(student: Student) {
    const current = latestSession.current
    if (!current || !window.confirm(`Mark ${student.firstName} ${student.lastName} present without scanning a badge?`)) return
    const updated = markManualPresent(current, student)
    if (!updated) { onToast('This student is already present or is not in this session.'); return }
    latestSession.current = updated
    onReplace(updated)
    onToast(`${student.firstName} ${student.lastName} marked present manually.`)
  }

  function confirmScan(student: Student, code: string) {
    if (!latestSession.current) return false
    const updated = markScannedPresent(latestSession.current, student, code)
    if (!updated) { onToast('This badge cannot mark presence in the current session.'); return false }
    latestSession.current = updated
    onReplace(updated)
    onToast(`${student.firstName} ${student.lastName} marked present by QR scan.`)
    return true
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
        onScan={() => setScanOpen(true)}
        onReopen={handleReopen}
        onExport={() => exportSessionCsv(selectedSession)}
      />
      <StatGrid stats={counts!} />
      <RosterList
        session={selectedSession}
        students={sessionRoster}
        search={search}
        filter={filter}
        classFilter={classFilter}
        onSearch={setSearch}
        onFilter={setFilter}
        onClassFilter={setClassFilter}
        onMarkAbsent={markAbsent}
        onMarkPresentManually={markPresentManually}
        onCloseSession={handleClose}
      />
    </> : <div className="empty-session">
      <div className="empty-illustration"><QrCode size={46} /><span><ScanLine size={25} /></span></div>
      <h3>No course session yet</h3>
      <p>Start a session for {speciality}, then scan each student's QR badge. Search the roster for a student who attends without a badge.</p>
      <div className="empty-actions">
        <button className="button button-primary" onClick={onCreateOpen}><Plus size={18} /> Create first session</button>
        <button className="button button-light" onClick={onImportOpen}>Import the {speciality} roster</button>
      </div>
    </div>}

    {sessions.length > 0 && <SessionHistory sessions={sessions} selectedId={selectedId} onSelect={onSelect} />}
    {scanOpen && selectedSession?.state === 'open' && <Suspense fallback={null}><ScannerModal session={selectedSession} onClose={() => setScanOpen(false)} onConfirm={confirmScan} /></Suspense>}
  </>
}
