import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, RotateCcw, Search, Send, Upload, UserX, Users, X } from 'lucide-react'
import { assignMissingBadgeCodes } from '../badges'
import { specialities, type Speciality, type Student } from '../roster'
import { SendBadgesModal } from './badges/SendBadgesModal'
import { useDialog } from './modals/useDialog'

type Editor = { kind: 'add' } | { kind: 'edit'; student: Student }
type View = 'active' | 'inactive' | 'all'
type SpecialityFilter = Speciality | 'all'

function displayId(student: Student) {
  return student.matricule || student.id
}

function StudentEditor({ speciality, editor, allStudents, onClose, onSave }: {
  speciality: Speciality
  editor: Editor
  allStudents: Student[]
  onClose: () => void
  onSave: (student: Student) => void
}) {
  const original = editor.kind === 'edit' ? editor.student : null
  const [id, setId] = useState(original ? displayId(original) : '')
  const [lastName, setLastName] = useState(original?.lastName || '')
  const [firstName, setFirstName] = useState(original?.firstName || '')
  const [email, setEmail] = useState(original?.email || '')
  const [error, setError] = useState('')
  const dialog = useDialog(onClose)

  function submit(event: FormEvent) {
    event.preventDefault()
    const number = id.trim()
    const surname = lastName.trim()
    const given = firstName.trim()
    const address = email.trim().toLowerCase()
    if (!number || !surname) { setError('Student ID and last name are required.'); return }
    if (address && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(address)) { setError('Enter a valid email address.'); return }
    if (!original && allStudents.some(student => student.id === number || student.matricule === number)) {
      setError('That Student ID already belongs to a student.'); return
    }
    onSave({
      ...(original || {}),
      id: original?.id || number,
      lastName: surname,
      firstName: given,
      email: address || undefined,
      speciality,
      active: original?.active ?? true,
    })
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="student-editor-title">
      <div className="modal-header">
        <div className="modal-icon"><Users size={23} /></div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Close"><X size={21} /></button>
      </div>
      <h2 id="student-editor-title">{original ? 'Edit student' : `Add a student to ${speciality}`}</h2>
      <p className="modal-subtitle">{original
        ? 'The Student ID stays fixed so earlier attendance records remain linked to this student.'
        : 'Use the Student ID from the class list. You can add an email now or later.'}</p>
      <form onSubmit={submit}>
        <label className="field"><span>Student ID <b>*</b></span><input value={id} onChange={event => setId(event.target.value)} readOnly={Boolean(original)} autoFocus={!original} /></label>
        <div className="field-row">
          <label className="field"><span>Last name <b>*</b></span><input value={lastName} onChange={event => setLastName(event.target.value)} autoFocus={Boolean(original)} /></label>
          <label className="field"><span>First name</span><input value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
        </div>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-light" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">{original ? 'Save changes' : 'Add student'}</button>
        </div>
      </form>
    </div>
  </div>
}

export function ManageStudentsPage({ speciality, allStudents, onChange, onSpecialityChange, onImportOpen }: {
  speciality: Speciality
  allStudents: Student[]
  onChange: (speciality: Speciality, students: Student[], message: string) => boolean
  onSpecialityChange: (speciality: Speciality) => void
  onImportOpen: () => void
}) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('active')
  const [filterSpeciality, setFilterSpeciality] = useState<SpecialityFilter>(speciality)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sendStudents, setSendStudents] = useState<Student[] | null>(null)
  useEffect(() => { setFilterSpeciality(speciality); setEditor(null) }, [speciality])

  const students = useMemo(() => filterSpeciality === 'all'
    ? allStudents
    : allStudents.filter(student => student.speciality === filterSpeciality), [allStudents, filterSpeciality])
  const activeCount = students.filter(student => student.active).length
  const emailCount = students.filter(student => student.active && student.email).length
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return students.filter(student => {
      if (view !== 'all' && student.active !== (view === 'active')) return false
      if (!query) return true
      return [student.id, student.matricule, student.lastName, student.firstName, student.email]
        .some(value => value?.toLocaleLowerCase().includes(query))
    }).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  }, [students, search, view])
  const specialityName = filterSpeciality === 'all'
    ? 'All specialities'
    : specialities.find(item => item.id === filterSpeciality)!.name

  function changeSpeciality(value: SpecialityFilter) {
    setFilterSpeciality(value)
    setEditor(null)
    if (value !== 'all') onSpecialityChange(value)
  }

  function save(student: Student) {
    const roster = allStudents.filter(item => item.speciality === student.speciality)
    const updated = editor?.kind === 'edit'
      ? roster.map(item => item.id === student.id ? student : item)
      : [...roster, student]
    if (onChange(student.speciality, updated, editor?.kind === 'edit' ? 'Student updated.' : 'Student added.')) setEditor(null)
  }

  function toggle(student: Student) {
    const roster = allStudents.filter(item => item.speciality === student.speciality)
    onChange(student.speciality, roster.map(item => item.id === student.id ? { ...item, active: !item.active } : item),
      student.active ? 'Student deactivated. Earlier attendance stays intact.' : 'Student reactivated.')
  }

  function openSend() {
    const recipients = visible.filter(student => student.active)
    if (!recipients.length) return
    let prepared = allStudents
    const usedCodes = new Set(allStudents.map(student => student.badgeCode).filter((code): code is string => Boolean(code)))
    for (const item of specialities) {
      const roster = prepared.filter(student => student.speciality === item.id)
      if (!roster.some(student => recipients.some(recipient => recipient.id === student.id && !student.badgeCode))) continue
      const coded = assignMissingBadgeCodes(roster, usedCodes)
      if (!onChange(item.id, coded, `${item.id} badge codes prepared.`)) return
      coded.forEach(student => { if (student.badgeCode) usedCodes.add(student.badgeCode) })
      prepared = prepared.map(student => student.speciality === item.id
        ? coded.find(candidate => candidate.id === student.id) || student : student)
    }
    setSendStudents(recipients.map(student => prepared.find(candidate => candidate.id === student.id) || student))
  }

  return <>
    <div className="manage-heading">
      <div><p className="eyebrow small">{filterSpeciality === 'all' ? 'All specialities' : `${filterSpeciality} · ${specialityName}`}</p><h2>Students Management</h2></div>
      <div className="manage-actions">
        <button className="button button-light" type="button" onClick={onImportOpen} disabled={filterSpeciality === 'all'} title={filterSpeciality === 'all' ? 'Choose a speciality to import students' : undefined}><Upload size={17} /> Import CSV</button>
        <button className="button button-primary" type="button" onClick={() => setEditor({ kind: 'add' })} disabled={filterSpeciality === 'all'} title={filterSpeciality === 'all' ? 'Choose a speciality to add a student' : undefined}><Plus size={17} /> Add student</button>
        <button className="button button-primary" type="button" onClick={openSend} disabled={!visible.some(student => student.active)}><Send size={17} /> Send Badges</button>
      </div>
    </div>

    <div className="manage-stats" aria-label="Student counts">
      <span><strong>{activeCount}</strong> Active students</span>
      <span><strong>{emailCount}</strong> With email</span>
      <span><strong>{students.length - activeCount}</strong> Inactive students</span>
    </div>

    <section className="manage-panel">
      <div className="manage-tools">
        <label className="search-field"><Search size={17} /><input aria-label="Search students" placeholder="Search name, ID or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Filter students by speciality" value={filterSpeciality} onChange={event => changeSpeciality(event.target.value as SpecialityFilter)}>
          <option value="all">All specialities</option>
          {specialities.map(item => <option key={item.id} value={item.id}>{item.id} · {item.shortName}</option>)}
        </select>
        <select aria-label="Show students" value={view} onChange={event => setView(event.target.value as View)}>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All students</option>
        </select>
      </div>
      {visible.length === 0 ? <div className="empty-table">No students match this view.</div> :
        <ul className="manage-list">{visible.map(student => <li key={student.id} className="manage-row">
          <div className="manage-person"><strong>{student.lastName} {student.firstName}</strong><span>{displayId(student)} · {student.speciality}</span></div>
          <span className="manage-email">{student.email || 'No email'}</span>
          <span className={`manage-state ${student.active ? 'is-active' : 'is-inactive'}`}>{student.active ? 'Active' : 'Inactive'}</span>
          <div className="manage-row-actions">
            <button type="button" aria-label={`Edit ${student.lastName} ${student.firstName}`} onClick={() => setEditor({ kind: 'edit', student })}><Pencil size={16} /> <span>Edit</span></button>
            <button type="button" aria-label={`${student.active ? 'Deactivate' : 'Reactivate'} ${student.lastName} ${student.firstName}`} onClick={() => toggle(student)}>
              {student.active ? <UserX size={16} /> : <RotateCcw size={16} />} <span>{student.active ? 'Deactivate' : 'Reactivate'}</span>
            </button>
          </div>
        </li>)}</ul>}
      <div className="manage-footer">Showing {visible.length} of {students.length} students. Deactivated students remain in earlier attendance records.</div>
    </section>
    {editor && <StudentEditor key={`${speciality}-${editor.kind === 'edit' ? editor.student.id : 'new'}`} speciality={editor.kind === 'edit' ? editor.student.speciality : speciality} editor={editor} allStudents={allStudents} onClose={() => setEditor(null)} onSave={save} />}
    {sendStudents && <SendBadgesModal students={sendStudents} scopeLabel={filterSpeciality === 'all' ? 'all specialities' : filterSpeciality} onClose={() => setSendStudents(null)} />}
  </>
}
