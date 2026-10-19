import { useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, Percent, Users, X } from 'lucide-react'
import { Stat } from './StatGrid'
import { TypeBadge } from './Tags'
import { PERIODS, byCourse, bySpeciality, byStudent, overview, withinPeriod, type Period, type Tally } from '../analytics'
import { getRoster, specialities, type Speciality } from '../roster'
import type { AttendanceSession } from '../sessions'

type Breakdown = 'classes' | 'courses' | 'students'

const breakdowns: { id: Breakdown; label: string }[] = [
  { id: 'classes', label: 'Classes' },
  { id: 'courses', label: 'Courses' },
  { id: 'students', label: 'Students' },
]

function percent(tally: Tally) {
  return `${Math.round(tally.rate * 100)}%`
}

/**
 * Three bands, because the only question this screen answers is whether a row
 * needs attention. A finer scale would be precision the numbers do not have.
 */
function band(tally: Tally) {
  if (tally.recorded === 0) return 'none'
  if (tally.rate >= 0.8) return 'ok'
  if (tally.rate >= 0.5) return 'warn'
  return 'bad'
}

/**
 * Attendance analytics across every class, course and student.
 *
 * All the arithmetic lives in analytics.ts; this file chooses what to show and
 * how. The overall figures stay pinned above the breakdown rather than becoming
 * a fourth tab: four chips do not fit 375px, and the headline is wanted
 * whichever breakdown is open.
 */
