import type { ReactNode } from 'react'
import { BookMarked, CalendarDays, GraduationCap, LayoutGrid, QrCode, ScanLine, ShieldCheck } from 'lucide-react'
import { BADGES_ENABLED } from '../config'
import { formatDate, localToday } from '../format'
import type { Speciality } from '../roster'

export type Page = 'attendance' | 'courses' | 'badges'

const destinations: { page: Page; label: string; icon: ReactNode }[] = [
  { page: 'attendance', label: 'Attendance', icon: <LayoutGrid size={19} /> },
  { page: 'courses', label: 'Courses', icon: <BookMarked size={19} /> },
]

// Badges are dormant. The destination returns when BADGES_ENABLED flips; until
// then the flag's literal `false` lets the bundler drop this branch.
if (BADGES_ENABLED) {
  destinations.push({ page: 'badges', label: 'Student badges', icon: <QrCode size={19} /> })
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
          <div className="brand-mark"><ScanLine size={22} strokeWidth={2.4} /></div>
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
