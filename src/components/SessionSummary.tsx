import { CalendarDays, Clock3, Download, MapPin, RotateCcw, ScanLine, Users } from 'lucide-react'
import { ClassTags, TypeBadge } from './Tags'
import { formatDate } from '../format'
import type { AttendanceSession } from '../sessions'

/**
 * The banner for the session being marked. Stacks on phone with full-width
 * actions, goes side-by-side from 48rem.
 *
 * Closing a session is not here — that button lives in the roster footer,
 * beside the count of who is still unchecked.
 */
export function SessionSummary({ session, onScan, onReopen, onExport }: {
  session: AttendanceSession
  onScan: () => void
  onReopen: () => void
  onExport: () => void
}) {
  const open = session.state === 'open'
  return (
    <section className="session-summary">
      <div className="session-summary-main">
        <span className={open ? 'session-state open' : 'session-state closed'}>
          <span />{open ? 'Live session' : 'Closed session'}
        </span>
        {/* `CODE · Name` when there is a code. Legacy sessions have none and show
            just the name — padding them with a separator would imply a code. */}
        <h3>{session.courseCode ? `${session.courseCode} · ${session.course}` : session.course}</h3>
        <div className="start-identity">
          {session.type && <TypeBadge type={session.type} />}
          <ClassTags specialities={session.specialities} />
        </div>
        <div className="session-detail-line">
          <span><CalendarDays size={16} />{formatDate(session.date)}</span>
          <span><Clock3 size={16} />{session.time}</span>
          {session.room && <span><MapPin size={16} />{session.room}</span>}
          {session.teacher && <span><Users size={16} />{session.teacher}</span>}
        </div>
      </div>
      <div className="session-summary-actions">
        {open && <button className="button button-primary scan-button" onClick={onScan}><ScanLine size={17} /> Scan student QR</button>}
        {!open && <button className="button button-light" onClick={onReopen}><RotateCcw size={17} /> Reopen</button>}
        <button className="button button-light" onClick={onExport}><Download size={17} /> Export CSV</button>
      </div>
    </section>
  )
}
