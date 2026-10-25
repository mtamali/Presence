import type { Student } from './roster'

/** Assign a stable, opaque QR value before a badge leaves the device. */
export function assignMissingBadgeCodes(students: Student[], usedCodes: Iterable<string>): Student[] {
  const used = new Set(usedCodes)
  return students.map(student => {
    if (student.badgeCode) {
      used.add(student.badgeCode)
      return student
    }
    let code: string
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(8))
      code = `ATD26-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
    } while (used.has(code))
    used.add(code)
    return { ...student, badgeCode: code }
  })
}
