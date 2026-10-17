import type { Speciality } from '../roster'

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
