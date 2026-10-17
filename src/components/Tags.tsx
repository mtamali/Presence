import type { Speciality } from '../roster'
import { SESSION_TYPES, type SessionType } from '../timetable'

/**
 * The classes something applies to, as short chips: 1MAUT, 1MESE, 4IGEI.
 *
 * The speciality id *is* the short name, so there is nothing to look up — and
 * nothing to fall out of step with roster.ts if a class is ever renamed.
 */
export function ClassTags({ specialities }: { specialities: Speciality[] }) {
  return <span className="class-tags">
    {specialities.map(item => <span className="class-tag" key={item}>{item}</span>)}
  </span>
}

/**
 * CR / TD / TP. The two letters are the whole point — they fit a grid cell five
 * columns wide — so the full word rides along for screen readers.
 *
 * It is a clipped span rather than a `title` or a bare `aria-label`: `title`
 * never reaches a screen reader reliably, and `aria-label` on a span with no
 * role is ignored by some of them.
 */
export function TypeBadge({ type }: { type: SessionType }) {
  const label = SESSION_TYPES.find(item => item.id === type)?.label || type
  return <span className={`type-badge type-${type.toLowerCase()}`}>
    {type}<span className="visually-hidden"> — {label}</span>
  </span>
}
