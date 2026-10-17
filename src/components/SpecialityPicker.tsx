import { BookOpen } from 'lucide-react'
import { getActiveRoster, specialities, type Speciality } from '../roster'

/**
 * The one speciality selector. It sits in the content column so it is reachable
 * at every width — the phone has no sidebar to hide a second copy in.
 */
export function SpecialityPicker({ speciality, onChange, progress }: {
  speciality: Speciality
  onChange: (next: Speciality) => void
  /** Share of each class marked present in its latest session, 0-100. */
  progress?: Partial<Record<Speciality, number>>
}) {
  return (
    <section className="speciality-strip" aria-label="Choose a speciality">
      {specialities.map((item, index) => {
        const filled = progress?.[item.id]
        const current = speciality === item.id
        return (
          <button
            key={item.id}
            className={current ? 'speciality-card current' : 'speciality-card'}
            aria-current={current ? 'true' : undefined}
            onClick={() => onChange(item.id)}
          >
            <span className={`speciality-symbol symbol-${index}`}><BookOpen size={20} /></span>
            <span className="speciality-card-text"><strong>{item.id}</strong><span>{item.name}</span></span>
            <span className="speciality-tail"><strong>{getActiveRoster(item.id).length}</strong><span>students</span></span>
            {filled !== undefined && <span className="card-progress"><span style={{ width: `${filled}%` }} /></span>}
          </button>
        )
      })}
    </section>
  )
}
