import { useEffect, useState } from 'react'
import { QrCode, ScanLine, Search, ShieldCheck } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Speciality, Student } from '../../roster'

// Dormant gallery. Reachable only when BADGES_ENABLED is true.
export default function BadgePage({ speciality, students: classStudents }: { speciality: Speciality; students: Student[] }) {
  const [query, setQuery] = useState('')
  useEffect(() => setQuery(''), [speciality])
  const visible = classStudents.filter(student => `${student.firstName} ${student.lastName} ${student.id} ${student.email || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <><section className="badge-intro"><div className="badge-intro-icon"><QrCode size={30} /></div><div><h2>{speciality} badge collection</h2><p>Each badge has a unique random code. Print and give the correct badge to each student.</p></div><span>{classStudents.length} badges</span></section><div className="badge-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search badges" placeholder="Find a student" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="badge-toolbar-right"><span>{classStudents.filter(student => student.email).length}/{classStudents.length} emails</span></div></div><div className="badge-grid" id="print-area">{visible.map(student => <article className="student-badge" key={student.id}><div className="badge-top"><div className="badge-brand"><ScanLine size={18} /><strong>Présence</strong></div><span>{student.speciality}</span></div><div className="badge-body"><div className="badge-identity"><span>Student badge</span><h3>{student.lastName}<br />{student.firstName}</h3><p>Student ID {student.id}</p></div><div className="qr-box"><QRCodeSVG value={student.badgeCode || ''} size={105} level="M" marginSize={0} /></div></div><div className="badge-bottom"><span>Academic year 2026/27</span><code>{student.badgeCode}</code></div></article>)}</div>{visible.length === 0 && <div className="empty-table">No badges match that student.</div>}<div className="badge-tip"><div><ShieldCheck size={20} /><strong>Badge codes carry no personal data</strong></div><p>A badge QR code contains only its own random code — no student name, number or email.</p></div></>
}
