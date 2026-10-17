import type { ReactNode } from 'react'
import { CheckCircle2, MoreHorizontal, Users, X } from 'lucide-react'
import type { sessionStats } from '../sessions'

type Stats = ReturnType<typeof sessionStats>

/** Two tiles across on phone, four from 48rem. See session.css. */
export function StatGrid({ stats }: { stats: Stats }) {
  return (
    <div className="stat-grid">
      <Stat label="Present" value={stats.present} icon={<CheckCircle2 size={19} />} tone="green" />
      <Stat label="Absent" value={stats.absent} icon={<X size={19} />} tone="red" />
      <Stat label="Not checked" value={stats.unchecked} icon={<MoreHorizontal size={19} />} tone="amber" />
      <Stat label="Class size" value={stats.total} icon={<Users size={19} />} tone="blue" />
    </div>
  )
}

/**
 * One tile. Exported because the analytics screen reuses it for figures that
 * are not counts — hence ReactNode rather than number for the value.
 */
export function Stat({ label, value, icon, tone }: { label: string; value: ReactNode; icon: ReactNode; tone: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  )
}
