import { useState } from 'react'
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react'
import { CourseModal } from './modals/CourseModal'
import { ClassTags } from './Tags'
import { coursesFor, removeCourse, upsertCourse, type Course } from '../courses'
import { cellsUsingCourse, DAYS, SLOTS, type TimetableEntry } from '../timetable'
import type { Speciality } from '../roster'

/**
 * The courses taught to the active class, with add, edit and delete.
 *
 * Filtered by the active speciality (spec §6.1): a teacher managing 1MAUT has no
 * use for the 4IGEI list, and the speciality picker is the control that switches.
 */
export function CoursesPage({ speciality, courses, entries, onChange, onToast }: {
  speciality: Speciality
  /** The whole list — filtered here, so the modal can still check global uniqueness. */
  courses: Course[]
  entries: TimetableEntry[]
  onChange: (next: Course[]) => void
  onToast: (message: string) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const visible = coursesFor(speciality, courses)

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(course: Course) { setEditing(course); setModalOpen(true) }

  function save(course: Course) {
    // upsert keys on the normalised code, so an edit that changes the code would
    // add rather than replace. Drop the old entry first when the code moved.
    const base = editing && editing.code !== course.code ? removeCourse(editing.code, courses) : courses
    onChange(upsertCourse(course, base))
    setModalOpen(false)
    onToast(`${course.code} saved.`)
  }

  function remove(course: Course) {
    // A course still on the timetable cannot be deleted: the cell would point at
    // nothing. Naming the cells is the difference between a dead end and an
    // instruction — the teacher knows exactly which ones to clear.
    const used = cellsUsingCourse(course.code, entries)
    if (used.length > 0) {
      const where = used.map(entry => {
        const day = DAYS.find(item => item.index === entry.day)
        const slot = SLOTS.find(item => item.index === entry.slot)
        return `${day?.short || '?'} ${slot?.start || '?'}`
      }).join(', ')
      onToast(`${course.code} is still on the timetable (${where}). Clear those cells first.`)
      return
    }
    if (!window.confirm(`Delete ${course.code}? Past sessions keep their own copy of the name.`)) return
    onChange(removeCourse(course.code, courses))
    onToast(`${course.code} deleted.`)
  }

  return <>
    <div className="section-heading">
      <div><p className="eyebrow small">{speciality}</p><h2>Courses</h2></div>
      <span className="section-meta">{visible.length} {visible.length === 1 ? 'course' : 'courses'}</span>
    </div>

    {visible.length === 0
      ? <div className="empty-session">
        <div className="empty-illustration"><BookMarked size={46} /></div>
        <h3>No courses for {speciality}</h3>
        <p>Add a course with its code. You can then place it on the weekly timetable.</p>
        <div className="empty-actions">
          <button className="button button-primary" onClick={openAdd}><Plus size={18} /> Add a course</button>
        </div>
      </div>
      : <ul className="course-list">
        {visible.map(course => (
          <li className="course-row" key={course.code}>
            <div className="course-row-main">
              <strong>{course.code}</strong>
              <span>{course.name}</span>
              <ClassTags specialities={course.specialities} />
            </div>
            <div className="course-row-actions">
              <button className="icon-button" onClick={() => openEdit(course)} aria-label={`Edit ${course.code}`}><Pencil size={17} /></button>
              <button className="icon-button" onClick={() => remove(course)} aria-label={`Delete ${course.code}`}><Trash2 size={17} /></button>
            </div>
          </li>
        ))}
      </ul>}

    {visible.length > 0 && <div className="page-footer-action">
      <button className="button button-light" onClick={openAdd}><Plus size={18} /> Add a course</button>
    </div>}

    {modalOpen && <CourseModal
      courses={courses}
      speciality={speciality}
      editing={editing}
      onClose={() => setModalOpen(false)}
      onSave={save}
    />}
  </>
}
