import seed from './data/students.json'
import { writeStore } from './storage'

function isUpperToken(token: string) {
  // A token counts as uppercase only if it contains at least one cased
  // character and none of them are lowercase. This keeps digit-only tokens
  // (matricules) from being read as surnames.
  return token === token.toLocaleUpperCase() && token !== token.toLocaleLowerCase()
}

export function parseStudentName(value: string): { lastName: string; firstName: string } {
  const tokens = value.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { lastName: '', firstName: '' }
  if (tokens.length === 1) return { lastName: tokens[0], firstName: '' }

  let split = 0
  while (split < tokens.length && isUpperToken(tokens[split])) split++

  if (split === 0) split = 1                          // no uppercase lead
  if (split === tokens.length) split = tokens.length - 1  // all uppercase

  return {
    lastName: tokens.slice(0, split).join(' '),
    firstName: tokens.slice(split).join(' '),
  }
}

export type Speciality = '1MAUT' | '1MESE' | '4IGEI'

export type Student = {
  id: string
  /** University number, when the stored record uses a different stable ID. */
  matricule?: string
  lastName: string
  firstName: string
  email?: string
  speciality: Speciality
  active: boolean
  badgeCode?: string
}

export const specialities: { id: Speciality; name: string; shortName: string }[] = [
  { id: '1MAUT', name: 'Automation & industrial computing', shortName: 'Automation' },
  { id: '1MESE', name: 'Embedded electronic systems', shortName: 'Embedded systems' },
  { id: '4IGEI', name: 'Industrial electronic engineering', shortName: 'Industrial electronics' },
]

export const ROSTER_STORAGE_KEY = 'presence-roster-v1'

// The seed file still carries the pre-restructure shape (registration,
// matricule, section, group, badgeCode). Normalise it to the Student type and
// drop the fields that the supplied roster cannot populate.
type SeedRecord = { id: string; matricule: string; lastName: string; firstName: string; email?: string; speciality: string; badgeCode?: string }

function seedRoster(speciality: Speciality): Student[] {
  return (seed as SeedRecord[])
    .filter(record => record.speciality === speciality)
    .map(record => ({
      id: record.id,
      matricule: record.matricule,
      lastName: record.lastName,
      firstName: record.firstName,
      email: record.email,
      speciality,
      active: true,
      badgeCode: record.badgeCode,
    }))
}

function loadOverrides(): Partial<Record<Speciality, Student[]>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROSTER_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

export function getRoster(speciality: Speciality): Student[] {
  const stored = loadOverrides()[speciality]
  if (!Array.isArray(stored)) return seedRoster(speciality)
  const universityNumberById = new Map(seedRoster(speciality).map(student => [student.id, student.matricule]))
  return stored.map(student => student.matricule || !universityNumberById.has(student.id)
    ? student
    : { ...student, matricule: universityNumberById.get(student.id) })
}

export function getActiveRoster(speciality: Speciality): Student[] {
  return getRoster(speciality).filter(student => student.active)
}

/** Returns undefined when the write stuck, or a message fit to show. */
export function saveRoster(speciality: Speciality, students: Student[]) {
  const all = loadOverrides()
  all[speciality] = students
  return writeStore(ROSTER_STORAGE_KEY, all)
}
