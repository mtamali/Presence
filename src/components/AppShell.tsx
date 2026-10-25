import type { ReactNode } from 'react'
import { BarChart3, BookMarked, CalendarClock, CalendarDays, GraduationCap, LayoutGrid, QrCode, ShieldCheck, Sun, Users } from 'lucide-react'
import { BADGES_ENABLED } from '../config'
import { formatDate, localToday } from '../format'
import type { Speciality } from '../roster'

export type Page = 'home' | 'timetable' | 'attendance' | 'students' | 'courses' | 'analytics' | 'badges'

const destinations: { page: Page; label: string; icon: ReactNode }[] = [
  { page: 'home', label: 'Today', icon: <Sun size={19} /> },
  { page: 'timetable', label: 'Timetable', icon: <CalendarClock size={19} /> },
  { page: 'attendance', label: 'Attendance', icon: <LayoutGrid size={19} /> },
  { page: 'students', label: 'Manage Student', icon: <Users size={19} /> },
  { page: 'courses', label: 'Courses', icon: <BookMarked size={19} /> },
  { page: 'analytics', label: 'Analytics', icon: <BarChart3 size={19} /> },
]

// Badges are dormant. The destination returns when BADGES_ENABLED flips; until
// then the flag's literal `false` lets the bundler drop this branch.
if (BADGES_ENABLED) {
  destinations.push({ page: 'badges', label: 'Student badges', icon: <QrCode size={19} /> })
}

/**
 * The title block each page carries. It lives beside `destinations` because
 * both are per-page metadata — and because at five pages the nested ternaries
 * this replaces in App.tsx had stopped being readable.
 *
 * Home is excluded rather than given an unused entry: it carries its own hero
 * with the date as its heading, so there is no shared title row to fill. The
 * `Exclude` is what makes that a compile error if the two ever disagree.
 */
export const pageCopy: Record<Exclude<Page, 'home'>, { eyebrow: string; title: string; subtitle: string }> = {
  timetable: {
    eyebrow: 'Weekly schedule',
    title: 'Your week, slot by slot.',
    subtitle: 'Six slots a day, Sunday to Thursday. Assign a course to a cell once and it repeats every week.',
  },
  attendance: {
    eyebrow: 'Classroom attendance',
    title: 'Every student, accounted for.',
    subtitle: 'Create a course session, mark each student present or absent, and review your class in real time.',
  },
  students: {
    eyebrow: 'Student records',
    title: 'Manage your students.',
    subtitle: 'Add, edit, import and deactivate students in each speciality. Earlier attendance stays linked to their records.',
  },
  courses: {
    eyebrow: 'Course catalogue',
    title: 'The courses you teach.',
    subtitle: 'Give each course a code and the classes it is taught to. The timetable and every export use that code.',
  },
  analytics: {
    eyebrow: 'Attendance analytics',
    title: 'Where the gaps are.',
    subtitle: 'Attendance by class, by course and by student across every session, worst first.',
  },
  badges: {
    eyebrow: 'Identity cards',
    title: 'Student QR badges',
    subtitle: 'Print a unique badge for each student. Scan it during any course session.',
  },
}

export function AppShell({ page, onPageChange, speciality, children }: {
  page: Page
  onPageChange: (next: Page) => void
  speciality: Speciality
  children: ReactNode
}) {
  // A lookup rather than a ternary chain: the label a destination already
  // carries is the same string the crumb wants.
  const title = destinations.find(item => item.page === page)?.label || 'Attendance'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src="/brand/logo.svg" width="35" height="35" alt="" /></div>
          <div><strong>Présence</strong><span>Attendance manager</span></div>
        </div>
        <div className="sidebar-caption">Workspace</div>
        {/* Rendered once for both layouts — a fixed bottom bar on phone, a
            column inside this sidebar from 48rem. See shell.css. */}
        <nav className="tabbar" aria-label="Main navigation">
          {destinations.map(item => (
            <button
              key={item.page}
              aria-current={page === item.page ? 'page' : undefined}
              onClick={() => onPageChange(item.page)}
            >
              {item.icon}
              <span className="tabbar-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="saved-icon"><ShieldCheck size={19} /></div>
          <div><strong>Saved on this device</strong><span>Academic year 2026/27</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          {/* The speciality leads the crumb: on phone this bar is the only
              place the current class is named above the fold. */}
          <div className="crumb">
            <GraduationCap size={18} />
            <span>{speciality}</span>
            <span className="crumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-date"><CalendarDays size={17} /> {formatDate(localToday())}</div>
        </header>
        <div className="content-wrap">
          {children}
          <footer className="page-footer">
            <span>Présence · 2026/27</span>
            <span>Attendance stays in this browser</span>
          </footer>
        </div>
      </main>
    </div>
  )
}
