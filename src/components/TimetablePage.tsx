import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AssignCellModal } from './modals/AssignCellModal'
import { StartSessionModal } from './modals/StartSessionModal'
import { ClassTags, TypeBadge } from './Tags'
import { findCourse, type Course } from '../courses'
import { sessionForCell, type AttendanceSession, type SessionDetails } from '../sessions'
import {
  DAYS, SLOTS, clearEntry, dateForDayInCurrentWeek, entryAt, setEntry, todayDayIndex,
  type DayIndex, type SlotIndex, type TimetableEntry,
} from '../timetable'

/**
 * The weekly timetable: five days of six slots, one entry per cell.
 *
 * One DOM tree serves both layouts. On phone the day strip picks a day and only
 * that day's column is displayed; from 48rem every column is displayed at once
 * as the grid. The switch is pure CSS (see timetable.css) — nothing here reads
 * the viewport width, so there is no resize listener and no layout flash.
 */
export function TimetablePage({ entries, courses, sessions, onChange, onToast, onGoToCourses, onStart, onOpenSession }: {
  entries: TimetableEntry[]
  courses: Course[]
  sessions: AttendanceSession[]
  onChange: (next: TimetableEntry[]) => void
  onToast: (message: string) => void
  onGoToCourses: () => void
  onStart: (details: SessionDetails) => void
  onOpenSession: (session: AttendanceSession) => void
}) {
  const today = todayDayIndex()
  // Opens on today, or Sunday at the weekend — the grid has no Friday column.
  const [day, setDay] = useState<DayIndex>(today ?? 0)
  const [cell, setCell] = useState<{ day: DayIndex; slot: SlotIndex; mode: 'start' | 'assign' } | null>(null)

  const open = cell ? entryAt(cell.day, cell.slot, entries) : undefined
  const openCourse = open ? findCourse(open.courseCode, courses) : undefined
  // The teacher name carries over from the last session created, so it is typed
  // once a term rather than once a slot.
  const lastTeacher = sessions.map(item => item.teacher).find(name => Boolean(name)) || ''

  function save(entry: TimetableEntry) {
    onChange(setEntry(entry, entries))
    setCell(null)
    onToast(`${entry.courseCode} ${entry.type} saved to the timetable.`)
  }

  function clear() {
    if (!cell) return
    onChange(clearEntry(cell.day, cell.slot, entries))
    setCell(null)
    onToast('Cell cleared.')
  }

  return <>
    <div className="section-heading">
      <div><p className="eyebrow small">All classes</p><h2>Weekly timetable</h2></div>
      <span className="section-meta">{entries.length} of 30 slots</span>
    </div>

    {/* Phone only: the grid replaces it from 48rem. */}
    <div className="day-strip" role="tablist" aria-label="Day">
      {DAYS.map(item => (
        <button
          key={item.index}
          className="day-chip"
          role="tab"
          aria-selected={day === item.index}
          aria-current={day === item.index ? 'true' : undefined}
          onClick={() => setDay(item.index)}
        >
          {item.short}
        </button>
      ))}
    </div>

    <div className="timetable">
      {/* The shared time column of the grid; hidden on phone, where each row
          carries its own time. */}
      <div className="timetable-times" aria-hidden="true">
        <span className="timetable-day-head" />
        {SLOTS.map(slot => <span key={slot.index}>{slot.start}<small>{slot.end}</small></span>)}
      </div>

      {DAYS.map(item => (
        <div
          className="timetable-day"
          key={item.index}
          data-active={day === item.index ? 'true' : 'false'}
          data-today={today === item.index ? 'true' : undefined}
        >
          <div className="timetable-day-head">{item.short}</div>
          {SLOTS.map(slot => {
            const entry = entryAt(item.index, slot.index, entries)
            const course = entry ? findCourse(entry.courseCode, courses) : undefined
            return (
              <button
                className="timetable-cell"
                key={slot.index}
                data-filled={entry ? 'true' : 'false'}
                data-type={entry?.type}
                onClick={() => setCell({ day: item.index, slot: slot.index, mode: entry ? 'start' : 'assign' })}
                aria-label={`${item.label} slot ${slot.index}, ${slot.start} to ${slot.end} — ${
                  entry ? `${entry.courseCode} ${entry.type}` : 'empty, assign a course'}`}
              >
                <span className="cell-time">{slot.start}–{slot.end}</span>
                {entry ? <>
                  <span className="cell-head">
                    <span className="cell-code">{entry.courseCode}</span>
                    <TypeBadge type={entry.type} />
                  </span>
                  {/* The name falls back to the code when the course is gone —
                      possible only if storage was edited by hand, since the
                      Courses screen refuses to delete a referenced course. */}
                  <span className="cell-name">{course?.name || entry.courseCode}</span>
                  <ClassTags specialities={entry.specialities} />
                  {entry.room && <span className="cell-room">{entry.room}</span>}
                </> : <span className="cell-assign"><Plus size={15} /> Assign</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>

    {/* The `open &&` guard is what narrows `open` to a TimetableEntry for the
        prop; a cell cleared from the assign sheet sets `cell` to null anyway. */}
    {cell && open && cell.mode === 'start' && <StartSessionModal
      entry={open}
      course={openCourse}
      existing={sessionForCell(cell.day, cell.slot, dateForDayInCurrentWeek(cell.day), sessions)}
      defaultTeacher={lastTeacher}
      onClose={() => setCell(null)}
      onStart={onStart}
      onOpen={onOpenSession}
      onEdit={() => setCell({ ...cell, mode: 'assign' })}
    />}

    {cell && cell.mode === 'assign' && <AssignCellModal
      day={cell.day}
      slot={cell.slot}
      entry={open || null}
      courses={courses}
      onClose={() => setCell(null)}
      onSave={save}
      onClear={clear}
      onGoToCourses={onGoToCourses}
    />}
  </>
}