export function AnalyticsPage({ sessions, rosterVersion }: {
  /** Every session, not one class's — this screen is deliberately global. */
  sessions: AttendanceSession[]
  /** Bumped by App when the roster in localStorage changes. See AttendancePage. */
  rosterVersion: number
}) {
  const [breakdown, setBreakdown] = useState<Breakdown>('classes')
  const [classFilter, setClassFilter] = useState<Speciality | 'all'>('all')
  // All time, so the screen opens on everything rather than on a quiet today.
  const [period, setPeriod] = useState<Period>('all')

  // Every student of every class: the analytics module attributes each entry by
  // the student's own speciality, so a partial roster would silently drop rows.
  // rosterVersion is the signal that localStorage changed under us.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const students = useMemo(() => specialities.flatMap(item => getRoster(item.id)), [rosterVersion])

  // Narrowed once, here, so every figure below is of the same period. Feeding
  // the tiles `sessions` and the rows `scoped` would put an all-time headline
  // above a single week's breakdown.
  const scoped = useMemo(() => withinPeriod(sessions, period), [sessions, period])

  const total = useMemo(() => overview(scoped), [scoped])
  const classes = useMemo(() => bySpeciality(scoped, students), [scoped, students])
  const courses = useMemo(() => byCourse(scoped), [scoped])
  const studentRows = useMemo(() => byStudent(scoped, students)
    .filter(row => classFilter === 'all' || row.student.speciality === classFilter),
    [scoped, students, classFilter])

  if (sessions.length === 0) {
    return <>
      <Heading sessions={0} />
      <section className="analytics-panel">
        <div className="empty-table">
          No attendance recorded yet. Start a session from the timetable, mark the
          roster, and this screen will fill in.
        </div>
      </section>
    </>
  }

  return <>
    <Heading sessions={total.sessions} />

    {/* Above the tiles, not beside the breakdown switch: this scopes the whole
        screen, where the switch only chooses how the rows are grouped. */}
    <div className="chip-row analytics-period" role="group" aria-label="Period">
      {PERIODS.map(item => (
        <button
          type="button"
          key={item.id}
          className="chip-toggle"
          aria-pressed={period === item.id}
          onClick={() => setPeriod(item.id)}
        >{item.label}</button>
      ))}
    </div>

    {/* Sessions exist, just none in this period — which is a different thing
        from having recorded nothing ever, and must not hide the chips above:
        they are the only way back to a period that has data. */}
    {scoped.length === 0 && <section className="analytics-panel">
      <div className="empty-table">
        Nothing recorded in this period. Choose a wider one to see more.
      </div>
    </section>}

    {scoped.length > 0 && <>
    <div className="stat-grid">
      {/* A percentage leads, because a count of absences means nothing without
          the number of chances to be absent. */}
      <Stat label="Attendance" value={total.recorded ? percent(total) : '—'} icon={<Percent size={19} />} tone="blue" />
      <Stat label="Present" value={total.present} icon={<CheckCircle2 size={19} />} tone="green" />
      <Stat label="Absent" value={total.absent} icon={<X size={19} />} tone="red" />
      <Stat label="Students seen" value={total.students} icon={<Users size={19} />} tone="amber" />
    </div>

    <section className="analytics-panel">
      <div className="analytics-head">
        <div>
          <h3>Breakdown</h3>
          <p>Worst attendance first — a row with nothing recorded sorts last.</p>
        </div>
        <div className="analytics-tools">
          {/* aria-pressed rather than role="tab": a tablist owes keyboard arrow
              navigation and a tabpanel, and claiming the role without them is
              worse for a screen reader than a plain group of toggles. */}
          <div className="segmented" role="group" aria-label="Choose a breakdown">
            {breakdowns.map(item => (
              <button
                key={item.id}
                aria-pressed={breakdown === item.id}
                onClick={() => setBreakdown(item.id)}
              >{item.label}</button>
            ))}
          </div>
          {/* Only the student list needs it: three classes of twenty is sixty
              rows, where classes and courses are a handful each. */}
          {breakdown === 'students' && <div className="select-wrap">
            <select aria-label="Filter by class" value={classFilter} onChange={event => setClassFilter(event.target.value as Speciality | 'all')}>
              <option value="all">All classes</option>
              {specialities.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>}
        </div>
      </div>

      <ul className="rate-list">
        {breakdown === 'classes' && classes.map(item => (
          <RateRow key={item.id} label={item.id} sub={item.name} tally={item.tally} />
        ))}

        {breakdown === 'courses' && courses.map(item => (
          <RateRow key={item.label} label={item.label} tally={item.tally}>
            {item.types.length > 0 && <span className="rate-types">
              {item.types.map(entry => <span className="rate-type" key={entry.type}>
                <TypeBadge type={entry.type} />
                <small>{percent(entry.tally)}</small>
              </span>)}
            </span>}
          </RateRow>
        ))}

        {breakdown === 'students' && (studentRows.length === 0
          ? <li className="empty-table">No students in this class yet.</li>
          : studentRows.map(item => (
            <RateRow
              key={item.student.id}
              label={`${item.student.lastName} ${item.student.firstName}`}
              sub={`${item.student.id} · ${item.sessions === 1 ? '1 session' : `${item.sessions} sessions`}`}
              tally={item.tally}
              tag={item.student.active ? undefined : 'Inactive'}
            />
          )))}
      </ul>
    </section>
    </>}
  </>
}

function Heading({ sessions }: { sessions: number }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow small">All classes</p>
        <h2>Attendance analytics</h2>
      </div>
      <span className="section-meta">{sessions} {sessions === 1 ? 'session' : 'sessions'} counted</span>
    </div>
  )
}

function RateRow({ label, sub, tally, tag, children }: {
  label: string
  sub?: string
  tally: Tally
  /** A short qualifier on the row, e.g. a student a re-import deactivated. */
  tag?: string
  children?: ReactNode
}) {
  const has = tally.recorded > 0
  return (
    <li className="rate-row" data-band={band(tally)}>
      <div className="rate-row-head">
        <span className="rate-label">
          <strong>{label}{tag && <em>{tag}</em>}</strong>
          {sub && <small>{sub}</small>}
        </span>
        <span className="rate-figure">
          {/* "No data" rather than 0%: nothing recorded is not a bad result. */}
          {has
            ? <><strong>{percent(tally)}</strong><small>{tally.present}/{tally.recorded} present</small></>
            : <small className="rate-none">No data</small>}
        </span>
      </div>
      {/* Decorative: the percentage beside it is the accessible value. */}
      <span className="rate-bar" aria-hidden="true">
        <span style={{ width: has ? `${tally.rate * 100}%` : 0 }} />
      </span>
      {children}
    </li>
  )
}
