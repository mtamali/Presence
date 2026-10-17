import { ArrowRight, CheckCircle2, FileText } from 'lucide-react'
import { sessionStats, type AttendanceSession } from '../sessions'

const monthOf = new Intl.DateTimeFormat('en-GB', { month: 'short' })

/**
 * Past sessions for the current class, newest first.
 *
 * On phone each row is reduced to date, course and time; the present count,
 * state badge and chevron return at 48rem. See session.css.
 */
export function SessionHistory({ sessions, selectedId, onSelect }: {
  sessions: AttendanceSession[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="history-panel">
      <div className="history-heading">
        <div>
          <h3>Session history</h3>
          <p>Open a previous session to review or export its attendance.</p>
        </div>
        <FileText size={21} />
      </div>
      <div className="history-list">
        {sessions.map(item => {
          const stat = sessionStats(item)
          const day = new Date(`${item.date}T12:00:00`)
          return (
            <button
              key={item.id}
              className={item.id === selectedId ? 'history-item selected' : 'history-item'}
              aria-current={item.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="history-date"><strong>{day.getDate()}</strong><small>{monthOf.format(day)}</small></span>
              {/* The DOM shape is unchanged on purpose: from 48rem the row is a
                  five-cell table (session.css), so a new element in here would
                  land in a cell that was never sized for it. */}
              <span className="history-title">
                <strong>{item.courseCode ? `${item.courseCode} · ${item.course}` : item.course}</strong>
                <small>{[item.type, item.time, item.room, item.specialities.join(' + ')].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="history-count"><CheckCircle2 size={16} /> {stat.present}/{stat.total} present</span>
              <span className={item.state === 'open' ? 'history-open' : 'history-closed'}>{item.state === 'open' ? 'Open' : 'Closed'}</span>
              <ArrowRight size={17} className="history-arrow" />
            </button>
          )
        })}
      </div>
    </section>
  )
}
