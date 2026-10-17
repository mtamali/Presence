import { CalendarDays, Clock3, Download, MapPin, RotateCcw, Users } from 'lucide-react'
import { formatDate } from '../format'
import type { AttendanceSession } from '../sessions'

/**
 * The banner for the session being marked. Stacks on phone with full-width
 * actions, goes side-by-side from 48rem.
 *
 * Closing a session is not here — that button lives in the roster footer,
 * beside the count of who is still unchecked.
 */
export function SessionSummary({ session, onReopen, onExport }: {
  session: AttendanceSession
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
        <h3>{session.course}</h3>
        <div className="session-detail-line">
          <span><CalendarDays size={16} />{formatDate(session.date)}</span>
          <span><Clock3 size={16} />{session.time}</span>
          {session.room && <span><MapPin size={16} />{session.room}</span>}
          {session.teacher && <span><Users size={16} />{session.teacher}</span>}
        </div>
      </div>
      <div className="session-summary-actions">
        {!open && <button className="button button-light" onClick={onReopen}><RotateCcw size={17} /> Reopen</button>}
        <button className="button button-light" onClick={onExport}><Download size={17} /> Export CSV</button>
      </div>
    </section>
  )
}
